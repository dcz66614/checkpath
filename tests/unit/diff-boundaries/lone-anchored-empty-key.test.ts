// FIX-P0-14 (R13 lone-doc P0) — Lone anchored empty key YAML parity
// test (T013 R13: `&x: 1` / `&x:` alone — the `yaml` package renders
// a lone anchored-empty-key document as a scalar, while PyYAML
// renders it as a 1-pair mapping `{'' : '1'}`, so the TypeScript
// side said `workflow_root_not_mapping` where the Oracle said
// `missing_on_key`).
//
// The fix lives in the Oracle side only
// (`oracle/checkpath_oracle/parser.py`,
// `_is_lone_anchored_empty_key_doc` + a branch in
// `parse_workflow_yaml`'s root check): a degenerate mapping
// consisting entirely of anchored empty keys is reported as
// `workflow_root_not_mapping`. The discriminant is token-based
// (single-pair root block mapping, KeyToken + glued AnchorToken +
// ValueToken, no tag on the key, non-mapping value) so the quoted
// empty key `"": 1` — which renders as a mapping on BOTH sides —
// keeps matching as `missing_on_key` (the controls lock that).
// See ADR FIX-P0-14 in handoff/P020-FIX-P0-14/TASK_REPORT.md and
// evidence/probes/fix-p0-14/ for the full 57-row probe matrix.
//
// This test locks both sides' exact behaviour (status / errors /
// full events, field-for-field) and asserts the two sides agree on
// all 14 shapes.
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
  "../../fixtures/parser-divergence/lone-anchored-empty-key",
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

describe("lone anchored empty key YAML parity (FIX-P0-14, R13 lone-doc P0)", () => {
  it("expected file schema is the parser-divergence schema", () => {
    expect(expected.schema).toBe("checkpath.parser-divergence/v1");
    expect(expected.cases).toHaveLength(14);
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

      // Oracle side.
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
