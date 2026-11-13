"""T013 R17 parser-level probe (PyYAML side, written fresh by the R17
reviewer). Dumps the _StrictBaseLoader token stream + load result for
the `!`-guard correction shapes and other hunt shapes, so the absorption
decision can be checked directly at the scanner level, independent of
the end-to-end probe drivers.

Usage from the repo root:
    python3 evidence/probes/r17/parser-probe-r17.py [shape-id ...]
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(REPO / "oracle"))

import yaml  # noqa: E402
from checkpath_oracle.parser import _StrictBaseLoader  # noqa: E402

WF_PUSH = (
    "on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n"
    "    steps:\n      - run: echo hi\n"
)
WF_SCHED = (
    "on: schedule\njobs:\n  check:\n    runs-on: ubuntu-latest\n"
    "    steps:\n      - run: echo hi\n"
)

SHAPES = {
    # `!` guard correction: tag properly terminated by EOL -> absorb.
    "tag-root-block": "&x:!!tag\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n",
    # `!` guard correction: tag glued to `{` -> NO absorb -> mirror rejects.
    "tag-nobrace": "&b:!!str{on: pull_request}\n",
    # tag terminated by TAB then `{`.
    "tag-tab-brace": "&x:!!str\t{on: push}\n",
    # bare `!` tag.
    "tag-bare-bang": "&x:!\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n",
    # `!!` with nothing after.
    "tag-double-bang": "&x:!!\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n",
    # `!` inside the tag name.
    "tag-bang-mid": "&x:!!str!zap\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n",
    # tag + space + comment.
    "tag-comment": "&x:!!str # note\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n",
    # `#` glued into the anchor run.
    "hash-glued": "&q:2#x\n" + WF_PUSH,
    # NBSP after the anchor run.
    "nbsp": "&q:2 \n" + WF_PUSH,
    # three colons in the run.
    "triple-colon": "&q:2:3:4\n" + WF_PUSH,
    # lone absorbed alias (undefined).
    "alias-colon-lone": "*w:2\n",
    # absorbed anchor defined, absorbed alias resolves.
    "alias-resolved": "x: &w:2 1\ny: *w:2\n" + WF_PUSH,
}


def tokens_of(text):
    try:
        toks = list(yaml.scan(text, Loader=_StrictBaseLoader))
        return " ".join(
            f"{type(t).__name__.replace('Token', '')}({getattr(t, 'value', '')!r})"
            for t in toks
        )
    except yaml.YAMLError as e:
        return f"SCAN-ERROR: {str(e).splitlines()[0][:120]}"


def load_of(text):
    try:
        doc = yaml.load(text, Loader=_StrictBaseLoader)
        return f"LOAD-OK: {doc!r}"[:300]
    except yaml.YAMLError as e:
        return f"LOAD-ERROR: {str(e).splitlines()[0][:160]}"


def main() -> int:
    want = sys.argv[1:] or list(SHAPES)
    for sid in want:
        text = SHAPES[sid]
        print(f"### {sid}: {text!r}")
        print("  tokens:", tokens_of(text))
        print("  ", load_of(text))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
