"""T013 R18 independent hunt cases (written fresh by the R18 reviewer).

Target: shape combinations the FIX-P0-18 fixer never probed — absorbed
alias crossed with flow / nested / explicit-key / multiple absorption,
and alias-key crossed with duplicate-key. 25 shapes, 50 checks
(trigger + jobs each). Every case is a full workflow document unless
noted; the anchor `&w:2` (absorbed, resolves to scalar `a`) is defined
on the first line, so `*w:2` always resolves to `a`.
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

WF_TAIL = """on: push
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
"""

# (id, yaml) — yaml is the complete document.
CASES = [
    # H1: absorbed alias key inside a flow sequence of flow maps.
    ("r18-h01-flow-seq-map-alias-key",
     "&w:2 a: 1\nm: [{*w:2: 1}]\n" + WF_TAIL),
    # H2: absorbed alias key in a nested flow map.
    ("r18-h02-nested-flow-alias-key",
     "&w:2 a: 1\nm: {a: {*w:2: 1}}\n" + WF_TAIL),
    # H3: absorbed alias key with an explicit value, after a scalar key
    # that resolves to the same value (duplicate-key crossover, flow).
    ("r18-h03-flow-alias-key-2nd-valued",
     "&w:2 a: 1\nm: {a: 1, *w:2: 2}\n" + WF_TAIL),
    # H4: absorbed alias key with a value first, scalar key second.
    ("r18-h04-flow-alias-key-1st-valued",
     "&w:2 a: 1\nm: {*w:2: 2, a: 1}\n" + WF_TAIL),
    # H5: the same absorbed alias key twice, both with values (flow).
    ("r18-h05-flow-alias-key-twice-valued",
     "&w:2 a: 1\nm: {*w:2: 1, *w:2: 2}\n" + WF_TAIL),
    # H6: explicit-key marker in a flow map with an absorbed alias key.
    ("r18-h06-flow-explicit-alias-key",
     "&w:2 a: 1\nm: {? *w:2: 1}\n" + WF_TAIL),
    # H7: block explicit key with an absorbed alias, value on next line.
    ("r18-h07-block-explicit-alias-key-valued",
     "&w:2 a: 1\n? *w:2\n: 1\n" + WF_TAIL),
    # H8: two different absorbed anchors, both aliases used as values
    # in one flow map.
    ("r18-h08-cross-two-absorbed",
     "&w:2 a: 1\n&v:3 d: 2\nm: {b: *w:2, c: *v:3}\n" + WF_TAIL),
    # H9: absorbed alias as the value of the `on` key inside a flow map.
    ("r18-h09-flow-on-alias-value",
     "&w:2 a: 1\nm: {on: *w:2}\n" + WF_TAIL),
    # H10: absorbed alias key inside a steps item (flow map in a seq).
    ("r18-h10-steps-alias-key",
     "&w:2 a: 1\non: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n"
     "    steps:\n      - {*w:2: 1}\n"),
    # H11: anchor defined on a flow key, then the absorbed alias used
    # as a valued key in the same flow map (duplicate-key crossover).
    ("r18-h11-flow-def-then-alias-key-valued",
     "&w:2 a: 1\nm: {&w:2 a: 1, *w:2: 2}\n" + WF_TAIL),
    # H12: tag before an absorbed alias value, inside a flow map
    # (block form was a control; flow form unprobed).
    ("r18-h12-flow-tag-alias-value",
     "&w:2 a: 1\nm: {b: !zap *w:2}\n" + WF_TAIL),
    # H13: absorbed alias key in a flow map inside a block sequence.
    ("r18-h13-block-seq-map-alias-key",
     "&w:2 a: 1\nm:\n  - {*w:2: 1}\n" + WF_TAIL),
    # H14: block map, scalar key first, absorbed alias key with a
    # value second (duplicate-key crossover, block form).
    ("r18-h14-block-alias-key-after-scalar",
     "&w:2 a: 1\nm:\n  a: 1\n  *w:2: 2\n" + WF_TAIL),
    # H15: block map, absorbed alias key with a value first.
    ("r18-h15-block-alias-key-first",
     "&w:2 a: 1\nm:\n  *w:2: 2\n  a: 1\n" + WF_TAIL),
    # H16: plain (non-absorbed) alias key after a DIFFERENT scalar key
    # in a flow map — no duplicate possible; control.
    ("r18-h16-plain-alias-key-after-diff-scalar",
     "&w a: 1\nm: {b: 2, *w}\n" + WF_TAIL),
    # H17: plain alias key after the SAME scalar key in a flow map
    # (fixer's plain control, independently re-verified).
    ("r18-h17-plain-alias-key-after-same-scalar",
     "&w a: 1\nm: {a: 1, *w}\n" + WF_TAIL),
    # H18: absorbed alias value deep in a matrix list.
    ("r18-h18-matrix-alias-value",
     "&w:2 a: 1\non: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n"
     "    strategy:\n      matrix:\n        x: [*w:2]\n    steps:\n"
     "      - run: echo hi\n"),
    # H19: triple-colon absorbed alias as a flow key after a scalar key.
    ("r18-h19-multi-colon-flow-key-2nd",
     "&w:2:3 a: 1\nm: {a: 1, *w:2:3}\n" + WF_TAIL),
    # H20: the residual shape with a trailing comment.
    ("r18-h20-flow-key-comment",
     "&w:2 a: 1\nm: {a: 1, *w:2} # c\n" + WF_TAIL),
    # H21: absorbed alias value nested inside flow sequences.
    ("r18-h21-nested-seq-alias-value",
     "&w:2 a: 1\nm: {a: [[*w:2]]}\n" + WF_TAIL),
    # H22: document marker, then the residual shape.
    ("r18-h22-docmark-flow-alias-key-2nd",
     "&w:2 a: 1\n---\nm: {a: 1, *w:2}\n" + WF_TAIL),
    # H23: absorbed alias value inside on.push.branches.
    ("r18-h23-on-branches-alias-value",
     "&w:2 a: 1\non:\n  push:\n    branches: [*w:2]\njobs:\n  check:\n"
     "    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    # H24: the same absorbed alias used once as a value and once as a
    # key in one flow map.
    ("r18-h24-mixed-value-key-alias",
     "&w:2 a: 1\nm: {b: *w:2, *w:2: 1}\n" + WF_TAIL),
    # H25: a second absorbed anchor defined on a flow key, then its
    # alias used as a valued key in the same flow map.
    ("r18-h25-flow-def-then-alias-key-plain",
     "&w:2 a: 1\nm: {&v:3 d: 2, *v:3: 1}\n" + WF_TAIL),
]

ROWS = [{"id": i, "yaml": y, "mode": "both"} for i, y in CASES]


def main() -> None:
    (HERE / "cases.json").write_text(
        json.dumps(ROWS, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(ROWS)} cases ({len(ROWS) * 2} checks)")


if __name__ == "__main__":
    main()
