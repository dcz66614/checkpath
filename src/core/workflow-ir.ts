// T006 — YAML -> WorkflowIR builder (formal).
//
// Closes the T005 open item U-01: this is the single place that turns
// raw workflow YAML into a validated `WorkflowIR`
// (`checkpath.workflow-ir/v1`, types.ts). It does NOT re-implement
// parsing — it composes the existing pieces, each of which stays the
// single home of its own logic:
//   * `parseWorkflowYaml` (workflow-parser.ts) — `on:` parsing, filter
//     normalization, VALID / INVALID / UNKNOWN status, unsupported
//     detection. The trigger events below are taken verbatim from its
//     output, so the builder can never disagree with the trigger
//     evaluator about what a workflow declares.
//   * `extractJobs` (e2e.ts) — `jobs:` extraction in file order, with
//     the S0 scalar normalization (`if: false` -> "false", non-scalar
//     `if` -> "__unsupported_if__", non-scalar `needs` entry ->
//     "__invalid_needs__").
//   * `validateWorkflowIR` (validate.ts) — the schema verdict on the
//     built IR; its issues are reported, not hidden.
// The workflow display `name:` is the only field read here directly
// (one `yaml.parse` call, string-or-null); it is display-only and does
// not affect any verdict.
//
// Builder contract:
//   * Trigger status VALID + schema validation clean -> `ok: true` and
//     a `WorkflowIR` ready for `evaluateWorkflowTrigger`.
//   * Trigger status INVALID / UNKNOWN -> `ok: false`, `workflow:
//     null`, and the parse `status` / `errors` / `unsupported` carried
//     through, so callers can reproduce the PoC TriggerIR (including
//     its null evaluation) without re-parsing.
//   * Trigger status VALID but schema validation issues (e.g. duplicate
//     job ids, a `needs` reference to an undeclared job — checks the
//     trigger parser does not do) -> `ok: false`, `workflow` still
//     present (trigger evaluation is unaffected by job-level issues),
//     `validationIssues` naming the problems. Job-level validity is
//     T007's (DAG) concern; the builder must not silently drop the IR
//     a trigger evaluation needs.
//   * Unparseable YAML, a non-mapping root, or a missing `on:` key ->
//     INVALID with the parser's error codes; `workflow: null`.
// `source_path` is carried as given; validateWorkflowIR rejects
// absolute paths, backslashes and `..` segments, so a bad path fails
// the build instead of entering a report (PROJECT_BOOK §6.3: reports
// must not contain absolute workspace paths).

import { parse } from "yaml";
import { parseWorkflowYaml, type TriggerIR } from "./workflow-parser.js";
import { extractJobs } from "./e2e.js";
import { validateWorkflowIR } from "./validate.js";
import type {
  EventName,
  TriggerStatus,
  ValidationIssue,
  WorkflowIR,
  WorkflowIREvent,
  WorkflowIRJob,
} from "./types.js";

export interface WorkflowIRBuildResult {
  /** True only when a schema-valid WorkflowIR was produced. */
  ok: boolean;
  /** The built IR, or null when no valid IR could be produced. */
  workflow: WorkflowIR | null;
  /** The trigger IR the parse produced (always present: it carries status / errors / unsupported). */
  trigger: TriggerIR;
  /** Parse status of the workflow's `on:` config. */
  status: TriggerStatus;
  /** Parse errors (INVALID) / unsupported reasons (UNKNOWN), from the parser. */
  errors: string[];
  unsupported: string[];
  /** Schema-validation issues on the built IR (empty when clean). */
  validationIssues: ValidationIssue[];
}

/**
 * Build a WorkflowIR from raw workflow YAML text.
 * `sourcePath` is the workspace-relative path used in reports
 * (e.g. ".github/workflows/ci.yml"); `fixtureId` is carried into the
 * trigger IR for cross-implementation comparison.
 */
export function buildWorkflowIR(
  yamlText: string,
  sourcePath: string,
  fixtureId: string,
): WorkflowIRBuildResult {
  const trigger = parseWorkflowYaml(yamlText, fixtureId);
  const unsupported = [...trigger.evaluation.unsupported];
  const base = {
    trigger,
    status: trigger.status,
    errors: [...trigger.errors],
    unsupported,
    validationIssues: [] as ValidationIssue[],
  };

  if (trigger.status !== "VALID") {
    return { ...base, ok: false, workflow: null };
  }

  // Events: verbatim from the parser (names are supported events here,
  // because VALID means every event name passed the supported check).
  const events: WorkflowIREvent[] = trigger.events.map((e) => ({
    name: e.name as EventName,
    types: e.types,
    branches: e.branches,
    branches_ignore: e.branches_ignore,
    paths: e.paths,
    paths_ignore: e.paths_ignore,
  }));

  // Jobs: from the shared extractor (file order preserved).
  const jobs: WorkflowIRJob[] = extractJobs(yamlText).map((job) => ({
    id: job.id,
    name: job.name ?? null,
    needs: job.needs ?? [],
    if: job.if ?? null,
    // §4.5 context derivation: `name` when declared, else `job_id`.
    context: job.name ?? job.id,
    unsupported_job: job.unsupported_job ?? null,
  }));

  // Display name: the only field read directly here (display-only).
  let workflowName: string | null = null;
  try {
    const doc: unknown = parse(yamlText);
    if (doc !== null && typeof doc === "object" && !Array.isArray(doc)) {
      const raw = (doc as Record<string, unknown>)["name"];
      workflowName = typeof raw === "string" ? raw : null;
    }
  } catch {
    workflowName = null;
  }

  const workflow: WorkflowIR = {
    schema: "checkpath.workflow-ir/v1",
    source_path: sourcePath,
    name: workflowName,
    on: events,
    jobs,
  };

  const validation = validateWorkflowIR(workflow);
  if (!validation.ok) {
    return {
      ...base,
      ok: false,
      workflow,
      validationIssues: validation.issues,
    };
  }
  // Return the validator's normalized value (not the pre-validation
  // object): normalization (empty `if` -> null, `needs` default) is
  // part of the WorkflowIR contract (types.ts), so the built IR must
  // already be in normalized form.
  return { ...base, ok: true, workflow: validation.value, validationIssues: [] };
}
