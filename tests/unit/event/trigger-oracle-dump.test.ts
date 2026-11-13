// T006 — Trigger Oracle-diff dump test.
//
// For every case in tests/fixtures/trigger/suite.json (128 cases: the
// 24 S0 E2E fixtures — E2E-19 contributes two, one per workflow file —
// plus 16 new T6 cases, incl. T6-16 empty event value / ADR T011/T008-U01,
// plus 3 FIX-P1-01 duplicate-key cases T6-17..T6-19, plus 1 FIX-P0-02
// boolean-spelling duplicate-key case T6-20, plus 21 FIX-P0-03
// scalar-rendering cases T6-21..T6-41, plus 10 FIX-P0-04
// bare-empty-key / scalar-job cases T6-42..T6-51, plus 4 FIX-P0-05
// flow-alias-key cases T6-52..T6-55, plus 6 FIX-P0-06
// collection-alias-key / tab cases T6-56..T6-61, plus 6 FIX-P0-07
// quoted-mid-plain-scalar cases T6-62..T6-67, plus 12 FIX-P0-08
// multiline-quoted-unindented cases T6-68..T6-79, plus 12 FIX-P0-09
// flow-quoted-key cases T6-80..T6-91, plus 12 FIX-P0-10
// flow-continuation cases T6-92..T6-103), this test:
//   1. evaluates the case through the FORMAL evaluator
//      (buildWorkflowIR + evaluateWorkflowTrigger) and records the
//      TriggerIR-shaped object;
//   2. asserts the formal evaluation equals the PoC adapter evaluation
//      (buildTriggerIR) field-for-field — the refactor must not change
//      a single verdict;
//   3. when CHECKPATH_TRIGGER_DUMP_DIR is set, writes the formal
//      TriggerIR as <id>.json so scripts/oracle-diff-trigger.mjs can
//      diff it against the Python Reference Oracle output.
//
// The TS-vs-Oracle comparison itself lives in
// scripts/oracle-diff-trigger.mjs (`npm run oracle:diff:trigger`);
// this file only produces the TS side and locks the formal==PoC
// invariant inside vitest.

import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadTriggerSuite, pocEvaluation } from "./trigger-suite.js";

const { suite, cases } = loadTriggerSuite();

describe("T006 trigger suite (formal evaluator)", () => {
  it("suite schema is the frozen trigger suite schema with 128 cases", () => {
    expect(suite.schema).toBe("checkpath.trigger-suite/v1");
    expect(suite.suite_id).toBe("trigger");
    expect(suite.seed).toBe(20261108);
    expect(suite.fixtures).toHaveLength(128);
    expect(new Set(suite.fixtures.map((f) => f.id)).size).toBe(128);
    const sources = suite.fixtures.reduce<Record<string, number>>(
      (acc, f) => ({ ...acc, [f.source]: (acc[f.source] ?? 0) + 1 }),
      {},
    );
    expect(sources).toEqual({ "s0-e2e": 25, t006: 16, "fix-p1-01": 3, "fix-p0-02": 1, "fix-p0-03": 21, "fix-p0-04": 10, "fix-p0-05": 4, "fix-p0-06": 6, "fix-p0-07": 6, "fix-p0-08": 12, "fix-p0-09": 12, "fix-p0-10": 12 });
  });

  for (const c of cases) {
    it(`${c.entry.id}: formal evaluation equals the PoC evaluation`, () => {
      const poc = pocEvaluation(c.yamlText, c.scenario, c.entry.id);
      expect(c.triggerIR.evaluation).toEqual(poc);
      expect(c.triggerIR.schema).toBe("checkpath.trigger-ir/v1");
      expect(c.triggerIR.fixture_id).toBe(c.entry.id);
      const dumpDir = process.env["CHECKPATH_TRIGGER_DUMP_DIR"];
      if (dumpDir) {
        mkdirSync(dumpDir, { recursive: true });
        writeFileSync(
          join(dumpDir, `${c.entry.id}.json`),
          JSON.stringify(c.triggerIR, null, 2) + "\n",
          "utf-8",
        );
      }
    });
  }
});
