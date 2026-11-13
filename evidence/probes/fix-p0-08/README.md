# FIX-P0-08 probe matrix — unindented multi-line quoted scalar continuation (T013 R7 grouped P0 / RESID)

## Result

**164/164 checks MATCH** (82 rows × trigger + jobs). Re-run on the
FIX-P0-11 tree: all 6 previously-flagged R3 rows MATCH (flags cleared,
P2-R10-1); 0 flagged checks remain. No unexpected divergence:
`run-matrix.py` exits 0.

- Unflagged checks: **164/164 MATCH**.
- Flagged known-divergence checks: 0 (was 12 — 6 R3 rows × 2 modes;
  8 differed, 4 matched — before FIX-P0-09 closed R3).

## What was mapped

The `yaml` npm package's accept/reject boundary for multi-line
quoted scalars, mapped over 239 raw-parser cases (183 + 44 + 10 + 2)
before the rule was written, then re-verified here as full workflows
through the real TS + Oracle pipelines:

| Dimension | Threshold (continuation indent must be strictly greater than) |
|---|---|
| Mapping value | key indent (0→1+, 2→3+, 4→5+, 6→7+, 8→9+; R7's 8/9 is the K=8 instance) |
| Sequence item scalar | dash indent (dash 2→3+, dash 0→1+) |
| Flow-collection item | enclosing block context indent (`m: {k:…}`→1+, `branches: […]` at key indent 4→5+) |
| Value on its own line | key indent (run key 8→9+) |
| Multi-line continuations | every line decides (9-then-0 rejects, 9-then-9 accepts) |
| Closing-quote line | counts (indent 0 rejects, 9 accepts) |
| Blank / spaces-only line | skipped (not counted) |
| Tab-only line | NOT skipped (leading-space count 0 → rejects) |
| Tab in a line | terminates the leading-space count (9 spaces + tab accepts; tab at column 0 rejects) |
| Document-root scalar | no block context → never rejected |

Double and single quotes behave identically; tab content inside the
scalar is irrelevant; anchors do not change it; a CRLF document
behaves the same (blank continuation line skipped).

## The fix

`_reject_underindented_multiline_quoted_scalar` in
`oracle/checkpath_oracle/parser.py`, called by both `yaml.load` call
sites next to `_reject_adjacent_alias_colon` (FIX-P0-05 family). It
scans the PyYAML token stream, tracks the block-indent stack
(`BlockMappingStartToken` / `BlockSequenceStartToken`
`start_mark.column`, popped by `BlockEndToken`), and raises
`yaml.YAMLError` — mapped onto the existing `yaml_parse_error` path
— when a quoted scalar spanning lines has a non-blank continuation
line indented less than or equal to the innermost enclosing block
collection. No input surgery (the text is never rewritten), no
TypeScript-side change (`src/` diff = 0), no test deleted, no
comparison scope narrowed, no ignore list.

## R3 — reverse flow-key divergence (flagged, NOT fixed)

The `yaml` package ACCEPTS a multi-line quoted scalar used as a *key*
in a flow mapping while PyYAML rejects every multi-line quoted key
("mapping values are not allowed here"). Two faces, same root:

- As an extra key (`m: {"a\n b": 1}`, continuation indent above the
  block context): TS VALID vs Oracle INVALID / `yaml_parse_error`.
- As the `on:` value (`on: {"a\n b": push}`): both INVALID, but TS
  says `event_config_not_mapping` (and `on_key_is_string: true`,
  jobs `[test]`) while the Oracle says `yaml_parse_error`
  (`on_key_is_string: false`, jobs `[]`).

At continuation indent 0 both sides reject (the flow collection
cannot span to an unindented line), so `flowkey-ind0` and
`flowkey-nested-ind0` MATCH. Only a TypeScript-side rule can close
R3 (the Oracle cannot make PyYAML accept); it is disclosed in the
FIX-P0-08 report §7 for a separate round / R8 grading. Block mapping
keys are not affected: both sides reject them at every indent
(`blockkey-*` rows MATCH).

**FIX-P0-09 update: R3 is CLOSED.** FIX-P0-09 added the TS-side
`hasMultilineFlowKey` rule, so both sides now reject multi-line flow
keys. **FIX-P0-11 update (P2-R10-1): the `known_divergence` flags
in `cases.json` were cleared, so the driver now counts 0 flagged
checks; the matrix re-runs 164/164.**

## Files

- `cases.json` — 82 rows (0 flagged; the 6 R3 rows were flagged until
  FIX-P0-11 cleared them, P2-R10-1).
- `run-matrix.py` — re-runs the matrix; exit 0 unless an unflagged
  check differs.
- `ts-probe-entry.ts` — bundles the TypeScript side (same entry as
  FIX-P0-07's probe).
- `results.json` — the run's full TS/Oracle outputs for the 8
  differing checks (matching checks recorded as `"MATCH"`).
