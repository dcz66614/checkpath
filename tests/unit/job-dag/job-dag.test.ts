// T007 — Job DAG unit tests.
//
// Covers PROJECT_BOOK §4.4 directly against the formal module
// (evaluateJobs / topologicalJobOrder / the (workflow, job_id) keyed
// entry points), plus the S0 job-check suite as a regression lock.
// The Python Reference Oracle cross-check lives in
// `npm run oracle:diff:jobs` (tests/fixtures/jobs/suite.json).

import { describe, expect, it } from "vitest";
import {
  evaluateJobs,
  evaluateJobsForTrigger,
  evaluateJobsKeyed,
  jobContext,
  jobKey,
  parseJobKey,
  topologicalJobOrder,
  type JobCheckInput,
  type JobInput,
} from "../../../src/core/job-dag.js";
import type { ScenarioV1, WorkflowIRJob } from "../../../src/core/types.js";

const PR_SCENARIO: ScenarioV1 = {
  schema: "checkpath.scenario/v1",
  scenario_id: "T7-unit",
  event: {
    name: "pull_request",
    action: "synchronize",
    branch: null,
    base_branch: "main",
    head_branch: "feature/x",
    target_branch: null,
    ref: "refs/pull/42/merge",
    commit_message: "feat: change",
  },
  diff: {
    algorithm: "three-dot",
    changed_files: ["src/app.ts"],
    changed_files_total: 1,
    returned_files: 1,
    complete: true,
    first_3000_confirmed: true,
    diff_timed_out: false,
    push_commit_count: null,
  },
};

const CTX = {
  event_name: "pull_request",
  action: "synchronize",
  ref: "refs/pull/42/merge",
  base_ref: "main",
  head_ref: "feature/x",
} as const;

function run(
  jobs: JobInput[],
  triggered = true,
  scenario: JobCheckInput["scenario"] = { ...CTX },
): Record<string, string> {
  const input: JobCheckInput = {
    workflow_triggered: triggered,
    scenario,
    jobs,
    required_checks: [],
  };
  return Object.fromEntries(
    evaluateJobs(input).map((j) => [j.job_id, j.status]),
  );
}

function reasons(
  jobs: JobInput[],
  triggered = true,
  scenario: JobCheckInput["scenario"] = { ...CTX },
): Record<string, string> {
  const input: JobCheckInput = {
    workflow_triggered: triggered,
    scenario,
    jobs,
    required_checks: [],
  };
  return Object.fromEntries(
    evaluateJobs(input).map((j) => [j.job_id, j.reason]),
  );
}

function irJob(
  id: string,
  extra: Partial<WorkflowIRJob> = {},
): WorkflowIRJob {
  return {
    id,
    name: null,
    needs: [],
    if: null,
    context: extra.name ?? id,
    ...extra,
  };
}

describe("job-dag: jobContext", () => {
  it("prefers name, falls back to job_id", () => {
    expect(jobContext({ id: "test", name: "unit-tests" })).toBe("unit-tests");
    expect(jobContext({ id: "test" })).toBe("test");
    expect(jobContext({ id: "test", name: null })).toBe("test");
  });
});

describe("job-dag: topological order is stable and deterministic", () => {
  it("a chain orders upstream first", () => {
    expect(topologicalJobOrder([
      { id: "d", needs: ["c"] },
      { id: "c", needs: ["b"] },
      { id: "b", needs: ["a"] },
      { id: "a" },
    ]).order).toEqual(["a", "b", "c", "d"]);
  });

  it("a diamond orders by input order at each level", () => {
    expect(topologicalJobOrder([
      { id: "d", needs: ["b", "c"] },
      { id: "b", needs: ["a"] },
      { id: "c", needs: ["a"] },
      { id: "a" },
    ]).order).toEqual(["a", "b", "c", "d"]);
    // The same diamond listed in the opposite sibling order keeps
    // that order: the tie-break is the input order, not the name.
    expect(topologicalJobOrder([
      { id: "d", needs: ["b", "c"] },
      { id: "c", needs: ["a"] },
      { id: "b", needs: ["a"] },
      { id: "a" },
    ]).order).toEqual(["a", "c", "b", "d"]);
  });

  it("independent jobs keep input order", () => {
    expect(topologicalJobOrder([
      { id: "z" },
      { id: "a" },
      { id: "m" },
    ]).order).toEqual(["z", "a", "m"]);
  });

  it("the same input always yields the same order", () => {
    const jobs: JobInput[] = [
      { id: "deploy", needs: ["test", "lint"] },
      { id: "test", needs: ["build"] },
      { id: "lint", needs: ["build"] },
      { id: "build" },
    ];
    const first = topologicalJobOrder(jobs);
    for (let i = 0; i < 10; i++) {
      expect(topologicalJobOrder(jobs).order).toEqual(first.order);
      expect([...topologicalJobOrder(jobs).invalid.entries()]).toEqual([
        ...first.invalid.entries(),
      ]);
    }
    expect(first.order).toEqual(["build", "test", "lint", "deploy"]);
  });

  it("results are emitted in input order, not topological order", () => {
    const jobs = evaluateJobs({
      workflow_triggered: true,
      scenario: { ...CTX },
      jobs: [
        { id: "deploy", needs: ["test"] },
        { id: "test" },
      ],
      required_checks: [],
    });
    expect(jobs.map((j) => j.job_id)).toEqual(["deploy", "test"]);
    expect(jobs.map((j) => j.status)).toEqual([
      "CONDITIONAL_AFTER_NEEDS",
      "ELIGIBLE",
    ]);
  });
});

describe("job-dag: structural INVALID", () => {
  it("a missing need is INVALID with the missing id in the reason", () => {
    expect(run([{ id: "deploy", needs: ["ghost"] }])).toEqual({
      deploy: "INVALID",
    });
    expect(reasons([{ id: "deploy", needs: ["ghost"] }])).toEqual({
      deploy: "missing_need:ghost",
    });
  });

  it("INVALID propagates to transitive dependents but not to independent jobs", () => {
    expect(
      run([
        { id: "a", needs: ["ghost"] },
        { id: "b", needs: ["a"] },
        { id: "c", needs: ["b"] },
        { id: "d" },
      ]),
    ).toEqual({ a: "INVALID", b: "INVALID", c: "INVALID", d: "ELIGIBLE" });
    expect(
      reasons([
        { id: "a", needs: ["ghost"] },
        { id: "b", needs: ["a"] },
        { id: "c", needs: ["b"] },
      ]),
    ).toEqual({
      a: "missing_need:ghost",
      b: "invalid_need:a",
      c: "invalid_need:b",
    });
  });

  it("a two-job cycle is INVALID for both members", () => {
    expect(
      run([
        { id: "a", needs: ["b"] },
        { id: "b", needs: ["a"] },
      ]),
    ).toEqual({ a: "INVALID", b: "INVALID" });
    expect(
      reasons([
        { id: "a", needs: ["b"] },
        { id: "b", needs: ["a"] },
      ]),
    ).toEqual({ a: "needs_cycle", b: "needs_cycle" });
  });

  it("a self-need is a cycle", () => {
    expect(run([{ id: "a", needs: ["a"] }])).toEqual({ a: "INVALID" });
    expect(reasons([{ id: "a", needs: ["a"] }])).toEqual({
      a: "needs_cycle",
    });
  });

  it("a three-job cycle is INVALID and does not poison an independent job", () => {
    expect(
      run([
        { id: "a", needs: ["c"] },
        { id: "b", needs: ["a"] },
        { id: "c", needs: ["b"] },
        { id: "ok" },
      ]),
    ).toEqual({ a: "INVALID", b: "INVALID", c: "INVALID", ok: "ELIGIBLE" });
  });

  it("a duplicate job id is INVALID", () => {
    const jobs = evaluateJobs({
      workflow_triggered: true,
      scenario: { ...CTX },
      jobs: [{ id: "test" }, { id: "test" }],
      required_checks: [],
    });
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.status)).toEqual(["INVALID", "INVALID"]);
    expect(jobs.map((j) => j.reason)).toEqual([
      "duplicate_job_id",
      "duplicate_job_id",
    ]);
  });

  it("a job depending on a duplicate id is INVALID via invalid_need", () => {
    expect(
      run([
        { id: "test" },
        { id: "test" },
        { id: "down", needs: ["test"] },
      ]),
    ).toEqual({ test: "INVALID", down: "INVALID" });
  });
});

describe("job-dag: workflow not triggered", () => {
  it("every job is SKIPPED with reason workflow_not_triggered", () => {
    const jobs = evaluateJobs({
      workflow_triggered: false,
      trigger_reason: "path_mismatch",
      scenario: { ...CTX },
      jobs: [
        { id: "build" },
        { id: "test", needs: ["build"] },
        { id: "bad", needs: ["ghost"] },
      ],
      required_checks: [],
    });
    expect(jobs.map((j) => [j.job_id, j.status, j.reason])).toEqual([
      ["build", "SKIPPED", "workflow_not_triggered"],
      ["test", "SKIPPED", "workflow_not_triggered"],
      // Structural INVALID still wins over the trigger outcome.
      ["bad", "INVALID", "missing_need:ghost"],
    ]);
  });
});

describe("job-dag: if / needs precedence", () => {
  it("if: false skips even with no needs", () => {
    expect(run([{ id: "test", if: "false" }])).toEqual({ test: "SKIPPED" });
    expect(reasons([{ id: "test", if: "false" }])).toEqual({
      test: "if_false",
    });
  });

  it("if: false beats a skipped need (reason is if_false, not needs_skipped)", () => {
    expect(
      run([
        { id: "a", if: "false" },
        { id: "b", needs: ["a"], if: "false" },
      ]),
    ).toEqual({ a: "SKIPPED", b: "SKIPPED" });
    expect(
      reasons([
        { id: "a", if: "false" },
        { id: "b", needs: ["a"], if: "false" },
      ]),
    ).toEqual({ a: "if_false", b: "if_false" });
  });

  it("an unsupported if beats a skipped need (UNKNOWN, not SKIPPED)", () => {
    expect(
      run([
        { id: "a", if: "false" },
        { id: "b", needs: ["a"], if: "success()" },
      ]),
    ).toEqual({ a: "SKIPPED", b: "UNKNOWN" });
    expect(
      reasons([
        { id: "a", if: "false" },
        { id: "b", needs: ["a"], if: "success()" },
      ]),
    ).toEqual({ a: "if_false", b: "unsupported_if" });
  });

  it("a skipped need skips the whole downstream chain", () => {
    expect(
      run([
        { id: "a", if: "false" },
        { id: "b", needs: ["a"] },
        { id: "c", needs: ["b"] },
        { id: "d", needs: ["c"] },
      ]),
    ).toEqual({ a: "SKIPPED", b: "SKIPPED", c: "SKIPPED", d: "SKIPPED" });
    expect(
      reasons([
        { id: "a", if: "false" },
        { id: "b", needs: ["a"] },
        { id: "c", needs: ["b"] },
      ]),
    ).toEqual({ a: "if_false", b: "needs_skipped", c: "needs_skipped" });
  });

  it("if: always() rescues a job whose needs were all skipped", () => {
    expect(
      run([
        { id: "a", if: "false" },
        { id: "agg", needs: ["a"], if: "always()" },
      ]),
    ).toEqual({ a: "SKIPPED", agg: "ELIGIBLE" });
    expect(
      reasons([
        { id: "a", if: "false" },
        { id: "agg", needs: ["a"], if: "always()" },
      ]),
    ).toEqual({ a: "if_false", agg: "always_overrides_skipped_needs" });
  });

  it("always() inside a compound expression still rescues the job", () => {
    expect(
      run([
        { id: "a", if: "false" },
        {
          id: "agg",
          needs: ["a"],
          if: "always() && github.event_name == 'pull_request'",
        },
      ]),
    ).toEqual({ a: "SKIPPED", agg: "ELIGIBLE" });
  });

  it("always() does not rescue a job whose own if is false", () => {
    expect(
      run([
        { id: "a", if: "false" },
        { id: "b", needs: ["a"], if: "always() && false" },
      ]),
    ).toEqual({ a: "SKIPPED", b: "SKIPPED" });
  });

  it("a job with running needs is CONDITIONAL_AFTER_NEEDS", () => {
    expect(
      run([
        { id: "build" },
        { id: "test", needs: ["build"] },
      ]),
    ).toEqual({ build: "ELIGIBLE", test: "CONDITIONAL_AFTER_NEEDS" });
    expect(
      reasons([
        { id: "build" },
        { id: "test", needs: ["build"] },
      ]),
    ).toEqual({ build: "eligible", test: "needs_pending" });
  });

  it("always() with running needs is ELIGIBLE, not conditional", () => {
    expect(
      run([
        { id: "build" },
        { id: "test", needs: ["build"], if: "always()" },
      ]),
    ).toEqual({ build: "ELIGIBLE", test: "ELIGIBLE" });
    expect(
      reasons([
        { id: "build" },
        { id: "test", needs: ["build"], if: "always()" },
      ]),
    ).toEqual({ build: "eligible", test: "always_eligible" });
  });

  it("an UNKNOWN need makes the downstream job UNKNOWN", () => {
    expect(
      run([
        { id: "a", if: "success()" },
        { id: "b", needs: ["a"] },
        { id: "c", needs: ["b"] },
      ]),
    ).toEqual({ a: "UNKNOWN", b: "UNKNOWN", c: "UNKNOWN" });
    expect(
      reasons([
        { id: "a", if: "success()" },
        { id: "b", needs: ["a"] },
        { id: "c", needs: ["b"] },
      ]),
    ).toEqual({ a: "unsupported_if", b: "needs_unknown", c: "needs_unknown" });
  });

  it("a context comparison that cannot be decided is UNKNOWN", () => {
    expect(
      run(
        [{ id: "test", if: "github.base_ref == 'main'" }],
        true,
        { ...CTX, base_ref: null },
      ),
    ).toEqual({ test: "UNKNOWN" });
  });

  it("an if that decides against the scenario skips the job", () => {
    expect(
      run([{ id: "test", if: "github.event_name == 'push'" }]),
    ).toEqual({ test: "SKIPPED" });
  });
});

describe("job-dag: (workflow, job_id) key", () => {
  it("jobKey is a JSON pair and round-trips through parseJobKey", () => {
    const key = jobKey({ workflow_path: ".github/workflows/ci.yml", job_id: "test" });
    expect(key).toBe(JSON.stringify([".github/workflows/ci.yml", "test"]));
    expect(parseJobKey(key)).toEqual({
      workflow_path: ".github/workflows/ci.yml",
      job_id: "test",
    });
  });

  it("paths containing separators cannot collide with different pairs", () => {
    const a = jobKey({ workflow_path: "a/b", job_id: "c" });
    const b = jobKey({ workflow_path: "a", job_id: "b/c" });
    expect(a).not.toBe(b);
    expect(parseJobKey(a)).toEqual({ workflow_path: "a/b", job_id: "c" });
    expect(parseJobKey(b)).toEqual({ workflow_path: "a", job_id: "b/c" });
  });

  it("parseJobKey throws on malformed keys", () => {
    expect(() => parseJobKey("not-json")).toThrow("invalid job key");
    expect(() => parseJobKey(JSON.stringify(["only-one"]))).toThrow("invalid job key");
    expect(() => parseJobKey(JSON.stringify(["a", 1]))).toThrow("invalid job key");
  });

  it("evaluateJobsKeyed tags every result with its workflow and key", () => {
    const results = evaluateJobsKeyed({
      workflow_path: "workflow-a.yml",
      workflow_triggered: true,
      scenario: PR_SCENARIO,
      jobs: [irJob("build"), irJob("test", { needs: ["build"] })],
    });
    expect(results).toEqual([
      {
        job_id: "build",
        context: "build",
        status: "ELIGIBLE",
        reason: "eligible",
        workflow_path: "workflow-a.yml",
        key: jobKey({ workflow_path: "workflow-a.yml", job_id: "build" }),
      },
      {
        job_id: "test",
        context: "test",
        status: "CONDITIONAL_AFTER_NEEDS",
        reason: "needs_pending",
        workflow_path: "workflow-a.yml",
        key: jobKey({ workflow_path: "workflow-a.yml", job_id: "test" }),
      },
    ]);
  });

  it("the same job_id in two workflows yields distinct keys and independent statuses", () => {
    const triggered = evaluateJobsKeyed({
      workflow_path: "workflow-a.yml",
      workflow_triggered: true,
      scenario: PR_SCENARIO,
      jobs: [irJob("test", { name: "tests" })],
    });
    const notTriggered = evaluateJobsKeyed({
      workflow_path: "workflow-b.yml",
      workflow_triggered: false,
      scenario: PR_SCENARIO,
      jobs: [irJob("test", { name: "tests" })],
    });
    expect(triggered[0]?.status).toBe("ELIGIBLE");
    expect(notTriggered[0]?.status).toBe("SKIPPED");
    expect(triggered[0]?.key).not.toBe(notTriggered[0]?.key);
    const byKey = new Map(
      [...triggered, ...notTriggered].map((j) => [j.key, j.status]),
    );
    expect(byKey.size).toBe(2);
    expect(byKey.get(jobKey({ workflow_path: "workflow-a.yml", job_id: "test" }))).toBe("ELIGIBLE");
    expect(byKey.get(jobKey({ workflow_path: "workflow-b.yml", job_id: "test" }))).toBe("SKIPPED");
  });

  it("evaluateJobsForTrigger maps trigger states to per-job outcomes", () => {
    const jobs = [irJob("test"), irJob("build")];
    const invalid = evaluateJobsForTrigger({
      workflow_path: "ci.yml",
      trigger: "invalid",
      scenario: PR_SCENARIO,
      jobs,
    });
    expect(invalid.map((j) => [j.status, j.reason])).toEqual([
      ["INVALID", "trigger_invalid"],
      ["INVALID", "trigger_invalid"],
    ]);
    const unknown = evaluateJobsForTrigger({
      workflow_path: "ci.yml",
      trigger: "unknown",
      scenario: PR_SCENARIO,
      jobs,
    });
    expect(unknown.map((j) => [j.status, j.reason])).toEqual([
      ["UNKNOWN", "trigger_unknown"],
      ["UNKNOWN", "trigger_unknown"],
    ]);
    const notTriggered = evaluateJobsForTrigger({
      workflow_path: "ci.yml",
      trigger: "not_triggered",
      scenario: PR_SCENARIO,
      jobs,
    });
    expect(notTriggered.map((j) => [j.status, j.reason])).toEqual([
      ["SKIPPED", "workflow_not_triggered"],
      ["SKIPPED", "workflow_not_triggered"],
    ]);
    const triggered = evaluateJobsForTrigger({
      workflow_path: "ci.yml",
      trigger: "triggered",
      scenario: PR_SCENARIO,
      jobs,
    });
    expect(triggered.map((j) => j.status)).toEqual(["ELIGIBLE", "ELIGIBLE"]);
  });

  it("evaluateJobsKeyed evaluates if against the ScenarioV1 event", () => {
    const results = evaluateJobsKeyed({
      workflow_path: "ci.yml",
      workflow_triggered: true,
      scenario: PR_SCENARIO,
      jobs: [
        irJob("a", { if: "github.event_name == 'pull_request'" }),
        irJob("b", { if: "github.event_name == 'push'" }),
        irJob("c", { if: "github.base_ref == 'main'" }),
      ],
    });
    expect(results.map((j) => [j.job_id, j.status])).toEqual([
      ["a", "ELIGIBLE"],
      ["b", "SKIPPED"],
      ["c", "ELIGIBLE"],
    ]);
  });
});
