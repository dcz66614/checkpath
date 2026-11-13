// T006 — Trigger-suite loader shared by the event tests and the
// Oracle trigger-diff dump test (not a test file itself).
//
// Loads tests/fixtures/trigger/suite.json (116 cases: the 24 S0 E2E
// fixtures re-used as trigger cases — E2E-19 contributes two, one per
// workflow file — plus 16 new T6 cases plus 3 FIX-P1-01 duplicate-key
// cases T6-17..T6-19 plus 1 FIX-P0-02 boolean-spelling duplicate-key
// case T6-20 plus 21 FIX-P0-03 scalar-rendering cases T6-21..T6-41
// plus 10 FIX-P0-04 bare-empty-key / scalar-job cases T6-42..T6-51
// plus 4 FIX-P0-05 flow-alias-key cases T6-52..T6-55 plus 6 FIX-P0-06
// collection-alias-key / tab cases T6-56..T6-61 plus 6 FIX-P0-07
// quoted-mid-plain-scalar cases T6-62..T6-67 plus 12 FIX-P0-08
// multiline-quoted-unindented cases T6-68..T6-79 plus 12 FIX-P0-09
// flow-quoted-key cases T6-80..T6-91).
// S0 fixture files are referenced, never copied or modified.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateScenario } from "../../../src/core/validate.js";
import { buildWorkflowIR } from "../../../src/core/workflow-ir.js";
import {
  evaluateTriggerEvents,
  evaluateWorkflowTrigger,
  type TriggerEvaluation,
} from "../../../src/core/event-evaluator.js";
import { buildTriggerIR } from "../../../src/core/workflow-parser.js";
import type { EventName, ScenarioV1, WorkflowIREvent } from "../../../src/core/types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const TRIGGER_SUITE_DIR = join(here, "../../fixtures/trigger");

export interface TriggerSuiteEntry {
  id: string;
  dir: string;
  workflow: string;
  scenario: string;
  source: string;
}

export interface TriggerSuiteCase {
  entry: TriggerSuiteEntry;
  yamlText: string;
  scenario: ScenarioV1;
  /** Formal TriggerIR-shaped object (TS side of the Oracle diff). */
  triggerIR: {
    schema: "checkpath.trigger-ir/v1";
    fixture_id: string;
    on_key_is_string: boolean;
    status: string;
    events: unknown;
    evaluation: TriggerEvaluation;
    errors: string[];
  };
}

/** Load the trigger suite (schema + 92 unique ids). */
export function loadTriggerSuite(): {
  suite: { schema: string; suite_id: string; seed: number; fixtures: TriggerSuiteEntry[] };
  cases: TriggerSuiteCase[];
} {
  const suite = JSON.parse(
    readFileSync(join(TRIGGER_SUITE_DIR, "suite.json"), "utf-8"),
  ) as {
    schema: string;
    suite_id: string;
    seed: number;
    fixtures: TriggerSuiteEntry[];
  };
  const cases = suite.fixtures.map((entry) => loadTriggerCase(entry));
  return { suite, cases };
}

/** Load one case: validate its scenario, build its WorkflowIR, evaluate it formally. */
export function loadTriggerCase(entry: TriggerSuiteEntry): TriggerSuiteCase {
  const fixtureDir = join(TRIGGER_SUITE_DIR, entry.dir);
  const yamlText = readFileSync(join(fixtureDir, entry.workflow), "utf-8");
  const rawScenario = JSON.parse(
    readFileSync(join(fixtureDir, entry.scenario), "utf-8"),
  ) as unknown;
  const validated = validateScenario(rawScenario);
  if (!validated.ok) {
    throw new Error(
      `trigger case ${entry.id}: scenario fails validation: ${JSON.stringify(validated.issues)}`,
    );
  }
  const scenario = validated.value;
  const built = buildWorkflowIR(yamlText, entry.workflow, entry.id);
  let evaluation: TriggerEvaluation;
  if (built.ok && built.workflow !== null) {
    evaluation = evaluateWorkflowTrigger(built.workflow, scenario);
  } else {
    // INVALID / UNKNOWN parse (or job-level validation issues): the
    // formal core evaluates the parsed events with the parse status.
    const events: WorkflowIREvent[] = built.trigger.events.map((e) => ({
      name: e.name as EventName,
      types: e.types,
      branches: e.branches,
      branches_ignore: e.branches_ignore,
      paths: e.paths,
      paths_ignore: e.paths_ignore,
    }));
    evaluation = evaluateTriggerEvents(
      events,
      built.status,
      built.unsupported,
      scenario,
    );
  }
  return {
    entry,
    yamlText,
    scenario,
    triggerIR: {
      schema: "checkpath.trigger-ir/v1",
      fixture_id: entry.id,
      on_key_is_string: built.trigger.on_key_is_string,
      status: built.status,
      events: built.trigger.events,
      evaluation,
      errors: built.trigger.errors,
    },
  };
}

/** PoC evaluation of one case (adapter path), for formal==PoC cross-checks. */
export function pocEvaluation(
  yamlText: string,
  scenario: ScenarioV1,
  fixtureId: string,
): TriggerEvaluation {
  const ir = buildTriggerIR(
    yamlText,
    {
      event: {
        name: scenario.event.name,
        action: scenario.event.action ?? undefined,
        branch: scenario.event.branch ?? undefined,
        base_branch: scenario.event.base_branch ?? undefined,
        head_branch: scenario.event.head_branch ?? undefined,
        target_branch: scenario.event.target_branch ?? undefined,
        commit_message: scenario.event.commit_message,
      },
      changed_files: scenario.diff.changed_files,
      diff: {
        changed_files_total: scenario.diff.changed_files_total,
        returned_files: scenario.diff.returned_files,
        first_3000_confirmed: scenario.diff.first_3000_confirmed,
        diff_timed_out: scenario.diff.diff_timed_out,
        push_commit_count: scenario.diff.push_commit_count,
      },
    },
    fixtureId,
  );
  return ir.evaluation;
}
