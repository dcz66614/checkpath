"""T013 R13 independent probe — case generator.

Rebuilds every shape from the R12 review report text
(evidence/review/INDEPENDENT_REVIEW_R12.md §2/§3/§4) and the
FIX-P0-13 report's boundary claims, NOT copied from the fixer's
cases.json. Adds:

- flow-KIND discriminant shapes (flow map triggers, flow seq never
  does, incl. seq-in-map and map-in-seq nesting);
- P0-C2 escape / verbatim / key-position controls;
- P0-C3 exemption edges (flow / single-pair / first-pair-null /
  space-before-colon / non-first-null / first-valued /
  double-property / block-seq item);
- lone-document grading set (the fixer's §7 residual): lone
  anchored empty key (scalar + null) plus plain-scalar / string /
  sequence / anchored-scalar / tagged-scalar lone-doc controls, so
  the grading can tell whether the divergence is confined to the
  anchored-empty-key shape;
- the 5 R6 shapes (regression, rebuilt from R10 §2.1 via R12).

Run: python3 gen-cases.py  (writes cases.json)
Then: python3 r13-probe.py
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

WF_TAIL = (
    "name: probe\n"
    "on: push\n"
    "jobs:\n"
    "  test:\n"
    "    runs-on: ubuntu-latest\n"
    "    steps:\n"
    "      - run: echo hi\n"
)


def wf(m_line: str) -> str:
    return m_line + "\n" + WF_TAIL


def c3_doc(first_line: str, rest: str = WF_TAIL) -> str:
    return first_line + "\n" + rest


CASES = [
    # ---- P0-C1 rebuilds (R12 §2.1: A60, X04, Y03, Y05, Y08, Y09, Y10, X11)
    {"id": "r13-c1-a60", "mode": "both", "note": "R12-C1a A60",
     "yaml": wf("m: {a: !foo, b: 1}")},
    {"id": "r13-c1-x04", "mode": "both", "note": "R12-C1b X04",
     "yaml": wf("m: {a: !foo, b: 1, c: 2}")},
    {"id": "r13-c1-y03", "mode": "both", "note": "R12-C1c Y03 quoted key",
     "yaml": wf('m: {a: !foo, "b": 1}')},
    {"id": "r13-c1-y05", "mode": "both", "note": "R12-C1d Y05 newline",
     "yaml": wf("m: {a: !foo,\n b: 1}")},
    {"id": "r13-c1-y08", "mode": "both", "note": "R12-C1e Y08 anchor after comma",
     "yaml": wf("m: {a: !foo, &x 1: 2}")},
    {"id": "r13-c1-y09", "mode": "both", "note": "R12-C1f Y09 numeric key",
     "yaml": wf("m: {a: !foo, 1: 2}")},
    {"id": "r13-c1-y10", "mode": "both", "note": "R12-C1g Y10 null value",
     "yaml": wf("m: {a: !foo, b:}")},
    {"id": "r13-c1-x11", "mode": "both", "note": "R12-C1h X11 block variant",
     "yaml": "a: !foo,\n  b: 1\n" + WF_TAIL},
    # ---- P0-C1 both-accept shapes (fixer T3: both sides accept, must stay MATCH)
    {"id": "r13-c1-both-1", "mode": "both", "note": "both-accept: bare scalar after comma",
     "yaml": wf("m: {a: !foo, 1}")},
    {"id": "r13-c1-both-2", "mode": "both", "note": "both-accept: flow seq after comma",
     "yaml": wf("m: {a: !foo, [1, 2]}")},
    # ---- P0-C1 controls (R12 §2.1 control group)
    {"id": "r13-c1-x02", "mode": "both", "note": "control: comma mid-suffix",
     "yaml": wf("m: {a: !foo,bar 1}")},
    {"id": "r13-c1-y01", "mode": "both", "note": "control: flow seq with pair",
     "yaml": wf("m: [!foo, a: 1]")},
    {"id": "r13-c1-x13", "mode": "both", "note": "control: space before comma",
     "yaml": wf("m: {a: !foo , b: 1}")},
    {"id": "r13-c1-x05", "mode": "both", "note": "control: flow seq comma",
     "yaml": wf("m: [!foo, 1]")},
    # ---- flow-KIND discriminant (my own boundary)
    {"id": "r13-c1-nested-map-in-seq", "mode": "both",
     "note": "flow map nested in flow seq: inner kind is map -> triggers",
     "yaml": wf("m: {a: [!foo, b: 1]}")},
    {"id": "r13-c1-pure-seq", "mode": "both",
     "note": "pure flow seq: never triggers",
     "yaml": wf("m: [!foo, b]")},
    {"id": "r13-c1-seq-in-map", "mode": "both",
     "note": "flow seq nested in flow map: inner kind is seq -> exempt",
     "yaml": wf("m: {a: [!foo, 1]}")},
    {"id": "r13-c1-verbatim-comma", "mode": "both",
     "note": "comma inside verbatim <> is content, not suffix",
     "yaml": wf("m: {a: !<foo,bar> 1, b: 2}")},
    {"id": "r13-c1-escaped-comma", "mode": "both",
     "note": "%2C escape: only literal trailing comma triggers",
     "yaml": wf("m: {a: !foo%2Cbar 1, b: 2}")},
    # ---- P0-C2 rebuilds (R12 §3.1: A70, X08, X09)
    {"id": "r13-c2-a70", "mode": "both", "note": "R12-C2a A70",
     "yaml": wf("m: {a: !foo[bar] 1}")},
    {"id": "r13-c2-x08", "mode": "both", "note": "R12-C2b X08",
     "yaml": wf("m: [!foo] 1]")},
    {"id": "r13-c2-x09", "mode": "both", "note": "R12-C2c X09",
     "yaml": wf("m: [!foo], 1]")},
    # ---- P0-C2 controls
    {"id": "r13-c2-esc-5b", "mode": "both",
     "note": "%5B escape decodes to [ but must NOT trigger (raw suffix)",
     "yaml": wf("m: {a: !foo%5Bbar 1}")},
    {"id": "r13-c2-verbatim", "mode": "both",
     "note": "verbatim tag excluded (handle None)",
     "yaml": wf("m: {a: !<foo[bar]> 1}")},
    {"id": "r13-c2-lbrack-mid", "mode": "both",
     "note": "[ mid-suffix, no closing bracket",
     "yaml": wf("m: {a: !foo[ 1}")},
    {"id": "r13-c2-rbrack-only", "mode": "both",
     "note": "] only suffix",
     "yaml": wf("m: {a: !foo] 1}")},
    {"id": "r13-c2-key-pos", "mode": "both",
     "note": "bracket suffix in key position",
     "yaml": wf("m: {!foo[bar]: 1}")},
    # ---- P0-C3 rebuild (R12 §4.1: A45)
    {"id": "r13-c3-a45", "mode": "both", "note": "R12-C3 A45 anchored empty key",
     "yaml": c3_doc("&x: 1")},
    # ---- P0-C3 exemptions (fixer T5)
    {"id": "r13-c3-flow", "mode": "both", "note": "flow exemption",
     "yaml": wf("m: {&x: 1}")},
    {"id": "r13-c3-flow2", "mode": "both", "note": "flow exemption, 2 pairs",
     "yaml": wf("m: {&x: 1, b: 2}")},
    {"id": "r13-c3-single-nested", "mode": "both",
     "note": "single-pair exemption, nested block mapping",
     "yaml": "m:\n  &x: 1\n" + WF_TAIL},
    {"id": "r13-c3-first-null", "mode": "both",
     "note": "first-pair null value, glued colon -> exempt",
     "yaml": c3_doc("&x:")},
    {"id": "r13-c3-first-null-space", "mode": "both",
     "note": "space between anchor and colon breaks the null exemption",
     "yaml": c3_doc("&x :")},
    {"id": "r13-c3-nonfirst-null", "mode": "both",
     "note": "null value in non-first position -> triggers",
     "yaml": "name: probe\n&x:\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"},
    {"id": "r13-c3-first-valued", "mode": "both",
     "note": "first pair with collection value -> triggers",
     "yaml": c3_doc("&x: [1]")},
    {"id": "r13-c3-double-prop", "mode": "both",
     "note": "double property !foo &x: 1 -> triggers",
     "yaml": c3_doc("!foo &x: 1")},
    {"id": "r13-c3-blockseq", "mode": "both",
     "note": "single pair in block-seq item mapping -> exempt",
     "yaml": "m:\n  - &x: 1\n" + WF_TAIL},
    # ---- lone-document grading set (fixer §7 residual + controls)
    {"id": "r13-lone-scalar", "mode": "both",
     "note": "RESIDUAL: lone doc &x: 1",
     "yaml": "&x: 1\n"},
    {"id": "r13-lone-null", "mode": "both",
     "note": "RESIDUAL: lone doc &x: (null)",
     "yaml": "&x:\n"},
    {"id": "r13-lone-plain", "mode": "both",
     "note": "control: lone plain scalar 1",
     "yaml": "1\n"},
    {"id": "r13-lone-string", "mode": "both",
     "note": "control: lone plain string",
     "yaml": "hello\n"},
    {"id": "r13-lone-seq", "mode": "both",
     "note": "control: lone sequence",
     "yaml": "- a\n- b\n"},
    {"id": "r13-lone-anchored-scalar", "mode": "both",
     "note": "control: lone anchored scalar, no colon",
     "yaml": "&x hello\n"},
    {"id": "r13-lone-tagged", "mode": "both",
     "note": "control: lone tagged scalar",
     "yaml": "!foo 1\n"},
    # ---- R6 regression (rebuilt from R10 §2.1 via R12)
    {"id": "r13-r6-extra", "mode": "both", "note": "R6 core: comment indent 0 after pair",
     "yaml": wf("m: {a: 1\n# note\n, b: 2}")},
    {"id": "r13-r6-on", "mode": "both", "note": "R6 on: slot",
     "yaml": "on: {push: {types: [opened]}\n# note\n, pull_request}\nname: probe\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"},
    {"id": "r13-r6-on-unsupported", "mode": "both",
     "note": "R6 on: slot, unsupported event pull (Oracle UNKNOWN)",
     "yaml": "on: {push: {types: [opened]}\n# note\n, pull}\nname: probe\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"},
    {"id": "r13-r6-close", "mode": "both", "note": "R6 closing comment",
     "yaml": wf("m: {a: 1, b: 2\n# note\n}")},
    {"id": "r13-r6-nestedblock", "mode": "both", "note": "R6 nested block",
     "yaml": "x:\n  m: {a: 1\n# note\n   , b: 2}\n" + WF_TAIL},
]


def main() -> None:
    (HERE / "cases.json").write_text(
        json.dumps(CASES, indent=1, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(CASES)} rows to cases.json")


if __name__ == "__main__":
    main()
