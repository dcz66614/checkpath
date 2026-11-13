# Collection-alias-key YAML — divergence FIXED by FIX-P0-06 (final review R2 P0 residual, N5 in the FIX-P0-05 probe matrix)

## Status (FIX-P0-06)

**FIXED — the divergence below no longer exists.** FIX-P0-05 closed
the D2 flow-alias-key divergence but left one known divergence
flagged in its probe matrix (`evidence/probes/fix-p0-05/`, case N5):
a block alias key whose anchor is a mapping, `x: &a {b: c}` then
`*a : 1`. The TypeScript `yaml` package resolves the alias to a
mapping and stringifies it as an event name (INVALID /
`event_config_not_mapping`, jobs `[test]`), while PyYAML rejects
the unhashable dict key (INVALID / `yaml_parse_error`, jobs `[]`).
Both sides agreed the input is INVALID; only the error code (and
the jobs list) differed — and the divergence was worse than the
error code alone: when the alias sat in a filter mapping or a job
definition, the Oracle returned `yaml_parse_error` while the
TypeScript side returned VALID (cases f08/f11).

FIX-P0-06 aligns the TypeScript side with the Oracle side:
`hasUnrepresentableKey` (`src/core/workflow-parser.ts`) now also
rejects an alias key whose anchor resolves to a mapping or
sequence, with the identical `yaml_parse_error`, in both
`parseWorkflowYaml` and `extractJobs`. The Oracle parser is
untouched.

## The rule (resolution, not syntax)

The rejection is triggered by **what the alias resolves to, not by
how it is written**: an alias used as a mapping key is a parse
error when its anchor resolves (one step, `Alias.resolve(doc)`) to
a mapping or sequence. Probed on both sides (FIX-P0-06 report §2):

- Rejected on both sides after the fix: alias keys resolving to a
  mapping or sequence anchor — block and flow, in `on:`, filter
  mappings, `jobs:`, job definitions, `strategy.matrix`, with
  empty collections (`&a {}` / `&a []`), and with steps present.
- Deliberately NOT rejected (both sides already agree — the rule
  must not expand into them):
  - Alias keys resolving to a scalar anchor: string (`&a foo`),
    number (`&a 1`), null (`&a ~`) — both sides resolve the alias
    and treat it as a scalar key.
  - Explicit collection keys (`? {a: b} : 1`, `? [a, b] : 1`) —
    already rejected on both sides by the pre-existing
    collection-key branch of `hasUnrepresentableKey`; this fix does
    not touch them, and the probe matrix locks them as
    no-regression controls.
  - Forward references (`*a` used before `&a` is defined) and
    undefined aliases (`*zz`) — both sides already return
    `yaml_parse_error` through the plain `parse()` path.
  - Chained aliases (`*b` where `&b *a`) — both sides already
    return `yaml_parse_error` identically, so no chain-following
    is needed; `Alias.resolve` returning `undefined` for a chain
    is left alone.

## How the TypeScript side detects it

The composed node tree is walked exactly as for the pre-existing
bare-empty-key / collection-key shapes: for each mapping pair
whose key is an alias, `key.resolve(doc)` is called once; a
resolved mapping or sequence returns true. Resolution is
conservative — if it throws or returns `undefined`, the key is
left alone. The input text is never rewritten (PROJECT_BOOK §7.3,
"read the raw workflow YAML separately"), and the Oracle parser
is untouched.

## Consequences of the fix

- These cases are now IN the automated Oracle对照, not outside it:
  the trigger suite (`tests/fixtures/trigger/T6-56..T6-58`,
  `npm run oracle:diff:trigger`) and the golden suite
  (`tests/fixtures/golden/G-120..G-122`,
  `npm run test:oracle`).
- The lock test is a parity test:
  `tests/unit/diff-boundaries/collection-alias-key.test.ts` runs
  both parsers on the 18 fixtures in this directory and asserts
  status / errors / events / jobs agree field-for-field, in both
  trigger and jobs modes.
- `expected.json` in this directory records both sides' agreed
  outcome for all 18 cases (status / errors / full events / full
  job list). It was generated only after the post-fix probe run
  showed TS == Oracle on every case, in both modes.
- The full N5+H6 probe matrix (67 rows: the N5 variants, the H6
  tab family, and the general tab / block-scalar / approximation
  boundaries) is stored in the repository as
  `evidence/probes/fix-p0-06/` (cases + driver + results), so R6
  can re-run it from the repo. The FIX-P0-05 matrix
  (`evidence/probes/fix-p0-05/`) now re-runs 76/76 — its flagged
  N5/H6 rows match too.

## Known residuals (probed, not fixed — see the FIX-P0-06 report §7)

None in this family. All 18 cases agree on both sides.

## The divergence (historical)

Before FIX-P0-06, a collection-alias key was the only alias-key
shape the two sides disagreed on: scalar alias keys already
agreed, as did explicit collection keys, forward references, and
undefined aliases. The divergence existed for every alias key
resolving to a collection, in any position (`on:`, filter
mappings, `jobs:`, job definitions, `strategy.matrix`) — the
Oracle returned `yaml_parse_error` while the TypeScript side
either returned a different error code or, worse, a different
status (VALID vs INVALID).
