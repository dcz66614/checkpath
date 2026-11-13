# Bare-empty-key YAML — divergence FIXED by FIX-P0-04 (final review R2 P0 residual, grouped P0 in T013 R5)

## Status (FIX-P0-04)

**FIXED — the divergence below no longer exists.** T013 R5 found 3
residual divergences on commit `2388be1` (FIX-P0-03); two of them
were bare empty keys. The TypeScript `yaml` parser accepts a line
containing only `:` as a null key (rendered `""`), while PyYAML's
own parser rejects the whole document before any Oracle code runs
(`expected <block end>, but found ':'`), so the Oracle could only
return INVALID / `yaml_parse_error` / events `[]`:

- X-empty-1: a single bare `:` key under `on:` — TS UNKNOWN with an
  event named `""`, Oracle INVALID.
- X-filter-empty: a bare `:` key in a flow event config,
  `on: {push: {: [main]}}` — TS UNKNOWN with
  `unsupported_filter:` (empty), Oracle INVALID.

FIX-P0-04 aligns the TypeScript side with the Oracle: `parseWorkflowYaml`
and `extractJobs` now reject the document through the same
`yaml_parse_error` path when the YAML AST contains a key PyYAML
cannot represent (see `hasUnrepresentableKey` in
`src/core/workflow-parser.ts`). The Oracle parser is untouched.

## The rule (whole-document, AST-only, no text surgery)

A mapping key is rejected when either holds:

1. **Bare empty key** — a PLAIN scalar key whose value is null and
   whose source range is empty (the YAML text at that position is
   just a `:`, nothing before it). Covers block and flow mappings.
   Because PyYAML fails the *whole document*, the rule is
   whole-document too: a bare key in `jobs:`, at the top level, or
   nested inside a job/step mapping diverges just as much as one in
   `on:` (cases b03–b09, b11–b13 probe every position; b07/b12/b13
   were already INVALID on both sides pre-fix, but with different
   error codes, so they diverged as well).
2. **Non-scalar, non-alias key** — a collection key (explicit `?`
   inline forms such as `? :` / `? [a, b] : 1` / `? {a: b} : 1`, a
   sequence or mapping key). The `yaml` package stringifies such
   keys into garbage event names; PyYAML rejects the document
   (parse error / unhashable key). Case b10 covers the `? :` form.

Deliberately NOT rejected (all probed on both sides, already in
agreement — the rule must not expand into them):

- Explicit null spellings as keys — `null:` / `Null:` / `NULL:` /
  `~:` are PLAIN scalars with non-empty source; both sides render
  them `""` since FIX-P0-03 (b19, b20; also R4 P4a/b/c).
- Quoted empty keys — `''` / `""` are quoted scalars (b17, b18).
- The standard two-line explicit-key form — `? push` newline
  `: {}` is a normal scalar key, VALID on both sides (b21).
- Anchored scalar keys (`&k push:`) and merge keys (`<<:`).
- Alias keys in block style (`*a : 1` — both sides resolve the
  alias to its scalar; b22).

The input text is never rewritten (PROJECT_BOOK §7.3, "read the raw
workflow YAML separately"); the check inspects the `yaml` 2.x
Document/AST node ranges only.

## Consequences of the fix

- These cases are now IN the automated Oracle对照, not outside it:
  the trigger suite (`tests/fixtures/trigger/T6-42..T6-51`,
  `npm run oracle:diff:trigger`) and the golden suite
  (`tests/fixtures/golden/G-106..G-115`,
  `npm run test:oracle`). The scalar-job half of the R5 grouped P0
  (J20) lives in the sibling directory `scalar-job/`.
- The lock test is a parity test:
  `tests/unit/diff-boundaries/bare-empty-key.test.ts` runs both
  parsers on the 22 fixtures in this directory and asserts status /
  errors / events agree field-for-field.
- `expected.json` in this directory records both sides' agreed
  outcome for all 22 cases (status / errors / full events). It was
  generated only after the post-fix probe run showed TS == Oracle
  on every case.
- The full R5 66-case probe matrix (plus 11 boundary positions and
  5 no-regression shapes) is stored in the repository as
  `evidence/probes/fix-p0-04/` (cases + driver + results), so R6 can
  re-run it from the repo instead of rebuilding it from report text.

## Known residuals (probed, not fixed — see the FIX-P0-04 report §7)

- **Flow-style alias key (`on: {*a: 1}`, case D2 in the probe
  matrix):** the `yaml` package rejects it at parse time
  (INVALID / `yaml_parse_error`, jobs `[]`), while PyYAML accepts
  it and the Oracle returns INVALID / `event_config_not_mapping`
  (jobs `[test]`). The divergence runs the *other* way round from
  the bare-key cases (TS stricter than Oracle) and comes from a
  `yaml`-library flow-alias quirk, not from a bare key — fixing it
  would need Oracle-side flow-alias handling and is out of scope.
  Both sides agree the input is INVALID; only the error code (and
  the jobs list) differ.

  **FIX-P0-05 update (2026-11-09): CLOSED.** The Oracle now
  rejects an alias key whose `:` follows it with no intervening
  whitespace (`_reject_adjacent_alias_colon`,
  `oracle/checkpath_oracle/parser.py`) with the identical
  `yaml_parse_error`. The D2 family lives in the sibling directory
  `flow-alias-key/` (16 cases, trigger T6-52..T6-55, golden
  G-116..G-119) and the probe matrix
  `evidence/probes/fix-p0-05/`.

## The divergence (historical)

Before FIX-P0-04, a bare `:` key was the only null spelling the
two sides disagreed on: every realistic null spelling
(`null`/`Null`/`NULL`/`~`) already agreed after FIX-P0-03, and
two bare keys, or a bare key plus `null:`/`~:`, already agreed
(both INVALID — the duplicate/null-dup path fired first). The
divergence existed only when a bare key appeared exactly once in
a position with no other INVALID cause.
