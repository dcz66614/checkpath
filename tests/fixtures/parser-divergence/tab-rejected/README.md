# Tab YAML — divergence FIXED by FIX-P0-06 (final review R2 P0 residual, H6 in the FIX-P0-05 probe matrix)

## Status (FIX-P0-06)

**FIXED — the divergence below no longer exists.** FIX-P0-05 closed
the D2 flow-alias-key divergence but left one known divergence
flagged in its probe matrix (`evidence/probes/fix-p0-05/`, case H6):
a tab before the colon in a flow alias key, `on: {*a\t: 1}`. The
TypeScript `yaml` package accepts the tab as separation (INVALID /
`event_config_not_mapping`, jobs `[test]`), while PyYAML's scanner
rejects the tab after an alias in flow context (INVALID /
`yaml_parse_error`, jobs `[]`). Both sides agreed the input is
INVALID; only the error code (and the jobs list) differed — and the
divergence was wider than the one H6 shape: PyYAML's scanner
rejects a tab in every structural position, so scalar keys with a
tab, tabs after a colon, and tabs after plain scalar values all
diverged the same way.

FIX-P0-06 aligns the TypeScript side with the Oracle side: new
`hasRejectedTab` (`src/core/workflow-parser.ts`) scans the raw text
and rejects any tab outside a quoted scalar, a block scalar's
content, or a comment, with the identical `yaml_parse_error`, in
both `parseWorkflowYaml` and `extractJobs`. The Oracle parser is
untouched.

## The rule (the scanner rule, not the alias-key shape)

The rejection follows **PyYAML's scanner rule, not the alias-key
shape**: a tab is a parse error anywhere except inside a
single/double-quoted scalar, inside a block scalar's content, or
inside a comment. Probed on both sides (FIX-P0-06 report §2):

- Rejected on both sides after the fix: tabs before/after a colon
  (alias keys and scalar keys, block and flow), after an alias in
  key or value position, after a plain scalar value, after a comma
  / `{` / `-` / `?`, after an anchor/tag, and inside a plain
  scalar (including multi-line plain scalars).
- Deliberately NOT rejected (both sides already agree — the rule
  must not expand into them):
  - Tabs inside quoted scalars (`"a\tb"`, `'a\tb'`, including
    quoted keys) — both sides accept.
  - Tabs inside block scalar content (`run: |` + indented lines,
    including folded `>`, chomping `|-`, explicit indent `|2`, and
    bare `- |` items) — both sides accept.
  - Tabs inside comments (`# c\tomment`, including a comment after
    a block scalar header) — both sides accept.
  - Tab indentation at line start — both sides already return
    `yaml_parse_error`; this rule rejects it too, through the same
    error path, so the verdict is unchanged.

## How the TypeScript side detects it

A small state machine over the raw text: quote state (single /
double, with escapes, recognised only at token boundaries),
block-scalar state (header recognised in value position in block
context; content recognised by indentation relative to the header
line), comment state (to end of line), and flow depth. Any tab
seen outside those three states returns true. The input text is
never rewritten (PROJECT_BOOK §7.3, "read the raw workflow YAML
separately"), and the Oracle parser is untouched.

## Consequences of the fix

- These cases are now IN the automated Oracle对照, not outside it:
  the trigger suite (`tests/fixtures/trigger/T6-59..T6-61`,
  `npm run oracle:diff:trigger`) and the golden suite
  (`tests/fixtures/golden/G-123..G-125`,
  `npm run test:oracle`).
- The lock test is a parity test:
  `tests/unit/diff-boundaries/tab-rejected.test.ts` runs both
  parsers on the 49 fixtures in this directory and asserts status
  / errors / events / jobs agree field-for-field, in both trigger
  and jobs modes.
- `expected.json` in this directory records both sides' agreed
  outcome for all 49 cases (status / errors / full events / full
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

None in this family. All 49 cases agree on both sides.

One shape was found and fixed *during* the fix: the first version
of `hasRejectedTab` did not recognise a bare sequence-item block
scalar header (`- |`) — the header check compared the trimmed
text against `"-"` without stripping the line indentation, so the
following content line was scanned as normal text and its tab was
rejected. The baseline TypeScript side accepted that document
(VALID), so the first version introduced a reverse divergence (TS
`yaml_parse_error` vs Oracle VALID). Fixed by comparing the
indent-relative text; case Q3 in the probe matrix now MATCHes.

## The divergence (historical)

Before FIX-P0-06, a tab in a structural position was a divergence
wherever it appeared: the `yaml` package treats tabs as separation
almost everywhere, while PyYAML's scanner rejects them. The H6
exemplar (tab before the colon in a flow alias key) was only the
most visible case — the same root covered scalar keys, values,
and every other structural position, in block and flow context
alike.
