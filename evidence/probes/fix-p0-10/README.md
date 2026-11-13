# FIX-P0-10 probe matrix — flow-collection continuation not indented beyond its block context (T013 R9 grouped P0 / R4+R5)

## What diverged

The TypeScript `yaml` package rejects a flow collection (mapping or
sequence) in a block collection when any continuation line is
indented less than or equal to the innermost enclosing block
collection — "Flow map in block collection must be sufficiently
indented" — while PyYAML accepts any indent. R9 graded the R4/R5
residuals P0 (grouped, 1 item): 13 shapes probed, 26 checks,
**18 DIFF** (the fixer's 6 + 12 widening: nested, `on:` slot,
`jobs:`/`env:`, single-quote variants). The divergence is in the
parser itself (`parse()` rejects), so only the Oracle side can fix
it.

## Threshold (derived from this matrix)

A continuation line's leading spaces must **strictly exceed the
innermost block-collection indent** — the same threshold family
FIX-P0-08 derived for quoted scalars, now shown to govern *every*
flow-continuation token:

| Dimension | Threshold (continuation indent must be strictly greater than) |
|---|---|
| Mapping value | the mapping's indent, i.e. the key indent (`m: {…}` → 1+; `jobs: test: env:` at key indent 4 → 5+; `with: m:` at key indent 10 → 11+) |
| Sequence item | the sequence's indent, i.e. the `-` indent (`- {…}` at dash 6 → 7+) |
| Flow start line | NOT the threshold (`m:\n  {a: 1,\n  b: 2}` accepts: continuation 2 exceeds block indent 0 although it equals the flow start line's indent) |
| Every continuation token | comma (R4), explicit-key `:` (R5), key, value, first item, plain-scalar continuation, nested flow start, anchor/tag — in flow maps and flow sequences alike, in extra keys, `on:`, `jobs:`/`env:`, `branches:` alike |
| Closing line | a line that only closes a flow collection (`}` / `]` alone) is exempt at any indent — but any other token on that line is still checked (`}, b: 2` at indent 0 rejects) |
| Blank / comment lines | skipped (they carry no token; PyYAML discards comments) |
| Scalar spans | a plain or quoted scalar spanning lines is checked on every line it spans (for quoted scalars this coincides exactly with `_reject_underindented_multiline_quoted_scalar`) |
| Document root | a flow collection at the document root has no enclosing block collection and is never rejected (the `yaml` package ignores indent for top-level flow collections) |

## Matrix contents (157 rows × trigger+jobs = 314 checks)

- Round 1 (132 rows): R4 comma continuations and R5 explicit-key
  colon continuations across indents 0–6, nested, `on:`,
  `jobs:`/`env:`, deep `with:`, block-sequence items, plus adjacent
  shapes — key/value/first-item on the next line, plain-scalar
  continuations, flow sequences, blank/comment lines,
  closing-brace-only lines, quoted-value continuations, flow on the
  line after a bare key, tab, document-root flow maps, explicit
  block keys.
- Round 2 (25 rows): edge shapes — inner flow close followed by
  outer content on the same line, nested flow starts on a
  continuation line, flow sequences in `on:` and `branches:`,
  quoted-scalar values starting on a continuation line, anchors,
  document-root block sequences, flow maps as explicit block keys.

Before the fix the matrix measured 74 DIFF cases (60 round-1 +
14 round-2), i.e. **148/314 checks** — every one of them
TS-rejects / Oracle-accepts, except two both-INVALID-different-
error rows (R4-ON and the document-root block-sequence comma).
After the fix: **314/314 MATCH**.

## The fix

Oracle-side only (`oracle/checkpath_oracle/parser.py`,
`_reject_underindented_flow_continuation`, same family as
`_reject_adjacent_alias_colon` and
`_reject_underindented_multiline_quoted_scalar`): on the PyYAML
token stream, every non-flow-end token inside a flow collection on
a continuation line must sit on a line indented strictly more than
the innermost enclosing block collection; scalar tokens are
additionally checked on every line they span. Raises
`yaml.YAMLError`, mapped onto the existing `yaml_parse_error`
path by both callers. `src/` untouched. See
`handoff/P020-FIX-P0-10/TASK_REPORT.md`.

## P2-R9-1 correction (count text)

The FIX-P0-09 report's `expected.json` count text ("25 INVALID /
13 VALID") was wrong; the per-side count is **27 INVALID /
11 VALID** (f01–f10 10/0, f11–f19 9/0, f20–f28 1/8, f29–f38 7/3;
both sides 38/38 agree). The fixture data itself was correct and
is untouched; only the report text was wrong. Recorded here so the
correction is not lost.

## How to re-run

    python3 evidence/probes/fix-p0-10/run-matrix.py

Builds the TypeScript probe bundle from the repo source with
esbuild (into a temp dir), runs the TS bundle and the Oracle probe
drivers on the same YAML per row, and deep-compares the full JSON
(whole TriggerIR in trigger mode, whole job list in jobs mode).
Writes `results.json` in this directory (deterministic; a re-run
on the same tree reproduces it byte-for-byte) and exits non-zero
unless every check matches.
