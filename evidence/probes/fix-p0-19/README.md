# FIX-P0-19 probe evidence (T013 R18 new P0 family)

## What this is

R18 found 1 new P0 family: a **null-value alias key in a flow
mapping resolves to a scalar that duplicates another key of the
same mapping** — the Oracle rejects (`duplicate mapping key`), the
TypeScript side accepted (the `yaml` package's `uniqueKeys` never
resolves alias keys). The fix adds `hasDuplicateAliasKey` to the
TypeScript side (`src/core/workflow-parser.ts`, wired into both
`parseWorkflowYaml` and `extractJobs`).

## Files

- `parser-probe-p19.py` / `parser-probe-py.txt` — PyYAML
  `_StrictBaseLoader` behaviour on the 8 family shapes + 25
  boundary/control shapes (tokens + LOAD-OK / LOAD-ERROR).
- `parser-probe-p19.mjs` / `parser-probe-mjs.txt` — `yaml` 2.9.1
  behaviour on the same shapes (`parse()` throw / OK, AST key
  nodes, `Alias.resolve(doc)` results). Note: the B11–B18/B21/B25
  shapes in this file are malformed (anchor defined on a bare
  first line, which the YAML parser reads as a multi-line key) —
  see `parser-probe-p19b.mjs` for the corrected forms; the
  conclusions in the report use the corrected probe.
- `parser-probe-p19b.mjs` — corrected canonical-folding probes
  (anchors defined as values): int / bool / null / quoted /
  tagged / NaN anchors, `on:` alias duplicate, chained alias.
  (Output was captured in the FIX-P0-19 report §3; the script is
  re-runnable.)
- `gen-cases.py` / `cases.json` — the fix grid: 35 cases, 70 checks
  (Group A: R18 family 8 shapes; Group B: R18 §2.5 controls 9
  shapes; Group C: hunting 18 shapes — canonical folding,
  positions, `on:` / `jobs:` alias keys, forward reference,
  alias-to-collection, chained alias).
- `p19-probe.py` / `results.json` — grid driver (esbuild TS bundle
  + `scripts/oracle-parse-probe.py` / `oracle-jobs-probe.py`,
  full-JSON deep compare). Result: **70/70 MATCH, 0 DIFF**.

## How to re-run

From the repo root, after `npm ci`:

    python3 evidence/probes/fix-p0-19/gen-cases.py
    python3 evidence/probes/fix-p0-19/p19-probe.py
    python3 evidence/probes/fix-p0-19/parser-probe-p19.py
    node evidence/probes/fix-p0-19/parser-probe-p19.mjs
    node evidence/probes/fix-p0-19/parser-probe-p19b.mjs
