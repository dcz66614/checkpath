# Flow-alias-key YAML — divergence FIXED by FIX-P0-05 (final review R2 P0 residual, D2 in the FIX-P0-04 probe matrix)

## Status (FIX-P0-05)

**FIXED — the divergence below no longer exists.** FIX-P0-04 closed
the T013 R5 grouped P0 but left one known divergence flagged in its
probe matrix (`evidence/probes/fix-p0-04/`, case D2): a flow-style
alias key, `on: {*a: 1}`. The TypeScript `yaml` package rejects it
at parse time (INVALID / `yaml_parse_error`, jobs `[]`), while
PyYAML accepted it and the Oracle returned INVALID /
`event_config_not_mapping` (jobs `[test]`). Both sides agreed the
input is INVALID; only the error code (and the jobs list) differed
— and the divergence was worse than the error code alone: when the
alias sat outside `on:` (a `jobs:` flow map, a job definition, a
filter value) the Oracle returned VALID or UNKNOWN while the
TypeScript side returned INVALID (cases f07/f09/f04).

FIX-P0-05 aligns the Oracle side with the TypeScript side:
`parse_workflow_yaml` and `extract_jobs` now reject the same shape
through `_reject_adjacent_alias_colon`
(`oracle/checkpath_oracle/parser.py`) with the identical
`yaml_parse_error`. The TypeScript product code is untouched.

## The rule (adjacency, not flow style)

The TypeScript rejection is triggered by **adjacency, not by flow
style**: an alias used as a mapping key is a parse error when the
`:` follows the alias with no intervening whitespace ("Alias ending
in : is ambiguous" — the `yaml` package's own warning). Probed on
both sides (FIX-P0-05 report §2):

- Rejected on both sides after the fix: `on: {*a: 1}`,
  `{? *a: 1}` (an explicit `?` does **not** save an adjacent-colon
  alias key), `{?  *a: 1}` (two spaces after `?`), block `*a: 1`,
  `{*a: {b: 1}}`, `{*a: 1, *b: 2}`, `{*a:b}`, alias keys inside
  `jobs:` / a job definition / a filter mapping / an `on:` list
  item, and an alias key whose anchor is a sequence or a mapping.
- Deliberately NOT rejected (both sides already agree — the rule
  must not expand into them):
  - A space or tab before the `:` (`{*a : 1}`, f11) — both sides
    accept and resolve the alias.
  - A `?` glued to the alias (`{?*a: 1}`, f12): the TypeScript
    reader sees the plain scalar `"?*a"`, not an alias key — both
    sides return INVALID / `event_config_not_mapping`.
  - An explicit `?` with a space before the colon
    (`{? *a : 1}`, f13) — both sides accept.
  - Aliases in non-key positions: a flow sequence value
    (`{push: [*a]}`, f14), a flow mapping value
    (`{push: *a}` with a mapping anchor, f15 — the VALID control,
    push with `branches: [main]`), a block mapping value.

## How the Oracle detects it

The composed node tree cannot be used: PyYAML resolves an alias
key to the anchored node object itself, so by construction time
the alias identity is gone. Neither the event stream nor the token
stream distinguishes an implicit key from an explicit `?` key —
only the token *marks* do. The check therefore runs on the scanner
token stream (`yaml.scan`): for each AliasToken, walk back over
anchor/tag properties; only a KeyToken means the alias is a key.
A `?` exactly one character before the alias (`?*a`) is a plain
scalar, not a key indicator, so a gap of 1 exempts it; anything
else (gap 0 implicit, gap >= 2 explicit `?`) is a genuine alias
key and is rejected when the source character right after the
alias is `:`. Raised as `yaml.YAMLError`, so both callers map it
onto the existing `yaml_parse_error` path. `yaml.scan` raising a
ScannerError (e.g. a tab after an alias in flow context — see
Known residuals) is also a `yaml.YAMLError` and maps the same way.

The input text is never rewritten (PROJECT_BOOK §7.3, "read the
raw workflow YAML separately"); the check inspects scanner tokens
and source marks only.

## Consequences of the fix

- These cases are now IN the automated Oracle对照, not outside it:
  the trigger suite (`tests/fixtures/trigger/T6-52..T6-55`,
  `npm run oracle:diff:trigger`) and the golden suite
  (`tests/fixtures/golden/G-116..G-119`,
  `npm run test:oracle`).
- The lock test is a parity test:
  `tests/unit/diff-boundaries/flow-alias-key.test.ts` runs both
  parsers on the 16 fixtures in this directory and asserts status /
  errors / events / jobs agree field-for-field, in both trigger and
  jobs modes.
- `expected.json` in this directory records both sides' agreed
  outcome for all 16 cases (status / errors / full events / full
  job list). It was generated only after the post-fix probe run
  showed TS == Oracle on every case, in both modes.
- The full D2-family probe matrix (36 rows: the D2 variants,
  no-regression shapes, and the two flagged residuals below) is
  stored in the repository as `evidence/probes/fix-p0-05/` (cases
  + driver + results), so R6 can re-run it from the repo. The
  FIX-P0-04 matrix (`evidence/probes/fix-p0-04/`) now re-runs
  100/100 — its flagged D2 row matches too.

## Known residuals (probed, not fixed — see the FIX-P0-05 report §7)

- **Block alias key with a mapping anchor (N5):**
  `x: &a {b: c}` + `on:` + `*a : 1` — the TypeScript side resolves
  the alias to a mapping and stringifies it as an event name
  (INVALID / `event_config_not_mapping`, jobs `[test]`), while
  PyYAML rejects the unhashable dict key (INVALID /
  `yaml_parse_error`, jobs `[]`). Different root from D2
  (unhashable-key handling, not adjacency); fixing it would mean
  either teaching the Oracle to stringify collection keys (which
  would break the already-agreeing `? {a: b} : 1` / `? [a, b] : 1`
  cases) or extending the TypeScript-side `hasUnrepresentableKey`
  to reject alias keys resolving to collections. Out of scope for
  FIX-P0-05; needs a follow-up decision.
- **Tab before the colon in a flow alias key (H6):**
  `on: {*a\t: 1}` — the TypeScript side accepts the tab as
  separation (INVALID / `event_config_not_mapping`, jobs `[test]`),
  while PyYAML's scanner rejects the tab after an alias in flow
  context (INVALID / `yaml_parse_error`, jobs `[]`). A PyYAML
  scanner limitation, not fixable from the Oracle side without
  input-text surgery (forbidden by PROJECT_BOOK §7.3). Out of
  scope for FIX-P0-05.

## FIX-P0-06 update (2026-11-09): N5 and H6 are both CLOSED

FIX-P0-06 fixed both residuals from the TypeScript side
(`src/core/workflow-parser.ts`, Oracle untouched): N5 by
extending `hasUnrepresentableKey` to reject alias keys resolving
to collections, H6 by new `hasRejectedTab` (the general PyYAML
scanner tab rule). The FIX-P0-05 probe matrix
(`evidence/probes/fix-p0-05/`) now re-runs 76/76; the N5+H6
matrix (67 rows, 134 checks, all MATCH) lives in
`evidence/probes/fix-p0-06/`. The parity locks for the two
families are `tests/fixtures/parser-divergence/collection-alias-key/`
(18 cases) and `tests/fixtures/parser-divergence/tab-rejected/`
(49 cases), with trigger T6-56..T6-61 and golden G-120..G-125.
See ADR FIX-P0-06 in `handoff/P020-FIX-P0-06/TASK_REPORT.md`.

## The divergence (historical)

Before FIX-P0-05, a flow alias key was the only alias-key shape
the two sides disagreed on: block alias keys with a space
(`*a : 1`, D1 in the FIX-P0-04 matrix) already agreed, as did
aliases in value positions and merge/anchored keys. The divergence
existed for every adjacent-colon alias key, in any position
(`on:`, `jobs:`, job definitions, filter mappings, list items) —
the Oracle either returned a different error code or, worse, a
different status (VALID/UNKNOWN vs INVALID).
