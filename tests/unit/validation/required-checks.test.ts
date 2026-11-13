// T005 — RequiredChecksV1 validation tests.
//
// Covers: the §6.2 example shape, `source` defaulting to
// "github-actions", acceptance of ALL 24 frozen S0 required-checks
// manifests, and the failure classes: missing field, wrong type,
// unknown field, bad schema version. An external source (e.g.
// "third-party-app") is structurally VALID here — the resolver maps
// it to UNKNOWN at evaluation time (§4.5), it is not a schema error.
// Duplicate contexts are ADMITTED (ADR FIX-P1-01/01, superseding the
// T005 rejection): each manifest entry resolves independently, one
// row per entry (T008 T8-05/T8-10, golden G-57).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRequiredChecks } from "../../../src/core/validate.js";

const here = dirname(fileURLToPath(import.meta.url));
const s0Dir = join(here, "../../fixtures/s0");

const validManifest = {
  schema: "checkpath.required-checks/v1",
  required_checks: [
    { context: "unit-tests", source: "github-actions" },
    { context: "integration", source: "github-actions" },
  ],
};

function codes(result: { ok: boolean; issues: Array<{ code: string }> }): string[] {
  return result.ok ? [] : result.issues.map((i) => i.code);
}

describe("T005 RequiredChecksV1 validation", () => {
  it("accepts the §6.2 example", () => {
    const result = validateRequiredChecks(validManifest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.required_checks).toHaveLength(2);
      expect(result.value.required_checks[0].source).toBe("github-actions");
    }
  });

  it("defaults a missing source to github-actions", () => {
    const result = validateRequiredChecks({
      schema: "checkpath.required-checks/v1",
      required_checks: [{ context: "unit-tests" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.required_checks[0].source).toBe("github-actions");
  });

  it("an external source is structurally valid (resolver maps it to UNKNOWN, §4.5)", () => {
    const result = validateRequiredChecks({
      schema: "checkpath.required-checks/v1",
      required_checks: [{ context: "external-check", source: "third-party-app" }],
    });
    expect(result.ok).toBe(true);
  });

  it("accepts all 24 frozen S0 required-checks manifests", () => {
    const suite = JSON.parse(readFileSync(join(s0Dir, "all.json"), "utf-8")) as {
      fixtures: Array<{ id: string; dir: string; required_checks: string }>;
    };
    expect(suite.fixtures).toHaveLength(24);
    for (const entry of suite.fixtures) {
      const raw = JSON.parse(readFileSync(join(s0Dir, entry.dir, entry.required_checks), "utf-8"));
      const result = validateRequiredChecks(raw);
      expect(result.ok, `${entry.id}: ${JSON.stringify(result.issues)}`).toBe(true);
    }
  });

  it("an empty required_checks array is structurally valid", () => {
    const result = validateRequiredChecks({ schema: "checkpath.required-checks/v1", required_checks: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.required_checks).toEqual([]);
  });

  it("missing required_checks -> missing_field; missing context -> missing_field", () => {
    const noList = { schema: "checkpath.required-checks/v1" };
    expect(codes(validateRequiredChecks(noList))).toContain("missing_field");

    const noContext = {
      schema: "checkpath.required-checks/v1",
      required_checks: [{ source: "github-actions" }],
    };
    expect(codes(validateRequiredChecks(noContext))).toContain("missing_field");
  });

  it("duplicate contexts are admitted, one entry per row, in order (ADR FIX-P1-01/01)", () => {
    const dup = {
      schema: "checkpath.required-checks/v1",
      required_checks: [
        { context: "unit-tests", source: "github-actions" },
        { context: "unit-tests", source: "external-app" },
        { context: "unit-tests", source: "github-actions" },
      ],
    };
    const result = validateRequiredChecks(dup);
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    if (result.ok) {
      expect(result.value.required_checks).toEqual([
        { context: "unit-tests", source: "github-actions" },
        { context: "unit-tests", source: "external-app" },
        { context: "unit-tests", source: "github-actions" },
      ]);
    }
  });

  it("accepts the T8-05 / G-57 duplicate-context manifest verbatim (ADR FIX-P1-01/01)", () => {
    const raw = JSON.parse(
      readFileSync(
        join(here, "../../fixtures/checks/T8-05-external-source/required-checks.json"),
        "utf-8",
      ),
    );
    const result = validateRequiredChecks(raw);
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    if (result.ok) {
      expect(result.value.required_checks).toHaveLength(5);
      expect(result.value.required_checks.map((e) => e.context)).toEqual([
        "unit-tests",
        "unit-tests",
        "ghost",
        "lint",
        "unit-tests",
      ]);
      // The sourceless `lint` entry defaults to github-actions; the
      // empty-string source is preserved as-is (resolver: external).
      expect(result.value.required_checks[3].source).toBe("github-actions");
      expect(result.value.required_checks[4].source).toBe("");
    }
  });

  it("wrong types -> wrong_type; empty context -> invalid_value", () => {
    const bad = {
      schema: "checkpath.required-checks/v1",
      required_checks: [{ context: 7, source: "github-actions" }, { context: "", source: "github-actions" }],
    };
    expect(codes(validateRequiredChecks(bad))).toEqual(["wrong_type", "invalid_value"]);
  });

  it("unknown fields are rejected at manifest and entry level", () => {
    const top = { ...validManifest, repo: "x" };
    expect(codes(validateRequiredChecks(top))).toContain("unknown_field");

    const entry = {
      schema: "checkpath.required-checks/v1",
      required_checks: [{ context: "unit-tests", source: "github-actions", strict: true }],
    };
    expect(codes(validateRequiredChecks(entry))).toContain("unknown_field");
  });

  it("wrong schema version -> invalid_schema_version", () => {
    expect(
      codes(validateRequiredChecks({ ...validManifest, schema: "checkpath.required-checks/v9" })),
    ).toEqual(["invalid_schema_version"]);
  });
});
