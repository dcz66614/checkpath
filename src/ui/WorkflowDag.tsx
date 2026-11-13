// T010 — Workflow / Job DAG section (PROJECT_BOOK §5.2).
//
// Renders workflow nodes and their job nodes from the frozen ReportV1
// rows; `needs` edges are shown as text on each job. `highlighted`
// marks the provider path of the required check the user clicked in
// RequiredCheckTable (the same interaction the offline HTML report
// implements in vanilla JS). The component only renders report rows.

import type { ReportV1 } from "../core/types.js";

export interface ProviderHighlight {
  workflowPath: string | null;
  jobId: string | null;
}

export interface WorkflowDagProps {
  report: ReportV1;
  highlighted: ProviderHighlight | null;
}

export function WorkflowDag({ report, highlighted }: WorkflowDagProps): React.ReactElement {
  return (
    <section>
      <h2>Workflow / Job DAG</h2>
      <p>Nodes are workflows and their jobs; edges are the needs relations shown on each job.</p>
      {report.workflow_evaluations.length === 0 && <p>No workflows found.</p>}
      {report.workflow_evaluations.map((wf) => {
        const jobs = report.job_evaluations.filter((job) => job.workflow_path === wf.workflow_path);
        const isHighlighted =
          highlighted !== null && highlighted.workflowPath === wf.workflow_path;
        return (
          <div
            key={wf.workflow_path}
            data-workflow-path={wf.workflow_path}
            style={isHighlighted ? { outline: "3px solid #005fcc", background: "#e8f1ff" } : undefined}
          >
            <h3>
              {wf.workflow_path} — {wf.status} /{" "}
              {wf.triggered === null ? "trigger unknown" : wf.triggered ? "TRIGGERED" : "NOT TRIGGERED"}
            </h3>
            <p>
              Trigger reason: <code>{wf.reason}</code>
            </p>
            {jobs.length === 0 && <p>No jobs declared.</p>}
            {jobs.map((job) => {
              const jobHighlighted =
                isHighlighted && highlighted !== null && highlighted.jobId === job.job_id;
              return (
                <div
                  key={`${job.workflow_path}/${job.job_id}`}
                  data-workflow-path={job.workflow_path}
                  data-job-id={job.job_id}
                  style={jobHighlighted ? { outline: "3px solid #005fcc", background: "#e8f1ff" } : undefined}
                >
                  <strong>
                    Job <code>{job.job_id}</code>
                  </strong>{" "}
                  (context <code>{job.context}</code>) — {job.status}
                  <br />
                  <span>reason: <code>{job.reason}</code></span>
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

export default WorkflowDag;
