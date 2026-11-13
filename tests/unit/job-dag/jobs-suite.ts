// T007 — Jobs-suite loader shared by the job-dag tests and the
// Oracle jobs-diff dump test (not a test file itself).
//
// Loads tests/fixtures/jobs/suite.json (36 YAML cases: the 24 S0 E2E
// fixtures re-used as job cases plus 12 new T7 cases) and the 12 S0
// job-check cases (tests/fixtures/s0/job-check/suite.json, referenced,
// never copied or modified). S0 fixture files are referenced, never
// copied or modified.
//
// Per YAML case the loader runs the FORMAL pipeline per workflow file
// (buildWorkflowIR + trigger evaluation + evaluateJobsForTrigger) and
// records the keyed job list in the exact shape the Python Reference
// Oracle emits for the same case (evaluator.evaluate_e2e_fixture
// `.jobs`: {workflow, job_id, context, status, reason}), so the diff
// script can compare the two field-by-field. The frozen expected jobs
// come from the S0 expected.json for s0-e2e cases and from suite.json
// itself for T7 cases.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateScenario } from "../../../src/core/validate.js";
import { buildWorkflowIR } from "../../../src/core/workflow-ir.js";
import {
  evaluateTriggerEvents,
  evaluateWorkflowTrigger,
} from "../../../src/core/event-evaluator.js";
import {
  evaluateJobs,
  evaluateJobsForTrigger,
  type JobCheckInput,
  type JobEvaluation,
  type KeyedJobEvaluation,
  type WorkflowTriggerState,
} from "../../../src/core/job-dag.js";
import { extractJobs } from "../../../src/core/e2e.js";
import type {
  EventName,
  ScenarioV1,
  WorkflowIREvent,
  WorkflowIRJob,
} from "../../../src/core/types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const JOBS_SUITE_DIR = join(here, "../../fixtures/jobs");

export interface JobsSuiteEntry {
  id: string;
  dir: string;
  workflows: string[];
  scenario: string;
  required_checks: string;
  source: string;
  expected: "s0-expected" | JobDumpEntry[];
}

/** One job row, in the Oracle's evaluate_e2e_fixture `.jobs` shape. */
export interface JobDumpEntry {
  workflow: string;
  job_id: string;
  context: string;
  status: string;
  reason: string;
}

export interface JobsSuiteCase {
  entry: JobsSuiteEntry;
  scenario: ScenarioV1;
  /** Formal keyed evaluations, in workflow/file order. */
  jobs: KeyedJobEvaluation[];
  /** The frozen expected jobs for this case. */
  expectedJobs: JobDumpEntry[];
}

/** One S0 job-check case (no YAML): raw case + formal evaluation. */
export interface JobCheckSuiteCase {
  id: string;
  raw: JobCheckInput & { id: string; expected: { jobs: Record<string, string> } };
  jobs: JobEvaluation[];
}

function toIRJobs(
  jobs: ReturnType<typeof extractJobs>,
): WorkflowIRJob[] {
  return jobs.map((job) => ({
    id: job.id,
    name: job.name ?? null,
    needs: job.needs ?? [],
    if: job.if ?? null,
    context: job.name ?? job.id,
  }));
}

/** Load one YAML case through the formal pipeline. */
export function loadJobsCase(entry: JobsSuiteEntry): JobsSuiteCase {
  const fixtureDir = join(JOBS_SUITE_DIR, entry.dir);
  const rawScenario = JSON.parse(
    readFileSync(join(fixtureDir, entry.scenario), "utf-8"),
  ) as unknown;
  const validated = validateScenario(rawScenario);
  if (!validated.ok) {
    throw new Error(
      `jobs case ${entry.id}: scenario fails validation: ${JSON.stringify(validated.issues)}`,
    );
  }
  const scenario = validated.value;

  const jobs: KeyedJobEvaluation[] = [];
  for (const workflowPath of entry.workflows) {
    const yamlText = readFileSync(join(fixtureDir, workflowPath), "utf-8");
    const built = buildWorkflowIR(yamlText, workflowPath, entry.id);
    let triggerState: WorkflowTriggerState;
    if (built.status === "INVALID") {
      triggerState = "invalid";
    } else if (built.status === "UNKNOWN") {
      triggerState = "unknown";
    } else {
      // VALID parse: evaluate the trigger formally (same branching
      // as trigger-suite.ts: ok builds use the workflow, otherwise
      // the parsed events with the parse status).
      let triggered: boolean | null;
      if (built.ok && built.workflow !== null) {
        triggered = evaluateWorkflowTrigger(built.workflow, scenario).triggered;
      } else {
        const events: WorkflowIREvent[] = built.trigger.events.map((e) => ({
          name: e.name as EventName,
          types: e.types,
          branches: e.branches,
          branches_ignore: e.branches_ignore,
          paths: e.paths,
          paths_ignore: e.paths_ignore,
        }));
        triggered = evaluateTriggerEvents(
          events,
          built.status,
          built.unsupported,
          scenario,
        ).triggered;
      }
      triggerState =
        triggered === null
          ? "unknown"
          : triggered
            ? "triggered"
            : "not_triggered";
    }
    const irJobs: WorkflowIRJob[] =
      built.workflow?.jobs ?? toIRJobs(extractJobs(yamlText));
    jobs.push(
      ...evaluateJobsForTrigger({
        workflow_path: workflowPath,
        trigger: triggerState,
        scenario,
        jobs: irJobs,
      }),
    );
  }

  let expectedJobs: JobDumpEntry[];
  if (entry.expected === "s0-expected") {
    const expected = JSON.parse(
      readFileSync(join(fixtureDir, "expected.json"), "utf-8"),
    ) as { jobs: JobDumpEntry[] };
    expectedJobs = expected.jobs;
  } else {
    expectedJobs = entry.expected;
  }

  return { entry, scenario, jobs, expectedJobs };
}

/** Load the jobs suite: 36 YAML cases + the 12 S0 job-check cases. */
export function loadJobsSuite(): {
  suite: {
    schema: string;
    suite_id: string;
    seed: number;
    fixtures: JobsSuiteEntry[];
    job_check_suite: string;
  };
  cases: JobsSuiteCase[];
  jobCheckCases: JobCheckSuiteCase[];
} {
  const suite = JSON.parse(
    readFileSync(join(JOBS_SUITE_DIR, "suite.json"), "utf-8"),
  ) as {
    schema: string;
    suite_id: string;
    seed: number;
    fixtures: JobsSuiteEntry[];
    job_check_suite: string;
  };
  const cases = suite.fixtures.map((entry) => loadJobsCase(entry));
  const jobCheckSuite = JSON.parse(
    readFileSync(join(JOBS_SUITE_DIR, suite.job_check_suite), "utf-8"),
  ) as {
    cases: Array<
      JobCheckInput & { id: string; expected: { jobs: Record<string, string> } }
    >;
  };
  const jobCheckCases: JobCheckSuiteCase[] = jobCheckSuite.cases.map((c) => ({
    id: c.id,
    raw: c,
    jobs: evaluateJobs({
      workflow_triggered: c.workflow_triggered,
      trigger_reason: c.trigger_reason ?? null,
      scenario: c.scenario ?? {},
      jobs: c.jobs,
      required_checks: c.required_checks,
    }),
  }));
  return { suite, cases, jobCheckCases };
}

/** The TS-side dump rows for one YAML case (Oracle `.jobs` shape). */
export function dumpRows(jobs: KeyedJobEvaluation[]): JobDumpEntry[] {
  return jobs.map((job) => ({
    workflow: job.workflow_path,
    job_id: job.job_id,
    context: job.context,
    status: job.status,
    reason: job.reason,
  }));
}

/** The TS-side dump rows for one job-check case (Oracle `.job_details` shape). */
export function dumpJobCheckRows(jobs: JobEvaluation[]): Array<{
  job_id: string;
  context: string;
  status: string;
  reason: string;
}> {
  return jobs.map((job) => ({
    job_id: job.job_id,
    context: job.context,
    status: job.status,
    reason: job.reason,
  }));
}
