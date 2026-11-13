"""FIX-P0-17 probe cases (written fresh by the fixer).

Groups:
  A  P0-A (R16): mirror alias-key exemption over-broad — rebuilt
     with fresh identifiers (anchors &r/&s, value 5, events
     push/release), plus scalar/quoted/? /value-pos/spaced controls.
  B  P0-B (R16): anchor absorbs ':' — rebuilt with fresh
     identifiers, root/value/flow positions, plus lone control.
  C  P0-B boundary grid: multi-colon, double-colon, tag-after,
     scalar value, colon-space, seq item, nested, flow-val,
     flow-key-map, comment, docmark, `&r:` null, `&r: 5` C3,
     `&r:!zap`, hyphen/underscore, flow-seq, two anchors,
     `? &r:5`, dotted/slashed anchors.
  D  P0-A boundary grid: alias-key tag variants, alias targets
     (scalar/seq/undef), quoted keys, anchor-then-alias,
     alias-after-anchor, value-pos guards.
  E  Flow null-key boundary (rule (iii)): `{&r:5}`,
     `{&r:5, b: 1}`, `{&r:5: 1}`, `{&r:5: }`, `{&r:5 : 1}`,
     `{&r:5 {a: 1}}`, `{&r:5 hello: 1}`, `{&r: 1}` control,
     `{&r: }` probe, `{&r: 1, b: 2}` control.
  F  Alias-colon shapes: `*s: 5` key/value/flow/undef,
     `*s : 5` spaced control, `*s:!zap` tag-after-colon.
  G  Lone-doc absorbed shapes: `&r:5: 1` lone, `&r:5:` EOL lone.

Every row runs trigger + jobs mode. No expected_diff rows: any
DIFF is a failure of the fix (or a disclosed residual in §7).
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

WF_PUSH = """on: push
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
"""
WF_SCHED = """on: schedule
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
"""
WF_REL = """on: release
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
"""

CASES: list[tuple[str, str]] = []


def add(sid: str, text: str) -> None:
    CASES.append((sid, text))


# ---- A: P0-A rebuilt (R16 c15/n1-n4/n14/n15) ----
add("p17-a-alias-key", "x: &s 5\n&r:!!str *s: 5\n" + WF_SCHED)
add("p17-a-alias-key-push", "x: &s 5\n&r:!!str *s: 5\n" + WF_PUSH)
add("p17-a-alias-key-lone", "x: &s 5\n&r:!!str *s: 5\n")
add("p17-a-alias-key-int", "x: &s 5\n&r:!!int *s: 5\n" + WF_SCHED)
add("p17-a-alias-key-custom", "x: &s 5\n&r:!zap *s: 5\n" + WF_SCHED)
add("p17-a-alias-seq-key", "x: &s [5]\n&r:!!str *s: 5\n" + WF_SCHED)
add("p17-a-alias-undef-key", "&r:!!str *s: 5\n" + WF_SCHED)
# A controls (must stay MATCH)
add("p17-a-ctrl-scalar-key", "&r:!!str hello: 5\n" + WF_SCHED)
add("p17-a-ctrl-quoted-dq", 'x: &s 5\n&r:!!str "hello": 5\n' + WF_SCHED)
add("p17-a-ctrl-quoted-sq", "x: &s 5\n&r:!!str 'hello': 5\n" + WF_SCHED)
add("p17-a-ctrl-qmark", "? &r:!!str *s: 5\n" + WF_SCHED)
add("p17-a-ctrl-spaced", "x: &s 5\n&r: !!str *s: 5\n" + WF_SCHED)
add("p17-a-ctrl-value-pos", "m: &r:!!str {a: 5}\n" + WF_SCHED)
add("p17-a-ctrl-on-value", "on: &r:!!str {release: {}}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n")

# ---- B: P0-B rebuilt (R16 c16/c17/n7/n8/n10/n11/n12/n13/n17) ----
add("p17-b-absorb-2", "&r:5\n" + WF_SCHED)
add("p17-b-absorb-2-push", "&r:5\n" + WF_PUSH)
add("p17-b-absorb-foo", "&r:foo\n" + WF_SCHED)
add("p17-b-absorb-hyphen", "&r:bar-baz\n" + WF_PUSH)
add("p17-b-absorb-num", "&r:123\n" + WF_PUSH)
add("p17-b-absorb-2x", "&r:5x\n" + WF_PUSH)
add("p17-b-absorb-value-pos", "m: &r:5\n" + WF_PUSH)
add("p17-b-absorb-flow", "m: {&r:5}\n" + WF_SCHED)
add("p17-b-absorb-lone", "&r:5\n")

# ---- C: P0-B boundary grid ----
add("p17-c-multi-colon", "&r:5:6\n" + WF_PUSH)
add("p17-c-multi-colon-lone", "&r:5:6\n")
add("p17-c-double-colon", "&r::5\n" + WF_PUSH)
add("p17-c-tag-after", "&r:5!zap {a: 1}\n" + WF_SCHED)
add("p17-c-tag-after-spaced", "&r:5 !zap {a: 1}\n" + WF_SCHED)
add("p17-c-scalar-val", "&r:5 1\n" + WF_SCHED)
add("p17-c-colon-space", "&r:5: 1\n" + WF_SCHED)
add("p17-c-seq-item", "m:\n  - &r:5\n    a: 1\n" + WF_PUSH)
add("p17-c-nested-value", "m:\n  &r:5\n  a: 1\n" + WF_PUSH)
add("p17-c-nested-map-val", "m: &r:5\n  a: 1\n" + WF_SCHED)
add("p17-c-flow-val", "m: {a: &r:5}\n" + WF_SCHED)
add("p17-c-flow-key-map", "m: {&r:5: {a: 1}}\n" + WF_SCHED)
add("p17-c-comment", "&r:5 # comment\n" + WF_PUSH)
add("p17-c-docmark", "&r:5\n---\n" + WF_PUSH)
add("p17-c-anchor-only-colon", "&r:\n" + WF_SCHED)
add("p17-c-space-after-colon", "&r: 5\n" + WF_PUSH)
add("p17-c-tag-colon", "&r:!zap {on: schedule}\n" + WF_SCHED)
add("p17-c-tag-colon-lone", "&r:!zap {on: schedule}\n")
add("p17-c-tag-root-block", "&x:!!tag\n" + WF_PUSH)
add("p17-c-tag-root-block-1", "&x:!tag\n" + WF_PUSH)
add("p17-c-tag-nobrace", "&b:!!str{on: pull_request}\n")
add("p17-c-qmark-colon", "&x:?\n" + WF_PUSH)
add("p17-c-comma-colon", "&x:,\n" + WF_PUSH)
add("p17-c-dot-direct", "&q.5\n" + WF_PUSH)
add("p17-c-bang-direct", "&q!2\n" + WF_PUSH)
add("p17-c-slash-direct", "&q/2\n" + WF_PUSH)
add("p17-c-hyphen-num", "&r:bar-baz-9\n" + WF_PUSH)
add("p17-c-underscore", "&r:foo_bar\n" + WF_PUSH)
add("p17-c-flow-seq", "m: [&r:5]\n" + WF_SCHED)
add("p17-c-two-anchors", "&r:5 &s:6\n" + WF_PUSH)
add("p17-c-qmark", "? &r:5\n" + WF_SCHED)
add("p17-c-dotted", "&r:5.5\n" + WF_PUSH)
add("p17-c-slashed", "&r:5/6\n" + WF_PUSH)
add("p17-c-comma", "&r:5,6\n" + WF_PUSH)
add("p17-c-anchor-tag-prop", "!zap &r:5\n" + WF_PUSH)
add("p17-c-anchor-after-alias", "x: &s 5\n*s &r:5\n" + WF_PUSH)
add("p17-c-flow-second", "m: {a: 1, &r:5}\n" + WF_SCHED)
add("p17-c-flow-key-scalar", "m: {&r:5 hello: 1}\n" + WF_SCHED)
add("p17-c-nested-flow-key", "m:\n  n: {&r:5}\n" + WF_SCHED)

# ---- D: P0-A boundary grid ----
add("p17-d-alias-key-bool-tag", "x: &s 5\n&r:!!bool *s: 5\n" + WF_SCHED)
add("p17-d-alias-key-nested", "m:\n  x: &s 5\n  &r:!!str *s: 5\n" + WF_SCHED)
add("p17-d-alias-key-second", "a: 1\nx: &s 5\n&r:!!str *s: 5\n" + WF_SCHED)
add("p17-d-alias-key-anchor-then", "x: &s 5\n&r:!!str &t *s: 5\n" + WF_SCHED)
add("p17-d-alias-key-two-props", "!zap &r:!!str *s: 5\nx: &s 5\n" + WF_SCHED)
add("p17-d-alias-key-flow", "x: &s 5\nm: {&r:!!str *s: 5}\n" + WF_SCHED)
add("p17-d-alias-key-flow-val", "m: {a: &r:!!str *s: 5}\n" + WF_SCHED)
add("p17-d-alias-key-seq-item", "m:\n  - &r:!!str *s: 5\nx: &s 5\n" + WF_SCHED)
add("p17-d-alias-key-tab", "x: &s 5\n&r:\t!!str *s: 5\n" + WF_SCHED)
add("p17-d-ctrl-plain-key-tab", "&r:!!str hello\t: 5\n" + WF_SCHED)

# ---- E: flow null-key boundary (rule iii) ----
add("p17-e-flow-null-key", "m: {&r:5}\n" + WF_SCHED)
add("p17-e-flow-null-key-2nd", "m: {&r:5, b: 1}\n" + WF_SCHED)
add("p17-e-flow-colon-scalar", "m: {&r:5: 1}\n" + WF_SCHED)
add("p17-e-flow-colon-null", "m: {&r:5: }\n" + WF_SCHED)
add("p17-e-flow-colon-spaced", "m: {&r:5 : 1}\n" + WF_SCHED)
add("p17-e-flow-colon-map", "m: {&r:5: {a: 1}}\n" + WF_SCHED)
add("p17-e-flow-colon-tag", "m: {&r:5: !zap 1}\n" + WF_SCHED)
add("p17-e-flow-colon-alias", "x: &s 5\nm: {&r:5: *s}\n" + WF_SCHED)
add("p17-e-flow-colon-anchor", "m: {&r:5: &s 1}\n" + WF_SCHED)
add("p17-e-flow-key-map", "m: {&r:5 {a: 1}}\n" + WF_SCHED)
add("p17-e-flow-key-scalar", "m: {&r:5 hello: 1}\n" + WF_SCHED)
add("p17-e-flow-ctrl-anchor-space", "m: {&r: 1}\n" + WF_SCHED)
add("p17-e-flow-ctrl-anchor-space-2nd", "m: {&r: 1, b: 2}\n" + WF_SCHED)
add("p17-e-flow-null-spaced", "m: {&r: }\n" + WF_SCHED)
add("p17-e-flow-alias-val", "x: &s 5\nm: {&r: *s}\n" + WF_SCHED)
add("p17-e-flow-anchor-val", "m: {&r: &s 1}\n" + WF_SCHED)
add("p17-e-flow-colon-tag-spaced", "m: {&r:5 : !zap 1}\n" + WF_SCHED)
add("p17-e-flow-colon-alias-spaced", "x: &s 5\nm: {&r:5 : *s}\n" + WF_SCHED)
add("p17-e-flow-colon-anchor-spaced", "m: {&r:5 : &s 1}\n" + WF_SCHED)
add("p17-e-flow-nested-key", "m:\n  n: {&r:5}\n" + WF_SCHED)
add("p17-e-flow-val-null", "m: {a: &r:5}\n" + WF_SCHED)

# ---- F: alias-colon shapes ----
add("p17-f-alias-colon-key", "x: &s 5\n*s: 5\n" + WF_PUSH)
add("p17-f-alias-colon-key-lone", "x: &s 5\n*s: 5\n")
add("p17-f-alias-colon-value", "x: *s: 5\n" + WF_PUSH)
add("p17-f-alias-colon-flow", "x: &s 5\nm: {*s: 5}\n" + WF_SCHED)
add("p17-f-alias-colon-undef", "*s: 5\n" + WF_PUSH)
add("p17-f-alias-colon-spaced", "x: &s 5\n*s : 5\n" + WF_PUSH)
add("p17-f-alias-colon-tag", "x: &s 5\n*s:!zap {a: 1}\n" + WF_SCHED)
add("p17-f-alias-colon-dot", "x: &s 5\n*s.5: 6\n" + WF_PUSH)

# ---- G: lone-doc absorbed shapes ----
add("p17-g-lone-colon-scalar", "&r:5: 1\n")
add("p17-g-lone-colon-eol", "&r:5:\n")
add("p17-g-lone-colon-map", "&r:5: {on: push}\n")
add("p17-g-lone-absorb", "&r:5\n")
add("p17-g-lone-absorb-map", "&r:5: {on: push}\n" + WF_PUSH)
add("p17-g-lone-tag", "&x:!!tag\n")
add("p17-g-lone-bang", "&x:!tag\n")


def main() -> int:
    rows = [
        {"id": sid, "yaml": text, "mode": "both",
         "expected_diff": False, "diff_modes": []}
        for sid, text in CASES
    ]
    (HERE / "cases.json").write_text(
        json.dumps(rows, indent=1, ensure_ascii=False) + "\n",
        encoding="utf-8")
    print(f"wrote {len(rows)} cases")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
