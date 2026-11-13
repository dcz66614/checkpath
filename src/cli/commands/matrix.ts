// T010 — `matrix` command.
//
//   checkpath matrix --repo <dir> --suite <suite.json>
//     --required-checks <required-checks.yml> [--out <dir>]
//     [--strict-skipped]
//
// A suite file is `checkpath.suite/v1`:
//   {"schema": "checkpath.suite/v1", "suite_id": "merge-queue",
//    "scenarios": ["../scenarios/pr-docs-only.json", ...]}
// Scenario paths are relative to the suite file. For every scenario
// the command runs the same analysis as `analyze` and writes
// `<out>/<scenario_id>/report.json|report.html`, then writes the
// aggregate `matrix.json` + `matrix.html` into `<out>` (default
// `reports/<suite_id>`). The matrix exit code is the worst
// per-scenario exit code (3 beats 2 beats 0; --strict-skipped is
// applied per scenario before aggregating).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonicalJson } from "../../core/canonical-json.js";
import { buildMatrix, buildMatrixHtml, type MatrixScenarioInput } from "../../report/matrix.js";
import {
  analyzeCase,
  CliError,
  loadRepoWorkflows,
  loadRequiredChecks,
  loadScenario,
  parseArgs,
  printReportSummary,
  requiredFlag,
  suiteDirOf,
  writeReport,
} from "./common.js";

export interface SuiteFile {
  schema: string;
  suite_id: string;
  scenarios: string[];
}

export function loadSuite(path: string): SuiteFile {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new CliError(`suite file not found: ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new CliError(`suite file is not valid JSON (${path}): ${(error as Error).message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError(`suite file must be a JSON object: ${path}`);
  }
  const obj = parsed as Record<string, unknown>;
  if (obj["schema"] !== "checkpath.suite/v1") {
    throw new CliError(`suite file schema must be checkpath.suite/v1: ${path}`);
  }
  if (typeof obj["suite_id"] !== "string" || obj["suite_id"] === "") {
    throw new CliError(`suite file suite_id must be a non-empty string: ${path}`);
  }
  if (!Array.isArray(obj["scenarios"]) || obj["scenarios"].length === 0) {
    throw new CliError(`suite file scenarios must be a non-empty array: ${path}`);
  }
  for (const entry of obj["scenarios"] as unknown[]) {
    if (typeof entry !== "string" || entry === "") {
      throw new CliError(`suite file scenarios must be non-empty strings: ${path}`);
    }
  }
  return {
    schema: "checkpath.suite/v1",
    suite_id: obj["suite_id"] as string,
    scenarios: obj["scenarios"] as string[],
  };
}

export async function matrixCommand(argv: string[]): Promise<number> {
  const args = parseArgs(
    argv,
    ["repo", "suite", "required-checks", "out"],
    ["strict-skipped", "help"],
  );
  if (args.flags["help"] === true) {
    console.log(
      "Usage: checkpath matrix --repo <dir> --suite <suite.json> --required-checks <required-checks.yml> [--out <dir>] [--strict-skipped]\n\nRuns every scenario in a checkpath.suite/v1 suite, writes <out>/<scenario_id>/report.json|report.html per scenario plus <out>/matrix.json|matrix.html. Exit code is the worst per-scenario gate code.",
    );
    return 0;
  }
  const repo = requiredFlag(args, "repo");
  const suitePath = requiredFlag(args, "suite");
  const requiredChecksPath = requiredFlag(args, "required-checks");
  const strictSkipped = args.flags["strict-skipped"] === true;
  const suite = loadSuite(suitePath);
  const requiredChecks = loadRequiredChecks(requiredChecksPath);
  const workflows = loadRepoWorkflows(repo);
  const outDir =
    typeof args.flags["out"] === "string"
      ? (args.flags["out"] as string)
      : `reports/${suite.suite_id}`;
  mkdirSync(outDir, { recursive: true });
  const inputs: MatrixScenarioInput[] = [];
  for (const scenarioRel of suite.scenarios) {
    const scenarioPath = resolve(suiteDirOf(suitePath), scenarioRel);
    const scenario = loadScenario(scenarioPath);
    const built = analyzeCase(scenario.scenario_id, workflows, scenario, requiredChecks);
    const scenarioOut = join(outDir, scenario.scenario_id);
    const { jsonPath, htmlPath } = writeReport(scenarioOut, built, scenario);
    printReportSummary(built, scenario, jsonPath, htmlPath, strictSkipped);
    console.log("---");
    inputs.push({
      scenario_id: scenario.scenario_id,
      report_path: scenario.scenario_id,
      report: built.report,
      strictSkipped,
    });
  }
  const matrix = buildMatrix(suite.suite_id, inputs);
  writeFileSync(join(outDir, "matrix.json"), canonicalJson(matrix) + "\n", "utf8");
  writeFileSync(join(outDir, "matrix.html"), buildMatrixHtml(matrix), "utf8");
  console.log(`suite: ${suite.suite_id} (${inputs.length} scenarios)`);
  console.log(`matrix json: ${join(outDir, "matrix.json")}`);
  console.log(`matrix html: ${join(outDir, "matrix.html")}`);
  console.log(`exit code: ${matrix.exit_code}`);
  return matrix.exit_code;
}
