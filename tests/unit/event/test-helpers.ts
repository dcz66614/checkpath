// T006 test helpers (not a test file; vitest does not collect it).
//
// Small builders for a validated WorkflowIR / ScenarioV1 so the event,
// filter and diff-boundary tests can state the interesting fields only.
// Every helper returns a fully-typed object; tests that need a
// *validated* value pass the result through validateScenario /
// validateWorkflowIR explicitly (builder tests do that).

import type {
  ScenarioV1,
  WorkflowIR,
  WorkflowIREvent,
} from "../../../src/core/types.js";

export function makeWorkflow(
  events: WorkflowIREvent[],
  sourcePath = ".github/workflows/ci.yml",
): WorkflowIR {
  return {
    schema: "checkpath.workflow-ir/v1",
    source_path: sourcePath,
    name: "ci",
    on: events,
    jobs: [
      {
        id: "test",
        name: "unit-tests",
        needs: [],
        if: null,
        context: "unit-tests",
      },
    ],
  };
}

export function makeEvent(
  name: "push" | "pull_request" | "merge_group",
  overrides: Partial<WorkflowIREvent> = {},
): WorkflowIREvent {
  return {
    name,
    types: null,
    branches: null,
    branches_ignore: null,
    paths: null,
    paths_ignore: null,
    ...overrides,
  };
}

export function makeScenario(
  event: Partial<ScenarioV1["event"]> & { name: ScenarioV1["event"]["name"] },
  diff: Partial<ScenarioV1["diff"]> = {},
  scenarioId = "T6-TEST",
): ScenarioV1 {
  return {
    schema: "checkpath.scenario/v1",
    scenario_id: scenarioId,
    event: {
      action: null,
      branch: null,
      base_branch: null,
      head_branch: null,
      target_branch: null,
      ref: null,
      commit_message: "",
      ...event,
    },
    diff: {
      algorithm:
        event.name === "push" ? "two-dot" : "three-dot",
      changed_files: ["src/app.ts"],
      changed_files_total: null,
      returned_files: null,
      complete: true,
      first_3000_confirmed: true,
      diff_timed_out: false,
      push_commit_count: null,
      ...diff,
    },
  };
}

export function prScenario(
  overrides: Partial<ScenarioV1["event"]> = {},
  diff: Partial<ScenarioV1["diff"]> = {},
): ScenarioV1 {
  return makeScenario(
    {
      name: "pull_request",
      action: "synchronize",
      base_branch: "main",
      head_branch: "feature/x",
      commit_message: "feat: change",
      ...overrides,
    },
    diff,
  );
}

export function pushScenario(
  overrides: Partial<ScenarioV1["event"]> = {},
  diff: Partial<ScenarioV1["diff"]> = {},
): ScenarioV1 {
  return makeScenario(
    {
      name: "push",
      branch: "main",
      commit_message: "feat: change",
      ...overrides,
    },
    diff,
  );
}
