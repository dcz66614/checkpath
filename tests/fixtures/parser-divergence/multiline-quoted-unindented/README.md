# Unindented multi-line quoted scalar continuation — divergence FIXED by FIX-P0-08 (T013 R7 grouped P0 / RESID)

## Status (FIX-P0-08)

**FIXED — the divergence below no longer exists.** T013 R7 (reviewing
commit `b6e2f2b`) graded RESID as a grouped P0: the `yaml` npm package
rejects a multi-line quoted scalar whose continuation line is indented
less than or equal to its block context (`Missing closing "quote`),
while PyYAML accepts any indent — so the Oracle returned VALID where
the TypeScript side returned INVALID / `yaml_parse_error`. The
divergence does not need a tab (`run: "a\nb c"` with an unindented
continuation diverges too); it is in the parser itself, so no
TypeScript-side rule can fix it.

FIX-P0-08 aligns the Oracle side with the TypeScript side:
`_reject_underindented_multiline_quoted_scalar`
(`oracle/checkpath_oracle/parser.py`, called by both `yaml.load` call
sites next to `_reject_adjacent_alias_colon`) rejects the same shapes
through the existing `yaml_parse_error` path. The TypeScript product
code is untouched (`src/` diff = 0).

## The rule (derived by probing the `yaml` package over 239 mapping cases)

For every quoted scalar spanning more than one line, **every
continuation line must be indented strictly more than the innermost
enclosing block collection**:

- a mapping value: the mapping's indent, i.e. the key indent
  (0: continuation 0 rejects, 1+ accepts; 2: ≤2 / 3+; 4: ≤4 / 5+;
  6: ≤6 / 7+; 8: ≤8 / 9+ — R7's 8/9 is the key-indent-8 instance);
- a sequence item: the sequence's indent, i.e. the `-` indent
  (dash 2: ≤2 rejects, 3+ accepts; dash 0: 0 rejects, 1+);
- a flow-collection item: the enclosing block context's indent
  (`m: {k: ...}`: >0; `branches: [...]` at key indent 4: 4 rejects,
  5+ accepts — flow nesting itself adds nothing);
- a value written on the line after a bare `key:`: the key indent.
- Every continuation line decides (9-then-0 rejects, 9-then-9
  accepts); the line carrying the closing quote counts (closing
  quote at indent 0 rejects, at 9 accepts).
- A line that is empty or contains only spaces is skipped (the
  `yaml` package treats it as blank); a line containing a tab is
  NOT blank — a tab-only line rejects (its leading-space count is
  0), and a tab terminates the leading-space count of its line
  (9 spaces + tab accepts, tab at column 0 rejects).
- Double and single quotes behave identically; tab content inside
  the scalar is irrelevant; anchors do not change it.
- A scalar at the document root has no enclosing block collection
  and is never rejected (any continuation indent accepted on both
  sides).

## Fixtures

- f01–f06: the six R7 RESID shapes (DQ, SQ, no-tab, indent 2, indent
  8, indent 9 — f06 is the VALID boundary, both accept).
- f07–f14: threshold pairs per context (reject/accept): name value
  at key indent 0, nested value at key indent 2, flow value, sequence
  item at dash indent 2.
- f15–f21: blank-line / tab-only-line / closing-quote-line /
  multi-continuation / value-on-own-line boundaries.

All 21 are locked by
`tests/unit/diff-boundaries/multiline-quoted-unindented.test.ts`
(status / errors / events / jobs, both modes, both sides) and by the
trigger suite (T6-68..T6-79) and golden suite (G-132..G-143).

## Known residual (NOT fixed by this round)

**R3 — reverse flow-key divergence.** The `yaml` package ACCEPTS a
multi-line quoted scalar used as a *key* in a flow mapping
(`on: {"a\nb": push}`, continuation indent above the block context),
while PyYAML rejects every multi-line quoted key ("mapping values
are not allowed here"). In the `on:` position both sides return
INVALID but with different error codes (`event_config_not_mapping`
vs `yaml_parse_error`, plus `on_key_is_string` / jobs differ); as an
extra key the TypeScript side returns VALID while the Oracle returns
INVALID. Only a TypeScript-side rule can close it (the Oracle cannot
make PyYAML accept); it is flagged as known-divergence in
`evidence/probes/fix-p0-08/cases.json` (6 rows, 12 checks; 8 differ,
4 match at continuation indent 0 where both sides reject) and
disclosed in the FIX-P0-08 report §7 for a separate round / R8
grading. Block mapping keys are not affected: both sides reject
them at every indent.
