// T010 — Event Path section (PROJECT_BOOK §5.2).
//
// Renders one trigger chain per workflow from the frozen ReportV1
// event_evaluations: event -> activity type -> branch -> path ->
// commit skip, each with PASS / FAIL / UNKNOWN and its reason. The
// component only renders report rows; it never re-evaluates anything.

import type { ReportV1 } from "../core/types.js";

export interface EventPathProps {
  report: ReportV1;
}

function stepLabel(value: boolean | null): string {
  if (value === true) return "✓ PASS";
  if (value === false) return "✕ FAIL";
  return "? UNKNOWN";
}

export function EventPath({ report }: EventPathProps): React.ReactElement {
  return (
    <section>
      <h2>Event Path</h2>
      <p>
        One chain per workflow: event → activity type → branch → path → commit skip. Click a
        filter step to expand the declared patterns (shown by the CLI HTML report).
      </p>
      {report.event_evaluations.length === 0 && <p>No workflows found.</p>}
      {report.event_evaluations.map((ev) => (
        <div key={ev.workflow_path} data-workflow-path={ev.workflow_path}>
          <h3>
            {ev.workflow_path} —{" "}
            {ev.triggered === null ? "trigger unknown" : ev.triggered ? "TRIGGERED" : "NOT TRIGGERED"}
          </h3>
          <table>
            <thead>
              <tr>
                <th>Step</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Event ({ev.event_name}{ev.action !== null ? `/${ev.action}` : ""})</td>
                {/* ReportV1 event rows carry no event_match field: the
                    event step is derived from the trigger reason —
                    event_mismatch fails it, invalid/unknown leaves it
                    unknown, anything else passed it. */}
                <td>
                  {ev.reason === "event_mismatch"
                    ? "✕ FAIL"
                    : ev.triggered === null
                      ? "? UNKNOWN"
                      : "✓ PASS"}
                </td>
              </tr>
              <tr>
                <td>Activity type</td>
                <td>{stepLabel(ev.activity_type_match)}</td>
              </tr>
              <tr>
                <td>Branch</td>
                <td>{stepLabel(ev.branch_match)}</td>
              </tr>
              <tr>
                <td>Path</td>
                <td>{stepLabel(ev.path_match)}</td>
              </tr>
              <tr>
                <td>Commit skip</td>
                <td>{ev.commit_skip ? "✕ FAIL — message contains a skip token" : "✓ PASS — no skip token"}</td>
              </tr>
            </tbody>
          </table>
          <p>
            Trigger reason: <code>{ev.reason}</code>
          </p>
        </div>
      ))}
    </section>
  );
}

export default EventPath;
