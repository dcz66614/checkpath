// T008 — Formal check-resolver unit tests.
//
// Direct tests of src/core/check-resolver.ts (formal): the six
// CheckStatus outcomes, the frozen precedence table, job-name
// priority over job_id, the (workflow, job_id) keyed API, and the
// boundary cases (empty manifest, duplicate manifest entries,
// missing/empty external source, duplicate-beats-invalid). Fixture
// driven coverage lives in checks-oracle-dump.test.ts; these tests
// pin the precedence branches that no single YAML fixture isolates
// (e.g. provider INVALID vs trigger INVALID in the same provider).

import { describe, expect, it } from "vitest";
import {
  evaluateJobs,
  jobKey,
  type JobCheckInput,
  type JobEvaluation,
  type KeyedJobEvaluation,
} from "../../../src/core/job-dag.js";
import {
  jobContext,
  resolveRequiredChecks,
  resolveRequiredChecksKeyed,
  resolveRequiredChecksKeyedForWorkflow,
  resolveRequiredChecksPerProvider,
  toBaseCheckResult,
  type JobWithTrigger,
  type KeyedJobWithTrigger,
} from "../../../src/core/check-resolver.js";

// ---------------------------------------------------------------------------
// Helpers: synthetic providers without YAML.
// ---------------------------------------------------------------------------

function job(
  jobId: string,
  status: JobEvaluation["status"],
  reason = "test",
  context?: string,
): JobEvaluation {
  return { job_id: jobId, context: context ?? jobId, status, reason };
}

function keyedJob(
  workflowPath: string,
  jobId: string,
  status: JobEvaluation["status"],
  reason = "test",
  context?: string,
): KeyedJobEvaluation {
  return {
    job_id: jobId,
    context: context ?? jobId,
    status,
    reason,
    workflow_path: workflowPath,
    key: jobKey({ workflow_path: workflowPath, job_id: jobId }),
  };
}

function pair(
  j: JobEvaluation,
  trigger: JobWithTrigger["trigger"] = "triggered",
): JobWithTrigger {
  return { job: j, trigger };
}

function keyedPair(
  j: KeyedJobEvaluation,
  trigger: KeyedJobWithTrigger["trigger"] = "triggered",
): KeyedJobWithTrigger {
  return { job: j, trigger };
}

const GH = "github-actions";

// ---------------------------------------------------------------------------
// Context derivation: name wins over job_id.
// ---------------------------------------------------------------------------

describe("job context: name priority, job_id fallback", () => {
  it("jobContext returns name when declared, else job_id", () => {
    expect(jobContext({ id: "build", name: "unit-tests" })).toBe("unit-tests");
    expect(jobContext({ id: "lint", name: null })).toBe("lint");
    expect(jobContext({ id: "lint" })).toBe("lint");
  });

  it("a required check naming the job_id of a named job has no provider", () => {
    const input: JobCheckInput = {
      workflow_triggered: true,
      jobs: [{ id: "build", name: "unit-tests" }],
      required_checks: [
        { context: "unit-tests" },
        { context: "build" },
      ],
    };
    const jobs = evaluateJobs(input);
    expect(jobs.map((j) => j.context)).toEqual(["unit-tests"]);
    const checks = resolveRequiredChecks(input, jobs);
    expect(checks[0].status).toBe("REPORTABLE_PENDING");
    expect(checks[0].provider_job_id).toBe("build");
    // The job_id is shadowed by the name: "build" matches nothing.
    expect(checks[1]).toEqual({
      context: "build",
      status: "PENDING_NOT_REPORTED",
      provider_job_id: null,
      provider_count: 0,
      reason: "no_provider",
    });
  });

  it("matching is exact and case-sensitive", () => {
    const providers = [pair(job("test", "ELIGIBLE", "eligible", "unit-tests"))];
    const checks = resolveRequiredChecksPerProvider(
      [
        { context: "unit-tests" },
        { context: "Unit-Tests" },
        { context: " unit-tests" },
        { context: "unit-tests " },
      ],
      providers,
    );
    expect(checks.map((c) => c.status)).toEqual([
      "REPORTABLE_PENDING",
      "PENDING_NOT_REPORTED",
      "PENDING_NOT_REPORTED",
      "PENDING_NOT_REPORTED",
    ]);
  });
});

// ---------------------------------------------------------------------------
// The six outcomes (positive cases).
// ---------------------------------------------------------------------------

describe("six CheckStatus outcomes", () => {
  it("REPORTABLE_PENDING: ELIGIBLE provider in a triggered workflow", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "unit-tests" }],
      [pair(job("test", "ELIGIBLE", "eligible", "unit-tests"))],
    );
    expect(r).toEqual({
      context: "unit-tests",
      status: "REPORTABLE_PENDING",
      provider_job_id: "test",
      provider_count: 1,
      reason: "provider_reportable",
    });
  });

  it("REPORTABLE_PENDING: CONDITIONAL_AFTER_NEEDS is reportable, not UNKNOWN", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "downstream" }],
      [pair(job("down", "CONDITIONAL_AFTER_NEEDS", "needs_pending", "downstream"))],
    );
    expect(r.status).toBe("REPORTABLE_PENDING");
    expect(r.reason).toBe("provider_reportable");
  });

  it("SKIPPED_SUCCESS: SKIPPED provider in a triggered workflow", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "unit-tests" }],
      [pair(job("test", "SKIPPED", "if_false", "unit-tests"))],
    );
    expect(r).toEqual({
      context: "unit-tests",
      status: "SKIPPED_SUCCESS",
      provider_job_id: "test",
      provider_count: 1,
      reason: "provider_skipped",
    });
  });

  it("PENDING_NOT_REPORTED: no provider at all", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "integration" }],
      [pair(job("test", "ELIGIBLE", "eligible", "unit-tests"))],
    );
    expect(r).toEqual({
      context: "integration",
      status: "PENDING_NOT_REPORTED",
      provider_job_id: null,
      provider_count: 0,
      reason: "no_provider",
    });
  });

  it("PENDING_NOT_REPORTED: workflow not triggered (workflow-level skip, not job skip)", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "unit-tests" }],
      [pair(job("test", "SKIPPED", "workflow_not_triggered", "unit-tests"), "not_triggered")],
    );
    expect(r.status).toBe("PENDING_NOT_REPORTED");
    expect(r.reason).toBe("workflow_not_triggered");
    expect(r.provider_job_id).toBe("test");
  });

  it("AMBIGUOUS: two providers share one context", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "tests" }],
      [
        pair(job("test-a", "ELIGIBLE", "eligible", "tests")),
        pair(job("test-b", "ELIGIBLE", "eligible", "tests")),
      ],
    );
    expect(r).toEqual({
      context: "tests",
      status: "AMBIGUOUS",
      provider_job_id: null,
      provider_count: 2,
      reason: "duplicate_context",
    });
  });

  it("UNKNOWN: provider UNKNOWN (unsupported if)", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "unit-tests" }],
      [pair(job("test", "UNKNOWN", "unsupported_if", "unit-tests"))],
    );
    expect(r).toEqual({
      context: "unit-tests",
      status: "UNKNOWN",
      provider_job_id: "test",
      provider_count: 1,
      reason: "provider_unknown",
    });
  });

  it("UNKNOWN: external source, even when a provider exists", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "unit-tests", source: "some-app" }],
      [pair(job("test", "ELIGIBLE", "eligible", "unit-tests"))],
    );
    expect(r).toEqual({
      context: "unit-tests",
      status: "UNKNOWN",
      provider_job_id: null,
      provider_count: 0,
      reason: "external_source",
    });
  });

  it("INVALID: provider INVALID (missing need)", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "deploy" }],
      [pair(job("deploy", "INVALID", "missing_need:ghost", "deploy"))],
    );
    expect(r).toEqual({
      context: "deploy",
      status: "INVALID",
      provider_job_id: "deploy",
      provider_count: 1,
      reason: "provider_invalid",
    });
  });
});

// ---------------------------------------------------------------------------
// Precedence: each pair isolates one adjacent rung of the table.
// ---------------------------------------------------------------------------

describe("precedence (frozen table, §4.5)", () => {
  it("external source beats duplicate providers and beats no provider", () => {
    const dup = resolveRequiredChecksPerProvider(
      [{ context: "tests", source: "other-app" }],
      [
        pair(job("a", "ELIGIBLE", "eligible", "tests")),
        pair(job("b", "ELIGIBLE", "eligible", "tests")),
      ],
    );
    expect(dup[0].status).toBe("UNKNOWN");
    expect(dup[0].reason).toBe("external_source");
    const none = resolveRequiredChecksPerProvider(
      [{ context: "ghost", source: "other-app" }],
      [],
    );
    expect(none[0].status).toBe("UNKNOWN");
    expect(none[0].reason).toBe("external_source");
  });

  it("duplicate beats provider INVALID", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "shared" }],
      [
        pair(job("a", "ELIGIBLE", "eligible", "shared")),
        pair(job("b", "INVALID", "missing_need:ghost", "shared")),
      ],
    );
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.provider_count).toBe(2);
  });

  it("provider INVALID beats trigger INVALID", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "deploy" }],
      [pair(job("deploy", "INVALID", "missing_need:ghost", "deploy"), "invalid")],
    );
    expect(r.status).toBe("INVALID");
    expect(r.reason).toBe("provider_invalid");
  });

  it("trigger INVALID beats provider SKIPPED and beats trigger UNKNOWN handling", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "unit-tests" }],
      [pair(job("test", "SKIPPED", "if_false", "unit-tests"), "invalid")],
    );
    expect(r.status).toBe("INVALID");
    expect(r.reason).toBe("trigger_invalid");
  });

  it("trigger UNKNOWN beats provider SKIPPED", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "unit-tests" }],
      [pair(job("test", "SKIPPED", "if_false", "unit-tests"), "unknown")],
    );
    expect(r.status).toBe("UNKNOWN");
    expect(r.reason).toBe("trigger_unknown");
  });

  it("workflow not triggered beats provider SKIPPED (job status alone does not decide)", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "unit-tests" }],
      [pair(job("test", "SKIPPED", "workflow_not_triggered", "unit-tests"), "not_triggered")],
    );
    expect(r.status).toBe("PENDING_NOT_REPORTED");
    expect(r.reason).toBe("workflow_not_triggered");
  });

  it("provider SKIPPED beats provider UNKNOWN only when the provider itself is SKIPPED; UNKNOWN provider stays UNKNOWN", () => {
    const [skipped, unknown] = resolveRequiredChecksPerProvider(
      [{ context: "a" }, { context: "b" }],
      [
        pair(job("a", "SKIPPED", "if_false", "a")),
        pair(job("b", "UNKNOWN", "unsupported_if", "b")),
      ],
    );
    expect(skipped.status).toBe("SKIPPED_SUCCESS");
    expect(unknown.status).toBe("UNKNOWN");
    expect(unknown.reason).toBe("provider_unknown");
  });

  it("three providers are AMBIGUOUS with provider_count 3", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "tests" }],
      [
        pair(job("a", "ELIGIBLE", "eligible", "tests")),
        pair(job("b", "SKIPPED", "if_false", "tests")),
        pair(job("c", "INVALID", "missing_need:ghost", "tests")),
      ],
    );
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.provider_count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Source boundary values.
// ---------------------------------------------------------------------------

describe("source boundary values", () => {
  it("missing, null and explicit github-actions sources all resolve normally", () => {
    const checks = resolveRequiredChecksPerProvider(
      [
        { context: "unit-tests" },
        { context: "unit-tests", source: null },
        { context: "unit-tests", source: GH },
      ],
      [pair(job("test", "ELIGIBLE", "eligible", "unit-tests"))],
    );
    expect(checks.map((c) => c.status)).toEqual([
      "REPORTABLE_PENDING",
      "REPORTABLE_PENDING",
      "REPORTABLE_PENDING",
    ]);
  });

  it("empty-string source is external (not github-actions)", () => {
    const [r] = resolveRequiredChecksPerProvider(
      [{ context: "unit-tests", source: "" }],
      [pair(job("test", "ELIGIBLE", "eligible", "unit-tests"))],
    );
    expect(r.status).toBe("UNKNOWN");
    expect(r.reason).toBe("external_source");
  });
});

// ---------------------------------------------------------------------------
// Manifest boundaries.
// ---------------------------------------------------------------------------

describe("manifest boundaries", () => {
  it("empty required-checks list resolves to an empty list", () => {
    expect(resolveRequiredChecksPerProvider([], [pair(job("t", "ELIGIBLE"))])).toEqual([]);
    expect(resolveRequiredChecksKeyed([], [keyedPair(keyedJob("w.yml", "t", "ELIGIBLE"))])).toEqual([]);
  });

  it("empty provider list with a non-empty manifest is PENDING_NOT_REPORTED per entry", () => {
    const checks = resolveRequiredChecksPerProvider(
      [{ context: "a" }, { context: "b" }],
      [],
    );
    expect(checks.map((c) => c.status)).toEqual([
      "PENDING_NOT_REPORTED",
      "PENDING_NOT_REPORTED",
    ]);
  });

  it("duplicate manifest entries resolve independently (one row per entry)", () => {
    const checks = resolveRequiredChecksPerProvider(
      [{ context: "unit-tests" }, { context: "unit-tests" }],
      [pair(job("test", "ELIGIBLE", "eligible", "unit-tests"))],
    );
    expect(checks).toHaveLength(2);
    expect(checks[0]).toEqual(checks[1]);
    expect(checks[0].status).toBe("REPORTABLE_PENDING");
  });

  it("result order follows the manifest order, not provider order", () => {
    const checks = resolveRequiredChecksPerProvider(
      [{ context: "b" }, { context: "a" }],
      [
        pair(job("a", "ELIGIBLE", "eligible", "a")),
        pair(job("b", "ELIGIBLE", "eligible", "b")),
      ],
    );
    expect(checks.map((c) => c.context)).toEqual(["b", "a"]);
  });
});

// ---------------------------------------------------------------------------
// Keyed API: (workflow, job_id) identity — S0 legacy item ②, resolver side.
// ---------------------------------------------------------------------------

describe("keyed resolution: (workflow, job_id) identity", () => {
  it("single provider carries its workflow path and canonical key", () => {
    const [r] = resolveRequiredChecksKeyed(
      [{ context: "alpha" }],
      [keyedPair(keyedJob("workflow-a.yml", "test", "ELIGIBLE", "eligible", "alpha"))],
    );
    expect(r.provider_workflow_path).toBe("workflow-a.yml");
    expect(r.provider_key).toBe(JSON.stringify(["workflow-a.yml", "test"]));
    expect(r.provider_keys).toEqual([JSON.stringify(["workflow-a.yml", "test"])]);
    expect(r.provider_job_id).toBe("test");
    expect(r.status).toBe("REPORTABLE_PENDING");
  });

  it("same job_id in two workflows with distinct contexts resolves to distinct keys (T7-09 class)", () => {
    const checks = resolveRequiredChecksKeyed(
      [{ context: "alpha" }, { context: "beta" }],
      [
        keyedPair(keyedJob("workflow-a.yml", "test", "ELIGIBLE", "eligible", "alpha"), "triggered"),
        keyedPair(keyedJob("workflow-b.yml", "test", "SKIPPED", "workflow_not_triggered", "beta"), "not_triggered"),
      ],
    );
    expect(checks[0].status).toBe("REPORTABLE_PENDING");
    expect(checks[0].provider_key).toBe(JSON.stringify(["workflow-a.yml", "test"]));
    expect(checks[1].status).toBe("PENDING_NOT_REPORTED");
    expect(checks[1].provider_key).toBe(JSON.stringify(["workflow-b.yml", "test"]));
    expect(checks[0].provider_key).not.toBe(checks[1].provider_key);
  });

  it("same job_id + same context across workflows is AMBIGUOUS and lists both keys in input order", () => {
    const [r] = resolveRequiredChecksKeyed(
      [{ context: "tests" }],
      [
        keyedPair(keyedJob("workflow-a.yml", "test", "ELIGIBLE", "eligible", "tests"), "triggered"),
        keyedPair(keyedJob("workflow-b.yml", "test", "SKIPPED", "workflow_not_triggered", "tests"), "not_triggered"),
      ],
    );
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.provider_count).toBe(2);
    expect(r.provider_job_id).toBeNull();
    expect(r.provider_workflow_path).toBeNull();
    expect(r.provider_key).toBeNull();
    expect(r.provider_keys).toEqual([
      JSON.stringify(["workflow-a.yml", "test"]),
      JSON.stringify(["workflow-b.yml", "test"]),
    ]);
  });

  it("no-provider and external-source keyed rows carry no keys", () => {
    const checks = resolveRequiredChecksKeyed(
      [{ context: "ghost" }, { context: "unit-tests", source: "other-app" }],
      [keyedPair(keyedJob("w.yml", "test", "ELIGIBLE", "eligible", "unit-tests"))],
    );
    for (const r of checks) {
      expect(r.provider_workflow_path).toBeNull();
      expect(r.provider_key).toBeNull();
      expect(r.provider_keys).toEqual([]);
    }
  });

  it("toBaseCheckResult strips exactly the three key fields", () => {
    const [keyed] = resolveRequiredChecksKeyed(
      [{ context: "alpha" }],
      [keyedPair(keyedJob("workflow-a.yml", "test", "ELIGIBLE", "eligible", "alpha"))],
    );
    expect(toBaseCheckResult(keyed)).toEqual({
      context: "alpha",
      status: "REPORTABLE_PENDING",
      provider_job_id: "test",
      provider_count: 1,
      reason: "provider_reportable",
    });
    // And the base API agrees with the projected keyed API on the same inputs.
    const [base] = resolveRequiredChecksPerProvider(
      [{ context: "alpha" }],
      [pair(job("test", "ELIGIBLE", "eligible", "alpha"))],
    );
    expect(toBaseCheckResult(keyed)).toEqual(base);
  });

  it("jobKey never collides across workflow/job_id splits", () => {
    const checks = resolveRequiredChecksKeyed(
      [{ context: "x" }, { context: "y" }],
      [
        keyedPair(keyedJob("a/b", "c", "ELIGIBLE", "eligible", "x")),
        keyedPair(keyedJob("a", "b/c", "ELIGIBLE", "eligible", "y")),
      ],
    );
    expect(checks[0].provider_key).not.toBe(checks[1].provider_key);
    expect(checks[0].provider_key).toBe(JSON.stringify(["a/b", "c"]));
    expect(checks[1].provider_key).toBe(JSON.stringify(["a", "b/c"]));
  });

  it("resolveRequiredChecksKeyedForWorkflow keys unkeyed jobs under one workflow", () => {
    const [r] = resolveRequiredChecksKeyedForWorkflow(
      [{ context: "unit-tests" }],
      "ci.yml",
      [pair(job("test", "ELIGIBLE", "eligible", "unit-tests"))],
    );
    expect(r.provider_workflow_path).toBe("ci.yml");
    expect(r.provider_key).toBe(JSON.stringify(["ci.yml", "test"]));
    expect(r.status).toBe("REPORTABLE_PENDING");
  });

  it("keyed precedence matches the base API on every branch", () => {
    const providers: KeyedJobWithTrigger[] = [
      keyedPair(keyedJob("w.yml", "bad", "INVALID", "missing_need:ghost", "bad"), "invalid"),
      keyedPair(keyedJob("w.yml", "unk", "UNKNOWN", "unsupported_if", "unk"), "unknown"),
      keyedPair(keyedJob("w.yml", "skip", "SKIPPED", "if_false", "skip"), "triggered"),
      keyedPair(keyedJob("w.yml", "pend", "SKIPPED", "workflow_not_triggered", "pend"), "not_triggered"),
    ];
    const baseProviders: JobWithTrigger[] = providers.map(({ job, trigger }) => ({
      job: { job_id: job.job_id, context: job.context, status: job.status, reason: job.reason },
      trigger,
    }));
    const manifest = [
      { context: "bad" },
      { context: "unk" },
      { context: "skip" },
      { context: "pend" },
    ];
    const keyed = resolveRequiredChecksKeyed(manifest, providers).map(toBaseCheckResult);
    const base = resolveRequiredChecksPerProvider(manifest, baseProviders);
    expect(keyed).toEqual(base);
    expect(keyed.map((c) => c.status)).toEqual([
      "INVALID",
      "UNKNOWN",
      "SKIPPED_SUCCESS",
      "PENDING_NOT_REPORTED",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Single-boolean entry point (T003 compatibility): one shared trigger.
// ---------------------------------------------------------------------------

describe("resolveRequiredChecks (single-workflow entry point)", () => {
  it("workflow_triggered=false maps every provider to not_triggered", () => {
    const input: JobCheckInput = {
      workflow_triggered: false,
      jobs: [{ id: "test", name: "unit-tests" }],
      required_checks: [{ context: "unit-tests" }],
    };
    const jobs = evaluateJobs(input);
    const [r] = resolveRequiredChecks(input, jobs);
    expect(r.status).toBe("PENDING_NOT_REPORTED");
    expect(r.reason).toBe("workflow_not_triggered");
  });

  it("never predicts real success or failure: ELIGIBLE is only REPORTABLE_PENDING", () => {
    const input: JobCheckInput = {
      workflow_triggered: true,
      jobs: [{ id: "test", name: "unit-tests" }],
      required_checks: [{ context: "unit-tests" }],
    };
    const jobs = evaluateJobs(input);
    const [r] = resolveRequiredChecks(input, jobs);
    expect(r.status).toBe("REPORTABLE_PENDING");
    expect(r.status).not.toBe("SKIPPED_SUCCESS");
  });
});
