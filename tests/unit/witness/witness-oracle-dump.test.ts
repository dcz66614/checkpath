// T009 — Witness Oracle-diff dump test.
//
// For every case in tests/fixtures/witness/suite.json (20 new T9
// cases + the 24 S0 E2E fixtures), this test:
//   1. runs the case through the formal witness reducer and asserts
//      it equals the frozen expected witnesses + recommendations —
//      the expected values are fixed inputs, never edited to fit the
//      implementation (they were generated once from the first
//      implementation run and reviewed by hand before freezing);
//   2. when CHECKPATH_WITNESS_DUMP_DIR is set, writes the formal
//      output as <id>.json so scripts/oracle-diff-witness.mjs can
//      diff it against the Python Reference Oracle output;
//   3. asserts the structural invariants the frozen files alone do
//      not prove: witness ids are unique and sequential, every
//      failing kind has >= 2 synthetic witnesses, REPORTABLE_PENDING
//      and SKIPPED_SUCCESS checks get no witness, and the reduction
//      spot-checks (path_filter keeps the first non-matching file,
//      commit_skip keeps just the token).
//
// The TS-vs-Oracle comparison itself lives in
// scripts/oracle-diff-witness.mjs (`npm run oracle:diff:witness`);
// this file only produces the TS side and locks the formal==expected
// invariant inside vitest.

import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadWitnessSuite } from "./witness-suite.js";

const { suite, cases } = loadWitnessSuite();

function writeDump(id: string, rows: unknown): void {
  const dumpDir = process.env["CHECKPATH_WITNESS_DUMP_DIR"];
  if (dumpDir) {
    mkdirSync(dumpDir, { recursive: true });
    writeFileSync(
      join(dumpDir, `${id}.json`),
      JSON.stringify(rows, null, 2) + "\n",
      "utf-8",
    );
  }
}

function findCase(id: string) {
  const found = cases.find((c) => c.entry.id === id);
  expect(found).toBeDefined();
  return found!;
}

describe("T009 witness suite (formal witness reducer)", () => {
  it("suite schema is the frozen witness suite schema with 44 cases", () => {
    expect(suite.schema).toBe("checkpath.witness-suite/v1");
    expect(suite.suite_id).toBe("witness");
    expect(suite.seed).toBe(20261108);
    expect(suite.fixtures).toHaveLength(44);
    expect(new Set(suite.fixtures.map((f) => f.id)).size).toBe(44);
    const sources = suite.fixtures.reduce<Record<string, number>>(
      (acc, f) => ({ ...acc, [f.source]: (acc[f.source] ?? 0) + 1 }),
      {},
    );
    expect(sources).toEqual({ "s0-e2e": 24, t009: 20 });
  });

  for (const c of cases) {
    it(`${c.entry.id}: formal witnesses match the frozen expected output`, () => {
      expect(c.output).toEqual(c.expected);
      writeDump(c.entry.id, c.output);
    });
  }

  it("every failure kind has at least 2 synthetic witnesses (T9 cases)", () => {
    const byKind = new Map<string, number>();
    for (const c of cases.filter((x) => x.entry.source === "t009")) {
      for (const w of c.output.witnesses) {
        byKind.set(w.kind, (byKind.get(w.kind) ?? 0) + 1);
      }
    }
    expect([...byKind.keys()].sort()).toEqual([
      "branch_filter",
      "commit_skip",
      "duplicate_context",
      "event_trigger_missing",
      "invalid_input",
      "merge_group_missing",
      "missing_context",
      "path_filter",
      "unsupported_feature",
    ]);
    for (const [kind, count] of byKind) {
      expect(count, `kind ${kind}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("witness ids are unique and sequential from witness-001 within each case", () => {
    for (const c of cases) {
      const ids = c.output.witnesses.map((w) => w.id);
      expect(new Set(ids).size).toBe(ids.length);
      ids.forEach((id, i) => {
        expect(id).toBe(`witness-${String(i + 1).padStart(3, "0")}`);
      });
      expect(c.output.recommendations.map((r) => r.witness_id)).toEqual(ids);
    }
  });

  it("REPORTABLE_PENDING and SKIPPED_SUCCESS checks get no witness", () => {
    // T9-09: integration fails, unit-tests reports -> exactly one witness.
    expect(findCase("T9-09").output.witnesses).toHaveLength(1);
    expect(findCase("T9-09").output.witnesses[0].check_context).toBe("integration");
    // S0 job-skip cases: no witness at all (skipped jobs are warnings, not failures).
    expect(findCase("E2E-17").output.witnesses).toHaveLength(0);
    expect(findCase("E2E-18").output.witnesses).toHaveLength(0);
    expect(findCase("E2E-22").output.witnesses).toHaveLength(0);
    // S0 clean cases: no witness.
    expect(findCase("E2E-02").output.witnesses).toHaveLength(0);
    expect(findCase("E2E-04").output.witnesses).toHaveLength(0);
    // S0 fail-closed bundle: four witnesses (provider_unknown, provider_invalid x2, external_source).
    expect(findCase("E2E-24").output.witnesses).toHaveLength(4);
    expect(findCase("E2E-24").output.witnesses.map((w) => w.kind)).toEqual([
      "unsupported_feature",
      "invalid_input",
      "invalid_input",
      "unsupported_feature",
    ]);
  });

  it("reduction spot-checks: path_filter keeps the first non-matching file", () => {
    expect(findCase("T9-03").output.witnesses[0].scenario?.diff.changed_files).toEqual([
      "README.md",
    ]);
    expect(findCase("T9-04").output.witnesses[0].scenario?.diff.changed_files).toEqual([
      "docs/a.md",
    ]);
    expect(findCase("E2E-01").output.witnesses[0].scenario?.diff.changed_files).toEqual([
      "README.md",
    ]);
  });

  it("reduction spot-checks: commit_skip keeps just the token, other kinds drop the message", () => {
    const w07 = findCase("T9-07").output.witnesses[0];
    expect(w07.scenario?.event.commit_message).toBe("[skip ci]");
    expect(w07.scenario?.diff.changed_files).toEqual([]);
    const w08 = findCase("T9-08").output.witnesses[0];
    expect(w08.scenario?.event.commit_message).toBe("[ci skip]");
    expect(w08.scenario?.diff.changed_files).toEqual(["src/app.ts"]);
    // Branch filter: the branch value is the evidence, files drop out.
    const w05 = findCase("T9-05").output.witnesses[0];
    expect(w05.scenario?.event.commit_message).toBe("");
    expect(w05.scenario?.diff.changed_files).toEqual([]);
  });

  it("T9-13: external source yields two witnesses, workflows drop out of the reduced scenario", () => {
    const out = findCase("T9-13").output;
    expect(out.witnesses).toHaveLength(2);
    expect(out.witnesses.map((w) => w.check_context)).toEqual([
      "unit-tests",
      "missing-check",
    ]);
    for (const w of out.witnesses) {
      expect(w.kind).toBe("unsupported_feature");
      expect(w.first_blocking_condition).toBe("external_source");
      expect(w.scenario?.diff.changed_files).toEqual([]);
    }
  });

  it("T9-18/T9-19 (T009-U01, CLOSED by ADR T011/T009-U01): non-merge_group event/activity mismatch uses the dedicated event_trigger_missing kind with rule R-EV-01", () => {
    const w18 = findCase("T9-18").output.witnesses[0];
    expect(w18.kind).toBe("event_trigger_missing");
    expect(w18.first_blocking_condition).toBe("activity_type_mismatch");
    expect(w18.note).toContain("pull_request");
    const r18 = findCase("T9-18").output.recommendations[0];
    expect(r18.kind).toBe("event_trigger_missing");
    expect(r18.rule_id).toBe("R-EV-01");
    const w19 = findCase("T9-19").output.witnesses[0];
    expect(w19.kind).toBe("event_trigger_missing");
    expect(w19.first_blocking_condition).toBe("event_mismatch");
    expect(w19.note).toContain("pull_request/synchronize");
    const r19 = findCase("T9-19").output.recommendations[0];
    expect(r19.kind).toBe("event_trigger_missing");
    expect(r19.rule_id).toBe("R-EV-01");
    // merge_group cases themselves stay merge_group_missing / R-MG-01.
    expect(findCase("T9-01").output.witnesses[0].kind).toBe(
      "merge_group_missing",
    );
    expect(findCase("T9-01").output.recommendations[0].rule_id).toBe(
      "R-MG-01",
    );
    expect(findCase("T9-02").output.witnesses[0].kind).toBe(
      "merge_group_missing",
    );
    expect(findCase("T9-02").output.recommendations[0].rule_id).toBe(
      "R-MG-01",
    );
  });
});
