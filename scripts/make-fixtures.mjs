// T011 — Property fixture generator + verifier (IMPLEMENTATION_PLAN §7
// `test:property`, §8.2 fixed seed).
//
//   node scripts/make-fixtures.mjs --verify [--seed 20261108] [--count 1000]
//   node scripts/make-fixtures.mjs --generate [--seed ...] [--count ...] [--out <dir>]
//
// --verify is what `npm run test:property` runs (package.json keeps the
// §7 script name `node scripts/make-fixtures.mjs --verify`). It:
//   1. generates <count> synthetic cases from PROPERTY_TEST_SEED
//      (default 20261108) with a frozen xorshift32 PRNG — no time,
//      randomness, UUIDs or environment input;
//   2. generates the same suite a second time and requires the two
//      generations to be byte-identical (full reproducibility);
//   3. dumps the Python Reference Oracle reports as the fixtures'
//      expected.json (scripts/property-oracle-dump.py — same method as
//      scripts/build-golden.py);
//   4. runs the TypeScript golden test over the suite
//      (tests/unit/golden/golden.test.ts, via CHECKPATH_E2E_SUITE)
//      and diffs the TS reports against the Oracle reports
//      field-by-field with no ignore list;
//   5. writes evidence/tests/PROPERTY_REPORT.json.
// Exit 0 only when the regeneration is identical, both sides exit 0,
// mismatches are 0 and false PASS is 0.
//
// The generator covers the frozen supported semantics and their
// boundaries: three events, activity types, branch/path filters
// (incl. ordered negation and ignore variants), commit-skip tokens,
// diff boundaries (>1,000 push commits, diff timeout, >3,000 files
// with confirmed/unconfirmed first-3000 lists, complete:false),
// Job DAG needs, the frozen `if` subset plus unsupported `if`
// spellings, duplicate contexts, missing providers, external
// sources, matrix jobs and reusable-workflow jobs (ADR-04), and
// empty event values (ADR T008-U01).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SEED = 20261108;
const DEFAULT_COUNT = 1000;
const REPORT_PATH = join(REPO_ROOT, "evidence", "tests", "PROPERTY_REPORT.json");

// ---------------------------------------------------------------------------
// Frozen PRNG: xorshift32 (IMPLEMENTATION_PLAN §8.2).
// ---------------------------------------------------------------------------

function xorshift32(seed) {
  let x = seed >>> 0;
  if (x === 0) x = 0x9e3779b9;
  return function next() {
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    return x >>> 0;
  };
}

function makeRng(seed) {
  const next = xorshift32(seed);
  return {
    next,
    int(n) {
      return next() % n;
    },
    pick(arr) {
      return arr[next() % arr.length];
    },
    chance(p) {
      return next() / 4294967296 < p;
    },
    shuffle(arr) {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = next() % (i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

// ---------------------------------------------------------------------------
// Minimal YAML emitter (block mappings, flow lists of scalars).
// ---------------------------------------------------------------------------

function yamlScalar(value) {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function yamlFlowList(items) {
  return "[" + items.map((item) => yamlScalar(item)).join(", ") + "]";
}

function emitMapping(obj, indent, lines) {
  const pad = " ".repeat(indent);
  for (const [key, value] of Object.entries(obj)) {
    if (value === null) {
      lines.push(`${pad}${key}:`);
    } else if (Array.isArray(value)) {
      lines.push(`${pad}${key}: ${yamlFlowList(value)}`);
    } else if (typeof value === "object") {
      lines.push(`${pad}${key}:`);
      emitMapping(value, indent + 2, lines);
    } else {
      lines.push(`${pad}${key}: ${yamlScalar(value)}`);
    }
  }
}

function toYaml(obj) {
  const lines = [];
  emitMapping(obj, 0, lines);
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Generator.
// ---------------------------------------------------------------------------

const EVENTS = ["push", "pull_request", "merge_group"];
const ACTIONS = {
  pull_request: ["opened", "synchronize", "reopened", "closed"],
  merge_group: ["checks_requested"],
  push: [null],
};
const BRANCH_POOL = ["main", "develop", "feature/**", "release/*", "docs/**"];
const PATH_POOL = [
  "src/**",
  "docs/**",
  "README.md",
  "**/*.ts",
  "src/*.ts",
  "tests/**",
  "!src/generated/**",
  "!docs/**",
];
const FILE_POOL = [
  "src/app.ts",
  "src/util.ts",
  "docs/guide.md",
  "README.md",
  "tests/app.test.ts",
  "src/generated/code.ts",
  "package.json",
];
const JOB_NAMES = ["unit-tests", "lint", "build", "deploy", "integration"];
const IF_SUPPORTED = [
  "true",
  "false",
  "always()",
  "github.event_name == 'pull_request'",
  "github.event.action == 'synchronize'",
  "github.ref == 'refs/heads/main'",
  "github.base_ref == 'main'",
  "!false",
  "github.event_name != 'push'",
  "(github.event_name == 'push')",
];
const IF_UNSUPPORTED = [
  "contains(github.event_name, 'pull')",
  "hashFiles('src/**') != ''",
  "needs.build.outputs.result == 'ok'",
  "github.event.pull_request.number > 0",
];
const SKIP_TOKENS = ["[skip ci]", "[ci skip]", "[no ci]"];
const COMMIT_MESSAGES = [
  "feat: change",
  "docs: update guide",
  "fix: correct branch filter",
  "chore: bump deps",
];

function generateCase(rng, index) {
  const id = `P-${String(index + 1).padStart(4, "0")}`;
  const dirName = `${id}-generated`;

  // --- workflow ------------------------------------------------------------
  const eventCount = rng.chance(0.6) ? 1 : 2;
  const events = rng.shuffle(EVENTS).slice(0, eventCount);
  const on = {};
  for (const event of events) {
    // 15%: empty event value (no filters) — ADR T008-U01.
    if (rng.chance(0.15)) {
      on[event] = null;
      continue;
    }
    const config = {};
    // Push has no activity type, so it never carries a types filter.
    if (event !== "push" && rng.chance(0.5)) {
      config.types = rng.shuffle(ACTIONS[event].filter((a) => a !== null)).slice(0, rng.int(2) + 1);
    }
    if (rng.chance(0.7)) {
      if (rng.chance(0.85)) {
        config.branches = rng.shuffle(BRANCH_POOL).slice(0, rng.int(2) + 1);
      } else {
        config["branches-ignore"] = rng.shuffle(BRANCH_POOL).slice(0, rng.int(2) + 1);
      }
    }
    if (rng.chance(0.7)) {
      // 8%: deliberately invalid (paths + paths-ignore together).
      if (rng.chance(0.08)) {
        config.paths = ["src/**"];
        config["paths-ignore"] = ["docs/**"];
      } else if (rng.chance(0.85)) {
        config.paths = rng.shuffle(PATH_POOL).slice(0, rng.int(3) + 1);
      } else {
        config["paths-ignore"] = rng.shuffle(PATH_POOL).slice(0, rng.int(2) + 1);
      }
    }
    on[event] = config;
  }
  const jobCount = rng.int(4) + 1;
  const jobs = {};
  const jobIds = [];
  for (let j = 0; j < jobCount; j++) {
    const jobId = `job${j + 1}`;
    jobIds.push(jobId);
    const def = {};
    if (rng.chance(0.7)) def.name = rng.pick(JOB_NAMES);
    if (rng.chance(0.04)) {
      // Reusable-workflow call job (ADR-04).
      def.uses = "./.github/workflows/reusable.yml";
    } else {
      def["runs-on"] = "ubuntu-latest";
      if (rng.chance(0.06)) {
        def.strategy = { matrix: { os: ["ubuntu-latest", "windows-latest"] } };
      }
    }
    if (j > 0 && rng.chance(0.5)) {
      const needs = rng.shuffle(jobIds.slice(0, j)).slice(0, rng.int(j) + 1);
      def.needs = needs.length === 1 ? needs[0] : needs;
    } else if (rng.chance(0.05)) {
      def.needs = "ghost";
    }
    if (rng.chance(0.6)) {
      def.if = rng.chance(0.9) ? rng.pick(IF_SUPPORTED) : rng.pick(IF_UNSUPPORTED);
    }
    jobs[jobId] = def;
  }
  const workflow = { name: "ci", on, jobs };
  const workflowYml = rng.chance(0.1) && eventCount === 1
    ? `name: ci\non: ${events[0]}\njobs:\n${toYaml({ jobs }).split("\n").slice(1).join("\n")}`
    : toYaml(workflow);

  // --- scenario ------------------------------------------------------------
  const eventName = rng.pick(EVENTS);
  const action = rng.pick(ACTIONS[eventName]);
  const changedCount = rng.int(5);
  const changedFiles = rng.shuffle(FILE_POOL).slice(0, changedCount);
  const commitMessage = rng.chance(0.2)
    ? `${rng.pick(COMMIT_MESSAGES)} ${rng.pick(SKIP_TOKENS)}`
    : rng.pick(COMMIT_MESSAGES);
  const diffTotal = rng.chance(0.1) ? 3500 : changedFiles.length;
  const scenario = {
    schema: "checkpath.scenario/v1",
    scenario_id: id,
    event: {
      name: eventName,
      action,
      branch: eventName === "push" ? rng.pick(["main", "develop", "feature/x"]) : null,
      base_branch: eventName === "pull_request" ? rng.pick(["main", "develop"]) : null,
      head_branch: eventName === "pull_request" ? "feature/x" : null,
      target_branch: eventName === "merge_group" ? rng.pick(["main", "develop"]) : null,
      ref:
        eventName === "pull_request"
          ? "refs/pull/42/merge"
          : eventName === "push"
            ? "refs/heads/main"
            : "refs/heads/gh-readonly-queue/main/pr-42",
      commit_message: commitMessage,
    },
    diff: {
      algorithm: eventName === "push" ? "two-dot" : "three-dot",
      changed_files: changedFiles,
      changed_files_total: diffTotal,
      returned_files: changedFiles.length,
      complete: rng.chance(0.85),
      first_3000_confirmed: diffTotal > 3000 ? rng.chance(0.5) : true,
      diff_timed_out: rng.chance(0.08),
      push_commit_count:
        eventName === "push" && rng.chance(0.15) ? 1001 : null,
    },
  };

  // --- required checks -------------------------------------------------------
  const contexts = jobIds.map((jobId) => jobs[jobId].name ?? jobId);
  const entries = [];
  const checkCount = rng.int(3) + 1;
  for (let c = 0; c < checkCount; c++) {
    const roll = rng.next() % 100;
    if (roll < 70) {
      entries.push({ context: rng.pick(contexts), source: "github-actions" });
    } else if (roll < 85) {
      entries.push({ context: "missing-check", source: "github-actions" });
    } else if (roll < 95) {
      entries.push({ context: rng.pick(contexts) });
    } else {
      entries.push({ context: rng.pick(contexts), source: "external-app" });
    }
  }
  const requiredChecks = {
    schema: "checkpath.required-checks/v1",
    required_checks: entries,
  };
  return { id, dirName, workflowYml, scenario, requiredChecks };
}

function writeSuite(dir, seed, cases) {
  mkdirSync(dir, { recursive: true });
  const fixtures = [];
  for (const c of cases) {
    const caseDir = join(dir, c.dirName);
    mkdirSync(caseDir, { recursive: true });
    writeFileSync(join(caseDir, "workflow.yml"), c.workflowYml, "utf-8");
    writeFileSync(
      join(caseDir, "scenario.json"),
      JSON.stringify(c.scenario, null, 2) + "\n",
      "utf-8",
    );
    writeFileSync(
      join(caseDir, "required-checks.json"),
      JSON.stringify(c.requiredChecks, null, 2) + "\n",
      "utf-8",
    );
    fixtures.push({
      id: c.id,
      dir: c.dirName,
      description: `Property case ${c.id} (seed ${seed}).`,
      cp: null,
      group: "property",
      adversarial: false,
      workflows: ["workflow.yml"],
      scenario: "scenario.json",
      required_checks: "required-checks.json",
      expected: "expected.json",
    });
  }
  writeFileSync(
    join(dir, "suite.json"),
    JSON.stringify(
      { schema: "checkpath.s0-e2e-suite/v1", suite_id: "property", seed, fixtures },
      null,
      2,
    ) + "\n",
    "utf-8",
  );
  return fixtures;
}

function dirHash(dir) {
  const hash = createHash("sha256");
  const walkFs = (d) => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walkFs(path);
      else {
        hash.update(path.slice(dir.length + 1));
        hash.update("\0");
        hash.update(readFileSync(path));
        hash.update("\0");
      }
    }
  };
  walkFs(dir);
  return hash.digest("hex");
}

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map((i) => canonicalJson(i)).join(",") + "]";
  if (typeof value === "object") {
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonicalJson(v))
        .join(",") +
      "}"
    );
  }
  throw new Error(`cannot canonicalize ${typeof value}`);
}

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

function deepDiff(got, expected, path = "") {
  const diffs = [];
  if (got === expected) return diffs;
  if (got !== null && expected !== null && typeof got === "object" && typeof expected === "object") {
    if (Array.isArray(got) !== Array.isArray(expected)) {
      diffs.push({ path: path || "<root>", got, expected });
      return diffs;
    }
    if (Array.isArray(got)) {
      if (got.length !== expected.length) {
        diffs.push({ path: `${path}.length`, got: got.length, expected: expected.length });
      }
      for (let i = 0; i < Math.min(got.length, expected.length); i++) {
        diffs.push(...deepDiff(got[i], expected[i], `${path}[${i}]`));
      }
      return diffs;
    }
    for (const key of [...new Set([...Object.keys(got), ...Object.keys(expected)])].sort()) {
      diffs.push(...deepDiff(got[key], expected[key], path ? `${path}.${key}` : key));
    }
    return diffs;
  }
  diffs.push({ path: path || "<root>", got, expected });
  return diffs;
}

function parseArgs(argv) {
  const args = { mode: "verify", seed: DEFAULT_SEED, count: DEFAULT_COUNT, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--verify") args.mode = "verify";
    else if (argv[i] === "--generate") args.mode = "generate";
    else if (argv[i] === "--seed") args.seed = Number(argv[++i]);
    else if (argv[i] === "--count") args.count = Number(argv[++i]);
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  if (!Number.isInteger(args.seed) || args.seed < 0) throw new Error("--seed needs a non-negative integer");
  if (!Number.isInteger(args.count) || args.count < 1) throw new Error("--count needs a positive integer");
  return args;
}

function environmentInfo() {
  const python = runCmd(["python3", "-c", "import sys, yaml; print(sys.version.split()[0] + ' ' + yaml.__version__)"]);
  const [pythonVersion, pyyamlVersion] = (python.stdout.trim().split(" ").concat(["", ""])).slice(0, 2);
  return { node: process.version, python: pythonVersion ?? "", pyyaml: pyyamlVersion ?? "" };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rng = makeRng(args.seed);
  const cases = [];
  for (let i = 0; i < args.count; i++) cases.push(generateCase(rng, i));

  if (args.mode === "generate") {
    const out = args.out ? resolve(args.out) : join(REPO_ROOT, "tests", "fixtures", "property");
    writeSuite(out, args.seed, cases);
    console.log(`generated ${cases.length} cases (seed ${args.seed}) into ${out}`);
    return 0;
  }

  // --verify -----------------------------------------------------------------
  const tmp = mkdtempSync(join(tmpdir(), "checkpath-property-"));
  const dirA = join(tmp, "a");
  const dirB = join(tmp, "b");
  writeSuite(dirA, args.seed, cases);
  writeSuite(dirB, args.seed, cases);
  const hashA = dirHash(dirA);
  const hashB = dirHash(dirB);
  const regenerationIdentical = hashA === hashB;
  console.log(`regeneration: ${regenerationIdentical ? "identical" : "DIFFERS"} (hash ${hashA.slice(0, 16)}…)`);

  const tsDir = join(tmp, "ts");
  const pyDir = join(tmp, "py");
  const oracle = runCmd(
    ["python3", "scripts/property-oracle-dump.py", "--suite", join(dirA, "suite.json"), "--out", pyDir],
    { logPath: join(REPO_ROOT, "evidence", "tests", "logs", "property-oracle.log") },
  );
  const ts = runCmd(["npx", "vitest", "run", "tests/unit/golden"], {
    env: { CHECKPATH_E2E_SUITE: join(dirA, "suite.json"), CHECKPATH_E2E_DUMP_DIR: tsDir },
    logPath: join(REPO_ROOT, "evidence", "tests", "logs", "property-ts.log"),
  });
  console.log(`oracle dump exit=${oracle.exit}; TS (vitest) exit=${ts.exit}`);

  let mismatches = [];
  let falsePass = 0;
  const falsePassDetails = [];
  const checkStatuses = {};
  const jobStatuses = {};
  const inputHashes = [];
  if (oracle.exit === 0 && ts.exit === 0) {
    for (const c of cases) {
      const tsReport = JSON.parse(readFileSync(join(tsDir, `${c.id}.json`), "utf-8"));
      const pyReport = JSON.parse(readFileSync(join(pyDir, `${c.id}.json`), "utf-8"));
      const diffs = deepDiff(tsReport, pyReport);
      if (diffs.length > 0) mismatches.push({ fixture_id: c.id, field_diffs: diffs });
      const expected = JSON.parse(readFileSync(join(dirA, c.dirName, "expected.json"), "utf-8"));
      tsReport.required_checks.forEach((check, i) => {
        if (check.status === "REPORTABLE_PENDING" && expected.required_checks[i]?.status !== "REPORTABLE_PENDING") {
          falsePass += 1;
          falsePassDetails.push({ fixture_id: c.id, context: check.context, index: i, expected: expected.required_checks[i]?.status ?? null });
        }
      });
      for (const row of pyReport.required_checks) checkStatuses[row.status] = (checkStatuses[row.status] ?? 0) + 1;
      for (const row of pyReport.jobs) jobStatuses[row.status] = (jobStatuses[row.status] ?? 0) + 1;
      inputHashes.push({
        fixture_id: c.id,
        sha256: sha256Hex(
          canonicalJson(c.scenario) + canonicalJson(c.requiredChecks) + c.workflowYml,
        ),
      });
    }
  }
  console.log(`cases: ${cases.length}, TS vs Oracle mismatches: ${mismatches.length}, false PASS: ${falsePass}`);

  const report = {
    schema: "checkpath.property-report/v1",
    seed: args.seed,
    count: cases.length,
    generator: "xorshift32",
    prng: "xorshift32 (IMPLEMENTATION_PLAN §8.2, PROPERTY_TEST_SEED = 20261108)",
    generated_suite_sha256: hashA,
    regeneration_hash_a: hashA,
    regeneration_hash_b: hashB,
    regeneration_identical: regenerationIdentical,
    typescript_exit_code: ts.exit,
    oracle_exit_code: oracle.exit,
    mismatch_count: mismatches.length,
    mismatches: mismatches.slice(0, 5),
    false_pass_count: falsePass,
    false_pass_details: falsePassDetails,
    check_status_histogram: checkStatuses,
    job_status_histogram: jobStatuses,
    input_hashes: inputHashes,
    environment: environmentInfo(),
    notes: [
      "Generated cases are synthetic only; no network, no GitHub API, no token.",
      "expected.json per case is the Oracle report itself (same method as scripts/build-golden.py); the parity claim is the TS-vs-Oracle field diff, which has no ignore list.",
      "Regeneration hashes cover workflow.yml + scenario.json + required-checks.json + suite.json for every case; expected.json is excluded because it is a derived artifact of the Oracle run.",
    ],
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf-8");
  console.log(`report: evidence/tests/PROPERTY_REPORT.json`);
  rmSync(tmp, { recursive: true, force: true });
  const ok = regenerationIdentical && ts.exit === 0 && oracle.exit === 0 && mismatches.length === 0 && falsePass === 0;
  return ok ? 0 : 1;
}

try {
  process.exit(main());
} catch (error) {
  console.error(`make-fixtures failed: ${error.message}`);
  process.exit(2);
}
