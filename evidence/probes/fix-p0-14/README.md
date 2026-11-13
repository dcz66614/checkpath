# FIX-P0-14 probe matrix — R13 lone-doc P0 (anchored empty key)

## What this is

The probe matrix for FIX-P0-14 (T013 R13 lone-doc P0): lone documents
consisting only of an anchored empty key (`&x: 1` / `&x:` alone) —
the TypeScript side returns `workflow_root_not_mapping` (the `yaml`
package renders the document as the scalar `1` / `null`) while the
Oracle returned `missing_on_key` (PyYAML renders it as the 1-pair
mapping `{'' : '1'}`). Both sides INVALID, different error codes.

The fix is Oracle-side classification alignment only
(`oracle/checkpath_oracle/parser.py`, `_is_lone_anchored_empty_key_doc`
+ a branch in `parse_workflow_yaml`'s root check): a degenerate
mapping consisting entirely of anchored empty keys is reported as
`workflow_root_not_mapping`. `src/` is untouched; `extract_jobs` is
untouched (it already returns `[]` for these documents on both
sides, so jobs mode MATCHES with or without the rule). See
`handoff/P020-FIX-P0-14/TASK_REPORT.md` for the full report.

## Method

Discovery was parser-level parallel mapping (`node YAML.parse` vs
PyYAML `_StrictBaseLoader` on bare fragments, `map-p0-14.py`:
30 + 15 shapes), then full-workflow end-to-end mapping through the
real probe drivers (`map2-p0-14.py`: the same 45 shapes), then a
third boundary round (`map3-p0-14.py`: 12 extra shapes — nested
anchored-empty-key values, tag/anchor on values). Every live
divergence was confirmed end-to-end before fixing, because
parser-level mapping can mislead — bare `YAML.parse` is not the
product entry point (`parseWorkflowYaml` adds the FIX-P0-04/06/09/
12/13 rules), and the probe only compares TriggerIR (trigger mode)
and the job list (jobs mode), so a difference in an ignored key's
*value* is invisible and only parse status / `on:` / `jobs:`
content matter. Two parser-level "divergences" turned out to be
MATCH end-to-end and are NOT residuals: `? : 1` and `: 1` (PyYAML's
scanner rejects both, but the TypeScript side's
`hasUnrepresentableKey` rejects them too — both `yaml_parse_error`).

## The discriminant

The classification fires only when ALL of the following hold
(derived shape by shape from the mapping; each condition is pinned
by a control that would break if it were dropped):

1. **Loaded doc is exactly `{'' : <value>}`** — a dict with a single
   key, the empty string. Multi-pair anchored-empty-key documents
   never reach here (`_StrictBaseLoader` rejects the duplicate `''`
   key; `_reject_anchored_empty_key` rejects them first), and a
   first-pair-null anchored key followed by real pairs
   (`&x:\nname: probe`) keeps its real keys, so it is excluded.
2. **Token skeleton is exactly one single-pair block mapping** —
   StreamStart, optional DocumentStart, BlockMappingStart, KeyToken,
   AnchorToken, ValueToken, \<value\>, BlockEnd, optional
   DocumentEnd, StreamEnd. This is what excludes the quoted empty
   key `"": 1` / `'': 1`: its key token is a ScalarToken, not an
   AnchorToken, so the rule never fires on it and its MATCH
   (`missing_on_key` both sides) is preserved.
3. **No tag between the KeyToken and the AnchorToken.** `!foo &x: 1`
   / `!!str &x: 1` are rejected on the TypeScript side by
   `hasRejectedAnchorOrTag` (E05: an anchor after another property
   is in value position), so the Oracle must keep returning
   `missing_on_key` there — those shapes stay disclosed residuals.
   A tag on the VALUE (`&x: !foo 1`, `&x: !foo [1]`) is fine and
   fires (the `yaml` package renders the tagged node).
4. **The anchor is glued to the colon** (AnchorToken.end ==
   ValueToken.start). `&x : 1` with a space renders as a mapping
   in the `yaml` package and is rejected on the TypeScript side by
   `hasUnrepresentableKey` — the token sequences of `&x: 1` and
   `&x : 1` are identical, so only the mark positions distinguish
   them. That shape stays a disclosed residual.
5. **The value is manifestly a non-mapping node at token level.**
   After skipping any TagTokens on the value, the first token must
   be a ScalarToken, a Block/FlowSequenceStartToken, or nothing
   (null value). A mapping value (Block/FlowMappingStart) does NOT
   fire: the `yaml` package renders it as a mapping, so the two
   sides already agree (`missing_on_key`, or VALID when the value
   contains `on` — those shapes stay disclosed residuals). An
   AnchorToken as the first value token does NOT fire either: the
   `yaml` package rejects a second anchor on the value node
   ("A node can have at most one anchor"), so the TypeScript side
   returns `yaml_parse_error` there.

## Results

57 rows × 2 modes = 114 checks: **103/114 MATCH**, the other 11
checks are the 11 flagged `known_divergence` rows (trigger mode
only; jobs MATCH on every row). Runner exit 0.

## §7 Residuals (11 rows / 11 checks, trigger mode only — NOT fixed)

All 11 are lone-doc anchored-empty-key shapes where classification
to `workflow_root_not_mapping` would be the WRONG code (the
TypeScript side says VALID or `yaml_parse_error`, not
`workflow_root_not_mapping`), so no classification rule can close
them. They are disclosed exactly; R14 grades them independently.

1. **Mapping value containing `on` — TS VALID vs Oracle
   `missing_on_key` (3 checks):** `a-flowmap-on` (`&x: {on: push}`),
   `a-blockmap-on` (`&x:\n  on: push`), `x-tag-map-on`
   (`&x: !foo {on: push}`). The `yaml` package renders the value
   mapping as the document, so the TypeScript side sees a real
   workflow trigger. Closing these would need the Oracle to unwrap
   the anchored-empty-key pair and treat its value as the document
   (in BOTH `parse_workflow_yaml` and `extract_jobs`, since a
   `jobs:` value would diverge in jobs mode too) — a new
   "unwrap" semantic, not a classification, and outside the R13 §12
   direction. Left as residuals.
2. **Second anchor on the value node — TS `yaml_parse_error` vs
   Oracle `missing_on_key` (3 checks):** `a-anchor-val`
   (`&x: &y 1`), `x-anchor-seq` (`&x: &y [1]`), `x-anchor-null`
   (`&x: &y`). The `yaml` package rejects "A node can have at
   most one anchor". Closing these would need an Oracle-side
   rejection rule mirroring that `yaml`-package error (a new
   `_reject_*` rule), not a classification. Left as residuals.
3. **Tag on the key — TS `yaml_parse_error` vs Oracle
   `missing_on_key` (3 checks):** `a-tag-key` (`!foo &x: 1`),
   `a-handle-key` (`!!str &x: 1`), `x-docmark-tagkey`
   (`---\n!foo &x: 1`). The TypeScript side rejects these via
   `hasRejectedAnchorOrTag` (E05). Closing these would need an
   Oracle-side rejection rule mirroring E05 for the lone-doc
   position. Left as residuals.
4. **Unglued anchor-colon — TS `yaml_parse_error` vs Oracle
   `missing_on_key` (1 check):** `a-unglued` (`&x : 1`). The
   TypeScript side rejects it via `hasUnrepresentableKey`.
   Closing it would need an Oracle-side rejection rule mirroring
   that. Left as a residual.
5. **Nested block-map value with an anchored key — TS
   `yaml_parse_error` vs Oracle `missing_on_key` (1 check):**
   `x-nested-block` (`&x:\n  &y: 1`). The `yaml` package rejects
   it ("A node can have at most one anchor" at line 2). The
   flow-map twin `x-nested-flow` (`&x: {&y: 1}`) MATCHES
   (`missing_on_key` both sides) and is NOT a residual. Left as
   a residual.

## Files

- `map-p0-14.py` — parser-level parallel mapping (npm vs PyYAML
  `_StrictBaseLoader` + token dump), groups A (30) + B (15).
- `map2-p0-14.py` — end-to-end mapping of the same 45 shapes
  (TS bundle + Oracle drivers, full JSON compare).
- `map3-p0-14.py` — extra boundary round (12 shapes).
- `gen-cases.py` — generates `cases.json` from the three grids.
- `cases.json` — 57 rows (11 flagged `known_divergence`).
- `run-matrix.py` — matrix runner (exit 0 iff every check matches
  except flagged rows).
- `results.json` — runner output (103/114 MATCH, 11 flagged DIFF).
- `ts-probe-entry.ts` — esbuild entry for the TS side of the probe.
