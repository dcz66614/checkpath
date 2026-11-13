// T011 — Golden end-to-end regression tests (test glue only).
//
// For each fixture in tests/fixtures/golden/suite.json (155 fixed
// cases: S0 24 + T6 trigger 16 + T7 jobs 12 + T8 checks 10 + T9
// witness 10 + unsupported 8 + FIX-P1-01 duplicate-key 3 + FIX-P0-02 duplicate-key 1 + FIX-P0-03 scalar-rendering 21 + FIX-P0-04 bare-empty-key / scalar-job 10 + FIX-P0-05 flow-alias-key 4 + FIX-P0-06 collection-alias-key / tab 6 + FIX-P0-07 quoted-mid-plain-scalar 6 + FIX-P0-08 multiline-quoted-unindented 12 + FIX-P0-09 flow-quoted-key 12), runs the TypeScript end-to-end
// pipeline (src/core/e2e.ts) and compares it field-by-field with the
// fixture's frozen expected.json. The expected files were generated
// once from the Python Reference Oracle by scripts/build-golden.py
// and reviewed before freezing (see evidence/tests/T011_REPORT.md
// §3 for the method and the hand-verified spot checks); they are
// never edited to fit the implementation.
//
// The suite path may be overridden with CHECKPATH_E2E_SUITE (used by
// scripts/make-fixtures.mjs for property suites, which use the same
// e2e shape). When CHECKPATH_E2E_DUMP_DIR is set, the TS report for
// every fixture is also written there as <id>.json so
// scripts/oracle-diff.mjs can diff it against the Python Oracle
// report (oracle CLI --report-out) for cross-implementation parity.
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateE2E } from "../../../src/core/e2e.js";

const here = dirname(fileURLToPath(import.meta.url));
const defaultSuite = join(here, "../../fixtures/golden/suite.json");
const suitePath = process.env["CHECKPATH_E2E_SUITE"]
  ? resolve(process.env["CHECKPATH_E2E_SUITE"])
  : defaultSuite;
const suiteDir = dirname(suitePath);

interface SuiteEntry {
  id: string;
  dir: string;
  description: string;
  cp: string | null;
  group: string;
  adversarial: boolean;
  workflows: string[];
  scenario: string;
  required_checks: string;
  expected: string;
}

const suite = JSON.parse(
  readFileSync(suitePath, "utf-8"),
) as { schema: string; suite_id: string; seed: number; fixtures: SuiteEntry[] };

describe("T011 golden end-to-end regression", () => {
  it("suite schema is the frozen e2e suite schema with a fixed seed", () => {
    expect(suite.schema).toBe("checkpath.s0-e2e-suite/v1");
    expect(suite.seed).toBe(20261108);
    expect(new Set(suite.fixtures.map((f) => f.id)).size).toBe(
      suite.fixtures.length,
    );
    // The ≥64 rule is a property of the frozen golden suite, not of
    // every suite run through this file (property runs may use a
    // smaller --count for smoke checks).
    if (suite.suite_id === "golden") {
      expect(suite.fixtures.length).toBeGreaterThanOrEqual(64);
    }
  });

  it("every supported check status appears at least once (golden suite only)", () => {
    // Property suites are random draws and need not cover every
    // status; their coverage is reported as a histogram in
    // evidence/tests/PROPERTY_REPORT.json instead.
    if (suite.suite_id !== "golden") return;
    const statuses = new Set<string>();
    for (const entry of suite.fixtures) {
      const expected = JSON.parse(
        readFileSync(
          join(suiteDir, entry.dir, entry.expected),
          "utf-8",
        ),
      ) as { required_checks: { status: string }[] };
      for (const c of expected.required_checks) statuses.add(c.status);
    }
    expect([...statuses].sort()).toEqual([
      "AMBIGUOUS",
      "INVALID",
      "PENDING_NOT_REPORTED",
      "REPORTABLE_PENDING",
      "SKIPPED_SUCCESS",
      "UNKNOWN",
    ]);
  });

  for (const entry of suite.fixtures) {
    it(`${entry.id} matches its fixed expected e2e report`, () => {
      const fixtureDir = join(suiteDir, entry.dir);
      const workflows = entry.workflows.map((path) => ({
        path,
        yamlText: readFileSync(join(fixtureDir, path), "utf-8"),
      }));
      const scenario = JSON.parse(
        readFileSync(join(fixtureDir, entry.scenario), "utf-8"),
      );
      const requiredChecks = JSON.parse(
        readFileSync(join(fixtureDir, entry.required_checks), "utf-8"),
      );
      const expected = JSON.parse(
        readFileSync(join(fixtureDir, entry.expected), "utf-8"),
      );
      const report = evaluateE2E({
        fixture_id: entry.id,
        workflows,
        scenario,
        required_checks: requiredChecks,
      });
      const dumpDir = process.env["CHECKPATH_E2E_DUMP_DIR"];
      if (dumpDir) {
        mkdirSync(dumpDir, { recursive: true });
        writeFileSync(
          join(dumpDir, `${entry.id}.json`),
          JSON.stringify(report, null, 2) + "\n",
          "utf-8",
        );
      }
      expect(report).toEqual(expected);
    });
  }
});
