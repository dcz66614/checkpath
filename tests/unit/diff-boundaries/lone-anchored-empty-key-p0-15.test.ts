// FIX-P0-15 (R14 5 P0 families) — Lone anchored empty key, round 2:
// unwrap + second anchor + tag on key + unglued anchor-colon +
// nested block-map value (T013 R14: the 11 residual rows from
// FIX-P0-14, graded as 5 P0 families).
//
// The fix lives in the Oracle side only
// (`oracle/checkpath_oracle/parser.py`):
//   (a) `_unwrap_lone_anchored_empty_key_doc` — a lone
//       anchored-empty-key document whose value IS a mapping at
//       token level renders as the mapping itself (the `yaml`
//       package attributes the glued anchor to the value node, so
//       the empty key vanishes); the unwrapped mapping is used for
//       the `on` logic in `parse_workflow_yaml` and for the `jobs`
//       lookup in `extract_jobs` (a value containing `jobs:` also
//       diverges in jobs mode). A known tag such as `!!str` on the
//       value mapping makes the loader construct a string, so the
//       value mapping's own token span is re-parsed instead.
//   (b) `_reject_second_anchor_on_value` — mirrors the `yaml`
//       package's "at most one anchor" rejection: a glued
//       anchored-empty-key pair whose value node's first token is
//       an AnchorToken (second anchor) or an AliasToken.
//   (c) `_reject_tagged_anchored_empty_key` — mirrors E05
//       (`hasRejectedAnchorOrTag`): a tag then a GLUED anchor on
//       the empty key.
//   (d) `_reject_unglued_anchored_empty_key` — mirrors
//       `hasUnrepresentableKey`: an UNGLUED anchor on the empty
//       key; a tagged one fires only as the first pair of a
//       pair-value block mapping (the `yaml` package renders the
//       key as `""` with tag+anchor attached everywhere else).
//   (e) `_reject_anchored_nested_block_mapping` — mirrors the
//       "at most one anchor" rejection in NESTED block mapping:
//       a block mapping carrying an anchor (value of a glued
//       anchored-empty-key pair, or an anchor immediately before
//       it) whose FIRST pair is a glued anchored empty key.
// See ADR FIX-P0-15 in handoff/P020-FIX-P0-15/TASK_REPORT.md and
// evidence/probes/fix-p0-15/ for the full 130-row probe matrix.
//
// This test locks both sides' exact behaviour (status / errors /
// full events, field-for-field) and asserts the two sides agree on
// all 20 shapes.
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
  "../../fixtures/parser-divergence/lone-anchored-empty-key-p0-15",
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

describe("lone anchored empty key YAML parity, round 2 (FIX-P0-15, R14 5 P0 families)", () => {
  it("expected file schema is the parser-divergence schema", () => {
    expect(expected.schema).toBe("checkpath.parser-divergence/v1");
    expect(expected.cases).toHaveLength(20);
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
