// T010 — CheckPath CLI entry point.
//
//   checkpath demo [--out <dir>] [--strict-skipped]
//   checkpath analyze --repo <dir> --scenario <f> --required-checks <f> [--out <dir>] [--strict-skipped]
//   checkpath matrix --repo <dir> --suite <f> --required-checks <f> [--out <dir>] [--strict-skipped]
//   checkpath --help | --version
//
// Local only: no GitHub API, no token, no Docker, no network at
// runtime. Exit codes follow PROJECT_BOOK §4.7 (0 reportable, 2
// pending/ambiguous/unknown, 3 invalid or input/usage error).
// `main` returns the exit code instead of calling process.exit so
// tests can invoke the CLI in-process; the dist launcher applies the
// returned code to process.exitCode.

import { analyzeCommand } from "./commands/analyze.js";
import { demoCommand } from "./commands/demo.js";
import { matrixCommand } from "./commands/matrix.js";
import { CliError } from "./commands/common.js";
import { TOOL_VERSION } from "../report/build.js";

export const USAGE = `CheckPath — deterministic GitHub Actions required-check coverage simulator (local, offline).

Usage:
  checkpath demo [--out <dir>] [--strict-skipped]
  checkpath analyze --repo <dir> --scenario <scenario.json> --required-checks <required-checks.yml> [--out <dir>] [--strict-skipped]
  checkpath matrix --repo <dir> --suite <suite.json> --required-checks <required-checks.yml> [--out <dir>] [--strict-skipped]
  checkpath --help | --version

Exit codes: 0 all required checks reportable, 2 pending/ambiguous/unknown (or skipped with --strict-skipped), 3 invalid or input/usage error.`;

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === undefined || command === "--help" || command === "-h") {
      console.log(USAGE);
      return 0;
    }
    if (command === "--version") {
      console.log(TOOL_VERSION);
      return 0;
    }
    switch (command) {
      case "demo":
        return await demoCommand(rest);
      case "analyze":
        return await analyzeCommand(rest);
      case "matrix":
        return await matrixCommand(rest);
      default:
        console.error(`unknown command: ${command}\n\n${USAGE}`);
        return 3;
    }
  } catch (error) {
    if (error instanceof CliError) {
      console.error(`error: ${error.message}`);
      return error.exitCode;
    }
    console.error(`error: ${(error as Error).message}`);
    return 3;
  }
}
