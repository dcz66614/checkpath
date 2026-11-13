// FIX-P0-16 (T013 R15 3 P0 families + grid residuals) — anchored
// empty key, round 3: C3 overreach + nospace anchor-colon scanner
// mirror + scalar-tag loader boundary + tagged-empty-key rule +
// flow anchored-collection-key rule.
//
// The fix lives in the Oracle side only
// (`oracle/checkpath_oracle/parser.py`):
//   P0-1 `_reject_anchored_empty_key` (C3) — narrowed: candidates
//     now carry `has_tag` (TagTokens walked back over from the
//     anchor); the firing loop skips candidates with `has_tag and
//     not glued` (tag+unglued accepted by the `yaml` package
//     everywhere except first-pair-of-pair-value-block-mapping,
//     which rule (d) already covers). Closes the 3 R15 P0-1 rows
//     (root 1st / root 2nd / nested 2nd pair).
//   P0-2 scanner mirror — `_StrictBaseLoader` overrides
//     `get_token` / `fetch_anchor` / `check_value`: when the
//     current char is `:`, the next char is `!`, the last token
//     taken is an AnchorToken, the pointer is at the recorded
//     anchor end index (glued), the anchor is in key position
//     (line-start / after `-` / previous-line `:` / after another
//     property — but NOT after `?`, NOT on the same line after a
//     Value/Scalar, and NOT when the node after the tag is a
//     scalar/alias key), the `:` is treated as a value indicator.
//     All 13 `yaml.scan` call sites now use `_StrictBaseLoader`.
//     Closes the 2 R15 P0-2 rows (flow + block nospace).
//   P0-3 `_StrictBaseLoader._construct_core_scalar` — if the node
//     is a MappingNode / SequenceNode, construct by kind
//     (`construct_mapping` / `construct_sequence`), ignoring the
//     scalar tag, like the `yaml` package (which only warns
//     `YAMLWarning: Unresolved tag` and still parses the set as a
//     mapping). Closes the 8 R15 P0-3 rows (lone-doc + `on:` value
//     positions, `!!int` / `!!bool` / `!!float` / `!!str`).
//   `_reject_tagged_empty_key` — grid residual: a tagged empty key
//     with NO anchor (`!bar : 2`) as the first pair of a
//     pair-value block mapping (rule (d)'s tag guard, anchor-less).
//   `_reject_flow_anchored_empty_key_collection` — grid residual:
//     an anchored empty key in a FLOW mapping whose value is a
//     collection (`m: {&x: {a: 1}}`); the `yaml` package reads the
//     collection as the key (`hasUnrepresentableKey`). Fires only
//     when the innermost frame is a flow mapping — block pairs and
//     flow-seq item pairs with collection values are VALID on both
//     sides and are locked as controls.
// See ADR FIX-P0-16 in handoff/P020-FIX-P0-16/TASK_REPORT.md and
// evidence/probes/fix-p0-16/ for the full probe grid (p1 54, p2 46,
// p3 82, p4 56 — 238/238 MATCH).
//
// This test locks both sides' exact behaviour (status / errors /
// full events, field-for-field) and asserts the two sides agree on
// all 32 shapes.
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
  "../../fixtures/parser-divergence/anchored-empty-key-p0-16",
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

describe("anchored empty key YAML parity, round 3 (FIX-P0-16, R15 3 P0 families + grid residuals)", () => {
  it("expected file schema is the parser-divergence schema", () => {
    expect(expected.schema).toBe("checkpath.parser-divergence/v1");
    expect(expected.cases).toHaveLength(32);
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
