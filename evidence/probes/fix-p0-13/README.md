# FIX-P0-13 probe matrix — R12 grouped P0s (C1/C2/C3)

## What this is

The probe matrix for FIX-P0-13 (T013 R12 grouped P0s): three new
P0s independently graded by the R12 reviewer from the 12 residual
rows disclosed in the FIX-P0-12 report §7 —

- **P0-C1 — `,`-suffix family** (A60, X04, Y03, Y05, Y08, Y09,
  Y10 + X11 block variant; 16 checks): PyYAML's `scan_tag_uri`
  consumes a flow `,` into the tag suffix, then the parser fails
  in a flow mapping (TS VALID vs Oracle INVALID) or accepts a
  different structure in block context (X11, reverse direction).
- **P0-C2 — tag suffix `[`/`]` charset** (A70, X08, X09; 6
  checks): PyYAML's URI charset includes `[`/`]`, npm stops the
  tag there (TS INVALID vs Oracle VALID).
- **P0-C3 — anchored empty key** (A45; 2 checks): npm's implicit-key
  single-line rule rejects `&x: 1` at document root (and in any
  block mapping with ≥ 2 pairs), PyYAML accepts it (TS INVALID vs
  Oracle VALID).

The fix is two-sided for C1 and Oracle-side for C2/C3. See
`handoff/P020-FIX-P0-13/TASK_REPORT.md` for the full report.

## Method

Discovery was parser-level parallel mapping (`node YAML.parse`
vs PyYAML `safe_load` vs the Oracle's `_StrictBaseLoader` on bare
fragments, `map-p0-13.py`: 38 + 18 + 18 shapes), then full-workflow
end-to-end mapping through the real probe drivers
(`map2-p0-13.py`: 56 shapes; `map3/map4/map5-p0-13.py`: 12 + 13 +
12 shapes). Every live divergence was confirmed end-to-end before
fixing, because parser-level mapping can mislead — bare
`YAML.parse` is not the product entry point
(`parseWorkflowYaml` adds the FIX-P0-04/06/09/12 rules), and the
probe only compares TriggerIR (trigger mode) and the job list
(jobs mode), so a difference in an ignored key's *value* is
invisible and only parse status / `on:` / `jobs:` content matter.
Four parser-level "divergences" turned out to be MATCH end-to-end
and are NOT residuals: `safe_load`'s constructor-layer rejections
of unknown tags (the Oracle's `_StrictBaseLoader` accepts them),
bare-fragment acceptances that vanish in full documents
(`&x: 1` alone parses as a scalar in npm but rejects in a full
doc; `&x : 1` alone accepts but rejects with more pairs), and
`m:`-value differences that never reach TriggerIR/jobs.

## The rules

### C1 — two rules, one per side

**TypeScript side** (`hasRejectedTagComma` in
`src/core/workflow-parser.ts`, wired into `parseWorkflowYaml` and
`extractJobs`): in a flow MAPPING (innermost flow kind is `map`),
a tag whose raw suffix ends with `,` is rejected. The suffix is
scanned the same way `hasRejectedAnchorOrTag` scans it (URI
characters with `%XX` escapes, handle form, verbatim `!<...>`).
A flow SEQUENCE never triggers (`[!foo, a: 1]`, `[!foo, 1]` stay
VALID); a flow map nested in a sequence DOES trigger (the scan
keeps a flow-KIND stack, not just a depth count); block context
never triggers here — the Oracle rule owns that half.

**Oracle side** (`_reject_tag_suffix_comma` in
`oracle/checkpath_oracle/parser.py`, wired into
`parse_workflow_yaml` and `extract_jobs`): a `TagToken` whose raw
suffix ends with `,` is rejected unless the innermost flow kind
is a sequence. This closes the block half (`a: !foo,` + next
pair) and the both-accept shapes where the following node is not
a pair key (`m: {a: !foo, 1}`, `m: {a: !foo, [1, 2]}` — the two
sides parse different structures there, so both must reject for
the verdicts to agree). `!foo,bar` (comma mid-suffix) and
`!foo ,` (space before comma) never trigger on either side.

Both rules check the RAW suffix, not the decoded token value:
PyYAML decodes `%XX` escapes (`!foo%5Bbar` → suffix `foo[bar`),
so `!foo%2C,` (escaped comma + literal trailing comma) triggers
while `!foo%2C` (escaped comma only) does not. Verbatim tags are
excluded from both rules (a `,` after `>` is already rejected by
`hasRejectedAnchorOrTag` / the PyYAML scanner; a `,` inside the
verbatim URI is content both sides accept).

### C2 — Oracle side only

`_reject_tag_suffix_brackets` in `oracle/checkpath_oracle/parser.py`:
a `TagToken` whose raw suffix contains `[` or `]` is rejected, in
every context (flow mapping, flow sequence, block, key or value
position). Verbatim tags excluded (`!<foo[bar]>` is accepted by
both sides — distinguished by the token's handle being `None`).
The `yaml` package cannot accept these shapes, so no TypeScript
rule could close them.

### C3 — Oracle side only

`_reject_anchored_empty_key` in `oracle/checkpath_oracle/parser.py`:
an anchored empty key — token pattern `KeyToken`, optional
`TagToken`s, `AnchorToken`, `ValueToken` — in a block mapping
with ≥ 2 pairs is rejected. Three conditions, all probed shape
by shape: flow context exempts (`m: {&x: 1}` both accept);
a single-pair mapping exempts (nested, block-sequence item, lone
document); and a null-valued anchored key in FIRST position
exempts (`&x:` + more pairs — the pair vanishes from the `yaml`
package's output; same nested and with a comment after the
colon). The first-pair-null exemption is narrow: a scalar /
collection / anchored value in first position rejects, a null
value in any other position rejects, and a space between the
anchor and the colon breaks it (the anchor must be glued to the
`:`, i.e. `AnchorToken.end == ValueToken.start`). "Value is null"
is read off the token after the `:` (a `KeyToken`, `BlockEndToken`
or `StreamEndToken` means null). A double property (`!foo &x: 1`)
is covered by walking back over `TagToken`s; `? &x: 1` needs no
special case (its inner mapping holds a single pair, and the
Oracle rejects it at construction time anyway).

## The matrix (98 shapes × 2 modes = 196 checks)

- C1 core + mapping + controls: 40 shapes (c1-*).
- C2 core + mapping + controls: 17 shapes (c2-*).
- C3 core + mapping + controls: 35 shapes (c3-*).
- Percent-escape edge cases: 4 shapes (esc-*).
- Lone-document residuals: 2 shapes (lone-*), flagged
  `known_divergence` — see §7.

Result after the fix: **194/196 MATCH**. The 2 DIFF checks are
the flagged lone-document rows in trigger mode only (jobs mode
MATCHes — both sides return `[]`); see §7.

> **FIX-P0-14 clearance note (2026-11-09):** the 2 lone-document
> rows now MATCH (matrix re-run 196/196, 0 flagged) — FIX-P0-14
> closed them with the Oracle-side classification alignment
> (`_is_lone_anchored_empty_key_doc`), and R13's own 49-row probe
> re-runs 98/98. The 2 `known_divergence` flags in `cases.json`
> were cleared by FIX-P0-14 (same evidence hygiene as P2-R13-1);
> §7 below is kept as the historical record of what the rows were.

## §7 Residuals (2 checks, disclosed, not fixed)

**Lone documents consisting only of an anchored empty key**
(`&x: 1` alone, `&x:` alone): TS INVALID
`workflow_root_not_mapping` vs Oracle INVALID `missing_on_key`.
Pre-existing (both sides already disagreed before this fix, with
different error codes for a non-workflow input); no rejection rule
can close it — rejecting on the Oracle side would give
`yaml_parse_error`, still a different error code from the
TypeScript side's `workflow_root_not_mapping`, and the `yaml`
package parses the lone document as a scalar, not a mapping, so
there is no verdict the Oracle can return that matches. The input
is outside the product's domain (a workflow document always has
`on:` and `jobs:`). Left for a future round if the product ever
needs to grade lone non-mapping documents field-for-field.

## Files

- `gen-cases.py` — generates `cases.json` from the shape list
  (the shapes are the reviewable source of truth).
- `cases.json` — 98 shapes (full workflow documents).
- `run-matrix.py` — drives the matrix (esbuild TS bundle + Oracle
  drivers, full-JSON compare), writes `results.json`.
- `ts-probe-entry.ts` — TS probe entry for the bundle.
- `results.json` — this round's measurement: 194/196 MATCH.
- `map-p0-13.py`, `map2/map3/map4/map5-p0-13.py` — the
  parser-level and end-to-end mapping scripts the thresholds
  were derived from (kept as evidence of the derivation).
