// FIX-P0-04 — Bare-empty-key YAML parity test (final review R2 P0
// residual, grouped P0 in T013 R5: a single bare `:` key, or a bare
// `:` filter key, was UNKNOWN on the TypeScript side but INVALID /
// yaml_parse_error in the Oracle, because PyYAML rejects the whole
// document at parse time while the `yaml` parser accepts a bare `:`
// as a null key rendered `""`).
//
// The fix lives in the TypeScript side only
// (`src/core/workflow-parser.ts`, `hasUnrepresentableKey`, called by
// `parseWorkflowYaml` and by `extractJobs` in `src/core/e2e.ts`):
// a mapping key is rejected with the Oracle's exact error when it is
// a bare empty key (PLAIN scalar, null value, empty source range) or
// a non-scalar, non-alias key (collection key: explicit `?` inline
// forms, sequence/mapping keys). The Oracle parser is untouched.
// Explicit null spellings (`null:` / `Null:` / `NULL:` / `~:`),
// quoted empty keys (`''`), the standard two-line explicit-key form
// (`? push` newline `: {}`), anchored scalar keys, merge keys and
// block-style alias keys are deliberately NOT rejected — both sides
// already agree on them (cases b14–b22 lock that). See ADR FIX-P0-04
// in handoff/P020-FIX-P0-04/TASK_REPORT.md and the README in the
// fixture directory for the probe tables.
//
// This test locks both sides' exact behaviour (status / errors /
// full events, field-for-field) and asserts the two sides agree on
// all 22 shapes. The same cases are also covered by the automated
// Oracle对照: the trigger suite
// (tests/fixtures/trigger/T6-42..T6-51, `npm run oracle:diff:trigger`)
// and the golden suite (tests/fixtures/golden/G-106..G-115,
// `npm run test:oracle`).
//
// The Oracle side is run through scripts/oracle-parse-probe.py (a thin
// driver over parse_workflow_yaml, no evaluation logic of its own).
//
// Note: the `yaml` package prints one process warning to stderr
// ("Keys with collection values will be stringified") when
// parseWorkflowYaml stringifies the collection key in b10 (`? :`).
// The warning is library noise from a deliberately degenerate input,
// not a failure; it appears in the vitest output but fails nothing.

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
  "../../fixtures/parser-divergence/bare-empty-key",
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

describe("bare-empty-key YAML parity (FIX-P0-04, R2 P0 residual)", () => {
  it("expected file schema is the parser-divergence schema", () => {
    expect(expected.schema).toBe("checkpath.parser-divergence/v1");
    expect(expected.cases).toHaveLength(22);
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

      // Oracle side: PyYAML rejects a bare empty key (or a
      // collection key) at parse time, so the Oracle can only return
      // INVALID / yaml_parse_error / events [].
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
