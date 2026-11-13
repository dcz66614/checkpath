// FIX-P0-03 — Scalar-rendering YAML parity test (final review R2 P0
// residual: the main controller's 10-case probe found FIX-P0-02 had
// closed only the duplicate check, not the rendering).
//
// The TypeScript `yaml` parser resolves every plain scalar per YAML
// 1.2 core schema before it becomes a JS object key or value
// (`True` -> boolean true -> key/value `"true"`, `Null`/`~`/empty ->
// null -> `""`, `01` -> 1 -> `"1"`, `1e3` -> 1000 -> `"1000"`,
// `.inf` -> Infinity -> `"Infinity"`), and rejects plain non-string
// scalars in string-only positions (`on:` list items,
// `branches:`/`types:`/… filter values). The Python Oracle used to
// keep every scalar as its raw spelling string, so event names,
// filter keys, job ids and filter values all disagreed. FIX-P0-03
// makes the Oracle resolve plain scalars through the same core schema
// (`oracle/checkpath_oracle/parser.py`, `_StrictBaseLoader` implicit
// resolvers + `_TScalar`) and iterate mappings in JS object-key
// order. See ADR FIX-P0-03 in
// handoff/P020-FIX-P0-03/TASK_REPORT.md for the probe tables.
//
// This test locks both sides' exact behaviour (status / errors /
// full events, field-for-field) and asserts the two sides agree on
// all 21 shapes. The same cases are also covered by the automated
// Oracle对照: the trigger suite
// (tests/fixtures/trigger/T6-21..T6-41, `npm run oracle:diff:trigger`)
// and the golden suite (tests/fixtures/golden/G-85..G-105,
// `npm run test:oracle`).
//
// The Oracle side is run through scripts/oracle-parse-probe.py (a thin
// driver over parse_workflow_yaml, no evaluation logic of its own).

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWorkflowYaml } from "../../../src/core/workflow-parser.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const fixtureDir = join(
  here,
  "../../fixtures/parser-divergence/scalar-rendering",
);
const probe = join(repoRoot, "scripts/oracle-parse-probe.py");

interface ExpectedCase {
  id: string;
  file: string;
  typescript: { status: string; errors: string[]; events: unknown };
  oracle: { status: string; errors: string[]; events: unknown };
}

const expected = JSON.parse(
  readFileSync(join(fixtureDir, "expected.json"), "utf-8"),
) as { schema: string; cases: ExpectedCase[] };

describe("scalar-rendering YAML parity (FIX-P0-03, R2 P0 residual)", () => {
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
    it(`${entry.id}: TS and Oracle agree (status / errors / events)`, () => {
      const yamlText = readFileSync(join(fixtureDir, entry.file), "utf-8");

      // TypeScript side.
      const ts = parseWorkflowYaml(yamlText, entry.id);
      expect(ts.status).toBe(entry.typescript.status);
      expect(ts.errors).toEqual(entry.typescript.errors);
      expect(ts.events).toEqual(entry.typescript.events);

      // Oracle side: _StrictBaseLoader resolves plain scalars per
      // YAML 1.2 core schema and renders them like the TS side.
      const oracleRun = spawnSync(
        "python3",
        [probe, "--yaml", join(fixtureDir, entry.file), "--fixture-id", entry.id],
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

      // The two sides agree — this is the parity lock.
      expect(ts.status).toBe(oracle.status);
      expect(ts.errors).toEqual(oracle.errors);
      expect(ts.events).toEqual(oracle.events);
    });
  }
});
