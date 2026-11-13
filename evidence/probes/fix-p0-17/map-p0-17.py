"""FIX-P0-17 parser-level probe (PyYAML side): token stream + load
result of _StrictBaseLoader for P0-A / P0-B shapes. Run from repo root:
    python3 evidence/probes/fix-p0-17/map-p0-17.py [shape-id ...]
Shape ids mirror map-p0-17.mjs.
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(REPO / "oracle"))

WF_PUSH = ("on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n"
           "    steps:\n      - run: echo hi\n")
WF_SCHED = ("on: schedule\njobs:\n  check:\n    runs-on: ubuntu-latest\n"
            "    steps:\n      - run: echo hi\n")

SHAPES = {
    "a-alias-key": "x: &w 1\n&q:!!str *w: 2\n" + WF_SCHED,
    "a-alias-key-push": "x: &w 1\n&q:!!str *w: 2\n" + WF_PUSH,
    "a-alias-key-lone": "x: &w 1\n&q:!!str *w: 2\n",
    "a-alias-key-int": "x: &w 1\n&q:!!int *w: 2\n" + WF_SCHED,
    "a-alias-key-custom": "x: &w 1\n&q:!zap *w: 2\n" + WF_SCHED,
    "a-alias-seq-key": "x: &w [1]\n&q:!!str *w: 2\n" + WF_SCHED,
    "a-alias-undef-key": "&q:!!str *w: 2\n" + WF_SCHED,
    "a-ctrl-scalar-key": "&q:!!str hello: 1\n" + WF_SCHED,
    "a-ctrl-quoted-dq": 'x: &w 1\n&q:!!str "hello": 2\n' + WF_SCHED,
    "a-ctrl-quoted-sq": "x: &w 1\n&q:!!str 'hello': 2\n" + WF_SCHED,
    "a-ctrl-qmark": "? &q:!!str *w: 2\n" + WF_SCHED,
    "a-ctrl-spaced": "x: &w 1\n&q: !!str *w: 2\n" + WF_SCHED,
    "a-ctrl-value-pos": "m: &q:!!str {a: 1}\n" + WF_SCHED,
    "b-absorb-2": "&q:2\n" + WF_SCHED,
    "b-absorb-2-push": "&q:2\n" + WF_PUSH,
    "b-absorb-foo": "&q:foo\n" + WF_SCHED,
    "b-absorb-lone": "&q:2\n",
    "b-absorb-value-pos": "m: &q:2\n" + WF_PUSH,
    "b-absorb-flow": "m: {&q:2}\n" + WF_SCHED,
    "b-absorb-multi-colon": "&q:2:3\n" + WF_PUSH,
    "b-absorb-multi-colon-lone": "&q:2:3\n",
    "b-absorb-double-colon": "&q::2\n" + WF_PUSH,
    "b-absorb-tag-after": "&q:2!zap {a: 1}\n" + WF_SCHED,
    "b-absorb-tag-after-spaced": "&q:2 !zap {a: 1}\n" + WF_SCHED,
    "b-absorb-scalar-val": "&q:2 1\n" + WF_SCHED,
    "b-absorb-colon-space": "&q:2: 1\n" + WF_SCHED,
    "b-absorb-seq-item": ("m:\n  - &q:2\n    on: push\n    jobs:\n      check:\n"
                         "        runs-on: ubuntu-latest\n        steps:\n"
                         "          - run: echo hi\n"),
    "b-absorb-nested-value": ("m:\n  &q:2\n  on: push\n  jobs:\n    check:\n"
                             "      runs-on: ubuntu-latest\n      steps:\n"
                             "        - run: echo hi\n"),
    "b-absorb-nested-map-val": "m: &q:2\n  a: 1\n" + WF_SCHED,
    "b-absorb-flow-val": "m: {a: &q:2}\n" + WF_SCHED,
    "b-absorb-flow-key-map": "m: {&q:2: {a: 1}}\n" + WF_SCHED,
    "b-absorb-comment": "&q:2 # comment\n" + WF_PUSH,
    "b-absorb-docmark": "&q:2\n---\n" + WF_PUSH,
    "b-absorb-anchor-only-colon": "&q:\n" + WF_SCHED,
    "b-absorb-space-after-colon": "&q: 2\n" + WF_PUSH,
    "b-absorb-tag-colon": "&q:!zap {on: schedule}\n",
    "b-absorb-hyphen-num": "&q:bar-baz-9\n" + WF_PUSH,
    "b-absorb-underscore": "&q:foo_bar\n" + WF_PUSH,
    "b-absorb-flow-seq": "m: [&q:2]\n" + WF_SCHED,
    "b-absorb-two-anchors": "&q:2 &w:3\n" + WF_PUSH,
}


def main() -> int:
    import yaml
    from checkpath_oracle.parser import _StrictBaseLoader

    want = sys.argv[1:] or list(SHAPES)
    for sid in want:
        text = SHAPES[sid]
        print(f"===== {sid} =====")
        try:
            toks = list(yaml.scan(text, Loader=_StrictBaseLoader))
            print("TOKENS " + " ".join(
                f"{type(t).__name__}({getattr(t, 'value', '')!r})" for t in toks))
        except Exception as e:  # noqa: BLE001
            print(f"SCAN-ERROR {type(e).__name__}: {str(e)[:200]}")
        try:
            doc = yaml.load(text, Loader=_StrictBaseLoader)
            print("LOAD " + repr(doc)[:400])
        except Exception as e:  # noqa: BLE001
            print(f"LOAD-ERROR {type(e).__name__}: {str(e)[:200]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
