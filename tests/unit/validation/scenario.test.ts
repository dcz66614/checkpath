// T005 — ScenarioV1 validation tests.
//
// Covers: the §6.1 example shape, normalization of absent optional
// fields, acceptance of ALL 24 frozen S0 scenarios (the schema must not
// be stricter than S0 reality), and every failure class: missing field,
// wrong type, illegal event, unknown field, diff-algorithm/event
// mismatch (§4.3), contradictory counts, bad schema version, invalid JSON.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateJsonText, validateScenario } from "../../../src/core/validate.js";
import { codes, validScenario } from "../t005-fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const s0Dir = join(here, "../../fixtures/s0");

describe("T005 ScenarioV1 validation", () => {
  it("accepts the §6.1 example and normalizes absent optional fields to null", () => {
    const result = validateScenario(validScenario);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.event.ref).toBeNull();
      expect(result.value.event.branch).toBeNull();
      expect(result.value.event.target_branch).toBeNull();
      expect(result.value.event.action).toBe("synchronize");
    }
  });

  it("accepts a push scenario without action (two-dot)", () => {
    const push = {
      schema: "checkpath.scenario/v1",
      scenario_id: "PUSH-1",
      event: { name: "push", branch: "main", ref: "refs/heads/main", commit_message: "feat: x" },
      diff: {
        algorithm: "two-dot",
        changed_files: ["src/a.ts"],
        changed_files_total: 1,
        returned_files: 1,
        complete: true,
        first_3000_confirmed: true,
        diff_timed_out: false,
        push_commit_count: 3,
      },
    };
    const result = validateScenario(push);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.event.action).toBeNull();
  });

  it("accepts all 24 frozen S0 scenarios", () => {
    const suite = JSON.parse(readFileSync(join(s0Dir, "all.json"), "utf-8")) as {
      fixtures: Array<{ id: string; dir: string; scenario: string }>;
    };
    expect(suite.fixtures).toHaveLength(24);
    for (const entry of suite.fixtures) {
      const raw = JSON.parse(readFileSync(join(s0Dir, entry.dir, entry.scenario), "utf-8"));
      const result = validateScenario(raw);
      expect(result.ok, `${entry.id}: ${JSON.stringify(result.issues)}`).toBe(true);
      if (result.ok) expect(result.value.scenario_id).toBe(entry.id);
    }
  });

  it("missing scenario_id / event / diff / changed_files -> missing_field", () => {
    const noId = structuredClone(validScenario) as Record<string, unknown>;
    delete noId["scenario_id"];
    expect(codes(validateScenario(noId))).toContain("missing_field");

    const noEvent = structuredClone(validScenario) as Record<string, unknown>;
    delete noEvent["event"];
    expect(codes(validateScenario(noEvent))).toContain("missing_field");

    const noDiff = structuredClone(validScenario) as Record<string, unknown>;
    delete noDiff["diff"];
    expect(codes(validateScenario(noDiff))).toContain("missing_field");

    const noFiles = structuredClone(validScenario);
    delete (noFiles.diff as Record<string, unknown>)["changed_files"];
    expect(codes(validateScenario(noFiles))).toContain("missing_field");
  });

  it("missing event.name -> missing_field; illegal event -> invalid_value", () => {
    const noName = structuredClone(validScenario);
    delete (noName.event as Record<string, unknown>)["name"];
    expect(codes(validateScenario(noName))).toContain("missing_field");

    const badEvent = structuredClone(validScenario);
    (badEvent.event as Record<string, unknown>)["name"] = "workflow_dispatch";
    const result = validateScenario(badEvent);
    expect(codes(result)).toContain("invalid_value");
    expect(result.issues.find((i) => i.code === "invalid_value")?.path).toBe("$.event.name");
  });

  it("wrong types -> wrong_type", () => {
    const bad = structuredClone(validScenario);
    (bad as Record<string, unknown>)["scenario_id"] = 42;
    (bad.diff as Record<string, unknown>)["changed_files"] = "README.md";
    (bad.diff as Record<string, unknown>)["complete"] = "yes";
    const result = validateScenario(bad);
    expect(codes(result)).toEqual(["wrong_type", "wrong_type", "wrong_type"]);
  });

  it("unknown fields are rejected at every level", () => {
    const top = { ...validScenario, extra: 1 };
    expect(codes(validateScenario(top))).toContain("unknown_field");

    const eventExtra = structuredClone(validScenario);
    (eventExtra.event as Record<string, unknown>)["pull_number"] = 42;
    expect(codes(validateScenario(eventExtra))).toContain("unknown_field");

    const diffExtra = structuredClone(validScenario);
    (diffExtra.diff as Record<string, unknown>)["patch"] = "...";
    expect(codes(validateScenario(diffExtra))).toContain("unknown_field");
  });

  it("push with three-dot (or PR with two-dot) -> inconsistent_value (§4.3)", () => {
    const push = {
      schema: "checkpath.scenario/v1",
      scenario_id: "PUSH-1",
      event: { name: "push", branch: "main", commit_message: "x" },
      diff: { algorithm: "three-dot", changed_files: ["a.txt"] },
    };
    expect(codes(validateScenario(push))).toContain("inconsistent_value");

    const pr = structuredClone(validScenario);
    (pr.diff as Record<string, unknown>)["algorithm"] = "two-dot";
    expect(codes(validateScenario(pr))).toContain("inconsistent_value");
  });

  it("changed_files_total smaller than the listed files -> inconsistent_value", () => {
    const bad = structuredClone(validScenario);
    (bad.diff as Record<string, unknown>)["changed_files_total"] = 1;
    expect(codes(validateScenario(bad))).toContain("inconsistent_value");
  });

  it("returned_files exceeding changed_files_total -> inconsistent_value", () => {
    const bad = structuredClone(validScenario);
    (bad.diff as Record<string, unknown>)["changed_files_total"] = 2;
    (bad.diff as Record<string, unknown>)["returned_files"] = 5;
    expect(codes(validateScenario(bad))).toContain("inconsistent_value");
  });

  it("negative / non-integer counts -> invalid_value", () => {
    const bad = structuredClone(validScenario);
    (bad.diff as Record<string, unknown>)["push_commit_count"] = -1;
    (bad.diff as Record<string, unknown>)["changed_files_total"] = 1.5;
    expect(codes(validateScenario(bad))).toEqual(["invalid_value", "invalid_value"]);
  });

  it("wrong schema version -> invalid_schema_version", () => {
    expect(codes(validateScenario({ ...validScenario, schema: "checkpath.scenario/v2" }))).toEqual([
      "invalid_schema_version",
    ]);
  });

  it("empty scenario_id -> invalid_value; empty changed_files entry -> invalid_value", () => {
    const bad = structuredClone(validScenario);
    (bad as Record<string, unknown>)["scenario_id"] = "";
    (bad.diff as Record<string, unknown>)["changed_files"] = [""];
    expect(codes(validateScenario(bad))).toEqual(["invalid_value", "invalid_value"]);
  });

  it("validateJsonText reports unparseable JSON as invalid_json", () => {
    const result = validateJsonText("{not json", validateScenario);
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(["invalid_json"]);
    expect(result.issues[0].path).toBe("$");
  });

  it("validateJsonText accepts valid JSON text", () => {
    const result = validateJsonText(JSON.stringify(validScenario), validateScenario);
    expect(result.ok).toBe(true);
  });
});
