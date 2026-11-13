// T009 — Minimal failure witness reducer + recommendation rules (formal).
//
// For every required check that does NOT report cleanly
// (PENDING_NOT_REPORTED, AMBIGUOUS, UNKNOWN, INVALID), build one
// deterministic minimal failure witness (PROJECT_BOOK §4.6):
//   * `kind` — one of the nine frozen WitnessKinds (types.ts), derived
//     from the resolver reason + the provider workflow's trigger reason
//     + the provider job's reason, in the fixed precedence below;
//   * `first_blocking_condition` — the exact reason code that blocked
//     the check (trigger reason for workflow_not_triggered, resolver
//     reason otherwise), never a paraphrase;
//   * `scenario` — the input scenario reduced by fixed-order
//     delta-debugging (see below), which re-runs through the formal
//     pipeline and reproduces the same (context, status, reason,
//     kind, first_blocking_condition);
//   * `note` — one concrete sentence naming the workflow path, job,
//     context, branch value, patterns, skip token, unsupported reason
//     or invalid reason that actually fired;
//   * one recommendation (recommendations.ts) citing exactly the rule
//     whose condition fired.
//
// This module NEVER changes a verdict: it only reads the formal
// pipeline (buildWorkflowIR + trigger evaluation +
// evaluateJobsForTrigger + resolveRequiredChecksKeyed) and re-runs it
// on reduced inputs. REPORTABLE_PENDING and SKIPPED_SUCCESS checks
// get no witness: the former reports, the latter is a warning (the
// check does report as success) and no WitnessKind covers a skipped
// job. The reducer is a pure function of its input: no dates, no
// randomness, no environment reads, so the same input always yields
// the same witnesses (verified by the 100-run determinism test).
//
// Kind precedence (first match wins; resolver reason first, then the
// provider trigger / job reason):
//   duplicate_context            -> duplicate_context
//   no_provider                  -> missing_context
//   external_source              -> unsupported_feature
//   provider_invalid /
//   trigger_invalid              -> invalid_input
//   trigger_unknown /
//   provider_unknown             -> unsupported_feature
//   workflow_not_triggered:
//     event_mismatch /
//     activity_type_mismatch, scenario event merge_group
//                              -> merge_group_missing
//     event_mismatch /
//     activity_type_mismatch, any other scenario event
//                              -> event_trigger_missing (ADR T011/T009-U01)
//     branch_mismatch            -> branch_filter
//     path_mismatch              -> path_filter
//     commit_skip                -> commit_skip
//     anything else (defensive)  -> unsupported_feature / invalid_input
//       by the trigger reason ("unknown" -> unsupported_feature,
//       "invalid" -> invalid_input, otherwise unsupported_feature)
//
// T009-U01 (CLOSED by ADR T011/T009-U01, 2026-11-08): the frozen
// WITNESS_KINDS gained a dedicated "event_trigger_missing" kind.
// merge_group_missing now covers ONLY merge_group event/activity
// mismatches; a non-merge_group event_mismatch or
// activity_type_mismatch (e.g. a pull_request types mismatch) is
// classified event_trigger_missing, with rule R-EV-01. The exact
// event and action are still named in first_blocking_condition,
// note and recommendation, as before.
//
// Reduction order (fixed; every step re-runs the pipeline and keeps
// the change only if the same (context, status, reason) is
// reproduced):
//   1. manifest -> the failing check alone;
//   2. workflows -> drop each non-provider workflow in file order
//      (skipped for missing_context: the scanned job-context list in
//      the note is evidence from the full input, so no workflow may
//      be dropped there; duplicate_context keeps all providers
//      automatically because dropping one breaks the verdict);
//   3. changed_files -> for path_filter keep the first listed file
//      whose path_file_result is false (the informative minimal
//      witness; an empty list would also reproduce but shows no
//      failing file), otherwise greedy single-file removal in listed
//      order to a fixpoint. Every step is verified against the full
//      reproduction predicate (same status, reason, kind AND first
//      blocking condition), so a step that changes the blocking
//      condition — e.g. deleting the one path-matching file turns a
//      commit_skip block into a path_mismatch block — is rejected.
//   4. commit_message -> for commit_skip keep just the matched skip
//      token, otherwise try the empty message.
// Boundary metadata (changed_files_total, first_3000_confirmed,
// diff_timed_out, push_commit_count, ...) is preserved as supplied
// facts; only the changed-file list and the commit message shrink.
// If the final reduced input ever failed to reproduce (it cannot:
// every step was verified), the reducer falls back to the original
// scenario rather than emitting an unreproducible witness.
//
// The Python Reference Oracle mirrors this module in
// oracle/checkpath_oracle/witness.py (it only calls the Oracle's
// existing evaluate_e2e_fixture; no Oracle core algorithm changed).
// The witness diff (`npm run oracle:diff:witness`) compares the
// witnesses and recommendations field-by-field.

import { buildWorkflowIR, type WorkflowIRBuildResult } from "./workflow-ir.js";
import {
  evaluateTriggerEvents,
  evaluateWorkflowTrigger,
  type TriggerEvaluation,
} from "./event-evaluator.js";
import {
  evaluateJobsForTrigger,
  type KeyedJobEvaluation,
  type WorkflowTriggerState,
} from "./job-dag.js";
import {
  resolveRequiredChecksKeyed,
  type KeyedJobWithTrigger,
  type KeyedRequiredCheckResult,
} from "./check-resolver.js";
import { extractJobs } from "./e2e.js";
import { annotateCommitSkip } from "./skip-annotation.js";
import {
  formatProviders,
  formatQuotedList,
  recommendationFor,
  triggerUnknownCause,
  type RecommendationInput,
} from "./recommendations.js";
import type {
  EventName,
  ReportWitness,
  RequiredCheckEntry,
  ScenarioV1,
  WitnessKind,
  WorkflowIREvent,
  WorkflowIRJob,
} from "./types.js";

/** One workflow file as the reducer consumes it (raw YAML + path). */
export interface WitnessWorkflowInput {
  path: string;
  yamlText: string;
}

/** Reducer input: the full case, exactly as the fixtures state it. */
export interface WitnessBuildInput {
  fixtureId: string;
  workflows: WitnessWorkflowInput[];
  scenario: ScenarioV1;
  requiredChecks: RequiredCheckEntry[];
}

/** One recommendation: the rule that fired, for one witness. */
export interface WitnessRecommendation {
  witness_id: string;
  rule_id: string;
  kind: WitnessKind;
  check_context: string | null;
  recommendation: string;
}

/** Reducer output: witnesses (frozen ReportWitness shape) + rules. */
export interface WitnessBuildOutput {
  witnesses: ReportWitness[];
  recommendations: WitnessRecommendation[];
}

// ---------------------------------------------------------------------------
// Formal pipeline, run inside the reducer (read-only; never modified).
// Mirrors tests/unit/check-resolver/checks-suite.ts exactly: same
// trigger-state branching, same job extraction fallback.
// ---------------------------------------------------------------------------

export interface WorkflowEvidence {
  path: string;
  yamlText: string;
  build: WorkflowIRBuildResult;
  triggerEvaluation: TriggerEvaluation;
  triggerState: WorkflowTriggerState;
  jobs: KeyedJobEvaluation[];
  /** WorkflowIR jobs (or the extractJobs fallback when no IR exists). */
  irJobs: WorkflowIRJob[];
}

export interface PipelineEvaluation {
  perWorkflow: WorkflowEvidence[];
  keyed: KeyedRequiredCheckResult[];
  providers: KeyedJobWithTrigger[];
  scannedContexts: string[];
}

function irJobsFor(
  build: WorkflowIRBuildResult,
  yamlText: string,
): WorkflowIRJob[] {
  if (build.workflow !== null) return build.workflow.jobs;
  return extractJobs(yamlText).map((job) => ({
    id: job.id,
    name: job.name ?? null,
    needs: job.needs ?? [],
    if: job.if ?? null,
    context: job.name ?? job.id,
    unsupported_job: job.unsupported_job ?? null,
  }));
}

/**
 * Run the formal pipeline once over one case (T010 export: the report
 * builder reuses this exact evaluation instead of keeping a second
 * copy of the trigger/job/resolver branching; witness building below
 * calls the same function).
 */
export function runFormalPipeline(
  input: WitnessBuildInput,
  cache: Map<string, WorkflowIRBuildResult> = new Map(),
): PipelineEvaluation {
  const perWorkflow: WorkflowEvidence[] = [];
  const providers: KeyedJobWithTrigger[] = [];
  for (const wf of input.workflows) {
    const cacheKey = `${wf.path}\n${wf.yamlText}`;
    let built = cache.get(cacheKey);
    if (built === undefined) {
      built = buildWorkflowIR(wf.yamlText, wf.path, input.fixtureId);
      cache.set(cacheKey, built);
    }
    let triggerEvaluation: TriggerEvaluation;
    if (built.status === "INVALID" || built.status === "UNKNOWN") {
      triggerEvaluation = built.trigger.evaluation;
    } else if (built.ok && built.workflow !== null) {
      triggerEvaluation = evaluateWorkflowTrigger(built.workflow, input.scenario);
    } else {
      const events: WorkflowIREvent[] = built.trigger.events.map((e) => ({
        name: e.name as EventName,
        types: e.types,
        branches: e.branches,
        branches_ignore: e.branches_ignore,
        paths: e.paths,
        paths_ignore: e.paths_ignore,
      }));
      triggerEvaluation = evaluateTriggerEvents(
        events,
        built.status,
        built.unsupported,
        input.scenario,
      );
    }
    let triggerState: WorkflowTriggerState;
    if (built.status === "INVALID") triggerState = "invalid";
    else if (built.status === "UNKNOWN") triggerState = "unknown";
    else {
      triggerState =
        triggerEvaluation.triggered === null
          ? "unknown"
          : triggerEvaluation.triggered
            ? "triggered"
            : "not_triggered";
    }
    const irJobs = irJobsFor(built, wf.yamlText);
    const jobs = evaluateJobsForTrigger({
      workflow_path: wf.path,
      trigger: triggerState,
      scenario: input.scenario,
      jobs: irJobs,
    });
    perWorkflow.push({
      path: wf.path,
      yamlText: wf.yamlText,
      build: built,
      triggerEvaluation,
      triggerState,
      jobs,
      irJobs,
    });
    for (const job of jobs) providers.push({ job, trigger: triggerState });
  }
  const keyed = resolveRequiredChecksKeyed(input.requiredChecks, providers);
  const scannedContexts: string[] = [];
  for (const wf of perWorkflow) {
    for (const job of wf.jobs) {
      if (!scannedContexts.includes(job.context)) scannedContexts.push(job.context);
    }
  }
  return { perWorkflow, keyed, providers, scannedContexts };
}

/** Re-run the pipeline on a candidate input; true only when the check at manifest index 0 reproduces the original verdict AND the original witness kind + first blocking condition. The kind/fbc comparison is load-bearing: (status, reason) alone is too weak — e.g. deleting the one path-matching file turns a commit_skip block into a path_mismatch block while the check verdict (PENDING_NOT_REPORTED / workflow_not_triggered) stays identical, and the reduced scenario would then witness a different failure than the one it claims. */
function reproduces(
  candidate: WitnessBuildInput,
  original: KeyedRequiredCheckResult,
  originalKind: WitnessKind,
  originalFirstBlockingCondition: string,
  cache: Map<string, WorkflowIRBuildResult>,
): boolean {
  const evaluation = runFormalPipeline(candidate, cache);
  const row = evaluation.keyed[0];
  if (
    row === undefined ||
    row.status !== original.status ||
    row.reason !== original.reason
  ) {
    return false;
  }
  const evidence = buildWitnessEvidence(0, row, evaluation, candidate);
  return (
    evidence !== null &&
    evidence.kind === originalKind &&
    evidence.firstBlockingCondition === originalFirstBlockingCondition
  );
}

// ---------------------------------------------------------------------------
// Witness evidence: kind, first blocking condition, note, recommendation
// input — all derived from the frozen evaluation, never invented.
// ---------------------------------------------------------------------------

interface WitnessEvidence {
  kind: WitnessKind;
  firstBlockingCondition: string;
  note: string;
  recommendationInput: RecommendationInput;
  providerWorkflow: WorkflowEvidence | null;
  retainedFile: string | null;
}

function eventRef(scenario: ScenarioV1): string {
  return scenario.event.action !== null && scenario.event.action !== undefined
    ? `${scenario.event.name}/${scenario.event.action}`
    : scenario.event.name;
}

function buildWitnessEvidence(
  index: number,
  result: KeyedRequiredCheckResult,
  evaluation: PipelineEvaluation,
  input: WitnessBuildInput,
): WitnessEvidence | null {
  if (
    result.status === "REPORTABLE_PENDING" ||
    result.status === "SKIPPED_SUCCESS"
  ) {
    return null;
  }
  const scenario = input.scenario;
  const entry = input.requiredChecks[index];
  const context = result.context;
  const q = (value: string): string => JSON.stringify(value);

  // Context-matching providers, in input order (workflow order, then
  // job order). For AMBIGUOUS this is every provider; for a single
  // provider it is the one job that decides the check.
  const providers = evaluation.providers.filter(
    (p) => p.job.context === context,
  );
  const single = providers.length === 1 ? providers[0] : null;
  const providerWorkflow =
    single !== null
      ? (evaluation.perWorkflow.find((w) => w.path === single.job.workflow_path) ??
        null)
      : null;
  const providerJob = single?.job ?? null;
  const providerList = providers.map((p) => ({
    workflow_path: p.job.workflow_path,
    job_id: p.job.job_id,
  }));
  const triggerReason = providerWorkflow?.triggerEvaluation.reason ?? null;
  const matchedEvent =
    providerWorkflow?.build.trigger.events.find(
      (e) => e.name === scenario.event.name,
    ) ?? null;
  const triggerEval = providerWorkflow?.triggerEvaluation ?? null;
  const unknownCause =
    triggerEval === null
      ? null
      : triggerUnknownCause({
          unsupported: triggerEval.unsupported,
          activityTypeMatch: triggerEval.activity_type_match,
          branchMatch: triggerEval.branch_match,
          pathMatch: triggerEval.path_match,
          eventName: scenario.event.name,
        });
  const firstUnsupported =
    triggerEval !== null && triggerEval.unsupported.length > 0
      ? triggerEval.unsupported[0]
      : null;
  const retainedFile =
    triggerEval === null
      ? null
      : (triggerEval.path_file_results.find((r) => !r.matched)?.file ?? null);
  const providerIrJob =
    providerWorkflow !== null && providerJob !== null
      ? (providerWorkflow.irJobs.find((j) => j.id === providerJob.job_id) ?? null)
      : null;
  const unknownNeeds =
    providerWorkflow !== null &&
    providerJob !== null &&
    providerJob.reason === "needs_unknown" &&
    providerIrJob !== null
      ? providerIrJob.needs.filter(
          (need) =>
            providerWorkflow.jobs.find((j) => j.job_id === need)?.status ===
            "UNKNOWN",
        )
      : [];

  const baseRecommendation: RecommendationInput = {
    kind: "missing_context",
    checkContext: context,
    resolverReason: result.reason,
    triggerReason,
    workflowPath: providerWorkflow?.path ?? null,
    jobId: providerJob?.job_id ?? null,
    source: entry?.source ?? null,
    eventName: scenario.event.name,
    action: scenario.event.action,
    eventTypes: matchedEvent?.types ?? null,
    branchValue: triggerEval?.branch_value ?? null,
    branchPatterns: null,
    branchPatternsKind: null,
    pathPatterns: null,
    pathPatternsKind: null,
    retainedFile,
    skipToken: null,
    scannedContexts: evaluation.scannedContexts,
    providers: providerList,
    triggerUnknown: unknownCause,
    firstUnsupported,
    triggerErrors: providerWorkflow?.build.errors ?? [],
    jobReason: providerJob?.reason ?? null,
    jobIf: providerIrJob?.if ?? null,
    unknownNeeds,
  };

  const fail = (
    kind: WitnessKind,
    firstBlockingCondition: string,
    note: string,
    recommendationInput: RecommendationInput,
  ): WitnessEvidence => ({
    kind,
    firstBlockingCondition,
    note,
    recommendationInput: { ...recommendationInput, kind },
    providerWorkflow,
    retainedFile,
  });

  switch (result.reason) {
    case "duplicate_context": {
      return fail(
        "duplicate_context",
        "duplicate_context",
        `Required check context ${q(context)} is provided by ${providers.length} jobs: ${formatProviders(providerList)}.`,
        baseRecommendation,
      );
    }
    case "no_provider": {
      const note =
        evaluation.scannedContexts.length === 0
          ? `No job provides required check context ${q(context)}; the workflows declare no jobs.`
          : `No job provides required check context ${q(context)}; scanned job contexts are ${formatQuotedList(evaluation.scannedContexts)}.`;
      return fail("missing_context", "no_provider", note, baseRecommendation);
    }
    case "external_source": {
      return fail(
        "unsupported_feature",
        "external_source",
        `Required check ${q(context)} declares source ${q(entry?.source ?? "")}, which is not github-actions; external App checks cannot be simulated.`,
        baseRecommendation,
      );
    }
    case "provider_invalid":
    case "trigger_invalid": {
      const jobReason = providerJob?.reason ?? null;
      if (jobReason === "trigger_invalid" || result.reason === "trigger_invalid") {
        const errors = providerWorkflow?.build.errors ?? [];
        return fail(
          "invalid_input",
          result.reason,
          `Workflow ${q(providerWorkflow?.path ?? "")} trigger is invalid: ${errors.join("; ")}.`,
          baseRecommendation,
        );
      }
      return fail(
        "invalid_input",
        result.reason,
        `Job ${q(providerJob?.job_id ?? "")} in workflow ${q(providerWorkflow?.path ?? "")} is invalid: ${jobReason ?? ""}.`,
        baseRecommendation,
      );
    }
    case "trigger_unknown": {
      const cause = unknownCause ?? {
        cause: "the trigger evaluation is unknown",
        kind: "generic" as const,
      };
      return fail(
        "unsupported_feature",
        "trigger_unknown",
        `Workflow ${q(providerWorkflow?.path ?? "")} trigger cannot be decided: ${cause.cause}.`,
        baseRecommendation,
      );
    }
    case "provider_unknown": {
      const jobReason = providerJob?.reason ?? null;
      const path = q(providerWorkflow?.path ?? "");
      const job = q(providerJob?.job_id ?? "");
      if (jobReason === "unsupported_if") {
        return fail(
          "unsupported_feature",
          "provider_unknown",
          `Job ${job} in workflow ${path} cannot be decided: if ${q(providerIrJob?.if ?? "")} uses syntax outside the supported subset.`,
          baseRecommendation,
        );
      }
      if (jobReason === "if_unknown") {
        return fail(
          "unsupported_feature",
          "provider_unknown",
          `Job ${job} in workflow ${path} cannot be decided: if ${q(providerIrJob?.if ?? "")} cannot be decided statically.`,
          baseRecommendation,
        );
      }
      if (jobReason === "needs_unknown") {
        return fail(
          "unsupported_feature",
          "provider_unknown",
          `Job ${job} in workflow ${path} cannot be decided: needs jobs ${formatQuotedList(unknownNeeds)} cannot be decided.`,
          baseRecommendation,
        );
      }
      if (jobReason === "trigger_unknown") {
        const cause = unknownCause ?? {
          cause: "the trigger evaluation is unknown",
          kind: "generic" as const,
        };
        return fail(
          "unsupported_feature",
          "provider_unknown",
          `Job ${job} in workflow ${path} cannot be decided: workflow trigger cannot be decided: ${cause.cause}.`,
          baseRecommendation,
        );
      }
      return fail(
        "unsupported_feature",
        "provider_unknown",
        `Job ${job} in workflow ${path} cannot be decided: job reason is ${q(jobReason ?? "")}.`,
        baseRecommendation,
      );
    }
    case "workflow_not_triggered": {
      const path = q(providerWorkflow?.path ?? "");
      if (triggerReason === "event_mismatch") {
        // ADR T011/T009-U01: merge_group_missing is exact only for
        // the merge_group event; any other event uses the generic kind.
        const kind: WitnessKind =
          scenario.event.name === "merge_group"
            ? "merge_group_missing"
            : "event_trigger_missing";
        return fail(
          kind,
          "event_mismatch",
          `Workflow ${path} does not declare on.${scenario.event.name} for scenario event ${eventRef(scenario)}; required check ${q(context)} has no triggered provider.`,
          baseRecommendation,
        );
      }
      if (triggerReason === "activity_type_mismatch") {
        const kind: WitnessKind =
          scenario.event.name === "merge_group"
            ? "merge_group_missing"
            : "event_trigger_missing";
        return fail(
          kind,
          "activity_type_mismatch",
          `Workflow ${path} declares on.${scenario.event.name} but its types ${formatQuotedList(matchedEvent?.types ?? [])} do not include action ${q(scenario.event.action ?? "")}; required check ${q(context)} has no triggered provider.`,
          baseRecommendation,
        );
      }
      if (triggerReason === "branch_mismatch") {
        const branchValue = triggerEval?.branch_value ?? "";
        if (matchedEvent?.branches_ignore !== null) {
          return fail(
            "branch_filter",
            "branch_mismatch",
            `Workflow ${path} branches-ignore ${formatQuotedList(matchedEvent?.branches_ignore ?? [])} excludes branch ${q(branchValue)} for event ${scenario.event.name}; required check ${q(context)} has no triggered provider.`,
            {
              ...baseRecommendation,
              branchPatterns: matchedEvent?.branches_ignore ?? [],
              branchPatternsKind: "branches-ignore",
            },
          );
        }
        return fail(
          "branch_filter",
          "branch_mismatch",
          `Workflow ${path} branch filter ${formatQuotedList(matchedEvent?.branches ?? [])} does not match branch ${q(branchValue)} for event ${scenario.event.name}; required check ${q(context)} has no triggered provider.`,
          {
            ...baseRecommendation,
            branchPatterns: matchedEvent?.branches ?? [],
            branchPatternsKind: "branches",
          },
        );
      }
      if (triggerReason === "path_mismatch") {
        const isIgnore = matchedEvent?.paths_ignore !== null;
        const patterns = isIgnore
          ? (matchedEvent?.paths_ignore ?? [])
          : (matchedEvent?.paths ?? []);
        const rec = {
          ...baseRecommendation,
          pathPatterns: patterns,
          pathPatternsKind: isIgnore ? ("paths-ignore" as const) : ("paths" as const),
        };
        if (isIgnore) {
          const note =
            retainedFile !== null
              ? `Workflow ${path} paths-ignore ${formatQuotedList(patterns)} excludes every changed file; first excluded file is ${q(retainedFile)}; required check ${q(context)} has no triggered provider.`
              : `Workflow ${path} paths-ignore ${formatQuotedList(patterns)} excludes every changed file; the changed-file list is empty; required check ${q(context)} has no triggered provider.`;
          return fail("path_filter", "path_mismatch", note, rec);
        }
        const note =
          retainedFile !== null
            ? `Workflow ${path} path filter ${formatQuotedList(patterns)} matches none of the changed files; first non-matching file is ${q(retainedFile)}; required check ${q(context)} has no triggered provider.`
            : `Workflow ${path} path filter ${formatQuotedList(patterns)} matches none of the changed files; the changed-file list is empty; required check ${q(context)} has no triggered provider.`;
        return fail("path_filter", "path_mismatch", note, rec);
      }
      if (triggerReason === "commit_skip") {
        const token = annotateCommitSkip(scenario.event.commit_message).token ?? "";
        return fail(
          "commit_skip",
          "commit_skip",
          `Commit message contains skip token ${q(token)}; workflow ${path} is skipped; required check ${q(context)} has no triggered provider.`,
          { ...baseRecommendation, skipToken: token },
        );
      }
      if (triggerReason === "unknown") {
        const cause = unknownCause ?? {
          cause: "the trigger evaluation is unknown",
          kind: "generic" as const,
        };
        return fail(
          "unsupported_feature",
          "unknown",
          `Workflow ${path} trigger cannot be decided: ${cause.cause}.`,
          baseRecommendation,
        );
      }
      if (triggerReason === "invalid") {
        const errors = providerWorkflow?.build.errors ?? [];
        return fail(
          "invalid_input",
          "invalid",
          `Workflow ${path} trigger is invalid: ${errors.join("; ")}.`,
          {
            ...baseRecommendation,
            triggerErrors: errors,
          },
        );
      }
      // Defensive: a workflow_not_triggered verdict with an unlisted
      // trigger reason. The note names the reason verbatim.
      return fail(
        "unsupported_feature",
        triggerReason ?? "unknown",
        `Workflow ${path} did not trigger for this scenario (trigger reason is ${q(triggerReason ?? "unknown")}); required check ${q(context)} has no triggered provider.`,
        baseRecommendation,
      );
    }
    default: {
      // Defensive: a failing status with an unlisted resolver reason.
      // The note names the reason verbatim; nothing is invented.
      return fail(
        "unsupported_feature",
        result.reason,
        `Required check ${q(context)} has status ${result.status} (reason ${q(result.reason)}).`,
        baseRecommendation,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Fixed-order reduction. Every step re-runs the pipeline and keeps the
// change only when the same (context, status, reason) is reproduced.
// ---------------------------------------------------------------------------

function reduceWitnessScenario(
  input: WitnessBuildInput,
  originalIndex: number,
  original: KeyedRequiredCheckResult,
  evidence: WitnessEvidence,
  cache: Map<string, WorkflowIRBuildResult>,
): ScenarioV1 {
  const singleCheck = input.requiredChecks[originalIndex];
  const base: WitnessBuildInput = {
    fixtureId: input.fixtureId,
    workflows: input.workflows,
    scenario: input.scenario,
    requiredChecks: [singleCheck],
  };
  const tryWith = (
    workflows: WitnessWorkflowInput[],
    files: string[],
    message: string,
  ): boolean => {
    const candidate: WitnessBuildInput = {
      ...base,
      workflows,
      scenario: {
        ...input.scenario,
        event: { ...input.scenario.event, commit_message: message },
        diff: { ...input.scenario.diff, changed_files: files },
      },
    };
    return reproduces(
      candidate,
      original,
      evidence.kind,
      evidence.firstBlockingCondition,
      cache,
    );
  };

  // 1. Workflows: drop each non-provider workflow in file order.
  // Skipped for missing_context (the scanned-context list is
  // evidence from the full input).
  let workflows = input.workflows;
  if (evidence.kind !== "missing_context") {
    for (const wf of [...input.workflows]) {
      const candidate = workflows.filter((w) => w !== wf);
      if (
        tryWith(candidate, input.scenario.diff.changed_files, input.scenario.event.commit_message)
      ) {
        workflows = candidate;
      }
    }
  }

  // 2. Changed files.
  let changedFiles = [...input.scenario.diff.changed_files];
  const message = input.scenario.event.commit_message;
  if (evidence.kind === "path_filter") {
    const firstBad = evidence.retainedFile;
    const reduced = firstBad === null ? [] : [firstBad];
    if (tryWith(workflows, reduced, message)) {
      changedFiles = reduced;
    } else {
      changedFiles = greedyReduceFiles(
        (files) => tryWith(workflows, files, message),
        changedFiles,
      );
    }
  } else {
    changedFiles = greedyReduceFiles(
      (files) => tryWith(workflows, files, message),
      changedFiles,
    );
  }

  // 3. Commit message.
  let commitMessage = message;
  if (evidence.kind === "commit_skip") {
    const token = annotateCommitSkip(message).token;
    if (token !== null && tryWith(workflows, changedFiles, token)) {
      commitMessage = token;
    }
  } else if (tryWith(workflows, changedFiles, "")) {
    commitMessage = "";
  }

  const reducedScenario: ScenarioV1 = {
    ...input.scenario,
    event: { ...input.scenario.event, commit_message: commitMessage },
    diff: { ...input.scenario.diff, changed_files: changedFiles },
  };

  // Final verification; fall back to the original scenario (still a
  // valid witness, just not minimal) if it ever failed.
  const verified = reproduces(
    { ...base, workflows, scenario: reducedScenario },
    original,
    evidence.kind,
    evidence.firstBlockingCondition,
    cache,
  );
  return verified ? reducedScenario : input.scenario;
}

/** Greedy single-file removal in listed order, to a fixpoint. */
function greedyReduceFiles(
  tryFiles: (files: string[]) => boolean,
  files: string[],
): string[] {
  let current = [...files];
  let progress = true;
  while (progress) {
    progress = false;
    for (const file of [...current]) {
      const at = current.indexOf(file);
      if (at === -1) continue;
      const candidate = current.filter((_, j) => j !== at);
      if (tryFiles(candidate)) {
        current = candidate;
        progress = true;
      }
    }
  }
  return current;
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

/**
 * Build minimal failure witnesses + recommendations for one case.
 * One witness per failing required check, in manifest order; witness
 * ids are `witness-001`, `witness-002`, ... in that order. The
 * function is pure and deterministic.
 */
export function buildWitnesses(input: WitnessBuildInput): WitnessBuildOutput {
  const cache = new Map<string, WorkflowIRBuildResult>();
  const evaluation = runFormalPipeline(input, cache);
  const witnesses: ReportWitness[] = [];
  const recommendations: WitnessRecommendation[] = [];
  let ordinal = 0;
  for (let index = 0; index < evaluation.keyed.length; index++) {
    const result = evaluation.keyed[index];
    const evidence = buildWitnessEvidence(index, result, evaluation, input);
    if (evidence === null) continue;
    const reducedScenario = reduceWitnessScenario(
      input,
      index,
      result,
      evidence,
      cache,
    );
    ordinal += 1;
    const id = `witness-${String(ordinal).padStart(3, "0")}`;
    witnesses.push({
      id,
      kind: evidence.kind,
      check_context: result.context,
      first_blocking_condition: evidence.firstBlockingCondition,
      scenario: reducedScenario,
      note: evidence.note,
    });
    const rec = recommendationFor(evidence.recommendationInput);
    recommendations.push({
      witness_id: id,
      rule_id: rec.rule_id,
      kind: evidence.kind,
      check_context: result.context,
      recommendation: rec.recommendation,
    });
  }
  return { witnesses, recommendations };
}
