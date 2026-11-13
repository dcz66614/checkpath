// T004 — end-to-end PoC tests (test glue only).
//
// For each fixture in tests/fixtures/s0/all.json, runs the TypeScript
// end-to-end pipeline (src/core/e2e.ts: YAML -> trigger IR -> Job DAG/if
// -> check resolver -> normalized report) and compares it field-by-field
// with the fixture's fixed expected.json. The expected files were frozen
// before this test was first run (trigger IRs from the already-verified
// T002 Python parser, jobs/checks hand-derived from the spec) and are
// never edited to fit the implementation.
//
// When CHECKPATH_E2E_DUMP_DIR is set, the TS report for every fixture is
// also written there as <id>.json so scripts/oracle-diff.mjs can diff it
// against the Python Oracle report (oracle CLI --report-out) for
// cross-implementation parity.
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateE2E } from "../../../src/core/e2e.js";

const here = dirname(fileURLToPath(import.meta.url));
const suiteDir = join(here, "../../fixtures/s0");

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
  readFileSync(join(suiteDir, "all.json"), "utf-8"),
) as { schema: string; suite_id: string; seed: number; fixtures: SuiteEntry[] };

describe("T004 end-to-end PoC", () => {
  it("suite schema is the frozen e2e suite schema with 24 fixtures", () => {
    expect(suite.schema).toBe("checkpath.s0-e2e-suite/v1");
    expect(suite.suite_id).toBe("s0-e2e");
    expect(suite.seed).toBe(20261108);
    expect(suite.fixtures).toHaveLength(24);
    expect(new Set(suite.fixtures.map((f) => f.id)).size).toBe(24);
    const groups = suite.fixtures.reduce<Record<string, number>>(
      (acc, f) => ({ ...acc, [f.group]: (acc[f.group] ?? 0) + 1 }),
      {},
    );
    expect(groups).toEqual({ event: 8, filter: 8, job: 8 });
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
