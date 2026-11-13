// T010 — Required Checks table (PROJECT_BOOK §5.2).
//
// One row per required check with its final status, provider and
// whether it reports. Clicking a row calls `onSelect` with the
// provider identity so App can highlight the provider path in the
// DAG; a check with no single provider (no provider / ambiguous)
// selects a null provider. UNKNOWN rows carry the resolver reason so
// the unsupported syntax is named, not just coloured.

import type { ReportRequiredCheckResult } from "../core/types.js";
import type { ReportV1 } from "../core/types.js";
import type { ProviderHighlight } from "./WorkflowDag.js";

export interface RequiredCheckTableProps {
  report: ReportV1;
  onSelect: (highlight: ProviderHighlight) => void;
}

export function RequiredCheckTable({ report, onSelect }: RequiredCheckTableProps): React.ReactElement {
  const rows: ReportRequiredCheckResult[] = report.required_check_results;
  return (
    <section>
      <h2>Required Checks</h2>
      <p>Click a row to highlight its provider workflow / job in the DAG above.</p>
      <table>
        <thead>
          <tr>
            <th>Context</th>
            <th>Status</th>
            <th>Provider</th>
            <th>Will report?</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5}>No required checks declared.</td>
            </tr>
          )}
          {rows.map((row, index) => {
            const provider =
              row.provider_count === 1
                ? `${row.provider_workflow_path ?? ""} / ${row.provider_job_id ?? ""}`
                : row.provider_count === 0
                  ? "(no provider)"
                  : `(${row.provider_count} providers — ambiguous)`;
            const reports =
              row.status === "REPORTABLE_PENDING"
                ? "Yes — will be reported (real outcome unknown)"
                : row.status === "SKIPPED_SUCCESS"
                  ? "Yes — reported as skipped/success without running"
                  : "No";
            return (
              // FIX-P2 (T013 P2-3): the key must be unique per ROW, not
              // per context. Duplicate-context manifests (T8-05/G-57:
              // the same context listed three times) give several rows
              // the same context, so `key={row.context}` produced
              // duplicate React keys. The manifest index is the row
              // identity: rows are rendered in manifest order and the
              // report is immutable once built, so the index is stable
              // for the lifetime of the table.
              <tr
                key={`${index}:${row.context}`}
                onClick={() =>
                  onSelect({
                    workflowPath: row.provider_workflow_path,
                    jobId: row.provider_job_id,
                  })
                }
                style={{ cursor: "pointer" }}
              >
                <td>
                  <code>{row.context}</code>
                </td>
                <td>{row.status}</td>
                <td>{provider}</td>
                <td>{reports}</td>
                <td>
                  <code>{row.reason}</code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default RequiredCheckTable;
