// T005 — WorkflowIR validation tests (second file: normalization and
// cross-field rules not covered by tests/unit/schema/schema.test.ts).
//
// Covers: `needs` defaulting to [], single-string `needs` rejection,
// non-string `if`, job `name` empty-string rejection, and a full valid
// merge_group WorkflowIR with two jobs and a needs edge.
import { describe, expect, it } from "vitest";
import { validateWorkflowIR } from "../../../src/core/validate.js";
import { codes, validWorkflowIR } from "../t005-fixtures.js";

describe("T005 WorkflowIR validation (normalization)", () => {
  it("accepts a merge_group workflow with a needs edge", () => {
    const ir = {
      schema: "checkpath.workflow-ir/v1",
      source_path: ".github/workflows/ci.yml",
      name: null,
      on: [{ name: "merge_group", types: ["checks_requested"] }],
      jobs: [
        { id: "build", name: null, needs: [], if: null, context: "build" },
        { id: "aggregate", name: "ci-ok", needs: ["build"], if: "always()", context: "ci-ok" },
      ],
    };
    const result = validateWorkflowIR(ir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.on[0].types).toEqual(["checks_requested"]);
      expect(result.value.jobs[1].needs).toEqual(["build"]);
    }
  });

  it("defaults absent `needs` to [] and absent `name` to null", () => {
    const ir = structuredClone(validWorkflowIR);
    delete (ir.jobs[0] as Record<string, unknown>)["needs"];
    delete (ir.jobs[0] as Record<string, unknown>)["name"];
    const result = validateWorkflowIR(ir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.jobs[0].needs).toEqual([]);
      expect(result.value.jobs[0].name).toBeNull();
      expect(result.value.jobs[0].context).toBe("build");
    }
  });

  it("a single-string `needs` is wrong_type (needs is always a list)", () => {
    const ir = structuredClone(validWorkflowIR);
    (ir.jobs[1] as Record<string, unknown>)["needs"] = "build";
    expect(codes(validateWorkflowIR(ir))).toContain("wrong_type");
  });

  it("a non-string `if` is wrong_type", () => {
    const ir = structuredClone(validWorkflowIR);
    (ir.jobs[1] as Record<string, unknown>)["if"] = false;
    expect(codes(validateWorkflowIR(ir))).toContain("wrong_type");
  });

  it("an empty job name is invalid_value", () => {
    const ir = structuredClone(validWorkflowIR);
    ir.jobs[1].name = "";
    expect(codes(validateWorkflowIR(ir))).toContain("invalid_value");
  });

  it("a `needs` entry that is not a string is wrong_type", () => {
    const ir = structuredClone(validWorkflowIR);
    (ir.jobs[1] as Record<string, unknown>)["needs"] = [42];
    expect(codes(validateWorkflowIR(ir))).toContain("wrong_type");
  });

  it("an unknown filter value type is wrong_type", () => {
    const ir = structuredClone(validWorkflowIR);
    (ir.on[0] as Record<string, unknown>)["branches"] = 42;
    expect(codes(validateWorkflowIR(ir))).toContain("wrong_type");
  });
});
