# T013 R11 independent probe

Reviewer-written probe (T013 R11, fresh session, clean clone
`~/workspace/p020-review-r11/` at `479810e`). Cases rebuilt from the
R10 review report §2.1 and the FIX-P0-11 report §2/§7 text — NOT
copied from the fixer's `cases.json`.

## Groups (37 shapes × trigger+jobs = 74 checks)

- **R6 re-check (5)**: `r11-r6-extra`, `r11-r6-on`,
  `r11-r6-on-unsupported`, `r11-r6-close`, `r11-r6-nestedblock` —
  standalone comment line at indent 0 after a complete pair.
- **R6 boundary (10)**: comment indent 1, after comma, after bare
  key, inside flow sequence, inline comment, blank-line break,
  nested flow mapping, flow sequence inside flow mapping, two
  consecutive comment lines, `on:` flow with comma at indent 0.
- **FlowEndToken narrowing (6)**: inner close at indent 0,
  outer close below block indent, outer close at == block indent
  (control, must stay exempt), mid-line close (control),
  inner close at indent 1, close first-token-then-content.
- **Residuals, independently graded (16)**: the 8 rows disclosed in
  FIX-P0-11 §7 (`res-anchor-nospace`, `res-tag-nospace`,
  `res-null-ml-plain/quoted/hash/plain-comma/plain-nested`,
  `inl-key-comma-nospace`) plus 8 boundary variants — space
  controls, anchor nospace in the `on:` slot and in a flow
  sequence, null-ml key after a complete pair, multi-line key
  WITH a value (the original S1 target), single-quoted null-ml key.

## Result (personally run in the clean clone)

**50/74 MATCH, 24 DIFF** — all 24 DIFF are in the residual group:

- R6 re-check: **10/10 MATCH** (R6 closed).
- R6 boundary: **20/20 MATCH**.
- FlowEndToken narrowing: **12/12 MATCH**.
- Residual (a) anchor/tag nospace: **0/8 MATCH** — TS VALID vs
  Oracle INVALID (the `on:`-slot variant is both INVALID but with
  different error codes: `event_config_not_mapping` vs
  `yaml_parse_error`). Parser-level: `yaml` package ACCEPTS
  `&x#c` / `!!str#c`; PyYAML REJECTS ("while scanning an
  anchor" / "while scanning a tag"). Space controls both accept.
- Residual (b) null-value multi-line keys: **0/16 MATCH** — TS
  INVALID vs Oracle VALID. Parser-level: both parsers ACCEPT
  every null-ml shape; only the TS-side `hasMultilineFlowKey`
  S1 rule rejects them. The `ml-key-with-value` controls both
  reject (MATCH) — S1's intended target is genuinely
  divergent-free, so the over-rejection is exactly the
  null-value (no-`:`) case.

## Method

Same driver shape as the R10 probe: builds the TS probe bundle
from repo source with esbuild into a temp dir, then per row runs
the TS bundle and the Oracle probe drivers
(`scripts/oracle-parse-probe.py` / `scripts/oracle-jobs-probe.py`)
on the same YAML and deep-compares the full JSON. Writes
`results.json` (deterministic, no timestamps); exit 0 only when
every check matches.

Usage (from the repo root, after `npm ci`):

    python3 evidence/probes/r11/r11-probe.py
