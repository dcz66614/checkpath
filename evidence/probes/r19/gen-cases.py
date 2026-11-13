#!/usr/bin/env python3
"""Generate cases.json for the R19 independent hunting probe.

Focus: hasDuplicateAliasKey (FIX-P0-19) × shapes the fixer did not
probe end-to-end — explicit `?` keys (flow + block), anchor-after-use
in the same flow map, cross-map non-duplicates, .inf / 0-vs-false /
quoted-vs-plain canonical folds, on:/jobs: alias-key dups, comments
inside flow maps, deep nesting in real workflow shapes.

Every case is a full workflow document; mode "both" = trigger + jobs
(2 checks each). Expected verdicts are NOT baked in — the driver
compares TS vs Oracle and reports MATCH/DIFF.
"""

import json

WF_TAIL = (
    "on: push\n"
    "jobs:\n"
    "  check:\n"
    "    runs-on: ubuntu-latest\n"
    "    steps:\n"
    "      - run: echo hi\n"
)

CASES = [
    # H1–H4: explicit `?` alias keys (fixer probed only implicit keys).
    ("r19-h01-explicit-flow-null",
     "&w a: 1\nm: {? *w, a: 1}\n" + WF_TAIL),
    ("r19-h02-explicit-flow-valued",
     "&w a: 1\nm: {? *w: 1, a: 1}\n" + WF_TAIL),
    ("r19-h03-explicit-block-null",
     "&w a: 1\nm:\n  ? *w\n  a: 1\n" + WF_TAIL),
    ("r19-h04-explicit-block-valued",
     "&w a: 1\nm:\n  ? *w\n  : 1\n  a: 1\n" + WF_TAIL),
    # H5: alias key alone in an inner map — no dup anywhere.
    ("r19-h05-alias-alone-inner",
     "&w a: 1\nm:\n  a: 1\n  n: {*w}\n" + WF_TAIL),
    # H6: two flow maps in a sequence, each with a dup.
    ("r19-h06-two-flow-maps-seq",
     "&w a: 1\nm: [{a: 1, *w}, {a: 1, *w}]\n" + WF_TAIL),
    # H7–H8: triple-colon absorbed alias keys.
    ("r19-h07-triple-colon-after",
     "&w:2:3:4 a: 1\nm: {a: 1, *w:2:3:4}\n" + WF_TAIL),
    ("r19-h08-triple-colon-first",
     "&w:2:3:4 a: 1\nm: {*w:2:3:4, a: 1}\n" + WF_TAIL),
    # H9–H12: canonical folds the fixer probed only at parser level.
    ("r19-h09-inf-dup",
     "x: &w .inf\nm: {.inf: y, *w}\n" + WF_TAIL),
    ("r19-h10-inf-vs-neg-inf",
     "x: &w .inf\nm: {-.inf: y, *w}\n" + WF_TAIL),
    ("r19-h11-zero-vs-false",
     "x: &w 0\nm: {false: y, *w}\n" + WF_TAIL),
    ("r19-h12-false-vs-zero",
     "x: &w false\nm: {0: y, *w}\n" + WF_TAIL),
    # H13–H15: alias-key dups inside on: / jobs: mappings.
    ("r19-h13-on-dup",
     "x: &w push\non: {push: {}, *w}\n"
     "jobs:\n  check:\n    runs-on: ubuntu-latest\n"
     "    steps:\n      - run: echo hi\n"),
    ("r19-h14-on-nodup",
     "x: &w push\non: {*w, pull_request: {}}\n" + WF_TAIL),
    ("r19-h15-jobs-dup",
     "x: &w check\non: push\n"
     "jobs: {check: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}, *w}\n"),
    # H16: quoted scalar key vs plain alias.
    ("r19-h16-quoted-key",
     "x: &w a\nm: {'a': 1, *w}\n" + WF_TAIL),
    # H17: anchor defined AFTER the alias key in the same flow map.
    ("r19-h17-anchor-after-use",
     "m: {*w, &w a: 1}\n" + WF_TAIL),
    # H18: two anchors, same value, alias-vs-alias keys.
    ("r19-h18-two-anchors-same",
     "x: &w a\ny: &v a\nm: {*w, *v, b: 1}\n" + WF_TAIL),
    # H19: same alias key in two different maps, no dup anywhere.
    ("r19-h19-alias-two-maps",
     "x: &w a\nm: {*w}\nn: {*w}\n" + WF_TAIL),
    # H20: dup against a key whose value is a nested mapping.
    ("r19-h20-dup-nested-value",
     "x: &w a\nm: {a: {x: 1}, *w}\n" + WF_TAIL),
    # H21: flow map inside a sequence inside a flow map.
    ("r19-h21-flow-in-seq-in-flow",
     "x: &w a\nm: {n: [{a: 1, *w}]}\n" + WF_TAIL),
    # H22: NaN anchor vs NaN key (re-verify end-to-end).
    ("r19-h22-nan",
     "x: &w .nan\nm: {.nan: y, *w}\n" + WF_TAIL),
    # H23: comment inside the flow map, before the closing brace.
    ("r19-h23-comment-in-flow",
     "x: &w a\nm: {a: 1, *w # c\n}\n" + WF_TAIL),
    # H24: alias key in an inner map; the dup candidate lives in the
    # outer map only (different mapping — must NOT fire).
    ("r19-h24-outer-only-dup",
     "x: &w a\nm: {a: 1, n: {b: 2, *w}}\n" + WF_TAIL),
    # H25: on: dup with a nested value on the scalar key.
    ("r19-h25-on-dup-nested-value",
     "x: &w push\non: {push: {branches: [main]}, *w}\n"
     "jobs:\n  check:\n    runs-on: ubuntu-latest\n"
     "    steps:\n      - run: echo hi\n"),
    # H26–H29: string-vs-number / bool-vs-number / null folds.
    ("r19-h26-str-one-vs-int-one",
     "x: &w '1'\nm: {1: y, *w}\n" + WF_TAIL),
    ("r19-h27-int-one-vs-str-one",
     "x: &w 1\nm: {'1': y, *w}\n" + WF_TAIL),
    ("r19-h28-true-vs-one",
     "x: &w True\nm: {1: y, *w}\n" + WF_TAIL),
    ("r19-h29-tilde-vs-null",
     "x: &w ~\nm: {null: y, *w}\n" + WF_TAIL),
    # H30: dup inside a step's env mapping (deep real-workflow shape).
    ("r19-h30-env-dup",
     "x: &w a\non: push\n"
     "jobs:\n  check:\n    runs-on: ubuntu-latest\n"
     "    steps:\n      - run: echo hi\n"
     "        env: {a: 1, *w}\n"),
]

if __name__ == "__main__":
    cases = [{"id": cid, "yaml": y, "mode": "both"} for cid, y in CASES]
    with open("cases.json", "w") as f:
        json.dump(cases, f, indent=1, ensure_ascii=False)
    print(f"{len(cases)} cases, {2 * len(cases)} checks")
