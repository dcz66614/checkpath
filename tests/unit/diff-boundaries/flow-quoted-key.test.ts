// FIX-P0-09 — Multi-line quoted scalar as a flow-mapping key
// parity test (T013 R8 grouped P0 / R3: the `yaml` npm package
// accepts a multi-line quoted scalar as a flow-mapping key —
// `m: {"a\n b": 1}`, `on: {"a\n b": push}` — while PyYAML
// rejects every multi-line key in a flow mapping with a
// ParserError, so the Oracle returned INVALID / yaml_parse_error
// where the TypeScript side returned VALID (or INVALID with a
// different error code, event_config_not_mapping, and a different
// job list). The divergence does not need a tab, a double quote,
// or an indent of 1: single quotes, plain keys folding across
// lines, any continuation indent > 0, and nesting all diverge
// the same way. It is in the parser itself, so no Oracle-side
// rule can fix it.
//
// The fix lives in the TypeScript side only
// (`src/core/workflow-parser.ts`, `hasMultilineFlowKey`, called by
// both `parseWorkflowYaml` and `extractJobs` next to
// `hasUnrepresentableKey`): after `parse()` accepts, a flow-map
// key that is a scalar whose source spans a newline (S1), or
// whose `:` separator sits on a later line than the key ends
// (S2), is rejected through the existing `yaml_parse_error` path.
// Explicit `?` keys are excluded (PyYAML accepts them —
// `m: {? "a\n b" : 1}` is VALID on both sides), found by scanning
// backwards over whitespace, newlines and comments; comment
// detection is quote-aware so a `#` inside a quoted value is
// never mistaken for a comment start. The Oracle parser is
// untouched. The rule was derived by probing the `yaml` package
// AST over 34 mapping cases; see ADR FIX-P0-09 in
// handoff/P020-FIX-P0-09/TASK_REPORT.md, the README in the fixture
// directory, and evidence/probes/fix-p0-09/ for the probe tables.
//
// This test locks both sides' exact behaviour (status / errors /
// full events / full job list, field-for-field) in both trigger and
// jobs modes. The same shapes are also covered by the automated
// Oracle comparison: the trigger suite
// (tests/fixtures/trigger/T6-80..T6-91, `npm run oracle:diff:trigger`)
// and the golden suite (tests/fixtures/golden/G-144..G-155,
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
  "../../fixtures/parser-divergence/flow-quoted-key",
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

describe("flow-quoted-key parity (FIX-P0-09, R8 R3)", () => {
  it("expected file schema is the parser-divergence schema", () => {
    expect(expected.schema).toBe("checkpath.parser-divergence/v1");
    expect(expected.cases).toHaveLength(38);
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
