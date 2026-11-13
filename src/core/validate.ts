// T005 — Input validation for the four canonical schemas (types.ts).
//
// Every validator takes `unknown` (typically parsed JSON), collects ALL
// issues in one pass in deterministic order (schema declaration order,
// array index order — never input key order), and returns either the
// normalized typed value or the issue list. Validators never throw on
// malformed input; only `validateJsonText` reports unparseable JSON
// (code `invalid_json`) instead of throwing.
//
// Error-code contract (stable codes, one per failure class):
//   missing_field          required key absent
//   wrong_type             value present but not the expected JSON type
//   invalid_schema_version `schema` present but not the frozen version
//   invalid_value          right type, disallowed value (bad enum, empty
//                          string where non-empty is required, negative
//                          or non-integer count, bad hash format, ...)
//   unknown_field          key outside the frozen schema (strict reject;
//                          nothing is silently dropped — see types.ts)
//   duplicate_value        duplicate job id, duplicate `on` event name,
//                          duplicate `needs` entry
//                          (NOT duplicate required-check context — see
//                          ADR FIX-P1-01/01: duplicate manifest entries
//                          are admitted and resolved one row per entry,
//                          per the frozen T008 resolver / Oracle
//                          semantics; the validator no longer rejects
//                          them.)
//   unknown_reference      job `needs` naming a job id that is not
//                          declared in the same workflow
//   inconsistent_value     cross-field contradiction (branches with
//                          branches-ignore, paths with paths-ignore,
//                          job `context` != name ?? id, diff algorithm
//                          not matching the event, counts contradicting
//                          each other, provider_count contradicting
//                          provider_job_id)
//   invalid_json           text is not parseable JSON (validateJsonText)
//
// What schema validation deliberately does NOT do (evaluation's job):
//   * Glob syntax, `if` expression support, trigger matching — T006/T007.
//   * Whether a missing branch/action makes a verdict UNKNOWN — the
//     evaluator treats a null branch/action as "cannot decide" (§4.2);
//     the schema only requires the fields to be present-or-null with
//     the right types, so a pull_request scenario without base_branch
//     is structurally VALID.
//   * Recomputing `report_sha256` — format only (see ReportV1 in types.ts).
//   * Judging an external required-check `source` — any non-empty
//     string is structurally valid; the resolver maps non
//     "github-actions" sources to UNKNOWN (§4.5).

import {
  REQUIRED_CHECKS_SCHEMA,
  REPORT_SCHEMA,
  SCENARIO_SCHEMA,
  SUPPORTED_EVENTS,
  WITNESS_KINDS,
  WORKFLOW_IR_SCHEMA,
  type CheckStatus,
  type DiffAlgorithm,
  type EventName,
  type JobStatus,
  type ReportEventEvaluation,
  type ReportJobEvaluation,
  type ReportRequiredCheckResult,
  type ReportV1,
  type ReportWitness,
  type ReportWorkflowEvaluation,
  type RequiredCheckEntry,
  type RequiredChecksV1,
  type ScenarioDiff,
  type ScenarioEvent,
  type ScenarioV1,
  type TriggerStatus,
  type ValidationErrorCode,
  type ValidationIssue,
  type ValidationResult,
  type WitnessKind,
  type WorkflowIREvent,
  type WorkflowIRJob,
  type WorkflowIR,
} from "./types.js";

const JOB_STATUSES: readonly JobStatus[] = [
  "ELIGIBLE",
  "SKIPPED",
  "CONDITIONAL_AFTER_NEEDS",
  "UNKNOWN",
  "INVALID",
];

const CHECK_STATUSES: readonly CheckStatus[] = [
  "REPORTABLE_PENDING",
  "SKIPPED_SUCCESS",
  "PENDING_NOT_REPORTED",
  "AMBIGUOUS",
  "UNKNOWN",
  "INVALID",
];

const TRIGGER_STATUSES: readonly TriggerStatus[] = ["VALID", "INVALID", "UNKNOWN"];

const SHA256_HEX = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// Small helpers. Every helper appends at most one issue per call and
// returns the normalized value (or null when unusable); callers keep
// collecting so one input yields the full issue list.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(
  issues: ValidationIssue[],
  code: ValidationErrorCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function checkUnknownFields(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      issue(issues, "unknown_field", `${path}.${key}`, `unknown field "${key}"`);
    }
  }
}

function checkSchemaVersion(
  obj: Record<string, unknown>,
  expected: string,
  issues: ValidationIssue[],
): void {
  if (!("schema" in obj)) {
    issue(issues, "missing_field", "schema", `missing required field "schema" (expected "${expected}")`);
    return;
  }
  const schema = obj["schema"];
  if (typeof schema !== "string") {
    issue(issues, "wrong_type", "schema", `"schema" must be a string`);
    return;
  }
  if (schema !== expected) {
    issue(issues, "invalid_schema_version", "schema", `unsupported schema version "${schema}" (expected "${expected}")`);
  }
}

/** Required non-empty string. Returns null and records an issue on failure. */
function reqNonEmptyString(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | null {
  const fieldPath = `${path}.${key}`;
  if (!(key in obj)) {
    issue(issues, "missing_field", fieldPath, `missing required field "${key}"`);
    return null;
  }
  const value = obj[key];
  if (typeof value !== "string") {
    issue(issues, "wrong_type", fieldPath, `"${key}" must be a string`);
    return null;
  }
  if (value.length === 0) {
    issue(issues, "invalid_value", fieldPath, `"${key}" must not be empty`);
    return null;
  }
  return value;
}

/** Optional nullable string; absent -> null. Empty string is invalid when present. */
function optNullableString(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | null {
  const fieldPath = `${path}.${key}`;
  if (!(key in obj) || obj[key] === null || obj[key] === undefined) return null;
  const value = obj[key];
  if (typeof value !== "string") {
    issue(issues, "wrong_type", fieldPath, `"${key}" must be a string or null`);
    return null;
  }
  if (value.length === 0) {
    issue(issues, "invalid_value", fieldPath, `"${key}" must not be empty`);
    return null;
  }
  return value;
}

/** Required string that may be empty (e.g. commit_message). Absent -> defaultValue. */
function reqStringOrDefault(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  defaultValue: string,
): string {
  const fieldPath = `${path}.${key}`;
  if (!(key in obj) || obj[key] === null || obj[key] === undefined) return defaultValue;
  const value = obj[key];
  if (typeof value !== "string") {
    issue(issues, "wrong_type", fieldPath, `"${key}" must be a string`);
    return defaultValue;
  }
  return value;
}

/** Optional nullable boolean; absent -> null. */
function optNullableBoolean(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): boolean | null {
  const fieldPath = `${path}.${key}`;
  if (!(key in obj) || obj[key] === null || obj[key] === undefined) return null;
  if (typeof obj[key] !== "boolean") {
    issue(issues, "wrong_type", fieldPath, `"${key}" must be a boolean or null`);
    return null;
  }
  return obj[key] as boolean;
}

/** Required boolean. */
function reqBoolean(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): boolean | null {
  const fieldPath = `${path}.${key}`;
  if (!(key in obj)) {
    issue(issues, "missing_field", fieldPath, `missing required field "${key}"`);
    return null;
  }
  if (typeof obj[key] !== "boolean") {
    issue(issues, "wrong_type", fieldPath, `"${key}" must be a boolean`);
    return null;
  }
  return obj[key] as boolean;
}

/** Optional nullable non-negative integer; absent -> null. Non-integers and negatives are invalid_value. */
function optNullableNonNegativeInt(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): number | null {
  const fieldPath = `${path}.${key}`;
  if (!(key in obj) || obj[key] === null || obj[key] === undefined) return null;
  const value = obj[key];
  if (typeof value !== "number") {
    issue(issues, "wrong_type", fieldPath, `"${key}" must be a number or null`);
    return null;
  }
  if (!Number.isInteger(value) || value < 0) {
    issue(issues, "invalid_value", fieldPath, `"${key}" must be a non-negative integer`);
    return null;
  }
  return value;
}

/** Required non-negative integer. */
function reqNonNegativeInt(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): number | null {
  const fieldPath = `${path}.${key}`;
  if (!(key in obj)) {
    issue(issues, "missing_field", fieldPath, `missing required field "${key}"`);
    return null;
  }
  const value = obj[key];
  if (typeof value !== "number") {
    issue(issues, "wrong_type", fieldPath, `"${key}" must be a number`);
    return null;
  }
  if (!Number.isInteger(value) || value < 0) {
    issue(issues, "invalid_value", fieldPath, `"${key}" must be a non-negative integer`);
    return null;
  }
  return value;
}

/**
 * Optional string-or-list of non-empty strings, normalized to string[] | null.
 * Mirrors the S0 parser's `stringOrList` (workflow-parser.ts).
 */
function optStringList(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string[] | null {
  const fieldPath = `${path}.${key}`;
  if (!(key in obj) || obj[key] === null || obj[key] === undefined) return null;
  const value = obj[key];
  const list = typeof value === "string" ? [value] : value;
  if (!Array.isArray(list)) {
    issue(issues, "wrong_type", fieldPath, `"${key}" must be a string or an array of strings`);
    return null;
  }
  let valid = true;
  for (let i = 0; i < list.length; i++) {
    if (typeof list[i] !== "string" || (list[i] as string).length === 0) {
      issue(
        issues,
        typeof list[i] !== "string" ? "wrong_type" : "invalid_value",
        `${fieldPath}[${i}]`,
        `"${key}[${i}]" must be a non-empty string`,
      );
      valid = false;
    }
  }
  return valid ? [...(list as string[])] : null;
}

/** Required string array of non-empty strings (ScenarioV1 changed_files). */
function reqStringArray(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string[] | null {
  const fieldPath = `${path}.${key}`;
  if (!(key in obj)) {
    issue(issues, "missing_field", fieldPath, `missing required field "${key}"`);
    return null;
  }
  const value = obj[key];
  if (!Array.isArray(value)) {
    issue(issues, "wrong_type", fieldPath, `"${key}" must be an array of strings`);
    return null;
  }
  let valid = true;
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string" || (value[i] as string).length === 0) {
      issue(
        issues,
        typeof value[i] !== "string" ? "wrong_type" : "invalid_value",
        `${fieldPath}[${i}]`,
        `"${key}[${i}]" must be a non-empty string`,
      );
      valid = false;
    }
  }
  return valid ? [...(value as string[])] : null;
}

/** Required enum value (string membership). */
function reqEnum<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  allowed: readonly T[],
  issues: ValidationIssue[],
): T | null {
  const fieldPath = `${path}.${key}`;
  if (!(key in obj)) {
    issue(issues, "missing_field", fieldPath, `missing required field "${key}"`);
    return null;
  }
  const value = obj[key];
  if (typeof value !== "string") {
    issue(issues, "wrong_type", fieldPath, `"${key}" must be a string`);
    return null;
  }
  if (!(allowed as readonly string[]).includes(value)) {
    issue(
      issues,
      "invalid_value",
      fieldPath,
      `"${key}" must be one of ${allowed.map((a) => `"${a}"`).join(", ")} (got "${value}")`,
    );
    return null;
  }
  return value as T;
}

/** Required lowercase 64-hex SHA-256 string. */
function reqSha256(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | null {
  const value = reqNonEmptyString(obj, key, path, issues);
  if (value === null) return null;
  if (!SHA256_HEX.test(value)) {
    issue(issues, "invalid_value", `${path}.${key}`, `"${key}" must be a lowercase 64-hex SHA-256 digest`);
    return null;
  }
  return value;
}

function finish<T>(issues: ValidationIssue[], value: T): ValidationResult<T> {
  if (issues.length > 0) return { ok: false, value: null, issues };
  return { ok: true, value, issues: [] };
}

function rootIssues(input: unknown): ValidationIssue[] | null {
  if (!isRecord(input)) {
    return [
      {
        code: "wrong_type",
        path: "$",
        message: "document must be a JSON object",
      },
    ];
  }
  return null;
}

// ---------------------------------------------------------------------------
// ScenarioV1 — checkpath.scenario/v1
// ---------------------------------------------------------------------------

const SCENARIO_EVENT_FIELDS = [
  "name",
  "action",
  "branch",
  "base_branch",
  "head_branch",
  "target_branch",
  "ref",
  "commit_message",
] as const;

const SCENARIO_DIFF_FIELDS = [
  "algorithm",
  "changed_files",
  "changed_files_total",
  "returned_files",
  "complete",
  "first_3000_confirmed",
  "diff_timed_out",
  "push_commit_count",
] as const;

function validateScenarioEvent(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): ScenarioEvent | null {
  if (!isRecord(raw)) {
    issue(issues, "wrong_type", path, `"event" must be an object`);
    return null;
  }
  checkUnknownFields(raw, SCENARIO_EVENT_FIELDS, path, issues);
  const name = reqEnum<EventName>(raw, "name", path, SUPPORTED_EVENTS, issues);
  return {
    name: name ?? "pull_request",
    action: optNullableString(raw, "action", path, issues),
    branch: optNullableString(raw, "branch", path, issues),
    base_branch: optNullableString(raw, "base_branch", path, issues),
    head_branch: optNullableString(raw, "head_branch", path, issues),
    target_branch: optNullableString(raw, "target_branch", path, issues),
    ref: optNullableString(raw, "ref", path, issues),
    commit_message: reqStringOrDefault(raw, "commit_message", path, issues, ""),
  };
}

function validateScenarioDiff(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): ScenarioDiff | null {
  if (!isRecord(raw)) {
    issue(issues, "wrong_type", path, `"diff" must be an object`);
    return null;
  }
  checkUnknownFields(raw, SCENARIO_DIFF_FIELDS, path, issues);
  const algorithm = reqEnum<DiffAlgorithm>(raw, "algorithm", path, ["two-dot", "three-dot"], issues);
  const changedFiles = reqStringArray(raw, "changed_files", path, issues);
  const total = optNullableNonNegativeInt(raw, "changed_files_total", path, issues);
  const returned = optNullableNonNegativeInt(raw, "returned_files", path, issues);
  const diff: ScenarioDiff = {
    algorithm: algorithm ?? "three-dot",
    changed_files: changedFiles ?? [],
    changed_files_total: total,
    returned_files: returned,
    complete: optNullableBoolean(raw, "complete", path, issues),
    first_3000_confirmed: optNullableBoolean(raw, "first_3000_confirmed", path, issues),
    diff_timed_out: optNullableBoolean(raw, "diff_timed_out", path, issues),
    push_commit_count: optNullableNonNegativeInt(raw, "push_commit_count", path, issues),
  };
  if (total !== null && changedFiles !== null && total < changedFiles.length) {
    issue(
      issues,
      "inconsistent_value",
      `${path}.changed_files_total`,
      `"changed_files_total" (${total}) must not be smaller than the number of listed changed_files (${changedFiles.length})`,
    );
  }
  if (returned !== null && total !== null && returned > total) {
    issue(
      issues,
      "inconsistent_value",
      `${path}.returned_files`,
      `"returned_files" (${returned}) must not exceed "changed_files_total" (${total})`,
    );
  }
  return diff;
}

/** Validate an unknown value as ScenarioV1, returning the normalized scenario or all issues. */
export function validateScenario(input: unknown): ValidationResult<ScenarioV1> {
  const root = rootIssues(input);
  if (root !== null) return { ok: false, value: null, issues: root };
  const obj = input as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  checkUnknownFields(obj, ["schema", "scenario_id", "event", "diff"], "$", issues);
  checkSchemaVersion(obj, SCENARIO_SCHEMA, issues);
  const scenarioId = reqNonEmptyString(obj, "scenario_id", "$", issues);

  let event: ScenarioEvent | null = null;
  if (!("event" in obj)) {
    issue(issues, "missing_field", "$.event", `missing required field "event"`);
  } else {
    event = validateScenarioEvent(obj["event"], "$.event", issues);
  }
  let diff: ScenarioDiff | null = null;
  if (!("diff" in obj)) {
    issue(issues, "missing_field", "$.diff", `missing required field "diff"`);
  } else {
    diff = validateScenarioDiff(obj["diff"], "$.diff", issues);
  }

  // §4.3: push uses two-dot, pull_request / merge_group use three-dot.
  // Only checked when the raw event name itself is a supported event;
  // an illegal event name already produced invalid_value above.
  if (event !== null && diff !== null) {
    const rawEvent = obj["event"] as Record<string, unknown>;
    const rawName = rawEvent["name"];
    if (
      typeof rawName === "string" &&
      (SUPPORTED_EVENTS as readonly string[]).includes(rawName)
    ) {
      const expected: DiffAlgorithm = rawName === "push" ? "two-dot" : "three-dot";
      const rawAlgorithm = (obj["diff"] as Record<string, unknown>)["algorithm"];
      if (
        typeof rawAlgorithm === "string" &&
        (rawAlgorithm === "two-dot" || rawAlgorithm === "three-dot") &&
        rawAlgorithm !== expected
      ) {
        issue(
          issues,
          "inconsistent_value",
          "$.diff.algorithm",
          `"diff.algorithm" must be "${expected}" for event "${rawName}"`,
        );
      }
    }
  }

  return finish<ScenarioV1>(issues, {
    schema: SCENARIO_SCHEMA,
    scenario_id: scenarioId ?? "",
    event: event ?? {
      name: "pull_request",
      action: null,
      branch: null,
      base_branch: null,
      head_branch: null,
      target_branch: null,
      ref: null,
      commit_message: "",
    },
    diff: diff ?? {
      algorithm: "three-dot",
      changed_files: [],
      changed_files_total: null,
      returned_files: null,
      complete: null,
      first_3000_confirmed: null,
      diff_timed_out: null,
      push_commit_count: null,
    },
  });
}

// ---------------------------------------------------------------------------
// RequiredChecksV1 — checkpath.required-checks/v1
// ---------------------------------------------------------------------------

/** Validate an unknown value as RequiredChecksV1. */
export function validateRequiredChecks(input: unknown): ValidationResult<RequiredChecksV1> {
  const root = rootIssues(input);
  if (root !== null) return { ok: false, value: null, issues: root };
  const obj = input as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  checkUnknownFields(obj, ["schema", "required_checks"], "$", issues);
  checkSchemaVersion(obj, REQUIRED_CHECKS_SCHEMA, issues);

  const entries: RequiredCheckEntry[] = [];
  if (!("required_checks" in obj)) {
    issue(issues, "missing_field", "$.required_checks", `missing required field "required_checks"`);
  } else if (!Array.isArray(obj["required_checks"])) {
    issue(issues, "wrong_type", "$.required_checks", `"required_checks" must be an array`);
  } else {
    const list = obj["required_checks"] as unknown[];
    for (let i = 0; i < list.length; i++) {
      const path = `$.required_checks[${i}]`;
      const raw = list[i];
      if (!isRecord(raw)) {
        issue(issues, "wrong_type", path, `required check entry must be an object`);
        continue;
      }
      checkUnknownFields(raw, ["context", "source"], path, issues);
      const context = reqNonEmptyString(raw, "context", path, issues);
      const source = reqStringOrDefault(raw, "source", path, issues, "github-actions");
      // ADR FIX-P1-01/01: duplicate contexts are ADMITTED, not rejected.
      // Each manifest entry resolves independently (T008: T8-05 same
      // context `unit-tests` x3 with different sources, T8-10 three
      // identical entries; Oracle accepts them; golden G-57 is the
      // T8-05 copy). Entries are distinguished by `source` (and by
      // position); the resolver's `duplicate_context` / AMBIGUOUS
      // verdict is about two PROVIDERS sharing one context, not about
      // two manifest entries sharing one. The T005 decision to reject
      // duplicates is superseded by this ADR; `duplicate_value` still
      // applies to job ids, `on` event names and `needs` entries.
      entries.push({ context: context ?? "", source });
    }
  }

  return finish<RequiredChecksV1>(issues, {
    schema: REQUIRED_CHECKS_SCHEMA,
    required_checks: entries,
  });
}

// ---------------------------------------------------------------------------
// WorkflowIR — checkpath.workflow-ir/v1
// ---------------------------------------------------------------------------

const WORKFLOW_EVENT_FIELDS = [
  "name",
  "types",
  "branches",
  "branches_ignore",
  "paths",
  "paths_ignore",
] as const;

const WORKFLOW_JOB_FIELDS = [
  "id",
  "name",
  "needs",
  "if",
  "context",
  "unsupported_job",
] as const;

function validateWorkflowEvent(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkflowIREvent | null {
  if (!isRecord(raw)) {
    issue(issues, "wrong_type", path, `workflow "on" entry must be an object`);
    return null;
  }
  checkUnknownFields(raw, WORKFLOW_EVENT_FIELDS, path, issues);
  const name = reqEnum<EventName>(raw, "name", path, SUPPORTED_EVENTS, issues);
  const branches = optStringList(raw, "branches", path, issues);
  const branchesIgnore = optStringList(raw, "branches_ignore", path, issues);
  const paths = optStringList(raw, "paths", path, issues);
  const pathsIgnore = optStringList(raw, "paths_ignore", path, issues);
  if (branches !== null && branchesIgnore !== null) {
    issue(
      issues,
      "inconsistent_value",
      path,
      `"branches" and "branches_ignore" must not both be present (they are mutually exclusive, §1 decision 6)`,
    );
  }
  if (paths !== null && pathsIgnore !== null) {
    issue(
      issues,
      "inconsistent_value",
      path,
      `"paths" and "paths_ignore" must not both be present (they are mutually exclusive, §1 decision 6)`,
    );
  }
  return {
    name: name ?? "push",
    types: optStringList(raw, "types", path, issues),
    branches,
    branches_ignore: branchesIgnore,
    paths,
    paths_ignore: pathsIgnore,
  };
}

/** Validate an unknown value as WorkflowIR. */
export function validateWorkflowIR(input: unknown): ValidationResult<WorkflowIR> {
  const root = rootIssues(input);
  if (root !== null) return { ok: false, value: null, issues: root };
  const obj = input as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  checkUnknownFields(obj, ["schema", "source_path", "name", "on", "jobs"], "$", issues);
  checkSchemaVersion(obj, WORKFLOW_IR_SCHEMA, issues);

  const sourcePath = reqNonEmptyString(obj, "source_path", "$", issues);
  if (sourcePath !== null && (sourcePath.startsWith("/") || sourcePath.includes("\\") || sourcePath.split("/").includes(".."))) {
    issue(issues, "invalid_value", "$.source_path", `"source_path" must be a workspace-relative path (no absolute path, backslash, or ".." segment)`);
  }
  const workflowName = optNullableString(obj, "name", "$", issues);

  const events: WorkflowIREvent[] = [];
  if (!("on" in obj)) {
    issue(issues, "missing_field", "$.on", `missing required field "on"`);
  } else if (!Array.isArray(obj["on"])) {
    issue(issues, "wrong_type", "$.on", `"on" must be an array of event entries`);
  } else {
    const onList = obj["on"] as unknown[];
    if (onList.length === 0) {
      issue(issues, "invalid_value", "$.on", `"on" must contain at least one event`);
    }
    const seenEvents = new Set<string>();
    for (let i = 0; i < onList.length; i++) {
      const event = validateWorkflowEvent(onList[i], `$.on[${i}]`, issues);
      if (event !== null) {
        if (seenEvents.has(event.name)) {
          issue(issues, "duplicate_value", `$.on[${i}].name`, `duplicate event "${event.name}" in "on"`);
        }
        seenEvents.add(event.name);
        events.push(event);
      }
    }
  }

  // Two passes over jobs: first collect declared ids (for duplicate and
  // unknown-reference checks), then validate each job.
  const rawJobs: unknown[] = Array.isArray(obj["jobs"]) ? (obj["jobs"] as unknown[]) : [];
  const declaredIds = new Set<string>();
  for (const raw of rawJobs) {
    if (isRecord(raw) && typeof raw["id"] === "string") declaredIds.add(raw["id"]);
  }

  const jobs: WorkflowIRJob[] = [];
  if (!("jobs" in obj)) {
    issue(issues, "missing_field", "$.jobs", `missing required field "jobs"`);
  } else if (!Array.isArray(obj["jobs"])) {
    issue(issues, "wrong_type", "$.jobs", `"jobs" must be an array`);
  } else {
    if (rawJobs.length === 0) {
      issue(issues, "invalid_value", "$.jobs", `"jobs" must contain at least one job`);
    }
    const seenIds = new Set<string>();
    for (let i = 0; i < rawJobs.length; i++) {
      const path = `$.jobs[${i}]`;
      const raw = rawJobs[i];
      if (!isRecord(raw)) {
        issue(issues, "wrong_type", path, `job entry must be an object`);
        continue;
      }
      checkUnknownFields(raw, WORKFLOW_JOB_FIELDS, path, issues);
      const id = reqNonEmptyString(raw, "id", path, issues);
      if (id !== null) {
        if (seenIds.has(id)) {
          issue(issues, "duplicate_value", `${path}.id`, `duplicate job id "${id}"`);
        }
        seenIds.add(id);
      }
      const name = optNullableString(raw, "name", path, issues);

      // needs: optional array of non-empty strings, default [].
      const needs: string[] = [];
      if ("needs" in raw && raw["needs"] !== null && raw["needs"] !== undefined) {
        const needsPath = `${path}.needs`;
        if (!Array.isArray(raw["needs"])) {
          issue(issues, "wrong_type", needsPath, `"needs" must be an array of job ids`);
        } else {
          const seenNeeds = new Set<string>();
          for (let j = 0; j < (raw["needs"] as unknown[]).length; j++) {
            const need = (raw["needs"] as unknown[])[j];
            if (typeof need !== "string" || need.length === 0) {
              issue(
                issues,
                typeof need !== "string" ? "wrong_type" : "invalid_value",
                `${needsPath}[${j}]`,
                `"needs[${j}]" must be a non-empty job id string`,
              );
              continue;
            }
            if (seenNeeds.has(need)) {
              issue(issues, "duplicate_value", `${needsPath}[${j}]`, `duplicate need "${need}"`);
            }
            seenNeeds.add(need);
            if (!declaredIds.has(need)) {
              issue(issues, "unknown_reference", `${needsPath}[${j}]`, `unknown job reference "${need}" (no job with this id is declared)`);
            }
            needs.push(need);
          }
        }
      }

      // if: optional string; empty / whitespace-only normalizes to null.
      let ifValue: string | null = null;
      if ("if" in raw && raw["if"] !== null && raw["if"] !== undefined) {
        if (typeof raw["if"] !== "string") {
          issue(issues, "wrong_type", `${path}.if`, `"if" must be a string or null`);
        } else if ((raw["if"] as string).trim().length > 0) {
          ifValue = raw["if"] as string;
        }
      }

      // context: required; must equal the §4.5 derivation name ?? id.
      const expectedContext = name ?? id ?? "";
      let context: string | null = null;
      if (!("context" in raw)) {
        issue(issues, "missing_field", `${path}.context`, `missing required field "context" (expected "${expectedContext}")`);
      } else if (typeof raw["context"] !== "string" || (raw["context"] as string).length === 0) {
        issue(
          issues,
          typeof raw["context"] !== "string" ? "wrong_type" : "invalid_value",
          `${path}.context`,
          `"context" must be a non-empty string`,
        );
      } else {
        context = raw["context"] as string;
        if (id !== null && context !== expectedContext) {
          issue(
            issues,
            "inconsistent_value",
            `${path}.context`,
            `"context" must be the job name when declared, else the job id (expected "${expectedContext}", got "${context}")`,
          );
        }
      }

      // unsupported_job: optional enum ("reusable_workflow" |
      // "matrix") or null; absent means an ordinary job (ADR T011/ADR-04).
      let unsupportedJob: "reusable_workflow" | "matrix" | null = null;
      if (
        "unsupported_job" in raw &&
        raw["unsupported_job"] !== null &&
        raw["unsupported_job"] !== undefined
      ) {
        if (
          raw["unsupported_job"] === "reusable_workflow" ||
          raw["unsupported_job"] === "matrix"
        ) {
          unsupportedJob = raw["unsupported_job"];
        } else {
          issue(
            issues,
            "invalid_value",
            `${path}.unsupported_job`,
            `"unsupported_job" must be "reusable_workflow", "matrix", or null`,
          );
        }
      }

      jobs.push({
        id: id ?? "",
        name,
        needs,
        if: ifValue,
        context: context ?? expectedContext,
        unsupported_job: unsupportedJob,
      });
    }
  }

  return finish<WorkflowIR>(issues, {
    schema: WORKFLOW_IR_SCHEMA,
    source_path: sourcePath ?? "",
    name: workflowName,
    on: events,
    jobs,
  });
}

// ---------------------------------------------------------------------------
// ReportV1 — checkpath.report/v1
// ---------------------------------------------------------------------------

const REPORT_TOP_FIELDS = [
  "schema",
  "tool_version",
  "scenario_id",
  "input_sha256",
  "workflow_set_sha256",
  "required_checks_sha256",
  "report_sha256",
  "event_evaluations",
  "workflow_evaluations",
  "job_evaluations",
  "required_check_results",
  "witnesses",
  "unsupported_features",
] as const;

function validateReportEventEvaluation(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): ReportEventEvaluation | null {
  if (!isRecord(raw)) {
    issue(issues, "wrong_type", path, `event evaluation must be an object`);
    return null;
  }
  checkUnknownFields(
    raw,
    ["workflow_path", "event_name", "action", "activity_type_match", "branch_match", "path_match", "commit_skip", "triggered", "reason"],
    path,
    issues,
  );
  const workflowPath = reqNonEmptyString(raw, "workflow_path", path, issues);
  const eventName = reqEnum<EventName>(raw, "event_name", path, SUPPORTED_EVENTS, issues);
  const commitSkip = reqBoolean(raw, "commit_skip", path, issues);
  const reason = reqNonEmptyString(raw, "reason", path, issues);
  return {
    workflow_path: workflowPath ?? "",
    event_name: eventName ?? "push",
    action: optNullableString(raw, "action", path, issues),
    activity_type_match: optNullableBoolean(raw, "activity_type_match", path, issues),
    branch_match: optNullableBoolean(raw, "branch_match", path, issues),
    path_match: optNullableBoolean(raw, "path_match", path, issues),
    commit_skip: commitSkip ?? false,
    triggered: optNullableBoolean(raw, "triggered", path, issues),
    reason: reason ?? "",
  };
}

function validateReportWorkflowEvaluation(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): ReportWorkflowEvaluation | null {
  if (!isRecord(raw)) {
    issue(issues, "wrong_type", path, `workflow evaluation must be an object`);
    return null;
  }
  checkUnknownFields(raw, ["workflow_path", "status", "triggered", "reason"], path, issues);
  const workflowPath = reqNonEmptyString(raw, "workflow_path", path, issues);
  const status = reqEnum<TriggerStatus>(raw, "status", path, TRIGGER_STATUSES, issues);
  const reason = reqNonEmptyString(raw, "reason", path, issues);
  return {
    workflow_path: workflowPath ?? "",
    status: status ?? "UNKNOWN",
    triggered: optNullableBoolean(raw, "triggered", path, issues),
    reason: reason ?? "",
  };
}

function validateReportJobEvaluation(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): ReportJobEvaluation | null {
  if (!isRecord(raw)) {
    issue(issues, "wrong_type", path, `job evaluation must be an object`);
    return null;
  }
  checkUnknownFields(raw, ["workflow_path", "job_id", "context", "status", "reason"], path, issues);
  const workflowPath = reqNonEmptyString(raw, "workflow_path", path, issues);
  const jobId = reqNonEmptyString(raw, "job_id", path, issues);
  const context = reqNonEmptyString(raw, "context", path, issues);
  const status = reqEnum<JobStatus>(raw, "status", path, JOB_STATUSES, issues);
  const reason = reqNonEmptyString(raw, "reason", path, issues);
  return {
    workflow_path: workflowPath ?? "",
    job_id: jobId ?? "",
    context: context ?? "",
    status: status ?? "UNKNOWN",
    reason: reason ?? "",
  };
}

function validateReportRequiredCheckResult(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): ReportRequiredCheckResult | null {
  if (!isRecord(raw)) {
    issue(issues, "wrong_type", path, `required check result must be an object`);
    return null;
  }
  checkUnknownFields(
    raw,
    ["context", "status", "provider_job_id", "provider_workflow_path", "provider_count", "reason"],
    path,
    issues,
  );
  const context = reqNonEmptyString(raw, "context", path, issues);
  const status = reqEnum<CheckStatus>(raw, "status", path, CHECK_STATUSES, issues);
  const providerJobId = optNullableString(raw, "provider_job_id", path, issues);
  const providerWorkflowPath = optNullableString(raw, "provider_workflow_path", path, issues);
  const providerCount = reqNonNegativeInt(raw, "provider_count", path, issues);
  const reason = reqNonEmptyString(raw, "reason", path, issues);
  // provider_count / provider identity must agree (§4.5): 0 providers ->
  // no provider identity; exactly 1 -> one identified provider; >= 2
  // (AMBIGUOUS) -> no single provider identity.
  if (providerCount !== null) {
    if (providerCount === 0 && (providerJobId !== null || providerWorkflowPath !== null)) {
      issue(issues, "inconsistent_value", `${path}.provider_count`, `"provider_count" is 0 but a provider job is identified`);
    }
    if (providerCount === 1 && (providerJobId === null || providerWorkflowPath === null)) {
      issue(issues, "inconsistent_value", `${path}.provider_count`, `"provider_count" is 1 but no provider job/workflow is identified`);
    }
    if (providerCount >= 2 && (providerJobId !== null || providerWorkflowPath !== null)) {
      issue(issues, "inconsistent_value", `${path}.provider_count`, `"provider_count" is ${providerCount} (ambiguous) but a single provider job is identified`);
    }
  }
  return {
    context: context ?? "",
    status: status ?? "UNKNOWN",
    provider_job_id: providerJobId,
    provider_workflow_path: providerWorkflowPath,
    provider_count: providerCount ?? 0,
    reason: reason ?? "",
  };
}

function validateReportWitness(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): ReportWitness | null {
  if (!isRecord(raw)) {
    issue(issues, "wrong_type", path, `witness must be an object`);
    return null;
  }
  checkUnknownFields(
    raw,
    ["id", "kind", "check_context", "first_blocking_condition", "scenario", "note"],
    path,
    issues,
  );
  const id = reqNonEmptyString(raw, "id", path, issues);
  const kind = reqEnum<WitnessKind>(raw, "kind", path, WITNESS_KINDS, issues);
  const checkContext = optNullableString(raw, "check_context", path, issues);
  const firstBlocking = reqNonEmptyString(raw, "first_blocking_condition", path, issues);
  const note = reqStringOrDefault(raw, "note", path, issues, "");
  let scenario: ScenarioV1 | null = null;
  if ("scenario" in raw && raw["scenario"] !== null && raw["scenario"] !== undefined) {
    const nested = validateScenario(raw["scenario"]);
    if (!nested.ok) {
      for (const nestedIssue of nested.issues) {
        // Re-root nested paths: "$.event..." -> "<witness path>.scenario.event...".
        const suffix = nestedIssue.path === "$" ? "" : nestedIssue.path.slice(1);
        issues.push({ ...nestedIssue, path: `${path}.scenario${suffix}` });
      }
    } else {
      scenario = nested.value;
    }
  }
  return {
    id: id ?? "",
    kind: kind ?? "invalid_input",
    check_context: checkContext,
    first_blocking_condition: firstBlocking ?? "",
    scenario,
    note,
  };
}

/** Validate an unknown value as ReportV1 (hash fields are format-checked only). */
export function validateReport(input: unknown): ValidationResult<ReportV1> {
  const root = rootIssues(input);
  if (root !== null) return { ok: false, value: null, issues: root };
  const obj = input as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  checkUnknownFields(obj, REPORT_TOP_FIELDS, "$", issues);
  checkSchemaVersion(obj, REPORT_SCHEMA, issues);
  const toolVersion = reqNonEmptyString(obj, "tool_version", "$", issues);
  const scenarioId = reqNonEmptyString(obj, "scenario_id", "$", issues);

  const validateArray = <T>(
    key: string,
    fn: (raw: unknown, path: string, issues: ValidationIssue[]) => T | null,
  ): T[] => {
    const out: T[] = [];
    if (!(key in obj)) {
      issue(issues, "missing_field", `$.${key}`, `missing required field "${key}"`);
      return out;
    }
    if (!Array.isArray(obj[key])) {
      issue(issues, "wrong_type", `$.${key}`, `"${key}" must be an array`);
      return out;
    }
    const list = obj[key] as unknown[];
    for (let i = 0; i < list.length; i++) {
      const item = fn(list[i], `$.${key}[${i}]`, issues);
      if (item !== null) out.push(item);
    }
    return out;
  };

  const report: ReportV1 = {
    schema: REPORT_SCHEMA,
    tool_version: toolVersion ?? "",
    scenario_id: scenarioId ?? "",
    input_sha256: reqSha256(obj, "input_sha256", "$", issues) ?? "",
    workflow_set_sha256: reqSha256(obj, "workflow_set_sha256", "$", issues) ?? "",
    required_checks_sha256: reqSha256(obj, "required_checks_sha256", "$", issues) ?? "",
    report_sha256: reqSha256(obj, "report_sha256", "$", issues) ?? "",
    event_evaluations: validateArray("event_evaluations", validateReportEventEvaluation),
    workflow_evaluations: validateArray("workflow_evaluations", validateReportWorkflowEvaluation),
    job_evaluations: validateArray("job_evaluations", validateReportJobEvaluation),
    required_check_results: validateArray("required_check_results", validateReportRequiredCheckResult),
    witnesses: validateArray("witnesses", validateReportWitness),
    unsupported_features: [],
  };

  if (!("unsupported_features" in obj)) {
    issue(issues, "missing_field", "$.unsupported_features", `missing required field "unsupported_features"`);
  } else if (!Array.isArray(obj["unsupported_features"])) {
    issue(issues, "wrong_type", "$.unsupported_features", `"unsupported_features" must be an array of strings`);
  } else {
    const list = obj["unsupported_features"] as unknown[];
    for (let i = 0; i < list.length; i++) {
      if (typeof list[i] !== "string" || (list[i] as string).length === 0) {
        issue(
          issues,
          typeof list[i] !== "string" ? "wrong_type" : "invalid_value",
          `$.unsupported_features[${i}]`,
          `"unsupported_features[${i}]" must be a non-empty string`,
        );
      } else {
        report.unsupported_features.push(list[i] as string);
      }
    }
  }

  return finish<ReportV1>(issues, report);
}

// ---------------------------------------------------------------------------
// JSON text entry point
// ---------------------------------------------------------------------------

/**
 * Parse JSON text and validate it with one of the four validators.
 * Unparseable text yields a single `invalid_json` issue instead of throwing.
 */
export function validateJsonText<T>(
  text: string,
  validator: (input: unknown) => ValidationResult<T>,
): ValidationResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      value: null,
      issues: [
        {
          code: "invalid_json",
          path: "$",
          message: `input is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
  return validator(parsed);
}

/** Render issues as stable one-line strings (`path: code: message`), in issue order. */
export function formatIssues(issues: readonly ValidationIssue[]): string[] {
  return issues.map((i) => `${i.path}: ${i.code}: ${i.message}`);
}
