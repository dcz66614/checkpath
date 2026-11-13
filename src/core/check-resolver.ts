// T008 — Required-check context resolver (formal).
//
// Formalizes the T003 PoC (PROJECT_BOOK §4.5, §4.7). The precedence
// table and every reason string are migrated verbatim from the PoC;
// formalization adds the frozen contracts, not new semantics:
//   * `CheckStatus` is imported from types.ts (single source of truth).
//     This closes T005 U-02 on the CheckStatus side: job-dag.ts no
//     longer re-exports it (see that module's header).
//   * The Oracle-compatible result shape is unchanged:
//     { context, status, provider_job_id, provider_count, reason }.
//     It is the shape the Python Reference Oracle emits
//     (oracle/checkpath_oracle/resolver.py) and the shape the
//     oracle:diff:checks script compares field-by-field.
//   * The keyed API (`resolveRequiredChecksKeyed`) is the resolver
//     side of S0 legacy item ②: a job_id is only unique inside one
//     workflow file, so providers are `KeyedJobEvaluation`s keyed by
//     (workflow_path, job_id) via `jobKey()` (JSON-encoded
//     [workflow_path, job_id], see job-dag.ts). A keyed result carries
//     `provider_workflow_path`, `provider_key` and the full
//     `provider_keys` list (all matching providers, input order), so a
//     consumer can tell WHICH workflow provided a check without
//     guessing from a bare job_id — and so two workflows declaring the
//     same job_id with the same context are still reported as one
//     AMBIGUOUS check with provider_count 2, never resolved by
//     picking the triggered one (T7-09 class: workflow-a/test
//     ELIGIBLE vs workflow-b/test SKIPPED is AMBIGUOUS, not the
//     triggered provider).
//
// Resolver precedence (frozen; identical in both APIs):
//   1. non-"github-actions" source            -> UNKNOWN (external App)
//   2. zero providers                         -> PENDING_NOT_REPORTED
//   3. more than one provider                 -> AMBIGUOUS
//   4. single provider INVALID                -> INVALID
//   5. provider's workflow trigger INVALID    -> INVALID
//   6. provider's workflow trigger UNKNOWN    -> UNKNOWN
//   7. provider's workflow not triggered      -> PENDING_NOT_REPORTED
//   8. provider SKIPPED                       -> SKIPPED_SUCCESS
//   9. provider UNKNOWN                       -> UNKNOWN
//  10. provider ELIGIBLE / CONDITIONAL_AFTER_NEEDS -> REPORTABLE_PENDING
//
// Workflow-level skip and job-level skip are deliberately different
// outcomes (PENDING_NOT_REPORTED vs SKIPPED_SUCCESS, §4.5). The
// resolver never predicts whether a Job will really succeed or fail:
// ELIGIBLE and CONDITIONAL_AFTER_NEEDS both mean REPORTABLE_PENDING
// (the check will be created; its real conclusion is unknown).
//
// Context matching is exact: a job's context is its `name` when
// declared, else its `job_id` (§4.5, `jobContext` in job-dag.ts).
// Name wins over job_id — a required check naming the job_id of a
// job that HAS a name has no provider. Matching is case-sensitive;
// no normalization, trimming or fuzzy matching is applied.

import {
  jobContext,
  jobKey,
  type JobCheckInput,
  type JobEvaluation,
  type KeyedJobEvaluation,
} from "./job-dag.js";
import type { CheckStatus } from "./types.js";

/**
 * One required-check verdict in the frozen Oracle-compatible shape
 * (§4.7; also `ReportRequiredCheckResult` in types.ts minus the
 * report-only `provider_workflow_path` field, which the keyed API
 * supplies separately).
 */
export interface RequiredCheckResult {
  context: string;
  status: CheckStatus;
  provider_job_id: string | null;
  provider_count: number;
  reason: string;
}

/**
 * Per-provider trigger state. Same literal union as job-dag.ts
 * `WorkflowTriggerState`; the two names are kept because e2e.ts
 * imports this one and job-dag.ts owns the other. "unknown"/"invalid"
 * mean the provider's workflow trigger could not be decided
 * (fail-closed); they surface as UNKNOWN/INVALID at check level
 * instead of PENDING_NOT_REPORTED.
 */
export type ProviderTriggerState =
  | "triggered"
  | "not_triggered"
  | "unknown"
  | "invalid";

export interface JobWithTrigger {
  job: JobEvaluation;
  trigger: ProviderTriggerState;
}

/** A keyed provider: its job evaluation plus its workflow's trigger outcome. */
export interface KeyedJobWithTrigger {
  job: KeyedJobEvaluation;
  trigger: ProviderTriggerState;
}

/**
 * A required-check verdict with its provider's (workflow, job_id)
 * identity. `provider_keys` lists every matching provider's key, in
 * input order — one entry for a single provider, all of them for
 * AMBIGUOUS, none when there is no provider or the source is external.
 * `toBaseCheckResult` projects this back to the Oracle-compatible
 * shape by dropping the three key fields.
 */
export interface KeyedRequiredCheckResult extends RequiredCheckResult {
  provider_workflow_path: string | null;
  provider_key: string | null;
  provider_keys: string[];
}

/** Project a keyed result back to the frozen Oracle-compatible shape. */
export function toBaseCheckResult(
  result: KeyedRequiredCheckResult,
): RequiredCheckResult {
  return {
    context: result.context,
    status: result.status,
    provider_job_id: result.provider_job_id,
    provider_count: result.provider_count,
    reason: result.reason,
  };
}

/**
 * Required-check resolution with per-provider trigger state.
 * Precedence: see the header. This is the T003/T004 algorithm
 * migrated verbatim; the only change from the PoC is that the status
 * type now comes from types.ts.
 */
export function resolveRequiredChecksPerProvider(
  requiredChecks: JobCheckInput["required_checks"],
  jobsWithTrigger: JobWithTrigger[],
): RequiredCheckResult[] {
  return requiredChecks.map((check) => {
    if (
      check.source !== null &&
      check.source !== undefined &&
      check.source !== "github-actions"
    ) {
      return {
        context: check.context,
        status: "UNKNOWN",
        provider_job_id: null,
        provider_count: 0,
        reason: "external_source",
      };
    }

    const providers = jobsWithTrigger.filter(
      ({ job }) => job.context === check.context,
    );
    if (providers.length === 0) {
      return {
        context: check.context,
        status: "PENDING_NOT_REPORTED",
        provider_job_id: null,
        provider_count: 0,
        reason: "no_provider",
      };
    }
    if (providers.length > 1) {
      return {
        context: check.context,
        status: "AMBIGUOUS",
        provider_job_id: null,
        provider_count: providers.length,
        reason: "duplicate_context",
      };
    }

    const { job: provider, trigger } = providers[0];
    if (provider.status === "INVALID") {
      return {
        context: check.context,
        status: "INVALID",
        provider_job_id: provider.job_id,
        provider_count: 1,
        reason: "provider_invalid",
      };
    }
    if (trigger === "invalid") {
      return {
        context: check.context,
        status: "INVALID",
        provider_job_id: provider.job_id,
        provider_count: 1,
        reason: "trigger_invalid",
      };
    }
    if (trigger === "unknown") {
      return {
        context: check.context,
        status: "UNKNOWN",
        provider_job_id: provider.job_id,
        provider_count: 1,
        reason: "trigger_unknown",
      };
    }
    if (trigger === "not_triggered") {
      return {
        context: check.context,
        status: "PENDING_NOT_REPORTED",
        provider_job_id: provider.job_id,
        provider_count: 1,
        reason: "workflow_not_triggered",
      };
    }
    if (provider.status === "SKIPPED") {
      return {
        context: check.context,
        status: "SKIPPED_SUCCESS",
        provider_job_id: provider.job_id,
        provider_count: 1,
        reason: "provider_skipped",
      };
    }
    if (provider.status === "UNKNOWN") {
      return {
        context: check.context,
        status: "UNKNOWN",
        provider_job_id: provider.job_id,
        provider_count: 1,
        reason: "provider_unknown",
      };
    }
    return {
      context: check.context,
      status: "REPORTABLE_PENDING",
      provider_job_id: provider.job_id,
      provider_count: 1,
      reason: "provider_reportable",
    };
  });
}

/**
 * Keyed required-check resolution (S0 legacy item ②, resolver side).
 * Same precedence table as `resolveRequiredChecksPerProvider`, but
 * providers are `KeyedJobEvaluation`s, so each verdict also names the
 * providing workflow and the canonical (workflow, job_id) key.
 * Two providers that share a context are AMBIGUOUS even when their
 * triggers differ — the key distinguishes them for reporting
 * (`provider_keys`), it never silently picks one.
 */
export function resolveRequiredChecksKeyed(
  requiredChecks: JobCheckInput["required_checks"],
  jobsWithTrigger: KeyedJobWithTrigger[],
): KeyedRequiredCheckResult[] {
  return requiredChecks.map((check) => {
    const base = (status: CheckStatus, reason: string): KeyedRequiredCheckResult => ({
      context: check.context,
      status,
      provider_job_id: null,
      provider_count: 0,
      reason,
      provider_workflow_path: null,
      provider_key: null,
      provider_keys: [],
    });
    if (
      check.source !== null &&
      check.source !== undefined &&
      check.source !== "github-actions"
    ) {
      return base("UNKNOWN", "external_source");
    }

    const providers = jobsWithTrigger.filter(
      ({ job }) => job.context === check.context,
    );
    if (providers.length === 0) {
      return base("PENDING_NOT_REPORTED", "no_provider");
    }
    if (providers.length > 1) {
      return {
        ...base("AMBIGUOUS", "duplicate_context"),
        provider_count: providers.length,
        provider_keys: providers.map(({ job }) => job.key),
      };
    }

    const { job: provider, trigger } = providers[0];
    const single = (
      status: CheckStatus,
      reason: string,
    ): KeyedRequiredCheckResult => ({
      context: check.context,
      status,
      provider_job_id: provider.job_id,
      provider_count: 1,
      reason,
      provider_workflow_path: provider.workflow_path,
      provider_key: provider.key,
      provider_keys: [provider.key],
    });
    if (provider.status === "INVALID") {
      return single("INVALID", "provider_invalid");
    }
    if (trigger === "invalid") {
      return single("INVALID", "trigger_invalid");
    }
    if (trigger === "unknown") {
      return single("UNKNOWN", "trigger_unknown");
    }
    if (trigger === "not_triggered") {
      return single("PENDING_NOT_REPORTED", "workflow_not_triggered");
    }
    if (provider.status === "SKIPPED") {
      return single("SKIPPED_SUCCESS", "provider_skipped");
    }
    if (provider.status === "UNKNOWN") {
      return single("UNKNOWN", "provider_unknown");
    }
    return single("REPORTABLE_PENDING", "provider_reportable");
  });
}

/**
 * Convenience: resolve keyed checks from plain (unkeyed) job
 * evaluations by keying each job under one workflow path. The key is
 * derived with `jobKey()` so callers that only have one workflow do
 * not hand-roll the encoding.
 */
export function resolveRequiredChecksKeyedForWorkflow(
  requiredChecks: JobCheckInput["required_checks"],
  workflowPath: string,
  jobsWithTrigger: JobWithTrigger[],
): KeyedRequiredCheckResult[] {
  return resolveRequiredChecksKeyed(
    requiredChecks,
    jobsWithTrigger.map(({ job, trigger }) => ({
      job: {
        ...job,
        workflow_path: workflowPath,
        key: jobKey({ workflow_path: workflowPath, job_id: job.job_id }),
      },
      trigger,
    })),
  );
}

export function resolveRequiredChecks(
  input: JobCheckInput,
  jobEvaluations: JobEvaluation[],
): RequiredCheckResult[] {
  // T003 single-boolean input, delegated to the per-provider resolver:
  // every provider shares the one workflow's trigger outcome.
  return resolveRequiredChecksPerProvider(
    input.required_checks,
    jobEvaluations.map((job) => ({
      job,
      trigger: input.workflow_triggered
        ? ("triggered" as const)
        : ("not_triggered" as const),
    })),
  );
}

/** Convenience helper for tests: job context of a raw job input. */
export { jobContext };
