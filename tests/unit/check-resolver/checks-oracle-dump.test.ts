// T008 — Checks Oracle-diff dump test.
//
// For every case in tests/fixtures/checks/suite.json (34 YAML cases:
// the 24 S0 E2E fixtures plus 10 new T8 cases) and every S0 job-check
// case (12), this test:
//   1. evaluates the case through the FORMAL check resolver
//      (buildWorkflowIR + trigger evaluation + evaluateJobsForTrigger
//      per workflow + resolveRequiredChecksKeyed, projected to the
//      Oracle-compatible shape; resolveRequiredChecks for the
//      job-check cases) and asserts it equals the frozen expected
//      checks — the expected values are fixed inputs, never edited
//      to fit the implementation;
//   2. when CHECKPATH_CHECKS_DUMP_DIR is set, writes the formal
//      check rows as <id>.json so scripts/oracle-diff-checks.mjs can
//      diff them against the Python Reference Oracle output.
//   3. asserts the keyed provider identity for the T8 key cases:
//      T8-02 (same job_id, distinct names -> distinct provider keys
//      in distinct workflows) and T8-03 (same job_id, same context
//      -> AMBIGUOUS with both provider keys listed).
//
// The TS-vs-Oracle comparison itself lives in
// scripts/oracle-diff-checks.mjs (`npm run oracle:diff:checks`); this
// file only produces the TS side and locks the formal==expected
// invariant inside vitest.

import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadChecksSuite } from "./checks-suite.js";

const { suite, cases, jobCheckCases } = loadChecksSuite();

function writeDump(id: string, rows: unknown): void {
  const dumpDir = process.env["CHECKPATH_CHECKS_DUMP_DIR"];
  if (dumpDir) {
    mkdirSync(dumpDir, { recursive: true });
    writeFileSync(
      join(dumpDir, `${id}.json`),
      JSON.stringify(rows, null, 2) + "\n",
      "utf-8",
    );
  }
}

describe("T008 checks suite (formal check resolver)", () => {
  it("suite schema is the frozen checks suite schema with 34 YAML cases", () => {
    expect(suite.schema).toBe("checkpath.checks-suite/v1");
    expect(suite.suite_id).toBe("checks");
    expect(suite.seed).toBe(20261108);
    expect(suite.fixtures).toHaveLength(34);
    expect(new Set(suite.fixtures.map((f) => f.id)).size).toBe(34);
    const sources = suite.fixtures.reduce<Record<string, number>>(
      (acc, f) => ({ ...acc, [f.source]: (acc[f.source] ?? 0) + 1 }),
      {},
    );
    expect(sources).toEqual({ "s0-e2e": 24, t008: 10 });
  });

  it("the S0 job-check suite contributes 12 pure-resolver cases", () => {
    expect(jobCheckCases).toHaveLength(12);
    expect(new Set(jobCheckCases.map((c) => c.id)).size).toBe(12);
  });

  for (const c of cases) {
    it(`${c.entry.id}: formal checks match the frozen expected checks`, () => {
      expect(c.checks).toEqual(c.expectedChecks);
      writeDump(c.entry.id, c.checks);
    });
  }

  for (const c of jobCheckCases) {
    it(`${c.id}: formal checks match the frozen expected statuses`, () => {
      const statuses = Object.fromEntries(
        c.checks.map((r) => [r.context, r.status]),
      );
      expect(statuses).toEqual(c.raw.expected.required_checks);
      writeDump(c.id, c.checks);
    });
  }

  it("T8-02 keyed: same job_id in two workflows resolves to distinct provider keys", () => {
    const c = cases.find((x) => x.entry.id === "T8-02");
    expect(c).toBeDefined();
    const alpha = c?.keyed.find((r) => r.context === "alpha");
    const beta = c?.keyed.find((r) => r.context === "beta");
    expect(alpha?.provider_workflow_path).toBe("workflow-a.yml");
    expect(beta?.provider_workflow_path).toBe("workflow-b.yml");
    expect(alpha?.provider_key).toBe(JSON.stringify(["workflow-a.yml", "test"]));
    expect(beta?.provider_key).toBe(JSON.stringify(["workflow-b.yml", "test"]));
    expect(alpha?.provider_key).not.toBe(beta?.provider_key);
  });

  it("T8-03 keyed (T7-09 mirror): same job_id + same context is AMBIGUOUS with both keys", () => {
    const c = cases.find((x) => x.entry.id === "T8-03");
    expect(c).toBeDefined();
    expect(c?.keyed).toHaveLength(1);
    const row = c?.keyed[0];
    expect(row?.status).toBe("AMBIGUOUS");
    expect(row?.provider_count).toBe(2);
    expect(row?.provider_job_id).toBeNull();
    expect(row?.provider_workflow_path).toBeNull();
    expect(row?.provider_key).toBeNull();
    expect(row?.provider_keys).toEqual([
      JSON.stringify(["workflow-a.yml", "test"]),
      JSON.stringify(["workflow-b.yml", "test"]),
    ]);
  });
});
