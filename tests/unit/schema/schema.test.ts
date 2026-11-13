// T005 — schema version constants + WorkflowIR contract tests.
//
// Covers: the four frozen schema versions, a valid WorkflowIR and its
// normalization (single-string filter -> list, empty `if` -> null),
// and every T005 failure class on the WorkflowIR shape: missing field,
// wrong type, illegal event, duplicate job id, unknown `needs`
// reference, unknown field, mutually exclusive filters, context
// derivation. Validators never throw on malformed input, and issue
// order is deterministic (same input -> identical issue JSON).
import { describe, expect, it } from "vitest";
import {
  REQUIRED_CHECKS_SCHEMA,
  REPORT_SCHEMA,
  SCENARIO_SCHEMA,
  WORKFLOW_IR_SCHEMA,
} from "../../../src/core/types.js";
import {
  formatIssues,
  validateReport,
  validateRequiredChecks,
  validateScenario,
  validateWorkflowIR,
} from "../../../src/core/validate.js";
import { codes, validWorkflowIR } from "../t005-fixtures.js";

describe("T005 schema versions", () => {
  it("freezes the four schema version strings", () => {
    expect(WORKFLOW_IR_SCHEMA).toBe("checkpath.workflow-ir/v1");
    expect(SCENARIO_SCHEMA).toBe("checkpath.scenario/v1");
    expect(REQUIRED_CHECKS_SCHEMA).toBe("checkpath.required-checks/v1");
    expect(REPORT_SCHEMA).toBe("checkpath.report/v1");
  });

  it("rejects a wrong schema version with invalid_schema_version", () => {
    const result = validateWorkflowIR({ ...validWorkflowIR, schema: "checkpath.workflow-ir/v2" });
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(["invalid_schema_version"]);
    expect(result.issues[0].path).toBe("schema");
  });

  it("rejects a missing schema with missing_field", () => {
    const noSchema = structuredClone(validWorkflowIR) as Record<string, unknown>;
    delete noSchema["schema"];
    expect(codes(validateWorkflowIR(noSchema))).toEqual(["missing_field"]);
  });
});

describe("T005 WorkflowIR validation", () => {
  it("accepts a valid WorkflowIR and normalizes single-string filters", () => {
    const result = validateWorkflowIR(validWorkflowIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.on[0].paths).toEqual(["src/**"]);
      expect(result.value.jobs[1].context).toBe("unit-tests");
      expect(result.value.jobs[0].name).toBeNull();
    }
  });

  it("normalizes an empty `if` to null", () => {
    const ir = structuredClone(validWorkflowIR);
    ir.jobs[0].if = "   ";
    const result = validateWorkflowIR(ir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.jobs[0].if).toBeNull();
  });

  it("missing jobs -> missing_field", () => {
    const noJobs = structuredClone(validWorkflowIR) as Record<string, unknown>;
    delete noJobs["jobs"];
    expect(codes(validateWorkflowIR(noJobs))).toContain("missing_field");
  });

  it("empty jobs array -> invalid_value", () => {
    expect(codes(validateWorkflowIR({ ...validWorkflowIR, jobs: [] }))).toContain("invalid_value");
  });

  it("empty `on` array -> invalid_value", () => {
    expect(codes(validateWorkflowIR({ ...validWorkflowIR, on: [] }))).toContain("invalid_value");
  });

  it("illegal event name -> invalid_value", () => {
    const ir = structuredClone(validWorkflowIR);
    ir.on[0].name = "workflow_dispatch";
    expect(codes(validateWorkflowIR(ir))).toContain("invalid_value");
  });

  it("duplicate job id -> duplicate_value", () => {
    const ir = structuredClone(validWorkflowIR);
    ir.jobs.push({ id: "build", name: null, needs: [], if: null, context: "build" });
    const result = validateWorkflowIR(ir);
    expect(codes(result)).toContain("duplicate_value");
    expect(result.issues.find((i) => i.code === "duplicate_value")?.path).toBe("$.jobs[2].id");
  });

  it("unknown `needs` reference -> unknown_reference", () => {
    const ir = structuredClone(validWorkflowIR);
    ir.jobs[1].needs = ["build", "ghost"];
    const result = validateWorkflowIR(ir);
    expect(codes(result)).toContain("unknown_reference");
    expect(result.issues.find((i) => i.code === "unknown_reference")?.path).toBe("$.jobs[1].needs[1]");
  });

  it("duplicate `needs` entry -> duplicate_value", () => {
    const ir = structuredClone(validWorkflowIR);
    ir.jobs[1].needs = ["build", "build"];
    expect(codes(validateWorkflowIR(ir))).toContain("duplicate_value");
  });

  it("duplicate event name in `on` -> duplicate_value", () => {
    const ir = structuredClone(validWorkflowIR);
    ir.on.push(structuredClone(ir.on[0]));
    expect(codes(validateWorkflowIR(ir))).toContain("duplicate_value");
  });

  it("branches + branches-ignore together -> inconsistent_value", () => {
    const ir = structuredClone(validWorkflowIR);
    (ir.on[0] as unknown as Record<string, unknown>)["branches_ignore"] = ["docs/**"];
    expect(codes(validateWorkflowIR(ir))).toContain("inconsistent_value");
  });

  it("paths + paths-ignore together -> inconsistent_value", () => {
    const ir = structuredClone(validWorkflowIR);
    (ir.on[0] as unknown as Record<string, unknown>)["paths_ignore"] = ["docs/**"];
    expect(codes(validateWorkflowIR(ir))).toContain("inconsistent_value");
  });

  it("job context not equal to name ?? id -> inconsistent_value", () => {
    const ir = structuredClone(validWorkflowIR);
    ir.jobs[1].context = "wrong-name";
    expect(codes(validateWorkflowIR(ir))).toContain("inconsistent_value");
  });

  it("missing job context -> missing_field", () => {
    const ir = structuredClone(validWorkflowIR);
    const jobNoContext = { ...(ir.jobs[0] as unknown as Record<string, unknown>) };
    delete jobNoContext["context"];
    ir.jobs[0] = jobNoContext as (typeof ir.jobs)[0];
    expect(codes(validateWorkflowIR(ir))).toContain("missing_field");
  });

  it("unknown top-level field -> unknown_field (strict reject)", () => {
    expect(codes(validateWorkflowIR({ ...validWorkflowIR, runs_on: "ubuntu-latest" }))).toContain("unknown_field");
  });

  it("unknown job field -> unknown_field", () => {
    const ir = structuredClone(validWorkflowIR);
    (ir.jobs[0] as Record<string, unknown>)["runs-on"] = "ubuntu-latest";
    expect(codes(validateWorkflowIR(ir))).toContain("unknown_field");
  });

  it("unknown event filter key -> unknown_field", () => {
    const ir = structuredClone(validWorkflowIR);
    (ir.on[0] as Record<string, unknown>)["branches-only"] = ["main"];
    expect(codes(validateWorkflowIR(ir))).toContain("unknown_field");
  });

  it("absolute source_path -> invalid_value (reports carry relative paths only)", () => {
    expect(codes(validateWorkflowIR({ ...validWorkflowIR, source_path: "/home/user/repo/.github/workflows/ci.yml" }))).toContain(
      "invalid_value",
    );
  });

  it("wrong types are wrong_type, not exceptions", () => {
    const result = validateWorkflowIR({ ...validWorkflowIR, jobs: "not-an-array", on: 42 });
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(["wrong_type", "wrong_type"]);
  });

  it("collects multiple issues in one pass", () => {
    const ir = structuredClone(validWorkflowIR);
    ir.on[0].name = "schedule";
    ir.jobs[1].needs = ["ghost"];
    const result = validateWorkflowIR(ir);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("invalid_value");
    expect(codes(result)).toContain("unknown_reference");
  });
});

describe("T005 validator robustness", () => {
  it("never throws on junk input; always returns issues", () => {
    for (const junk of [null, undefined, 42, "text", true, [], [1, 2], { schema: 7 }]) {
      for (const fn of [validateScenario, validateRequiredChecks, validateWorkflowIR, validateReport]) {
        const result = fn(junk);
        expect(result.ok).toBe(false);
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.value).toBeNull();
      }
    }
  });

  it("issue order is deterministic for the same input", () => {
    const bad = { ...validWorkflowIR, schema: "v9", jobs: [] };
    const a = validateWorkflowIR(bad);
    const b = validateWorkflowIR(bad);
    expect(JSON.stringify(a.issues)).toBe(JSON.stringify(b.issues));
  });

  it("formatIssues renders stable one-line strings", () => {
    const result = validateWorkflowIR({ ...validWorkflowIR, schema: "v9" });
    expect(formatIssues(result.ok ? [] : result.issues)).toEqual([
      'schema: invalid_schema_version: unsupported schema version "v9" (expected "checkpath.workflow-ir/v1")',
    ]);
  });
});
