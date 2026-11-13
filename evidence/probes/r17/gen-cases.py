"""T013 R17 independent hunt probe — case generator (written fresh by the
R17 reviewer; identifiers and values differ from R16 / FIX-P0-17).

Hunts for NEW residuals around the FIX-P0-17 area (anchor/tag/alias +
colon adhesion) that neither R16 nor the fixer probed:
  H1  `!` guard / tag termination (the R16 §2.5 correction)
  H2  absorption-run characters / terminators not in the fixer grid
  H3  alias absorption (resolved absorbed alias, tag after alias colon)
  H4  rule (ii) key-position edge cases
  H5  rule (iii) flow null-key edge cases
  H6  C3 x absorption interaction
  H7  lone-doc variants

Usage (from the repo root, after `npm ci`):
    python3 evidence/probes/r17/gen-cases.py
    python3 evidence/probes/r17/r17-probe.py
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

WF_PUSH = (
    "on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n"
    "    steps:\n      - run: echo hi\n"
)
WF_SCHED = (
    "on: schedule\njobs:\n  check:\n    runs-on: ubuntu-latest\n"
    "    steps:\n      - run: echo hi\n"
)


def both(id_, yaml):
    return {"id": id_, "yaml": yaml, "mode": "both"}


def trig(id_, yaml):
    return {"id": id_, "yaml": yaml, "mode": "trigger"}


CASES = [
    # H1 — `!` guard / tag termination (R16 §2.5 correction).
    both("r17-h1-tag-tab", "&x:!!str\t\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n"),
    both("r17-h1-tag-comment", "&x:!!str # note\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n"),
    both("r17-h1-tag-bare-bang", "&x:!\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n"),
    both("r17-h1-tag-double-bang", "&x:!!\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n"),
    both("r17-h1-tag-bang-mid", "&x:!!str!zap\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n"),
    trig("r17-h1-tag-flow-next", "&x:!!str\n{on: push}\n"),
    trig("r17-h1-tag-scalar-next", "&x:!!str\nhello\n"),
    both("r17-h1-tag-tab-brace", "&x:!!str\t{on: push}\n"),
    both("r17-h1-tag-nobrace-flow-wf", "&b:!!str{on: push, jobs: {check: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}}}\n"),
    both("r17-h1-tag-crlf", "&x:!!str\r\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n"),
    # H2 — absorption-run characters / terminators not in the fixer grid.
    both("r17-h2-run-semi", "&q:2;\n" + WF_PUSH),
    both("r17-h2-run-eq", "&q:2=\n" + WF_PUSH),
    both("r17-h2-run-plus", "&q:2+\n" + WF_PUSH),
    both("r17-h2-run-dollar", "&q:2$\n" + WF_PUSH),
    both("r17-h2-run-at", "&q:2@\n" + WF_PUSH),
    both("r17-h2-run-percent", "&q:2%\n" + WF_PUSH),
    both("r17-h2-run-backtick", "&q:2`\n" + WF_PUSH),
    both("r17-h2-run-pipe", "&q:2|\n" + WF_PUSH),
    both("r17-h2-run-gt", "&q:2>\n" + WF_PUSH),
    both("r17-h2-run-lparen", "&q:2(x)\n" + WF_PUSH),
    both("r17-h2-run-backslash", "&q:2\\x\n" + WF_PUSH),
    both("r17-h2-hash-glued", "&q:2#x\n" + WF_PUSH),
    both("r17-h2-triple-colon", "&q:2:3:4\n" + WF_PUSH),
    both("r17-h2-colon-colon-eol", "&q:2::\n" + WF_PUSH),
    both("r17-h2-run-end-bang", "&q:2!\n" + WF_PUSH),
    both("r17-h2-nbsp", "&q:2 \n" + WF_PUSH),
    both("r17-h2-colon-tab", "&q:\t2\n" + WF_PUSH),
    both("r17-h2-colon-crlf", "&q:\r\n" + WF_PUSH),
    both("r17-h2-run-bracket-close", "&q:2]\n" + WF_PUSH),
    both("r17-h2-run-brace-close", "&q:2}\n" + WF_PUSH),
    # H3 — alias absorption.
    both("r17-h3-alias-resolved", "x: &w:2 1\ny: *w:2\n" + WF_PUSH),
    both("r17-h3-alias-undef-flow", "m: {a: *w:2}\n" + WF_SCHED),
    both("r17-h3-alias-key-tag-after", "x: &w 1\n&q:!!str *w:!!int 2\n" + WF_SCHED),
    both("r17-h3-alias-key-map-val", "x: &w 1\n&q:!!str *w:\n  a: 1\n" + WF_SCHED),
    both("r17-h3-alias-key-seq-val", "x: &w 1\n&q:!!str *w:\n  - 1\n" + WF_SCHED),
    both("r17-h3-alias-resolved-seq", "m:\n  - &w:2 1\n  - *w:2\n" + WF_PUSH),
    both("r17-h3-alias-resolved-key", "&w:2 a: 1\nb: *w:2\n" + WF_PUSH),
    # H4 — rule (ii) key-position edge cases.
    both("r17-h4-value-nested", "m:\n  n: &q:2\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n"),
    both("r17-h4-docmark", "--- &q:2\non: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    both("r17-h4-seq-item-map", "m:\n  - &q:2\n    a: 1\n  - b: 2\n" + WF_SCHED),
    both("r17-h4-flow-seq-absorb", "m: [&q:2, 1]\n" + WF_SCHED),
    both("r17-h4-flow-second-colon-scalar", "m: {a: 1, &q:2: 3}\n" + WF_SCHED),
    both("r17-h4-value-flow-nested", "m: {a: {b: &q:2}}\n" + WF_SCHED),
    both("r17-h4-explicit-key-val", "? &q:2\n: 1\n" + WF_SCHED),
    # H5 — rule (iii) flow null-key edge cases.
    both("r17-h5-nested-flow-null", "m: {a: {&q:2}}\n" + WF_SCHED),
    both("r17-h5-flow-seq-of-map", "m: [{&q:2}]\n" + WF_SCHED),
    both("r17-h5-colon-seq-val", "m: {&q:2: [1]}\n" + WF_SCHED),
    both("r17-h5-colon-second-anchor-null", "m: {&q:2: &s}\n" + WF_SCHED),
    both("r17-h5-colon-empty-glued", "m: {&q:2:}\n" + WF_SCHED),
    both("r17-h5-flow-map-in-seq-val", "m: [{&q:2: 1}]\n" + WF_SCHED),
    both("r17-h5-nonabsorb-anchor-null-val", "m: {&r: &s}\n" + WF_SCHED),
    # H6 — C3 x absorption interaction.
    both("r17-h6-c3-absorb", "!zap &q:2 : 1\n" + WF_SCHED),
    both("r17-h6-c3-absorb-first-pair", "&q:2 : 1\n" + WF_SCHED),
    # H8 — NEW P0 family (found by this review): absorbed-colon ALIAS in
    # non-key position. Anchor &w:2 is defined on a KEY (key position,
    # accepted both sides); the alias *w:2 is then used in various
    # positions. TS hasRejectedAnchorOrTag applies the keyPos test to
    # `*` exactly as to `&`, but Oracle rule (ii) only inspects
    # AnchorTokens, never AliasTokens — so the Oracle accepts the
    # alias in value position while TS rejects it.
    both("r17-h8-alias-value-flow", "&w:2 a: 1\nm: {b: *w:2}\n" + WF_PUSH),
    both("r17-h8-alias-value-nested", "&w:2 a: 1\nm:\n  n: *w:2\n" + WF_PUSH),
    both("r17-h8-alias-on-value", "&w:2 a: 1\non: *w:2\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    both("r17-h8-alias-jobs-value", "&w:2 a: 1\non: push\njobs: *w:2\n"),
    both("r17-h8-alias-second-pair", "&w:2 a: 1\nb: 1\nc: *w:2\n" + WF_PUSH),
    both("r17-h8-alias-flow-value-2nd", "&w:2 a: 1\nm: {b: 1, c: *w:2}\n" + WF_PUSH),
    both("r17-h8-alias-nested-flow-value", "&w:2 a: 1\nm: {a: {b: *w:2}}\n" + WF_PUSH),
    both("r17-h8-alias-twice", "&w:2 a: 1\nb: *w:2\nc: *w:2\n" + WF_PUSH),
    # H8 controls (expected MATCH — boundary of the family).
    both("r17-h8-alias-flow-seq-item", "&w:2 a: 1\nm: [*w:2]\n" + WF_PUSH),
    both("r17-h8-alias-block-seq-item", "&w:2 a: 1\nm:\n  - *w:2\n" + WF_PUSH),
    both("r17-h8-alias-after-tag", "&w:2 a: 1\nm: !zap *w:2\n" + WF_PUSH),
    both("r17-h8-alias-after-anchor", "&w:2 a: 1\nm: &s *w:2\n" + WF_PUSH),
    both("r17-h8-alias-explicit-key", "&w:2 a: 1\n? *w:2\n: 1\n" + WF_PUSH),
    both("r17-h8-alias-flow-key", "&w:2 a: 1\nm: {*w:2: 1}\n" + WF_PUSH),
    # H7 — lone-doc variants.
    trig("r17-h7-lone-tag-space", "&x:!!str \n"),
    trig("r17-h7-lone-bang", "&x:!\n"),
    trig("r17-h7-lone-double-bang", "&x:!!\n"),
    trig("r17-h7-lone-hash", "&q:2#x\n"),
    trig("r17-h7-lone-nbsp", "&q:2 \n"),
    trig("r17-h7-lone-colon-colon", "&q:2::\n"),
    trig("r17-h7-lone-alias-colon", "*w:2\n"),
    trig("r17-h7-lone-run-bang", "&q:2!\n"),
    trig("r17-h7-lone-tag-tab", "&x:!!str\t\n"),
]


def main() -> None:
    (HERE / "cases.json").write_text(
        json.dumps(CASES, indent=1, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    n_checks = sum(2 if c["mode"] == "both" else 1 for c in CASES)
    print(f"wrote {len(CASES)} cases -> {HERE / 'cases.json'} ({n_checks} checks)")


if __name__ == "__main__":
    main()
