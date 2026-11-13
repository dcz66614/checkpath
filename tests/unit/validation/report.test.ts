// T005 — ReportV1 validation tests.
//
// Covers: a minimal valid report (§6.3 required fields), a full report
// with one entry per section, hash-format checks, provider_count /
// provider-identity consistency (§4.5), nested witness scenario
// validation (issues re-rooted under the witness path), unknown fields,
// and every failure class on the report shape.
import { describe, expect, it } from "vitest";
import { validateReport } from "../../../src/core/validate.js";
import { codes, validScenario } from "../t005-fixtures.js";

const HASH = "0".repeat(64);
const OTHER_HASH = "a".repeat(64);

const minimalReport = {
  schema: "checkpath.report/v1",
  tool_version: "checkpath 0.1.0",
  scenario_id: "PR-DOCS-ONLY",
  input_sha256: HASH,
  workflow_set_sha256: HASH,
  required_checks_sha256: HASH,
  report_sha256: OTHER_HASH,
  event_evaluations: [],
  workflow_evaluations: [],
  job_evaluations: [],
  required_check_results: [],
  witnesses: [],
  unsupported_features: [],
};

describe("T005 ReportV1 validation", () => {
  it("accepts a minimal valid report", () => {
    const result = validateReport(minimalReport);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.input_sha256).toBe(HASH);
      expect(result.value.unsupported_features).toEqual([]);
    }
  });

  it("accepts a full report with one entry per section", () => {
    const full = {
      ...minimalReport,
      event_evaluations: [
        {
          workflow_path: ".github/workflows/ci.yml",
          event_name: "pull_request",
          action: "synchronize",
          activity_type_match: true,
          branch_match: true,
          path_match: false,
          commit_skip: false,
          triggered: false,
          reason: "path_mismatch",
        },
      ],
      workflow_evaluations: [
        {
          workflow_path: ".github/workflows/ci.yml",
          status: "VALID",
          triggered: false,
          reason: "path_mismatch",
        },
      ],
      job_evaluations: [
        {
          workflow_path: ".github/workflows/ci.yml",
          job_id: "test",
          context: "unit-tests",
          status: "SKIPPED",
          reason: "workflow_not_triggered",
        },
      ],
      required_check_results: [
        {
          context: "unit-tests",
          status: "PENDING_NOT_REPORTED",
          provider_job_id: "test",
          provider_workflow_path: ".github/workflows/ci.yml",
          provider_count: 1,
          reason: "workflow_not_triggered",
        },
      ],
      witnesses: [
        {
          id: "W-1",
          kind: "path_filter",
          check_context: "unit-tests",
          first_blocking_condition: "paths ['src/**'] did not match any changed file",
          scenario: validScenario,
          note: "",
        },
      ],
      unsupported_features: ["unsupported_glob:src/{a,b}/**"],
    };
    const result = validateReport(full);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.witnesses[0].scenario?.scenario_id).toBe("PR-DOCS-ONLY");
      expect(result.value.required_check_results[0].status).toBe("PENDING_NOT_REPORTED");
    }
  });

  it("missing report_sha256 -> missing_field; bad hash format -> invalid_value", () => {
    const noHash = structuredClone(minimalReport) as Record<string, unknown>;
    delete noHash["report_sha256"];
    expect(codes(validateReport(noHash))).toContain("missing_field");

    const badHash = { ...minimalReport, input_sha256: "xyz" };
    expect(codes(validateReport(badHash))).toContain("invalid_value");

    const upperHash = { ...minimalReport, input_sha256: "A".repeat(64) };
    expect(codes(validateReport(upperHash))).toContain("invalid_value");
  });

  it("missing arrays -> missing_field; wrong array type -> wrong_type", () => {
    const noArrays = structuredClone(minimalReport) as Record<string, unknown>;
    delete noArrays["job_evaluations"];
    expect(codes(validateReport(noArrays))).toContain("missing_field");

    const badArrays = { ...minimalReport, witnesses: "none" };
    expect(codes(validateReport(badArrays))).toContain("wrong_type");
  });

  it("illegal job / check / trigger status -> invalid_value", () => {
    const badJob = {
      ...minimalReport,
      job_evaluations: [
        {
          workflow_path: ".github/workflows/ci.yml",
          job_id: "test",
          context: "unit-tests",
          status: "RUNNING",
          reason: "eligible",
        },
      ],
    };
    expect(codes(validateReport(badJob))).toContain("invalid_value");

    const badCheck = {
      ...minimalReport,
      required_check_results: [
        {
          context: "unit-tests",
          status: "PASSED",
          provider_job_id: null,
          provider_workflow_path: null,
          provider_count: 0,
          reason: "no_provider",
        },
      ],
    };
    expect(codes(validateReport(badCheck))).toContain("invalid_value");
  });

  it("provider_count 0 with a provider job -> inconsistent_value", () => {
    const bad = {
      ...minimalReport,
      required_check_results: [
        {
          context: "unit-tests",
          status: "PENDING_NOT_REPORTED",
          provider_job_id: "test",
          provider_workflow_path: ".github/workflows/ci.yml",
          provider_count: 0,
          reason: "no_provider",
        },
      ],
    };
    expect(codes(validateReport(bad))).toContain("inconsistent_value");
  });

  it("provider_count 1 without a provider job -> inconsistent_value", () => {
    const bad = {
      ...minimalReport,
      required_check_results: [
        {
          context: "unit-tests",
          status: "REPORTABLE_PENDING",
          provider_job_id: null,
          provider_workflow_path: null,
          provider_count: 1,
          reason: "provider_reportable",
        },
      ],
    };
    expect(codes(validateReport(bad))).toContain("inconsistent_value");
  });

  it("provider_count 2 with a single provider job -> inconsistent_value (AMBIGUOUS has none)", () => {
    const bad = {
      ...minimalReport,
      required_check_results: [
        {
          context: "tests",
          status: "AMBIGUOUS",
          provider_job_id: "test-a",
          provider_workflow_path: ".github/workflows/a.yml",
          provider_count: 2,
          reason: "duplicate_context",
        },
      ],
    };
    expect(codes(validateReport(bad))).toContain("inconsistent_value");
  });

  it("a witness with an invalid nested scenario reports issues under the witness path", () => {
    const badScenario = structuredClone(validScenario);
    (badScenario.event as Record<string, unknown>)["name"] = "schedule";
    const bad = {
      ...minimalReport,
      witnesses: [
        {
          id: "W-1",
          kind: "path_filter",
          check_context: "unit-tests",
          first_blocking_condition: "paths did not match",
          scenario: badScenario,
          note: "",
        },
      ],
    };
    const result = validateReport(bad);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === "$.witnesses[0].scenario.event.name")).toBe(true);
  });

  it("unknown fields are rejected at report, entry and witness level", () => {
    const top = { ...minimalReport, generated_at: "2026-11-08" };
    expect(codes(validateReport(top))).toContain("unknown_field");

    const entry = {
      ...minimalReport,
      job_evaluations: [
        {
          workflow_path: ".github/workflows/ci.yml",
          job_id: "test",
          context: "unit-tests",
          status: "ELIGIBLE",
          reason: "eligible",
          duration_ms: 12,
        },
      ],
    };
    expect(codes(validateReport(entry))).toContain("unknown_field");
  });

  it("wrong schema version -> invalid_schema_version", () => {
    expect(codes(validateReport({ ...minimalReport, schema: "checkpath.report/v2" }))).toEqual([
      "invalid_schema_version",
    ]);
  });

  it("a non-string unsupported_features entry -> wrong_type", () => {
    const bad = { ...minimalReport, unsupported_features: ["ok", 42] };
    expect(codes(validateReport(bad))).toContain("wrong_type");
  });
});
