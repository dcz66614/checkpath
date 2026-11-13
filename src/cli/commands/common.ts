// T010 — Shared CLI helpers (file loading, validation, report writing).
//
// All file I/O for the three commands lives here so demo / analyze /
// matrix cannot drift apart on input handling. Evaluation itself is
// untouched: loading only parses + validates, then hands the validated
// objects to the report builder (src/report/build.ts).

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { buildReport, exitCodeForReport, type BuiltReport } from "../../report/build.js";
import { buildReportHtml } from "../../report/html.js";
import { reportFileText, toReportFile } from "../../report/json.js";
import { validateRequiredChecks, validateScenario, formatIssues } from "../../core/validate.js";
import type { ReportWorkflowInput } from "../../report/build.js";
import type { RequiredChecksV1, ScenarioV1 } from "../../core/types.js";

/** An input/usage error: the CLI exits 3 without writing a report. */
export class CliError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 3) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

/** Parsed `--flag value` / `--boolean` arguments. */
export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[], allowedFlags: string[], allowedBooleans: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      if (allowedBooleans.includes(name)) {
        flags[name] = true;
        continue;
      }
      if (!allowedFlags.includes(name)) {
        throw new CliError(`unknown flag ${arg}`);
      }
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new CliError(`flag ${arg} requires a value`);
      }
      flags[name] = value;
      i += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      flags["help"] = true;
      continue;
    }
    positional.push(arg);
  }
  return { positional, flags };
}

export function requiredFlag(args: ParsedArgs, name: string): string {
  const value = args.flags[name];
  if (typeof value !== "string" || value === "") {
    throw new CliError(`missing required flag --${name}`);
  }
  return value;
}

/** Read a repo's `.github/workflows/*.yml|*.yaml`, sorted by relative path. */
export function loadRepoWorkflows(repoDir: string): ReportWorkflowInput[] {
  const absolute = resolve(repoDir);
  let repoStat;
  try {
    repoStat = statSync(absolute);
  } catch {
    throw new CliError(`repo directory not found: ${repoDir}`);
  }
  if (!repoStat.isDirectory()) {
    throw new CliError(`repo path is not a directory: ${repoDir}`);
  }
  const workflowsDir = join(absolute, ".github", "workflows");
  let names: string[];
  try {
    names = readdirSync(workflowsDir);
  } catch {
    console.error(`warning: no .github/workflows directory in ${repoDir}; analyzing zero workflows`);
    return [];
  }
  const files = names
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
  return files.map((name) => {
    const full = join(workflowsDir, name);
    if (!statSync(full).isFile()) {
      throw new CliError(`workflow entry is not a file: ${full}`);
    }
    const rel = relative(absolute, full).split(sep).join("/");
    return { path: rel, yamlText: readFileSync(full, "utf8") };
  });
}

/** Read + validate a scenario JSON file. */
export function loadScenario(path: string): ScenarioV1 {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new CliError(`scenario file not found: ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new CliError(`scenario file is not valid JSON (${path}): ${(error as Error).message}`);
  }
  const result = validateScenario(parsed);
  if (!result.ok || result.value === null) {
    throw new CliError(`scenario file failed validation (${path}):\n${formatIssues(result.issues)}`);
  }
  return result.value;
}

/** Read + validate a required-checks YAML file. */
export function loadRequiredChecks(path: string): RequiredChecksV1 {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new CliError(`required-checks file not found: ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(text) as unknown;
  } catch (error) {
    throw new CliError(`required-checks file is not valid YAML (${path}): ${(error as Error).message}`);
  }
  const result = validateRequiredChecks(parsed);
  if (!result.ok || result.value === null) {
    throw new CliError(`required-checks file failed validation (${path}):\n${formatIssues(result.issues)}`);
  }
  return result.value;
}

/** Build a report for one case (pure builder; no I/O here). */
export function analyzeCase(
  fixtureId: string,
  workflows: ReportWorkflowInput[],
  scenario: ScenarioV1,
  requiredChecks: RequiredChecksV1,
): BuiltReport {
  return buildReport({
    fixtureId,
    workflows,
    scenario,
    requiredChecks: requiredChecks.required_checks,
  });
}

/** Write report.json + report.html into `outDir`; returns the file paths. */
export function writeReport(outDir: string, built: BuiltReport, scenario: ScenarioV1): { jsonPath: string; htmlPath: string } {
  mkdirSync(outDir, { recursive: true });
  const file = toReportFile(built, scenario);
  const jsonPath = join(outDir, "report.json");
  const htmlPath = join(outDir, "report.html");
  writeFileSync(jsonPath, reportFileText(file), "utf8");
  writeFileSync(htmlPath, buildReportHtml(file, built.evaluation), "utf8");
  return { jsonPath, htmlPath };
}

/** One-line-per-fact terminal summary (stdout) for a built report. */
export function printReportSummary(
  built: BuiltReport,
  scenario: ScenarioV1,
  jsonPath: string,
  htmlPath: string,
  strictSkipped: boolean,
): void {
  const report = built.report;
  const counts = report.required_check_results
    .map((row) => row.status)
    .reduce<Record<string, number>>((acc, status) => {
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});
  const countsText = Object.entries(counts)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([status, n]) => `${status}=${n}`)
    .join(" ");
  console.log(`scenario: ${report.scenario_id}`);
  console.log(
    `event: ${scenario.event.action !== null ? `${scenario.event.name}/${scenario.event.action}` : scenario.event.name}`,
  );
  console.log(`workflows: ${report.workflow_evaluations.length} (${report.workflow_evaluations.filter((w) => w.triggered === true).length} triggered)`);
  console.log(`jobs: ${report.job_evaluations.length}`);
  console.log(`required checks: ${report.required_check_results.length} (${countsText})`);
  console.log(`witnesses: ${report.witnesses.length}`);
  console.log(`report_sha256: ${report.report_sha256}`);
  console.log(`json: ${jsonPath}`);
  console.log(`html: ${htmlPath}`);
  console.log(`exit code: ${exitCodeForReport(report, strictSkipped)}`);
}

export function suiteDirOf(suitePath: string): string {
  return dirname(resolve(suitePath));
}
