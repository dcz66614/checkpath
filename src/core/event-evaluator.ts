// T006 — Event / activity-type / branch / path / commit-skip evaluator (formal).
//
// Formalizes the T002/T004 PoC trigger evaluation (workflow-parser.ts
// `evaluateTrigger`, `branchValueForEvent`, `hasCommitSkip`) for
// PROJECT_BOOK §4.2 and §4.3. This module is now the single home of the
// trigger-evaluation algorithm: workflow-parser.ts keeps its public PoC
// API (`buildTriggerIR`, `evaluateTrigger`) as a thin adapter that
// delegates here, and the S0 e2e pipeline is unchanged in behavior.
// The algorithm itself is moved verbatim — same precedence, same reason
// strings, same null/UNKNOWN contract — so the S0 fixtures and the
// Python Reference Oracle keep agreeing field-for-field.
//
// Decision (§4.2):
//   workflow_triggered = event_match AND activity_type_match
//                      AND branch_match AND path_match AND NOT commit_skip
// Precedence (first failure decides `reason`, later stages are not run):
//   event -> activity type -> branch -> path/diff -> commit skip.
//
// Branch value per event (§4.2):
//   pull_request -> base_branch (the target branch, NOT head_branch)
//   push         -> branch (the pushed branch)
//   merge_group  -> target_branch (the merge queue's target branch)
// A missing branch value (or a missing activity type when the workflow
// declares `types`) makes the verdict UNKNOWN (`triggered: null`), never
// a guessed false.
//
// Branch/path filters: when both are present they are ANDed (branch is
// checked first; a branch mismatch short-circuits before paths are
// looked at). `branches` vs `branches_ignore` (and `paths` vs
// `paths-ignore`) are mutually exclusive at parse time; an ignore list
// inverts the ordered-match result. Ordered `!` patterns keep their
// order (see glob-subset.ts): a later positive pattern can re-include
// a file excluded by an earlier negative one.
//
// Path/diff boundaries (§4.3, via skip-annotation.ts):
//   * always-run (diff timed out, or push with >1,000 commits): the
//     path filter counts as triggered — every listed file is reported
//     matched, exactly as with no path filter.
//   * total > 3,000 with an unconfirmed first-3000 list: path_match
//     null, triggered null, reason "unknown", unsupported gains
//     "diff_first_3000_unconfirmed".
//   * total > 3,000 with a confirmed first-3000 list: only the first
//     3,000 listed files are evaluated.
//   * no path filter: every listed file is reported matched and
//     path_match is true (even with zero changed files — an empty diff
//     does not block a workflow that has no path filter).
// `path_match` is true when at least one evaluated file passes the
// filter; with no matching file the workflow does not trigger
// (reason "path_mismatch"). Commit skip is checked last: a matching
// workflow whose commit message carries a skip token does not trigger
// (reason "commit_skip").
//
// Status contract (fail-closed), identical to the PoC:
//   VALID   — every filter is inside the frozen supported subset.
//   INVALID — structurally invalid input: all evaluation fields null,
//             `triggered` null, reason "invalid".
//   UNKNOWN — well-formed but outside the supported subset: all
//             evaluation fields null, `triggered` null, reason
//             "unknown", `unsupported` carries the reasons.
// For INVALID / UNKNOWN nothing is guessed. `commit_skip` is false in
// the null evaluations (no commit was evaluated).

import { matchOrderedPatterns } from "./glob-subset.js";
import {
  diffChangedFilesTotal,
  hasCommitSkip,
  isDiffAlwaysRun,
} from "./skip-annotation.js";
import type {
  EventName,
  ScenarioV1,
  TriggerStatus,
  WorkflowIR,
  WorkflowIREvent,
} from "./types.js";

export { hasCommitSkip };

/** One file's path-filter outcome, in listed order. */
export interface PathFileResult {
  file: string;
  matched: boolean;
}

/**
 * Trigger evaluation for one workflow against one scenario — the same
 * shape the T002 PoC emitted, so the S0 expected files and the Python
 * Oracle compare field-for-field with this module's output.
 */
export interface TriggerEvaluation {
  event_match: boolean | null;
  activity_type_match: boolean | null;
  branch_match: boolean | null;
  branch_value: string | null;
  path_match: boolean | null;
  path_file_results: PathFileResult[];
  commit_skip: boolean;
  triggered: boolean | null;
  unsupported: string[];
  reason: string;
}

/** Null evaluation for INVALID / UNKNOWN inputs (fail-closed). */
export function nullEvaluation(unsupported: string[], reason: string): TriggerEvaluation {
  return {
    event_match: null,
    activity_type_match: null,
    branch_match: null,
    branch_value: null,
    path_match: null,
    path_file_results: [],
    commit_skip: false,
    triggered: null,
    unsupported,
    reason,
  };
}

/** Branch value the filter compares against, per event (§4.2). */
export function branchValueForEvent(
  eventName: string,
  scenario: ScenarioV1,
): string | null {
  const event = scenario.event;
  if (eventName === "pull_request") return event.base_branch;
  if (eventName === "push") return event.branch;
  if (eventName === "merge_group") return event.target_branch;
  return null;
}

/**
 * Evaluate one workflow's parsed `on:` events against one scenario.
 * `status` is the parse status of those events (VALID / INVALID /
 * UNKNOWN) and `unsupported` the parse-time unsupported reasons; for
 * INVALID / UNKNOWN the evaluation is null and nothing is guessed.
 * This is the core the PoC adapter and the formal WorkflowIR entry
 * point both call.
 */
export function evaluateTriggerEvents(
  events: readonly WorkflowIREvent[],
  status: TriggerStatus,
  unsupported: readonly string[],
  scenario: ScenarioV1,
): TriggerEvaluation {
  if (status === "INVALID") return nullEvaluation([], "invalid");
  if (status === "UNKNOWN") {
    return nullEvaluation([...unsupported], "unknown");
  }
  const event = scenario.event;
  const eventName = event.name ?? "";
  const matched = events.find((e) => e.name === eventName);
  if (!matched) {
    return {
      ...nullEvaluation([], "event_mismatch"),
      event_match: false,
      triggered: false,
    };
  }
  const evaluation: TriggerEvaluation = {
    event_match: true,
    activity_type_match: true,
    branch_match: true,
    branch_value: branchValueForEvent(eventName, scenario),
    path_match: true,
    path_file_results: [],
    commit_skip: hasCommitSkip(event.commit_message),
    triggered: null,
    unsupported: [],
    reason: "triggered",
  };

  if (matched.types !== null) {
    if (event.action === null || event.action === undefined) {
      return { ...evaluation, activity_type_match: null, triggered: null, reason: "unknown" };
    }
    evaluation.activity_type_match = matched.types.includes(event.action);
    if (!evaluation.activity_type_match) {
      return { ...evaluation, triggered: false, reason: "activity_type_mismatch" };
    }
  }

  const branchPatterns = matched.branches ?? matched.branches_ignore ?? null;
  if (branchPatterns !== null) {
    if (evaluation.branch_value === null) {
      return { ...evaluation, branch_match: null, triggered: null, reason: "unknown" };
    }
    const { matched: hit, unsupported: bad } = matchOrderedPatterns(
      branchPatterns,
      evaluation.branch_value,
    );
    if (bad.length > 0) {
      return { ...evaluation, branch_match: null, triggered: null, unsupported: bad, reason: "unknown" };
    }
    evaluation.branch_match = matched.branches_ignore !== null ? !hit : hit;
    if (!evaluation.branch_match) {
      return { ...evaluation, triggered: false, reason: "branch_mismatch" };
    }
  }

  const changedFiles = scenario.diff.changed_files;
  // Diff boundaries (§4.3): always-run first, then the >3,000-file
  // rules. The operative predicates live in skip-annotation.ts
  // (isDiffAlwaysRun + the first-3000 check, in the same order as the
  // Oracle) so the two implementations cannot drift apart; the
  // scenario-level annotation (annotateDiffBoundary) names the same
  // precedence for the report layer.
  const diffTotal = diffChangedFilesTotal(scenario);
  const diffAlwaysRun = isDiffAlwaysRun(scenario);
  const pathPatterns = matched.paths ?? matched.paths_ignore ?? null;
  if (pathPatterns === null) {
    evaluation.path_file_results = changedFiles.map((file) => ({ file, matched: true }));
    evaluation.path_match = true;
  } else if (diffAlwaysRun) {
    evaluation.path_file_results = changedFiles.map((file) => ({ file, matched: true }));
    evaluation.path_match = true;
  } else if (diffTotal > 3000 && scenario.diff.first_3000_confirmed !== true) {
    return {
      ...evaluation,
      path_match: null,
      triggered: null,
      unsupported: [...evaluation.unsupported, "diff_first_3000_unconfirmed"],
      reason: "unknown",
    };
  } else {
    const filesToEvaluate =
      diffTotal > 3000 ? changedFiles.slice(0, 3000) : changedFiles;
    for (const file of filesToEvaluate) {
      const { matched: hit, unsupported: bad } = matchOrderedPatterns(pathPatterns, file);
      if (bad.length > 0) {
        return {
          ...evaluation,
          path_match: null,
          triggered: null,
          unsupported: [...evaluation.unsupported, ...bad],
          reason: "unknown",
        };
      }
      evaluation.path_file_results.push({
        file,
        matched: matched.paths_ignore !== null ? !hit : hit,
      });
    }
    evaluation.path_match = evaluation.path_file_results.some((r) => r.matched);
    if (!evaluation.path_match) {
      return { ...evaluation, triggered: false, reason: "path_mismatch" };
    }
  }

  if (evaluation.commit_skip) {
    return { ...evaluation, triggered: false, reason: "commit_skip" };
  }
  return { ...evaluation, triggered: true, reason: "triggered" };
}

/**
 * Formal entry point: evaluate a validated WorkflowIR against a
 * validated ScenarioV1. The IR is VALID by construction (the builder
 * only produces one for a VALID parse), so `status` is VALID and
 * `unsupported` is empty here.
 */
export function evaluateWorkflowTrigger(
  workflow: WorkflowIR,
  scenario: ScenarioV1,
): TriggerEvaluation {
  return evaluateTriggerEvents(workflow.on, "VALID", [], scenario);
}

/** Event names the formal evaluator supports (PROJECT_BOOK §3.3). */
export const SUPPORTED_EVENTS: readonly EventName[] = [
  "push",
  "pull_request",
  "merge_group",
] as const;
