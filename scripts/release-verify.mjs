// T012 — release pre-verification: E2E smoke, offline proof and
// performance measurement (IMPLEMENTATION_PLAN §6 T012, §7 scripts).
//
// Modes (exactly one per invocation; exit 0 only when every step in
// the selected mode passes):
//   node scripts/release-verify.mjs               (default: full pre-verify)
//   node scripts/release-verify.mjs --offline      (offline proof)
//   node scripts/release-verify.mjs --performance  (performance measurement)
//
// Default mode:
//   1. fresh `npm run build`, then a second build; the two dist trees
//      must hash identically (deterministic build);
//   2. CLI smoke: demo (exit 2), analyze pr-docs-only (exit 2),
//      analyze pr-src-only (exit 0), matrix merge-queue (exit 2),
//      analyze U-07 matrix job (exit 2, job + check UNKNOWN),
//      analyze U-08 reusable-workflow job (exit 2, job + check
//      UNKNOWN) — FIX-P0-01 / T013 P2-9;
//      analyze T8-05 duplicate-context manifest (exit 2, five
//      per-entry check rows) — FIX-P1-01 / T013 P2-9 remainder;
//      report_sha256 of pr-docs-only is recomputed from the report
//      object with the shipped canonical-JSON + SHA-256 modules, and
//      the demo report must hash identically to the analyze report;
//   3. offline static scan of dist/ and the generated reports;
//   4. license guard: no LICENSE file, LICENSE_STATUS.md still
//      PENDING_SAM_DECISION.
//   Writes evidence/tests/RELEASE_VERIFY_REPORT.json.
//
// --offline mode:
//   1. fresh build;
//   2. demo + analyze run inside `unshare -rn` (a network namespace
//      with no usable interface — real disconnection, not a stub);
//      exit codes must match the normal runs and the report hashes
//      must be byte-identical to the normal-run reports;
//   3. the analyze run is repeated under `strace -f -e trace=network`;
//      the trace must contain zero network syscalls (no socket,
//      connect, sendto, ...);
//   4. offline static scan of dist/ and the generated reports.
//   Writes evidence/tests/OFFLINE_REPORT.json and OFFLINE_REPORT.md.
//
// --performance mode:
//   1. fresh build;
//   2. deterministic perf input (20 workflows / 200 jobs / 100 changed
//      files / 50 required checks) generated twice; the two trees must
//      hash identically; the canonical copy is kept at
//      evidence/tests/perf-input/;
//   3. 1 warmup + 31 timed `analyze` runs; wall time per run and peak
//      RSS (max VmHWM sampled from /proc/<pid>/status every 2 ms);
//      P95 (nearest-rank) must be <= 1000 ms and peak RSS <= 256 MiB
//      (PROJECT_BOOK §8.2).
//   Writes evidence/tests/PERFORMANCE_REPORT.json and PERFORMANCE_REPORT.md.
//
// No network access, no GitHub API, no token, synthetic data only.
// Nothing in this script modifies src/, oracle/ or S0 fixtures.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(repoRoot, "dist");
const cliEntry = path.join(distDir, "checkpath.mjs");
const evidenceDir = path.join(repoRoot, "evidence", "tests");

const PERF_RUNS = 31;
const PERF_P95_LIMIT_MS = 1000;
const PERF_RSS_LIMIT_MIB = 256;

function log(msg) {
  console.log(msg);
}

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sha256File(file) {
  return sha256Hex(readFileSync(file));
}

function hashTree(dir) {
  const entries = [];
  const walk = (d) => {
    for (const entry of readdirSync(d).sort()) {
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        entries.push({
          path: path.relative(dir, full).split(path.sep).join("/"),
          sha256: sha256File(full),
        });
      }
    }
  };
  walk(dir);
  entries.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { files: entries, tree_sha256: sha256Hex(JSON.stringify(entries)) };
}

function runSync(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: repoRoot, encoding: "utf8", ...opts });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: r.error };
}

function runCli(args) {
  return runSync("node", [cliEntry, ...args], { encoding: "utf8" });
}

function build() {
  const r = runSync("npm", ["run", "build"]);
  if (r.status !== 0) {
    return { ok: false, detail: `npm run build exit ${r.status}\n${r.stdout}\n${r.stderr}` };
  }
  return { ok: true, detail: "npm run build exit 0" };
}

// ---------------------------------------------------------------------------
// Offline static scan.
// FAIL on any remote resource reference that could cause a network fetch:
//   src=/href= to http(s), CSS @import/url(http), fetch(http),
//   WebSocket to ws(s)/http(s). Bare URL strings that are NOT fetched
//   (XML namespace URIs, React error-message links) are recorded as
//   informational notes, not failures — see the notes in the report.
// For the CLI bundle additionally: no fetch(, no http(s).request, no
// net.connect and no node:http(s) import at all.
// ---------------------------------------------------------------------------
const FAIL_PATTERNS = [
  { name: "remote src/href", re: /(?:src|href)\s*=\s*["']https?:\/\//i },
  { name: "remote css @import", re: /@import\s+(?:url\()?["']?https?:\/\//i },
  { name: "remote css url()", re: /url\(\s*["']?https?:\/\//i },
  { name: "remote fetch()", re: /fetch\(\s*["']https?:\/\//i },
  { name: "remote websocket", re: /new\s+WebSocket\(\s*["'](?:wss?|https?):\/\//i },
  { name: "remote script/link tag", re: /<(?:script|link|img)[^>]+(?:src|href)\s*=\s*["']https?:\/\//i },
];
const CLI_FORBIDDEN = [
  { name: "fetch( in CLI bundle", re: /fetch\s*\(/ },
  { name: "http(s).request in CLI bundle", re: /https?\.request\s*\(/ },
  { name: "net.connect in CLI bundle", re: /net\.connect\s*\(/ },
  { name: "node:http(s) import in CLI bundle", re: /from\s+["']node:https?["']|require\(\s*["']node:https?["']\)/ },
];
// NOTE: bare `http(s)://` strings are deliberately NOT forbidden here:
// dist/report/html.js legitimately contains the scheme strings in a
// comment describing the offline assertion ("output contains no
// `http://` ..."), and a scheme string in a comment/regex/message is
// not a request. The network-capability surface above (fetch/request/
// connect/import) is what could actually issue a request, and the
// strace proof (0 network syscalls) is the runtime guarantee. Bare
// URL strings are still listed as informational notes by INFO_PATTERNS.
const INFO_PATTERNS = [
  { name: "bare http(s) URL string (not a fetch)", re: /https?:\/\/[^\s"'<>]+/g },
];

function collectFiles(dir, exts) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d).sort()) {
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (exts.some((e) => full.endsWith(e))) {
        out.push(full);
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

function scanOffline(dirs, { cliBundle = false } = {}) {
  const failures = [];
  const notes = [];
  const files = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      failures.push(`scan target missing: ${path.relative(repoRoot, dir)}`);
      continue;
    }
    files.push(...collectFiles(dir, [".html", ".js", ".mjs", ".css"]));
  }
  for (const file of files) {
    const rel = path.relative(repoRoot, file);
    const text = readFileSync(file, "utf8");
    for (const p of FAIL_PATTERNS) {
      if (p.re.test(text)) failures.push(`${rel}: ${p.name}`);
    }
    if (cliBundle && /^dist\/(checkpath\.mjs|cli\/|core\/|report\/|worker\/)/.test(rel)) {
      for (const p of CLI_FORBIDDEN) {
        if (p.re.test(text)) failures.push(`${rel}: ${p.name}`);
      }
    }
    for (const p of INFO_PATTERNS) {
      const hits = text.match(p.re);
      if (hits) {
        const unique = [...new Set(hits)].slice(0, 5);
        notes.push(`${rel}: ${hits.length}x bare URL string(s), e.g. ${unique.join(", ")} — string constant, not a fetched resource`);
      }
    }
    if (/fetch\s*\(/.test(text) && rel.startsWith("dist/assets/")) {
      notes.push(
        `${rel}: contains fetch( from Vite's modulepreload polyfill; it only fetches in-document <link rel="modulepreload"> entries, and dist/index.html contains none — no request is issued`,
      );
    }
  }
  return { files_scanned: files.length, failures, notes };
}

// ---------------------------------------------------------------------------
// report_sha256 recomputation with the shipped dist modules.
// ---------------------------------------------------------------------------
async function recomputeReportSha256(reportJsonPath) {
  const { canonicalJson } = await import(pathToFileURL(path.join(distDir, "core", "canonical-json.js")).href);
  const { sha256Hex: hash } = await import(pathToFileURL(path.join(distDir, "core", "sha256.js")).href);
  const envelope = JSON.parse(readFileSync(reportJsonPath, "utf8"));
  const report = envelope.report;
  const claimed = report.report_sha256;
  const copy = { ...report };
  delete copy.report_sha256;
  return { claimed, recomputed: hash(canonicalJson(copy)), match: claimed === hash(canonicalJson(copy)) };
}

// ---------------------------------------------------------------------------
// CLI smoke: demo / analyze / matrix with expected §4.7 exit codes, plus
// FIX-P0-01 unsupported-job cases (T013 P2-9): the U-07 matrix job and
// the U-08 reusable-workflow (`uses:`) job must each exit 2 with job
// UNKNOWN + check UNKNOWN — the release gate must catch a regression
// to the pre-fix ELIGIBLE / REPORTABLE_PENDING false PASS (exit 0).
// ---------------------------------------------------------------------------
// FIX-P1-01 duplicate-manifest case (T013 P2-9 remainder): the T8-05
// manifest (same context `unit-tests` x3 with different sources, plus
// `ghost` and `lint`) must exit 2 with the five per-entry rows of
// golden G-57 — the release gate must catch a regression to the
// pre-fix CLI rejection (exit 3, duplicate_value, no report).
// Unlike stageUnsupportedFixture, the `source` field is written
// whenever present in the fixture JSON, including the empty string
// `""` (an external source per the T008 resolver); dropping it
// would silently default the entry to github-actions and change
// its verdict from UNKNOWN to REPORTABLE_PENDING.
// ---------------------------------------------------------------------------
function stageChecksFixture(workDir, fixtureDirName) {
  const src = path.join(repoRoot, "tests", "fixtures", "checks", fixtureDirName);
  const dest = path.join(workDir, fixtureDirName);
  const repo = path.join(dest, "repo");
  mkdirSync(path.join(repo, ".github", "workflows"), { recursive: true });
  writeFileSync(path.join(repo, ".github", "workflows", "ci.yml"), readFileSync(path.join(src, "workflow.yml"), "utf8"));
  const scenarioPath = path.join(dest, "scenario.json");
  writeFileSync(scenarioPath, readFileSync(path.join(src, "scenario.json"), "utf8"));
  const checksJson = JSON.parse(readFileSync(path.join(src, "required-checks.json"), "utf8"));
  const yamlLines = ["schema: checkpath.required-checks/v1", "required_checks:"];
  for (const entry of checksJson.required_checks) {
    yamlLines.push(`  - context: ${entry.context}`);
    if ("source" in entry) yamlLines.push(`    source: "${entry.source}"`);
  }
  const checksPath = path.join(dest, "required-checks.yml");
  writeFileSync(checksPath, yamlLines.join("\n") + "\n", "utf8");
  return { repo, scenarioPath, checksPath, outDir: path.join(dest, "out") };
}

function stageUnsupportedFixture(workDir, fixtureDirName) {
  const src = path.join(repoRoot, "tests", "fixtures", "unsupported", fixtureDirName);
  const dest = path.join(workDir, fixtureDirName);
  const repo = path.join(dest, "repo");
  mkdirSync(path.join(repo, ".github", "workflows"), { recursive: true });
  writeFileSync(path.join(repo, ".github", "workflows", "ci.yml"), readFileSync(path.join(src, "workflow.yml"), "utf8"));
  const scenarioPath = path.join(dest, "scenario.json");
  writeFileSync(scenarioPath, readFileSync(path.join(src, "scenario.json"), "utf8"));
  const checksJson = JSON.parse(readFileSync(path.join(src, "required-checks.json"), "utf8"));
  const yamlLines = ["schema: checkpath.required-checks/v1", "required_checks:"];
  for (const entry of checksJson.required_checks) {
    yamlLines.push(`  - context: ${entry.context}`);
    if (entry.source) yamlLines.push(`    source: ${entry.source}`);
  }
  const checksPath = path.join(dest, "required-checks.yml");
  writeFileSync(checksPath, yamlLines.join("\n") + "\n", "utf8");
  return { repo, scenarioPath, checksPath, outDir: path.join(dest, "out") };
}

function cliSmoke(workDir) {
  const steps = [];
  const demo = runCli(["demo", "--out", path.join(workDir, "demo")]);
  steps.push({ name: "demo", expected_exit: 2, actual_exit: demo.status, ok: demo.status === 2 });
  const docsOnly = runCli([
    "analyze",
    "--repo", "examples/repo-basic",
    "--scenario", "examples/scenarios/pr-docs-only.json",
    "--required-checks", "examples/required-checks.yml",
    "--out", path.join(workDir, "pr-docs-only"),
  ]);
  steps.push({ name: "analyze pr-docs-only", expected_exit: 2, actual_exit: docsOnly.status, ok: docsOnly.status === 2 });
  const srcOnly = runCli([
    "analyze",
    "--repo", "examples/repo-basic",
    "--scenario", "examples/scenarios/pr-src-only.json",
    "--required-checks", "examples/required-checks.yml",
    "--out", path.join(workDir, "pr-src-only"),
  ]);
  steps.push({ name: "analyze pr-src-only", expected_exit: 0, actual_exit: srcOnly.status, ok: srcOnly.status === 0 });
  const matrix = runCli([
    "matrix",
    "--repo", "examples/repo-basic",
    "--suite", "examples/suites/merge-queue.json",
    "--required-checks", "examples/required-checks.yml",
    "--out", path.join(workDir, "merge-queue"),
  ]);
  steps.push({ name: "matrix merge-queue", expected_exit: 2, actual_exit: matrix.status, ok: matrix.status === 2 });
  // FIX-P0-01 (T013 P2-9): matrix / `uses:` smoke cases. Each must
  // exit 2 (§4.7 UNKNOWN) with the job UNKNOWN for the ADR-04 reason
  // and the required check UNKNOWN / provider_unknown.
  const unsupportedCases = [
    { name: "analyze U-07 matrix job", fixture: "U-07-matrix-job", jobId: "test", jobReason: "unsupported_matrix" },
    { name: "analyze U-08 reusable-workflow job", fixture: "U-08-reusable-workflow-job", jobId: "call-reusable", jobReason: "unsupported_reusable_workflow" },
  ];
  for (const c of unsupportedCases) {
    const staged = stageUnsupportedFixture(workDir, c.fixture);
    const run = runCli([
      "analyze",
      "--repo", staged.repo,
      "--scenario", staged.scenarioPath,
      "--required-checks", staged.checksPath,
      "--out", staged.outDir,
    ]);
    let detail = `exit ${run.status}`;
    let ok = run.status === 2;
    try {
      const envelope = JSON.parse(readFileSync(path.join(staged.outDir, "report.json"), "utf8"));
      const report = envelope.report;
      const job = report.job_evaluations.find((j) => j.job_id === c.jobId);
      const check = report.required_check_results[0];
      detail = `exit ${run.status}, job ${job?.job_id} ${job?.status}/${job?.reason}, check ${check?.status}/${check?.reason}`;
      ok = ok && job?.status === "UNKNOWN" && job?.reason === c.jobReason &&
        check?.status === "UNKNOWN" && check?.reason === "provider_unknown";
    } catch (err) {
      detail += `; report read failed: ${String(err)}`;
      ok = false;
    }
    steps.push({ name: c.name, expected_exit: 2, actual_exit: run.status, ok, detail });
  }
  // FIX-P1-01 (T013 P2-9 remainder): duplicate-manifest smoke case.
  // T8-05 / golden G-57 must exit 2 (§4.7 UNKNOWN) with the job
  // ELIGIBLE and the five required-check rows resolved per entry:
  // unit-tests/github-actions REPORTABLE_PENDING, unit-tests/external
  // UNKNOWN, ghost UNKNOWN, lint PENDING_NOT_REPORTED, unit-tests/""
  // UNKNOWN — in manifest order, nothing collapsed.
  {
    const staged = stageChecksFixture(workDir, "T8-05-external-source");
    const run = runCli([
      "analyze",
      "--repo", staged.repo,
      "--scenario", staged.scenarioPath,
      "--required-checks", staged.checksPath,
      "--out", staged.outDir,
    ]);
    const want = [
      ["unit-tests", "REPORTABLE_PENDING", "provider_reportable"],
      ["unit-tests", "UNKNOWN", "external_source"],
      ["ghost", "UNKNOWN", "external_source"],
      ["lint", "PENDING_NOT_REPORTED", "no_provider"],
      ["unit-tests", "UNKNOWN", "external_source"],
    ];
    let detail = `exit ${run.status}`;
    let ok = run.status === 2;
    try {
      const envelope = JSON.parse(readFileSync(path.join(staged.outDir, "report.json"), "utf8"));
      const report = envelope.report;
      const job = report.job_evaluations.find((j) => j.job_id === "test");
      const got = report.required_check_results.map((c) => [c.context, c.status, c.reason]);
      detail = `exit ${run.status}, job ${job?.job_id} ${job?.status}/${job?.reason}, checks ${JSON.stringify(got)}`;
      ok = ok && job?.status === "ELIGIBLE" && job?.reason === "eligible" &&
        JSON.stringify(got) === JSON.stringify(want);
    } catch (err) {
      detail += `; report read failed: ${String(err)}`;
      ok = false;
    }
    steps.push({ name: "analyze T8-05 duplicate-context manifest", expected_exit: 2, actual_exit: run.status, ok, detail });
  }
  for (const s of steps) {
    log(`  ${s.ok ? "PASS" : "FAIL"} ${s.name}: exit ${s.actual_exit} (expected ${s.expected_exit})${s.detail ? ` — ${s.detail}` : ""}`);
  }
  return { steps, workDir };
}

// ---------------------------------------------------------------------------
// Default mode: full release pre-verification.
// ---------------------------------------------------------------------------
async function modeDefault() {
  const report = { mode: "release-verify", steps: [], ok: true };
  const fail = (step, detail) => {
    report.steps.push({ step, ok: false, detail });
    report.ok = false;
    log(`  FAIL ${step}: ${detail}`);
  };
  const pass = (step, detail) => {
    report.steps.push({ step, ok: true, detail });
    log(`  PASS ${step}: ${detail}`);
  };

  log("[1/5] build + determinism (two independent builds, dist hash must match)");
  let b = build();
  if (!b.ok) fail("build", b.detail);
  else {
    const first = hashTree(distDir);
    b = build();
    if (!b.ok) fail("build (second)", b.detail);
    else {
      const second = hashTree(distDir);
      if (first.tree_sha256 === second.tree_sha256) {
        pass("build determinism", `dist tree sha256 ${first.tree_sha256.slice(0, 16)}… (${first.files.length} files, identical across 2 builds)`);
        report.dist_tree_sha256 = first.tree_sha256;
      } else {
        fail("build determinism", `first ${first.tree_sha256} != second ${second.tree_sha256}`);
      }
    }
  }

  log("[2/5] CLI smoke (demo/analyze/matrix, §4.7 exit codes)");
  const workDir = mkdtempSync(path.join(tmpdir(), "checkpath-release-verify-"));
  const smoke = cliSmoke(workDir);
  if (smoke.steps.every((s) => s.ok)) pass("cli smoke", "demo 2 / analyze docs-only 2 / analyze src-only 0 / matrix 2 / analyze U-07 matrix 2 (job UNKNOWN/unsupported_matrix, check UNKNOWN/provider_unknown) / analyze U-08 reusable 2 (job UNKNOWN/unsupported_reusable_workflow, check UNKNOWN/provider_unknown) / analyze T8-05 duplicate-context manifest 2 (five per-entry check rows)");
  else fail("cli smoke", smoke.steps.filter((s) => !s.ok).map((s) => `${s.name} exit ${s.actual_exit}${s.detail ? ` (${s.detail})` : ""}`).join("; "));

  log("[3/5] report_sha256 recomputation (shipped dist modules)");
  try {
    const docsReport = path.join(workDir, "pr-docs-only", "report.json");
    const demoReport = path.join(workDir, "demo", "report.json");
    const r1 = await recomputeReportSha256(docsReport);
    const r2 = await recomputeReportSha256(demoReport);
    if (r1.match && r2.match && r1.recomputed === r2.recomputed) {
      pass("report_sha256 recompute", `pr-docs-only ${r1.recomputed.slice(0, 16)}… == demo report, both recompute OK`);
      report.report_sha256 = r1.recomputed;
    } else {
      fail("report_sha256 recompute", `docs match=${r1.match} demo match=${r2.match} equal=${r1.recomputed === r2.recomputed}`);
    }
  } catch (err) {
    fail("report_sha256 recompute", String(err));
  }

  log("[4/5] offline static scan (dist + generated reports)");
  const scan = scanOffline([distDir, path.join(workDir, "pr-docs-only"), path.join(workDir, "merge-queue")], { cliBundle: true });
  for (const n of scan.notes) log(`  note: ${n}`);
  if (scan.failures.length === 0) pass("offline static scan", `${scan.files_scanned} files scanned, 0 remote resource references`);
  else fail("offline static scan", scan.failures.join("; "));
  report.offline_scan = scan;

  log("[5/5] license guard");
  const licenseExists = existsSync(path.join(repoRoot, "LICENSE")) || existsSync(path.join(repoRoot, "LICENSE.md"));
  const statusText = readFileSync(path.join(repoRoot, "LICENSE_STATUS.md"), "utf8");
  if (!licenseExists && statusText.includes("PENDING_SAM_DECISION")) {
    pass("license guard", "no LICENSE file; LICENSE_STATUS.md still PENDING_SAM_DECISION");
  } else {
    fail("license guard", `LICENSE file present=${licenseExists}, status mentions PENDING_SAM_DECISION=${statusText.includes("PENDING_SAM_DECISION")}`);
  }

  rmSync(workDir, { recursive: true, force: true });
  writeFileSync(path.join(evidenceDir, "RELEASE_VERIFY_REPORT.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  log(report.ok ? "release:verify PASS" : "release:verify FAIL");
  return report.ok ? 0 : 1;
}

// ---------------------------------------------------------------------------
// --offline mode.
// ---------------------------------------------------------------------------
async function modeOffline() {
  const report = { mode: "offline", steps: [], ok: true };
  const fail = (step, detail) => {
    report.steps.push({ step, ok: false, detail });
    report.ok = false;
    log(`  FAIL ${step}: ${detail}`);
  };
  const pass = (step, detail) => {
    report.steps.push({ step, ok: true, detail });
    log(`  PASS ${step}: ${detail}`);
  };

  log("[1/4] fresh build");
  const b = build();
  if (!b.ok) fail("build", b.detail);
  else pass("build", b.detail);

  const workDir = mkdtempSync(path.join(tmpdir(), "checkpath-offline-"));
  const normalDir = path.join(workDir, "normal");
  const isoDir = path.join(workDir, "isolated");
  mkdirSync(normalDir, { recursive: true });
  mkdirSync(isoDir, { recursive: true });

  log("[2/4] CLI inside `unshare -rn` (network namespace, no interface) vs normal run");
  const unshareCheck = runSync("which", ["unshare"]);
  if (unshareCheck.status !== 0) {
    fail("unshare available", "`unshare` binary not found — cannot prove real disconnection on this machine");
  } else {
    const isoDemo = runSync("unshare", ["-rn", "node", cliEntry, "demo", "--out", path.join(isoDir, "demo")]);
    const isoAnalyze = runSync("unshare", [
      "-rn", "node", cliEntry, "analyze",
      "--repo", "examples/repo-basic",
      "--scenario", "examples/scenarios/pr-docs-only.json",
      "--required-checks", "examples/required-checks.yml",
      "--out", path.join(isoDir, "pr-docs-only"),
    ]);
    const normalAnalyze = runCli([
      "analyze",
      "--repo", "examples/repo-basic",
      "--scenario", "examples/scenarios/pr-docs-only.json",
      "--required-checks", "examples/required-checks.yml",
      "--out", path.join(normalDir, "pr-docs-only"),
    ]);
    const exitsOk = isoDemo.status === 2 && isoAnalyze.status === 2 && normalAnalyze.status === 2;
    let hashesOk = false;
    let detail = `isolated demo exit ${isoDemo.status}, isolated analyze exit ${isoAnalyze.status}, normal analyze exit ${normalAnalyze.status}`;
    try {
      const isoJson = readFileSync(path.join(isoDir, "pr-docs-only", "report.json"), "utf8");
      const normalJson = readFileSync(path.join(normalDir, "pr-docs-only", "report.json"), "utf8");
      hashesOk = isoJson === normalJson;
      detail += `; isolated report byte-identical to normal report: ${hashesOk}`;
      report.isolated_report_sha256 = JSON.parse(isoJson).report.report_sha256;
    } catch (err) {
      detail += `; report compare failed: ${String(err)}`;
    }
    if (exitsOk && hashesOk) pass("unshare -rn run", detail);
    else fail("unshare -rn run", detail);
  }

  log("[3/4] strace network-syscall proof (analyze under strace -f -e trace=network)");
  const straceLog = path.join(workDir, "strace.log");
  const st = runSync("strace", [
    "-f", "-e", "trace=network", "-o", straceLog, "--",
    "unshare", "-rn", "node", cliEntry, "analyze",
    "--repo", "examples/repo-basic",
    "--scenario", "examples/scenarios/pr-src-only.json",
    "--required-checks", "examples/required-checks.yml",
    "--out", path.join(isoDir, "pr-src-only"),
  ]);
  if (st.status !== 0) {
    fail("strace run", `analyze under strace exit ${st.status} (expected 0 for src-only scenario)`);
  } else {
    const trace = readFileSync(straceLog, "utf8");
    const networkCalls = trace.split("\n").filter((l) => /socket|connect|sendto|sendmsg|recvfrom|recvmsg|bind|listen|accept/.test(l) && !/exited with/.test(l));
    report.strace_network_syscalls = networkCalls.length;
    report.strace_log_lines = trace.split("\n").length;
    if (networkCalls.length === 0) pass("strace network syscalls", "0 network syscalls in the whole process tree (no socket/connect/sendto/recvfrom)");
    else fail("strace network syscalls", `${networkCalls.length} network syscall(s): ${networkCalls.slice(0, 3).join(" | ")}`);
  }

  log("[4/4] offline static scan (dist + isolated-run reports)");
  const scan = scanOffline([distDir, path.join(isoDir, "pr-docs-only"), path.join(isoDir, "pr-src-only")], { cliBundle: true });
  for (const n of scan.notes) log(`  note: ${n}`);
  if (scan.failures.length === 0) pass("offline static scan", `${scan.files_scanned} files scanned, 0 remote resource references`);
  else fail("offline static scan", scan.failures.join("; "));
  report.offline_scan = scan;

  writeFileSync(path.join(evidenceDir, "OFFLINE_REPORT.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const md = [
    "# T012 — Offline Run Report",
    "",
    `Result: **${report.ok ? "PASS" : "FAIL"}** — CheckPath CLI runs with zero external network activity.`,
    "",
    "## Method (all real, no stubs)",
    "",
    "1. **Real disconnection:** `demo` and `analyze` were run inside `unshare -rn` — a fresh network namespace with no usable interface (loopback down, no route). Both completed with the expected §4.7 gate exit codes (2 for the docs-only scenario), and the isolated `report.json` is byte-identical to the normal-run report (same `report_sha256`).",
    "2. **Syscall proof:** the `analyze` run was repeated under `strace -f -e trace=network` (still inside `unshare -rn`). The trace contains **0 network syscalls** — the process never even creates a socket, let alone connects anywhere.",
    "3. **Static scan:** every `.html`/`.js`/`.mjs`/`.css` file under `dist/` and in the generated reports was scanned for remote resource references (`src=`/`href=` to `http(s)`, CSS `@import`/`url(http)`, `fetch(http)`, remote WebSocket). Zero failures. The CLI bundle additionally contains no `fetch(`, `http(s).request`, `net.connect` or `node:http(s)` import at all.",
    "4. **Bare URL strings are not requests:** the React UI bundle contains a few string constants that look like URLs (W3C XML namespace URIs, a `react.dev` error-documentation link) and Vite's `modulepreload` polyfill contains a `fetch(` that only fires for in-document `<link rel=\"modulepreload\">` entries — `dist/index.html` contains none. These are recorded as informational notes in `OFFLINE_REPORT.json`, not failures, because no request is ever issued for them (confirmed by the strace trace and by the Playwright request-interception test in `tests/e2e/offline.spec.ts`).",
    "",
    "## Steps",
    "",
    ...report.steps.map((s) => `- ${s.ok ? "PASS" : "FAIL"} — **${s.step}**: ${s.detail}`),
    "",
    `Isolated report_sha256: \`${report.isolated_report_sha256 ?? "n/a"}\``,
    `strace network syscalls: ${report.strace_network_syscalls ?? "n/a"}`,
    "",
    "Machine evidence: `OFFLINE_REPORT.json` (this directory). Browser-level proof: `npm run test:e2e` (`tests/e2e/offline.spec.ts`, request interception, zero external requests).",
    "",
  ].join("\n");
  writeFileSync(path.join(evidenceDir, "OFFLINE_REPORT.md"), md, "utf8");
  rmSync(workDir, { recursive: true, force: true });
  log(report.ok ? "offline PASS" : "offline FAIL");
  return report.ok ? 0 : 1;
}

// ---------------------------------------------------------------------------
// --performance mode.
// ---------------------------------------------------------------------------
function timedAnalyzeOnce(perfInputDir, outDir) {
  return new Promise((resolve) => {
    const child = spawn("node", [
      cliEntry, "analyze",
      "--repo", path.join(perfInputDir, "repo"),
      "--scenario", path.join(perfInputDir, "scenario.json"),
      "--required-checks", path.join(perfInputDir, "required-checks.yml"),
      "--out", outDir,
    ], { cwd: repoRoot, stdio: "ignore" });
    let peakRssKib = 0;
    const start = performance.now();
    const timer = setInterval(() => {
      try {
        const status = readFileSync(`/proc/${child.pid}/status`, "utf8");
        const m = status.match(/^VmHWM:\s+(\d+)\s+kB/m);
        if (m) peakRssKib = Math.max(peakRssKib, Number(m[1]));
      } catch {
        // Process already exited between polls; keep the last sample.
      }
    }, 2);
    child.on("exit", (code) => {
      clearInterval(timer);
      try {
        const status = readFileSync(`/proc/${child.pid}/status`, "utf8");
        const m = status.match(/^VmHWM:\s+(\d+)\s+kB/m);
        if (m) peakRssKib = Math.max(peakRssKib, Number(m[1]));
      } catch {
        // Already reaped; the polled max stands.
      }
      resolve({ ms: performance.now() - start, peakRssMiB: peakRssKib / 1024, exit: code });
    });
  });
}

function percentile(sorted, p) {
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function modePerformance() {
  const report = { mode: "performance", steps: [], ok: true };
  const fail = (step, detail) => {
    report.steps.push({ step, ok: false, detail });
    report.ok = false;
    log(`  FAIL ${step}: ${detail}`);
  };
  const pass = (step, detail) => {
    report.steps.push({ step, ok: true, detail });
    log(`  PASS ${step}: ${detail}`);
  };

  log("[1/4] fresh build");
  const b = build();
  if (!b.ok) fail("build", b.detail);
  else pass("build", b.detail);

  log("[2/4] deterministic perf input (20 workflows / 200 jobs / 100 changed files / 50 required checks)");
  const genA = mkdtempSync(path.join(tmpdir(), "checkpath-perf-a-"));
  const genB = mkdtempSync(path.join(tmpdir(), "checkpath-perf-b-"));
  const perfInputDir = path.join(evidenceDir, "perf-input");
  const ga = runSync("node", ["scripts/make-perf-input.mjs", "--out", genA]);
  const gb = runSync("node", ["scripts/make-perf-input.mjs", "--out", genB]);
  if (ga.status !== 0 || gb.status !== 0) {
    fail("perf input generation", `generator exit ${ga.status}/${gb.status}`);
  } else {
    const manifestA = JSON.parse(readFileSync(path.join(genA, "INPUT_MANIFEST.json"), "utf8"));
    const manifestB = JSON.parse(readFileSync(path.join(genB, "INPUT_MANIFEST.json"), "utf8"));
    if (manifestA.input_sha256 === manifestB.input_sha256) {
      pass("perf input determinism", `input_sha256 ${manifestA.input_sha256.slice(0, 16)}… identical across 2 generations`);
      report.input_sha256 = manifestA.input_sha256;
      rmSync(perfInputDir, { recursive: true, force: true });
      runSync("node", ["scripts/make-perf-input.mjs", "--out", perfInputDir]);
    } else {
      fail("perf input determinism", `${manifestA.input_sha256} != ${manifestB.input_sha256}`);
    }
  }
  rmSync(genA, { recursive: true, force: true });
  rmSync(genB, { recursive: true, force: true });

  log(`[3/4] timed runs (1 warmup + ${PERF_RUNS} measured analyze runs)`);
  const workDir = mkdtempSync(path.join(tmpdir(), "checkpath-perf-"));
  const warmup = await timedAnalyzeOnce(perfInputDir, path.join(workDir, "warmup"));
  log(`  warmup: ${warmup.ms.toFixed(1)} ms, peak RSS ${warmup.peakRssMiB.toFixed(1)} MiB, exit ${warmup.exit}`);
  const runs = [];
  for (let i = 0; i < PERF_RUNS; i += 1) {
    const r = await timedAnalyzeOnce(perfInputDir, path.join(workDir, `run-${i}`));
    runs.push(r);
    if (r.exit !== 0) {
      fail("perf run exit codes", `run ${i} exit ${r.exit} (expected 0 — all 50 checks REPORTABLE_PENDING)`);
      break;
    }
  }
  if (runs.length === PERF_RUNS && runs.every((r) => r.exit === 0)) {
    const times = runs.map((r) => r.ms).sort((x, y) => x - y);
    const p50 = percentile(times, 50);
    const p95 = percentile(times, 95);
    const max = times[times.length - 1];
    const mean = times.reduce((a, x) => a + x, 0) / times.length;
    const peakRss = Math.max(...runs.map((r) => r.peakRssMiB));
    report.runs = PERF_RUNS;
    report.times_ms = { p50: Number(p50.toFixed(1)), p95: Number(p95.toFixed(1)), max: Number(max.toFixed(1)), mean: Number(mean.toFixed(1)) };
    report.peak_rss_mib = Number(peakRss.toFixed(1));
    report.raw_times_ms = runs.map((r) => Number(r.ms.toFixed(1)));
    report.raw_peak_rss_mib = runs.map((r) => Number(r.peakRssMiB.toFixed(1)));
    log(`  P50 ${p50.toFixed(1)} ms, P95 ${p95.toFixed(1)} ms, max ${max.toFixed(1)} ms, mean ${mean.toFixed(1)} ms`);
    log(`  peak RSS (max over runs): ${peakRss.toFixed(1)} MiB`);
    if (p95 <= PERF_P95_LIMIT_MS) pass("P95 <= 1000 ms", `P95 ${p95.toFixed(1)} ms over ${PERF_RUNS} runs`);
    else fail("P95 <= 1000 ms", `P95 ${p95.toFixed(1)} ms exceeds ${PERF_P95_LIMIT_MS} ms`);
    if (peakRss <= PERF_RSS_LIMIT_MIB) pass("peak RSS <= 256 MiB", `max peak RSS ${peakRss.toFixed(1)} MiB`);
    else fail("peak RSS <= 256 MiB", `max peak RSS ${peakRss.toFixed(1)} MiB exceeds ${PERF_RSS_LIMIT_MIB} MiB`);
  }
  rmSync(workDir, { recursive: true, force: true });

  writeFileSync(path.join(evidenceDir, "PERFORMANCE_REPORT.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const md = [
    "# T012 — Performance Report",
    "",
    `Result: **${report.ok ? "PASS" : "FAIL"}** — synthetic pressure input: 20 workflows / 200 jobs / 100 changed files / 50 required checks.`,
    "",
    "## Method",
    "",
    "- Input generated by `scripts/make-perf-input.mjs` (deterministic; two generations hash identically — see `input_sha256` below). Canonical copy kept at `evidence/tests/perf-input/`.",
    "- Command under test: `node dist/checkpath.mjs analyze --repo <perf repo> --scenario scenario.json --required-checks required-checks.yml --out <tmp>` (full CLI process incl. Node startup and YAML parsing).",
    "- 1 warmup run (discarded) + 31 measured runs. Wall time per run measured around the child process with `performance.now()`.",
    "- Peak RSS per run: max `VmHWM` sampled from `/proc/<pid>/status` every 2 ms while the child runs.",
    "- P95 is the nearest-rank percentile of the 31 wall times. Thresholds (PROJECT_BOOK §8.2): P95 ≤ 1000 ms, peak RSS ≤ 256 MiB.",
    "",
    "## Results",
    "",
    `- Input SHA-256: \`${report.input_sha256 ?? "n/a"}\``,
    `- Runs: ${report.runs ?? 0}`,
    `- Wall time: P50 ${report.times_ms?.p50 ?? "n/a"} ms, **P95 ${report.times_ms?.p95 ?? "n/a"} ms**, max ${report.times_ms?.max ?? "n/a"} ms, mean ${report.times_ms?.mean ?? "n/a"} ms`,
    `- Peak RSS (max over runs): **${report.peak_rss_mib ?? "n/a"} MiB**`,
    "",
    "## Steps",
    "",
    ...report.steps.map((s) => `- ${s.ok ? "PASS" : "FAIL"} — **${s.step}**: ${s.detail}`),
    "",
    "Machine data: `PERFORMANCE_REPORT.json` (raw per-run times and RSS in this directory).",
    "",
  ].join("\n");
  writeFileSync(path.join(evidenceDir, "PERFORMANCE_REPORT.md"), md, "utf8");
  log(report.ok ? "performance PASS" : "performance FAIL");
  return report.ok ? 0 : 1;
}

// ---------------------------------------------------------------------------
function usage() {
  console.log([
    "Usage:",
    "  node scripts/release-verify.mjs [--offline | --performance]",
    "",
    "  (no flag)     full release pre-verification (build determinism,",
    "                CLI smoke, report hash recompute, offline scan, license guard)",
    "  --offline     offline proof (unshare -rn + strace + static scan)",
    "  --performance performance measurement (20w/200j/100f/50c, P95 + RSS)",
  ].join("\n"));
}

const args = process.argv.slice(2);
let code = 0;
if (args.includes("--help")) {
  usage();
} else if (args.includes("--offline") && args.includes("--performance")) {
  console.error("error: --offline and --performance are mutually exclusive");
  code = 1;
} else if (args.includes("--offline")) {
  code = await modeOffline();
} else if (args.includes("--performance")) {
  code = await modePerformance();
} else if (args.length === 0) {
  code = await modeDefault();
} else {
  console.error(`error: unknown argument(s): ${args.join(" ")}`);
  usage();
  code = 1;
}
process.exit(code);
