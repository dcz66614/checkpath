// FIX-P0-05 — Flow-alias-key YAML parity test (final review R2 P0
// residual, D2 in the FIX-P0-04 probe matrix: `on: {*a: 1}` — the
// TypeScript `yaml` package rejects a flow alias key at parse time
// (INVALID / yaml_parse_error, jobs []), while PyYAML accepted it
// and the Oracle returned INVALID / event_config_not_mapping (jobs
// [test]) — or even VALID / UNKNOWN when the alias sat outside
// `on:`).
//
// The fix lives in the Oracle side only
// (`oracle/checkpath_oracle/parser.py`,
// `_reject_adjacent_alias_colon`, called by `parse_workflow_yaml`
// and by `extract_jobs`): an alias used as a mapping key is
// rejected with the Oracle's exact error when the `:` follows the
// alias with no intervening whitespace. The TypeScript product code
// is untouched. The rule is adjacency, not flow style — a space/tab
// before the `:` (`*a : 1`) parses on both sides, a `?` glued to
// the alias (`?*a`) is a plain scalar to the TypeScript reader, and
// aliases in non-key positions (value, sequence item) are untouched
// — all locked by the no-regression cases f11–f15. See ADR FIX-P0-05
// in handoff/P020-FIX-P0-05/TASK_REPORT.md and the README in the
// fixture directory for the probe tables.
//
// This test locks both sides' exact behaviour (status / errors /
// full events / full job list, field-for-field) in both trigger and
// jobs modes. The same shapes are also covered by the automated
// Oracle对照: the trigger suite
// (tests/fixtures/trigger/T6-52..T6-55, `npm run oracle:diff:trigger`)
// and the golden suite (tests/fixtures/golden/G-116..G-119,
// `npm run test:oracle`).
//
// The Oracle side is run through scripts/oracle-parse-probe.py /
// scripts/oracle-jobs-probe.py (thin drivers over
// parse_workflow_yaml / extract_jobs, no evaluation logic of their
// own).
//
// Note: the `yaml` package prints one process warning to stderr
// ("Alias ending in : is ambiguous") when parseWorkflowYaml parses
// an adjacent-colon alias key. The warning is library noise from a
// deliberately degenerate input, not a failure; it appears in the
// vitest output but fails nothing. (The Oracle probe drivers print
// no stderr.)

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
  "../../fixtures/parser-divergence/flow-alias-key",
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

describe("flow-alias-key YAML parity (FIX-P0-05, R2 P0 residual D2)", () => {
  it("expected file schema is the parser-divergence schema", () => {
    expect(expected.schema).toBe("checkpath.parser-divergence/v1");
    expect(expected.cases).toHaveLength(16);
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
