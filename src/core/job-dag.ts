// T007 — Job DAG + frozen `if` subset evaluation (formal).
//
// Formalizes the T003 PoC (PROJECT_BOOK §3.3, §4.4). The DAG algorithm
// is moved verbatim from the PoC (same structural INVALID rules, same
// Kahn topological order with input order as tie-break, same per-job
// precedence); the `if` language now lives in if-subset.ts and this
// module only calls it. This module never predicts whether a Job will
// really succeed or fail — it only decides ELIGIBLE / SKIPPED /
// CONDITIONAL_AFTER_NEEDS / UNKNOWN / INVALID.
//
// Single source of truth (closes T005 U-02 on the JobStatus side;
// T008 closes the CheckStatus side by re-basing check-resolver.ts
// onto types.ts and removing the CheckStatus re-export below):
// `JobStatus` is DEFINED in types.ts only. This module re-exports
// `JobStatus` so existing importers keep compiling untouched.
//
// (workflow, job_id) key (S0 legacy item ②, DAG side — this task):
// a job_id is only unique inside one workflow file. Two workflow
// files may both declare job `test`, and their trigger outcomes (and
// hence their job statuses) may differ, so results combined across
// workflows MUST be keyed by (workflow_path, job_id), never by job_id
// alone. `jobKey` is the canonical string form of that pair
// (JSON-encoded `[workflow_path, job_id]`, so no separator collision
// is possible), `evaluateJobsKeyed` / `evaluateJobsForTrigger` are the
// formal multi-workflow entry points returning `KeyedJobEvaluation`
// (each result carries its `workflow_path` and its `key`), and
// `evaluateJobs` stays the single-workflow core used by the S0
// pipeline (e2e.ts) and the S0 job-check suite. The resolver side of
// the key (matching required checks against keyed providers) is
// `resolveRequiredChecksKeyed` in check-resolver.ts (T008).
//
// Job DAG evaluation (§4.4). Precedence per job:
//   1. structural INVALID (missing need, cycle, duplicate id, invalid need)
//   2. workflow not triggered -> SKIPPED (reason workflow_not_triggered;
//      the check-level distinction PENDING_NOT_REPORTED vs SKIPPED_SUCCESS
//      is made by the resolver, not by this status)
//   3. `if` FALSE -> SKIPPED; `if` unparseable/unsupported -> UNKNOWN
//   4. needs gate: SKIPPED need -> SKIPPED (default success() precondition),
//      unless the `if` contains always(), which waives that precondition
//      and makes the job ELIGIBLE; UNKNOWN need -> UNKNOWN
//   5. no needs -> ELIGIBLE; needs that will run -> CONDITIONAL_AFTER_NEEDS
//      (real upstream result is not predicted), or ELIGIBLE with always().
// Trigger INVALID / UNKNOWN is NOT decided here: the caller maps it to
// per-job INVALID / UNKNOWN via `evaluateJobsForTrigger` (same branching
// as the Oracle's evaluate_e2e_fixture and e2e.ts), because the DAG
// itself only runs for a workflow whose trigger verdict is known.

import {
  evaluateIfExpression,
  ifContextFromScenario,
  type IfScenarioContext,
  type IfTriState,
} from "./if-subset.js";
import type {
  JobStatus,
  ScenarioV1,
  WorkflowIRJob,
} from "./types.js";

// Single source of truth is types.ts; this is a re-export only (see
// header). T008 removed the CheckStatus re-export when it re-based
// the resolver onto types.ts (closes T005 U-02 fully); JobStatus stays
// re-exported here because this module is one of its producers.
export type { JobStatus } from "./types.js";

/** Loose `if` scenario context (PoC shape); an alias of IfScenarioContext. */
export type ScenarioContext = IfScenarioContext;

export interface JobInput {
  id: string;
  name?: string | null;
  needs?: string[];
  /** Raw `if` expression, or null/undefined for "no condition". */
  if?: string | null;
  /**
   * ADR T011/ADR-04: a job that calls a reusable workflow (`uses`) or
   * expands a `strategy.matrix` has no single reportable check
   * context (PROJECT_BOOK §3.4), so it is UNKNOWN whenever it would
   * otherwise run. Null/undefined means an ordinary local job.
   * Precedence at extraction: `uses` wins over `matrix`.
   */
  unsupported_job?: "reusable_workflow" | "matrix" | null;
}

export interface RequiredCheckInput {
  context: string;
  /** MVP only accepts "github-actions"; anything else is UNKNOWN (§4.5). */
  source?: string | null;
}

export interface JobCheckInput {
  /** T006 trigger result (supplied directly by the fixture / e2e pipeline). */
  workflow_triggered: boolean;
  trigger_reason?: string | null;
  scenario?: ScenarioContext;
  jobs: JobInput[];
  required_checks: RequiredCheckInput[];
}

export interface JobEvaluation {
  job_id: string;
  context: string;
  status: JobStatus;
  reason: string;
}

/** A Job's required-check context: `name` if declared, else `job_id` (§4.5). */
export function jobContext(job: JobInput): string {
  return job.name ?? job.id;
}

// ---------------------------------------------------------------------------
// (workflow, job_id) key — S0 legacy item ②, DAG side.
// ---------------------------------------------------------------------------

/** Identity of one job inside one workflow file. */
export interface JobKey {
  workflow_path: string;
  job_id: string;
}

/**
 * Canonical string form of a (workflow, job_id) pair. JSON-encoded as
 * a two-element array so a workflow path containing "/" (or any other
 * separator) can never collide with a different pair — e.g.
 * ("a/b", "c") and ("a", "b/c") produce different keys.
 */
export function jobKey(key: JobKey): string {
  return JSON.stringify([key.workflow_path, key.job_id]);
}

/** Inverse of `jobKey`; throws on a malformed key. */
export function parseJobKey(key: string): JobKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(key) as unknown;
  } catch {
    throw new Error(`invalid job key: ${key}`);
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "string" ||
    typeof parsed[1] !== "string"
  ) {
    throw new Error(`invalid job key: ${key}`);
  }
  return { workflow_path: parsed[0], job_id: parsed[1] };
}

/**
 * One workflow's trigger outcome as seen by the DAG. Mirrors the
 * per-provider trigger state the Oracle and e2e.ts use; T008 unifies
 * this with the resolver's ProviderTriggerState.
 */
export type WorkflowTriggerState =
  | "triggered"
  | "not_triggered"
  | "unknown"
  | "invalid";

/** A job evaluation tagged with the workflow it belongs to and its canonical key. */
export interface KeyedJobEvaluation extends JobEvaluation {
  workflow_path: string;
  /** `jobKey({ workflow_path, job_id })`. */
  key: string;
}

/** Formal input for the keyed (multi-workflow) entry points. */
export interface JobDagInput {
  /** Workspace-relative workflow path; part of the (workflow, job_id) key. */
  workflow_path: string;
  workflow_triggered: boolean;
  trigger_reason?: string | null;
  scenario: ScenarioV1;
  jobs: WorkflowIRJob[];
}

// ---------------------------------------------------------------------------
// Structural analysis: INVALID map + deterministic topological order.
// Shared by evaluateJobs and topologicalJobOrder so the two can never
// disagree about which jobs are invalid or in which order the rest run.
// ---------------------------------------------------------------------------

interface JobDagAnalysis {
  /** job_id -> INVALID reason (duplicate_job_id, missing_need:<id>, needs_cycle, invalid_need:<id>). */
  invalid: Map<string, string>;
  /** Topological order of the non-INVALID jobs (Kahn, input order as tie-break). */
  order: string[];
}

function analyzeJobDag(jobs: readonly JobInput[]): JobDagAnalysis {
  const byId = new Map<string, JobInput>();
  const duplicateIds = new Set<string>();
  for (const job of jobs) {
    if (byId.has(job.id)) duplicateIds.add(job.id);
    else byId.set(job.id, job);
  }

  // Structural INVALID: duplicate id, missing need, needs cycle.
  const invalid = new Map<string, string>();
  for (const id of duplicateIds) {
    invalid.set(id, "duplicate_job_id");
  }
  for (const job of jobs) {
    for (const need of job.needs ?? []) {
      if (!byId.has(need)) {
        invalid.set(job.id, `missing_need:${need}`);
      }
    }
  }
  // Cycle detection (DFS, input order for determinism) over non-invalid jobs.
  const visitState = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (id: string): void => {
    if (invalid.has(id) || visitState.get(id) === "done") return;
    if (visitState.get(id) === "visiting") {
      const at = stack.indexOf(id);
      for (const cyc of stack.slice(at)) {
        if (!invalid.has(cyc)) invalid.set(cyc, "needs_cycle");
      }
      return;
    }
    visitState.set(id, "visiting");
    stack.push(id);
    for (const need of byId.get(id)?.needs ?? []) {
      visit(need);
    }
    stack.pop();
    visitState.set(id, "done");
  };
  for (const job of jobs) visit(job.id);
  // Propagate INVALID to transitive dependents (input order, fixed point).
  let changed = true;
  while (changed) {
    changed = false;
    for (const job of jobs) {
      if (invalid.has(job.id)) continue;
      const badNeed = (job.needs ?? []).find((n) => invalid.has(n));
      if (badNeed !== undefined) {
        invalid.set(job.id, `invalid_need:${badNeed}`);
        changed = true;
      }
    }
  }

  // Topological order (Kahn, input order as tie-break) for the rest.
  const order: string[] = [];
  const remaining = new Map<string, Set<string>>();
  for (const job of jobs) {
    if (invalid.has(job.id)) continue;
    remaining.set(
      job.id,
      new Set((job.needs ?? []).filter((n) => !invalid.has(n))),
    );
  }
  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, deps]) => deps.size === 0)
      .map(([id]) => id);
    if (ready.length === 0) break; // unreachable: cycles already INVALID
    ready.sort(
      (a, b) =>
        jobs.findIndex((j) => j.id === a) - jobs.findIndex((j) => j.id === b),
    );
    for (const id of ready) {
      order.push(id);
      remaining.delete(id);
      for (const deps of remaining.values()) deps.delete(id);
    }
  }

  return { invalid, order };
}

/**
 * Deterministic topological order of a job list, plus the structural
 * INVALID map. Stable: the same input always yields the same order
 * (input order breaks every tie); a job's position never depends on
 * hash iteration order or on any other workflow's jobs.
 */
export function topologicalJobOrder(jobs: readonly JobInput[]): {
  order: string[];
  invalid: Map<string, string>;
} {
  return analyzeJobDag(jobs);
}

// ---------------------------------------------------------------------------
// Single-workflow evaluation (core; used by e2e.ts and the S0 suite).
// ---------------------------------------------------------------------------

export function evaluateJobs(input: JobCheckInput): JobEvaluation[] {
  const scenario: ScenarioContext = input.scenario ?? {};
  const jobs = input.jobs;
  const byId = new Map<string, JobInput>();
  for (const job of jobs) {
    if (!byId.has(job.id)) byId.set(job.id, job);
  }

  const { invalid, order } = analyzeJobDag(jobs);
  const statusById = new Map<string, JobEvaluation>();

  // Evaluate in topological order so every need is decided before its
  // dependents; emit results in input order afterwards.
  const evalOrder = jobs
    .filter((j) => !invalid.has(j.id) && input.workflow_triggered)
    .map((j) => j.id)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));

  const evaluateOne = (job: JobInput): JobEvaluation => {
    const context = jobContext(job);
    // ADR T011/ADR-04: a reusable-workflow call or a matrix job has
    // no single reportable context, so it is UNKNOWN — but only when
    // it would otherwise run. A decidable skip (if: false, a skipped
    // need without always()) still wins: the job never runs, so there
    // is no matrix/reusable expansion to be unknown about.
    const unsupportedJob = (): JobEvaluation | null => {
      if (job.unsupported_job === "reusable_workflow") {
        return {
          job_id: job.id,
          context,
          status: "UNKNOWN",
          reason: "unsupported_reusable_workflow",
        };
      }
      if (job.unsupported_job === "matrix") {
        return {
          job_id: job.id,
          context,
          status: "UNKNOWN",
          reason: "unsupported_matrix",
        };
      }
      return null;
    };
    // `if` evaluation (frozen subset; see if-subset.ts).
    const evaluated = evaluateIfExpression(job.if ?? null, scenario);
    const ifValue: IfTriState = evaluated.value;
    const hasAlways = evaluated.hasAlways;
    if (evaluated.unsupported || ifValue === "UNKNOWN") {
      return {
        job_id: job.id,
        context,
        status: "UNKNOWN",
        reason: evaluated.unsupported ? "unsupported_if" : "if_unknown",
      };
    }
    if (ifValue === "FALSE") {
      return { job_id: job.id, context, status: "SKIPPED", reason: "if_false" };
    }
    const needs = job.needs ?? [];
    const needStatuses = needs.map(
      (n) => statusById.get(n)?.status ?? "UNKNOWN",
    );
    if (needStatuses.includes("INVALID")) {
      return {
        job_id: job.id,
        context,
        status: "INVALID",
        reason: "invalid_need",
      };
    }
    if (needStatuses.includes("UNKNOWN")) {
      return {
        job_id: job.id,
        context,
        status: "UNKNOWN",
        reason: "needs_unknown",
      };
    }
    if (needStatuses.includes("SKIPPED")) {
      return hasAlways
        ? (unsupportedJob() ?? {
            job_id: job.id,
            context,
            status: "ELIGIBLE",
            reason: "always_overrides_skipped_needs",
          })
        : {
            job_id: job.id,
            context,
            status: "SKIPPED",
            reason: "needs_skipped",
          };
    }
    if (needs.length === 0) {
      return (
        unsupportedJob() ?? {
          job_id: job.id,
          context,
          status: "ELIGIBLE",
          reason: "eligible",
        }
      );
    }
    return hasAlways
      ? (unsupportedJob() ?? {
          job_id: job.id,
          context,
          status: "ELIGIBLE",
          reason: "always_eligible",
        })
      : (unsupportedJob() ?? {
          job_id: job.id,
          context,
          status: "CONDITIONAL_AFTER_NEEDS",
          reason: "needs_pending",
        });
  };

  for (const job of jobs) {
    const context = jobContext(job);
    if (invalid.has(job.id)) {
      statusById.set(job.id, {
        job_id: job.id,
        context,
        status: "INVALID",
        reason: invalid.get(job.id) ?? "invalid",
      });
    } else if (!input.workflow_triggered) {
      statusById.set(job.id, {
        job_id: job.id,
        context,
        status: "SKIPPED",
        reason: "workflow_not_triggered",
      });
    }
  }
  for (const id of evalOrder) {
    const job = byId.get(id);
    if (job !== undefined) statusById.set(id, evaluateOne(job));
  }
  return jobs.map(
    (job) =>
      statusById.get(job.id) ?? {
        job_id: job.id,
        context: jobContext(job),
        status: "UNKNOWN",
        reason: "not_evaluated",
      },
  );
}

// ---------------------------------------------------------------------------
// Formal multi-workflow entry points (keyed by (workflow, job_id)).
// ---------------------------------------------------------------------------

/**
 * Evaluate one workflow's jobs from its formal WorkflowIR jobs and a
 * validated ScenarioV1. Each result carries its `workflow_path` and
 * its canonical `key`, so results from different workflows can be
 * combined without job_id collisions.
 */
export function evaluateJobsKeyed(input: JobDagInput): KeyedJobEvaluation[] {
  const evaluated = evaluateJobs({
    workflow_triggered: input.workflow_triggered,
    trigger_reason: input.trigger_reason ?? null,
    scenario: ifContextFromScenario(input.scenario),
    jobs: input.jobs.map((job) => ({
      id: job.id,
      name: job.name ?? null,
      needs: job.needs ?? [],
      if: job.if ?? null,
      // FIX-P0-01: carry unsupported_job through the keyed path.
      // Dropping it here made evaluateJobs() never see ADR-04
      // matrix / reusable-workflow jobs in the formal pipeline
      // (buildReport -> runFormalPipeline), so the shipped CLI
      // reported them ELIGIBLE / REPORTABLE_PENDING (false PASS)
      // while evaluateE2E() (which keeps the field) and the Oracle
      // correctly reported UNKNOWN. No other semantics change:
      // evaluateJobs() itself is untouched.
      unsupported_job: job.unsupported_job ?? null,
    })),
    required_checks: [],
  });
  return evaluated.map((job) => ({
    ...job,
    workflow_path: input.workflow_path,
    key: jobKey({ workflow_path: input.workflow_path, job_id: job.job_id }),
  }));
}

/**
 * Evaluate one workflow's jobs given its trigger outcome. Branching
 * mirrors the Oracle's evaluate_e2e_fixture and e2e.ts exactly:
 * trigger INVALID -> every job INVALID / "trigger_invalid"; trigger
 * UNKNOWN (or a VALID trigger whose verdict is null) -> every job
 * UNKNOWN / "trigger_unknown"; otherwise the DAG runs with
 * `workflow_triggered` true/false.
 */
export function evaluateJobsForTrigger(input: {
  workflow_path: string;
  trigger: WorkflowTriggerState;
  scenario: ScenarioV1;
  jobs: WorkflowIRJob[];
}): KeyedJobEvaluation[] {
  const keyed = (job: WorkflowIRJob, status: JobStatus, reason: string): KeyedJobEvaluation => ({
    job_id: job.id,
    context: job.name ?? job.id,
    status,
    reason,
    workflow_path: input.workflow_path,
    key: jobKey({ workflow_path: input.workflow_path, job_id: job.id }),
  });
  if (input.trigger === "invalid") {
    return input.jobs.map((job) => keyed(job, "INVALID", "trigger_invalid"));
  }
  if (input.trigger === "unknown") {
    return input.jobs.map((job) => keyed(job, "UNKNOWN", "trigger_unknown"));
  }
  return evaluateJobsKeyed({
    workflow_path: input.workflow_path,
    workflow_triggered: input.trigger === "triggered",
    scenario: input.scenario,
    jobs: input.jobs,
  });
}
