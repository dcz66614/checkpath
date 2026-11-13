// FIX-P1-01 — Duplicate-key YAML parity test (supersedes the FIX-P2
// divergence lock, T013 P2-4 / final review R1 P1-1), extended by
// FIX-P0-02 (final review R2 P0: boolean-spelling duplicate keys).
//
// The TypeScript `yaml` parser rejects a repeated mapping key
// (`Map keys must be unique` → trigger IR INVALID / `yaml_parse_error`).
// The Python Oracle used to differ: PyYAML BaseLoader silently kept the
// LAST value and proceeded (IR VALID). FIX-P1-01 makes the Oracle reject
// too (`oracle/checkpath_oracle/parser.py`, `_StrictBaseLoader` — a
// BaseLoader subclass that raises `yaml.YAMLError` on a repeated
// mapping key, all other BaseLoader semantics unchanged), so the two
// sides now AGREE on all four probed shapes:
//
//   dup-branches — `branches:` twice under `on.push`
//   dup-event    — `push:` twice under `on`
//   dup-name     — `name:` twice at the top level (P2-2: this shape was
//                   probed before but had no fixture of its own)
//
// FIX-P0-02 adds a fourth shape: `dup-bool-true` — `True:` and `true:`
// under `on`. The TypeScript parser resolves both plain spellings to
// boolean true (YAML 1.2 core schema), so its uniqueKeys check rejects
// them; the Oracle's duplicate check now folds the same boolean (and
// null) spellings before comparing. See ADR FIX-P0-02 in
// handoff/P020-FIX-P0-02/TASK_REPORT.md for the probe table.
//
// This test locks both sides' exact behaviour (INVALID /
// `yaml_parse_error`, no events) and asserts the two sides agree — the
// old "assert they disagree" lock is gone. The same four cases are
// also covered by the automated Oracle对照: the trigger suite
// (tests/fixtures/trigger/T6-17..T6-20, `npm run oracle:diff:trigger`)
// and the golden suite (tests/fixtures/golden/G-81..G-84,
// `npm run test:oracle`).
//
// The Oracle side is run through scripts/oracle-parse-probe.py (a thin
// driver over parse_workflow_yaml, no evaluation logic of its own).

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWorkflowYaml } from "../../../src/core/workflow-parser.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const fixtureDir = join(
  here,
  "../../fixtures/parser-divergence/duplicate-key",
);
const probe = join(repoRoot, "scripts/oracle-parse-probe.py");

interface ExpectedCase {
  id: string;
  file: string;
  typescript: { status: string; errors: string[] };
  oracle: { status: string; errors: string[]; events: unknown };
}

const expected = JSON.parse(
  readFileSync(join(fixtureDir, "expected.json"), "utf-8"),
) as { schema: string; cases: ExpectedCase[] };

describe("duplicate-key YAML parity (FIX-P1-01 + FIX-P0-02, ex T013 P2-4 / R1 P1-1 / R2 P0)", () => {
  it("expected file schema is the parser-divergence schema", () => {
    expect(expected.schema).toBe("checkpath.parser-divergence/v1");
    expect(expected.cases).toHaveLength(4);
  });

  for (const entry of expected.cases) {
    it(`${entry.id}: TS and Oracle both reject (INVALID / yaml_parse_error)`, () => {
      const yamlText = readFileSync(join(fixtureDir, entry.file), "utf-8");

      // TypeScript side: parse() throws on the duplicate key.
      const ts = parseWorkflowYaml(yamlText, entry.id);
      expect(ts.status).toBe(entry.typescript.status);
      expect(ts.errors).toEqual(entry.typescript.errors);

      // Oracle side: _StrictBaseLoader raises on the duplicate key.
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

      // The two sides agree — this is the parity lock that replaces
      // the old divergence lock (which asserted they disagree).
      expect(ts.status).toBe(oracle.status);
      expect(ts.errors).toEqual(oracle.errors);
    });
  }
});
