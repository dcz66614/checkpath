// T010 — ReportV1 builder (PROJECT_BOOK §6.3, IMPLEMENTATION_PLAN §8).
//
// Composes the formal pipeline — buildWorkflowIR + trigger evaluation
// + evaluateJobsForTrigger + resolveRequiredChecksKeyed (exported as
// `runFormalPipeline` from witness-reducer.ts) + buildWitnesses — into
// the frozen `checkpath.report/v1` shape. This module contains NO
// evaluation logic of its own: it only projects the pipeline output
// into report rows and computes the §8 hashes. It never changes a
// verdict, a reason string, or a witness.
//
// Hash contract (IMPLEMENTATION_PLAN §8), all SHA-256 over canonical
// JSON (canonical-json.ts), workflows sorted by path:
//   * workflow_set_sha256    = sha256Canonical([{path, yaml}, ...])
//   * required_checks_sha256 = sha256Canonical(validated RequiredChecksV1)
//   * input_sha256           = sha256Canonical({required_checks, scenario,
//                              workflows: [{path, yaml}, ...]})
//     (same input object the S0 e2e pipeline hashes, but with the
//     VALIDATED scenario / required-checks objects instead of the raw
//     ones, so the hash is a function of the normalized input the
//     report was actually built from; recompute by parsing + validating
//     the same files, then hashing — see `verifyReportHashes` and the
//     T010 report for the exact procedure)
//   * report_sha256          = sha256Canonical(report WITHOUT the
//                              `report_sha256` field itself)
//     (T005 U-04: this is the recompute-and-verify step the schema
//     validator deliberately does not do; `verifyReportHash` performs
//     it and the CLI / tests assert it on every built report.)
//
// T006 U-02 decision (diff-boundary wording) — NO implementation was
// changed to reach it, so no ADR is needed; the decision is recorded
// here and in evidence/tests/T010_REPORT.md:
//   * The Python Oracle's e2e `diff_boundary` field reports null for a
//     CONFIRMED first-3000 truncation; the formal layer's
//     `annotateDiffBoundary` names that case `first_3000_truncated`.
//   * ReportV1 (§6.3, frozen) has NO `diff_boundary` field, so T010
//     does NOT add one and does NOT copy either value into the JSON:
//     the truncation effect is already encoded in the report's
//     `event_evaluations` (path_match / reason) for every workflow.
//   * The HTML report shows the formal-layer annotation
//     (`annotateDiffBoundary`, including `first_3000_truncated`) as a
//     PRESENTATION-ONLY label on the Event Path section, explicitly
//     marked as a report-layer annotation, not a ReportV1 field and
//     not part of any Oracle comparison. The Oracle shape is therefore
//     untouched and the two wordings cannot be confused in JSON.
//   * `complete: false` (T006 U-03) is likewise untouched: it does not
//     participate in any verdict here, exactly as in T006.
//
// T009-U03 (parallel recommendations): witness suggestions are NOT
// merged into `ReportWitness` objects. They travel as the parallel
// `WitnessRecommendation[]` list (witness-reducer.ts), joined to a
// witness by `witness_id`; the JSON file written by the CLI embeds
// them under the top-level key `recommendations` NEXT TO the frozen
// ReportV1 object (the file is a small envelope, not a ReportV1
// document itself — see json.ts), so `validateReport` still sees the
// exact frozen shape.
//
// Exit codes (PROJECT_BOOK §4.7), implemented by `exitCodeForReport`:
//   * any INVALID check            -> 3
//   * any PENDING_NOT_REPORTED / AMBIGUOUS / UNKNOWN -> 2
//   * any SKIPPED_SUCCESS and --strict-skipped      -> 2
//   * otherwise (only REPORTABLE_PENDING /
//     SKIPPED_SUCCESS without --strict-skipped)     -> 0
// Input/usage errors (missing file, unparseable or invalid scenario /
// required-checks manifest) are NOT report statuses: the CLI exits 3
// for them without writing a report.

import { canonicalJson } from "../core/canonical-json.js";
import { sha256Canonical } from "../core/sha256.js";
import { annotateDiffBoundary, type DiffBoundary } from "../core/skip-annotation.js";
import { validateReport } from "../core/validate.js";
import {
  buildWitnesses,
  runFormalPipeline,
  type PipelineEvaluation,
  type WitnessBuildInput,
  type WitnessRecommendation,
} from "../core/witness-reducer.js";
import type {
  CheckStatus,
  ReportV1,
  RequiredCheckEntry,
  ScenarioV1,
} from "../core/types.js";

/** Report `tool_version` string (matches the validation test fixture). */
export const TOOL_VERSION = "checkpath 0.1.0" as const;

/** One workflow file as the report builder consumes it. */
export interface ReportWorkflowInput {
  /** Workspace-relative path, e.g. `.github/workflows/ci.yml`. */
  path: string;
  yamlText: string;
}

export interface ReportBuildInput {
  /** Case id, carried into witness building (also the report's scenario id source). */
  fixtureId: string;
  workflows: ReportWorkflowInput[];
  scenario: ScenarioV1;
  requiredChecks: RequiredCheckEntry[];
}

/** Everything the CLI / worker / HTML renderer need for one case. */
export interface BuiltReport {
  report: ReportV1;
  recommendations: WitnessRecommendation[];
  /** Formal-layer diff-boundary annotation (presentation only; NOT a ReportV1 field). */
  diffBoundary: DiffBoundary | null;
  /** The formal pipeline evaluation behind the report rows. */
  evaluation: PipelineEvaluation;
}

export interface ReportHashes {
  input_sha256: string;
  workflow_set_sha256: string;
  required_checks_sha256: string;
  report_sha256: string;
}

/** Workflows sorted by path (canonical order for hashing). */
export function sortedWorkflows(
  workflows: readonly ReportWorkflowInput[],
): { path: string; yaml: string }[] {
  return [...workflows]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((w) => ({ path: w.path, yaml: w.yamlText }));
}

/** The three input hashes of §8 (everything except report_sha256). */
export function computeInputHashes(input: ReportBuildInput): Omit<ReportHashes, "report_sha256"> {
  const workflows = sortedWorkflows(input.workflows);
  return {
    input_sha256: sha256Canonical({
      required_checks: { required_checks: input.requiredChecks, schema: "checkpath.required-checks/v1" },
      scenario: input.scenario,
      workflows,
    }),
    workflow_set_sha256: sha256Canonical(workflows),
    required_checks_sha256: sha256Canonical({
      required_checks: input.requiredChecks,
      schema: "checkpath.required-checks/v1",
    }),
  };
}

/**
 * `report_sha256`: canonical JSON of the report with the
 * `report_sha256` field itself REMOVED (IMPLEMENTATION_PLAN §8).
 * The field is omitted, not blanked: a blanked value would hash a
 * different document than the one the contract describes.
 */
export function computeReportHash(report: ReportV1): string {
  const { report_sha256: _removed, ...withoutHash } = report;
  void _removed;
  return sha256Canonical(withoutHash);
}

/**
 * T005 U-04 — recompute-and-verify: strip the report's own hash
 * field, re-hash the canonical remainder, and compare with the
 * recorded value. Returns true only on an exact match.
 */
export function verifyReportHash(report: ReportV1): boolean {
  return computeReportHash(report) === report.report_sha256;
}

/**
 * Recompute all four hashes from the build input + the report and
 * compare with the recorded values. `input_sha256`,
 * `workflow_set_sha256` and `required_checks_sha256` are recomputed
 * from the (validated) input; `report_sha256` via verifyReportHash.
 */
export function verifyReportHashes(
  input: ReportBuildInput,
  report: ReportV1,
): { input: boolean; workflowSet: boolean; requiredChecks: boolean; report: boolean } {
  const recomputed = computeInputHashes(input);
  return {
    input: recomputed.input_sha256 === report.input_sha256,
    workflowSet: recomputed.workflow_set_sha256 === report.workflow_set_sha256,
    requiredChecks: recomputed.required_checks_sha256 === report.required_checks_sha256,
    report: verifyReportHash(report),
  };
}

/** CLI exit code for a report (PROJECT_BOOK §4.7). */
export function exitCodeForReport(report: ReportV1, strictSkipped = false): number {
  let worst = 0;
  for (const row of report.required_check_results) {
    const code = exitCodeForStatus(row.status, strictSkipped);
    if (code > worst) worst = code;
  }
  return worst;
}

/** CLI exit code for one required-check status (PROJECT_BOOK §4.7). */
export function exitCodeForStatus(status: CheckStatus, strictSkipped = false): number {
  switch (status) {
    case "INVALID":
      return 3;
    case "PENDING_NOT_REPORTED":
    case "AMBIGUOUS":
    case "UNKNOWN":
      return 2;
    case "SKIPPED_SUCCESS":
      return strictSkipped ? 2 : 0;
    case "REPORTABLE_PENDING":
      return 0;
  }
}

/** Count required-check results by status (deterministic key order). */
export function countCheckStatuses(report: ReportV1): Record<CheckStatus, number> {
  const counts: Record<CheckStatus, number> = {
    REPORTABLE_PENDING: 0,
    SKIPPED_SUCCESS: 0,
    PENDING_NOT_REPORTED: 0,
    AMBIGUOUS: 0,
    UNKNOWN: 0,
    INVALID: 0,
  };
  for (const row of report.required_check_results) {
    counts[row.status] += 1;
  }
  return counts;
}

/**
 * Build a ReportV1 (+ parallel recommendations) from one case.
 * Pure: no file reads, no dates, no randomness — the same input
 * always yields the same report (byte-identical canonical JSON).
 */
export function buildReport(input: ReportBuildInput): BuiltReport {
  const witnessInput: WitnessBuildInput = {
    fixtureId: input.fixtureId,
    workflows: input.workflows.map((w) => ({ path: w.path, yamlText: w.yamlText })),
    scenario: input.scenario,
    requiredChecks: input.requiredChecks,
  };
  const evaluation = runFormalPipeline(witnessInput);
  const { witnesses, recommendations } = buildWitnesses(witnessInput);

  // Unsupported features, in deterministic order (mirrors e2e.ts):
  // trigger entries (workflow order), then unsupported `if` jobs,
  // then external check sources.
  const unsupported: string[] = [];
  const pushUnique = (item: string): void => {
    if (!unsupported.includes(item)) unsupported.push(item);
  };
  for (const wf of evaluation.perWorkflow) {
    for (const item of wf.triggerEvaluation.unsupported) pushUnique(item);
  }
  for (const job of evaluation.providers) {
    if (job.job.reason === "unsupported_if") {
      pushUnique(`unsupported_if:${job.job.job_id}`);
    }
  }
  for (const check of evaluation.keyed) {
    if (check.reason === "external_source") {
      pushUnique(`external_source:${check.context}`);
    }
  }

  const hashes = computeInputHashes(input);
  const reportWithoutHash: Omit<ReportV1, "report_sha256"> = {
    schema: "checkpath.report/v1",
    tool_version: TOOL_VERSION,
    scenario_id: input.scenario.scenario_id,
    input_sha256: hashes.input_sha256,
    workflow_set_sha256: hashes.workflow_set_sha256,
    required_checks_sha256: hashes.required_checks_sha256,
    event_evaluations: evaluation.perWorkflow.map((wf) => ({
      workflow_path: wf.path,
      event_name: input.scenario.event.name,
      action: input.scenario.event.action,
      activity_type_match: wf.triggerEvaluation.activity_type_match,
      branch_match: wf.triggerEvaluation.branch_match,
      path_match: wf.triggerEvaluation.path_match,
      commit_skip: wf.triggerEvaluation.commit_skip,
      triggered: wf.triggerEvaluation.triggered,
      reason: wf.triggerEvaluation.reason,
    })),
    workflow_evaluations: evaluation.perWorkflow.map((wf) => ({
      workflow_path: wf.path,
      status: wf.build.status,
      triggered: wf.triggerEvaluation.triggered,
      reason: wf.triggerEvaluation.reason,
    })),
    job_evaluations: evaluation.providers.map(({ job }) => ({
      workflow_path: job.workflow_path,
      job_id: job.job_id,
      context: job.context,
      status: job.status,
      reason: job.reason,
    })),
    required_check_results: evaluation.keyed.map((row) => ({
      context: row.context,
      status: row.status,
      provider_job_id: row.provider_job_id,
      provider_workflow_path: row.provider_workflow_path,
      provider_count: row.provider_count,
      reason: row.reason,
    })),
    witnesses,
    unsupported_features: unsupported,
  };
  const report: ReportV1 = {
    ...reportWithoutHash,
    report_sha256: sha256Canonical(reportWithoutHash),
  };

  // The builder must never emit a report that fails its own frozen
  // schema validation; a failure here is a builder bug, not an input
  // problem, so it throws instead of writing a bad report.
  const validation = validateReport(report);
  if (!validation.ok) {
    throw new Error(
      `built report failed validateReport: ${validation.issues
        .map((i) => `${i.path} ${i.code} ${i.message}`)
        .join("; ")}`,
    );
  }
  if (!verifyReportHash(report)) {
    throw new Error("built report failed report_sha256 recomputation (T005 U-04)");
  }

  return {
    report,
    recommendations,
    diffBoundary: annotateDiffBoundary(input.scenario),
    evaluation,
  };
}

/** Canonical JSON text of a value (no trailing newline). */
export function canonicalReportJson(value: unknown): string {
  return canonicalJson(value);
}
