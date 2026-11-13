# Multi-line quoted scalar as a flow-mapping key — divergence FIXED by FIX-P0-09 (T013 R8 grouped P0 / R3)

## Status (FIX-P0-09)

**FIXED — the divergence below no longer exists.** T013 R8 (reviewing
commit `c157f41`) graded R3 as a grouped P0: the `yaml` npm package
accepts a multi-line quoted scalar as a flow-mapping key
(`m: {"a\n b": 1}`, `on: {"a\n b": push}`), while PyYAML rejects
every multi-line key in a flow mapping with a ParserError — so the
Oracle returned INVALID / `yaml_parse_error` where the TypeScript
side returned VALID (as an extra key), or INVALID with a different
error code (`event_config_not_mapping` vs `yaml_parse_error`) and a
different job list (as an `on:` value). The divergence does not need
a tab, a double quote, or a continuation indent of 1: single quotes,
plain keys folding across lines, any continuation indent > 0, and
nesting all diverge the same way. It is in the parser itself, so no
Oracle-side rule can fix it.

FIX-P0-09 aligns the TypeScript side with the Oracle side:
`hasMultilineFlowKey` (`src/core/workflow-parser.ts`, called by both
`parseWorkflowYaml` and `extractJobs` next to
`hasUnrepresentableKey`) rejects the same shapes through the existing
`yaml_parse_error` path, after `parse()` accepts. The Oracle parser
is untouched (`oracle/` diff = 0).

## The rule (derived by probing the `yaml` package AST over 34 mapping cases)

For every map with `flow === true`, for every pair, fire when the
key is NOT written with an explicit `?` indicator AND either signal
holds:

- **S1 — the key spans a newline.** The key is a scalar (PLAIN,
  QUOTE_SINGLE or QUOTE_DOUBLE) whose source slice
  (`key.range[0..1]`) contains `\n`: `m: {"a\n b": 1}`,
  `m: {'a\n b': 1}`, `m: {a\n b: 1}` (plain keys fold across lines),
  nested flow maps, flow maps inside sequences,
  `on: {"a\n b": push}`, a flow key inside the `jobs:` mapping,
  an anchored key (`{&k "a\n b": 1}`), a key with an escaped quote
  (`{"a\"b\n c": 1}`).
- **S2 — the `:` separator sits on a later line than the key
  ends.** Scan forward from the key end over spaces, tabs,
  newlines and comments; a newline crossed before the `:` means
  fire: `m: {a\n : 1}`, `m: {"a"\n : 1}`, `on: {"a"\n : push}`,
  including a comment between the key and the colon
  (`{a # c\n : 1}`, `{a\n # c\n : 1}`).

**Explicit keys are excluded from both signals** — PyYAML accepts
`?` keys spanning lines, so they must stay accepted:
`m: {? "a\n b" : 1}`, `m: {? a\n b : 1}`,
`on: {? "a\n b" : push}` (both sides INVALID /
`event_config_not_mapping` there, jobs identical), explicit keys
with a comment between `?` and the key, or between the key and
the colon. The `?` is found by scanning backwards from the key
over whitespace, newlines and comments; the first structural
character decides (`?` = explicit, `{` / `,` = ordinary pair).
Comment detection is quote-aware: quoted-scalar ranges come from
the parsed AST, and a `#` only starts a comment outside every
quoted range — so a `#` inside a multi-line quoted value
(`"a\n b # not a comment"`) is never mistaken for a comment
start. (An early version of the rule skipped a comment by jumping
to the previous line's newline, which lost a `?` sitting on the
same line before the `#` — `m: {? # why?\n "a\n b" : 1}` was
wrongly rejected; the skip now resumes just before the `#` that
starts the comment. Locked by f25.)

## Deliberately NOT rejected (all probed, both sides already agree)

- Single-line keys of any kind: plain, quoted, quoted with a tab
  inside (R8 V8).
- Multi-line quoted scalar VALUES (`m: {"a": "x\n y"}`) — the
  RESID rule already covers the underindented ones on the Oracle
  side, and the properly-indented ones both accept.
- Block-mapping keys: implicit multi-line block keys are already
  rejected by both parsers through `parse()` itself, and explicit
  block keys (`? "a\n b"\n: 1`) are accepted by both.
- A value written on the next line after the colon
  (`m: {a:\n 1}`); a key on the next line after `{`
  (`m: {\n a: 1}`); a `:` on the next line at indent 0
  (`m: {a\n: 1}` — both sides already reject through `parse()`).

## Known opposites, NOT fixed here (disclosed in the FIX-P0-09 report §7)

Both are `parse()` rejections on the TypeScript side, so no AST
rule can fix them — they would need Oracle-side rejection rules,
a separate round:

- **R4** — a comma on its own line at indent 0 in a flow map:
  `m: {a\n, b: 1}` — TS INVALID / `yaml_parse_error` vs Oracle
  VALID. Boundary: comma at indent >= 1 → both VALID.
- **R5** — an explicit key whose `:` is on the next line at
  indent 0: `m: {? a\n: 1}`, `m: {? "a"\n: 1}` — TS INVALID /
  `yaml_parse_error` vs Oracle VALID. Boundary: colon at indent
  >= 1 → both VALID.

## Fixtures

- f01–f10: the ten R8 R3 shapes (extra key / `on:` value ×
  indent 0 / 1 / 2 / 9, double / single quote, nested, block key —
  f03/f04/f09 are the both-reject boundaries).
- f11–f19: the S1 widening (plain folded keys, escaped quote,
  anchor, flow map in a sequence, jobs mapping, nested `on:`,
  document-root flow map).
- f20–f28: the must-not-fire boundaries (multi-line quoted value,
  V8 tab key, explicit `?` keys incl. the comment variant f25,
  block explicit key, normal flow `on:`).
- f29–f38: the S2 shapes (colon on the next line, quoted and
  plain, comment variants, indent-0 boundary f35, explicit
  boundary f36, value/key on the next line f37/f38).
