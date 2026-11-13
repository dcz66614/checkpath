// FIX-P0-01 — Formal-pipeline differential test (T013 P0-1 regression lock).
//
// The golden suite (tests/unit/golden/golden.test.ts) only exercises
// evaluateE2E() (src/core/e2e.ts), whose extractJobs() keeps
// `unsupported_job`. The shipped product path — buildReport() ->
// runFormalPipeline() -> evaluateJobsForTrigger() ->
// evaluateJobsKeyed() — dropped that field (job-dag.ts), so a matrix
// or reusable-workflow job was reported ELIGIBLE / REPORTABLE_PENDING
// (exit 0) while the Oracle expected UNKNOWN. Every acceptance command
// stayed green. This test closes that hole: for every fixture in the
// suite (default: the frozen golden 155, incl. G-79/U-07 matrix and
// G-80/U-08 reusable workflow) it runs the FORMAL pipeline
// (buildReport, the same entry point the CLI and the UI worker use)
// and compares its job evaluations and required-check results
// field-by-field with the frozen Oracle expected.json, and with the
// evaluateE2E() result for the same fixture (two-path consistency
// lock for P2-2 — see the e2e.ts header for the division of labour).
//
// The scenario goes through validateScenario(), exactly as the
// shipped CLI does (it normalizes absent optional fields to null).
// Required-check entries likewise go through
// validateRequiredChecks(), exactly as the shipped CLI's
// loadRequiredChecks() does (it defaults a missing `source` to
// "github-actions"). ADR FIX-P1-01/02: this REMOVES the
// FIX-P0-01/04 bypass, under which the test passed entries raw
// because the CLI validator then rejected duplicate contexts
// (T013 P1-1). The validator now admits duplicate contexts per
// ADR FIX-P1-01/01, so there is no longer any defect to route
// around — this test goes through the full CLI validation path
// and G-57 (duplicate context) passes through it.
//
// When CHECKPATH_FORMAL_DUMP_DIR is set, the formal job/check rows
// for every fixture are also written there as <id>.json so
// scripts/oracle-diff.mjs can compute the TS-side (formal-pipeline)
// false-pass count for the golden gate (T013 P2-10).
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport, exitCodeForReport } from "../../../src/report/build.js";
import { evaluateE2E } from "../../../src/core/e2e.js";
import { validateScenario, validateRequiredChecks } from "../../../src/core/validate.js";

const here = dirname(fileURLToPath(import.meta.url));
const defaultSuite = join(here, "../../fixtures/golden/suite.json");
const suitePath = process.env["CHECKPATH_E2E_SUITE"]
  ? resolve(process.env["CHECKPATH_E2E_SUITE"])
  : defaultSuite;
const suiteDir = dirname(suitePath);

interface SuiteEntry {
  id: string;
  dir: string;
  description: string;
  cp: string | null;
  group: string;
  adversarial: boolean;
  workflows: string[];
  scenario: string;
  required_checks: string;
  expected: string;
}

const suite = JSON.parse(
  readFileSync(suitePath, "utf-8"),
) as { schema: string; suite_id: string; seed: number; fixtures: SuiteEntry[] };

function loadFixture(entry: SuiteEntry) {
  const fixtureDir = join(suiteDir, entry.dir);
  const workflows = entry.workflows.map((path) => ({
    path,
    yamlText: readFileSync(join(fixtureDir, path), "utf-8"),
  }));
  const scenarioRaw = JSON.parse(
    readFileSync(join(fixtureDir, entry.scenario), "utf-8"),
  );
  // The scenario goes through the CLI's validator, exactly as the
  // shipped path does: it normalizes absent optional fields to null
  // (push scenarios omit action / base_branch / ...), without which
  // buildReport's canonical-JSON hashing throws on `undefined`.
  const validated = validateScenario(scenarioRaw);
  if (!validated.ok || validated.value === null) {
    throw new Error(
      `fixture ${entry.id} scenario failed validateScenario: ${JSON.stringify(validated.issues)}`,
    );
  }
  const scenario = validated.value;
  const requiredChecksRaw = JSON.parse(
    readFileSync(join(fixtureDir, entry.required_checks), "utf-8"),
  );
  // ADR FIX-P1-01/02: required checks go through the same validator
  // the shipped CLI uses (loadRequiredChecks -> validateRequiredChecks),
  // so the FIX-P0-01/04 bypass is gone. This also locks that the
  // duplicate-context manifest G-57 passes CLI validation.
  const validatedChecks = validateRequiredChecks(requiredChecksRaw);
  if (!validatedChecks.ok || validatedChecks.value === null) {
    throw new Error(
      `fixture ${entry.id} required checks failed validateRequiredChecks: ${JSON.stringify(validatedChecks.issues)}`,
    );
  }
  const requiredChecks = validatedChecks.value;
  const expected = JSON.parse(
    readFileSync(join(fixtureDir, entry.expected), "utf-8"),
  );
  // Both shapes are returned: buildReport takes the validated
  // ScenarioV1 (nulls, not undefined); evaluateE2E takes the raw
  // E2EScenario shape (optional fields, no nulls).
  return { workflows, scenario, scenarioRaw, requiredChecks, expected };
}

/** §4.7 exit code implied by a list of check statuses (strictSkipped off). */
function expectedExitCode(statuses: string[]): number {
  let worst = 0;
  for (const status of statuses) {
    const code =
      status === "INVALID"
        ? 3
        : status === "PENDING_NOT_REPORTED" ||
            status === "AMBIGUOUS" ||
            status === "UNKNOWN"
          ? 2
          : 0;
    if (code > worst) worst = code;
  }
  return worst;
}

describe("FIX-P0-01 formal-pipeline differential (buildReport vs Oracle)", () => {
  for (const entry of suite.fixtures) {
    it(`${entry.id} formal pipeline matches Oracle expected (jobs + checks + exit code)`, () => {
      const { workflows, scenario, requiredChecks, expected } = loadFixture(entry);
      const built = buildReport({
        fixtureId: entry.id,
        workflows,
        scenario,
        requiredChecks: requiredChecks.required_checks,
      });
      const dumpDir = process.env["CHECKPATH_FORMAL_DUMP_DIR"];
      if (dumpDir) {
        mkdirSync(dumpDir, { recursive: true });
        writeFileSync(
          join(dumpDir, `${entry.id}.json`),
          JSON.stringify(
            {
              fixture_id: entry.id,
              jobs: built.report.job_evaluations,
              required_checks: built.report.required_check_results,
            },
            null,
            2,
          ) + "\n",
          "utf-8",
        );
      }
      // Jobs: formal rows carry workflow_path; expected rows carry
      // `workflow` (same value: the fixture workflow path).
      expect(
        built.report.job_evaluations.map((row) => ({
          workflow: row.workflow_path,
          job_id: row.job_id,
          context: row.context,
          status: row.status,
          reason: row.reason,
        })),
      ).toEqual(expected.jobs);
      // Checks: expected rows carry no provider_workflow_path, so
      // compare the shared subset only.
      expect(
        built.report.required_check_results.map((row) => ({
          context: row.context,
          provider_count: row.provider_count,
          provider_job_id: row.provider_job_id,
          reason: row.reason,
          status: row.status,
        })),
      ).toEqual(expected.required_checks);
      // §4.7 exit code implied by the Oracle-expected check statuses.
      expect(exitCodeForReport(built.report)).toBe(
        expectedExitCode(expected.required_checks.map((c: { status: string }) => c.status)),
      );
    });

    it(`${entry.id} formal pipeline agrees with evaluateE2E (two-path lock, P2-2)`, () => {
      const { workflows, scenario, scenarioRaw, requiredChecks } = loadFixture(entry);
      const built = buildReport({
        fixtureId: entry.id,
        workflows,
        scenario,
        requiredChecks: requiredChecks.required_checks,
      });
      const e2e = evaluateE2E({
        fixture_id: entry.id,
        workflows,
        scenario: scenarioRaw,
        required_checks: requiredChecks,
      });
      expect(
        built.report.job_evaluations.map((row) => ({
          workflow: row.workflow_path,
          job_id: row.job_id,
          context: row.context,
          status: row.status,
          reason: row.reason,
        })),
      ).toEqual(
        e2e.jobs.map((row) => ({
          workflow: row.workflow,
          job_id: row.job_id,
          context: row.context,
          status: row.status,
          reason: row.reason,
        })),
      );
      expect(
        built.report.required_check_results.map((row) => ({
          context: row.context,
          provider_count: row.provider_count,
          provider_job_id: row.provider_job_id,
          reason: row.reason,
          status: row.status,
        })),
      ).toEqual(
        e2e.required_checks.map((row) => ({
          context: row.context,
          provider_count: row.provider_count,
          provider_job_id: row.provider_job_id,
          reason: row.reason,
          status: row.status,
        })),
      );
    });
  }

  // G-79/G-80 exist only in the golden suite; when this file runs
  // under another suite (e.g. the S0 suite via oracle-diff) the two
  // probe tests skip instead of throwing.
  const probe = (id: string) =>
    suite.fixtures.some((f) => f.id === id) ? it : it.skip;

  probe("G-79")("G-79 matrix job is UNKNOWN in the formal pipeline (P0-1 probe case)", () => {
    const entry = suite.fixtures.find((f) => f.id === "G-79");
    if (entry === undefined) throw new Error("golden suite has no G-79");
    const { workflows, scenario, requiredChecks } = loadFixture(entry);
    const built = buildReport({
      fixtureId: "G-79",
      workflows,
      scenario,
      requiredChecks: requiredChecks.required_checks,
    });
    expect(built.report.job_evaluations).toEqual([
      {
        workflow_path: "workflow.yml",
        job_id: "test",
        context: "unit-tests",
        status: "UNKNOWN",
        reason: "unsupported_matrix",
      },
    ]);
    expect(built.report.required_check_results).toEqual([
      {
        context: "unit-tests",
        status: "UNKNOWN",
        provider_job_id: "test",
        provider_workflow_path: "workflow.yml",
        provider_count: 1,
        reason: "provider_unknown",
      },
    ]);
    expect(exitCodeForReport(built.report)).toBe(2);
    // The witness names the unsupported feature (job reason).
    expect(built.report.witnesses).toHaveLength(1);
    expect(built.report.witnesses[0].kind).toBe("unsupported_feature");
    expect(built.report.witnesses[0].first_blocking_condition).toBe("provider_unknown");
  });

  probe("G-57")("G-57 duplicate-context manifest resolves per-entry in the formal pipeline (P1-1 probe case)", () => {
    const entry = suite.fixtures.find((f) => f.id === "G-57");
    if (entry === undefined) throw new Error("golden suite has no G-57");
    const { workflows, scenario, requiredChecks, expected } = loadFixture(entry);
    // loadFixture already routed the manifest through
    // validateRequiredChecks (ADR FIX-P1-01/02): reaching here proves
    // the CLI validator admits the duplicate-context manifest.
    const built = buildReport({
      fixtureId: "G-57",
      workflows,
      scenario,
      requiredChecks: requiredChecks.required_checks,
    });
    expect(
      built.report.required_check_results.map((row) => ({
        context: row.context,
        provider_count: row.provider_count,
        provider_job_id: row.provider_job_id,
        reason: row.reason,
        status: row.status,
      })),
    ).toEqual(expected.required_checks);
    // Per-entry resolution (T008): the three `unit-tests` entries are
    // NOT collapsed — github-actions reports, the two external/empty
    // sources are UNKNOWN, `lint` has no provider.
    expect(built.report.required_check_results).toHaveLength(5);
    expect(built.report.required_check_results[0]).toMatchObject({
      context: "unit-tests",
      status: "REPORTABLE_PENDING",
      reason: "provider_reportable",
    });
    expect(built.report.required_check_results[1]).toMatchObject({
      context: "unit-tests",
      status: "UNKNOWN",
      reason: "external_source",
    });
    expect(built.report.required_check_results[4]).toMatchObject({
      context: "unit-tests",
      status: "UNKNOWN",
      reason: "external_source",
    });
    // UNKNOWN present -> §4.7 exit 2.
    expect(exitCodeForReport(built.report)).toBe(2);
  });

  probe("G-80")("G-80 reusable-workflow job is UNKNOWN in the formal pipeline (P0-1 probe case)", () => {
    const entry = suite.fixtures.find((f) => f.id === "G-80");
    if (entry === undefined) throw new Error("golden suite has no G-80");
    const { workflows, scenario, requiredChecks } = loadFixture(entry);
    const built = buildReport({
      fixtureId: "G-80",
      workflows,
      scenario,
      requiredChecks: requiredChecks.required_checks,
    });
    expect(built.report.job_evaluations).toEqual([
      {
        workflow_path: "workflow.yml",
        job_id: "call-reusable",
        context: "unit-tests",
        status: "UNKNOWN",
        reason: "unsupported_reusable_workflow",
      },
    ]);
    expect(built.report.required_check_results).toEqual([
      {
        context: "unit-tests",
        status: "UNKNOWN",
        provider_job_id: "call-reusable",
        provider_workflow_path: "workflow.yml",
        provider_count: 1,
        reason: "provider_unknown",
      },
    ]);
    expect(exitCodeForReport(built.report)).toBe(2);
    expect(built.report.witnesses).toHaveLength(1);
    expect(built.report.witnesses[0].kind).toBe("unsupported_feature");
    expect(built.report.witnesses[0].first_blocking_condition).toBe("provider_unknown");
  });
});
