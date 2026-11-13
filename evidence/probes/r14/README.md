# T013 R14 independent probe

Independent re-verification of FIX-P0-14 (code commit `45487eb`),
written from the R13 review report text and the FIX-P0-14 report's
threshold description — NOT copied from the fixer's
`evidence/probes/fix-p0-14/cases.json`. Anchor names, values and
events differ from the fixer's matrix throughout (`a`/`b` instead
of `x`/`y`; `7`/`2`/`5`/`9` instead of `1`; `pull_request` instead
of `push` where an event appears).

## Coverage (39 rows × 2 modes = 78 checks)

| Group | Rows | Purpose |
|---|---|---|
| P (r14-p0-*) | 2 | R13 lone-doc P0 core: `&a: 7` / `&a:` alone. Must MATCH after the fix. |
| C (r14-c-*) | 10 | Controls that must MATCH: quoted empty key, mapping values, lone scalars, quoted-empty-key + full workflow, bare/explicit empty key (both `yaml_parse_error`). |
| D (r14-d-*) | 10 | Five-condition discriminant necessity: each shape violates exactly one condition of `_is_lone_anchored_empty_key_doc` (or exercises the rule through a tag / sequence / doc-mark / comment). Any DIFF here is a new finding. |
| R (r14-r-*) | 12 | The 11 disclosed residual rows, rebuilt + the flow twin control `r14-r-nested-flow` (must MATCH). At R14 the 11 rows were trigger DIFF expected / jobs MATCH expected; they were closed by later fixes — see the T014 closure note below. |
| G (r14-g-*) | 5 | R6 5 shapes (R10 §2.1). Must MATCH. |

## Result

**67/78 MATCH, 11 DIFF** — exactly the 11 flagged residual rows in
trigger mode; all jobs-mode checks MATCH; no unexpected DIFF, no
stale flag. Driver exits 0 only on that exact outcome.

### T014 closure (2026-11-10)

The 11 residual rows were closed by later fixes. Verified **78/78
MATCH, 0 DIFF, 0 stale flag** at the R19 re-run (2026-11-09) and
again after the expectation was cleared: `expected_diff` is now
`false` on all 11 rows in `cases.json`, the driver exits 0 on
78/78, and `results.json` records 78 checks / 78 match / 0 diff.
The R14-time result above is kept as the historical record; the
residual-families table below still names the original mechanisms.

Residual families (all independently rebuilt, error codes confirmed):

| Family | Shapes | TS | Oracle |
|---|---|---|---|
| (a) mapping value contains `on` | r-on-flow, r-on-block, r-on-tag | VALID | INVALID `missing_on_key` |
| (b) value node's second anchor | r-2anchor-scalar/seq/null | INVALID `yaml_parse_error` | INVALID `missing_on_key` |
| (c) key with tag | r-tagkey, r-tagkey-handle, r-tagkey-docmark | INVALID `yaml_parse_error` | INVALID `missing_on_key` |
| (d) unglued anchor-colon | r-unglued | INVALID `yaml_parse_error` | INVALID `missing_on_key` |
| (e) nested block-map value, anchored key | r-nested-block | INVALID `yaml_parse_error` | INVALID `missing_on_key` |

## Files

- `gen-cases.py` — generates `cases.json` from the shape table above.
- `cases.json` — 39 rows (T014: `expected_diff` is now `false` on
  all rows; the 11 former residual rows were closed by later fixes).
- `r14-probe.py` — driver (esbuild bundle of
  `evidence/probes/fix-p0-14/ts-probe-entry.ts` + the two Oracle
  probe scripts; deep-compares whole TriggerIR / job list).
- `results.json` — 78 checks, 78 match, 0 diff (deterministic;
  T014 re-run after clearing the stale flags).
- `parser-probe.mjs` — parser-level probe (`yaml` package) for the
  residual mechanisms: `&x:\n  &y: 1` throws "at most one anchor"
  (block only; flow twin parses to `{"1": null}`), `&x: &y 1`
  throws "at most one anchor" (also inside a workflow),
  `&x:\n  on: push\n  jobs: …` parses to the value as the document.
