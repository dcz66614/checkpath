// T010 — Coverage matrix over a scenario suite (PROJECT_BOOK §5.1).
//
// `matrix` runs `analyze` once per scenario listed in a suite file
// (`checkpath.suite/v1`: {schema, suite_id, scenarios: [paths relative
// to the suite file]}) and aggregates the results:
//
//   * one report directory per scenario, named by scenario_id, with
//     the same report.json / report.html an `analyze` run writes;
//   * `matrix.json` — the frozen `checkpath.matrix/v1` document:
//     one row per scenario (its exit code and status counts) plus one
//     row per required-check context (its status in every scenario);
//   * `matrix.html` — a single offline page with the same table,
//     linking to each per-scenario report.html by relative path.
//
// Matrix exit code: the worst per-scenario exit code (3 beats 2 beats
// 0; --strict-skipped is applied per scenario before aggregating).

import type { CheckStatus, ReportV1 } from "../core/types.js";
import { TOOL_VERSION, countCheckStatuses, exitCodeForReport } from "./build.js";
import { escapeHtml } from "./html.js";

export const MATRIX_SCHEMA = "checkpath.matrix/v1" as const;

export interface MatrixScenarioRow {
  scenario_id: string;
  report_path: string;
  exit_code: number;
  check_status_counts: Record<CheckStatus, number>;
}

export interface MatrixCheckRow {
  context: string;
  /** Status per scenario_id (every scenario in the suite appears). */
  results: Record<string, CheckStatus>;
}

export interface MatrixV1 {
  schema: typeof MATRIX_SCHEMA;
  tool_version: string;
  suite_id: string;
  scenarios: MatrixScenarioRow[];
  checks: MatrixCheckRow[];
  exit_code: number;
}

/** One scenario's contribution to the matrix. */
export interface MatrixScenarioInput {
  scenario_id: string;
  /** Path of the scenario's report directory, relative to the matrix out dir. */
  report_path: string;
  report: ReportV1;
  strictSkipped: boolean;
}

/** Build the matrix document from per-scenario reports (pure). */
export function buildMatrix(suiteId: string, inputs: MatrixScenarioInput[]): MatrixV1 {
  const scenarios: MatrixScenarioRow[] = inputs.map((input) => ({
    scenario_id: input.scenario_id,
    report_path: input.report_path,
    exit_code: exitCodeForReport(input.report, input.strictSkipped),
    check_status_counts: countCheckStatuses(input.report),
  }));
  const contexts: string[] = [];
  for (const input of inputs) {
    for (const row of input.report.required_check_results) {
      if (!contexts.includes(row.context)) contexts.push(row.context);
    }
  }
  const checks: MatrixCheckRow[] = contexts.map((context) => {
    const results: Record<string, CheckStatus> = {};
    for (const input of inputs) {
      const row = input.report.required_check_results.find((r) => r.context === context);
      if (row !== undefined) results[input.scenario_id] = row.status;
    }
    return { context, results };
  });
  return {
    schema: MATRIX_SCHEMA,
    tool_version: TOOL_VERSION,
    suite_id: suiteId,
    scenarios,
    checks,
    exit_code: scenarios.reduce((worst, row) => Math.max(worst, row.exit_code), 0),
  };
}

function statusMark(status: CheckStatus): string {
  switch (status) {
    case "REPORTABLE_PENDING":
      return "✓";
    case "SKIPPED_SUCCESS":
      return "!";
    case "UNKNOWN":
      return "?";
    default:
      return "✕";
  }
}

/** Single offline HTML page for a matrix document (no remote resources). */
export function buildMatrixHtml(matrix: MatrixV1): string {
  const headerCells = matrix.scenarios
    .map(
      (row) =>
        `<th><a href="${escapeHtml(row.report_path)}/report.html">${escapeHtml(row.scenario_id)}</a><br><span class="muted">exit ${row.exit_code}</span></th>`,
    )
    .join("");
  const bodyRows = matrix.checks
    .map((check) => {
      const cells = matrix.scenarios
        .map((scenario) => {
          const status = check.results[scenario.scenario_id];
          return status === undefined
            ? "<td>—</td>"
            : `<td><span class="badge st-${status}">${statusMark(status)} ${escapeHtml(status)}</span></td>`;
        })
        .join("");
      return `<tr><td><code>${escapeHtml(check.context)}</code></td>${cells}</tr>`;
    })
    .join("\n");
  const scenarioRows = matrix.scenarios
    .map(
      (row) =>
        `<tr><td><a href="${escapeHtml(row.report_path)}/report.html">${escapeHtml(row.scenario_id)}</a></td><td>${row.exit_code}</td><td>${Object.entries(row.check_status_counts)
          .filter(([, n]) => n > 0)
          .map(([status, n]) => `${escapeHtml(status)}: ${n}`)
          .join(", ")}</td></tr>`,
    )
    .join("\n");
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>CheckPath matrix — ${escapeHtml(matrix.suite_id)}</title>`,
    "<style>body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;margin:0 auto;max-width:1100px;padding:24px;color:#1a1a1a}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f0f0f0}code{background:#f4f4f4;padding:1px 4px;border-radius:3px}.badge{display:inline-block;padding:1px 8px;border-radius:10px;border:1px solid #888;font-weight:600;font-size:12px;white-space:nowrap}.st-REPORTABLE_PENDING{background:#e2f5e2;border-color:#2a7a2a}.st-SKIPPED_SUCCESS{background:#fff3cd;border-color:#8a6d00}.st-PENDING_NOT_REPORTED{background:#fde2e2;border-color:#a00}.st-AMBIGUOUS,.st-UNKNOWN{background:#e8e8f8;border-color:#555}.st-INVALID{background:#333;color:#fff;border-color:#000}.muted{color:#555;font-size:13px}</style>",
    "</head>",
    "<body>",
    `<h1>CheckPath coverage matrix — ${escapeHtml(matrix.suite_id)}</h1>`,
    `<p class="muted">Self-contained offline page. Matrix exit code: <code>${matrix.exit_code}</code> (worst per-scenario exit code). <code>REPORTABLE_PENDING</code> means the check will be reported — it does NOT mean the job passed.</p>`,
    "<h2>Required checks × scenarios</h2>",
    `<table><thead><tr><th>Required check</th>${headerCells}</tr></thead><tbody>${bodyRows || '<tr><td colspan="2">No required checks in this suite.</td></tr>'}</tbody></table>`,
    "<h2>Scenarios</h2>",
    `<table><thead><tr><th>Scenario</th><th>Exit code</th><th>Status counts</th></tr></thead><tbody>${scenarioRows}</tbody></table>`,
    `<p class="muted">Tool version: <code>${escapeHtml(matrix.tool_version)}</code> — matrix schema <code>${escapeHtml(matrix.schema)}</code>.</p>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
