"""Generate evidence/probes/fix-p0-18/cases.json.

Grid for FIX-P0-18 (T013 R17 new P0 family: value-position absorbed
alias ``*w:2`` after a key-position absorbed anchor ``&w:2``).

- Group A (9 shapes): the R17 family itself, copied verbatim from the
  R17 cases (``&w:2 a: 1`` anchor definition + value-position alias
  use in block / flow / nested / on / jobs / 2nd-pair / twice).
- Group B (8 shapes): the R17 section 2.5 boundary controls that
  must stay MATCH (sequence items, tag/anchor-after aliases,
  explicit key, flow key, anchor-definition-only, plain alias).
- Group C (hunting, new): alias positions R17 did not probe —
  flow-key null, flow-seq 2nd item, multi-colon aliases,
  tag/anchor-before-alias in block values, docmark, seq-defined
  anchor then value use, flow-defined anchor then value use,
  deep nesting, comments, steps items, second absorbed pair.

Every case carries a complete workflow (``on`` + ``jobs``) unless
the shape itself targets ``on`` / ``jobs`` as the alias position.
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

WF = (
    "on: push\n"
    "jobs:\n"
    "  check:\n"
    "    runs-on: ubuntu-latest\n"
    "    steps:\n"
    "      - run: echo hi\n"
)
WF_SCHED = WF.replace("on: push", "on: schedule")
HEAD = "&w:2 a: 1\n"

CASES = []


def case(cid, yaml, mode="both"):
    CASES.append({"id": cid, "yaml": yaml, "mode": mode})


# --- Group A: the R17 family (9 shapes, 17 checks) -------------------
case("a-value-block", HEAD + "b: *w:2\n" + WF)
case("a-value-flow", HEAD + "m: {b: *w:2}\n" + WF)
case("a-value-nested", HEAD + "m:\n  n: *w:2\n" + WF)
case("a-on-value", HEAD + "on: *w:2\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n")
case("a-jobs-value", HEAD + "on: push\njobs: *w:2\n", mode="trigger")
case("a-second-pair", HEAD + "b: 1\nc: *w:2\n" + WF)
case("a-flow-value-2nd", HEAD + "m: {b: 1, c: *w:2}\n" + WF)
case("a-nested-flow-value", HEAD + "m: {a: {b: *w:2}}\n" + WF)
case("a-twice", HEAD + "b: *w:2\nc: *w:2\n" + WF)

# --- Group B: R17 section 2.5 boundary controls (must stay MATCH) -----
case("b-block-seq-item", HEAD + "m:\n  - *w:2\n" + WF)
case("b-flow-seq-item", HEAD + "m: [*w:2]\n" + WF)
case("b-after-tag", HEAD + "m: !zap *w:2\n" + WF)
case("b-after-anchor", HEAD + "m: &s *w:2\n" + WF)
case("b-explicit-key", HEAD + "? *w:2\n: 1\n" + WF)
case("b-flow-key", HEAD + "m: {*w:2: 1}\n" + WF)
case("b-anchor-def-only", HEAD + WF)
case("b-plain-alias", "&w a: 1\nb: *w\n" + WF)

# --- Group C: hunting — alias positions R17 did not probe ------------
case("c-flow-key-null", HEAD + "m: {*w:2}\n" + WF)
case("c-flow-key-null-2nd", HEAD + "m: {a: 1, *w:2}\n" + WF)
case("c-flow-seq-2nd", HEAD + "m: [*w:2, *w:2]\n" + WF)
case("c-flow-seq-2nd-scalar", HEAD + "m: [1, *w:2]\n" + WF)
case("c-block-seq-2nd", HEAD + "m:\n  - 1\n  - *w:2\n" + WF)
case("c-multi-colon", "&w:2:3 a: 1\nb: *w:2:3\n" + WF)
case("c-multi-colon-seq", "&w:2:3 a: 1\nm:\n  - *w:2:3\n" + WF)
case("c-tag-before-alias-block", HEAD + "b: !zap *w:2\n" + WF)
case("c-anchor-before-alias-block", HEAD + "b: &s *w:2\n" + WF)
case("c-alias-key-root", HEAD + "*w:2: 1\n" + WF)
case("c-docmark", HEAD + "---\nb: *w:2\n" + WF)
case("c-seq-defined-then-value", "m:\n  - &w:2 1\nb: *w:2\n" + WF)
case("c-flow-defined-then-value", "m: {&w:2 a: 1, b: *w:2}\n" + WF)
case("c-deep-nested", HEAD + "m: {a: {b: {c: *w:2}}}\n" + WF)
case("c-comment-after", HEAD + "b: *w:2 # comment\n" + WF)
case("c-alias-in-steps", HEAD + "on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - *w:2\n")
case("c-second-pair-absorbed", HEAD + "&v:3 d: 2\nb: *v:3\n" + WF)
case("c-anchor-on-value-then-alias", "x: &w:2 1\ny: *w:2\n" + WF)
case("c-nested-map-value", HEAD + "m:\n  n:\n    o: *w:2\n" + WF)
case("c-flow-map-in-seq", HEAD + "m:\n  - {b: *w:2}\n" + WF)
case("c-anchor-on-flow-key", "m: {&w:2 a: 1}\nb: *w:2\n" + WF)
case("c-alias-value-then-anchor-def", "b: *w:2\n&w:2 a: 1\n" + WF)
case("c-two-aliases-one-line", HEAD + "m: {b: *w:2, c: *w:2}\n" + WF)


def main():
    (HERE / "cases.json").write_text(
        json.dumps(CASES, indent=1, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    n_checks = sum(2 if c["mode"] == "both" else 1 for c in CASES)
    print(f"fix-p0-18 grid: {len(CASES)} shapes, {n_checks} checks")


if __name__ == "__main__":
    main()
