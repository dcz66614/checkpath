// T004 — End-to-end pipeline glue (PoC).
//
// Composes the T002 trigger evaluation with the T003 job/check semantics
// over raw workflow YAML + scenario + required-check manifest, producing
// the normalized e2e report (`checkpath.e2e-report/v1`):
//
//   YAML -> trigger IR -> Job DAG / if -> check resolver -> report
//
// The T003 `workflow_triggered` placeholder is replaced by the real T002
// trigger IR, evaluated once per workflow file. Jobs are extracted from
// the same workflow YAML (not supplied separately), so the pipeline is
// genuinely end to end. Required checks are resolved per provider Job
// (`resolveRequiredChecksPerProvider`) because each workflow file has its
// own trigger outcome; with a single workflow this reproduces the T003
// resolver exactly.
//
// Fail-closed contract (PROJECT_BOOK §3.4, §4.4, §4.5):
//   * trigger INVALID  -> its Jobs INVALID / trigger_invalid.
//   * trigger UNKNOWN, or a VALID trigger with triggered null (missing
//     branch/action, unconfirmed diff) -> its Jobs UNKNOWN /
//     trigger_unknown, and the checks UNKNOWN / trigger_unknown.
//   * unsupported `if`, external check sources, duplicate contexts and
//     broken DAGs surface as UNKNOWN / AMBIGUOUS / INVALID, never as a
//     silent PASS. Real Job success/failure is never predicted.
//
// Canonical JSON (must match oracle/checkpath_oracle/canonical.py
// byte-for-byte): object keys sorted recursively, separators "," and
// ":", UTF-8, non-ASCII unescaped, no trailing newline in the hashed
// form. `input_sha256` is the SHA-256 of the canonical input object
// {required_checks, scenario, workflows:[{path, yaml}]}.
//
// T010 (T005 U-03): the canonical-JSON / SHA-256 implementation now
// lives in the formal modules canonical-json.ts / sha256.ts and is
// imported above; the inline copy that used to sit here was deleted.

//
// Two pipelines, explicit division of labour (FIX-P0-01, T013 P2-2):
// this file is the S0 / Oracle-parity pipeline. It evaluates jobs with
// the UNKEYED single-workflow core (evaluateJobs, per-provider
// resolution by evaluation object) because the Reference Oracle
// compares against exactly this report shape
// (`checkpath.e2e-report/v1`, incl. the trigger IR). The PRODUCT
// path is the formal pipeline instead: buildReport()
// (src/report/build.ts) -> runFormalPipeline()
// (src/core/witness-reducer.ts) -> evaluateJobsForTrigger() /
// evaluateJobsKeyed() (src/core/job-dag.ts), keyed by
// (workflow_path, job_id) so two workflow files declaring the same
// job_id with different trigger outcomes are distinguished —
// something this unkeyed path cannot do (its per-provider
// resolution keys jobs by their evaluation objects, so same job_id
// across workflows is not distinguished; S0 fixtures use distinct
// job ids across workflows, e.g. E2E-19: test-a / test-b). The two
// paths are NOT left to drift: tests/unit/cli/
// formal-pipeline-unsupported.test.ts locks them together — for
// every golden fixture the formal pipeline's job/check rows must
// equal both the frozen Oracle expected.json AND this pipeline's
// rows, including on unsupported_job (matrix / reusable-workflow
// jobs are UNKNOWN in both; P0-1 was exactly a case where they
// disagreed, because evaluateJobsKeyed dropped the field). The
// `diff`/`complete`/`returned_files`/`algorithm` scenario fields
// are carried but only the §4.3 boundary fields are interpreted.

import { parse } from "yaml";
// T010 (closes T005 U-03): the canonical-JSON / SHA-256 helpers live in
// the formal modules (canonical-json.ts / sha256.ts, IMPLEMENTATION_PLAN
// §8); e2e.ts no longer keeps its own inline copies. The two names are
// re-exported so existing importers keep working byte-for-byte: the
// formal implementations were migrated verbatim from the S0-verified
// inline code, and S0 regression (47/47 + Oracle 24/24) is re-run to
// prove zero behaviour change.
import { canonicalJson } from "./canonical-json.js";
import { sha256Hex } from "./sha256.js";

export { canonicalJson, sha256Hex };
import {
  buildTriggerIR,
  hasDuplicateAliasKey,
  hasMultilineFlowKey,
  hasRejectedAnchorOrTag,
  hasRejectedTagComma,
  hasRejectedTab,
  hasUnrepresentableKey,
  type TriggerIR,
  type TriggerScenario,
} from "./workflow-parser.js";
import {
  evaluateJobs,
  jobContext,
  type JobCheckInput,
  type JobEvaluation,
  type JobInput,
} from "./job-dag.js";
import {
  resolveRequiredChecksPerProvider,
  type JobWithTrigger,
  type ProviderTriggerState,
  type RequiredCheckResult,
} from "./check-resolver.js";

export const E2E_REPORT_SCHEMA = "checkpath.e2e-report/v1" as const;

export interface E2EWorkflowInput {
  path: string;
  yamlText: string;
}

export interface E2EScenarioEvent {
  name?: string;
  action?: string;
  branch?: string;
  base_branch?: string;
  head_branch?: string;
  target_branch?: string;
  commit_message?: string;
  ref?: string;
}

export interface E2EScenario {
  schema?: string;
  scenario_id?: string;
  event?: E2EScenarioEvent;
  diff?: {
    algorithm?: string;
    changed_files?: string[];
    changed_files_total?: number | null;
    returned_files?: number | null;
    complete?: boolean | null;
    first_3000_confirmed?: boolean | null;
    diff_timed_out?: boolean | null;
    push_commit_count?: number | null;
  };
}

export interface E2ERequiredChecks {
  schema?: string;
  required_checks?: Array<{ context: string; source?: string | null }>;
}

export interface E2EFixtureInput {
  fixture_id: string;
  workflows: E2EWorkflowInput[];
  scenario: E2EScenario;
  required_checks: E2ERequiredChecks;
}

export interface E2EJobReport extends JobEvaluation {
  workflow: string;
}

export interface E2EWorkflowReport {
  path: string;
  trigger: TriggerIR;
}

export interface E2EReport {
  schema: typeof E2E_REPORT_SCHEMA;
  fixture_id: string;
  scenario_id: string;
  input_sha256: string;
  diff_boundary: string | null;
  workflows: E2EWorkflowReport[];
  jobs: E2EJobReport[];
  required_checks: RequiredCheckResult[];
  unsupported_features: string[];
  summary: {
    workflow_count: number;
    triggered_workflow_count: number;
    job_status_counts: Record<string, number>;
    check_status_counts: Record<string, number>;
  };
}

const JOB_STATUSES = [
  "CONDITIONAL_AFTER_NEEDS",
  "ELIGIBLE",
  "INVALID",
  "SKIPPED",
  "UNKNOWN",
] as const;

const CHECK_STATUSES = [
  "AMBIGUOUS",
  "INVALID",
  "PENDING_NOT_REPORTED",
  "REPORTABLE_PENDING",
  "SKIPPED_SUCCESS",
  "UNKNOWN",
] as const;

// ---------------------------------------------------------------------------
// Job extraction from workflow YAML (mirrors oracle parser.extract_jobs).
// YAML `if: false` parses to boolean false here (string "false" under
// Python BaseLoader), so scalars are normalized with String(). A
// non-scalar `if` maps to "__unsupported_if__" (both `if` parsers reject
// it -> UNKNOWN, never a silent downgrade to "no condition"); a
// non-scalar `needs` entry maps to "__invalid_needs__" (-> missing_need
// -> INVALID). A non-mapping job definition is likewise UNKNOWN.
// ---------------------------------------------------------------------------

const UNSUPPORTED_IF_SENTINEL = "__unsupported_if__";
const INVALID_NEEDS_SENTINEL = "__invalid_needs__";

function scalarToString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  return null;
}

function extractNeeds(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (
    typeof raw === "string" ||
    typeof raw === "boolean" ||
    typeof raw === "number"
  ) {
    return [String(raw)];
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      const text = scalarToString(item);
      return text === null ? INVALID_NEEDS_SENTINEL : text;
    });
  }
  return [INVALID_NEEDS_SENTINEL];
}

function extractIf(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = scalarToString(raw);
  return text === null ? UNSUPPORTED_IF_SENTINEL : text;
}

/**
 * ADR T011/ADR-04: classify a job that has no single reportable check
 * context. A job with `uses` calls a reusable workflow (its checks
 * come from the called workflow, not this job); a job with a
 * `strategy.matrix` expands to one check per matrix combination.
 * Only the presence of the `matrix` key matters — a `strategy`
 * without `matrix` (e.g. only `fail-fast`) is an ordinary job.
 * `uses` wins when both are present.
 */
function extractUnsupportedJob(
  def: Record<string, unknown>,
): "reusable_workflow" | "matrix" | null {
  if ("uses" in def) return "reusable_workflow";
  const strategy = def["strategy"];
  if (
    strategy !== null &&
    typeof strategy === "object" &&
    !Array.isArray(strategy) &&
    "matrix" in (strategy as Record<string, unknown>)
  ) {
    return "matrix";
  }
  return null;
}

/** Extract Job inputs from a workflow YAML's `jobs:` mapping, in file order. */
export function extractJobs(yamlText: string): JobInput[] {
  let doc: unknown;
  try {
    doc = parse(yamlText);
  } catch {
    return [];
  }
  // FIX-P0-04: PyYAML fails the whole document on a bare empty key
  // (or a collection key), so the Oracle's extract_jobs returns [];
  // return [] here too instead of extracting jobs from a document
  // the Oracle cannot parse at all.
  // FIX-P0-06: the same holds for an alias key resolving to a
  // collection (N5) and for a tab PyYAML's scanner rejects (H6 family).
  // FIX-P0-09: the same holds for a multi-line key in a flow
  // mapping (R3).
  // FIX-P0-12: the same holds for an anchor/tag PyYAML's scanner
  // rejects (R11 P0-A, hasRejectedAnchorOrTag).
  // FIX-P0-13: the same holds for a tag whose suffix swallows a
  // flow-mapping `,` (R12 P0-C1, hasRejectedTagComma).
  // FIX-P0-19: the same holds for an alias key resolving to a
  // scalar that duplicates another key of the same mapping (R18
  // P0, hasDuplicateAliasKey).
  if (
    hasUnrepresentableKey(yamlText) ||
    hasRejectedTab(yamlText) ||
    hasMultilineFlowKey(yamlText) ||
    hasRejectedAnchorOrTag(yamlText) ||
    hasRejectedTagComma(yamlText) ||
    hasDuplicateAliasKey(yamlText)
  ) {
    return [];
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return [];
  const jobsRaw = (doc as Record<string, unknown>)["jobs"];
  if (
    jobsRaw === null ||
    typeof jobsRaw !== "object" ||
    Array.isArray(jobsRaw)
  ) {
    return [];
  }
  const jobs: JobInput[] = [];
  for (const [id, definition] of Object.entries(
    jobsRaw as Record<string, unknown>,
  )) {
    if (
      definition === null ||
      typeof definition !== "object" ||
      Array.isArray(definition)
    ) {
      jobs.push({
        id,
        name: null,
        needs: [],
        if: UNSUPPORTED_IF_SENTINEL,
      });
      continue;
    }
    const def = definition as Record<string, unknown>;
    jobs.push({
      id,
      name: typeof def["name"] === "string" ? def["name"] : null,
      needs: extractNeeds(def["needs"]),
      if: extractIf(def["if"]),
      unsupported_job: extractUnsupportedJob(def),
    });
  }
  return jobs;
}

/**
 * Scenario-level diff-boundary annotation (PROJECT_BOOK §4.3).
 * Precedence: diff timeout > push over 1,000 commits > unconfirmed
 * first-3000 list. Annotation only; the per-workflow effect lives in
 * each trigger IR.
 */
export function diffBoundary(scenario: E2EScenario): string | null {
  const event = scenario.event ?? {};
  const diff = scenario.diff ?? {};
  const changedFiles = diff.changed_files ?? [];
  const total =
    typeof diff.changed_files_total === "number"
      ? diff.changed_files_total
      : changedFiles.length;
  if (diff.diff_timed_out === true) return "diff_timed_out";
  if (
    event.name === "push" &&
    typeof diff.push_commit_count === "number" &&
    diff.push_commit_count > 1000
  ) {
    return "push_over_1000_commits";
  }
  if (total > 3000 && diff.first_3000_confirmed !== true) {
    return "first_3000_unconfirmed";
  }
  return null;
}

/** Evaluate one end-to-end fixture; returns the normalized e2e report. */
export function evaluateE2E(input: E2EFixtureInput): E2EReport {
  const scenario = input.scenario;
  const event = scenario.event ?? {};
  const diff = scenario.diff ?? {};
  const changedFiles = diff.changed_files ?? [];
  const requiredList = input.required_checks.required_checks ?? [];

  // Adapt the §6.1 scenario to the T002 trigger shape and the T003 `if`
  // scenario context. Both adaptations are mechanical field copies.
  const triggerScenario: TriggerScenario = {
    event: {
      name: event.name,
      action: event.action,
      branch: event.branch,
      base_branch: event.base_branch,
      head_branch: event.head_branch,
      target_branch: event.target_branch,
      commit_message: event.commit_message,
    },
    changed_files: changedFiles,
    diff: {
      changed_files_total: diff.changed_files_total ?? null,
      returned_files: diff.returned_files ?? null,
      first_3000_confirmed: diff.first_3000_confirmed ?? null,
      diff_timed_out: diff.diff_timed_out ?? null,
      push_commit_count: diff.push_commit_count ?? null,
    },
  };
  const jobScenario: JobCheckInput["scenario"] = {
    event_name: event.name ?? null,
    action: event.action ?? null,
    ref: event.ref ?? null,
    base_ref: event.base_branch ?? null,
    head_ref: event.head_branch ?? null,
  };

  const workflowReports: E2EWorkflowReport[] = [];
  const jobsOut: E2EJobReport[] = [];
  const pairs: JobWithTrigger[] = [];

  for (const workflow of input.workflows) {
    const ir = buildTriggerIR(
      workflow.yamlText,
      triggerScenario,
      input.fixture_id,
    );
    const jobs = extractJobs(workflow.yamlText);
    const triggered = ir.evaluation.triggered;
    let triggerState: ProviderTriggerState;
    let jobEvals: JobEvaluation[];
    if (ir.status === "INVALID") {
      triggerState = "invalid";
      jobEvals = jobs.map((job) => ({
        job_id: job.id,
        context: jobContext(job),
        status: "INVALID" as const,
        reason: "trigger_invalid",
      }));
    } else if (ir.status === "UNKNOWN" || triggered === null) {
      triggerState = "unknown";
      jobEvals = jobs.map((job) => ({
        job_id: job.id,
        context: jobContext(job),
        status: "UNKNOWN" as const,
        reason: "trigger_unknown",
      }));
    } else {
      triggerState = triggered ? "triggered" : "not_triggered";
      jobEvals = evaluateJobs({
        workflow_triggered: triggered,
        trigger_reason: ir.evaluation.reason,
        scenario: jobScenario,
        jobs,
        required_checks: [],
      });
    }
    workflowReports.push({ path: workflow.path, trigger: ir });
    for (const jobEval of jobEvals) {
      jobsOut.push({ workflow: workflow.path, ...jobEval });
      pairs.push({ job: jobEval, trigger: triggerState });
    }
  }

  const checks = resolveRequiredChecksPerProvider(requiredList, pairs);

  // Unsupported features, in deterministic order: trigger entries
  // (workflow order), then unsupported `if` jobs, then external sources.
  const unsupported: string[] = [];
  const pushUnique = (item: string): void => {
    if (!unsupported.includes(item)) unsupported.push(item);
  };
  for (const workflow of workflowReports) {
    for (const item of workflow.trigger.evaluation.unsupported) {
      pushUnique(item);
    }
  }
  for (const job of jobsOut) {
    if (job.reason === "unsupported_if") {
      pushUnique(`unsupported_if:${job.job_id}`);
    }
  }
  for (const check of checks) {
    if (check.reason === "external_source") {
      pushUnique(`external_source:${check.context}`);
    }
  }

  const jobStatusCounts: Record<string, number> = {};
  for (const status of JOB_STATUSES) jobStatusCounts[status] = 0;
  for (const job of jobsOut) {
    jobStatusCounts[job.status] = (jobStatusCounts[job.status] ?? 0) + 1;
  }
  const checkStatusCounts: Record<string, number> = {};
  for (const status of CHECK_STATUSES) checkStatusCounts[status] = 0;
  for (const check of checks) {
    checkStatusCounts[check.status] =
      (checkStatusCounts[check.status] ?? 0) + 1;
  }

  const inputObj = {
    required_checks: input.required_checks,
    scenario: input.scenario,
    workflows: input.workflows.map((workflow) => ({
      path: workflow.path,
      yaml: workflow.yamlText,
    })),
  };

  return {
    schema: E2E_REPORT_SCHEMA,
    fixture_id: input.fixture_id,
    scenario_id: scenario.scenario_id ?? input.fixture_id,
    input_sha256: sha256Hex(canonicalJson(inputObj)),
    diff_boundary: diffBoundary(scenario),
    workflows: workflowReports,
    jobs: jobsOut,
    required_checks: checks,
    unsupported_features: unsupported,
    summary: {
      workflow_count: workflowReports.length,
      triggered_workflow_count: workflowReports.filter(
        (workflow) =>
          workflow.trigger.status === "VALID" &&
          workflow.trigger.evaluation.triggered === true,
      ).length,
      job_status_counts: jobStatusCounts,
      check_status_counts: checkStatusCounts,
    },
  };
}
