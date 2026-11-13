"""Generate evidence/probes/fix-p0-13/cases.json for FIX-P0-13.

Every shape is a full workflow document (the probe compares the
whole TriggerIR in trigger mode and the whole job list in jobs
mode). Shapes are rebuilt from the FIX-P0-13 mapping rounds
(map-p0-13.py, map2/map3/map4/map5-p0-13.py) and the R12 review
report §2–§4 text — NOT copied from the reviewer's cases.json.

Groups:
  C1  tag suffix swallowing a flow `,` (R12 P0-C1) + controls
  C2  tag suffix `[` / `]` charset (R12 P0-C2) + controls
  C3  anchored empty key (R12 P0-C3) + controls
  ESC percent-escape edge cases for the raw-suffix checks
  LONE lone-document residuals (pre-existing, flagged)

Usage (from the repo root):
    python3 evidence/probes/fix-p0-13/gen-cases.py
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

TAIL = ("name: probe\non: push\njobs:\n  test:\n"
        "    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n")


def doc(fragment, slot="m"):
    if slot == "m":
        return fragment + "\n" + TAIL
    return fragment + "\n" + TAIL  # root slot: fragment first, same tail


# (id, yaml, note, known_divergence)
SHAPES = [
    # ---- C1: tag suffix swallows a flow `,` (R12 P0-C1) ----
    ("c1-a60", doc("m: {a: !foo, b: 1}"), "R12 C1a/A60 core: tag-comma, pair follows", False),
    ("c1-x04", doc("m: {a: !foo, b: 1, c: 2}"), "R12 C1b/X04: another pair follows", False),
    ("c1-y03", doc('m: {a: !foo, "b": 1}'), "R12 C1c/Y03: quoted node after comma", False),
    ("c1-y05", doc("m: {a: !foo,\n b: 1}"), "R12 C1d/Y05: node on next line", False),
    ("c1-y08", doc("m: {a: !foo, &x 1: 2}"), "R12 C1e/Y08: anchor-prefixed node", False),
    ("c1-y09", doc("m: {a: !foo, 1: 2}"), "R12 C1f/Y09: numeric node", False),
    ("c1-y10", doc("m: {a: !foo, b:}"), "R12 C1g/Y10: null-value node", False),
    ("c1-x11", doc("a: !foo,\n  b: 1", "root"), "R12 C1h/X11 reverse: block variant", False),
    ("c1-val-notpair", doc("m: {a: !foo, 1}"), "value (not pair) after comma: both reject after fix", False),
    ("c1-val-then-pair", doc("m: {a: !foo, 1, b: 2}"), "value then pair after comma", False),
    ("c1-key-nocolon", doc("m: {a: !foo, b}"), "key without colon after comma", False),
    ("c1-on-key", doc("m: {!foo, b: 1}"), "tag-comma on a KEY in flow map", False),
    ("c1-verbatim-comma", doc("m: {a: !<tag:x>, b: 1}"), "verbatim tag + comma: already both INVALID", False),
    ("c1-block-eol", doc("a: !foo,", "root"), "block tag-comma at EOL", False),
    ("c1-trailing", doc("m: {a: !foo,}"), "trailing comma in flow map: already both INVALID", False),
    ("c1-last-pair", doc("m: {a: 1, b: !foo,}"), "tag-comma as last pair: already both INVALID", False),
    ("c1-flowseq-key", doc("m: [{a: !foo, b: 1}]"), "flow map inside flow seq: innermost is map", False),
    ("c1-seq-in-map", doc("m: {a: [!foo, b: 1]}"), "control: flow seq inside flow map stays VALID", False),
    ("c1-double-comma", doc("m: {a: !foo,, b: 1}"), "double comma: already both INVALID", False),
    ("c1-alias-after", doc("m: {a: !foo, *x}"), "alias after comma: already both INVALID", False),
    ("c1-two-commas", doc("m: {a: !foo,bar, b: 1}"), "two commas: suffix ends with comma", False),
    ("c1-handle", doc("m: {a: !!str, b: 1}"), "handle tag + comma", False),
    ("c1-block-sameline", doc("a: !foo, b: 1", "root"), "block same line: already both INVALID", False),
    ("c1-seqval-after", doc("m: {a: !foo, [1, 2]}"), "seq value after comma (Oracle-side close)", False),
    ("c1-mapval-after", doc("m: {a: !foo, {b: 1}}"), "map value after comma (Oracle-side close)", False),
    ("c1-on-slot", "on: {push: {types: [opened]}, !foo, b: 1}\nname: probe\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "tag-comma inside on: slot: already both INVALID", False),
    ("c1-bang-comma", doc("m: {a: !, b: 1}"), "bare ! tag + comma", False),
    ("c1-tag-comma-crlf", doc("m: {a: !foo,\r\n b: 1}\r\n" + TAIL.replace("\n", "\r\n")), "CRLF line endings", False),
    ("c1-seqitem-flowmap", doc("m:\n  - {a: !foo, b: 1}"), "flow map in a seq item", False),
    ("c1-anchor-then-comma", doc("m: {a: &x, b: 1}"), "control: anchor + comma, no tag", False),
    ("c1-nested-map", doc("m: {a: {b: !foo, c: 1}}"), "nested flow map", False),
    ("c1-nested-comma", doc("m: {a: {b: !foo, c: 1}, d: 2}"), "nested flow map + outer pair", False),
    ("c1-squote-key", doc("m: {a: !foo, 'b': 1}"), "single-quoted key after comma", False),
    ("c1-docroot-flow", doc("{a: !foo, b: 1}", "root"), "flow map at document root", False),
    # C1 controls (must stay MATCH-accept)
    ("c1-y01", doc("m: [!foo, a: 1]"), "control Y01: flow seq with pair", False),
    ("c1-y02", doc("m: [!foo, a: 1, b: 2]"), "control Y02: flow seq, two pairs", False),
    ("c1-x02", doc("m: {a: !foo,bar 1}"), "control X02: comma mid-suffix", False),
    ("c1-x05", doc("m: [!foo, 1]"), "control X05: flow seq, scalar", False),
    ("c1-x06", doc("m: [!foo, b]"), "control X06: flow seq, bare scalar", False),
    ("c1-x13", doc("m: {a: !foo , b: 1}"), "control X13: space before comma", False),
    # ---- C2: tag suffix `[` / `]` (R12 P0-C2) ----
    ("c2-a70", doc("m: {a: !foo[bar] 1}"), "R12 C2a/A70 core", False),
    ("c2-x08", doc("m: [!foo] 1]"), "R12 C2b/X08 reverse: tag swallows ]", False),
    ("c2-x09", doc("m: [!foo], 1]"), "R12 C2c/X09 reverse: ] then comma", False),
    ("c2-mid-bracket", doc("m: {a: !foo[bar]baz 1}"), "bracket mid-suffix with trailing text", False),
    ("c2-rbrack-noval", doc("m: {a: !foo] 1}"), "rbrack, no value after", False),
    ("c2-lbrack-space", doc("m: {a: !foo[ 1}"), "lbrack then space", False),
    ("c2-empty-brackets", doc("m: {a: !foo[] 1}"), "empty brackets", False),
    ("c2-nested-brackets", doc("m: {a: !foo[[x]] 1}"), "nested brackets", False),
    ("c2-tagbracket-key", doc("m: {!foo[bar]: 1}"), "tag-bracket on a key", False),
    ("c2-block-tagbracket", doc("a: !foo[bar] 1", "root"), "block tag-bracket", False),
    ("c2-tagbracket-seq", doc("m: [!foo[bar] 1]"), "tag-bracket in a flow seq", False),
    ("c2-block-tagbracket-key", doc("!foo[bar]: 1\n" + TAIL, "root"), "tag-bracket on a block key", False),
    ("c2-tagbracket-nonode", doc("m: {a: !foo[bar]}"), "control: no node, already both INVALID", False),
    # C2 controls (must stay MATCH)
    ("c2-verbatim-bracket", doc("m: {a: !<foo[bar]> 1}"), "control: verbatim tag with brackets", False),
    ("c2-quoted-bracket", doc('m: {a: "x[y"}'), "control: bracket in quoted scalar", False),
    ("c2-a65", doc("m: {a: !foo]}"), "control A65: already both INVALID", False),
    ("c2-rbrack-comma", doc("m: {a: !foo], b: 1}"), "control: already both INVALID", False),
    # ---- C3: anchored empty key (R12 P0-C3) ----
    ("c3-a45", doc("&x: 1", "root"), "R12 C3/A45 core: anchored empty key, doc root", False),
    ("c3-last-pair", "name: probe\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n&x: 1\n", "anchored key, LAST pair", False),
    ("c3-space-colon", doc("&x : 1", "root"), "space before colon still rejects", False),
    ("c3-under-m", doc("m:\n  &x: 1\n  b: 2"), "nested under m, 2 pairs", False),
    ("c3-nested-block", doc("a:\n  &x: 1\n  b: 2"), "nested block, 2 pairs", False),
    ("c3-on-first", "on: push\n&x: 1\nname: probe\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "anchored key after on:", False),
    ("c3-two-anchored", doc("&x: 1\n&y: 2", "root"), "two anchored keys (duplicate empty key)", False),
    ("c3-anchor-quoted", doc('&x: "1"', "root"), "anchored key, quoted value", False),
    ("c3-anchor-blockval", doc("&x:\n  a: 1", "root"), "anchor on nested block value", False),
    ("c3-anchor-nullval-mid", "name: probe\n&x:\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "null value, middle position", False),
    ("c3-null-last", "name: probe\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n&x:\n", "null value, LAST position", False),
    ("c3-null-nested-last", doc("a:\n  b: 2\n  &x:"), "null value, nested last", False),
    ("c3-null-first-space", doc("&x :\n", "root"), "null value, first, but space before colon", False),
    ("c3-anchor-another-anchor", doc("&x: &y 1", "root"), "anchor on key + anchor on value", False),
    ("c3-tag-anchor-key", doc("!foo &x: 1", "root"), "tag then anchor on empty key", False),
    ("c3-anchor-flowval", doc("&x: {a: 1}", "root"), "anchor on flow-map value", False),
    ("c3-anchor-seqval", doc("&x: [1, 2]", "root"), "anchor on flow-seq value", False),
    ("c3-anchor-blockseq-val", doc("&x:\n  - 1\n  - 2", "root"), "anchor on block-seq value", False),
    ("c3-seqitem-2pairs", doc("m:\n  - &x: 1\n    b: 2"), "seq-item mapping, 2 pairs", False),
    ("c3-anchor-tag-value", doc("&x: !foo 1", "root"), "anchor on key, tag on value", False),
    # C3 controls (must stay MATCH)
    ("c3-flow", doc("m: {&x: 1}"), "control: flow mapping", False),
    ("c3-flow-pair", doc("m: {&x: 1, b: 2}"), "control: flow mapping + pair", False),
    ("c3-blockseq-steps", "name: probe\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - &x: 1\n", "control: seq item, single pair", False),
    ("c3-explicit", doc("? &x: 1", "root"), "control: explicit key, already both INVALID", False),
    ("c3-comment-after", doc("&x: 1\n# comment", "root"), "comment after anchored key", False),
    ("c3-blank-after", doc("&x: 1\n", "root"), "blank line after anchored key", False),
    ("c3-nested-single", doc("a:\n  &x: 1"), "control: nested mapping, single pair", False),
    ("c3-under-m-single", doc("m:\n  &x: 1"), "control: under m, single pair", False),
    ("c3-null-first", doc("&x:\n", "root"), "control: null value, FIRST pair", False),
    ("c3-null-nested-first", doc("a:\n  &x:\n  b: 2"), "control: null value, nested FIRST pair", False),
    ("c3-null-nested-only", doc("a:\n  &x:"), "control: nested, single pair, null", False),
    ("c3-null-first-comment", doc("&x:  # c\n", "root"), "control: null, first, comment after colon", False),
    ("c3-null-first-blockseq", doc("m:\n  - &x:\n    b: 2"), "control: seq-item, first, null", False),
    ("c3-null-seqitem-only", doc("m:\n  - &x:"), "control: seq-item, single pair, null", False),
    ("c3-anchor-tag-key", doc("&x !foo: 1", "root"), "control: anchor then tag, already both INVALID", False),
    # ---- ESC: percent escapes in tag suffixes (raw-suffix checks) ----
    ("esc-comma", doc("m: {a: !foo%2C b: 1}"), "escaped comma only: both INVALID already", False),
    ("esc-bracket", doc("m: {a: !foo%5Bbar 1}"), "control: %5B is not a literal [", False),
    ("esc-rbracket", doc("m: {a: !foo%5D 1}"), "control: %5D is not a literal ]", False),
    ("esc-comma-end", doc("m: {a: !foo%2C, b: 1}"), "escaped comma + literal trailing comma", False),
    # ---- LONE: lone-document residuals (pre-existing, NOT closable) ----
    ("lone-scalar", "&x: 1\n", "KNOWN DIVERGENCE (residual, §7): lone doc, TS workflow_root_not_mapping vs Oracle missing_on_key", True),
    ("lone-null", "&x:\n", "KNOWN DIVERGENCE (residual, §7): lone doc, TS workflow_root_not_mapping vs Oracle missing_on_key", True),
]


def main() -> int:
    rows = [
        {"id": sid, "mode": "both", "note": note,
         "known_divergence": div, "yaml": text}
        for sid, text, note, div in SHAPES
    ]
    (HERE / "cases.json").write_text(
        json.dumps(rows, indent=1, ensure_ascii=False) + "\n",
        encoding="utf-8")
    print(f"wrote {len(rows)} shapes, "
          f"{sum(1 for r in rows if r['known_divergence'])} flagged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
