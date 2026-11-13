# FIX-P0-06 probe matrix (N5 collection-alias-key + H6 tab family)

## What this is

FIX-P0-05 closed the D2 flow-alias-key divergence but left two known
divergences flagged in its probe matrix (`evidence/probes/fix-p0-05/`,
cases N5 and H6). This directory stores the N5+H6 probe cases, the
driver, and the results **in the repository**, so R6 can re-run the
matrix from the repo instead of rebuilding it from report text.

## Contents

- `cases.json` — 67 probe rows (134 checks), all MATCH after the fix,
  0 flagged known divergences:
  - **N5 family (18 rows):** alias keys resolving to a mapping or
    sequence anchor — block/flow, event/filter/jobs/matrix positions,
    empty collections, forward references, chained aliases — plus
    no-regression controls (scalar / null / int anchors, explicit
    `? {a: b} : 1` / `? [a, b] : 1` collection keys).
  - **H6 family (14 rows):** tab-separated alias keys — flow/block,
    tab before/after the colon, tab+space, double tab, alias in
    value/sequence positions, explicit `?` keys, map anchors — plus
    no-regression controls (tab in a quoted string, tab indentation,
    adjacent-colon alias key).
  - **T family (22 rows):** the general tab rule — PyYAML's scanner
    rejects a tab before/after a colon, after a plain scalar, after
    a comma / `{` / `-` / `?`, after an anchor/tag, and inside a
    plain scalar, in block and flow context alike; tabs inside
    quoted scalars, block scalars, and comments are accepted.
  - **B family (5 rows):** block-scalar and plain-scalar tab
    boundaries — tab at the start of a block content line (both
    sides reject), tab inside block content (both accept),
    multi-line plain scalars, apostrophes, tabs before comments.
  - **Q family (8 rows):** approximation-boundary checks for the
    tab scanner — quotes at plain-scalar continuation lines,
    misindented block content, bare `- |` items, folded/chomping/
    explicit-indent block scalars, tabs in comments after a block
    header, apostrophes in `run:` values.
- `ts-probe-entry.ts` — esbuild entry for the TypeScript side
  (identical to the FIX-P0-04 / FIX-P0-05 ones).
- `run-matrix.py` — the driver (builds the TS bundle in a temp
  dir, runs both sides, deep-compares full JSON, writes
  `results.json`).
- `results.json` — the post-fix run: **134/134 checks MATCH**,
  0 flagged known divergences.

## Rerun

From the repo root, after `npm ci`:

```sh
python3 evidence/probes/fix-p0-06/run-matrix.py
```

Exit 0 when every check matches except the flagged known
divergence (there are none). `results.json` is deterministic (no
timestamps); a re-run on the same tree reproduces it byte-for-byte.

## Pre-fix baseline (for the record)

On commit `5133396` (before FIX-P0-06) the same 59-row core matrix
gave **38/118 checks MATCH** (80 DIFF: every N5 collection-alias
row and every H6/tab row in both modes, except the no-regression
controls). The 8 Q-family approximation rows were added during the
fix and were not part of the baseline. Post-fix the full 67-row
matrix is **134/134**.

## The fix, in one paragraph

Two TypeScript-side rules, both in `src/core/workflow-parser.ts`,
both reached through the existing `yaml_parse_error` path (and the
`[]` jobs path in `src/core/e2e.ts` `extractJobs`); the Oracle
parser is untouched.

- **N5:** `hasUnrepresentableKey` now also rejects an alias key
  whose anchor resolves (one step, `Alias.resolve(doc)`) to a
  mapping or sequence — PyYAML rejects the unhashable dict key,
  while the `yaml` package stringified it into an event name.
  Scalar anchors (string / number / null), unresolvable and
  forward-reference aliases, and chained aliases are left alone:
  both sides already agree on those (the last two already fail
  identically through the plain `parse()` path).
- **H6:** new `hasRejectedTab` scans the raw text with a small
  state machine (quoted scalars, block scalars, comments) and
  rejects any tab outside those three contexts — exactly the
  positions PyYAML's scanner rejects, in block and flow alike.
  Tabs inside quoted scalars, block scalar content, and comments
  are not rejected; tab indentation at line start is rejected
  through the same path, which both sides already did, so the
  verdict is unchanged there. See ADR FIX-P0-06 in
  `handoff/P020-FIX-P0-06/TASK_REPORT.md` §1.

## Appendix (FIX-P0-07): the "0 known divergences" claim above was wrong

T013 R6 (reviewing commit `baf881f`) found a new grouped P0 that
this matrix did not cover: a tab inside quotes that appear mid-line
while a plain scalar is in progress (`run: echo "a<TAB>b"` — the
`"` is a literal character inside the plain scalar, so PyYAML
rejects the tab; the FIX-P0-06 `hasRejectedTab` treated any `"`
after a space as a quote start and let the tab through). The
FIX-P0-06 report's §7 note — "a `"` at the start of a multi-line
plain scalar's continuation line is treated as a quote start" —
was the approximation that hid it; Q1 locked only "tab OUTSIDE
quotes" on a continuation line. FIX-P0-07 rewrites `hasRejectedTab`
to track "plain scalar in progress" across lines (see
`evidence/probes/fix-p0-07/README.md` and
`handoff/P020-FIX-P0-07/TASK_REPORT.md`). This matrix still passes
134/134 after the rewrite — no regression.

## Known divergences left in the matrix

None. All 134 checks MATCH, 0 rows flagged.

One shape was found and fixed *during* the fix, and is recorded
here because the repair itself caused it: the first version of
`hasRejectedTab` did not recognise a bare sequence-item block
scalar header (`- |`) — the header check compared the trimmed
text against `"-"` without stripping the line indentation, so the
following content line was scanned as normal text and its tab was
rejected. The baseline TS side accepted that document (VALID),
so the first version introduced a reverse divergence (TS
`yaml_parse_error` vs Oracle VALID). Fixed by comparing the
indent-relative text; case Q3 now MATCHes. See the FIX-P0-06
report §7-1.
