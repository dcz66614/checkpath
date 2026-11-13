# Quoted scalar inside a plain scalar — divergence FIXED by FIX-P0-07 (T013 R6 P0)

## Status (FIX-P0-07)

**FIXED — the divergence below no longer exists.** T013 R6 (reviewing
commit `baf881f`) found a new grouped P0: a tab inside quotes that
appear mid-line while a plain scalar is in progress. `run: echo "a<TAB>b"`
is a plain scalar (`echo ...`) whose `"` is a literal character, so the
tab is a tab inside a plain scalar and PyYAML rejects it (INVALID /
`yaml_parse_error`). FIX-P0-06's `hasRejectedTab` treated any `"`/`'`
after a space as a quote start and let the tab through (TS VALID vs
Oracle INVALID) — four shapes, V1/V2/V5/V9:

- V1: `steps: - run: echo "a<TAB>b"` (double quotes)
- V2: `steps: - run: echo 'a<TAB>b'` (single quotes)
- V5: `name: some long` + continuation `  "a<TAB>b" tail` (quote at
  the start of a multi-line plain scalar's continuation line)
- V9: V1 + trailing comment `# c`

FIX-P0-07 aligns the TypeScript side with the Oracle side: `hasRejectedTab`
(`src/core/workflow-parser.ts`) now tracks "plain scalar in progress"
across lines and only treats `"`/`'` as a quote start where no plain
scalar has started on the line (value-start positions: after `:`,
`[`/`{`/`,`, `-`, line start; multi-line plain scalar continuations do
not reset the state). The Oracle parser is untouched.

## The rule

A quote starts a quoted scalar only where a scalar can start — never
while a plain scalar is in progress:

- Rejected on both sides after the fix (all INVALID / `yaml_parse_error`,
  events `[]`, jobs `[]`): tabs inside quotes that sit inside a plain
  scalar — in a `run:` value (f01, f02, f04), after an anchor (f05), in
  a flow plain scalar (f06, f11), in a plain job key (f07), on a plain
  scalar's continuation line (f03, f09, f10), and in a value written on
  the line after a bare `key:` (f08).
- Deliberately NOT rejected (both sides already agree — the rule must
  not expand into it): a tab inside a genuinely quoted scalar (f12,
  continuation line indented deeper than the block context — VALID,
  event `push`, one job). See also the fix-p0-07 probe matrix
  (`evidence/probes/fix-p0-07/`), which locks the V3/V4 true quoted
  scalars, V6/V7/V8, TAB-COMMENT, TAB-BLOCK, Q1, Q3, and the
  `? {a: b} : 1` boundary shapes as MATCH.

## Known residual (NOT fixed here)

The `yaml` npm package rejects a multi-line quoted scalar whose
continuation line is indented at or below the block context indent
(`run: "a\nb\tc"` with the continuation at indent 0, or `- run: "a`
with the continuation at indent ≤ 8 = the `run` key indent), while
PyYAML accepts any indent — and the divergence exists even WITHOUT any
tab. That is parser leniency in the `yaml` package, not `hasRejectedTab`
(`hasRejectedTab` correctly returns false for these shapes), so it is
out of scope for FIX-P0-07. It is flagged as known divergence in
`evidence/probes/fix-p0-07/cases.json` (RESID-MULTILINE-QUOTED-UNINDENTED-DQ/SQ)
and listed in `handoff/P020-FIX-P0-07/TASK_REPORT.md` §7. A follow-up
fix (parser-level) is a parent decision before T013 R7.
