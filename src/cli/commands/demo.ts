// T010 — `demo` command.
//
// Runs the built-in synthetic example end to end with no files, no
// GitHub token, no Docker, no network and no real repository: the
// workflow YAML, scenario and required-checks list below are embedded
// constants, byte-identical to the checked-in example files
// (examples/repo-basic/.github/workflows/ci.yml,
// examples/scenarios/pr-docs-only.json, examples/required-checks.yml —
// a test asserts the demo report equals the `analyze` report on those
// files). The demo scenario is the PROJECT_BOOK §6.1 example: a PR
// that only touches README.md / docs/guide.md against a workflow
// whose pull_request trigger is limited to `src/**`, so both required
// checks end up PENDING_NOT_REPORTED — the canonical "docs-only PR
// blocked by a path-filtered workflow" case.
//
// Exit code: the same gate code as `analyze` (§4.7), so the demo
// exits 2 here — that is the gate working, not a demo failure. The
// summary says so explicitly.

import { exitCodeForReport } from "../../report/build.js";
import type { ReportWorkflowInput } from "../../report/build.js";
import type { RequiredChecksV1, ScenarioV1 } from "../../core/types.js";
import {
  analyzeCase,
  parseArgs,
  printReportSummary,
  writeReport,
} from "./common.js";

/** Byte-identical to examples/repo-basic/.github/workflows/ci.yml. */
export const DEMO_WORKFLOW_YAML = `name: ci
on:
  pull_request:
    branches:
      - main
    paths:
      - 'src/**'
  push:
    branches:
      - main
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    name: unit-tests
    steps:
      - run: echo unit tests
  integration:
    runs-on: ubuntu-latest
    name: integration
    needs: unit-tests
    steps:
      - run: echo integration
`;

/** Identical (as a validated object) to examples/scenarios/pr-docs-only.json. */
export const DEMO_SCENARIO: ScenarioV1 = {
  schema: "checkpath.scenario/v1",
  scenario_id: "PR-DOCS-ONLY",
  event: {
    name: "pull_request",
    action: "synchronize",
    branch: null,
    base_branch: "main",
    head_branch: "docs/update",
    target_branch: null,
    ref: null,
    commit_message: "docs: update guide",
  },
  diff: {
    algorithm: "three-dot",
    changed_files: ["README.md", "docs/guide.md"],
    changed_files_total: 2,
    returned_files: 2,
    complete: true,
    first_3000_confirmed: true,
    diff_timed_out: false,
    push_commit_count: null,
  },
};

/** Identical (as a validated object) to examples/required-checks.yml. */
export const DEMO_REQUIRED_CHECKS: RequiredChecksV1 = {
  schema: "checkpath.required-checks/v1",
  required_checks: [
    { context: "unit-tests", source: "github-actions" },
    { context: "integration", source: "github-actions" },
  ],
};

export function demoWorkflows(): ReportWorkflowInput[] {
  return [{ path: ".github/workflows/ci.yml", yamlText: DEMO_WORKFLOW_YAML }];
}

export async function demoCommand(argv: string[]): Promise<number> {
  const args = parseArgs(argv, ["out"], ["strict-skipped", "help"]);
  if (args.flags["help"] === true) {
    console.log(
      "Usage: checkpath demo [--out <dir>] [--strict-skipped]\n\nRuns the built-in synthetic example (docs-only PR vs a src/** path-filtered workflow). No token, Docker, network or real repository needed. Writes report.json + report.html to <dir> (default reports/demo). Exit code follows the §4.7 gate rule, so this demo exits 2: both required checks are PENDING_NOT_REPORTED.",
    );
    return 0;
  }
  const outDir =
    typeof args.flags["out"] === "string" ? (args.flags["out"] as string) : "reports/demo";
  const strictSkipped = args.flags["strict-skipped"] === true;
  const built = analyzeCase(
    DEMO_SCENARIO.scenario_id,
    demoWorkflows(),
    DEMO_SCENARIO,
    DEMO_REQUIRED_CHECKS,
  );
  const { jsonPath, htmlPath } = writeReport(outDir, built, DEMO_SCENARIO);
  printReportSummary(built, DEMO_SCENARIO, jsonPath, htmlPath, strictSkipped);
  const code = exitCodeForReport(built.report, strictSkipped);
  if (code !== 0) {
    console.log(
      `demo gate: exit ${code} is the §4.7 gate outcome for this synthetic scenario (required checks are PENDING_NOT_REPORTED), not a demo failure.`,
    );
  }
  return code;
}
