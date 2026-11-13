# FIX-P0-04 probe matrix (T013 R5 grouped P0 re-verification)

## What this is

T013 R5's probe evidence lived only in its report text plus
`/tmp/r5probe/`, which the VM restart #39 wiped (R5's P2-R5-1).
This directory stores the probe cases, the driver, and the results
**in the repository**, so R6 can re-run the matrix from the repo
instead of rebuilding it from report text.

## Contents

- `cases.json` — 83 probe rows (100 checks):
  - **66 rows: the R5 matrix, rebuilt from R5 §1–§2 and R4 §2.**
    R4's 46 (A group 13 dup-scalar keys, B group 9 rendering, MATCH
    group 24 incl. Q4/E1/E2) + FIX-P0-03's R1–R10 (reused from
    `tests/fixtures/parser-divergence/scalar-rendering/s01..s10`)
    + R5's residual 10 (X-empty-1, X-filter-empty, J20, X-empty-5,
    X-empty-6, X-huge-1, X-huge-2, X-nan-dup, X-inf-dup,
    X-neg0-dup). X-empty-2/3/4 are the same YAML as R4's Q4/E1/E2
    and are covered by those rows, not duplicated. Composition note:
    R5's arithmetic (46+10+10) double-counts one row (R3 is the
    same YAML as R4's P2c, kept as a separate row here exactly as
    R5 counted it).
  - **11 rows: bare-empty-key boundary positions (B1–B11)**,
    trigger + jobs modes each — bare key in `jobs:`, at the top
    level, nested in a job def, in a steps item, as a filter-value
    mapping key, in flow `jobs:`/`on:` maps, as a sequence-item
    key, the explicit `? :` form, with trailing spaces, and in an
    `on:`-list item.
  - **5 rows: no-regression shapes (D1/D3/D4/E1/E2)** — alias key,
    merge key, anchored key, standard two-line explicit key.
  - **1 row (D2, flow-style alias key `on: {*a: 1}`)** — was flagged
    `known_divergence`; FIX-P0-05 closed it and the flag was cleared
    in FIX-P0-11 (P2-R10-1); see below.
- `ts-probe-entry.ts` — esbuild entry for the TypeScript side.
- `run-matrix.py` — the driver (builds the TS bundle in a temp
  dir, runs both sides, deep-compares full JSON, writes
  `results.json`).
- `results.json` — the post-fix run: **98/100 checks MATCH** (the only
  2 non-matching checks are the flagged D2 row); re-run on the
  FIX-P0-11 tree: **100/100 MATCH, 0 flagged** (D2 flag cleared,
  P2-R10-1).

## Rerun

From the repo root, after `npm ci`:

```sh
python3 evidence/probes/fix-p0-04/run-matrix.py
```

Exit 0 when every check matches except the flagged known
divergence. `results.json` is deterministic (no timestamps); a
re-run on the same tree reproduces it byte-for-byte.

## Pre-fix baseline (for the record)

On commit `2388be1` (before FIX-P0-04) the same matrix gave
**63/88 checks MATCH** (the 66-row R5 matrix: 63 MATCH / 3 DIFF —
exactly R5's result: X-empty-1, X-filter-empty, J20 — and all 22
boundary checks DIFF). Post-fix it is **98/100** (the +12 checks
are the 5 no-regression rows × 2 modes + the flagged D2 row × 2
modes, all added after the fix; the 88 pre-fix checks are all
MATCH post-fix).

## Known divergence left in the matrix (D2)

`on: {*a: 1}` (flow-style alias key): the `yaml` package rejects
it at parse time (TS INVALID / `yaml_parse_error`, jobs `[]`),
while PyYAML accepts it and the Oracle returns INVALID /
`event_config_not_mapping` (jobs `[test]`). Both sides agree the
input is INVALID; only the error code (and the jobs list) differ.
The divergence runs the other way round from the bare-key cases
(TS stricter than Oracle) and comes from a `yaml`-library
flow-alias quirk, not from a bare key — fixing it would need
Oracle-side flow-alias handling and is out of scope for FIX-P0-04.
Recorded here so R6 can reproduce it rather than rediscover it.

**FIX-P0-05 update (2026-11-09): D2 is CLOSED.** The Oracle now
rejects an alias key whose `:` follows it with no intervening
whitespace (`_reject_adjacent_alias_colon`,
`oracle/checkpath_oracle/parser.py`) with the identical
`yaml_parse_error`, in both `parse_workflow_yaml` and
`extract_jobs`. Re-running this matrix on the FIX-P0-05 tree gives
**100/100 MATCH** (the D2 row matches too). **FIX-P0-11 update
(P2-R10-1): the `known_divergence` flag in `cases.json` was cleared,
so the driver now counts 0 flagged checks.** The full D2-family probe
matrix (38 rows, 72/76 with only the N5/H6 residuals flagged)
lives in `evidence/probes/fix-p0-05/`.
