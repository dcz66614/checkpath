// T006 — Oracle trigger diff runner (`npm run oracle:diff:trigger`).
//
// Compares the formal TypeScript trigger evaluator against the Python
// Reference Oracle, field-by-field, over every case in
// tests/fixtures/trigger/suite.json (116 cases: 25 S0 E2E trigger cases
// + 16 new T6 cases, incl. T6-16 empty event value from ADR T011/T008-U01,
// + 3 FIX-P1-01 duplicate-key cases T6-17..T6-19
// + 1 FIX-P0-02 boolean-spelling duplicate-key case T6-20
// + 21 FIX-P0-03 scalar-rendering cases T6-21..T6-41
// + 10 FIX-P0-04 bare-empty-key / scalar-job cases T6-42..T6-51
// + 4 FIX-P0-05 flow-alias-key cases T6-52..T6-55
// + 6 FIX-P0-06 collection-alias-key / tab cases T6-56..T6-61
// + 6 FIX-P0-07 quoted-mid-plain-scalar cases T6-62..T6-67
// + 12 FIX-P0-08 multiline-quoted-unindented cases T6-68..T6-79):
//   1. TS side: vitest tests/unit/event/trigger-oracle-dump.test.ts
//      with CHECKPATH_TRIGGER_DUMP_DIR set, writing one normalized
//      TriggerIR per case.
//   2. Oracle side: scripts/oracle-trigger-dump.py, calling the
//      Oracle's own build_trigger_ir (no algorithm of its own).
//   3. This script deep-diffs the two directories with no ignore list
//      and writes evidence/tests/T006_ORACLE_TRIGGER_REPORT.json.
// Exit 0 only when vitest exits 0, the Oracle exits 0, and there are
// 0 mismatches. Any mismatch is a failure (P0); nothing is waived.
//
// No timestamps appear in the report: every field is a deterministic
// function of the inputs. No network is used: both sides are local
// processes (vitest / python3) over synthetic fixtures.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SUITE_REL = "tests/fixtures/trigger/suite.json";
const REPORT_PATH = join(REPO_ROOT, "evidence", "tests", "T006_ORACLE_TRIGGER_REPORT.json");

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
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

function main() {
  const suite = readJson(join(REPO_ROOT, SUITE_REL));
  const fixtureIds = suite.fixtures.map((f) => f.id);
  const tmp = mkdtempSync(join(tmpdir(), "checkpath-trigger-diff-"));
  const tsDir = join(tmp, "ts");
  const pyDir = join(tmp, "py");

  const ts = runCmd(
    ["npx", "vitest", "run", "tests/unit/event/trigger-oracle-dump.test.ts"],
    { env: { CHECKPATH_TRIGGER_DUMP_DIR: tsDir } },
  );
  const py = runCmd([
    "python3",
    "scripts/oracle-trigger-dump.py",
    "--suite",
    SUITE_REL,
    "--out",
    pyDir,
  ]);

  let mismatches = [];
  let missing = [];
  if (ts.exit === 0 && py.exit === 0) {
    for (const id of fixtureIds) {
      const tsPath = join(tsDir, `${id}.json`);
      const pyPath = join(pyDir, `${id}.json`);
      if (!existsSync(tsPath) || !existsSync(pyPath)) {
        missing.push(id);
        continue;
      }
      const fieldDiffs = deepDiff(readJson(tsPath), readJson(pyPath));
      if (fieldDiffs.length > 0) {
        mismatches.push({ fixture_id: id, field_diffs: fieldDiffs });
      }
    }
  }

  const report = {
    schema: "checkpath.t006-oracle-trigger-report/v1",
    suite: SUITE_REL,
    suite_sha256: sha256Hex(readFileSync(join(REPO_ROOT, SUITE_REL), "utf-8")),
    seed: 20261108,
    fixture_count: fixtureIds.length,
    passed: fixtureIds.length - mismatches.length - missing.length,
    failed: mismatches.length + missing.length,
    oracle_mismatch_count: mismatches.length,
    mismatches,
    missing_fixture_ids: missing,
    typescript_exit_code: ts.exit,
    oracle_exit_code: py.exit,
    notes: [
      "TS and Oracle trigger IRs are compared field-by-field with no ignore list.",
      "The TS side is the formal evaluator (buildWorkflowIR + evaluateWorkflowTrigger); the Oracle side is the Reference Oracle's build_trigger_ir.",
      "PyYAML is the system 6.0.1 (lockfile pins 6.0.3; pip install blocked by PEP 668; see T001 ENVIRONMENT_REPORT.md D2).",
    ],
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf-8");

  console.log(`suite: ${SUITE_REL}`);
  console.log(`fixtures: ${fixtureIds.length}, TS exit=${ts.exit}, Oracle exit=${py.exit}`);
  console.log(`TS vs Oracle mismatches: ${mismatches.length}`);
  if (missing.length > 0) console.log(`missing dumps: ${missing.join(", ")}`);
  for (const m of mismatches) {
    console.log(`MISMATCH ${m.fixture_id}: ${m.field_diffs.length} field(s) differ`);
    for (const d of m.field_diffs.slice(0, 5)) {
      console.log(`  ${d.path}: ts=${JSON.stringify(d.got)} oracle=${JSON.stringify(d.expected)}`);
    }
  }
  console.log(`report: evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`);
  rmSync(tmp, { recursive: true, force: true });
  const ok = ts.exit === 0 && py.exit === 0 && mismatches.length === 0 && missing.length === 0;
  process.exit(ok ? 0 : 1);
}

main();
