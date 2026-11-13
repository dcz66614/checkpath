// T005 — Canonical IR, schema and validation contracts.
//
// Formalizes the four frozen schemas of PROJECT_BOOK §6 and the hash
// contract of IMPLEMENTATION_PLAN §8:
//
//   WorkflowIR        checkpath.workflow-ir/v1
//   ScenarioV1        checkpath.scenario/v1
//   RequiredChecksV1  checkpath.required-checks/v1
//   ReportV1          checkpath.report/v1
//
// This file is types + version constants only; the validators live in
// src/core/validate.ts. The PoC modules were re-based onto these
// contracts by the tasks that own them (T006–T008, T010); this file is
// the single definition of the shared verdict types — job-dag.ts,
// check-resolver.ts and e2e.ts all import them from here, and no
// module keeps a local copy.
//
// Unknown-field policy (fail-closed, per T005 acceptance): every field
// in these four schemas can affect a trigger / job / check verdict, so
// validate.ts REJECTS any field outside the lists below with
// `unknown_field` instead of silently dropping it. There is no
// allow-list of ignorable fields.
//
// Normalization rules applied by validate.ts (documented here so the
// contract and the validator cannot drift apart):
//   * Optional scalar fields absent from the input are normalized to
//     `null` in the validated value; optional arrays absent are
//     normalized to `null` (WorkflowIR event filters, ScenarioV1 event
//     branches) or `[]` (WorkflowIR job `needs`).
//   * A single string where a string list is accepted (workflow `on`
//     filter values) is normalized to a one-element list, matching the
//     S0 parser (`stringOrList` in workflow-parser.ts).
//   * A required-check entry without `source` defaults to
//     `"github-actions"`; a job `if` that is empty/whitespace-only is
//     normalized to `null` (no condition), matching the S0 job evaluator.
//   * A scenario without `commit_message` is normalized to `""`
//     (no commit message, hence no commit skip).

export const WORKFLOW_IR_SCHEMA = "checkpath.workflow-ir/v1" as const;
export const SCENARIO_SCHEMA = "checkpath.scenario/v1" as const;
export const REQUIRED_CHECKS_SCHEMA = "checkpath.required-checks/v1" as const;
export const REPORT_SCHEMA = "checkpath.report/v1" as const;

export const SUPPORTED_EVENTS = ["push", "pull_request", "merge_group"] as const;
export type EventName = (typeof SUPPORTED_EVENTS)[number];

/** Diff algorithm marker (§4.3): push uses two-dot, pull_request / merge_group use three-dot. */
export type DiffAlgorithm = "two-dot" | "three-dot";

/** Job verdicts (§4.4). Single definition: job-dag.ts was re-based onto this type in T007 (it re-exports it so existing importers keep compiling). */
export type JobStatus =
  | "ELIGIBLE"
  | "SKIPPED"
  | "CONDITIONAL_AFTER_NEEDS"
  | "UNKNOWN"
  | "INVALID";

/** Required-check verdicts (§4.7). Single definition: check-resolver.ts was re-based onto this type in T008 (the local copy in job-dag.ts was removed then). */
export type CheckStatus =
  | "REPORTABLE_PENDING"
  | "SKIPPED_SUCCESS"
  | "PENDING_NOT_REPORTED"
  | "AMBIGUOUS"
  | "UNKNOWN"
  | "INVALID";

/** Trigger IR status (§4.2, T002 PoC): structural validity of one workflow's `on:` config. */
export type TriggerStatus = "VALID" | "INVALID" | "UNKNOWN";

/** Witness failure kinds (§4.6): one kind per first-blocking-condition family. */
export const WITNESS_KINDS = [
  "merge_group_missing",
  // ADR T011/T009-U01: generic "event trigger missing" kind, added
  // 2026-11-08. merge_group_missing now covers ONLY merge_group
  // event/activity mismatches; any other event_mismatch /
  // activity_type_mismatch uses event_trigger_missing (§4.6).
  "event_trigger_missing",
  "path_filter",
  "branch_filter",
  "commit_skip",
  "missing_context",
  "duplicate_context",
  "unsupported_feature",
  "invalid_input",
] as const;
export type WitnessKind = (typeof WITNESS_KINDS)[number];

// ---------------------------------------------------------------------------
// WorkflowIR — checkpath.workflow-ir/v1
// ---------------------------------------------------------------------------

/** One event entry of a workflow's normalized `on:` config (§3.3, §4.2). */
export interface WorkflowIREvent {
  name: EventName;
  /** Activity types (`types:`); null means "any activity type". */
  types: string[] | null;
  branches: string[] | null;
  branches_ignore: string[] | null;
  paths: string[] | null;
  paths_ignore: string[] | null;
}

/** One job of a workflow, in file order. `context` is derived: `name ?? id` (§4.5). */
export interface WorkflowIRJob {
  id: string;
  name: string | null;
  needs: string[];
  /** Raw `if` expression, or null for "no condition". */
  if: string | null;
  /** Required-check context: `name` when declared, else `job_id`. */
  context: string;
  /**
   * ADR T011/ADR-04: "reusable_workflow" when the job has `uses`
   * (reusable-workflow call), "matrix" when it has a
   * `strategy.matrix`, else null. The job has no single reportable
   * check context in those cases (PROJECT_BOOK §3.4) and evaluates
   * to UNKNOWN whenever it would otherwise run. `uses` wins over
   * `matrix` when both are present. Optional so hand-built IR
   * literals stay valid; the validator and buildWorkflowIR always
   * emit it (null for an ordinary job).
   */
  unsupported_job?: "reusable_workflow" | "matrix" | null;
}

/**
 * Canonical workflow IR: one local workflow file, fully normalized.
 * `source_path` is a workspace-relative path (never absolute, §6.3:
 * reports must not contain absolute workspace paths).
 */
export interface WorkflowIR {
  schema: typeof WORKFLOW_IR_SCHEMA;
  source_path: string;
  name: string | null;
  /** At least one event entry. */
  on: WorkflowIREvent[];
  /** At least one job. */
  jobs: WorkflowIRJob[];
}

// ---------------------------------------------------------------------------
// ScenarioV1 — checkpath.scenario/v1 (§6.1)
// ---------------------------------------------------------------------------

/**
 * Synthetic event. Which branch field is meaningful depends on the event
 * (§4.2): pull_request -> base_branch, push -> branch, merge_group ->
 * target_branch. The other branch fields are null. `action` is null for
 * push (push has no activity type); `commit_message` defaults to "".
 */
export interface ScenarioEvent {
  name: EventName;
  action: string | null;
  branch: string | null;
  base_branch: string | null;
  head_branch: string | null;
  target_branch: string | null;
  ref: string | null;
  commit_message: string;
}

/**
 * Caller-supplied diff facts (§4.3). CheckPath never rebuilds the
 * GitHub server-side diff: `changed_files` is the caller-provided list
 * (order preserved — the 3,000-file truncation semantic depends on it),
 * and the boundary metadata must be supplied as facts. `returned_files`
 * is NOT required to equal `changed_files.length`: the S0 CP-L fixture
 * (E2E-16) lists 2 files while `returned_files` is 3000, so the schema
 * only constrains the counts for non-negativity and for
 * `returned_files <= changed_files_total` when both are known.
 */
export interface ScenarioDiff {
  algorithm: DiffAlgorithm;
  changed_files: string[];
  changed_files_total: number | null;
  returned_files: number | null;
  complete: boolean | null;
  first_3000_confirmed: boolean | null;
  diff_timed_out: boolean | null;
  push_commit_count: number | null;
}

export interface ScenarioV1 {
  schema: typeof SCENARIO_SCHEMA;
  scenario_id: string;
  event: ScenarioEvent;
  diff: ScenarioDiff;
}

// ---------------------------------------------------------------------------
// RequiredChecksV1 — checkpath.required-checks/v1 (§6.2)
// ---------------------------------------------------------------------------

/**
 * One required check. `source` defaults to `"github-actions"` when
 * absent. Any other source is structurally valid here — the resolver
 * (§4.5) maps it to UNKNOWN at evaluation time, it is NOT a schema
 * error, because the manifest may legitimately name an external App.
 * Duplicate contexts are admitted (ADR FIX-P1-01/01): each manifest
 * entry resolves independently, one result row per entry (T008
 * T8-05/T8-10, golden G-57); `duplicate_context` / AMBIGUOUS is the
 * resolver verdict for two PROVIDERS sharing one context, not for
 * two manifest entries sharing one.
 */
export interface RequiredCheckEntry {
  context: string;
  source: string;
}

export interface RequiredChecksV1 {
  schema: typeof REQUIRED_CHECKS_SCHEMA;
  required_checks: RequiredCheckEntry[];
}

// ---------------------------------------------------------------------------
// ReportV1 — checkpath.report/v1 (§6.3)
// ---------------------------------------------------------------------------

export interface ReportEventEvaluation {
  workflow_path: string;
  event_name: EventName;
  action: string | null;
  activity_type_match: boolean | null;
  branch_match: boolean | null;
  path_match: boolean | null;
  commit_skip: boolean;
  triggered: boolean | null;
  reason: string;
}

export interface ReportWorkflowEvaluation {
  workflow_path: string;
  status: TriggerStatus;
  triggered: boolean | null;
  reason: string;
}

export interface ReportJobEvaluation {
  workflow_path: string;
  job_id: string;
  context: string;
  status: JobStatus;
  reason: string;
}

export interface ReportRequiredCheckResult {
  context: string;
  status: CheckStatus;
  provider_job_id: string | null;
  provider_workflow_path: string | null;
  provider_count: number;
  reason: string;
}

/**
 * Minimal failure witness (§4.6). `scenario` is the reduced synthetic
 * scenario that reproduces the failure, or null when the witness is not
 * scenario-shaped (e.g. duplicate_context, which is witnessed by the
 * conflicting providers, not by a scenario).
 */
export interface ReportWitness {
  id: string;
  kind: WitnessKind;
  check_context: string | null;
  first_blocking_condition: string;
  scenario: ScenarioV1 | null;
  note: string;
}

/**
 * Formal report (§6.3). All four hashes are lowercase 64-hex SHA-256.
 * `report_sha256` is format-checked only by validate.ts; recomputing it
 * (canonical report minus its own hash field) belongs to the report
 * builder (T010) and the freeze step (T014), not to schema validation.
 */
export interface ReportV1 {
  schema: typeof REPORT_SCHEMA;
  tool_version: string;
  scenario_id: string;
  input_sha256: string;
  workflow_set_sha256: string;
  required_checks_sha256: string;
  report_sha256: string;
  event_evaluations: ReportEventEvaluation[];
  workflow_evaluations: ReportWorkflowEvaluation[];
  job_evaluations: ReportJobEvaluation[];
  required_check_results: ReportRequiredCheckResult[];
  witnesses: ReportWitness[];
  unsupported_features: string[];
}

// ---------------------------------------------------------------------------
// Validation result model (validate.ts)
// ---------------------------------------------------------------------------

/** Stable validation error codes (T005 acceptance: every failure class maps to one code). */
export const VALIDATION_ERROR_CODES = [
  "missing_field",
  "wrong_type",
  "invalid_schema_version",
  "invalid_value",
  "unknown_field",
  "duplicate_value",
  "unknown_reference",
  "inconsistent_value",
  "invalid_json",
] as const;
export type ValidationErrorCode = (typeof VALIDATION_ERROR_CODES)[number];

export interface ValidationIssue {
  /** Stable machine-readable code (see VALIDATION_ERROR_CODES). */
  code: ValidationErrorCode;
  /** JSON path of the offending value, e.g. `jobs[1].needs[0]`; `$` is the document root. */
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T; issues: [] }
  | { ok: false; value: null; issues: ValidationIssue[] };
