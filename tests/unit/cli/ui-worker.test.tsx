// T010 — UI + worker tests.
//
// Covers: the React report viewer renders all five §5.2 sections
// from a ReportFile (and the empty state when no report is loaded),
// and the worker protocol round-trips an analyze request through the
// same report builder the CLI uses.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../../../src/ui/App.js";
import { buildReport } from "../../../src/report/build.js";
import { toReportFile } from "../../../src/report/json.js";
import { isAnalyzeRequest, type AnalyzeResponseMessage } from "../../../src/worker/protocol.js";
import { handleRequest } from "../../../src/worker/analysis.worker.js";
import {
  DEMO_REQUIRED_CHECKS,
  DEMO_SCENARIO,
  demoWorkflows,
} from "../../../src/cli/commands/demo.js";

function demoFile() {
  const built = buildReport({
    fixtureId: DEMO_SCENARIO.scenario_id,
    workflows: demoWorkflows(),
    scenario: DEMO_SCENARIO,
    requiredChecks: DEMO_REQUIRED_CHECKS.required_checks,
  });
  return toReportFile(built, DEMO_SCENARIO);
}

describe("App (report viewer)", () => {
  it("renders all §5.2 sections for a report", () => {
    const html = renderToStaticMarkup(<App data={demoFile()} />);
    for (const section of ["Summary", "Event Path", "Workflow / Job DAG", "Required Checks", "Witness"]) {
      expect(html).toContain(section);
    }
    expect(html).toContain("PR-DOCS-ONLY");
    expect(html).toContain("PENDING_NOT_REPORTED");
    expect(html).toContain("unit-tests");
  });

  it("renders the empty state when no report is loaded", () => {
    const html = renderToStaticMarkup(<App data={null} />);
    expect(html).toContain("No report loaded");
    expect(html).toContain("checkpath.mjs demo");
  });
});

describe("worker protocol", () => {
  it("isAnalyzeRequest guards the message shape", () => {
    expect(isAnalyzeRequest({ type: "analyze-request" })).toBe(true);
    expect(isAnalyzeRequest({ type: "analyze-response" })).toBe(false);
    expect(isAnalyzeRequest(null)).toBe(false);
    expect(isAnalyzeRequest("analyze-request")).toBe(false);
  });

  it("handleRequest answers with the same report the CLI builds", () => {
    const posted: AnalyzeResponseMessage[] = [];
    const scope = globalThis as unknown as { postMessage: (m: AnalyzeResponseMessage) => void };
    const previous = scope.postMessage;
    scope.postMessage = (message: AnalyzeResponseMessage) => {
      posted.push(message);
    };
    try {
      handleRequest({
        type: "analyze-request",
        requestId: "req-1",
        fixtureId: DEMO_SCENARIO.scenario_id,
        workflows: demoWorkflows(),
        scenario: DEMO_SCENARIO,
        requiredChecks: DEMO_REQUIRED_CHECKS.required_checks,
      });
    } finally {
      scope.postMessage = previous;
    }
    expect(posted).toHaveLength(1);
    const response = posted[0];
    if (response.ok !== true) throw new Error(`worker failed: ${response.error}`);
    expect(response.requestId).toBe("req-1");
    expect(response.exitCode).toBe(2);
    expect(response.file.report.scenario_id).toBe("PR-DOCS-ONLY");
    expect(response.file.report.report_sha256).toBe(demoFile().report.report_sha256);
  });
});
