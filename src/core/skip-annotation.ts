// T006 — Commit-skip tokens and GitHub diff-boundary annotation (formal).
//
// Formalizes the T002/T004 PoC rules (workflow-parser.ts / e2e.ts /
// oracle/checkpath_oracle/parser.py + evaluator.py `diff_boundary`) for
// PROJECT_BOOK §3.3 and §4.3. This module is the single home of the
// commit-skip token list and the diff-boundary precedence; the trigger
// evaluator (event-evaluator.ts) and the report builder (T010) import
// from here instead of keeping their own copies.
//
// Commit skip (§3.3): a workflow run is skipped when the commit message
// contains one of the frozen tokens below. Matching is a case-insensitive
// substring test on the whole message — the token must appear verbatim
// (including its brackets / colon / space); "skip ci" without brackets
// does NOT skip, and neither does a token split across lines in a way
// that breaks the literal substring. Only the message of the event's
// commit is consulted.
//
// Diff-boundary precedence (§4.3), highest first:
//   1. `diff_timed_out` — the diff could not be generated in time:
//      the path filter counts as triggered (always-run).
//   2. push with `push_commit_count` > 1,000 — same always-run rule.
//      Exactly 1,000 commits does NOT trigger it (strictly greater).
//   3. `changed_files_total` > 3,000 with `first_3000_confirmed` not
//      true — the listed files cannot be trusted to be GitHub's first
//      3,000, so the path filter is UNKNOWN (fail-closed).
//   4. `changed_files_total` > 3,000 with `first_3000_confirmed` true
//      — only the first 3,000 listed files are evaluated; files beyond
//      the first 3,000 are invisible to the path filter (they can neither
//      match nor un-match it).
//   Otherwise no boundary applies and every listed file is evaluated.
//   `changed_files_total` falls back to `changed_files.length` when it
//   is absent; the boundary is strictly greater than 3,000, so a total
//   of exactly 3,000 is evaluated normally.
//
// NOTE on the Oracle's `diff_boundary` report field: the Python Oracle
// (evaluator.py `diff_boundary`) reports only the first three cases
// above and returns null for case 4 (confirmed truncation) — the
// truncation still applies inside each trigger evaluation, it is just
// not surfaced as a scenario-level annotation there. `annotateDiffBoundary`
// below additionally reports case 4 as `"first_3000_truncated"` so the
// formal layer can name it; it must NOT be copied into the e2e report's
// `diff_boundary` field (e2e.ts keeps the Oracle-compatible 3-valued
// annotation until T010 re-bases the report builder).
//
// Diff-field semantics (S0 legacy item ③ — what each field means and
// which fields the decision actually consults):
//   * `diff.complete` — whether the diff listing completed. It is a
//     caller-supplied fact carried through the report, but it is NOT
//     consulted by the trigger decision in either implementation: a
//     timed-out diff is signalled by `diff_timed_out: true`, and an
//     unconfirmed first-3000 list by `first_3000_confirmed: false`.
//     In particular `complete: false` on its own (without
//     `diff_timed_out`) does not force always-run and does not force
//     UNKNOWN. A truthful scenario has `complete: false` exactly when
//     the diff did not complete, but the evaluator never infers a
//     timeout from it.
//   * `diff.returned_files` — how many files GitHub returned in this
//     diff response. It is NOT required to equal
//     `changed_files.length`: a scenario may list a subset of the
//     returned files (S0 CP-L / E2E-16 lists 2 files while
//     `returned_files` is 3000). The schema (validate.ts) only requires
//     `returned_files <= changed_files_total` when both are known.
//     The trigger decision does not consult `returned_files` at all;
//     it uses `changed_files_total` (total size of the diff) together
//     with `first_3000_confirmed`.
//   * `diff.algorithm` — "two-dot" for push, "three-dot" for
//     pull_request / merge_group (§4.3). The schema validates that the
//     algorithm matches the event (validate.ts, `inconsistent_value`);
//     the trigger decision itself matches patterns against the
//     caller-supplied `changed_files` regardless of the algorithm —
//     CheckPath never rebuilds the server-side diff, so the algorithm
//     cannot change which listed files match.

import type { ScenarioV1 } from "./types.js";

/** Frozen commit-skip tokens (PROJECT_BOOK §3.3), matched case-insensitively. */
export const COMMIT_SKIP_TOKENS = [
  "[skip ci]",
  "[ci skip]",
  "[no ci]",
  "[skip actions]",
  "[actions skip]",
  "skip-checks:true",
  "skip-checks: true",
] as const;

/** Result of annotating one commit message with the skip rule. */
export interface CommitSkipAnnotation {
  /** True when the message contains a skip token. */
  skipped: boolean;
  /** The token that matched (lowercase canonical form), or null. */
  token: string | null;
}

/** True when the commit message carries a GitHub commit-skip token (§3.3). */
export function hasCommitSkip(commitMessage: string | undefined | null): boolean {
  return annotateCommitSkip(commitMessage).skipped;
}

/**
 * Annotate a commit message with the commit-skip rule, naming the token
 * that matched (first token in frozen list order). The token is reported
 * in its canonical lowercase form from COMMIT_SKIP_TOKENS.
 */
export function annotateCommitSkip(
  commitMessage: string | undefined | null,
): CommitSkipAnnotation {
  const message = (commitMessage ?? "").toLowerCase();
  for (const token of COMMIT_SKIP_TOKENS) {
    if (message.includes(token)) {
      return { skipped: true, token };
    }
  }
  return { skipped: false, token: null };
}

/**
 * Diff-boundary annotation for one scenario (PROJECT_BOOK §4.3).
 * Annotation only: the per-workflow effect (always-run / UNKNOWN /
 * truncation) lives in the trigger evaluator, which applies the same
 * precedence. Null when no boundary applies.
 */
export type DiffBoundary =
  | "diff_timed_out"
  | "push_over_1000_commits"
  | "first_3000_unconfirmed"
  | "first_3000_truncated";

/**
 * Total changed-file count for boundary purposes: the caller-supplied
 * `changed_files_total`, falling back to the number of listed files.
 */
export function diffChangedFilesTotal(scenario: ScenarioV1): number {
  const total = scenario.diff.changed_files_total;
  return typeof total === "number" ? total : scenario.diff.changed_files.length;
}

/**
 * True when the path filter counts as triggered regardless of its
 * patterns (always-run): the diff timed out, or the event is a push
 * with more than 1,000 commits. Exactly 1,000 commits is not enough.
 */
export function isDiffAlwaysRun(scenario: ScenarioV1): boolean {
  if (scenario.diff.diff_timed_out === true) return true;
  return (
    scenario.event.name === "push" &&
    typeof scenario.diff.push_commit_count === "number" &&
    scenario.diff.push_commit_count > 1000
  );
}

/**
 * Annotate the diff boundary of a scenario, in precedence order
 * (timeout > push >1,000 commits > unconfirmed first-3000 >
 * confirmed first-3000 truncation). Returns null when no boundary
 * applies — i.e. every listed file is evaluated normally.
 */
export function annotateDiffBoundary(scenario: ScenarioV1): DiffBoundary | null {
  if (scenario.diff.diff_timed_out === true) return "diff_timed_out";
  if (
    scenario.event.name === "push" &&
    typeof scenario.diff.push_commit_count === "number" &&
    scenario.diff.push_commit_count > 1000
  ) {
    return "push_over_1000_commits";
  }
  const total = diffChangedFilesTotal(scenario);
  if (total > 3000 && scenario.diff.first_3000_confirmed !== true) {
    return "first_3000_unconfirmed";
  }
  if (total > 3000 && scenario.diff.first_3000_confirmed === true) {
    return "first_3000_truncated";
  }
  return null;
}
