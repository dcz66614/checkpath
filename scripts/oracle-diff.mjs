// T004 — Oracle diff / determinism / S0 gate runner.
//
// Modes (package.json §7 script names):
//   node scripts/oracle-diff.mjs --suite [tests/fixtures/s0/all.json]
//       Run the TypeScript end-to-end pipeline (vitest tests/unit/s0-e2e,
//       dumps reports to a temp dir) and the Python Reference Oracle
//       (oracle CLI --report-out), compare the two reports field-by-field
//       for all 24 fixtures, and write evidence/s0/S0_ORACLE_REPORT.json.
//       Any mismatch is a failure; there is no ignore-field whitelist.
//   node scripts/oracle-diff.mjs --repeat 100
//       Repeat the full TS + Oracle run 100 times on the fixed input,
//       hash each iteration's canonical concatenated output, and write
//       evidence/s0/S0_DETERMINISM_REPORT.json. Passes only when exactly
//       one distinct SHA-256 appears.
//   node scripts/oracle-diff.mjs --gate
//       Re-run every S0 regression command (env:check, s0:parse,
//       s0:semantics, typecheck, both Oracle suites), then the --suite
//       and --repeat flows, then a static network-call check, and write
//       evidence/S0_GATE.json with every §0.1 field. status is PASS only
//       when all 8 §0.1 conditions hold.
//
// No timestamps appear anywhere in the generated reports: every field is
// a deterministic function of the inputs, so the reports (and the gate
// hash) are recomputable. Runtime network use is zero by construction:
// every command spawned here is a local process (vitest / python3 / npm
// / node / grep); the static check in --gate verifies the implementation
// files contain no network-call patterns. The recorded check covers the
// 11 S0/Oracle-path files (staticNetworkCheck); FIX-P2 (T013 P2-5) adds
// an expanded check (expandedStaticNetworkCheck) over src/report/*,
// src/cli/*, src/ui/*, src/worker/* and scripts/*, and FIX-P1-01
// (R1 P2-1) extends it to the 10 remaining src/core files plus
// oracle/witness.py, which also gates condition c8. The expanded
// condition c8. The expanded result is logged, not embedded in the
// frozen gate JSON, so the gate hash is unchanged by the wider scope.
//
// Canonical JSON (mirrors src/core/e2e.ts and oracle canonical.py):
// object keys sorted recursively, separators "," and ":", UTF-8.

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SUITE = "tests/fixtures/s0/all.json";
const EVIDENCE_S0 = join(REPO_ROOT, "evidence", "s0");
const LOG_DIR = join(EVIDENCE_S0, "logs");
const FIXTURE_SEED = 20261108;

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((item) => canonicalJson(item)).join(",") + "]";
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return (
      "{" +
      entries
        .map(([key, item]) => JSON.stringify(key) + ":" + canonicalJson(item))
        .join(",") +
      "}"
    );
  }
  throw new Error(`cannot canonicalize value of type ${typeof value}`);
}

function writeJson(filePath, obj) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

/** Run a local command, tee combined output to a log file, return exit code. */
function runCmd(argv, { env = {}, logPath = null } = {}) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  if (logPath) {
    mkdirSync(dirname(logPath), { recursive: true });
    writeFileSync(logPath, output, "utf-8");
  }
  return { exit: result.status ?? 1, stdout: result.stdout ?? "", output };
}

/** Recursive field-by-field diff; returns [{path, got, expected}]. */
function deepDiff(got, expected, path = "") {
  const diffs = [];
  if (got === expected) return diffs;
  if (
    got !== null &&
    expected !== null &&
    typeof got === "object" &&
    typeof expected === "object"
  ) {
    if (Array.isArray(got) !== Array.isArray(expected)) {
      diffs.push({ path: path || "<root>", got, expected });
      return diffs;
    }
    if (Array.isArray(got)) {
      if (got.length !== expected.length) {
        diffs.push({
          path: `${path}.length`,
          got: got.length,
          expected: expected.length,
        });
      }
      const n = Math.min(got.length, expected.length);
      for (let i = 0; i < n; i++) {
        diffs.push(...deepDiff(got[i], expected[i], `${path}[${i}]`));
      }
      return diffs;
    }
    for (const key of [...new Set([...Object.keys(got), ...Object.keys(expected)])].sort()) {
      diffs.push(
        ...deepDiff(got[key], expected[key], path ? `${path}.${key}` : key),
      );
    }
    return diffs;
  }
  diffs.push({ path: path || "<root>", got, expected });
  return diffs;
}

function environmentInfo() {
  const python = runCmd(["python3", "-c", "import sys, yaml; print(sys.version.split()[0] + ' ' + yaml.__version__)"]);
  const [pythonVersion, pyyamlVersion] = (python.stdout.trim().split(" ").concat(["", ""])) .slice(0, 2);
  return {
    node: process.version,
    python: pythonVersion ?? "",
    pyyaml: pyyamlVersion ?? "",
  };
}

// ---------------------------------------------------------------------------
// Suite inputs
// ---------------------------------------------------------------------------

function loadSuite(suiteRel) {
  const suitePath = join(REPO_ROOT, suiteRel);
  const suite = readJson(suitePath);
  if (suite.schema !== "checkpath.s0-e2e-suite/v1") {
    throw new Error(`unexpected e2e suite schema: ${suite.schema}`);
  }
  return { suite, suitePath };
}

/** Repo-relative input files of the suite (frozen fixtures). */
function suiteInputFiles(suite, suiteRel) {
  const suiteDir = dirname(suiteRel);
  const files = [suiteRel];
  for (const entry of suite.fixtures) {
    for (const path of entry.workflows) {
      files.push(join(suiteDir, entry.dir, path));
    }
    files.push(join(suiteDir, entry.dir, entry.scenario));
    files.push(join(suiteDir, entry.dir, entry.required_checks));
    files.push(join(suiteDir, entry.dir, entry.expected));
  }
  return [...new Set(files)].sort();
}

/**
 * input_fixture_sha256: SHA-256 over the concatenation of one line per
 * input file, "<repo-relative-path>:<sha256-of-file-bytes>\n", files in
 * sorted path order. Recomputable with:
 *   python3 -c "import hashlib,json; ..."  (see evidence/s0/T004_REPORT.md)
 */
function inputFixtureSha256(files) {
  const lines = files.map((rel) => {
    const bytes = readFileSync(join(REPO_ROOT, rel));
    return `${rel}:${createHash("sha256").update(bytes).digest("hex")}\n`;
  });
  return sha256Hex(lines.join(""));
}

// ---------------------------------------------------------------------------
// One TS + Oracle evaluation pass
// ---------------------------------------------------------------------------

function runTsE2E(tsDir, logPath, suiteRel = DEFAULT_SUITE) {
  const isGolden = suiteRel.includes("golden");
  return runCmd(
    ["npx", "vitest", "run", isGolden ? "tests/unit/golden" : "tests/unit/s0-e2e"],
    {
      env: {
        CHECKPATH_E2E_DUMP_DIR: tsDir,
        CHECKPATH_E2E_SUITE: suiteRel,
      },
      logPath,
    },
  );
}

function runOracleE2E(suiteRel, pyDir, logPath) {
  return runCmd(
    [
      "python3",
      "-m",
      "oracle.checkpath_oracle.cli",
      "--suite",
      suiteRel,
      "--report-out",
      pyDir,
    ],
    { logPath },
  );
}

/**
 * FIX-P0-01 (T013 P2-10): run the formal-pipeline differential test
 * (tests/unit/cli/formal-pipeline-unsupported.test.ts) with
 * CHECKPATH_FORMAL_DUMP_DIR set, so the formal (buildReport)
 * job/check rows for every fixture in the suite are dumped to
 * `formalDir` as <id>.json for the TS-side false-pass count. The
 * test itself already fails the vitest run on any formal-vs-Oracle
 * mismatch; the dump additionally lets this script count formal
 * false PASSes in the same terms as the Oracle-side count.
 */
function runFormalTs(formalDir, logPath, suiteRel = DEFAULT_SUITE) {
  return runCmd(
    ["npx", "vitest", "run", "tests/unit/cli/formal-pipeline-unsupported.test.ts"],
    {
      env: {
        CHECKPATH_FORMAL_DUMP_DIR: formalDir,
        CHECKPATH_E2E_SUITE: suiteRel,
      },
      logPath,
    },
  );
}

function readReports(dir, fixtureIds) {
  const reports = {};
  for (const id of fixtureIds) {
    reports[id] = readJson(join(dir, `${id}.json`));
  }
  return reports;
}

/** FIX-P0-01: read formal-pipeline dumps {fixture_id, jobs, required_checks}. */
function readFormalReports(dir, fixtureIds) {
  const reports = {};
  for (const id of fixtureIds) {
    reports[id] = readJson(join(dir, `${id}.json`));
  }
  return reports;
}

/**
 * Compare TS vs Oracle reports for every fixture. Returns the mismatch
 * list; each entry is {fixture_id, field_diffs: [{path, got, expected}]}
 * with got = TypeScript, expected = Oracle.
 */
function compareReports(tsReports, pyReports, fixtureIds) {
  const mismatches = [];
  for (const id of fixtureIds) {
    const fieldDiffs = deepDiff(tsReports[id], pyReports[id]);
    if (fieldDiffs.length > 0) {
      mismatches.push({ fixture_id: id, field_diffs: fieldDiffs });
    }
  }
  return mismatches;
}

function loadExpected(suite, suiteRel) {
  const suiteDir = dirname(join(REPO_ROOT, suiteRel));
  const expected = {};
  for (const entry of suite.fixtures) {
    expected[entry.id] = readJson(
      join(suiteDir, entry.dir, entry.expected),
    );
  }
  return expected;
}

/**
 * false_pass_count: required checks the implementation reports as
 * REPORTABLE_PENDING although the frozen expected says otherwise.
 * Computed from the Oracle reports (actual) against expected.json.
 * Rows are matched BY MANIFEST INDEX, not by context: a manifest may
 * legitimately list the same context twice with different sources
 * (T8-10 / G-57 — once github-actions, once external), and a
 * context-keyed map would collapse those rows and misreport the
 * github-actions row as a false PASS. Report and expected rows are
 * in the same manifest order, so index matching is exact.
 *
 * FIX-P0-01 (T013 P2-10): this Oracle-side count is NOT the whole
 * story — the formal pipeline's false PASS (P0-1) was invisible to
 * it, because the Oracle reports are correct by construction. The
 * TS-side count lives in `formalFalsePassCount` below, computed from
 * the formal-pipeline (buildReport) dumps produced by
 * tests/unit/cli/formal-pipeline-unsupported.test.ts; the golden
 * gate fails when EITHER count is non-zero (see runSuite / c6).
 */
function falsePassCount(pyReports, expected) {
  let count = 0;
  const details = [];
  for (const [id, report] of Object.entries(pyReports)) {
    const expRows = expected[id].required_checks;
    report.required_checks.forEach((check, i) => {
      const expStatus = expRows[i] ? expRows[i].status : null;
      if (
        check.status === "REPORTABLE_PENDING" &&
        expStatus !== "REPORTABLE_PENDING"
      ) {
        count += 1;
        details.push({
          fixture_id: id,
          context: check.context,
          index: i,
          expected: expStatus,
        });
      }
    });
  }
  return { count, details };
}

/**
 * FIX-P0-01 (T013 P2-10) — TS-side formal-pipeline false-pass
 * count. Same definition as falsePassCount (a required check
 * reported REPORTABLE_PENDING whose frozen expected is any other
 * status, rows matched by manifest index), but computed from the
 * FORMAL pipeline's reports (buildReport, the shipped product path:
 * CLI + UI worker) instead of the Oracle's. Before this fix it
 * would have counted 2 for the golden suite (G-79 matrix and G-80
 * reusable workflow: formal REPORTABLE_PENDING, expected UNKNOWN),
 * while the Oracle-side count stayed 0 — that is exactly how P0-1
 * passed a green suite. `formalReports` maps fixture id ->
 * {jobs, required_checks} as dumped by the formal-pipeline test.
 */
function formalFalsePassCount(formalReports, expected) {
  let count = 0;
  const details = [];
  for (const [id, report] of Object.entries(formalReports)) {
    const expRows = expected[id].required_checks;
    report.required_checks.forEach((check, i) => {
      const expStatus = expRows[i] ? expRows[i].status : null;
      if (
        check.status === "REPORTABLE_PENDING" &&
        expStatus !== "REPORTABLE_PENDING"
      ) {
        count += 1;
        details.push({
          fixture_id: id,
          context: check.context,
          index: i,
          expected: expStatus,
          got: check.status,
          got_reason: check.reason,
        });
      }
    });
  }
  return { count, details };
}
/**
 * unsupported_as_unknown_count: fixtures whose frozen expected contains
 * UNKNOWN anywhere (trigger status, job status, or check status) and
 * whose actual report matches it — i.e. unsupported semantics correctly
 * surfaced as UNKNOWN instead of a silent PASS.
 */
function unsupportedAsUnknownCount(pyReports, expected) {
  let count = 0;
  const ids = [];
  for (const [id, exp] of Object.entries(expected)) {
    const hasUnknown =
      exp.workflows.some((w) => w.trigger.status === "UNKNOWN") ||
      exp.jobs.some((j) => j.status === "UNKNOWN") ||
      exp.required_checks.some((c) => c.status === "UNKNOWN");
    if (hasUnknown && deepDiff(pyReports[id], exp).length === 0) {
      count += 1;
      ids.push(id);
    }
  }
  return { count, fixture_ids: ids };
}

function expectedUnknownFixtureCount(expected) {
  return Object.values(expected).filter(
    (exp) =>
      exp.workflows.some((w) => w.trigger.status === "UNKNOWN") ||
      exp.jobs.some((j) => j.status === "UNKNOWN") ||
      exp.required_checks.some((c) => c.status === "UNKNOWN"),
  ).length;
}

// ---------------------------------------------------------------------------
// --suite
// ---------------------------------------------------------------------------

function runSuite(suiteRel) {
  const { suite } = loadSuite(suiteRel);
  const fixtureIds = suite.fixtures.map((f) => f.id);
  const files = suiteInputFiles(suite, suiteRel);
  const inputSha = inputFixtureSha256(files);
  const tmp = mkdtempSync(join(tmpdir(), "checkpath-s0-oracle-"));
  const tsDir = join(tmp, "ts");
  const pyDir = join(tmp, "py");
  // T011: the golden suite writes its parity report under
  // evidence/tests/ (ORACLE_PARITY_REPORT.json) instead of
  // overwriting the S0 report; the S0 gate flow is unchanged.
  const isGolden = suiteRel.includes("golden");
  const suiteLogDir = isGolden
    ? join(REPO_ROOT, "evidence", "tests", "logs")
    : LOG_DIR;
  const reportPath = isGolden
    ? join(REPO_ROOT, "evidence", "tests", "ORACLE_PARITY_REPORT.json")
    : join(EVIDENCE_S0, "S0_ORACLE_REPORT.json");
  const tsLog = join(suiteLogDir, isGolden ? "golden-oracle-ts.log" : "s0-oracle-ts.log");
  const pyLog = join(suiteLogDir, isGolden ? "golden-oracle-py.log" : "s0-oracle-py.log");
  const diffLog = join(suiteLogDir, isGolden ? "golden-oracle-diff.log" : "s0-oracle-diff.log");
  const formalLog = join(suiteLogDir, isGolden ? "golden-oracle-formal-ts.log" : "s0-oracle-formal-ts.log");

  const ts = runTsE2E(tsDir, tsLog, suiteRel);
  const py = runOracleE2E(suiteRel, pyDir, pyLog);
  // FIX-P0-01 (T013 P2-10): formal-pipeline (buildReport) TS run for
  // the TS-side false-pass count. Its dump dir lives under the same
  // temp dir and is removed with it below.
  const formalDir = join(tmp, "formal");
  const formal = runFormalTs(formalDir, formalLog, suiteRel);

  let mismatches = [];
  let tsReports = {};
  let pyReports = {};
  let formalReports = {};
  let passed = 0;
  if (ts.exit === 0) tsReports = readReports(tsDir, fixtureIds);
  if (py.exit === 0) pyReports = readReports(pyDir, fixtureIds);
  if (formal.exit === 0) {
    formalReports = readFormalReports(formalDir, fixtureIds);
  } else {
    // The formal vitest run fails exactly when the formal pipeline
    // diverges — but the test dumps each fixture's formal rows BEFORE
    // asserting, so the dumps still exist and the false-pass count
    // can (and must) be computed from them: a -1 here would hide
    // the count the gate is meant to surface.
    try {
      formalReports = readFormalReports(formalDir, fixtureIds);
    } catch {
      // No usable dumps (e.g. the formal run crashed before writing
      // any): formalReports stays {} and the count below becomes -1.
    }
  }
  if (ts.exit === 0 && py.exit === 0) {
    mismatches = compareReports(tsReports, pyReports, fixtureIds);
    passed = fixtureIds.length - mismatches.length;
  }
  const expected = loadExpected(suite, suiteRel);
  const falsePass =
    py.exit === 0 ? falsePassCount(pyReports, expected) : { count: -1, details: [] };
  const formalFalsePass =
    Object.keys(formalReports).length === fixtureIds.length
      ? formalFalsePassCount(formalReports, expected)
      : { count: -1, details: [] };
  const unknown =
    py.exit === 0
      ? unsupportedAsUnknownCount(pyReports, expected)
      : { count: -1, fixture_ids: [] };

  const report = {
    schema: isGolden
      ? "checkpath.oracle-parity-report/v1"
      : "checkpath.s0-oracle-report/v1",
    suite: suiteRel,
    suite_sha256: sha256Hex(readFileSync(join(REPO_ROOT, suiteRel), "utf-8")),    seed: FIXTURE_SEED,
    fixture_count: fixtureIds.length,
    passed,
    failed: fixtureIds.length - passed,
    oracle_mismatch_count: mismatches.length,
    mismatches,
    false_pass_count: falsePass.count,
    false_pass_details: falsePass.details,
    // FIX-P0-01 (T013 P2-10): TS-side formal-pipeline false-pass
    // count — same definition, computed from buildReport dumps, not
    // from Oracle reports. The gate fails unless this is 0 too.
    ts_formal_false_pass_count: formalFalsePass.count,
    ts_formal_false_pass_details: formalFalsePass.details,
    formal_pipeline_fixtures_checked: Object.keys(formalReports).length,
    adversarial_fixture_ids: suite.fixtures
      .filter((f) => f.adversarial)
      .map((f) => f.id),
    unsupported_as_unknown_count: unknown.count,
    unsupported_as_unknown_fixture_ids: unknown.fixture_ids,
    expected_unknown_fixture_count: expectedUnknownFixtureCount(expected),
    typescript_exit_code: ts.exit,
    oracle_exit_code: py.exit,
    formal_typescript_exit_code: formal.exit,
    typescript_log: isGolden
      ? "evidence/tests/logs/golden-oracle-ts.log"
      : "evidence/s0/logs/s0-oracle-ts.log",
    oracle_log: isGolden
      ? "evidence/tests/logs/golden-oracle-py.log"
      : "evidence/s0/logs/s0-oracle-py.log",
    input_fixture_sha256: inputSha,
    input_file_hashes: files.map((rel) => ({
      path: rel,
      sha256: createHash("sha256")
        .update(readFileSync(join(REPO_ROOT, rel)))
        .digest("hex"),
    })),
    environment: environmentInfo(),
    notes: [
      "TS and Oracle reports are compared field-by-field with no ignore list.",
      "false_pass_count counts checks reported REPORTABLE_PENDING whose frozen expected is any other status.",
      "ts_formal_false_pass_count is the same count computed from the formal-pipeline (buildReport) TS reports dumped by tests/unit/cli/formal-pipeline-unsupported.test.ts — the shipped product path (CLI + UI worker). Before FIX-P0-01 it was 2 for the golden suite (G-79/G-80) while false_pass_count (Oracle-side) was 0; the gate (c6) now requires both to be 0.",
      "PyYAML is the system 6.0.1 (lockfile pins 6.0.3; pip install blocked by PEP 668; see T001 ENVIRONMENT_REPORT.md D2).",
      ...(isGolden
        ? [
            "Golden suite (T011): 155 fixed cases — S0 24 + T6 trigger 16 + T7 jobs 12 + T8 checks 10 + T9 witness 10 + unsupported 8 + FIX-P1-01 duplicate-key 3 + FIX-P0-02 duplicate-key 1 + FIX-P0-03 scalar-rendering 21 + FIX-P0-04 bare-empty-key / scalar-job 10 + FIX-P0-05 flow-alias-key 4 + FIX-P0-06 collection-alias-key / tab 6 + FIX-P0-07 quoted-mid-plain-scalar 6 + FIX-P0-08 multiline-quoted-unindented 12 + FIX-P0-09 flow-quoted-key 12. Expected files generated once from the Oracle by scripts/build-golden.py and reviewed before freezing; see evidence/tests/T011_REPORT.md §3.",
            "input_file_hashes is the per-file SHA-256 input hash list for this suite (sorted by repo-relative path).",
          ]
        : []),
    ],
  };
  writeJson(reportPath, report);

  const lines = [
    `suite: ${suiteRel}`,
    `fixtures: ${fixtureIds.length}, TS==expected exit=${ts.exit}, Oracle==expected exit=${py.exit}, formal TS exit=${formal.exit}`,
    `TS vs Oracle mismatches: ${mismatches.length}`,
    `false PASS: ${falsePass.count}`,
    `TS formal-pipeline false PASS: ${formalFalsePass.count}`,
    `unsupported surfaced as UNKNOWN: ${unknown.count}/${report.expected_unknown_fixture_count} fixtures`,
    `report: ${isGolden ? "evidence/tests/ORACLE_PARITY_REPORT.json" : "evidence/s0/S0_ORACLE_REPORT.json"}`,
  ];
  writeFileSync(diffLog, lines.join("\n") + "\n", "utf-8");
  console.log(lines.join("\n"));
  for (const m of mismatches) {
    console.log(`MISMATCH ${m.fixture_id}: ${m.field_diffs.length} field(s) differ`);
    for (const d of m.field_diffs.slice(0, 5)) {
      console.log(`  ${d.path}: ts=${JSON.stringify(d.got)} oracle=${JSON.stringify(d.expected)}`);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  const ok =
    ts.exit === 0 &&
    py.exit === 0 &&
    mismatches.length === 0 &&
    formal.exit === 0 &&
    formalFalsePass.count === 0;
  return { ok, report };
}

// ---------------------------------------------------------------------------
// --repeat
// ---------------------------------------------------------------------------

function runRepeat(suiteRel, repeatCount) {
  const { suite } = loadSuite(suiteRel);
  const fixtureIds = suite.fixtures.map((f) => f.id);
  const files = suiteInputFiles(suite, suiteRel);
  const inputSha = inputFixtureSha256(files);
  const tmp = mkdtempSync(join(tmpdir(), "checkpath-s0-determinism-"));
  const tsDir = join(tmp, "ts");
  const pyDir = join(tmp, "py");
  const detLog = join(LOG_DIR, "s0-determinism.log");

  const iterationHashes = [];
  let totalMismatches = 0;
  let tsFailures = 0;
  let oracleFailures = 0;
  const logLines = [];
  for (let i = 1; i <= repeatCount; i++) {
    const ts = runTsE2E(tsDir, null, suiteRel);
    const py = runOracleE2E(suiteRel, pyDir, null);
    let hash = null;
    let mismatches = 0;
    if (ts.exit === 0 && py.exit === 0) {
      const tsReports = readReports(tsDir, fixtureIds);
      const pyReports = readReports(pyDir, fixtureIds);
      mismatches = compareReports(tsReports, pyReports, fixtureIds).length;
      const canonical = fixtureIds
        .map((id) => canonicalJson(tsReports[id]) + canonicalJson(pyReports[id]))
        .join("");
      hash = sha256Hex(canonical);
    }
    if (ts.exit !== 0) tsFailures += 1;
    if (py.exit !== 0) oracleFailures += 1;
    totalMismatches += mismatches;
    iterationHashes.push(hash);
    logLines.push(
      `iteration ${i}/${repeatCount}: ts_exit=${ts.exit} oracle_exit=${py.exit} mismatches=${mismatches} hash=${hash ?? "FAILED"}`,
    );
    console.log(logLines[logLines.length - 1]);
  }
  writeFileSync(detLog, logLines.join("\n") + "\n", "utf-8");
  const uniqueHashes = [...new Set(iterationHashes.filter((h) => h !== null))];

  const report = {
    schema: "checkpath.s0-determinism-report/v1",
    suite: suiteRel,
    repeat_count: repeatCount,
    determinism_unique_hash_count: uniqueHashes.length,
    unique_hashes: uniqueHashes,
    iteration_hashes: iterationHashes,
    mismatch_count: totalMismatches,
    typescript_failures: tsFailures,
    oracle_failures: oracleFailures,
    input_fixture_sha256: inputSha,
    environment: environmentInfo(),
    log: "evidence/s0/logs/s0-determinism.log",
    notes: [
      "Each iteration re-runs the full TS (vitest) and Oracle (python3) processes on the fixed input; the iteration hash is SHA-256 over the canonical concatenation of all 24 TS + 24 Oracle reports, fixture ids sorted.",
      "No timestamps or random values are hashed inputs.",
    ],
  };
  writeJson(join(EVIDENCE_S0, "S0_DETERMINISM_REPORT.json"), report);
  rmSync(tmp, { recursive: true, force: true });
  const ok =
    uniqueHashes.length === 1 &&
    totalMismatches === 0 &&
    tsFailures === 0 &&
    oracleFailures === 0;
  console.log(
    `determinism: ${repeatCount} runs, ${uniqueHashes.length} unique hash(es), ${totalMismatches} mismatch(es)`,
  );
  return { ok, report };
}

// ---------------------------------------------------------------------------
// --gate
// ---------------------------------------------------------------------------

const NETWORK_PATTERNS = [
  "fetch\\s*\\(",
  "https?\\.request\\s*\\(",
  "https?\\.get\\s*\\(",
  "WebSocket\\s*\\(",
  "XMLHttpRequest",
  "axios",
  "urllib",
  "requests\\.",
  "http\\.client",
  "socket\\.",
  "net\\.connect",
  "from\\s+http",
  "import\\s+http",
  "from\\s+socket",
  "import\\s+socket",
  "\\bcurl\\b",
];

function staticNetworkCheck() {
  // The implementation files actually executed at runtime. scripts/ is
  // excluded on purpose: this file itself contains the pattern table as
  // string literals, which would self-match; the runner only spawns
  // local vitest / python3 / npm / node / grep processes (listed in the
  // gate notes), never a network client.
  //
  // FIX-P2 (T013 P2-5): this recorded check is INTENTIONALLY unchanged
  // (same 11 files, same returned shape): its object is embedded in
  // evidence/S0_GATE.json, whose gate_report_sha256 covers it, and the
  // frozen S0 evidence must not be rewritten. The wider scope lives in
  // expandedStaticNetworkCheck() below, which also gates c8.
  const files = [
    "src/core/e2e.ts",
    "src/core/workflow-parser.ts",
    "src/core/glob-subset.ts",
    "src/core/job-dag.ts",
    "src/core/check-resolver.ts",
    "oracle/checkpath_oracle/parser.py",
    "oracle/checkpath_oracle/evaluator.py",
    "oracle/checkpath_oracle/glob_subset.py",
    "oracle/checkpath_oracle/resolver.py",
    "oracle/checkpath_oracle/canonical.py",
    "oracle/checkpath_oracle/cli.py",
  ];
  const pattern = NETWORK_PATTERNS.join("|");
  const result = runCmd(["grep", "-rnE", pattern, ...files]);
  // grep exits 1 when nothing matches: that is the expected outcome.
  const matches = result.exit === 0 ? result.stdout.trim().split("\n").filter(Boolean) : [];
  return {
    command: `grep -rnE '${pattern}' ${files.join(" ")}`,
    match_count: result.exit === 1 ? 0 : matches.length,
    matches: matches.slice(0, 20),
  };
}

/** Repo-relative files under a directory with the given extensions, sorted. */
function listFilesRecursive(dirRel, extensions) {
  const out = [];
  const walk = (dir) => {
    const entries = readdirSync(join(REPO_ROOT, dir), { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(rel);
    }
  };
  walk(dirRel);
  return out;
}

/**
 * FIX-P2 (T013 P2-5) — expanded static network check.
 *
 * staticNetworkCheck() greps only the 11 files of the S0/Oracle path,
 * so gate condition c8's scope was narrower than "no network calls"
 * reads. This check covers the rest of the product and the harness:
 * every .ts/.tsx under src/report, src/cli, src/ui, src/worker, and
 * every .mjs/.py under scripts/ — with the same NETWORK_PATTERNS.
 *
 * FIX-P1-01 (final review R1 P2-1): staticNetworkCheck() still missed
 * 10 files under src/core (canonical-json, event-evaluator, if-subset,
 * recommendations, sha256, skip-annotation, types, validate,
 * witness-reducer, workflow-ir) plus oracle/witness.py. They are
 * covered here, explicitly, so the expanded check now spans the whole
 * implementation tree. They are NOT added to staticNetworkCheck():
 * that check's object is embedded in evidence/S0_GATE.json, whose
 * gate_report_sha256 covers it, and the frozen S0 evidence must not
 * be rewritten — the wider scope lives here and also gates c8, and
 * its result is logged (evidence/s0/logs/s0-gate.log), not embedded
 * in the frozen gate JSON, so the gate hash is unchanged by the wider
 * scope.
 *
 * The two gate files themselves are excluded from the literal grep and
 * checked separately, because they define the pattern tables: this
 * file's NETWORK_PATTERNS array and release-verify.mjs's offline regex
 * table / report prose contain the patterns as string literals and
 * would self-match. For each of them every match must lie on a line
 * that only DESCRIBES a network pattern — a real call on any other
 * line is reported as unexplained and fails c8:
 *   - oracle-diff.mjs: inside the NETWORK_PATTERNS array literal.
 *   - release-verify.mjs: a `//` comment describing the scan, a
 *     `re: /.../` offline-table entry, or a report-prose string
 *     (marked by `modulepreload`, `Static scan:` or `Bare URL strings`).
 */
function expandedStaticNetworkCheck() {
  // FIX-P1-01 (R1 P2-1): the 10 src/core files staticNetworkCheck()
  // misses, plus oracle/witness.py — the whole implementation tree
  // is now covered between the two checks (11 frozen S0/Oracle-path
  // files in staticNetworkCheck, everything else here). Listed
  // explicitly (not via listFilesRecursive("src/core")) so a future
  // file added to src/core shows up as uncovered until it is listed
  // here or in staticNetworkCheck.
  const coreRemainder = [
    "src/core/canonical-json.ts",
    "src/core/event-evaluator.ts",
    "src/core/if-subset.ts",
    "src/core/recommendations.ts",
    "src/core/sha256.ts",
    "src/core/skip-annotation.ts",
    "src/core/types.ts",
    "src/core/validate.ts",
    "src/core/witness-reducer.ts",
    "src/core/workflow-ir.ts",
  ];
  const oracleRemainder = ["oracle/checkpath_oracle/witness.py"];
  const files = [
    ...coreRemainder,
    ...oracleRemainder,
    ...listFilesRecursive("src/report", [".ts", ".tsx"]),
    ...listFilesRecursive("src/cli", [".ts", ".tsx"]),
    ...listFilesRecursive("src/ui", [".ts", ".tsx"]),
    ...listFilesRecursive("src/worker", [".ts", ".tsx"]),
    ...listFilesRecursive("scripts", [".mjs", ".py"]).filter(
      (f) => f !== "scripts/oracle-diff.mjs" && f !== "scripts/release-verify.mjs",
    ),
  ];
  const pattern = NETWORK_PATTERNS.join("|");
  const result = runCmd(["grep", "-rnE", pattern, ...files]);
  const matches = result.exit === 0 ? result.stdout.trim().split("\n").filter(Boolean) : [];

  const tableFiles = [
    checkTableFile("scripts/oracle-diff.mjs", pattern, (lineNo, lines) => {
      const start = lines.findIndex((l) => l.includes("const NETWORK_PATTERNS = ["));
      const end = lines.findIndex((l, i) => i > start && l.trim() === "];");
      return start !== -1 && end !== -1 && lineNo >= start + 1 && lineNo <= end + 1;
    }),
    checkTableFile("scripts/release-verify.mjs", pattern, (lineNo, lines) => {
      const line = lines[lineNo - 1] ?? "";
      const trimmed = line.trim();
      return (
        trimmed.startsWith("//") ||
        line.includes("re: /") ||
        line.includes("modulepreload") ||
        line.includes("Static scan:") ||
        line.includes("Bare URL strings")
      );
    }),
  ];

  return {
    command: `grep -rnE '${pattern}' ${files.join(" ")}`,
    files_checked: files.length,
    match_count: result.exit === 1 ? 0 : matches.length,
    matches: matches.slice(0, 20),
    table_files: tableFiles,
  };
}

/** Grep one pattern-table file and split its matches into explained / unexplained. */
function checkTableFile(file, pattern, isExplained) {
  // -H forces the `file:lineno:text` prefix: with a single file operand
  // grep would otherwise omit the filename and the parse below would fail.
  const result = runCmd(["grep", "-rnEH", pattern, file]);
  const matches = result.exit === 0 ? result.stdout.trim().split("\n").filter(Boolean) : [];
  const lines = readFileSync(join(REPO_ROOT, file), "utf-8").split("\n");
  const unexplained = [];
  for (const match of matches) {
    const parsed = match.match(/^([^:]+):(\d+):(.*)$/s);
    const lineNo = parsed ? Number(parsed[2]) : -1;
    if (!isExplained(lineNo, lines)) unexplained.push(match);
  }
  return { file, match_count: matches.length, unexplained_matches: unexplained };
}

function runGate() {
  const gateLog = join(LOG_DIR, "s0-gate.log");
  const logLines = [];
  const log = (line) => {
    logLines.push(line);
    console.log(line);
  };

  // 1. Regression commands (each exit code + log recorded).
  const env = runCmd(["node", "scripts/env-check.mjs"], {
    logPath: join(LOG_DIR, "env-check-t004.log"),
  });
  // env-check prints a JSON object followed by a trailing "env:check OK"
  // line, so plain JSON.parse(stdout) fails; extract the fingerprint field.
  const fingerprintMatch = env.stdout.match(
    /"environmentFingerprint"\s*:\s*"([0-9a-f]{64})"/,
  );
  const fingerprint = fingerprintMatch ? fingerprintMatch[1] : "";
  const parse = runCmd(["npm", "run", "s0:parse"], {
    logPath: join(LOG_DIR, "s0-parse-t004.log"),
  });
  const semantics = runCmd(["npm", "run", "s0:semantics"], {
    logPath: join(LOG_DIR, "s0-semantics-t004.log"),
  });
  const typecheck = runCmd(["npm", "run", "typecheck"], {
    logPath: join(LOG_DIR, "typecheck-t004.log"),
  });
  const oracleParse = runCmd(
    [
      "python3",
      "-m",
      "oracle.checkpath_oracle.cli",
      "--suite",
      "tests/fixtures/s0/parser-trigger/suite.json",
    ],
    { logPath: join(LOG_DIR, "oracle-parser-t004.log") },
  );
  const oracleJc = runCmd(
    [
      "python3",
      "-m",
      "oracle.checkpath_oracle.cli",
      "--suite",
      "tests/fixtures/s0/job-check/suite.json",
    ],
    { logPath: join(LOG_DIR, "oracle-job-check-t004.log") },
  );

  // 2. The --suite and --repeat flows (they write their own reports/logs).
  log("gate: running e2e oracle diff (--suite) ...");
  const suiteRun = runSuite(DEFAULT_SUITE);
  log("gate: running determinism (--repeat 100) ...");
  const repeatRun = runRepeat(DEFAULT_SUITE, 100);

  // 3. Static network check.
  const network = staticNetworkCheck();
  log(`gate: static network check: ${network.match_count} matches`);
  // FIX-P2 (T013 P2-5): the expanded scope also gates c8. Its result
  // is logged here (evidence/s0/logs/s0-gate.log), not embedded in the
  // frozen gate JSON, so the gate hash is unchanged by the wider scope.
  const networkExpanded = expandedStaticNetworkCheck();
  log(
    `gate: expanded static network check: ${networkExpanded.files_checked} files, ${networkExpanded.match_count} matches`,
  );
  for (const table of networkExpanded.table_files) {
    log(
      `gate: network table-confinement ${table.file}: ${table.match_count} matches, ${table.unexplained_matches.length} unexplained`,
    );
  }

  // 4. Conditions (§0.1, all 8).
  let oracleJcFailed = null;
  try {
    oracleJcFailed = JSON.parse(oracleJc.stdout).summary.failed;
  } catch {
    // Unparseable output keeps oracleJcFailed null, which fails c3.
  }
  const oracleReport = suiteRun.report;
  const detReport = repeatRun.report;
  const conditions = {
    c1_t001_environment_available:
      env.exit === 0 && fingerprint.length === 64,
    c2_t002_parser_trigger_8_8:
      parse.exit === 0 &&
      oracleParse.exit === 0 &&
      oracleParse.stdout.includes("8/8 fixtures PASS"),
    c3_t003_job_check_12_12:
      semantics.exit === 0 &&
      oracleJc.exit === 0 &&
      oracleJcFailed === 0,
    c4_t004_e2e_24_24_oracle_parity:
      suiteRun.ok && oracleReport.oracle_mismatch_count === 0,
    c5_determinism_100_runs_one_hash:
      repeatRun.ok && detReport.determinism_unique_hash_count === 1,
    c6_false_pass_zero:
      oracleReport.false_pass_count === 0 &&
      // FIX-P0-01 (T013 P2-10): the formal-pipeline TS-side count
      // must be 0 too. Both are 0 after the fix, so this condition
      // (and hence gate_report_sha256) is unchanged by the fix.
      oracleReport.ts_formal_false_pass_count === 0,
    c7_unsupported_all_unknown:
      oracleReport.unsupported_as_unknown_count ===
        oracleReport.expected_unknown_fixture_count &&
      oracleReport.expected_unknown_fixture_count > 0,
    c8_no_network_calls:
      network.match_count === 0 &&
      // FIX-P2 (T013 P2-5): the expanded scope must be clean too, and
      // every pattern-table self-match in the two gate files must be
      // confined to a table/prose line (see expandedStaticNetworkCheck).
      networkExpanded.match_count === 0 &&
      networkExpanded.table_files.every((t) => t.unexplained_matches.length === 0),
  };
  const allPass = Object.values(conditions).every(Boolean);

  const taskResults = {
    T001: {
      exit_code: env.exit,
      log: "evidence/s0/logs/env-check-t004.log",
      commands: [
        {
          command: "node scripts/env-check.mjs",
          exit_code: env.exit,
          log: "evidence/s0/logs/env-check-t004.log",
        },
      ],
    },
    T002: {
      exit_code: parse.exit === 0 && oracleParse.exit === 0 ? 0 : 1,
      log: "evidence/s0/logs/s0-parse-t004.log",
      commands: [
        {
          command: "npm run s0:parse",
          exit_code: parse.exit,
          log: "evidence/s0/logs/s0-parse-t004.log",
        },
        {
          command:
            "python3 -m oracle.checkpath_oracle.cli --suite tests/fixtures/s0/parser-trigger/suite.json",
          exit_code: oracleParse.exit,
          log: "evidence/s0/logs/oracle-parser-t004.log",
        },
      ],
    },
    T003: {
      exit_code: semantics.exit === 0 && oracleJc.exit === 0 ? 0 : 1,
      log: "evidence/s0/logs/s0-semantics-t004.log",
      commands: [
        {
          command: "npm run s0:semantics",
          exit_code: semantics.exit,
          log: "evidence/s0/logs/s0-semantics-t004.log",
        },
        {
          command:
            "python3 -m oracle.checkpath_oracle.cli --suite tests/fixtures/s0/job-check/suite.json",
          exit_code: oracleJc.exit,
          log: "evidence/s0/logs/oracle-job-check-t004.log",
        },
      ],
    },
    T004: {
      exit_code: suiteRun.ok && repeatRun.ok ? 0 : 1,
      log: "evidence/s0/logs/s0-oracle-diff.log",
      commands: [
        {
          command: "node scripts/oracle-diff.mjs --suite tests/fixtures/s0/all.json",
          exit_code: suiteRun.ok ? 0 : 1,
          log: "evidence/s0/logs/s0-oracle-diff.log",
        },
        {
          command: "node scripts/oracle-diff.mjs --repeat 100",
          exit_code: repeatRun.ok ? 0 : 1,
          log: "evidence/s0/logs/s0-determinism.log",
        },
      ],
    },
  };

  const gateWithoutHash = {
    project_id: "P020",
    spec_version: "1.0.0",
    status: allPass ? "PASS" : "FAIL",
    task_results: taskResults,
    oracle_fixture_count: oracleReport.fixture_count,
    oracle_mismatch_count: oracleReport.oracle_mismatch_count,
    false_pass_count: oracleReport.false_pass_count,
    determinism_repeat_count: detReport.repeat_count,
    determinism_unique_hash_count: detReport.determinism_unique_hash_count,
    unsupported_as_unknown_count: oracleReport.unsupported_as_unknown_count,
    runtime_network_call_count: network.match_count,
    environment_fingerprint: fingerprint,
    input_fixture_sha256: oracleReport.input_fixture_sha256,
    conditions,
    typecheck_exit_code: typecheck.exit,
    typecheck_log: "evidence/s0/logs/typecheck-t004.log",
    network_check: network,
    notes: [
      "gate_report_sha256 is the SHA-256 of the canonical JSON of this file with the gate_report_sha256 field removed. Recompute with: python3 -c \"import json,hashlib; d=json.load(open('evidence/S0_GATE.json')); h=d.pop('gate_report_sha256'); print(hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()); print('recorded:',h)\"",
      "input_fixture_sha256 covers tests/fixtures/s0/all.json plus every fixture workflow/scenario/required-checks/expected file, sorted by path; see evidence/s0/T004_REPORT.md for the recompute command.",
      "Runtime network calls are 0 by construction (local processes only) and by static check over the executed implementation files; the runner itself (scripts/oracle-diff.mjs) is excluded from the grep because it contains the pattern table as string literals, and it only spawns local vitest/python3/npm/node/grep processes.",
      "PyYAML actually used by the Oracle is 6.0.1 (system); lockfile pins 6.0.3, pip install blocked by PEP 668 (T001 D2).",
    ],
  };
  const gateSha = sha256Hex(canonicalJson(gateWithoutHash));
  const gate = { ...gateWithoutHash, gate_report_sha256: gateSha };
  writeJson(join(REPO_ROOT, "evidence", "S0_GATE.json"), gate);

  log(`gate: status=${gate.status}`);
  log(`gate: oracle ${oracleReport.passed}/${oracleReport.fixture_count}, mismatches=${oracleReport.oracle_mismatch_count}, false PASS=${oracleReport.false_pass_count}, TS formal false PASS=${oracleReport.ts_formal_false_pass_count}`);
  log(`gate: determinism ${detReport.repeat_count} runs, ${detReport.determinism_unique_hash_count} unique hash(es)`);
  log(`gate: network matches=${network.match_count}`);
  log(`gate: gate_report_sha256=${gateSha}`);
  log("gate: report=evidence/S0_GATE.json");
  writeFileSync(gateLog, logLines.join("\n") + "\n", "utf-8");
  return allPass;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  mkdirSync(LOG_DIR, { recursive: true });
  if (args.includes("--gate")) {
    const ok = runGate();
    process.exit(ok ? 0 : 1);
  }
  const repeatIdx = args.indexOf("--repeat");
  if (repeatIdx !== -1) {
    const n = Number(args[repeatIdx + 1] ?? "100");
    if (!Number.isInteger(n) || n < 1) {
      console.error("--repeat needs a positive integer");
      process.exit(2);
    }
    const suiteIdx = args.indexOf("--suite");
    const suiteRel = suiteIdx !== -1 ? args[suiteIdx + 1] : DEFAULT_SUITE;
    const { ok } = runRepeat(suiteRel, n);
    process.exit(ok ? 0 : 1);
  }
  const suiteIdx = args.indexOf("--suite");
  const suiteRel = suiteIdx !== -1 ? args[suiteIdx + 1] : DEFAULT_SUITE;
  const { ok } = runSuite(suiteRel);
  process.exit(ok ? 0 : 1);
}

main();
