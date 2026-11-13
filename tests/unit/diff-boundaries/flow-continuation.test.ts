// FIX-P0-10 — Flow-collection continuation not indented beyond
// its block context (T013 R9 grouped P0 / R4+R5: a comma alone
// on a line, or an explicit key's `:` on the next line, at
// indent 0 inside a flow collection — `m: {a\n, b: 1}`,
// `m: {? a\n: 1}` — while PyYAML accepts them, so the Oracle
// returned VALID (or INVALID with a different error code) where
// the TypeScript side returned INVALID / yaml_parse_error). The
// divergence is in the parser itself (`parse()` rejects), so no
// TypeScript-side rule can fix it.
//
// The fix lives in the Oracle side only
// (`oracle/checkpath_oracle/parser.py`,
// `_reject_underindented_flow_continuation`, called by both
// `parse_workflow_yaml` and `extractJobs` next to the other two
// `_reject_*` rules): on the PyYAML token stream, every token
// inside a flow collection on a continuation line must sit on a
// line indented strictly more than the innermost enclosing
// block collection (key indent for mappings, `-` indent for
// sequences). Flow-end tokens (`}` / `]`) are exempt at any
// indent; document-root flow collections are exempt; blank and
// comment-only lines carry no token. The rule was derived by
// probing the `yaml` package over a 132+25-case parallel
// mapping; see ADR FIX-P0-10 in
// handoff/P020-FIX-P0-10/TASK_REPORT.md, the README in the fixture
// directory, and evidence/probes/fix-p0-10/ for the probe tables.
//
// This test locks both sides' exact behaviour (status / errors /
// full events / full job list, field-for-field) in both trigger and
// jobs modes. The same shapes are also covered by the automated
// Oracle comparison: the trigger suite
// (tests/fixtures/trigger/T6-92..T6-103, `npm run oracle:diff:trigger`)
// and the golden suite (tests/fixtures/golden/G-156..G-167,
// `npm run test:oracle`).
//
// The Oracle side is run through scripts/oracle-parse-probe.py /
// scripts/oracle-jobs-probe.py (thin drivers over
// parse_workflow_yaml / extract_jobs, no evaluation logic of their
// own).
//
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWorkflowYaml } from "../../../src/core/workflow-parser.js";
import { extractJobs } from "../../../src/core/e2e.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const fixtureDir = join(
  here,
  "../../fixtures/parser-divergence/flow-continuation",
);
const parseProbe = join(repoRoot, "scripts/oracle-parse-probe.py");
const jobsProbe = join(repoRoot, "scripts/oracle-jobs-probe.py");

interface ExpectedCase {
  id: string;
  file: string;
  typescript: {
    status: string;
    errors: string[];
    events: unknown;
    jobs: unknown;
  };
  oracle: {
    status: string;
    errors: string[];
    events: unknown;
    jobs: unknown;
  };
}

const expected = JSON.parse(
  readFileSync(join(fixtureDir, "expected.json"), "utf-8"),
) as { schema: string; cases: ExpectedCase[] };

describe("flow-continuation parity (FIX-P0-10, R9 R4/R5)", () => {
  it("expected file schema is the parser-divergence schema", () => {
    expect(expected.schema).toBe("checkpath.parser-divergence/v1");
    expect(expected.cases).toHaveLength(48);
    // The fixture files on disk are exactly the cases in expected.json.
    const files = readdirSync(fixtureDir)
      .filter((f) => f.endsWith(".yml"))
      .sort();
    expect(files).toEqual(
      expected.cases.map((c) => c.file).sort(),
    );
  });

  for (const entry of expected.cases) {
    it(`${entry.id}: TS and Oracle agree (status / errors / events / jobs)`, () => {
      const yamlText = readFileSync(join(fixtureDir, entry.file), "utf-8");

      // TypeScript side, trigger mode.
      const ts = parseWorkflowYaml(yamlText, entry.id);
      expect(ts.status).toBe(entry.typescript.status);
      expect(ts.errors).toEqual(entry.typescript.errors);
      expect(ts.events).toEqual(entry.typescript.events);

      // TypeScript side, jobs mode.
      const tsJobs = extractJobs(yamlText);
      expect(tsJobs).toEqual(entry.typescript.jobs);

      // Oracle side, trigger mode.
      const oracleRun = spawnSync(
        "python3",
        [parseProbe, "--yaml", join(fixtureDir, entry.file), "--fixture-id", entry.id],
        { encoding: "utf-8" },
      );
      expect(oracleRun.status).toBe(0);
      expect(oracleRun.stderr).toBe("");
      const oracle = JSON.parse(oracleRun.stdout) as {
        status: string;
        errors: string[];
        events: unknown;
      };
      expect(oracle.status).toBe(entry.oracle.status);
      expect(oracle.errors).toEqual(entry.oracle.errors);
      expect(oracle.events).toEqual(entry.oracle.events);

      // Oracle side, jobs mode.
      const oracleJobsRun = spawnSync(
        "python3",
        [jobsProbe, "--yaml", join(fixtureDir, entry.file)],
        { encoding: "utf-8" },
      );
      expect(oracleJobsRun.status).toBe(0);
      expect(oracleJobsRun.stderr).toBe("");
      const oracleJobs = JSON.parse(oracleJobsRun.stdout) as unknown;
      expect(oracleJobs).toEqual(entry.oracle.jobs);

      // The two sides agree — this is the parity lock, in both modes.
      expect(ts.status).toBe(oracle.status);
      expect(ts.errors).toEqual(oracle.errors);
      expect(ts.events).toEqual(oracle.events);
      expect(JSON.parse(JSON.stringify(tsJobs))).toEqual(oracleJobs);
    });
  }
});
