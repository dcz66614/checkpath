// T010 — Report builder tests.
//
// Covers: the demo case builds the expected ReportV1 (2x
// PENDING_NOT_REPORTED, 2 path_filter witnesses, parallel
// recommendations), all four §8 hashes recompute (T005 U-04), the
// build is deterministic, exit codes follow §4.7, the T006 U-02
// diff-boundary wording is presentation-only (formal
// `first_3000_truncated` annotation, NO diff_boundary field in the
// frozen ReportV1), and the T005 U-03 dedup (e2e.ts re-exports the
// formal canonical/sha256 helpers).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReport,
  computeReportHash,
  exitCodeForReport,
  exitCodeForStatus,
  verifyReportHash,
  verifyReportHashes,
  type ReportBuildInput,
} from "../../../src/report/build.js";
import { validateReport, validateRequiredChecks, validateScenario } from "../../../src/core/validate.js";
import { canonicalJson } from "../../../src/core/canonical-json.js";
import { sha256Hex } from "../../../src/core/sha256.js";
import {
  canonicalJson as e2eCanonicalJson,
  sha256Hex as e2eSha256Hex,
} from "../../../src/core/e2e.js";
import {
  DEMO_REQUIRED_CHECKS,
  DEMO_SCENARIO,
  demoWorkflows,
} from "../../../src/cli/commands/demo.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../");

function loadExampleScenario(name: string) {
  const parsed = JSON.parse(
    readFileSync(join(repoRoot, "examples/scenarios", name), "utf8"),
  ) as unknown;
  const result = validateScenario(parsed);
  if (!result.ok || result.value === null) throw new Error("example scenario invalid");
  return result.value;
}

function demoInput(): ReportBuildInput {
  return {
    fixtureId: DEMO_SCENARIO.scenario_id,
    workflows: demoWorkflows(),
    scenario: DEMO_SCENARIO,
    requiredChecks: DEMO_REQUIRED_CHECKS.required_checks,
  };
}

describe("buildReport (demo case)", () => {
  it("reports both required checks PENDING_NOT_REPORTED with path_filter witnesses", () => {
    const built = buildReport(demoInput());
    expect(built.report.scenario_id).toBe("PR-DOCS-ONLY");
    expect(built.report.required_check_results).toHaveLength(2);
    for (const row of built.report.required_check_results) {
      expect(row.status).toBe("PENDING_NOT_REPORTED");
      expect(row.reason).toBe("workflow_not_triggered");
      expect(row.provider_workflow_path).toBe(".github/workflows/ci.yml");
    }
    expect(built.report.witnesses).toHaveLength(2);
    for (const witness of built.report.witnesses) {
      expect(witness.kind).toBe("path_filter");
      expect(witness.first_blocking_condition).toBe("path_mismatch");
    }
    // T009-U03: recommendations are a parallel list, never merged
    // into the witness objects.
    expect(built.recommendations).toHaveLength(2);
    for (const rec of built.recommendations) {
      expect(rec.rule_id).toBe("R-PATH-01");
      expect(built.report.witnesses.map((w) => w.id)).toContain(rec.witness_id);
    }
    expect(built.report.witnesses[0]).not.toHaveProperty("recommendation");
  });

  it("passes its own frozen schema validation", () => {
    const built = buildReport(demoInput());
    expect(validateReport(built.report).ok).toBe(true);
  });

  it("is deterministic: two builds give byte-identical canonical JSON", () => {
    const a = buildReport(demoInput());
    const b = buildReport(demoInput());
    expect(canonicalJson(a.report)).toBe(canonicalJson(b.report));
    expect(a.report.report_sha256).toBe(b.report.report_sha256);
  });

  it("recomputes all four §8 hashes (T005 U-04)", () => {
    const input = demoInput();
    const built = buildReport(input);
    expect(verifyReportHashes(input, built.report)).toEqual({
      input: true,
      workflowSet: true,
      requiredChecks: true,
      report: true,
    });
    expect(verifyReportHash(built.report)).toBe(true);
    // Tampering with any recorded hash must fail verification.
    const tampered = { ...built.report, input_sha256: "0".repeat(64) };
    expect(verifyReportHashes(input, tampered).input).toBe(false);
    const tamperedReport = { ...built.report, report_sha256: "0".repeat(64) };
    expect(verifyReportHash(tamperedReport)).toBe(false);
    expect(computeReportHash(built.report)).toBe(built.report.report_sha256);
  });

  it("exit codes follow §4.7", () => {
    expect(exitCodeForStatus("REPORTABLE_PENDING")).toBe(0);
    expect(exitCodeForStatus("SKIPPED_SUCCESS")).toBe(0);
    expect(exitCodeForStatus("SKIPPED_SUCCESS", true)).toBe(2);
    expect(exitCodeForStatus("PENDING_NOT_REPORTED")).toBe(2);
    expect(exitCodeForStatus("AMBIGUOUS")).toBe(2);
    expect(exitCodeForStatus("UNKNOWN")).toBe(2);
    expect(exitCodeForStatus("INVALID")).toBe(3);
    expect(exitCodeForReport(buildReport(demoInput()).report)).toBe(2);
  });

  it("src-only scenario is all REPORTABLE_PENDING (exit 0, no witnesses)", () => {
    const scenario = loadExampleScenario("pr-src-only.json");
    const requiredChecks = validateRequiredChecks(
      JSON.parse(
        JSON.stringify({
          schema: "checkpath.required-checks/v1",
          required_checks: DEMO_REQUIRED_CHECKS.required_checks,
        }),
      ),
    );
    if (!requiredChecks.ok || requiredChecks.value === null) throw new Error("bad checks");
    const built = buildReport({
      fixtureId: scenario.scenario_id,
      workflows: demoWorkflows(),
      scenario,
      requiredChecks: requiredChecks.value.required_checks,
    });
    expect(built.report.required_check_results.map((r) => r.status)).toEqual([
      "REPORTABLE_PENDING",
      "REPORTABLE_PENDING",
    ]);
    expect(built.report.witnesses).toEqual([]);
    expect(exitCodeForReport(built.report)).toBe(0);
  });
});

describe("T006 U-02 diff-boundary wording", () => {
  it("confirmed first-3000 truncation is a presentation annotation, not a ReportV1 field", () => {
    const scenario = loadExampleScenario("pr-src-only.json");
    const truncated = {
      ...scenario,
      diff: {
        ...scenario.diff,
        changed_files: Array.from({ length: 3000 }, (_, i) => `docs/f${i}.md`),
        changed_files_total: 3500,
        first_3000_confirmed: true,
      },
    };
    const built = buildReport({
      fixtureId: truncated.scenario_id,
      workflows: demoWorkflows(),
      scenario: truncated,
      requiredChecks: DEMO_REQUIRED_CHECKS.required_checks,
    });
    // Formal-layer wording (skip-annotation.ts).
    expect(built.diffBoundary).toBe("first_3000_truncated");
    // The frozen ReportV1 carries no diff_boundary field at all —
    // neither the Oracle's null nor the formal wording.
    expect(built.report).not.toHaveProperty("diff_boundary");
    // The truncation effect is still encoded in the event evaluation.
    expect(built.report.event_evaluations[0].path_match).toBe(false);
    expect(built.report.event_evaluations[0].reason).toBe("path_mismatch");
  });
});

describe("T005 U-03: e2e.ts uses the formal canonical/sha256 modules", () => {
  it("e2e re-exports are the formal implementations", () => {
    const value = { b: [3, 1], a: "x<y> & 中文" };
    expect(e2eCanonicalJson(value)).toBe(canonicalJson(value));
    expect(e2eSha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(e2eSha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
