# FIX-P0-07 probe matrix (T013 R6 P0 re-verification)

## What this is

T013 R6 (reviewing commit `baf881f`) found a new grouped P0: a tab
inside quotes that appear mid-line while a plain scalar is in progress
— `run: echo "a<TAB>b"` is a plain scalar (`echo ...`) whose `"` is a
literal character, so the tab is a tab inside a plain scalar and PyYAML
rejects it (INVALID / `yaml_parse_error`), while FIX-P0-06's
`hasRejectedTab` treated any `"`/`'` after a space as a quote start
and let the tab through (TS VALID vs Oracle INVALID). Four shapes,
V1/V2/V5/V9 (each trigger + jobs = 8 DIFFs). This directory stores the
probe cases, the driver, and the results **in the repository**, so T013
R7 can re-run the matrix from the repo instead of rebuilding it from
report text (R6's P2-R6-2: review probe evidence only in `/tmp` is
lost on VM restart).

## Contents

- `cases.json` — 43 probe rows (86 checks):
  - **V1/V2/V5/V9** — the four R6 shapes (double quote, single quote,
    multi-line plain scalar continuation, trailing comment).
  - **V1-family variants** — anchor-plain-quote (V1b), flow-plain-quote
    (V1c), plain-key-quote (V1d), value-on-next-line-after-bare-key
    (V1e), continuation-mid-quote (V1f), blank-line-then-continuation,
    flow-plain-quote-tab.
  - **Boundary rows that must stay MATCH** — V3/V4 true quoted
    scalars, V6 tab outside quotes, V7 quote glued to plain text, V8
    quoted key, Q1, Q3, B4/B5/B6, TAB-COMMENT, TAB-BLOCK, N5 explicit
    collection keys, X-empty-2/3/4, ANCHOR-QUOTED, TAG-QUOTED,
    FLOW-V3-QUOTED, SEQ-ITEM-QUOTED, MULTILINE-QUOTED-TAB (indented
    continuation), MULTILINE-QUOTED-TAB-SQ, COMMENT-THEN-CONT-QUOTE-TAB,
    TRAILING-COMMENT-THEN-CONT, Q8, FLOW-NESTED-QUOTED,
    FLOW-PLAIN-KEY-TAB, EXPLICIT-QUOTED-KEY,
    V1g-explicit-plain-key-quote, COMMENT-THEN-CONT,
    TRAILING-COMMENT-THEN-CONT.
  - **2 rows (RESID-MULTILINE-QUOTED-UNINDENTED-DQ/SQ)** — were
    flagged `known_divergence`; FIX-P0-08 closed them and the flags
    were cleared in FIX-P0-11 (P2-R10-1); see below.
- `ts-probe-entry.ts` — esbuild entry for the TypeScript side.
- `run-matrix.py` — the driver (builds the TS bundle in a temp dir,
  runs both sides, deep-compares full JSON, writes `results.json`).
- `results.json` — the post-fix run: **82/86 checks MATCH**; the only
  4 non-matching checks are the flagged RESID rows. Re-run on the
  FIX-P0-11 tree: **86/86 MATCH, 0 flagged** (RESID flags cleared,
  P2-R10-1).

## Rerun

From the repo root, after `npm ci`:

```sh
python3 evidence/probes/fix-p0-07/run-matrix.py
```

Exit 0 when every check matches except the flagged known
divergence. `results.json` is deterministic (no timestamps); a
re-run on the same tree reproduces it byte-for-byte.

## Pre-fix baseline (for the record)

On commit `402a3b0` (before FIX-P0-07) the same matrix gave
**60/86 checks MATCH** — 22 unflagged DIFFs (the 11 V1-family rows
× 2 modes) + the 4 flagged RESID checks. Post-fix it is **82/86**
(the +22 checks are exactly the V1-family rows).

## The rule (FIX-P0-07)

`hasRejectedTab` (`src/core/workflow-parser.ts`) now tracks "plain
scalar in progress" across lines. A quote starts a quoted scalar
only where a scalar can start — never while a plain scalar is in
progress. The state machine (see the docstring above the function
and `handoff/P020-FIX-P0-07/TASK_REPORT.md` §2):

- Plain-scalar continuation: inside a flow collection newlines are
  folding whitespace (any indent continues); in block context the
  next line must be more indented than the scalar's block context.
  Blank lines fold; comment lines are transparent.
- A value written on the line after a bare `key:` belongs to that
  key's block context (its continuation threshold is the key's
  indent, not its own line's).
- A quote closes a complete node, so after it closes no plain scalar
  is in progress.
- `:` separates only when followed by space/tab/EOL, or (in flow
  context) a flow indicator `,[]{}`.
- `,`/`]`/`}` end a plain scalar only inside a flow collection;
  `[`/`{` only open a flow collection when no plain scalar is in
  progress (a `[` inside a plain scalar is literal).
- `-`/`?` are indicators only when no plain scalar is in progress,
  followed by space/tab/EOL, and at a token boundary.
- `&`/`!`/`*` at scalar-start position start an in-property state
  consuming name chars `[A-Za-z0-9_./-]+`; after an anchor/tag, a
  quote IS a quote start.
- `#` at a token boundary (line start or after a space) starts a
  comment even while a plain scalar is in progress; elsewhere it is
  a literal plain-scalar character.

## Known divergence (NOT fixed here)

RESID-MULTILINE-QUOTED-UNINDENTED-DQ/SQ: the `yaml` npm package
rejects a multi-line quoted scalar whose continuation line is
indented at or below the block context indent (e.g. `run: "a\nb\tc"`
with the continuation at indent 0, or `- run: "a` with the
continuation at indent ≤ 8 = the `run` key indent; threshold probed:
continuation indent 9+ parses, 8− fails), while PyYAML accepts any
indent. The divergence exists even WITHOUT any tab. Root cause is
parser leniency in the `yaml` package, not `hasRejectedTab`
(`hasRejectedTab` correctly returns false for these shapes), so it
is out of scope for FIX-P0-07. A follow-up fix (parser-level) is a
parent decision before T013 R7. See `TASK_REPORT.md` §7.

**FIX-P0-08 update: this divergence is CLOSED.** FIX-P0-08 added the
Oracle-side `_reject_underindented_multiline_quoted_scalar` rule, so
both sides now reject these shapes. **FIX-P0-11 update (P2-R10-1):
the `known_divergence` flags in `cases.json` were cleared, so the
driver now counts 0 flagged checks; the matrix re-runs 86/86.**
