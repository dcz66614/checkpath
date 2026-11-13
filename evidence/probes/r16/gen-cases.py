"""T013 R16 independent probe cases (written fresh by the R16 reviewer).

NOT copied from the fixer's cases.json / grid: every shape rebuilt here
with fresh identifiers (anchors &q/&w/&z, values 3/7/9, events
schedule/workflow_dispatch/release, tags !zap/!qux/!!binary/!!omap),
plus novel hunt shapes the fixer never probed.

Groups:
  A  R15 13 residual rows rebuilt (must all MATCH now)
  B  FIX-P0-16 report §2.1 C3 controls (still-reject / still-accept)
  C  report §2.2 scanner-mirror trigger / must-not-trigger boundaries
  D  report §2.3 loader boundaries (scalar tags on collections)
  E  report §2.4 grid residuals (tagged empty key, flow anchored key)
  F  (c) x `!foo &b:!!str` interaction edge, variants
  G  novel hunt shapes (never probed by the fixer)
  H  R13 §4.2 P0-C3 exemption edges rebuilt
  I  R14 5-family spot rebuilds with fresh identifiers
"""
from __future__ import annotations

import json
from pathlib import Path

WF = """on: schedule
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
"""

WF2 = """on: workflow_dispatch
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
"""

WFP = """on: push
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
"""

# (id, yaml)
CASES = [
    # ---- A: R15 13 residual rows, rebuilt ----
    ("r16-a1-root-first", "!zap &q : 3\n" + WF),
    ("r16-a2-root-2nd", "a: 1\n!zap &q : 3\n" + WF),
    ("r16-a3-nested-2nd", "m:\n  a: 1\n  !zap &q : 3\n" + WF),
    ("r16-a4-str-flow-nospace", "&q:!!str {on: schedule}\n"),
    ("r16-a5-str-block-nospace", "&q:!!str\n  on: schedule\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n"),
    ("r16-a6-int-lone", "&q: !!int {on: schedule}\n"),
    ("r16-a7-bool-lone", "&q: !!bool {on: schedule}\n"),
    ("r16-a8-int-m", "m: !!int {a: 1}\n" + WF),
    ("r16-a9-float-m", "m: !!float {a: 1}\n" + WF),
    ("r16-a10-on-int", "on: !!int {schedule: {}}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("r16-a11-on-bool", "on: !!bool {schedule: {}}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("r16-a12-on-float", "on: !!float {schedule: {}}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("r16-a13-on-str", "on: !!str {schedule: {}}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    # ---- B: §2.1 C3 controls ----
    ("r16-b1-nested-first", "m:\n  !zap &q : 3\n" + WF),
    ("r16-b2-tag-glued", "a: 1\n!zap &q: 3\n" + WF),
    ("r16-b3-untagged-unglued", "a: 1\n&q : 3\n" + WF),
    ("r16-b4-untagged-glued", "a: 1\n&q: 3\n" + WF),
    ("r16-b5-root-first-glued", "!zap &q: 3\n" + WF),
    ("r16-b6-verbatim-2nd", "a: 1\n!<zap> &q : 3\n" + WF),
    ("r16-b7-handle-2nd", "a: 1\n!!str &q : 3\n" + WF),
    ("r16-b8-explicit-key", "m:\n  ? !zap &q : 3\n" + WF),
    ("r16-b9-first-null", "&q:\n" + WF),
    ("r16-b10-first-null-unglued", "&q :\n" + WF),
    ("r16-b11-lone", "!zap &q : 3\n"),
    ("r16-b12-docmark-first", "---\n!zap &q : 3\n" + WF),
    ("r16-b13-seq-item", "m:\n  - !zap &q : 3\n" + WF),
    ("r16-b14-flow-first", "m: {!zap &q : 1}\n" + WF),
    ("r16-b15-flow-second", "m: {a: 1, !zap &q : 2}\n" + WF),
    ("r16-b16-deep-second", "a:\n  b:\n    c: 1\n    !zap &w : 2\n" + WF),
    ("r16-b17-root-third", "a: 1\nb: 2\n!zap &q : 3\n" + WF),
    ("r16-b18-nested-third", "m:\n  a: 1\n  b: 2\n  !zap &q : 3\n" + WF),
    ("r16-b19-nested-first-2pair", "m:\n  !zap &q : 3\n  c: 3\n" + WF),
    ("r16-b20-tag-noanchor-first", "m:\n  !zap : 3\n" + WF),
    # ---- C: §2.2 mirror boundaries ----
    ("r16-c1-int-flow", "&q:!!int {on: schedule}\n"),
    ("r16-c2-bool-block", "&q:!!bool\n  on: schedule\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n"),
    ("r16-c3-foo-flow", "&q:!zap {on: schedule}\n"),
    ("r16-c4-foo-block", "&q:!zap\n  on: schedule\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n"),
    ("r16-c5-str-seq", "&q:!!str [1, 2]\n"),
    ("r16-c6-str-null", "&q:!!str\n"),
    ("r16-c7-str-nobrace", "&q:!!str{on: schedule}\n"),
    ("r16-c8-nested", "m:\n  &q:!!str {a: 1}\n" + WF),
    ("r16-c9-root-second", "a: 1\n&q:!!str {c: 3}\n" + WF),
    ("r16-c10-flow-map", "m: {&q:!!str {a: 1}}\n" + WF),
    ("r16-c11-value-pos", "m: &q:!!str {a: 1}\n" + WF),
    ("r16-c12-on-value", "on: &q:!!str {schedule: {}}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("r16-c13-after-qmark", "m:\n  ? &q:!!str {a: 1}\n" + WF),
    ("r16-c14-scalar-key", "&q:!!str hello: 1\n" + WF),
    ("r16-c15-alias-key", "x: &w 1\n&q:!!str *w: 2\n" + WF),
    ("r16-c16-absorb-2", "&q:2\n" + WF),
    ("r16-c17-absorb-foo", "&q:foo\n" + WF),
    ("r16-c18-seq-item", "m:\n  - &q:!!str {a: 1}\n" + WF),
    ("r16-c19-anchor-digit", "&q1:!!str {on: schedule}\n"),
    ("r16-c20-anchor-underscore", "&my_anchor:!!str {on: schedule}\n"),
    ("r16-c21-anchor-hyphen", "&my-q:!!str {on: schedule}\n"),
    ("r16-c22-unglued-anchor-nospace-tag", "&q :!!str {on: schedule}\n"),
    ("r16-c23-spaced-ctrl", "&q: !!str {on: schedule}\n"),
    ("r16-c24-scalar-val", "&q:!!str hello\n"),
    ("r16-c25-empty-map", "&q:!!str {}\n"),
    ("r16-c26-empty-seq", "&q:!!str []\n"),
    # ---- D: §2.3 loader boundaries ----
    ("r16-d1-null-m", "m: !!null {a: 1}\n" + WF),
    ("r16-d2-timestamp-m", "m: !!timestamp {a: 1}\n" + WF),
    ("r16-d3-set-m", "m: !!set {a: null}\n" + WF),
    ("r16-d4-binary-m", "m: !!binary {a: 1}\n" + WF),
    ("r16-d5-binary-on", "on: !!binary {schedule: {}}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("r16-d6-int-seq", "m: !!int [1, 2]\n" + WF),
    ("r16-d7-str-seq", "m: !!str [1, 2]\n" + WF),
    ("r16-d8-int-on-list", "on: !!int [schedule]\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("r16-d9-str-on-list", "on: !!str [schedule]\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("r16-d10-int-blockmap", "m: !!int\n  a: 1\n" + WF),
    ("r16-d11-int-on-block", "on: !!int\n  schedule: {}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("r16-d12-nested", "m:\n  n: !!int {a: 1}\n" + WF),
    ("r16-d13-deep", "m:\n  n:\n    o: !!bool {a: 1}\n" + WF),
    ("r16-d14-scalar-int", "a: !!int 1\n" + WF),
    ("r16-d15-scalar-str", "a: !!str 1\n" + WF),
    ("r16-d16-scalar-bool", "a: !!bool true\n" + WF),
    ("r16-d17-int-key", "!!int 1: x\n" + WF),
    ("r16-d18-map-key", "!!int {a: 1}: x\n" + WF),
    ("r16-d19-int-jobs", "on: schedule\njobs: !!int {check: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}}\n"),
    ("r16-d20-int-on-multi", "on: !!int {schedule: {}, workflow_dispatch: {}}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("r16-d21-omap-m", "m: !!omap {a: 1}\n" + WF),
    ("r16-d22-pairs-m", "m: !!pairs {a: 1}\n" + WF),
    ("r16-d23-anchor-tag-map", "&q: !!int {on: schedule}\n"),
    ("r16-d24-anchor-tag-seq", "&q: !!str [1, 2]\n"),
    # ---- E: §2.4 grid residuals ----
    ("r16-e1-tag-noanchor-flow", "m: {!zap : 2}\n" + WF),
    ("r16-e2-tag-noanchor-root", "!zap : 2\n" + WF),
    ("r16-e3-tag-noanchor-null", "m:\n  !zap :\n" + WF),
    ("r16-e4-tag-noanchor-quoted", 'm:\n  !zap "": 2\n' + WF),
    ("r16-e5-tag-noanchor-plain", "m:\n  !zap x: 2\n" + WF),
    ("r16-e6-tag-noanchor-second", "m:\n  a: 1\n  !zap : 2\n" + WF),
    ("r16-e7-tag-noanchor-seq", "m:\n  - !zap : 2\n" + WF),
    ("r16-e8-tag-noanchor-deep", "a:\n  b:\n    !zap : 2\n" + WF),
    ("r16-e9-flow-notag", "m: {&q: {a: 1}}\n" + WF),
    ("r16-e10-flow-seq", "m: {&q:!!str [1, 2]}\n" + WF),
    ("r16-e11-flow-second", "m: {a: 1, &q:!!str {c: 3}}\n" + WF),
    ("r16-e12-flow-scalar", "m: {&q:!!str hello}\n" + WF),
    ("r16-e13-flow-spaced", "m: {&q: !!str {a: 1}}\n" + WF),
    ("r16-e14-flow-blockseq", "m: [{&q:!!str {a: 1}}]\n" + WF),
    ("r16-e15-flow-valpos-map", "m: {a: &q:!!str {c: 3}}\n" + WF),
    ("r16-e16-flow-valpos-scalar", "m: {a: &q:!!str hello}\n" + WF),
    ("r16-e17-flow-valpos-notag", "m: {a: &q: {c: 3}}\n" + WF),
    ("r16-e18-flow-valpos-seq", "m: {a: &q: [1, 2]}\n" + WF),
    ("r16-e19-block-coll-map", "m:\n  &q: {a: 1}\n" + WF),
    ("r16-e20-block-coll-seq", "m:\n  &q: [1, 2]\n" + WF),
    ("r16-e21-block-coll-blockmap", "m:\n  &q:\n    a: 1\n" + WF),
    ("r16-e22-block-coll-tag", "m:\n  !zap &q: {a: 1}\n" + WF),
    ("r16-e23-block-scalar", "m:\n  &q: 1\n" + WF),
    ("r16-e24-flow-seqitem-map", "m: [&q:!!str {a: 1}]\n" + WF),
    ("r16-e25-flow-seqitem-scalar", "m: [&q: 1]\n" + WF),
    # ---- F: (c) x nospace interaction ----
    ("r16-f1-tag-nospace-flow", "!zap &q:!!str {on: schedule}\n"),
    ("r16-f2-tag-nospace-block", "!zap &q:!!str\n  on: schedule\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n"),
    ("r16-f3-handle-nospace", "!!str &q:!!str {on: schedule}\n"),
    ("r16-f4-tag-nospace-int", "!zap &q:!!int {on: schedule}\n"),
    ("r16-f5-tag-nospace-2nd", "a: 1\n!zap &q:!!str {c: 3}\n" + WF),
    ("r16-f6-tag-nospace-valpos", "m: !zap &q:!!str {a: 1}\n" + WF),
    ("r16-f7-tag-nospace-onval", "on: !zap &q:!!str {schedule: {}}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("r16-f8-tag-nospace-full", "!zap &q:!!str {on: schedule, jobs: {check: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}}}\n"),
    ("r16-f9-tag-nospace-empty", "!zap &q:!!str {}\n"),
    ("r16-f10-tag-nospace-seq", "!zap &q:!!str [1, 2]\n"),
    # ---- G: novel hunt ----
    ("r16-g1-nospace-wd", "&q:!!str {on: workflow_dispatch}\n"),
    ("r16-g2-nospace-on-list", "&q:!!str {on: [push, pull_request]}\n"),
    ("r16-g3-nospace-full", "&q:!!str {on: schedule, jobs: {check: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}}}\n"),
    ("r16-g4-nospace-full-block", "&q:!!str\n  on: schedule\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n"),
    ("r16-g5-deep-third", "a:\n  b:\n    c: 1\n    d: 2\n    !zap &q : 3\n" + WF),
    ("r16-g6-seqitem-2nd", "m:\n  - a: 1\n    !zap &q : 3\n" + WF),
    ("r16-g7-qmark-nospace", "? &q:!!str {on: schedule}\n"),
    ("r16-g8-docmark-nospace", "---\n&q:!!str {on: schedule}\n"),
    ("r16-g9-nospace-comment", "&q:!!str {on: schedule} # comment\n"),
    ("r16-g10-two-docs", "&q:!!str {on: schedule}\n---\n"),
    ("r16-g11-str-on-multi", "on: !!str {schedule: {}, push: {}}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("r16-g12-nested-tagged", "m: !!int {a: !!str {b: 1}}\n" + WF),
    ("r16-g13-nested-tagged-same", "m: !!int {a: !!int {b: 1}}\n" + WF),
    ("r16-g14-nested-nospace-flow", "&q:!!str {a: &w:!!str {b: 1}}\n"),
    ("r16-g15-nospace-2pair", "&q:!!str {a: 1, b: 2}\n"),
    ("r16-g16-nospace-name", "&q:!!str {on: schedule, name: x}\n"),
    ("r16-g17-map-tag-lone", "!!map {a: 1}\n" + WF),
    ("r16-g18-seq-tag-lone", "!!seq [1, 2]\n" + WF),
    ("r16-g19-str-tag-map-root", "!!str {a: 1}\n" + WF),
    ("r16-g20-custom-tag-map", "!zap {a: 1}\n" + WF),
    ("r16-g21-anchor-custom-tag-map", "&q: !zap {on: schedule}\n"),
    ("r16-g22-anchor-nospace-custom-tag", "&q:!zap {on: schedule}\n"),
    ("r16-g23-anchor-nospace-custom-tag-block", "&q:!zap\n  on: schedule\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n"),
    ("r16-g24-tab-after-colon", "&q:\t!!str {on: schedule}\n"),
    ("r16-g25-tab-indent", "&q:!!str\n\ton: schedule\n"),
    ("r16-g26-self-alias-nospace", "&q:!!str {on: *q}\n"),
    ("r16-g27-alias-inside-nospace", "x: &w 1\n&q:!!str {on: *w}\n"),
    ("r16-g28-flowmap-then-pair", "&q:!!str {on: push}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("r16-g29-bool-tag-boolseq", "&q: !!bool [true, false]\n"),
    ("r16-g30-int-on-multi", "on: !!int {push: {}, pull_request: {}}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    # ---- H: R13 §4.2 exemption edges, rebuilt ----
    ("r16-h1-flow-exempt", "m: {&q: 3}\n" + WF),
    ("r16-h2-flow-exempt-2pair", "m: {&q: 3, b: 2}\n" + WF),
    ("r16-h3-nested-single", "m:\n  &q: 3\n" + WF),
    ("r16-h4-first-null-glued", "&q:\n" + WF),
    ("r16-h5-first-space", "&q :\n" + WF),
    ("r16-h6-null-nonfirst", "name: probe\n&q:\n" + WF),
    ("r16-h7-first-coll-val", "&q: [1]\n" + WF),
    ("r16-h8-two-props", "!zap &q: 3\n" + WF),
    ("r16-h9-blockseq-single", "m:\n  - &q: 3\n" + WF),
    # ---- I: R14 5-family spot rebuilds, fresh identifiers ----
    ("r16-i1-unwrap", "&w: {on: workflow_dispatch}\n"),
    ("r16-i2-second-anchor", "&w: &z 9\n"),
    ("r16-i3-key-tag", "!qux &w: 7\n"),
    ("r16-i4-unglued", "&w : 7\n"),
    ("r16-i5-nested-block", "&w:\n  &z: 7\n"),
    ("r16-i6-lone-doc", "&w: 9\n"),
    # ---- N: boundary mapping for the 2 new P0 families found by R16 ----
    # P0-A: mirror alias-key exclusion (c15 family)
    ("r16-n1-alias-key-lone", "x: &w 1\n&q:!!str *w: 2\n"),
    ("r16-n2-alias-key-push", "x: &w 1\n&q:!!str *w: 2\n" + WFP),
    ("r16-n3-alias-key-int-tag", "x: &w 1\n&q:!!int *w: 2\n" + WF),
    ("r16-n4-alias-key-custom-tag", "x: &w 1\n&q:!zap *w: 2\n" + WF),
    ("r16-n5-alias-key-quoted-dq", 'x: &w 1\n&q:!!str "hello": 2\n' + WF),
    ("r16-n6-alias-key-quoted-sq", "x: &w 1\n&q:!!str 'hello': 2\n" + WF),
    ("r16-n14-alias-seq-key", "x: &w [1]\n&q:!!str *w: 2\n" + WF),
    ("r16-n15-alias-undef-key", "&q:!!str *w: 2\n" + WF),
    ("r16-n16-alias-key-qmark", "? &q:!!str *w: 2\n" + WF),
    ("r16-n18-alias-key-spaced", "x: &w 1\n&q: !!str *w: 2\n" + WF),
    # P0-B: anchor absorbs ':' + non-tag content, WF tail (c16/c17 family)
    ("r16-n7-absorb-2-push", "&q:2\n" + WFP),
    ("r16-n8-absorb-foo-push", "&q:foo\n" + WFP),
    ("r16-n9-absorb-2-lone", "&q:2\n"),
    ("r16-n10-absorb-hyphen-push", "&q:bar-baz\n" + WFP),
    ("r16-n11-absorb-num-push", "&q:123\n" + WFP),
    ("r16-n12-absorb-2x-push", "&q:2x\n" + WFP),
    ("r16-n13-absorb-value-pos", "m: &q:2\n" + WFP),
    ("r16-n17-absorb-flow", "m: {&q:2}\n" + WF),
]


def main() -> None:
    here = Path(__file__).resolve().parent
    rows = [{"id": i, "yaml": y, "mode": "both", "expected_diff": False,
             "diff_modes": []} for i, y in CASES]
    ids = [r["id"] for r in rows]
    assert len(ids) == len(set(ids)), "duplicate ids"
    (here / "cases.json").write_text(
        json.dumps(rows, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} cases -> {here / 'cases.json'}")


if __name__ == "__main__":
    main()
