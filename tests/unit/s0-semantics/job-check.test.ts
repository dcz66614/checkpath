// T003 PoC — S0 job/check semantics tests.
//
// Reads the frozen suite in tests/fixtures/s0/job-check/suite.json and
// asserts the TypeScript implementation (job-dag + check-resolver) matches
// every fixed expected result. The expected values are frozen inputs to
// this test, never edited to fit the implementation.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateJobs, type JobCheckInput } from "../../../src/core/job-dag";
import { resolveRequiredChecks } from "../../../src/core/check-resolver";

const suitePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/s0/job-check/suite.json",
);

interface SuiteCase {
  id: string;
  workflow_triggered: boolean;
  trigger_reason?: string | null;
  scenario?: JobCheckInput["scenario"];
  jobs: JobCheckInput["jobs"];
  required_checks: JobCheckInput["required_checks"];
  expected: {
    jobs: Record<string, string>;
    required_checks: Record<string, string>;
  };
}

interface Suite {
  suite_id: string;
  cases: SuiteCase[];
}

const suite = JSON.parse(readFileSync(suitePath, "utf-8")) as Suite;

describe("T003 job/check semantics (s0-job-check suite)", () => {
  it("suite contains the 12 frozen cases", () => {
    expect(suite.suite_id).toBe("s0-job-check");
    expect(suite.cases).toHaveLength(12);
    expect(new Set(suite.cases.map((c) => c.id)).size).toBe(12);
  });

  for (const testCase of suite.cases) {
    it(`${testCase.id}: jobs and required checks match frozen expected`, () => {
      const input: JobCheckInput = {
        workflow_triggered: testCase.workflow_triggered,
        trigger_reason: testCase.trigger_reason ?? null,
        scenario: testCase.scenario ?? {},
        jobs: testCase.jobs,
        required_checks: testCase.required_checks,
      };
      const jobs = evaluateJobs(input);
      const jobStatuses = Object.fromEntries(
        jobs.map((j) => [j.job_id, j.status]),
      );
      expect(jobStatuses).toEqual(testCase.expected.jobs);

      const checks = resolveRequiredChecks(input, jobs);
      const checkStatuses = Object.fromEntries(
        checks.map((c) => [c.context, c.status]),
      );
      expect(checkStatuses).toEqual(testCase.expected.required_checks);
    });
  }
});
