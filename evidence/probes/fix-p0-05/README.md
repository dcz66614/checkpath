# FIX-P0-05 probe matrix (D2 flow-alias-key re-verification)

## What this is

FIX-P0-04 closed the T013 R5 grouped P0 but left one known
divergence flagged in its probe matrix (`evidence/probes/fix-p0-04/`,
case D2): a flow-style alias key, `on: {*a: 1}`. This directory
stores the D2-family probe cases, the driver, and the results **in
the repository**, so R6 can re-run the matrix from the repo instead
of rebuilding it from report text.

## Contents

- `cases.json` — 38 probe rows (76 checks):
  - **D2 + 14 flow-alias-key variants (F2–F15):** alias keys in
    `jobs:`, filter mappings, job definitions, `on:` list items,
    root flow mappings, with alias values, among normal keys, with
    anchors defined in the same map, forward references, undefined
    aliases, explicit `?` keys, sequence anchors.
  - **9 G-cases (G1–G9):** block alias keys with no space before
    the colon, space/tab variants, anchored/tagged aliases, two
    alias keys, alias keys with mapping values.
  - **7 H-cases (H1–H5, H8 + flagged H6):** block explicit keys,
    `?` glued to the alias (`?*a`), glued colons, mapping anchors.
  - **7 N-cases (N2–N4, N7–N9 + flagged N5):** no-regression
    shapes — aliases in value positions, quoted `"*a"` keys.
  - **2 rows (N5, H6)** — were flagged `known_divergence`; both closed
    by FIX-P0-06 and the flags cleared in FIX-P0-11 (P2-R10-1);
    see below.
- `ts-probe-entry.ts` — esbuild entry for the TypeScript side
  (identical to the FIX-P0-04 one).
- `run-matrix.py` — the driver (builds the TS bundle in a temp
  dir, runs both sides, deep-compares full JSON, writes
  `results.json`).
- `results.json` — the post-fix run: **72/76 checks MATCH**; the
  only 4 non-matching checks are the flagged N5/H6 rows. Re-run on
  the FIX-P0-11 tree: **76/76 MATCH, 0 flagged** (N5/H6 flags cleared,
  P2-R10-1).

## Rerun

From the repo root, after `npm ci`:

```sh
python3 evidence/probes/fix-p0-05/run-matrix.py
```

Exit 0 when every check matches except the flagged known
divergence. `results.json` is deterministic (no timestamps); a
re-run on the same tree reproduces it byte-for-byte.

## Pre-fix baseline (for the record)

On commit `93aadf9` (before FIX-P0-05) the same matrix gave
**43/76 checks MATCH** (33 DIFF: D2 ×2, F2–F6/F8/F10/F11/F14,
G1/G3/G6/G8, H4 — plus the 4 flagged N5/H6 checks). Post-fix it
is **72/76** (the 4 flagged checks are the only ones left).

## The fix, in one paragraph

The TypeScript `yaml` package rejects an alias key when the `:`
follows the alias with no intervening whitespace ("Alias ending
in : is ambiguous"), in flow and block mappings alike — while
PyYAML accepted it and resolved the alias. The Oracle now rejects
the same shape through `_reject_adjacent_alias_colon`
(`oracle/checkpath_oracle/parser.py`): a scanner-token-stream
check that fires only for a genuine alias key (a KeyToken before
the alias, with the `?*a` glued-scalar case exempted by the
one-character-gap test) immediately followed by `:` in the source.
A space/tab before the colon, and aliases in non-key positions,
are untouched. See ADR FIX-P0-05 in
`handoff/P020-FIX-P0-05/TASK_REPORT.md` §1.

## Known divergences left in the matrix

- **N5 — block alias key with a mapping anchor:**
  `x: &a {b: c}` + `on:` + `*a : 1`. The TypeScript side resolves
  the alias to a mapping and stringifies it as an event name
  (INVALID / `event_config_not_mapping`, jobs `[test]`), while
  PyYAML rejects the unhashable dict key (INVALID /
  `yaml_parse_error`, jobs `[]`). Different root from D2
  (unhashable-key handling, not adjacency). Fixing it would mean
  either teaching the Oracle to stringify collection keys (which
  would break the already-agreeing `? {a: b} : 1` /
  `? [a, b] : 1` cases) or extending the TypeScript-side
  `hasUnrepresentableKey` to reject alias keys resolving to
  collections. Out of scope for FIX-P0-05; needs a follow-up
  decision.
- **H6 — tab before the colon in a flow alias key:**
  `on: {*a\t: 1}`. The TypeScript side accepts the tab as
  separation (INVALID / `event_config_not_mapping`, jobs
  `[test]`), while PyYAML's scanner rejects the tab after an alias
  in flow context (INVALID / `yaml_parse_error`, jobs `[]`). A
  PyYAML scanner limitation, not fixable from the Oracle side
  without input-text surgery (forbidden by PROJECT_BOOK §7.3).
  Out of scope for FIX-P0-05.

## FIX-P0-06 update (2026-11-09): N5 and H6 are both CLOSED

FIX-P0-06 fixed both residuals, both from the TypeScript side
(`src/core/workflow-parser.ts`, Oracle untouched):

- N5: `hasUnrepresentableKey` now rejects an alias key whose
  anchor resolves to a mapping or sequence. The Oracle-stringify
  option was rejected as FIX-P0-05 anticipated (it would break
  `? {a: b} : 1` / `? [a, b] : 1`, which stay agreed and are
  locked as no-regression controls).
- H6: new `hasRejectedTab` rejects any tab PyYAML's scanner
  rejects — the rule turned out to be the general scanner rule
  (any tab outside a quoted scalar, a block scalar's content, or
  a comment), not just the alias-key shape, so the fix closes the
  whole tab family (scalar keys, tabs after colons, tabs after
  plain values, and more).

This matrix now re-runs **76/76 checks MATCH** (was 72/76); the
two flagged rows above both match. **FIX-P0-11 update (P2-R10-1):
the `known_divergence` flags in `cases.json` were cleared, so the
driver now counts 0 flagged checks.** The N5+H6 matrix (67 rows,
134 checks, all MATCH) lives in `evidence/probes/fix-p0-06/`.
See ADR FIX-P0-06 in `handoff/P020-FIX-P0-06/TASK_REPORT.md`.
