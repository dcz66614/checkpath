# T013 R10 independent probe — R9 R4/R5 re-check + threshold edges + R6 (standalone comment line)

## Purpose

Written by the R10 reviewer from the R9 report text (§2.1) and the
FIX-P0-10 threshold table — NOT copied from the fixer's `cases.json`.
44 rows × trigger+jobs = 88 checks.

## Contents

- R4/R5 re-check (9 shapes): the 9 R9 diverging shapes rebuilt from
  the R9 report text, plus their indent-1 boundaries (must stay MATCH).
- Threshold edges of the fixer's claimed rule (env: key indent 4 →
  comma 4 vs 5; deep `with:` key indent 10 → comma 10 vs 11;
  block-sequence dash indent 6 → comma 6 vs 7), plus exemptions
  (closing-only line, flow start line, blank/comment lines) and
  adjacent token kinds (anchor, flow sequence, value/key/nested-start
  on the next line), plus one R3 regression shape.
- R6 shapes (new finding): standalone comment lines at indent 0
  inside a flow map after a complete `key: value` pair.

## Result (HEAD 8ef847b, clean clone)

**78/88 MATCH, 10 DIFF** — all 10 are R6 (5 shapes × 2 modes):

| Shape | TS | Oracle |
|---|---|---|
| `r10-thr-comment-ok` (`m: {a: 1` + `# note` at 0 + ` , b: 2}`) | INVALID / yaml_parse_error | VALID |
| `r10-r6-on-pair` (`on: {push: {types: [opened]}` + `# note` + ` , pull}`) | INVALID | UNKNOWN (`unsupported_event:pull`) |
| `r10-r6-on-pair2` (same, `pull_request`) | INVALID | VALID |
| `r10-r6-close` (`m: {a: 1, b: 2` + `# note` + `}`) | INVALID | VALID |
| `r10-r6-nestedblock` (`x: m:` at indent 2, `# note` at 0, comma at 3) | INVALID | VALID |

TS error: "Comments must be separated from other tokens by white
space characters". The fixer's matrix never tested standalone comment
lines (its 2 comment cases are inline comments only), so its README
claim "注释行：跳过" is false for this shape. Controls that MATCH:
comment after a trailing-comma line, comment after a bare key,
comment inside a flow sequence, comment indent ≥ 1, inline comments.

All R4/R5 shapes MATCH (fix closed), all threshold edges MATCH.

## How to re-run

    python3 evidence/probes/r10/r10-probe.py

Builds the TypeScript probe bundle from the repo source with esbuild
(into a temp dir), runs the TS bundle and the Oracle probe drivers on
the same YAML per row, and deep-compares the full JSON. Writes
`results.json` in this directory (deterministic; a re-run on the same
tree reproduces it byte-for-byte) and exits non-zero unless every
check matches.
