// FIX-P0-19 (T013 R18 P0) — flow-mapping null-value alias key
// resolving to a duplicate scalar key.
//
// The `yaml` package's `uniqueKeys` check never resolves alias keys
// (compose/util-map-includes.js compares `a === b ||
// (isScalar(a) && isScalar(b) && a.value === b.value)` — an Alias
// node is never a Scalar), so `m: {a: 1, *w}` (with `&w a: 1`)
// parsed with 0 errors on the TypeScript side while the Oracle's
// `_StrictBaseLoader.construct_mapping` (FIX-P0-02) composes the
// alias to its anchored ScalarNode and rejects with
// `duplicate mapping key: 'a'`.
//
// The fix lives in the TypeScript side only
// (`src/core/workflow-parser.ts`, `hasDuplicateAliasKey`, wired into
// both `parseWorkflowYaml` and `extractJobs` in `src/core/e2e.ts`):
// for every mapping in the AST, an alias key's effective key is the
// Scalar it resolves to (`Alias.resolve(doc)`), and a collision
// between two effective keys — same node, or two Scalars with `===`
// values — rejects the document with `yaml_parse_error` when at
// least one colliding pair's key is an alias. Plain scalar-vs-scalar
// duplicates stay `parse()`'s `uniqueKeys` job. The equality mirrors
// the Oracle's `_duplicate_key_canonical` folding: plain `1` vs
// `01`, `True` vs `true`, `~` vs `null`, and quoted `'a'` vs plain
// `a` collide, while `1` vs `'1'`, `True` vs `1`, and `!!str 1` vs
// `1` stay distinct, and `.nan` vs `.nan` never collides
// (`NaN !== NaN`). An alias resolving to a collection is left alone
// (N5, `hasUnrepresentableKey`); an unresolvable / forward-reference
// / chained alias is left alone (both sides already reject through
// the plain `parse()` path). See ADR FIX-P0-19 in
// handoff/P020-FIX-P0-19/TASK_REPORT.md and
// evidence/probes/fix-p0-19/ for the parser-level probes (PyYAML
// vs `yaml` 2.9.1) and the full probe grid (35 shapes, 70/70 MATCH).
//
// This test locks both sides' exact behaviour (status / errors /
// full events / full job list, field-for-field) in both trigger and
// jobs modes, and asserts the two sides agree on all 35 shapes.
//
// The Oracle side is run through scripts/oracle-parse-probe.py /
// scripts/oracle-jobs-probe.py (thin drivers over
// parse_workflow_yaml / extract_jobs, no evaluation logic of their
// own).

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
  "../../fixtures/parser-divergence/duplicate-alias-key-p0-19",
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

describe("duplicate alias key YAML parity (FIX-P0-19, R18 P0 family)", () => {
  it("expected file schema is the parser-divergence schema", () => {
    expect(expected.schema).toBe("checkpath.parser-divergence/v1");
    expect(expected.cases).toHaveLength(35);
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
