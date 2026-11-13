// T010 — `analyze` command.
//
//   checkpath analyze --repo <dir> --scenario <scenario.json>
//     --required-checks <required-checks.yml> [--out <dir>]
//     [--strict-skipped]
//
// Reads the repo's `.github/workflows/*.yml|*.yaml`, one scenario and
// one required-checks manifest (all local files; no network, no token),
// builds a ReportV1 + offline HTML report, writes report.json +
// report.html into --out (default `reports/<scenario_id>`), prints a
// terminal summary, and exits with the §4.7 gate code:
//   0 — every required check REPORTABLE_PENDING (or SKIPPED_SUCCESS
//       without --strict-skipped)
//   2 — any PENDING_NOT_REPORTED / AMBIGUOUS / UNKNOWN (or
//       SKIPPED_SUCCESS with --strict-skipped)
//   3 — any INVALID check, or an input/usage error (missing file,
//       unparseable or invalid scenario / manifest) — no report is
//       written for input errors.

import { exitCodeForReport } from "../../report/build.js";
import {
  analyzeCase,
  loadRepoWorkflows,
  loadRequiredChecks,
  loadScenario,
  parseArgs,
  printReportSummary,
  requiredFlag,
  writeReport,
} from "./common.js";

export async function analyzeCommand(argv: string[]): Promise<number> {
  const args = parseArgs(
    argv,
    ["repo", "scenario", "required-checks", "out"],
    ["strict-skipped", "help"],
  );
  if (args.flags["help"] === true) {
    console.log(
      "Usage: checkpath analyze --repo <dir> --scenario <scenario.json> --required-checks <required-checks.yml> [--out <dir>] [--strict-skipped]\n\nAnalyzes one scenario against a repo's local .github/workflows. Writes report.json + report.html to <dir> (default reports/<scenario_id>). Exit codes: 0 all reportable, 2 pending/ambiguous/unknown (or skipped with --strict-skipped), 3 invalid or input error.",
    );
    return 0;
  }
  const repo = requiredFlag(args, "repo");
  const scenarioPath = requiredFlag(args, "scenario");
  const requiredChecksPath = requiredFlag(args, "required-checks");
  const strictSkipped = args.flags["strict-skipped"] === true;
  const scenario = loadScenario(scenarioPath);
  const requiredChecks = loadRequiredChecks(requiredChecksPath);
  const workflows = loadRepoWorkflows(repo);
  const built = analyzeCase(scenario.scenario_id, workflows, scenario, requiredChecks);
  const outDir =
    typeof args.flags["out"] === "string"
      ? (args.flags["out"] as string)
      : `reports/${scenario.scenario_id}`;
  const { jsonPath, htmlPath } = writeReport(outDir, built, scenario);
  printReportSummary(built, scenario, jsonPath, htmlPath, strictSkipped);
  return exitCodeForReport(built.report, strictSkipped);
}
