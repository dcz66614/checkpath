"""Parser-level probe: PyYAML _StrictBaseLoader behaviour on FIX-P0-19 shapes.

For each shape: token walk (Alias/Anchor tokens) + yaml.load with the
repo's _StrictBaseLoader (the Oracle's loader). LOAD-ERROR means the
Oracle rejects; LOAD-OK means it accepts. Companion to
parser-probe-p19.mjs (TS `yaml` package side).
Run: python3 evidence/probes/fix-p0-19/parser-probe-p19.py
"""
import sys
sys.path.insert(0, ".")
import yaml
from oracle.checkpath_oracle.parser import _StrictBaseLoader

WF = "on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"

SHAPES = {
    # --- R18 family (8 shapes) ---
    "F1-flow-alias-after": "&w:2 a: 1\nm: {a: 1, *w:2}\n" + WF,
    "F2-plain-alias-after": "&w a: 1\nm: {a: 1, *w}\n" + WF,
    "F3-alias-first": "&w a: 1\nm: {*w, a: 1}\n" + WF,
    "F4-alias-twice": "&w a: 1\nm: {*w, *w}\n" + WF,
    "F5-nested-flow": "&w:2 a: 1\nm: {x: {a: 1, *w:2}}\n" + WF,
    "F6-absorbed-first": "&w:2 a: 1\nm: {*w:2, a: 1}\n" + WF,
    "F7-triple-colon": "&w:2:3 a: 1\nm: {a: 1, *w:2:3}\n" + WF,
    "F8-trailing-comment": "&w:2 a: 1\nm: {a: 1, *w:2} # c\n" + WF,
    # --- controls (must stay MATCH) ---
    "B1-valued-first": "&w a: 1\nm: {*w: 1, a: 1}\n" + WF,
    "B2-valued-twice": "&w a: 1\nm: {*w: 1, *w: 2}\n" + WF,
    "B3-block-valued": "&w a: 1\nm:\n  a: 1\n  *w: 1\n" + WF,
    "B4-other-scalar": "&w a: 1\nm: {b: 2, *w}\n" + WF,
    "B5-alias-alone": "&w a: 1\nm: {*w}\n" + WF,
    "B6-alias-value": "&w a: 1\nb: *w\n" + WF,
    "B7-plain-dup": "m: {a: 1, a: 2}\n" + WF,
    "B8-block-null-after": "&w a: 1\nm:\n  a: 1\n  *w\n" + WF,
    "B9-block-null-first": "&w a: 1\nm:\n  *w\n  a: 1\n" + WF,
    "B10-block-null-absorbed": "&w:2 a: 1\nm:\n  a: 1\n  *w:2\n" + WF,
    # --- canonical-folding probes (anchor as a VALUE, valid YAML) ---
    "B11-int-anchor": "x: &w 1\nm: {1: y, *w}\n" + WF,
    "B12-int-vs-quoted": "x: &w 1\nm: {'1': y, *w}\n" + WF,
    "B13-bool-anchor": "x: &w True\nm: {true: y, *w}\n" + WF,
    "B14-bool-vs-int": "x: &w True\nm: {1: y, *w}\n" + WF,
    "B15-null-anchor": "x: &w ~\nm: {null: y, *w}\n" + WF,
    "B16-quoted-anchor": "x: &w 'a'\nm: {a: y, *w}\n" + WF,
    "B17-tagged-anchor": "x: &w !!str 1\nm: {1: y, *w}\n" + WF,
    "B18-nan-anchor": "x: &w .nan\nm: {.nan: y, *w}\n" + WF,
    "B19-alias-twice-spread": "&w a: 1\nm: {*w, b: 2, *w}\n" + WF,
    "B20-flow-in-seq": "&w a: 1\nm: [{a: 1, *w}]\n" + WF,
    "B21-on-alias-dup": "x: &w push\non: {*w, push: {}}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
    "B22-anchor-in-flow": "m: {&w a: 1, *w}\n" + WF,
    "B23-forward-ref": "m: {*w, a: 1}\n&w a: 1\n" + WF,
    "B24-alias-to-collection": "x: &a {b: c}\nm: {a: 1, *a}\n" + WF,
    "B25-chained-alias": "x: &a foo\ny: &b *a\nm: {foo: 1, *b}\n" + WF,
}

for name, text in SHAPES.items():
    try:
        toks = list(yaml.scan(text, Loader=_StrictBaseLoader))
        kinds = [(type(t).__name__.replace("Token", ""), getattr(t, "value", "")) for t in toks
                 if type(t).__name__ in ("AliasToken", "AnchorToken")]
    except yaml.YAMLError as e:
        print(f"{name}: SCAN-ERROR {(str(e).splitlines() or ['?'])[0]}")
        continue
    try:
        data = yaml.load(text, Loader=_StrictBaseLoader)
        print(f"{name}: tokens={kinds} LOAD-OK {data!r}"[:300])
    except yaml.YAMLError as e:
        msg = str(e).splitlines()[0] if str(e) else "YAMLError"
        print(f"{name}: tokens={kinds} LOAD-ERROR {msg}")
