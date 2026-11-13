"""R16 parser-level probe: PyYAML (_StrictBaseLoader, mirror active) vs
npm `yaml` for the 3 DIFF shapes found by r16-probe.py, plus controls.

Prints, per shape: PyYAML token stream, PyYAML load result/exception,
npm parse result/exception. Run from the repo root:
    python3 evidence/probes/r16/parser-probe-r16.py [shape-id ...]
    node evidence/probes/r16/parser-probe-r16.mjs [shape-id ...]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(REPO / "oracle"))

WF = ("on: schedule\njobs:\n  check:\n    runs-on: ubuntu-latest\n"
      "    steps:\n      - run: echo hi\n")

SHAPES = {
    "c15-alias-key": "x: &w 1\n&q:!!str *w: 2\n" + WF,
    "c16-absorb-2": "&q:2\n" + WF,
    "c17-absorb-foo": "&q:foo\n" + WF,
    "c16-lone": "&q:2\n",
    "c17-lone": "&q:foo\n",
    "c15-ctrl-scalar-key": "&q:!!str hello: 1\n" + WF,
    "c15-ctrl-alias-key-lone": "x: &w 1\n&q:!!str *w: 2\n",
    "c16-lone-wf-null": "&q:2\non: schedule\n",
}


def main() -> int:
    import yaml
    from checkpath_oracle.parser import _StrictBaseLoader

    want = sys.argv[1:] or list(SHAPES)
    for sid in want:
        text = SHAPES[sid]
        print(f"===== {sid} =====")
        print("--- yaml ---")
        print(text, end="")
        print("--- PyYAML tokens (_StrictBaseLoader) ---")
        try:
            toks = list(yaml.scan(text, Loader=_StrictBaseLoader))
            print(" ".join(
                f"{type(t).__name__}({getattr(t, 'value', '')!r})" for t in toks))
        except Exception as e:  # noqa: BLE001
            print(f"SCAN-ERROR {type(e).__name__}: {e}")
        print("--- PyYAML load (_StrictBaseLoader) ---")
        try:
            doc = yaml.load(text, Loader=_StrictBaseLoader)
            print(repr(doc)[:400])
        except Exception as e:  # noqa: BLE001
            print(f"LOAD-ERROR {type(e).__name__}: {str(e)[:300]}")
        print("--- PyYAML load (plain SafeLoader) ---")
        try:
            doc = yaml.safe_load(text)
            print(repr(doc)[:400])
        except Exception as e:  # noqa: BLE001
            print(f"LOAD-ERROR {type(e).__name__}: {str(e)[:300]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
