"""T013 R15 parser-level minimal reproductions.

Directly exercises the two parsers (PyYAML _StrictBaseLoader and the
npm `yaml` package) on the residual shapes, independent of the probe
drivers. Prints, per shape: PyYAML loaded value (or the exception)
and the npm package's parse outcome (value or thrown message).
"""

from __future__ import annotations

import json
import sys

sys.path.insert(0, "oracle")

from checkpath_oracle.parser import _StrictBaseLoader  # noqa: E402
import yaml  # noqa: E402

SHAPES = {
    "c3-root1st": "!bar &b : 2\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
    "c3-root2nd": "a: 1\n!bar &b : 2\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
    "c3-nested2nd": "m:\n  a: 1\n  !bar &b : 2\non: push\n",
    "c3-nested1st": "m:\n  !bar &b : 2\non: push\n",
    "c3-lone": "!bar &b : 2\n",
    "str-flow-nospace": "&b:!!str {on: pull_request}\n",
    "str-block-nospace": "&b:!!str\n  on: pull_request\n",
    "str-flow-space": "&b: !!str {on: pull_request}\n",
    "int-flow": "&b: !!int {on: pull_request}\n",
    "bool-flow": "&b: !!bool {on: pull_request}\n",
    "float-flow": "&b: !!float {on: pull_request}\n",
    "int-on": "on: !!int {push: {}}\n",
    "str-on": "on: !!str {push: {}}\n",
    "int-scalar": "a: !!int 1\n",
}


def main() -> None:
    out = {}
    for name, text in SHAPES.items():
        try:
            loaded = yaml.load(text, Loader=_StrictBaseLoader)
            py = {"ok": True, "value": repr(loaded)}
        except Exception as e:  # noqa: BLE001 - the exception type IS the finding
            py = {"ok": False, "exc": type(e).__name__, "msg": str(e)[:120]}
        out[name] = {"pyyaml": py}
    print(json.dumps(out, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
