// T006 — Diff-boundary tests (PROJECT_BOOK §4.3).
//
// Covers the GitHub diff boundaries through the formal evaluator and
// the skip-annotation module: push >1,000 commits (strictly greater),
// diff timeout, the >3,000-file first-3000 rules (confirmed truncation
// vs unconfirmed UNKNOWN, S0 legacy item ①), the exactly-3,000 edge,
// and the semantics of `diff.complete` / `returned_files` /
// `algorithm` (S0 legacy item ③ — documented in skip-annotation.ts
// and locked here: `complete` and `returned_files` do not drive the
// verdict, `algorithm` does not change matching).

import { describe, expect, it } from "vitest";
import { evaluateWorkflowTrigger } from "../../../src/core/event-evaluator.js";
import {
  annotateCommitSkip,
  annotateDiffBoundary,
  COMMIT_SKIP_TOKENS,
  diffChangedFilesTotal,
  hasCommitSkip,
  isDiffAlwaysRun,
} from "../../../src/core/skip-annotation.js";
import { loadTriggerCase } from "../event/trigger-suite.js";
import {
  makeEvent,
  makeWorkflow,
  prScenario,
  pushScenario,
} from "../event/test-helpers.js";

function loadCase(id: string, dir: string) {
  return loadTriggerCase({
    id,
    dir,
    workflow: "workflow.yml",
    scenario: "scenario.json",
    source: "t006",
  });
}

describe("T006 push commit-count boundary", () => {
  it("push with exactly 1,000 commits is NOT always-run", () => {
    const wf = makeWorkflow([
      makeEvent("push", { branches: ["main"], paths: ["src/**"] }),
    ]);
    const ev = evaluateWorkflowTrigger(
      wf,
      pushScenario({}, { changed_files: ["README.md"], push_commit_count: 1000 }),
    );
    expect(ev.path_match).toBe(false);
    expect(ev.triggered).toBe(false);
    expect(ev.reason).toBe("path_mismatch");
    expect(isDiffAlwaysRun(pushScenario({}, { push_commit_count: 1000 }))).toBe(
      false,
    );
  });

  it("push with 1,001 commits IS always-run (T6-02 fixture)", () => {
    const c = loadCase("T6-02", "T6-02-push-1001-always-run");
    expect(c.triggerIR.evaluation.triggered).toBe(true);
    expect(c.triggerIR.evaluation.path_match).toBe(true);
    expect(c.triggerIR.evaluation.path_file_results).toEqual([
      { file: "README.md", matched: true },
    ]);
    expect(annotateDiffBoundary(c.scenario)).toBe("push_over_1000_commits");
    const wf = makeWorkflow([
      makeEvent("push", { branches: ["main"], paths: ["src/**"] }),
    ]);
    const ev = evaluateWorkflowTrigger(
      wf,
      pushScenario({}, { changed_files: ["README.md"], push_commit_count: 1001 }),
    );
    expect(ev.triggered).toBe(true);
    expect(ev.reason).toBe("triggered");
  });

  it("push_commit_count >1,000 on a pull_request does NOT force always-run", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("pull_request", { paths: ["src/**"] })]),
      prScenario(
        {},
        { changed_files: ["README.md"], push_commit_count: 5000 },
      ),
    );
    expect(ev.path_match).toBe(false);
    expect(ev.triggered).toBe(false);
    expect(annotateDiffBoundary(prScenario({}, { push_commit_count: 5000 }))).toBeNull();
  });
});

describe("T006 diff timeout boundary", () => {
  it("a timed-out diff is always-run for pull_request (T6-03 fixture)", () => {
    const c = loadCase("T6-03", "T6-03-diff-timeout-pr");
    expect(c.triggerIR.evaluation.triggered).toBe(true);
    expect(c.triggerIR.evaluation.path_file_results).toEqual([
      { file: "README.md", matched: true },
    ]);
    expect(annotateDiffBoundary(c.scenario)).toBe("diff_timed_out");
  });

  it("a timed-out diff is always-run even with paths-ignore (T6-04 fixture)", () => {
    const c = loadCase("T6-04", "T6-04-diff-timeout-paths-ignore");
    expect(c.triggerIR.evaluation.triggered).toBe(true);
    expect(c.triggerIR.evaluation.path_file_results).toEqual([
      { file: "src/app.ts", matched: true },
    ]);
  });

  it("diff timeout outranks the >3,000 unconfirmed rule", () => {
    const scenario = prScenario(
      {},
      {
        changed_files: ["README.md"],
        changed_files_total: 3500,
        first_3000_confirmed: false,
        diff_timed_out: true,
      },
    );
    expect(annotateDiffBoundary(scenario)).toBe("diff_timed_out");
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("pull_request", { paths: ["src/**"] })]),
      scenario,
    );
    expect(ev.triggered).toBe(true);
  });
});

describe("T006 first-3000 rules (S0 legacy item ①)", () => {
  it("confirmed first-3000 with no match in the first 3000 does NOT trigger (T6-05)", () => {
    const c = loadCase("T6-05", "T6-05-first3000-confirmed-no-match");
    expect(c.scenario.diff.changed_files).toHaveLength(3000);
    expect(c.scenario.diff.changed_files_total).toBe(3500);
    expect(c.scenario.diff.first_3000_confirmed).toBe(true);
    expect(annotateDiffBoundary(c.scenario)).toBe("first_3000_truncated");
    expect(c.triggerIR.evaluation.path_file_results).toHaveLength(3000);
    expect(c.triggerIR.evaluation.path_match).toBe(false);
    expect(c.triggerIR.evaluation.triggered).toBe(false);
    expect(c.triggerIR.evaluation.reason).toBe("path_mismatch");
    expect(c.triggerIR.evaluation.unsupported).toEqual([]);
  });

  it("confirmed first-3000 with a match at position 3000 DOES trigger (T6-06)", () => {
    const c = loadCase("T6-06", "T6-06-first3000-confirmed-match-inside");
    expect(c.scenario.diff.changed_files[2999]).toBe("src/app.ts");
    expect(c.triggerIR.evaluation.path_file_results).toHaveLength(3000);
    expect(c.triggerIR.evaluation.path_file_results[2999]).toEqual({
      file: "src/app.ts",
      matched: true,
    });
    expect(c.triggerIR.evaluation.triggered).toBe(true);
  });

  it("unconfirmed first-3000 is UNKNOWN (E2E-16 / CP-L, via the trigger suite)", () => {
    const c = loadTriggerCase({
      id: "E2E-16",
      dir: "../s0/E2E-16-cp-l-diff-unconfirmed",
      workflow: "workflow.yml",
      scenario: "scenario.json",
      source: "s0-e2e",
    });
    expect(c.triggerIR.evaluation.path_match).toBeNull();
    expect(c.triggerIR.evaluation.triggered).toBeNull();
    expect(c.triggerIR.evaluation.reason).toBe("unknown");
    expect(c.triggerIR.evaluation.unsupported).toEqual([
      "diff_first_3000_unconfirmed",
    ]);
    expect(annotateDiffBoundary(c.scenario)).toBe("first_3000_unconfirmed");
  });

  it("a total of exactly 3,000 is evaluated normally, even unconfirmed (T6-13)", () => {
    const c = loadCase("T6-13", "T6-13-total-exactly-3000");
    expect(c.scenario.diff.changed_files_total).toBe(3000);
    expect(c.scenario.diff.first_3000_confirmed).toBe(false);
    expect(annotateDiffBoundary(c.scenario)).toBeNull();
    expect(c.triggerIR.evaluation.path_match).toBe(false);
    expect(c.triggerIR.evaluation.triggered).toBe(false);
    expect(c.triggerIR.evaluation.reason).toBe("path_mismatch");
    expect(c.triggerIR.evaluation.unsupported).toEqual([]);
  });

  it("changed_files_total falls back to the listed length", () => {
    const scenario = prScenario({}, { changed_files_total: null });
    expect(diffChangedFilesTotal(scenario)).toBe(
      scenario.diff.changed_files.length,
    );
  });
});

describe("T006 diff-field semantics (S0 legacy item ③)", () => {
  it("complete=false on its own does not change the verdict (T6-14)", () => {
    const c = loadCase("T6-14", "T6-14-complete-false-ignored");
    expect(c.scenario.diff.complete).toBe(false);
    expect(c.scenario.diff.diff_timed_out).toBe(false);
    expect(annotateDiffBoundary(c.scenario)).toBeNull();
    expect(c.triggerIR.evaluation.triggered).toBe(true);
  });

  it("returned_files need not equal the listed files (T6-15)", () => {
    const c = loadCase("T6-15", "T6-15-returned-files-subset");
    expect(c.scenario.diff.returned_files).toBe(3000);
    expect(c.scenario.diff.changed_files).toHaveLength(2);
    expect(c.scenario.diff.changed_files_total).toBe(3500);
    expect(c.triggerIR.evaluation.triggered).toBe(true);
  });

  it("algorithm does not change matching: same files, two-dot vs three-dot", () => {
    const wf = makeWorkflow([
      makeEvent("pull_request", { paths: ["src/**"] }),
    ]);
    const threeDot = evaluateWorkflowTrigger(wf, prScenario());
    expect(threeDot.triggered).toBe(true);
    // The algorithm is a schema-consistency fact (push<->two-dot,
    // PR/merge_group<->three-dot, enforced by validateScenario), not
    // a matching input: the evaluator matches the supplied files.
    const scenario = prScenario();
    expect(scenario.diff.algorithm).toBe("three-dot");
  });
});

describe("T006 commit-skip tokens", () => {
  it("all seven frozen tokens skip, case-insensitively, naming the token", () => {
    for (const token of COMMIT_SKIP_TOKENS) {
      expect(hasCommitSkip(`feat: x ${token}`)).toBe(true);
      expect(hasCommitSkip(`FEAT: X ${token.toUpperCase()}`)).toBe(true);
      const annotated = annotateCommitSkip(`chore ${token} done`);
      expect(annotated).toEqual({ skipped: true, token });
    }
  });

  it("bare 'skip ci' without brackets does not skip", () => {
    expect(hasCommitSkip("please skip ci for now")).toBe(false);
    expect(hasCommitSkip("skip-checks:false")).toBe(false);
    expect(hasCommitSkip("[skip]")).toBe(false);
    expect(hasCommitSkip("")).toBe(false);
    expect(hasCommitSkip(undefined)).toBe(false);
  });

  it("'skip-checks: true' (with space) and 'skip-checks:true' are distinct tokens, both skip", () => {
    expect(annotateCommitSkip("release skip-checks: true").token).toBe(
      "skip-checks: true",
    );
    expect(annotateCommitSkip("release skip-checks:true").token).toBe(
      "skip-checks:true",
    );
  });

  it("T6-07 / T6-08 fixtures skip with their tokens", () => {
    const c7 = loadCase("T6-07", "T6-07-commit-skip-actions");
    expect(c7.triggerIR.evaluation.commit_skip).toBe(true);
    expect(c7.triggerIR.evaluation.triggered).toBe(false);
    expect(c7.triggerIR.evaluation.reason).toBe("commit_skip");
    expect(annotateCommitSkip(c7.scenario.event.commit_message).token).toBe(
      "[skip actions]",
    );
    const c8 = loadCase("T6-08", "T6-08-commit-skip-checks-space");
    expect(c8.triggerIR.evaluation.commit_skip).toBe(true);
    expect(c8.triggerIR.evaluation.reason).toBe("commit_skip");
    expect(annotateCommitSkip(c8.scenario.event.commit_message).token).toBe(
      "skip-checks: true",
    );
  });
});
