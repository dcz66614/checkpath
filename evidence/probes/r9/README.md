# T013 R9 independent probe (reviewer-written, NOT copied from the fixer)

## What this is

The R9 reviewer wrote this probe from scratch: the 10 R3 shapes were
reconstructed from the R8 report text (`evidence/review/
INDEPENDENT_REVIEW_R8.md` §2.1), the R4/R5 shapes from the fixer's
disclosed §7 text, plus reviewer-chosen widening (nested, `on:` slot,
`jobs:` `env:` slot, single-quote variants) and boundaries. Nothing
was copied from `evidence/probes/fix-p0-09/cases.json`.

## Contents

- `cases.json` — 26 probe rows (52 checks), all mode `both`
  (trigger + jobs):
  - **10 rows: the R8 R3 shapes** (double/single-quoted keys,
    indents 0/1/2/9, nested, block key).
  - **6 rows: R4** — the disclosed comma-indent-0 shape, its
    indent-1/2 boundaries, and widening (nested, inside `on:`,
    inside `jobs:` `env:`).
  - **7 rows: R5** — the two disclosed explicit-key shapes, a
    single-quote variant, indent-1 boundaries, and widening
    (nested, inside `on:`).
  - **3 rows: must-not-fire boundaries** (tab in single-line
    quoted key, multi-line quoted value, explicit block key).
- `r9-probe.py` — the driver (builds the TS bundle in a temp dir,
  runs both sides, deep-compares full JSON, writes `results.json`).
- `results.json` — the R9 run: **34/52 MATCH, 18 DIFF**.
  All 18 DIFFs are R4/R5 (9 shapes × 2 modes); all 20 R3 checks
  MATCH; all 6 boundary checks MATCH.

## Rerun

From the repo root, after `npm ci`:

```sh
python3 evidence/probes/r9/r9-probe.py
```

Exit 0 only when every check matches. `results.json` is
deterministic (no timestamps).

## Result summary (verdict: R4/R5 = grouped P0, see INDEPENDENT_REVIEW_R9.md §2–§3)

| Group | Checks | Result |
|---|---|---|
| R3 10 shapes | 20 | 20/20 MATCH — R3 CLOSED |
| R4 (6 shapes) | 12 | 8 DIFF (ind0, nested, on:, jobs-env) / 4 MATCH (ind1, ind2 boundaries) |
| R5 (7 shapes) | 14 | 10 DIFF (ind0 ×3 quoted variants, nested, on:) / 4 MATCH (ind1 boundaries) |
| Boundaries | 6 | 6/6 MATCH |
