// T010 — Report JSON envelope + offline HTML tests.
//
// Covers: the report-file envelope round-trips (and rejects a
// recommendation that names no witness), the HTML report contains
// all five §5.2 sections, contains NO remote resource of any kind,
// HTML-escapes user-supplied YAML strings (no injection), and the
// matrix document + page aggregate per-scenario reports.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport } from "../../../src/report/build.js";
import { buildReportHtml } from "../../../src/report/html.js";
import { parseReportFileText, reportFileText, toReportFile } from "../../../src/report/json.js";
import { buildMatrix, buildMatrixHtml } from "../../../src/report/matrix.js";
import { validateScenario } from "../../../src/core/validate.js";
import {
  DEMO_REQUIRED_CHECKS,
  DEMO_SCENARIO,
  demoWorkflows,
} from "../../../src/cli/commands/demo.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../");

function demoBuilt() {
  return buildReport({
    fixtureId: DEMO_SCENARIO.scenario_id,
    workflows: demoWorkflows(),
    scenario: DEMO_SCENARIO,
    requiredChecks: DEMO_REQUIRED_CHECKS.required_checks,
  });
}

function loadExampleScenario(name: string) {
  const parsed = JSON.parse(
    readFileSync(join(repoRoot, "examples/scenarios", name), "utf8"),
  ) as unknown;
  const result = validateScenario(parsed);
  if (!result.ok || result.value === null) throw new Error("example scenario invalid");
  return result.value;
}

function buildForScenario(name: string) {
  const scenario = loadExampleScenario(name);
  return buildReport({
    fixtureId: scenario.scenario_id,
    workflows: demoWorkflows(),
    scenario,
    requiredChecks: DEMO_REQUIRED_CHECKS.required_checks,
  });
}

describe("report JSON envelope", () => {
  it("round-trips through canonical text and re-validates", () => {
    const built = demoBuilt();
    const file = toReportFile(built, DEMO_SCENARIO);
    const text = reportFileText(file);
    expect(text.endsWith("\n")).toBe(true);
    const parsed = parseReportFileText(text);
    expect(parsed.report).toEqual(built.report);
    expect(parsed.recommendations).toEqual(built.recommendations);
    expect(parsed.diff_boundary).toBe(built.diffBoundary);
    expect(parsed.scenario).toEqual(DEMO_SCENARIO);
  });

  it("rejects a recommendation naming no witness", () => {
    const built = demoBuilt();
    const file = toReportFile(built, DEMO_SCENARIO);
    const bad = {
      ...file,
      recommendations: [
        { witness_id: "witness-999", rule_id: "R-PATH-01", kind: "path_filter", check_context: "unit-tests", recommendation: "x" },
      ],
    };
    expect(() => parseReportFileText(JSON.stringify(bad))).toThrow("does not name a witness");
  });

  it("rejects a wrong envelope schema", () => {
    expect(() =>
      parseReportFileText(JSON.stringify({ schema: "nope", report: {}, recommendations: [], diff_boundary: null, scenario: {} })),
    ).toThrow("checkpath.report-file/v1");
  });
});

describe("offline HTML report", () => {
  it("contains all §5.2 sections and no remote resource", () => {
    const built = demoBuilt();
    const html = buildReportHtml(toReportFile(built, DEMO_SCENARIO), built.evaluation);
    for (const section of ["Summary", "Event Path", "Workflow / Job DAG", "Required Checks", "Witness", "Export"]) {
      expect(html).toContain(section);
    }
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain("<link");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script src");
    expect(html).not.toMatch(/@import|url\(/);
    // Required-check rows carry the provider identity for click-to-highlight.
    expect(html).toContain('data-provider-workflow=".github/workflows/ci.yml"');
    expect(html).toContain('data-provider-job="unit-tests"');
    // Witness toggle + fingerprints are present.
    expect(html).toContain("data-witness-toggle");
    expect(html).toContain(built.report.report_sha256);
    expect(html).toContain("REPORTABLE_PENDING");
  });

  it("HTML-escapes user-supplied YAML strings (no injection)", () => {
    const yamlText = [
      "name: ci",
      "on:",
      "  pull_request: {}",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    name: 'x<y>&z\"q'",
      "    steps:",
      "      - run: echo hi",
      "",
    ].join("\n");
    const scenario = loadExampleScenario("pr-src-only.json");
    const built = buildReport({
      fixtureId: scenario.scenario_id,
      workflows: [{ path: ".github/workflows/ci.yml", yamlText }],
      scenario,
      requiredChecks: [{ context: "x<y>&z\"q", source: "github-actions" }],
    });
    expect(built.report.required_check_results[0].status).toBe("REPORTABLE_PENDING");
    const html = buildReportHtml(toReportFile(built, scenario), built.evaluation);
    expect(html).toContain("x&lt;y&gt;&amp;z&quot;q");
    expect(html).not.toContain("x<y>&z");
    expect(html).not.toContain("<script>alert");
  });

  it("shows the UNKNOWN reason text, not just a coloured icon", () => {
    const yamlText = [
      "name: ci",
      "on:",
      "  pull_request:",
      "    paths:",
      "      - 'src/**/{a,b}'",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    name: unit-tests",
      "    steps:",
      "      - run: echo hi",
      "",
    ].join("\n");
    const scenario = loadExampleScenario("pr-src-only.json");
    const built = buildReport({
      fixtureId: scenario.scenario_id,
      workflows: [{ path: ".github/workflows/ci.yml", yamlText }],
      scenario,
      requiredChecks: [{ context: "unit-tests", source: "github-actions" }],
    });
    expect(built.report.required_check_results[0].status).toBe("UNKNOWN");
    const html = buildReportHtml(toReportFile(built, scenario), built.evaluation);
    expect(html).toContain("UNKNOWN");
    expect(html).toContain("unsupported_glob");
  });
});

describe("matrix", () => {
  it("aggregates all scenarios: worst exit code, per-check rows", () => {
    const docs = buildForScenario("pr-docs-only.json");
    const src = buildForScenario("pr-src-only.json");
    const mg = buildForScenario("merge-group.json");
    const matrix = buildMatrix("merge-queue", [
      { scenario_id: docs.report.scenario_id, report_path: "PR-DOCS-ONLY", report: docs.report, strictSkipped: false },
      { scenario_id: src.report.scenario_id, report_path: "PR-SRC-ONLY", report: src.report, strictSkipped: false },
      { scenario_id: mg.report.scenario_id, report_path: "MERGE-GROUP-01", report: mg.report, strictSkipped: false },
    ]);
    expect(matrix.scenarios).toHaveLength(3);
    expect(matrix.exit_code).toBe(2);
    expect(matrix.scenarios.find((s) => s.scenario_id === "PR-SRC-ONLY")?.exit_code).toBe(0);
    const unit = matrix.checks.find((c) => c.context === "unit-tests");
    expect(unit?.results).toEqual({
      "PR-DOCS-ONLY": "PENDING_NOT_REPORTED",
      "PR-SRC-ONLY": "REPORTABLE_PENDING",
      "MERGE-GROUP-01": "PENDING_NOT_REPORTED",
    });
    const html = buildMatrixHtml(matrix);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain("PR-DOCS-ONLY");
    expect(html).toContain("MERGE-GROUP-01");
    expect(html).toContain("merge-queue");
  });

  it("a suite of only reportable scenarios exits 0", () => {
    const src = buildForScenario("pr-src-only.json");
    const matrix = buildMatrix("src-only", [
      { scenario_id: src.report.scenario_id, report_path: "PR-SRC-ONLY", report: src.report, strictSkipped: false },
    ]);
    expect(matrix.exit_code).toBe(0);
  });
});
