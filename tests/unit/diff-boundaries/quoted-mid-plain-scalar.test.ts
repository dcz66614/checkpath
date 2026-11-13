// FIX-P0-07 — Quoted-mid-plain-scalar parity test (T013 R6 P0:
// a tab inside quotes that appear mid-line while a plain scalar is
// in progress — `run: echo "a\tb"` is a plain scalar whose `"` is a
// literal character, so the tab is a tab inside a plain scalar and
// PyYAML rejects it (INVALID / yaml_parse_error), while the old
// `hasRejectedTab` treated any `"` after a space as a quote start
// and let the tab through (TS VALID vs Oracle INVALID).
//
// The fix lives in the TypeScript side only
// (`src/core/workflow-parser.ts`, `hasRejectedTab`, called by
// `parseWorkflowYaml` and by `extractJobs` in `src/core/e2e.ts`):
// the function now tracks "plain scalar in progress" across lines
// and only treats `"`/`'` as a quote start where no plain scalar
// has started on the line. The Oracle parser is untouched. Tabs
// inside genuinely quoted scalars are deliberately NOT rejected —
// both sides already agree on them (f12). See ADR FIX-P0-07 in
// handoff/P020-FIX-P0-07/TASK_REPORT.md and the README in the fixture
// directory for the probe tables.
//
// This test locks both sides' exact behaviour (status / errors /
// full events / full job list, field-for-field) in both trigger and
// jobs modes. The same shapes are also covered by the automated
// Oracle对照: the trigger suite
// (tests/fixtures/trigger/T6-62..T6-67, `npm run oracle:diff:trigger`)
// and the golden suite (tests/fixtures/golden/G-126..G-131,
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
  "../../fixtures/parser-divergence/quoted-mid-plain-scalar",
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

describe("quoted-mid-plain-scalar parity (FIX-P0-07, R6 P0)", () => {
  it("expected file schema is the parser-divergence schema", () => {
    expect(expected.schema).toBe("checkpath.parser-divergence/v1");
    expect(expected.cases).toHaveLength(12);
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
