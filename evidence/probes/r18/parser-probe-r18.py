"""R18 parser-layer minimal repro for the duplicate-key alias family.

Shows, directly against the parsers (no probe harness):
- PyYAML _StrictBaseLoader composes `m: {a: 1, *w}` into two
  ScalarNode('a') keys and construct_mapping raises the duplicate-key
  error, so the Oracle rejects.
- The `yaml` npm package parses the same document with 0 errors, so
  the TS side accepts (its uniqueKeys check never sees the resolved
  alias key).
Run: python3 evidence/probes/r18/parser-probe-r18.py
     node evidence/probes/r18/parser-probe-r18.mjs
"""
import sys
sys.path.insert(0, ".")
import yaml
from oracle.checkpath_oracle.parser import _StrictBaseLoader

SHAPES = {
    "dup-scalar-first-plain": "&w a: 1\nm: {a: 1, *w}\n",
    "dup-scalar-first-absorbed": "&w:2 a: 1\nm: {a: 1, *w:2}\n",
    "dup-alias-first-plain": "&w a: 1\nm: {*w, a: 1}\n",
    "dup-alias-twice-plain": "&w a: 1\nm: {*w, *w}\n",
    "dup-nested": "&w:2 a: 1\nm: {x: {a: 1, *w:2}}\n",
    "control-valued-first": "&w a: 1\nm: {*w: 1, a: 1}\n",
    "control-diff-scalar": "&w a: 1\nm: {b: 2, *w}\n",
    "control-alias-alone": "&w a: 1\nm: {*w}\n",
}

for name, text in SHAPES.items():
    toks = list(yaml.scan(text, Loader=_StrictBaseLoader))
    kinds = [(type(t).__name__.replace("Token", ""), getattr(t, "value", "")) for t in toks
             if type(t).__name__ in ("AliasToken", "AnchorToken")]
    try:
        data = yaml.load(text, Loader=_StrictBaseLoader)
        print(f"{name}: tokens={kinds} LOAD-OK {data!r}")
    except yaml.YAMLError as e:
        msg = str(e).splitlines()[0] if str(e) else "YAMLError"
        print(f"{name}: tokens={kinds} LOAD-ERROR {msg}")
