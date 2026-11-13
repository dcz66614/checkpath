// T009 — Witness reducer unit tests.
//
// These tests assert properties of the reducer, not frozen values
// (frozen values live in witness-oracle-dump.test.ts):
//   * a reduced witness scenario re-runs through the reducer and
//     reproduces the same witness (idempotent reduction);
//   * every witness has exactly one recommendation, citing the rule
//     for its kind, with concrete values and no generic fallback
//     phrasing;
//   * no recommendation or note invents a cause: every recommendation
//     names a value from its own witness;
//   * the kind -> rule_id mapping is fixed.

import { describe, expect, it } from "vitest";
import {
  buildWitnesses,
  type WitnessBuildOutput,
} from "../../../src/core/witness-reducer.js";
import { loadWitnessSuite } from "./witness-suite.js";

const { cases } = loadWitnessSuite();

const KIND_TO_RULE: Record<string, string> = {
  merge_group_missing: "R-MG-01",
  event_trigger_missing: "R-EV-01",
  path_filter: "R-PATH-01",
  branch_filter: "R-BRANCH-01",
  commit_skip: "R-SKIP-01",
  missing_context: "R-CTX-01",
  duplicate_context: "R-DUP-01",
  unsupported_feature: "R-UNSUP-01",
  invalid_input: "R-INV-01",
};

const BANNED_GENERIC = [
  "please check your configuration",
  "check your configuration",
  "check the configuration",
  "something went wrong",
  "contact support",
  "请检查配置",
];

function stripId(witness: WitnessBuildOutput["witnesses"][number]) {
  return {
    kind: witness.kind,
    check_context: witness.check_context,
    first_blocking_condition: witness.first_blocking_condition,
    scenario: witness.scenario,
    note: witness.note,
  };
}

describe("T009 witness reducer properties", () => {
  it("every T9 case produces at least one witness", () => {
    for (const c of cases.filter((x) => x.entry.source === "t009")) {
      expect(c.output.witnesses.length, c.entry.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("a reduced witness scenario re-runs and reproduces the same witness (idempotent reduction)", () => {
    for (const c of cases) {
      for (const witness of c.output.witnesses) {
        if (witness.scenario === null) continue;
        const replay = buildWitnesses({
          ...c.inputs,
          scenario: witness.scenario,
        });
        const match = replay.witnesses.find(
          (w) =>
            w.check_context === witness.check_context && w.kind === witness.kind,
        );
        expect(match, `${c.entry.id} ${witness.id}`).toBeDefined();
        expect(stripId(match!)).toEqual(stripId(witness));
      }
    }
  });

  it("every witness has exactly one recommendation citing its kind's rule", () => {
    for (const c of cases) {
      expect(c.output.recommendations).toHaveLength(c.output.witnesses.length);
      for (const witness of c.output.witnesses) {
        const recs = c.output.recommendations.filter(
          (r) => r.witness_id === witness.id,
        );
        expect(recs).toHaveLength(1);
        expect(recs[0].rule_id).toBe(KIND_TO_RULE[witness.kind]);
        expect(recs[0].kind).toBe(witness.kind);
        expect(recs[0].check_context).toBe(witness.check_context);
        expect(recs[0].recommendation.length).toBeGreaterThan(40);
      }
    }
  });

  it("no note or recommendation uses a generic fallback phrase", () => {
    for (const c of cases) {
      for (const witness of c.output.witnesses) {
        for (const phrase of BANNED_GENERIC) {
          expect(witness.note.toLowerCase()).not.toContain(phrase);
        }
      }
      for (const rec of c.output.recommendations) {
        for (const phrase of BANNED_GENERIC) {
          expect(rec.recommendation.toLowerCase()).not.toContain(phrase);
        }
      }
    }
  });

  it("every recommendation names a concrete value from its own witness", () => {
    for (const c of cases) {
      for (const rec of c.output.recommendations) {
        const witness = c.output.witnesses.find(
          (w) => w.id === rec.witness_id,
        )!;
        // The recommendation must name a concrete value from its own
        // witness: the check context, the commit message, a changed
        // file, or any quoted value from the witness note (workflow
        // path, job id, branch, pattern, token, if expression, ...).
        const scenario = witness.scenario;
        const candidates = [
          witness.check_context ?? "",
          scenario?.event.commit_message ?? "",
          ...(scenario?.diff.changed_files ?? []),
          ...[...witness.note.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
        ];
        const named = candidates.some(
          (value) => value !== "" && rec.recommendation.includes(value),
        );
        expect(named, `${c.entry.id} ${rec.witness_id}`).toBe(true);
      }
    }
  });

  it("notes name the concrete blocking value for each kind", () => {
    for (const c of cases) {
      for (const witness of c.output.witnesses) {
        if (witness.kind === "commit_skip") {
          expect(witness.note).toMatch(/skip token "\[/);
        }
        if (witness.kind === "missing_context") {
          expect(witness.note).toContain(witness.check_context ?? "");
        }
        if (witness.kind === "duplicate_context") {
          expect(witness.note).toContain("provided by 2 jobs");
        }
        if (witness.kind === "path_filter" || witness.kind === "branch_filter") {
          expect(witness.note).toContain("workflow.yml");
        }
      }
    }
  });
});
