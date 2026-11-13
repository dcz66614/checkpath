// T010 — Report viewer app (PROJECT_BOOK §5.2).
//
// The offline report UI: Summary + Event Path + Workflow/Job DAG +
// Required Checks + Witness, over one ReportFile. When no report is
// loaded (plain `vite dev` / `vite build` preview without an injected
// report), it shows the empty state with the CLI commands that
// produce a report instead of pretending to have data.
//
// The single-file HTML report (src/report/html.ts) is a separate,
// dependency-free rendering of the same sections for sharing; this
// React app is the browser view used when the built UI is served
// locally. Both render from the same ReportV1 — neither re-evaluates.

import { useState } from "react";
import type { ReportFile } from "../report/json.js";
import { EventPath } from "./EventPath.js";
import { WorkflowDag, type ProviderHighlight } from "./WorkflowDag.js";
import { RequiredCheckTable } from "./RequiredCheckTable.js";
import { WitnessPanel } from "./WitnessPanel.js";

export interface AppProps {
  /** Null renders the empty state (no report loaded). */
  data: ReportFile | null;
}

export function App({ data }: AppProps): React.ReactElement {
  const [highlighted, setHighlighted] = useState<ProviderHighlight | null>(null);
  if (data === null) {
    return (
      <main>
        <h1>CheckPath report viewer</h1>
        <p>No report loaded. Generate one with the local CLI (no token, no network):</p>
        <pre>node dist/checkpath.mjs demo
node dist/checkpath.mjs analyze --repo examples/repo-basic --scenario examples/scenarios/pr-docs-only.json --required-checks examples/required-checks.yml --out reports/pr-docs-only</pre>
        <p>Then open the generated report.html, or serve this UI and inject the report as window.__CHECKPATH_REPORT__.</p>
      </main>
    );
  }
  const report = data.report;
  const counts = report.required_check_results.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <main>
      <h1>CheckPath report — {report.scenario_id}</h1>
      <p>
        Self-contained offline report. REPORTABLE_PENDING means the check will be reported — it
        does NOT mean the job passed.
      </p>
      <section>
        <h2>Summary</h2>
        <table>
          <tbody>
            <tr>
              <th>Scenario</th>
              <td>
                <code>{report.scenario_id}</code>
              </td>
            </tr>
            <tr>
              <th>Workflows</th>
              <td>
                {report.workflow_evaluations.length} (
                {report.workflow_evaluations.filter((w) => w.triggered === true).length} triggered)
              </td>
            </tr>
            <tr>
              <th>Required checks</th>
              <td>
                {report.required_check_results.length} (
                {Object.entries(counts)
                  .map(([status, n]) => `${status}=${n}`)
                  .join(" ")}
                )
              </td>
            </tr>
            <tr>
              <th>Report SHA-256</th>
              <td>
                <code>{report.report_sha256}</code>
              </td>
            </tr>
            {data.diff_boundary !== null && (
              <tr>
                <th>Diff boundary</th>
                <td>
                  <code>{data.diff_boundary}</code> (report-layer annotation; not a ReportV1
                  field)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <EventPath report={report} />
      <WorkflowDag report={report} highlighted={highlighted} />
      <RequiredCheckTable report={report} onSelect={setHighlighted} />
      <WitnessPanel report={report} recommendations={data.recommendations} scenario={data.scenario} />
    </main>
  );
}

export default App;
