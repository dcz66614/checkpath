// T008 — Checks-suite loader shared by the check-resolver tests and
// the Oracle checks-diff dump test (not a test file itself).
//
// Loads tests/fixtures/checks/suite.json (34 YAML cases: the 24 S0 E2E
// fixtures re-used as check cases plus 10 new T8 cases) and the 12 S0
// job-check cases (tests/fixtures/s0/job-check/suite.json, referenced,
// never copied or modified). S0 fixture files are referenced, never
// copied or modified.
//
// Per YAML case the loader runs the FORMAL pipeline per workflow file
// (buildWorkflowIR + trigger evaluation + evaluateJobsForTrigger +
// resolveRequiredChecksKeyed) and records the required-check results
// in the exact shape the Python Reference Oracle emits for the same
// case (evaluator.evaluate_e2e_fixture `.required_checks`:
// {context, status, provider_job_id, provider_count, reason}), so
// the diff script can compare the two field-by-field. The keyed
// results are kept alongside the projected base rows so tests can
// also assert the (workflow, job_id) provider identity. The trigger
// branching mirrors jobs-suite.ts / e2e.ts exactly (INVALID ->
// "invalid", UNKNOWN or triggered null -> "unknown", otherwise the
// boolean). The frozen expected checks come from the S0 expected.json
// for s0-e2e cases and from suite.json itself for T8 cases.

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
  type WorkflowTriggerState,
} from "../../../src/core/job-dag.js";
import {
  resolveRequiredChecks,
  resolveRequiredChecksKeyed,
  toBaseCheckResult,
  type KeyedJobWithTrigger,
  type KeyedRequiredCheckResult,
  type RequiredCheckResult,
} from "../../../src/core/check-resolver.js";
import { extractJobs } from "../../../src/core/e2e.js";
import type {
  EventName,
  ScenarioV1,
  WorkflowIREvent,
  WorkflowIRJob,
} from "../../../src/core/types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const CHECKS_SUITE_DIR = join(here, "../../fixtures/checks");

export interface ChecksSuiteEntry {
  id: string;
  dir: string;
  workflows: string[];
  scenario: string;
  required_checks: string;
  source: string;
  expected: "s0-expected" | RequiredCheckResult[];
}

export interface ChecksSuiteCase {
  entry: ChecksSuiteEntry;
  scenario: ScenarioV1;
  /** Formal keyed resolutions (with provider workflow + key). */
  keyed: KeyedRequiredCheckResult[];
  /** The same verdicts projected to the Oracle-compatible shape. */
  checks: RequiredCheckResult[];
  /** The frozen expected checks for this case. */
  expectedChecks: RequiredCheckResult[];
}

/** One S0 job-check case (no YAML): raw case + formal resolution. */
export interface CheckJobCheckSuiteCase {
  id: string;
  raw: JobCheckInput & {
    id: string;
    expected: {
      jobs: Record<string, string>;
      required_checks: Record<string, string>;
    };
  };
  jobs: JobEvaluation[];
  checks: RequiredCheckResult[];
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
export function loadChecksCase(entry: ChecksSuiteEntry): ChecksSuiteCase {
  const fixtureDir = join(CHECKS_SUITE_DIR, entry.dir);
  const rawScenario = JSON.parse(
    readFileSync(join(fixtureDir, entry.scenario), "utf-8"),
  ) as unknown;
  const validated = validateScenario(rawScenario);
  if (!validated.ok) {
    throw new Error(
      `checks case ${entry.id}: scenario fails validation: ${JSON.stringify(validated.issues)}`,
    );
  }
  const scenario = validated.value;

  const requiredChecks = (
    JSON.parse(
      readFileSync(join(fixtureDir, entry.required_checks), "utf-8"),
    ) as { required_checks: JobCheckInput["required_checks"] }
  ).required_checks;

  const providers: KeyedJobWithTrigger[] = [];
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
      // as jobs-suite.ts: ok builds use the workflow, otherwise the
      // parsed events with the parse status).
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
    const keyed = evaluateJobsForTrigger({
      workflow_path: workflowPath,
      trigger: triggerState,
      scenario,
      jobs: irJobs,
    });
    for (const job of keyed) {
      providers.push({ job, trigger: triggerState });
    }
  }

  const keyed = resolveRequiredChecksKeyed(requiredChecks, providers);

  let expectedChecks: RequiredCheckResult[];
  if (entry.expected === "s0-expected") {
    const expected = JSON.parse(
      readFileSync(join(fixtureDir, "expected.json"), "utf-8"),
    ) as { required_checks: RequiredCheckResult[] };
    expectedChecks = expected.required_checks;
  } else {
    expectedChecks = entry.expected;
  }

  return {
    entry,
    scenario,
    keyed,
    checks: keyed.map(toBaseCheckResult),
    expectedChecks,
  };
}

/** Load the checks suite: 34 YAML cases + the 12 S0 job-check cases. */
export function loadChecksSuite(): {
  suite: {
    schema: string;
    suite_id: string;
    seed: number;
    fixtures: ChecksSuiteEntry[];
    job_check_suite: string;
  };
  cases: ChecksSuiteCase[];
  jobCheckCases: CheckJobCheckSuiteCase[];
} {
  const suite = JSON.parse(
    readFileSync(join(CHECKS_SUITE_DIR, "suite.json"), "utf-8"),
  ) as {
    schema: string;
    suite_id: string;
    seed: number;
    fixtures: ChecksSuiteEntry[];
    job_check_suite: string;
  };
  const cases = suite.fixtures.map((entry) => loadChecksCase(entry));
  const jobCheckSuite = JSON.parse(
    readFileSync(join(CHECKS_SUITE_DIR, suite.job_check_suite), "utf-8"),
  ) as {
    cases: Array<
      JobCheckInput & {
        id: string;
        expected: {
          jobs: Record<string, string>;
          required_checks: Record<string, string>;
        };
      }
    >;
  };
  const jobCheckCases: CheckJobCheckSuiteCase[] = jobCheckSuite.cases.map(
    (c) => {
      const jobs = evaluateJobs({
        workflow_triggered: c.workflow_triggered,
        trigger_reason: c.trigger_reason ?? null,
        scenario: c.scenario ?? {},
        jobs: c.jobs,
        required_checks: c.required_checks,
      });
      return {
        id: c.id,
        raw: c,
        jobs,
        checks: resolveRequiredChecks(
          {
            workflow_triggered: c.workflow_triggered,
            trigger_reason: c.trigger_reason ?? null,
            scenario: c.scenario ?? {},
            jobs: c.jobs,
            required_checks: c.required_checks,
          },
          jobs,
        ),
      };
    },
  );
  return { suite, cases, jobCheckCases };
}
