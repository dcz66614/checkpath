# FIX-P0-15 probe evidence (T013 R14 5 P0 families)

Fix round for the 11 residual rows from FIX-P0-14, graded by the
T013 R14 independent review (`evidence/review/INDEPENDENT_REVIEW_R14.md`,
§2) as 5 P0 families (11 checks, trigger mode; jobs mode MATCH for
the 11). All 11 are now closed — the matrix below has them UN-flagged
(they must MATCH). 6 rows are flagged `known_divergence` (§7): shapes
this round deliberately does NOT close.

## The 5 families and their fixes (all Oracle-side, `oracle/checkpath_oracle/parser.py`)

- **(a) P0-1 — mapping value contains `on`** (`a-flowmap-on`,
  `a-blockmap-on`, `x-tag-map-on`): the `yaml` package renders a lone
  `&x: {on: push}` document as the mapping `{on: push}` itself, while
  PyYAML renders it as the 1-pair mapping `{'': {on: push}}`.
  Fix: `_unwrap_lone_anchored_empty_key_doc` — the same token walk as
  `_is_lone_anchored_empty_key_doc` conditions 1–4, with condition 5
  inverted (the value IS a mapping at token level). Wired into BOTH
  `parse_workflow_yaml` (the `on` logic) and `extract_jobs` (a value
  containing `jobs:` also diverges in jobs mode, verified E2E).
  A known tag such as `!!str` on the value mapping makes the loader
  construct a string, so the value mapping's own token span is
  re-parsed. A self-alias inside the value span (`&x: {on: *x}`)
  raises `yaml.YAMLError`.
- **(b) P0-2 — value node's second anchor** (`a-anchor-val`,
  `x-anchor-seq`, `x-anchor-null`): mirrors the `yaml` package's
  "at most one anchor" rejection. Fix:
  `_reject_second_anchor_on_value` — KeyToken, AnchorToken,
  ValueToken (glued) whose value node's first token (after skipping
  tags) is an AnchorToken or an AliasToken. Not position-scoped
  (block-seq items too). An anchored non-empty key (`&x k: &y 1`)
  is excluded (the first anchor must be immediately followed by the
  value colon) and keeps MATCHING.
- **(c) P0-3 — key with tag** (`a-tag-key`, `a-handle-key`,
  `x-docmark-tagkey`): mirrors E05 (`hasRejectedAnchorOrTag`). Fix:
  `_reject_tagged_anchored_empty_key` — KeyToken, TagToken+,
  AnchorToken, ValueToken with the anchor GLUED. The glued
  requirement is load-bearing: `!foo &x : 1` (a space before the
  colon) is accepted on both sides. Fires in every position
  (lone / nested / flow / block-seq); multi-pair block mappings
  are already covered by C3 (same error code).
- **(d) P0-4 — unglued anchor-colon** (`a-unglued`): mirrors
  `hasUnrepresentableKey`. Fix:
  `_reject_unglued_anchored_empty_key` — KeyToken, [TagToken]*,
  AnchorToken, ValueToken with the anchor UNGLUED. Untagged fires
  everywhere; tagged fires ONLY as the first pair of a block
  mapping that is the VALUE of a pair (`m:\n  !foo &x : 1`) — the
  `yaml` package renders a tagged unglued key as the empty string
  `""` (with tag+anchor attached) in every other position, so
  `hasUnrepresentableKey` (which needs a null value) does not fire
  there. See `rule-probe.ts` + `ast-dump.ts` for the mechanism
  (AST dumps of the key node's value/tag/range per position).
- **(e) P0-5 — nested block-mapping value with anchored key**
  (`x-nested-block`): mirrors the "at most one anchor" rejection
  in NESTED block mapping. Fix:
  `_reject_anchored_nested_block_mapping` — a block mapping node
  M conflicts iff (1) M carries an anchor (value of a GLUED
  anchored-empty-key pair, or an AnchorToken immediately before M)
  AND (2) M's FIRST pair is a GLUED anchored empty key.
  Block-context only (the flow twin `&x: {&y: 1}` keeps MATCHING);
  depth-independent; two-pair nested variants are already covered
  by C3.

## Files

- `map-p0-15.py` — parser-level parallel mapping (npm `yaml` vs
  PyYAML `_StrictBaseLoader` + token dump), 6 groups (a–f, 96 shapes).
- `map2-p0-15.py` — end-to-end mapping (TS bundle + Oracle probe
  drivers, full JSON compare), all groups. **0 DIFF after the fix.**
- `map3-p0-15.py` — supplementary parser-level round (22 shapes:
  alias-with-property, (e) scope edges, (b) scope edges, unwrap
  edges, (c)/(d) flow positions).
- `map4-p0-15.py` — supplementary end-to-end round (18 shapes).
  After the fix, 1 DIFF remains: `x-tag-unglued-2nd-root` (the C3
  over-fire, §7).
- `map5-p0-15.py` — final boundary round, end-to-end (12 shapes:
  (c) flow positions, (d) tagged condition, C3 over-fire shapes).
  After the fix, 2 DIFFs remain: the two C3 over-fire rows (§7).
- `map6-p0-15.py` — `!!str` / known-tag round, end-to-end
  (10 shapes). After the fix, 4 DIFFs remain: the two no-space
  `!!str` rows and the two `!!int` / `!!bool` crash rows (§7).
- `rule-probe.ts` / `ast-dump.ts` — run the five TS-side rejection
  rules individually / dump the `yaml`-package AST (key node type,
  value, tag, range, anchor) for one YAML file. Used to pin the
  (d) tagged condition and the C3 over-fire mechanism.
- `gen-cases.py` — builds `cases.json` (130 rows) from the mapping
  grids. `cases.json` — the matrix. `run-matrix.py` — re-runs it
  (TS bundle + Oracle probe drivers, full JSON deep-equal).
  `results.json` — the run: **249/260 MATCH**, exit 0, 0 unflagged
  DIFFs. `ts-probe-entry.ts` — the TS probe entry (copied from
  fix-p0-13).
- `gen-fixtures.py` — generates the 20 vitest fixtures under
  `tests/fixtures/parser-divergence/lone-anchored-empty-key-p0-15/`
  (+ `expected.json`), asserting both sides agree before writing.

## How to re-run

```bash
python3 evidence/probes/fix-p0-15/run-matrix.py   # 249/260, exit 0
python3 evidence/probes/fix-p0-15/map2-p0-15.py all
python3 evidence/probes/fix-p0-15/map4-p0-15.py
python3 evidence/probes/fix-p0-15/map5-p0-15.py
python3 evidence/probes/fix-p0-15/map6-p0-15.py
npx vitest run tests/unit/diff-boundaries/lone-anchored-empty-key-p0-15.test.ts
```

## §7 — disclosed residuals (NOT fixed here)

1. **C3 over-fire on tagged + unglued anchored empty keys in
   second-or-later position** (2 rows, 4 checks: trigger + jobs).
   `a: 1\n!foo &x : 2\non: push\njobs: {...}` and the nested
   variant `m:\n  a: 1\n  !foo &x : 2\n...`: TS VALID / [1 job],
   Oracle `yaml_parse_error` / []. The `yaml` package accepts the
   shape (a tagged empty key is explicit, not implicit; E05 does
   not fire because the anchor is not followed by `:`; and
   `hasUnrepresentableKey` does not fire because the key node
   carries the tag and renders as `""`), but C3
   (`_reject_anchored_empty_key`) walks back over tags and fires
   on any anchored empty key in a ≥2-pair block mapping. The
   narrowing (skip C3 when the key carries a tag AND is unglued
   AND is not the first pair) is a change to a rule FIX-P0-13 /
   R13 verified — it deserves its own review round with a
   dedicated boundary re-verification, so it is disclosed here,
   not fixed here.
2. **No-space `&x:!!str` scanner-level divergences** (2 rows).
   `&x:!!str {on: push}`: TS VALID, Oracle `missing_on_key`
   (PyYAML does not see the `:` as a value indicator when it is
   followed by `!` — it scans a plain-scalar key `':!!str {on'`).
   `&x:!!str\n  on: push\n  jobs: {...}`: TS VALID, Oracle
   `yaml_parse_error` (PyYAML ScannerError, "mapping values are
   not allowed here"). Both are scanner-level: the token walk
   never sees the lone-doc pattern. Closing them would need a
   text-level scanner mirror, a different mechanism class from
   this round's token rules.
3. **`!!int` / `!!bool` (and `!!float`) on a mapping or sequence
   value crash the Oracle** (2 rows, 4 checks; the probe drivers
   themselves raise). `&x: !!int {on: push}` and
   `&x: !!bool {on: push}`: TS VALID, Oracle raises a raw
   `TypeError` (`int() can't convert non-string with explicit
   base` / `unhashable type: 'list'`) — `_StrictBaseLoader`'s
   constructor raises a non-`yaml.YAMLError` exception, which
   neither `parse_workflow_yaml` nor `extract_jobs` catches (they
   catch only `yaml.YAMLError`). Verified position-independent:
   `m: !!int {a: 1}` and `m: !!int [1, 2]` also crash (TS VALID);
   `m: !!float {a: 1}` raises `AttributeError`. `!!str` does NOT
   crash (it constructs the node's repr string) — that is why the
   (a) span re-parse handles it. Fixing this properly needs
   mapping the `!!<type>`-on-collection boundary and deciding the
   error mapping (a bare `except` → `yaml_parse_error` alone would
   still DIFF against TS VALID); it is a pre-existing Oracle
   robustness gap, not one of the 5 families.
