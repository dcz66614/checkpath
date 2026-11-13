# FIX-P0-11 probe matrix — standalone comment lines in flow mappings (R10 R6)

## What this is

The probe matrix for FIX-P0-11 (T013 R10 grouped P0, R6): a standalone
comment line at indent 0 inside a flow mapping, after a complete
`key: value` pair, is rejected by the TypeScript `yaml` package
("Comments must be separated from other tokens by white space
characters") but accepted by the Reference Oracle (PyYAML), so the
Oracle returned VALID where the TypeScript side returned INVALID /
`yaml_parse_error`. 5 shapes × 2 modes = 10 checks DIFF in the R10
review (`evidence/probes/r10/`), including the core `on:` slot.

The fix is Oracle-side only (`oracle/checkpath_oracle/parser.py`,
`src/` 0 changes): a new rule `_reject_unseparated_comment_in_flow`
plus a narrowing of the flow-end exemption in
`_reject_underindented_flow_continuation` (FIX-P0-10). See
`handoff/P020-FIX-P0-11/TASK_REPORT.md` for the full report.

## Method

Discovery was parser-level parallel mapping (`node YAML.parse` vs
PyYAML `safe_load` on bare fragments), 56 + 30 + 16 + 18 + 10 + 10
shapes across six rounds; every live divergence was then confirmed
end-to-end (TS bundle + Oracle drivers, full-JSON compare) before
fixing, because parser-level mapping can mislead — bare `YAML.parse`
is not the product entry point (`parseWorkflowYaml` adds the
FIX-P0-04/06/09 rules). Two parser-level "divergences" turned out
to be MATCH end-to-end and are NOT residuals: tab-indented comments
(TS-side FIX-P0-06 tab rule + PyYAML tab scanner error, both reject)
and `,#c` followed by a comma line in a flow sequence (both reject,
different errors).

## The rule (T1 — R6)

A standalone comment line at indent 0 inside a flow MAPPING, directly
after a complete `key: value` pair, is rejected. Mechanism (from the
`yaml` package source): in a flow mapping the newline after a complete
scalar value is consumed as that value's `<end>`, so the comment
becomes the FIRST token in the next item's `start` props with no
space/newline before it, and `resolveProps` (called with
`startOnNewline: false` for flow collections) errors.

- **Comment indent is the ONLY deciding dimension**: indent 0 rejects,
  indent >= 1 accepts, whatever the enclosing block indent (top-level
  `m:`, nested `m:` at key indent 2, `jobs:`/`env:` at 4, deep `with:`
  at 10, block-sequence item at dash 6, document root). The FIX-P0-10
  "must exceed the block indent" threshold does NOT apply here.
- **Previous line decides**: a complete pair rejects (plain / quoted /
  multi-line quoted / anchor / tag / alias value, a nested flow closed
  on that line, a flow sequence closed on that line); after a trailing
  comma, after a bare key, after a `:` with the value on the next line,
  after a flow start (`{` / nested `{`), after an anchor/tag with the
  value still pending, after an explicit `?` alone, and after the
  flow's first item — all accept.
- **Inside a flow SEQUENCE the comment attaches to the value's `<end>`**
  and accepts, so only flow mappings reject. A flow map inside a flow
  sequence rejects; a flow sequence inside a flow map accepts.
- **A blank line between the pair and the comment accepts** (the blank
  line's newline lands in the next item's `start` first, so `hasSpace`
  is already true) — and a blank line anywhere in the scan-back over
  comment-only lines breaks the chain the same way. Trailing spaces
  after the pair do NOT save the comment. CRLF line endings behave
  identically.
- PyYAML's token stream discards comments entirely, so this rule needs
  NEW raw-line scanning (scan the source text lines within the flow
  mapping's span; the token stream is still used for the flow stack,
  the scalar spans, and the last-token role test).

## The inline family (T2 — found while mapping R6)

A comment that starts immediately (same line, no space/newline) after
one of `,` `{` `}` `[` `]` inside a flow collection is rejected
(`m: {a: 1,#c\n b: 2}`, `m: {a: 1,#c\n}`, `m: [a,#c\n]`,
`m: {#c\n a: 1}`, `m: {a: 1}#c` — same error, same `hasSpace=false`
mechanism). A space after the token accepts, and a comment after `:`
or `?` with no space accepts, so only `,{}[]` trigger. A `#` inside
a quoted or plain scalar (`"x,#y"`, `x#y`) is scalar content, not a
comment; a `#` after a block-level `,` / `{` (`a: b,#c` — the `,` is
inside the plain scalar) never triggers.

## The close-line narrowing (found while mapping R6)

FIX-P0-10's exemption ("a line that only closes a flow collection is
exempt at any indent") is too broad. The `yaml` package lexer's
`atFlowEndMarker` exemption is: indent == indentNext - 1 (== the
block indent) AND flowLevel == 1 (outermost flow only). So an INNER
close at indent <= block indent (`m: {n: {a: 1\n}\n , b: 2}`,
flowLevel 2) or an OUTER close BELOW the block indent
(`x:\n  m: {a: 1\n}`, close 0 < block 2) both error in the `yaml`
package while PyYAML accepts them. The narrowing is in the same
function (`_reject_underindented_flow_continuation`): a flow-end token
is exempt only when it closes the outermost flow AND is the first
token on its line AND its line indent equals the innermost block
indent; otherwise it is checked like any other continuation token.
The fix-p0-10 matrix's close rows (outer close at block indent 0,
indents 0/1/2) are unchanged by the narrowing.

## Results

```
CHECKS 248/248 MATCH (of which 0 checks are flagged known-divergence)
```

248 of 248 checks MATCH. The 8 rows formerly flagged
`known_divergence` (see §7 below) were closed by FIX-P0-12
(`hasRejectedAnchorOrTag` in `src/core/workflow-parser.ts` for the
`&x#c` / `!!str#c` reverse divergences; S1 narrowing to `:`-bearing
keys for the null-value multi-line keys) and their flags were
cleared by FIX-P0-13 (P2-R12-1) after re-running this matrix at the
FIX-P0-13 code-commit HEAD and confirming all 8 rows MATCH in both
modes. Every row MATCHes, including all 5 R6 core shapes (10
checks), all comment-indent / previous-line / close-line boundaries,
the whole inline family, and all controls. Re-run with:

```
python3 evidence/probes/fix-p0-11/run-matrix.py   # exit 0
```

`results.json` in this directory is the full per-row record
(deterministic, no timestamps). Two rows are bare flow-map documents
rather than workflows (`ind-root-c0/c1`: a root flow map cannot carry
the workflow tail; the graded comparison is still TS-vs-Oracle on
identical input). The document-root block-sequence variant
(`- {a: 1\n# note\n , b: 2}`) was probed at parser level only
(round-2: comment 0 rejects, 1 accepts) because a root block sequence
cannot be a workflow; the dash-6 block-sequence rows cover the same
rule inside a workflow.

## §7 — residuals (formerly flagged `known_divergence` — RESOLVED)

> **Resolved by FIX-P0-12, flags cleared by FIX-P0-13 (P2-R12-1).**
> This matrix now reports 248/248 MATCH with 0 flagged checks.
> The rows below are kept as history of what was residual in the
> FIX-P0-11 round.

1. **Reverse divergences, `&x#c` / `!!str#c`** (`res-anchor-nospace`,
   `res-tag-nospace`; 2 shapes × 2 modes = 4 checks): the `yaml`
   package ACCEPTS a comment glued to an anchor/tag name, PyYAML
   REJECTS it (anchor/tag scanner error), so the Oracle returns
   INVALID where the TypeScript side returns VALID. Unfixable
   Oracle-side (PyYAML's scanner rejects; no input surgery, no
   parser swap). Fixable only with a TS-side rule in the FIX-P0-06
   style (reject what PyYAML rejects) — a `src/` change, out of
   scope for this Oracle-side round.
2. **TS-side FIX-P0-09 S1 over-reach on null-value multi-line keys**
   (`res-null-ml-plain`, `res-null-ml-quoted`, `res-null-ml-hash`,
   `res-null-ml-plain-comma`, `res-null-ml-plain-nested`,
   `inl-key-comma-nospace`; 6 shapes × 2 modes = 12 checks): the
   `yaml` package ACCEPTS a null-value multi-line key in a flow
   mapping, PyYAML ACCEPTS it too, but the TS-side
   `hasMultilineFlowKey` S1 rule fires on ANY key spanning a newline
   (its empirical basis is only keys WITH a `:` separator and a
   value), so the TypeScript side returns INVALID where the Oracle
   returns VALID. Note `res-null-ml-hash` / `inl-key-comma-nospace`
   (`a:#c`, `b:#c`): the `#` is inside the plain scalar key
   (`a:#c 1`, `b:#c 2`), not a comment at all. Fixable only by
   narrowing S1 to keys with a `:` separator/value — a `src/`
   change, out of scope for this Oracle-side round. Deliberately
   NOT papered over with an Oracle-side rejection: the Oracle
   should not reject valid YAML its own parser accepts merely to
   match a TS-side rule that is itself over-broad.

## Files

- `cases.json` — 124 cases (mode `both` = trigger + jobs), 248 checks.
- `run-matrix.py` — the runner (esbuild bundle + both probe drivers,
  full-JSON deep-equal, exit 0 unless an unflagged row differs).
- `results.json` — the run record for the committed code.
- `ts-probe-entry.ts` — the TS probe entry (same as fix-p0-10's).
