// FIX-P0-17 (T013 R16 2 P0 families + P2-R16-1) — absorbed anchor
// colon: the `yaml` package's ns-anchor-char run vs PyYAML's
// `[0-9A-Za-z_-]*` anchor scan.
//
// The fix lives in the Oracle side only
// (`oracle/checkpath_oracle/parser.py`):
//   P0-A `_nospace_anchor_colon_is_key` — the alias branch now
//     returns False: an alias key must NOT exempt the scanner
//     mirror (the `yaml` package rejects an alias node with
//     properties, "An alias node must not specify any properties"),
//     so `&q:!!str *w: 2` is INVALID on the TypeScript side.
//     Plain / quoted scalar keys still exempt the mirror.
//     Closes the 7 R16 P0-A rows (defined / undefined alias,
//     scalar / sequence target, `!!str` / `!!int` / custom tag).
//   P0-B `scan_anchor` override in `_StrictBaseLoader` — after
//     the base `[0-9A-Za-z_-]*` run, a `:` glued to the anchor /
//     alias name (and the following anchor characters, everything
//     except whitespace and the flow indicators `,[]{} `) is
//     absorbed into the name, mirroring the `yaml` package's
//     ns-anchor-char run. Guards: `:` followed by blank / EOL is
//     NOT absorbed (C3 domain, `&x: 1`, and the `&x:` null
//     exemption); `:` followed by a flow indicator is NOT
//     absorbed; `:` followed by `!` is absorbed only when the
//     tag is properly terminated (blank / EOL after it — a tag
//     glued to the next node, `&b:!!str{...}`, is rejected on
//     both sides and is left for the P0-2 mirror / `scan_tag`).
//     Closes the 9 R16 P0-B rows (`&q:2` / `&q:foo` + mapping,
//     root / value / flow positions).
//   `_reject_absorbed_anchor_colon_value_position` — an absorbed
//     anchor outside implicit-key position is rejected (the
//     `hasRejectedAnchorOrTag` `keyPos` mirror): value position
//     (`m: &q:2`, `m: {a: &q:2}`) and after another property
//     (`!zap &q:2`, `? &q:2`) reject, while line-start / `-` /
//     previous-line-`:` / flow `{` `,` `[` accept.
//   `_reject_flow_absorbed_anchor_null_key` — an absorbed anchor
//     as a null key in a flow mapping is rejected
//     (`hasUnrepresentableKey` mirror): no value (`m: {&q:2}`),
//     a null / alias / second-anchor value after a glued `:`
//     (`m: {&q:2: }`, `m: {&q:2: *s}`, `m: {&q:2: &s 1}`),
//     and an unglued `:` (`m: {&q:2 : 1}`); a glued scalar /
//     tag value (`m: {&q:2: 1}` — the `yaml` package reads that
//     node as the key) and a collection value (owned by
//     `_reject_flow_anchored_empty_key_collection`) accept. The
//     same rule also covers a NON-absorbed anchor with a null
//     value (`m: {&r: }`, newly found in this round's grid).
//   P2-R16-1 — the 6 stale `known_divergence` flags in
//     evidence/probes/fix-p0-15/cases.json are cleared (rows
//     verified MATCH, 260/260, 0 flagged).
// See ADR FIX-P0-17 in handoff/P020-FIX-P0-17/TASK_REPORT.md and
// evidence/probes/fix-p0-17/ for the full probe grid (108 shapes,
// 216/216 MATCH) and the R16 re-run (362/362 MATCH).
//
// This test locks both sides' exact behaviour (status / errors /
// full events, field-for-field) and asserts the two sides agree on
// all 37 shapes.
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
  "../../fixtures/parser-divergence/absorbed-anchor-colon-p0-17",
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

describe("absorbed anchor colon YAML parity (FIX-P0-17, R16 2 P0 families)", () => {
  it("expected file schema is the parser-divergence schema", () => {
    expect(expected.schema).toBe("checkpath.parser-divergence/v1");
    expect(expected.cases).toHaveLength(37);
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
