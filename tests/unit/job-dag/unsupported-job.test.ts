// T011 / ADR-04 — matrix and reusable-workflow jobs have no single
// reportable check context (PROJECT_BOOK §3.4), so they evaluate to
// UNKNOWN whenever they would otherwise run. A decidable skip still
// wins (if: false, a skipped need without always()), and a strategy
// without matrix (e.g. only fail-fast) stays an ordinary job.
// The Python Reference Oracle mirrors every case here
// (oracle/checkpath_oracle/evaluator.py); the cross-implementation
// lock is the golden suite (G-79/G-80) plus `npm run test:oracle`.

import { describe, expect, it } from "vitest";
import {
  evaluateJobs,
  type JobCheckInput,
  type JobInput,
} from "../../../src/core/job-dag.js";

const CTX = {
  event_name: "pull_request",
  action: "synchronize",
  ref: "refs/pull/42/merge",
  base_ref: "main",
  head_ref: "feature/x",
} as const;

function evaluate(jobs: JobInput[]) {
  const input: JobCheckInput = {
    workflow_triggered: true,
    scenario: { ...CTX },
    jobs,
    required_checks: [],
  };
  return evaluateJobs(input);
}

describe("ADR-04: unsupported_job", () => {
  it("a matrix job is UNKNOWN / unsupported_matrix", () => {
    const [job] = evaluate([
      { id: "test", name: "unit-tests", unsupported_job: "matrix" },
    ]);
    expect(job.status).toBe("UNKNOWN");
    expect(job.reason).toBe("unsupported_matrix");
  });

  it("a reusable-workflow call job is UNKNOWN / unsupported_reusable_workflow", () => {
    const [job] = evaluate([
      { id: "call", name: "unit-tests", unsupported_job: "reusable_workflow" },
    ]);
    expect(job.status).toBe("UNKNOWN");
    expect(job.reason).toBe("unsupported_reusable_workflow");
  });

  it("a matrix job with if: false is still SKIPPED (decidable skip wins)", () => {
    const [job] = evaluate([
      { id: "test", if: "false", unsupported_job: "matrix" },
    ]);
    expect(job.status).toBe("SKIPPED");
    expect(job.reason).toBe("if_false");
  });

  it("a matrix job downstream of a skipped need without always() is SKIPPED", () => {
    const [upstream, downstream] = evaluate([
      { id: "up", if: "false" },
      { id: "down", needs: ["up"], unsupported_job: "matrix" },
    ]);
    expect(upstream.status).toBe("SKIPPED");
    expect(downstream.status).toBe("SKIPPED");
    expect(downstream.reason).toBe("needs_skipped");
  });

  it("a matrix job downstream of a skipped need with always() is UNKNOWN (it would run)", () => {
    const [, downstream] = evaluate([
      { id: "up", if: "false" },
      { id: "down", needs: ["up"], if: "always()", unsupported_job: "matrix" },
    ]);
    expect(downstream.status).toBe("UNKNOWN");
    expect(downstream.reason).toBe("unsupported_matrix");
  });

  it("a matrix job that only waits on a pending need is UNKNOWN, not CONDITIONAL_AFTER_NEEDS", () => {
    const [, downstream] = evaluate([
      { id: "up" },
      { id: "down", needs: ["up"], unsupported_job: "reusable_workflow" },
    ]);
    expect(downstream.status).toBe("UNKNOWN");
    expect(downstream.reason).toBe("unsupported_reusable_workflow");
  });

  it("an ordinary job (unsupported_job null) is unaffected", () => {
    const [job] = evaluate([
      { id: "test", name: "unit-tests", unsupported_job: null },
    ]);
    expect(job.status).toBe("ELIGIBLE");
    expect(job.reason).toBe("eligible");
  });
});
