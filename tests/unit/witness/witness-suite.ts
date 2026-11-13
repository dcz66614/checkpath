// T009 — Witness-suite loader shared by the witness tests and the
// Oracle witness-diff dump test (not a test file itself).
//
// Loads tests/fixtures/witness/suite.json (20 new T9 cases + the 24
// S0 E2E fixtures re-used as witness cases) and runs each case
// through the formal witness reducer (`buildWitnesses`), which runs
// the formal pipeline (buildWorkflowIR + trigger evaluation +
// evaluateJobsForTrigger + resolveRequiredChecksKeyed) and reduces
// the scenario by fixed-order delta-debugging. S0 fixture files are
// referenced, never copied or modified; the frozen expected witness
// outputs for S0 cases live in tests/fixtures/witness/expected-s0/
// (the S0 expected.json files carry no witnesses and are untouched).

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateScenario } from "../../../src/core/validate.js";
import {
  buildWitnesses,
  type WitnessBuildInput,
  type WitnessBuildOutput,
} from "../../../src/core/witness-reducer.js";
import type { RequiredCheckEntry, ScenarioV1 } from "../../../src/core/types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const WITNESS_SUITE_DIR = join(here, "../../fixtures/witness");

export interface WitnessSuiteEntry {
  id: string;
  dir: string;
  workflows: string[];
  scenario: string;
  required_checks: string;
  source: string;
  expected: string;
}

export interface WitnessSuiteCase {
  entry: WitnessSuiteEntry;
  /** Raw reducer inputs (kept so tests can re-run without re-reading files). */
  inputs: WitnessBuildInput;
  /** Reducer output for this case. */
  output: WitnessBuildOutput;
  /** Frozen expected output (witnesses + recommendations). */
  expected: WitnessBuildOutput;
}

function loadCase(entry: WitnessSuiteEntry): WitnessSuiteCase {
  const fixtureDir = join(WITNESS_SUITE_DIR, entry.dir);
  const rawScenario = JSON.parse(
    readFileSync(join(fixtureDir, entry.scenario), "utf-8"),
  ) as unknown;
  const validated = validateScenario(rawScenario);
  if (!validated.ok) {
    throw new Error(
      `witness case ${entry.id}: scenario fails validation: ${JSON.stringify(validated.issues)}`,
    );
  }
  const scenario: ScenarioV1 = validated.value;
  const requiredChecks = (
    JSON.parse(
      readFileSync(join(fixtureDir, entry.required_checks), "utf-8"),
    ) as { required_checks: RequiredCheckEntry[] }
  ).required_checks;
  const workflows = entry.workflows.map((workflowPath) => ({
    path: workflowPath,
    yamlText: readFileSync(join(fixtureDir, workflowPath), "utf-8"),
  }));
  const inputs: WitnessBuildInput = {
    fixtureId: entry.id,
    workflows,
    scenario,
    requiredChecks,
  };
  const expected = JSON.parse(
    readFileSync(join(WITNESS_SUITE_DIR, entry.expected), "utf-8"),
  ) as WitnessBuildOutput;
  return { entry, inputs, output: buildWitnesses(inputs), expected };
}

/** Load the witness suite: 20 T9 cases + 24 S0 E2E cases. */
export function loadWitnessSuite(): {
  suite: {
    schema: string;
    suite_id: string;
    seed: number;
    fixtures: WitnessSuiteEntry[];
  };
  cases: WitnessSuiteCase[];
} {
  const suite = JSON.parse(
    readFileSync(join(WITNESS_SUITE_DIR, "suite.json"), "utf-8"),
  ) as {
    schema: string;
    suite_id: string;
    seed: number;
    fixtures: WitnessSuiteEntry[];
  };
  const cases = suite.fixtures.map((entry) => loadCase(entry));
  return { suite, cases };
}
