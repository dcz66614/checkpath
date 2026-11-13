// T006 — Formal event / activity-type / branch evaluator tests.
//
// Covers PROJECT_BOOK §4.2 through the formal entry point
// `evaluateWorkflowTrigger` (WorkflowIR + ScenarioV1): the three event
// kinds, activity-type matching (including merge_group
// `checks_requested`), the per-event branch value (pull_request ->
// base, push -> branch, merge_group -> target), missing branch/action
// -> UNKNOWN, and commit-skip ordering (checked after path matching).

import { describe, expect, it } from "vitest";
import { evaluateWorkflowTrigger } from "../../../src/core/event-evaluator.js";
import {
  makeEvent,
  makeScenario,
  makeWorkflow,
  prScenario,
  pushScenario,
} from "./test-helpers.js";

describe("T006 event matching", () => {
  it("pull_request event matches a pull_request workflow", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("pull_request")]),
      prScenario(),
    );
    expect(ev.event_match).toBe(true);
    expect(ev.triggered).toBe(true);
    expect(ev.reason).toBe("triggered");
  });

  it("merge_group scenario does not trigger a pull_request-only workflow", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("pull_request")]),
      makeScenario({
        name: "merge_group",
        action: "checks_requested",
        target_branch: "main",
        head_branch: "feature/x",
      }),
    );
    expect(ev.event_match).toBe(false);
    expect(ev.triggered).toBe(false);
    expect(ev.reason).toBe("event_mismatch");
  });

  it("merge_group event matches a merge_group workflow (CP-C inverse)", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("merge_group")]),
      makeScenario({
        name: "merge_group",
        action: "checks_requested",
        target_branch: "main",
        head_branch: "feature/x",
      }),
    );
    expect(ev.event_match).toBe(true);
    expect(ev.triggered).toBe(true);
  });

  it("push event matches a push workflow and does not match pull_request", () => {
    const pushOnly = makeWorkflow([makeEvent("push")]);
    expect(
      evaluateWorkflowTrigger(pushOnly, pushScenario()).triggered,
    ).toBe(true);
    expect(
      evaluateWorkflowTrigger(pushOnly, prScenario()).triggered,
    ).toBe(false);
  });

  it("a workflow listing several events matches any of them", () => {
    const wf = makeWorkflow([
      makeEvent("push"),
      makeEvent("pull_request"),
      makeEvent("merge_group"),
    ]);
    expect(evaluateWorkflowTrigger(wf, pushScenario()).triggered).toBe(true);
    expect(evaluateWorkflowTrigger(wf, prScenario()).triggered).toBe(true);
    expect(
      evaluateWorkflowTrigger(
        wf,
        makeScenario({
          name: "merge_group",
          action: "checks_requested",
          target_branch: "main",
        }),
      ).triggered,
    ).toBe(true);
  });
});

describe("T006 activity types", () => {
  it("pull_request types [opened, synchronize] matches synchronize and opened", () => {
    const wf = makeWorkflow([
      makeEvent("pull_request", { types: ["opened", "synchronize"] }),
    ]);
    expect(
      evaluateWorkflowTrigger(wf, prScenario({ action: "synchronize" }))
        .activity_type_match,
    ).toBe(true);
    expect(
      evaluateWorkflowTrigger(wf, prScenario({ action: "opened" })).triggered,
    ).toBe(true);
  });

  it("pull_request types [opened] does not match synchronize", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("pull_request", { types: ["opened"] })]),
      prScenario({ action: "synchronize" }),
    );
    expect(ev.activity_type_match).toBe(false);
    expect(ev.triggered).toBe(false);
    expect(ev.reason).toBe("activity_type_mismatch");
  });

  it("merge_group types [checks_requested] matches checks_requested only", () => {
    const wf = makeWorkflow([
      makeEvent("merge_group", { types: ["checks_requested"] }),
    ]);
    const mg = (action: string) =>
      makeScenario({
        name: "merge_group",
        action,
        target_branch: "main",
        head_branch: "feature/x",
      });
    expect(evaluateWorkflowTrigger(wf, mg("checks_requested")).triggered).toBe(
      true,
    );
    const mismatch = evaluateWorkflowTrigger(wf, mg("destroyed"));
    expect(mismatch.activity_type_match).toBe(false);
    expect(mismatch.triggered).toBe(false);
    expect(mismatch.reason).toBe("activity_type_mismatch");
  });

  it("declared types with a missing action is UNKNOWN, not a mismatch", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("pull_request", { types: ["opened"] })]),
      prScenario({ action: null }),
    );
    expect(ev.activity_type_match).toBeNull();
    expect(ev.triggered).toBeNull();
    expect(ev.reason).toBe("unknown");
  });

  it("no types declared means any activity type matches (incl. null action)", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("pull_request")]),
      prScenario({ action: null }),
    );
    expect(ev.activity_type_match).toBe(true);
    expect(ev.triggered).toBe(true);
  });

  it("push has no activity type: types on push are matched against a null action as UNKNOWN", () => {
    // A push workflow that declares `types:` cannot be decided from a
    // push scenario (push carries no action); the evaluator reports
    // UNKNOWN rather than guessing. Workflows in practice do not
    // declare types for push; this locks the fail-closed behavior.
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("push", { types: ["created"] })]),
      pushScenario(),
    );
    expect(ev.activity_type_match).toBeNull();
    expect(ev.triggered).toBeNull();
    expect(ev.reason).toBe("unknown");
  });
});

describe("T006 per-event branch value", () => {
  it("pull_request branch filter uses base_branch, not head_branch", () => {
    const wf = makeWorkflow([
      makeEvent("pull_request", { branches: ["feature/x"] }),
    ]);
    // head matches but base does not -> no trigger (T6-10).
    const ev = evaluateWorkflowTrigger(wf, prScenario());
    expect(ev.branch_value).toBe("main");
    expect(ev.branch_match).toBe(false);
    expect(ev.triggered).toBe(false);
    expect(ev.reason).toBe("branch_mismatch");
    // base matches -> trigger.
    expect(
      evaluateWorkflowTrigger(
        makeWorkflow([makeEvent("pull_request", { branches: ["main"] })]),
        prScenario(),
      ).triggered,
    ).toBe(true);
  });

  it("push branch filter uses the pushed branch", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("push", { branches: ["main"] })]),
      pushScenario({ branch: "feature/x" }),
    );
    expect(ev.branch_value).toBe("feature/x");
    expect(ev.branch_match).toBe(false);
    expect(ev.triggered).toBe(false);
  });

  it("merge_group branch filter uses target_branch, not head_branch", () => {
    const wf = makeWorkflow([
      makeEvent("merge_group", { branches: ["main"] }),
    ]);
    const ev = evaluateWorkflowTrigger(
      wf,
      makeScenario({
        name: "merge_group",
        action: "checks_requested",
        target_branch: "main",
        head_branch: "feature/x",
      }),
    );
    expect(ev.branch_value).toBe("main");
    expect(ev.branch_match).toBe(true);
    expect(ev.triggered).toBe(true);
    // target mismatch, even though head would match a head-based rule.
    const miss = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("merge_group", { branches: ["feature/x"] })]),
      makeScenario({
        name: "merge_group",
        action: "checks_requested",
        target_branch: "main",
        head_branch: "feature/x",
      }),
    );
    expect(miss.branch_value).toBe("main");
    expect(miss.triggered).toBe(false);
  });

  it("missing branch value with a branch filter is UNKNOWN", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("pull_request", { branches: ["main"] })]),
      prScenario({ base_branch: null }),
    );
    expect(ev.branch_value).toBeNull();
    expect(ev.branch_match).toBeNull();
    expect(ev.triggered).toBeNull();
    expect(ev.reason).toBe("unknown");
  });

  it("no branch filter means any branch matches", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("pull_request")]),
      prScenario({ base_branch: "release/1.0" }),
    );
    expect(ev.branch_match).toBe(true);
    expect(ev.triggered).toBe(true);
  });
});

describe("T006 commit skip through the formal evaluator", () => {
  it("[skip ci] in the message skips an otherwise-triggering workflow", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("pull_request")]),
      prScenario({ commit_message: "docs: update [skip ci]" }),
    );
    expect(ev.commit_skip).toBe(true);
    expect(ev.triggered).toBe(false);
    expect(ev.reason).toBe("commit_skip");
  });

  it("commit skip is checked after path matching: a path mismatch wins", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("pull_request", { paths: ["src/**"] })]),
      prScenario(
        { commit_message: "docs: update [skip ci]" },
        { changed_files: ["README.md"] },
      ),
    );
    expect(ev.commit_skip).toBe(true);
    expect(ev.triggered).toBe(false);
    expect(ev.reason).toBe("path_mismatch");
  });

  it("commit skip is checked after branch matching: a branch mismatch wins", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("pull_request", { branches: ["main"] })]),
      prScenario({
        base_branch: "release/1.0",
        commit_message: "fix: x [skip ci]",
      }),
    );
    expect(ev.triggered).toBe(false);
    expect(ev.reason).toBe("branch_mismatch");
  });

  it("a message without a token does not skip", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("pull_request")]),
      prScenario({ commit_message: "feat: add feature" }),
    );
    expect(ev.commit_skip).toBe(false);
    expect(ev.triggered).toBe(true);
  });
});
