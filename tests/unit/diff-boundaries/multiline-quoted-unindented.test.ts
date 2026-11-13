// FIX-P0-08 — Unindented multi-line quoted scalar continuation
// parity test (T013 R7 grouped P0 / RESID: the `yaml` npm package
// rejects a multi-line quoted scalar whose continuation line is
// indented less than or equal to its block context — "Missing closing
// \"quote" — while PyYAML accepts any indent, so the Oracle returned
// VALID where the TypeScript side returned INVALID / yaml_parse_error.
// The divergence does not need a tab: `run: "a\nb c"` with an
// unindented continuation diverges too, and it is in the parser
// itself, so no TypeScript-side rule can fix it.
//
// The fix lives in the Oracle side only
// (`oracle/checkpath_oracle/parser.py`,
// `_reject_underindented_multiline_quoted_scalar`, called by both
// `yaml.load` call sites next to `_reject_adjacent_alias_colon`):
// the Oracle rejects the same shapes through the existing
// `yaml_parse_error` path. The TypeScript product code is untouched.
// The threshold rule (continuation indent must be strictly greater
// than the innermost enclosing block collection's indent — mapping
// value: key indent; sequence item: dash indent; flow item:
// enclosing block indent; blank/spaces-only lines skipped, tab-only
// lines not skipped) was derived by probing the `yaml` package over
// 239 mapping cases; see ADR FIX-P0-08 in
// handoff/P020-FIX-P0-08/TASK_REPORT.md, the README in the fixture
// directory, and evidence/probes/fix-p0-08/ for the probe tables.
//
// This test locks both sides' exact behaviour (status / errors /
// full events / full job list, field-for-field) in both trigger and
// jobs modes. The same shapes are also covered by the automated
// Oracle comparison: the trigger suite
// (tests/fixtures/trigger/T6-68..T6-79, `npm run oracle:diff:trigger`)
// and the golden suite (tests/fixtures/golden/G-132..G-143,
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
  "../../fixtures/parser-divergence/multiline-quoted-unindented",
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

describe("multiline-quoted-unindented parity (FIX-P0-08, R7 RESID)", () => {
  it("expected file schema is the parser-divergence schema", () => {
    expect(expected.schema).toBe("checkpath.parser-divergence/v1");
    expect(expected.cases).toHaveLength(21);
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
