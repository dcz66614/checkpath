// T007 — Jobs Oracle-diff dump test.
//
// For every case in tests/fixtures/jobs/suite.json (36 YAML cases:
// the 24 S0 E2E fixtures plus 12 new T7 cases) and every S0 job-check
// case (12), this test:
//   1. evaluates the case through the FORMAL job DAG
//      (buildWorkflowIR + trigger evaluation + evaluateJobsForTrigger
//      per workflow; evaluateJobs for the job-check cases) and
//      asserts it equals the frozen expected jobs — the expected
//      values are fixed inputs, never edited to fit the implementation;
//   2. when CHECKPATH_JOBS_DUMP_DIR is set, writes the formal job
//      rows as <id>.json so scripts/oracle-diff-jobs.mjs can diff
//      them against the Python Reference Oracle output.
//
// The TS-vs-Oracle comparison itself lives in
// scripts/oracle-diff-jobs.mjs (`npm run oracle:diff:jobs`); this
// file only produces the TS side and locks the formal==expected
// invariant inside vitest.

import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  dumpJobCheckRows,
  dumpRows,
  loadJobsSuite,
} from "./jobs-suite.js";

const { suite, cases, jobCheckCases } = loadJobsSuite();

function writeDump(id: string, rows: unknown): void {
  const dumpDir = process.env["CHECKPATH_JOBS_DUMP_DIR"];
  if (dumpDir) {
    mkdirSync(dumpDir, { recursive: true });
    writeFileSync(
      join(dumpDir, `${id}.json`),
      JSON.stringify(rows, null, 2) + "\n",
      "utf-8",
    );
  }
}

describe("T007 jobs suite (formal job DAG)", () => {
  it("suite schema is the frozen jobs suite schema with 36 YAML cases", () => {
    expect(suite.schema).toBe("checkpath.jobs-suite/v1");
    expect(suite.suite_id).toBe("jobs");
    expect(suite.seed).toBe(20261108);
    expect(suite.fixtures).toHaveLength(36);
    expect(new Set(suite.fixtures.map((f) => f.id)).size).toBe(36);
    const sources = suite.fixtures.reduce<Record<string, number>>(
      (acc, f) => ({ ...acc, [f.source]: (acc[f.source] ?? 0) + 1 }),
      {},
    );
    expect(sources).toEqual({ "s0-e2e": 24, t007: 12 });
  });

  it("the S0 job-check suite contributes 12 pure-DAG cases", () => {
    expect(jobCheckCases).toHaveLength(12);
    expect(new Set(jobCheckCases.map((c) => c.id)).size).toBe(12);
  });

  for (const c of cases) {
    it(`${c.entry.id}: formal jobs match the frozen expected jobs`, () => {
      const rows = dumpRows(c.jobs);
      expect(rows).toEqual(c.expectedJobs);
      writeDump(c.entry.id, rows);
    });
  }

  for (const c of jobCheckCases) {
    it(`${c.id}: formal jobs match the frozen expected statuses`, () => {
      const statuses = Object.fromEntries(
        c.jobs.map((j) => [j.job_id, j.status]),
      );
      expect(statuses).toEqual(c.raw.expected.jobs);
      writeDump(c.id, dumpJobCheckRows(c.jobs));
    });
  }
});
