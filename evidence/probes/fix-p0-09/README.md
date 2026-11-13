# FIX-P0-09 probe matrix (T013 R8 grouped P0 / R3 re-verification)

## What this is

T013 R8 graded R3 — the reverse flow-key divergence — as a grouped
P0: the `yaml` npm package accepts a multi-line quoted scalar as a
flow-mapping key while PyYAML rejects every multi-line key in a
flow mapping. This directory stores the probe cases, the driver,
and the results **in the repository**, so R9 can re-run the matrix
from the repo instead of rebuilding it from report text (the R4
contamination lesson: review evidence must live in the repo, not
in `/tmp`).

## Contents

- `cases.json` — 49 probe rows (98 checks), all mode `both`
  (trigger + jobs):
  - **38 rows: the parser-divergence fixture shapes**, copied
    verbatim from
    `tests/fixtures/parser-divergence/flow-quoted-key/f01..f38.yml`
    (the 10 R8 R3 shapes, the S1 widening, the must-not-fire
    boundaries, the S2 colon-on-next-line shapes).
  - **3 rows (R4 + R5)** — were flagged `known_divergence`; FIX-P0-10
    closed them and the flags were cleared in FIX-P0-11 (P2-R10-1);
    see below.
  - **8 rows: extra mapping boundaries** — the R4/R5 indent-1
    boundaries (both VALID), a `#` inside a comment before a
    multi-line quoted key (both INVALID), a multi-pair flow map,
    an explicit plain `?` key as `on:` value (both INVALID /
    `event_config_not_mapping`), and block keys with the colon on
    the next line (both INVALID).
- `ts-probe-entry.ts` — esbuild entry for the TypeScript side.
- `run-matrix.py` — the driver (builds the TS bundle in a temp
  dir, runs both sides, deep-compares full JSON, writes
  `results.json`).
- `results.json` — the post-fix run: **92/98 checks MATCH**; the
  only 6 non-matching checks are the 3 flagged R4/R5 rows
  (2 modes each). Re-run on the FIX-P0-11 tree: **98/98 MATCH,
  0 flagged** (R4/R5 flags cleared, P2-R10-1).

## Rerun

From the repo root, after `npm ci`:

```sh
python3 evidence/probes/fix-p0-09/run-matrix.py
```

Exit 0 when every check matches except the flagged known
divergence. `results.json` is deterministic (no timestamps); a
re-run on the same tree reproduces it byte-for-byte.

## Known divergences left in the matrix (R4 + R5)

Both run the opposite way round from R3 (the TypeScript side is
stricter than the Oracle) and both are `parse()` rejections on the
TypeScript side, so no AST rule can fix them — they would need
Oracle-side rejection rules, a separate round (FIX-P0-10 if R9
grades either P0):

- **R4** — a comma on its own line at indent 0 in a flow map:
  `m: {a\n, b: 1}` — TS INVALID / `yaml_parse_error` vs Oracle
  VALID (`{'m': {'a': None, 'b': 1}}`). Boundary: comma at
  indent >= 1 → both VALID (row `r4-comma-ind1`).
- **R5** — an explicit key whose `:` is on the next line at
  indent 0: `m: {? a\n: 1}`, `m: {? "a"\n: 1}` — TS INVALID /
  `yaml_parse_error` vs Oracle VALID. Boundary: colon at indent
  >= 1 → both VALID (rows `r5-explicit-ind1`,
  `r5-explicit-quoted-ind1`).

**FIX-P0-10 update: R4 and R5 are CLOSED.** FIX-P0-10 added the
Oracle-side `_reject_underindented_flow_continuation` rule, so both
sides now reject these shapes (R9 graded them P0, as this section
anticipated). **FIX-P0-11 update (P2-R10-1): the `known_divergence`
flags in `cases.json` were cleared, so the driver now counts 0
flagged checks; the matrix re-runs 98/98.**

## Pre-fix baseline (for the record)

On commit `c157f41` (before FIX-P0-09) the same 49-row matrix
gives **48/98 checks MATCH**: 22 unflagged rows DIFF (the S1
reject shapes f01/f02/f05/f06/f07/f08/f10/f11–f18, the S2 shapes
f29–f34, and the multi-pair row — 44 checks) plus the 6 flagged
R4/R5 checks. The boundary rows (f03/f04/f09/f19/f20–f28/f35–f38,
the indent-1 R4/R5 boundaries, the comment/block rows) already
matched pre-fix. (Baseline measured with the FIX-P0-09 rule
reverted by `git stash` of `src/core/workflow-parser.ts` +
`src/core/e2e.ts` only; the matrix files themselves are
unchanged.)
