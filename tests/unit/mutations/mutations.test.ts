// T011 — Mutation tests (`npm run test:mutation`).
//
// Each case in tests/fixtures/mutations/M-* is one minimal change to
// a workflow or a scenario (paths, branches, merge_group, if,
// job name, skip token, needs, paths-ignore, types, duplicate
// provider, filter removal) with a hand-derived expected verdict
// for BOTH the base and the mutated input. The test asserts:
//   1. the base input produces the expected triggered flag and
//      per-context check statuses;
//   2. the mutated input produces its expected triggered flag and
//      per-context check statuses;
//   3. at least one verdict actually flips between base and mutated
//      (a mutation that changes nothing is a useless test).
// The Python Reference Oracle cross-check for both variants lives in
// scripts/verify-mutations.py (run when the fixtures change and for
// the T011 evidence); the vitest run itself is the `test:mutation`
// acceptance command.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateE2E } from "../../../src/core/e2e.js";

const here = dirname(fileURLToPath(import.meta.url));
const mutationsDir = join(here, "../../fixtures/mutations");

const caseDirs = readdirSync(mutationsDir)
  .filter((name) => name.startsWith("M-"))
  .sort();

interface ExpectedSide {
  triggered: boolean;
  checks: Record<string, string>;
}

interface MutationExpected {
  mutation: string;
  base: ExpectedSide;
  mutated: ExpectedSide;
}

function loadSide(caseDir: string, side: "base" | "mutated") {
  const sideDir = join(mutationsDir, caseDir, side);
  const workflowFiles = readdirSync(sideDir)
    .filter((name) => name.endsWith(".yml"))
    .sort();
  const workflows = workflowFiles.map((path) => ({
    path,
    yamlText: readFileSync(join(sideDir, path), "utf-8"),
  }));
  const scenario = JSON.parse(
    readFileSync(join(sideDir, "scenario.json"), "utf-8"),
  );
  const requiredChecks = JSON.parse(
    readFileSync(join(mutationsDir, caseDir, "required-checks.json"), "utf-8"),
  );
  return evaluateE2E({
    fixture_id: `${caseDir}-${side}`,
    workflows,
    scenario,
    required_checks: requiredChecks,
  });
}

function checkStatuses(report: ReturnType<typeof loadSide>) {
  return Object.fromEntries(
    report.required_checks.map((c) => [c.context, c.status]),
  );
}

function anyTriggered(report: ReturnType<typeof loadSide>) {
  return report.workflows.some(
    (w) => w.trigger.evaluation.triggered === true,
  );
}

describe("T011 mutation tests", () => {
  it("12 mutation cases exist", () => {
    expect(caseDirs).toHaveLength(12);
  });

  for (const caseDir of caseDirs) {
    it(`${caseDir} flips the verdict as expected`, () => {
      const expected = JSON.parse(
        readFileSync(
          join(mutationsDir, caseDir, "expected.json"),
          "utf-8",
        ),
      ) as MutationExpected;
      const base = loadSide(caseDir, "base");
      const mutated = loadSide(caseDir, "mutated");
      expect(anyTriggered(base)).toBe(expected.base.triggered);
      expect(checkStatuses(base)).toEqual(expected.base.checks);
      expect(anyTriggered(mutated)).toBe(expected.mutated.triggered);
      expect(checkStatuses(mutated)).toEqual(expected.mutated.checks);
      const flipped =
        anyTriggered(base) !== anyTriggered(mutated) ||
        JSON.stringify(checkStatuses(base)) !==
          JSON.stringify(checkStatuses(mutated));
      expect(flipped).toBe(true);
    });
  }
});
