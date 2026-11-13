"""Generate evidence/probes/fix-p0-19/cases.json.

Grid for FIX-P0-19 (T013 R18 new P0 family: a null-value alias key in
a flow mapping resolves to a scalar that duplicates another key of
the same mapping; the `yaml` package's uniqueKeys never resolves
alias keys, so the TypeScript side accepted while the Oracle's
construct_mapping rejected with `duplicate mapping key`).

- Group A (8 shapes): the R18 family itself, copied verbatim from
  the R18 cases (scalar key before / after the alias key, alias key
  twice, nested flow, absorbed / triple-colon alias, trailing
  comment).
- Group B (9 shapes): the R18 section 2.5 boundary controls that
  must stay MATCH (valued alias keys, block alias keys, plain
  duplicate key, alias alone as a key, alias key resolving to a
  different scalar, alias in a value position, block null-value
  alias keys).
- Group C (18 shapes): hunting — canonical folding of the resolved
  scalar (int / bool / null / quoted / tagged / NaN anchors),
  alias key twice spread over other pairs, flow mapping inside a
  sequence, alias key in the `on:` mapping, anchor defined inside
  the same flow mapping, deep nesting, two anchors with the same
  value, alias key in the `jobs:` mapping, forward reference,
  alias to a collection, chained alias.

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
JOB_FLOW = "{runs-on: ubuntu-latest, steps: [{run: echo hi}]}"

CASES = []


def case(cid, yaml, mode="both"):
    CASES.append({"id": cid, "yaml": yaml, "mode": mode})


# --- Group A: the R18 family (8 shapes, 16 checks) -------------------
case("a-alias-after-absorbed", "&w:2 a: 1\nm: {a: 1, *w:2}\n" + WF)
case("a-alias-after-plain", "&w a: 1\nm: {a: 1, *w}\n" + WF)
case("a-alias-first", "&w a: 1\nm: {*w, a: 1}\n" + WF)
case("a-alias-twice", "&w a: 1\nm: {*w, *w}\n" + WF)
case("a-nested-flow", "&w:2 a: 1\nm: {x: {a: 1, *w:2}}\n" + WF)
case("a-absorbed-first", "&w:2 a: 1\nm: {*w:2, a: 1}\n" + WF)
case("a-triple-colon", "&w:2:3 a: 1\nm: {a: 1, *w:2:3}\n" + WF)
case("a-trailing-comment", "&w:2 a: 1\nm: {a: 1, *w:2} # c\n" + WF)

# --- Group B: R18 section 2.5 boundary controls (must stay MATCH) -----
case("b-valued-first", "&w a: 1\nm: {*w: 1, a: 1}\n" + WF)
case("b-valued-twice", "&w a: 1\nm: {*w: 1, *w: 2}\n" + WF)
case("b-block-valued", "&w a: 1\nm:\n  a: 1\n  *w: 1\n" + WF)
case("b-plain-dup", "m: {a: 1, a: 2}\n" + WF)
case("b-alias-alone", "&w a: 1\nm: {*w}\n" + WF)
case("b-diff-scalar", "&w a: 1\nm: {b: 2, *w}\n" + WF)
case("b-alias-value", "&w a: 1\nb: *w\n" + WF)
case("b-block-null-after", "&w a: 1\nm:\n  a: 1\n  *w\n" + WF)
case("b-block-null-absorbed", "&w:2 a: 1\nm:\n  a: 1\n  *w:2\n" + WF)

# --- Group C: hunting (canonical folding + positions) ------------------
case("c-int-anchor", "x: &w 1\nm: {1: y, *w}\n" + WF)
case("c-int-vs-quoted", "x: &w 1\nm: {'1': y, *w}\n" + WF)
case("c-bool-anchor", "x: &w True\nm: {true: y, *w}\n" + WF)
case("c-bool-vs-int", "x: &w True\nm: {1: y, *w}\n" + WF)
case("c-null-anchor", "x: &w ~\nm: {null: y, *w}\n" + WF)
case("c-quoted-anchor", "x: &w 'a'\nm: {a: y, *w}\n" + WF)
case("c-tagged-anchor", "x: &w !!str 1\nm: {1: y, *w}\n" + WF)
case("c-nan-anchor", "x: &w .nan\nm: {.nan: y, *w}\n" + WF)
case("c-alias-twice-spread", "&w a: 1\nm: {*w, b: 2, *w}\n" + WF)
case("c-flow-in-seq", "&w a: 1\nm: [{a: 1, *w}]\n" + WF)
case(
    "c-on-alias-dup",
    "x: &w push\non: {*w, push: {}}\n"
    "jobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
)
case("c-anchor-in-flow", "m: {&w a: 1, *w}\n" + WF)
case("c-deep-nested", "&w a: 1\nm: {x: {y: {a: 1, *w}}}\n" + WF)
case("c-two-anchors-same", "x: &a foo\ny: &b foo\nm: {*a, *b}\n" + WF)
case(
    "c-jobs-alias-dup",
    "x: &w check\non: push\n"
    "jobs: {check: " + JOB_FLOW + ", *w}\n",
)
case("c-forward-ref", "m: {*w, a: 1}\n&w a: 1\n" + WF)
case("c-to-collection", "x: &a {b: c}\nm: {a: 1, *a}\n" + WF)
case("c-chained-alias", "x: &a foo\ny: &b *a\nm: {foo: 1, *b}\n" + WF)

if __name__ == "__main__":
    (HERE / "cases.json").write_text(
        json.dumps(CASES, indent=1, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    n_checks = sum(2 if c["mode"] == "both" else 1 for c in CASES)
    print(f"fix-p0-19 grid: {len(CASES)} cases, {n_checks} checks")
