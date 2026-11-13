# Multi-line-key null-value YAML — divergence FIXED by FIX-P0-12 (T013 R11 grouped P0-B)

## Status (FIX-P0-12)

**FIXED — the divergence below no longer exists.** T013 R11 found
FIX-P0-09's S1 rejected null-value multi-line keys (`m: {a\n b}`)
that both parsers accept, so the TypeScript side said INVALID
where the Oracle said VALID (16 checks in R11's probe).

FIX-P0-12 narrows S1 in `hasMultilineFlowKey`
(`src/core/workflow-parser.ts`): the walk now also requires
`colonSeparatorAfter` — a `:` separator after the key. The Oracle
parser is untouched, and deliberately NOT used to mask the
over-broad rule.

## The rule

The discriminator is **"colon present", NOT "value non-null"**:

- A multi-line key with NO colon (`m: {a\n b}`,
  `m: {"a\n b"}`, `m: {'a\n b'}`, `m: {a\n b, c: 1}`, nested,
  CRLF) is accepted by both parsers — S1 must not fire.
- A multi-line key WITH a colon is still rejected, even with a
  null value (`m: {a\n b: }`, `m: {a\n: }`, `m: {"a\n b": }`,
  `m: {a\n b:\n}`) — PyYAML rejects those, and S1's intended
  target (valued multi-line keys: `m: {a\n b: 1}`) stays closed.
- The colon scan skips whitespace, newlines and comments
  (`m: {a\n b: # comment\n 1}` still rejects;
  `m: {a\n b # c\n: 1}` still rejects).

All 12 cases in this directory are parity-locked (TS and Oracle
agree on status / errors / events). See ADR FIX-P0-12 in
handoff/P020-FIX-P0-12/TASK_REPORT.md and
evidence/probes/fix-p0-12/ for the full 243-row probe matrix.
