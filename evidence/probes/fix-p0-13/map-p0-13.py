"""Parser-level parallel mapping for FIX-P0-13 (T013 R12 P0-C1/C2/C3).

Runs each shape (bare YAML fragment) through three parsers and prints
accept/reject + parsed value:
  - npm `yaml` package YAML.parse (the TS side's parser)
  - PyYAML yaml.safe_load (constructor-layer reference; WRONG for
    unknown-tag shapes, where the constructor rejects but the Oracle's
    _StrictBaseLoader accepts — see R12 §6 note)
  - PyYAML yaml.load with the Oracle's _StrictBaseLoader (the Oracle's
    actual loader; accept/reject here is the Oracle's parser-level
    verdict before the _reject_* rules run)

The end-to-end outcome (TS bundle vs Oracle drivers, full JSON) is
checked separately by run-matrix.py — parser-level mapping can
mislead (FIX-P0-11 lesson), so every live divergence is confirmed
end-to-end before fixing.

Usage (from the repo root):
    python3 evidence/probes/fix-p0-13/map-p0-13.py [round]
Round selects a shape group: c1, c2, c3, or all (default).
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(REPO / "oracle"))

import yaml  # noqa: E402
from checkpath_oracle.parser import _StrictBaseLoader  # noqa: E402

NODE_SCRIPT = """\
const YAML = require('yaml');
const fs = require('fs');
const text = fs.readFileSync(process.argv[1], 'utf-8');
try {
  const doc = YAML.parse(text);
  console.log(JSON.stringify({ok: true, value: doc}));
} catch (e) {
  console.log(JSON.stringify({ok: false, error: String(e.message).split('\\n')[0].slice(0, 160)}));
}
"""

# (id, fragment)
C1 = [
    ("c1-a60", "m: {a: !foo, b: 1}"),
    ("c1-x04", "m: {a: !foo, b: 1, c: 2}"),
    ("c1-y03", 'm: {a: !foo, "b": 1}'),
    ("c1-y05", "m: {a: !foo,\n b: 1}"),
    ("c1-y08", "m: {a: !foo, &x 1: 2}"),
    ("c1-y09", "m: {a: !foo, 1: 2}"),
    ("c1-y10", "m: {a: !foo, b:}"),
    ("c1-x11", "a: !foo,\n  b: 1"),
    ("c1-val-notpair", "m: {a: !foo, 1}"),
    ("c1-val-then-pair", "m: {a: !foo, 1, b: 2}"),
    ("c1-key-nocolon", "m: {a: !foo, b}"),
    ("c1-trailing", "m: {a: !foo,}"),
    ("c1-last-pair", "m: {a: 1, b: !foo,}"),
    ("c1-on-key", "m: {!foo, b: 1}"),
    ("c1-nested-map", "m: {a: {b: !foo, c: 1}}"),
    ("c1-seq-in-map", "m: {a: [!foo, b: 1]}"),
    ("c1-block-sameline", "a: !foo, b: 1"),
    ("c1-block-eol", "a: !foo,"),
    ("c1-x02", "m: {a: !foo,bar 1}"),
    ("c1-y01", "m: [!foo, a: 1]"),
    ("c1-y02", "m: [!foo, a: 1, b: 2]"),
    ("c1-x05", "m: [!foo, 1]"),
    ("c1-x06", "m: [!foo, b]"),
    ("c1-x13", "m: {a: !foo , b: 1}"),
    ("c1-squote-key", "m: {a: !foo, 'b': 1}"),
    ("c1-alias-after", "m: {a: !foo, *x}"),
    ("c1-seqval-after", "m: {a: !foo, [1, 2]}"),
    ("c1-mapval-after", "m: {a: !foo, {b: 1}}"),
    ("c1-handle", "m: {a: !!str, b: 1}"),
    ("c1-two-commas", "m: {a: !foo,bar, b: 1}"),
    ("c1-double-comma", "m: {a: !foo,, b: 1}"),
    ("c1-tag-comma-val2", "m: {a: !foo, b: 1, c: !bar, d: 2}"),
    ("c1-flowseq-key", "m: [{a: !foo, b: 1}]"),
    ("c1-blockseq", "- a: !foo, b: 1"),
    ("c1-docroot-flow", "{a: !foo, b: 1}"),
    ("c1-verbatim-comma", "m: {a: !<tag:x>, b: 1}"),
    ("c1-tag-only-comma", "m: {a: !foo,}"),
    ("c1-nested-comma", "m: {a: {b: !foo, c: 1}, d: 2}"),
]

C2 = [
    ("c2-a70", "m: {a: !foo[bar] 1}"),
    ("c2-x08", "m: [!foo] 1]"),
    ("c2-x09", "m: [!foo], 1]"),
    ("c2-mid-bracket", "m: {a: !foo[bar]baz 1}"),
    ("c2-rbrack-noval", "m: {a: !foo] 1}"),
    ("c2-lbrack-space", "m: {a: !foo[ 1}"),
    ("c2-empty-brackets", "m: {a: !foo[] 1}"),
    ("c2-nested-brackets", "m: {a: !foo[[x]] 1}"),
    ("c2-verbatim-bracket", "m: {a: !<foo[bar]> 1}"),
    ("c2-quoted-bracket", 'm: {a: "x[y"}'),
    ("c2-plain-bracket", "m: {a: x[y}"),
    ("c2-tagbracket-key", "m: {!foo[bar]: 1}"),
    ("c2-block-tagbracket", "a: !foo[bar] 1"),
    ("c2-tagbracket-nonode", "m: {a: !foo[bar]}"),
    ("c2-tagbracket-seq", "m: [!foo[bar] 1]"),
    ("c2-a65", "m: {a: !foo]}"),
    ("c2-rbrack-comma", "m: {a: !foo], b: 1}"),
    ("c2-lbrack-only", "m: {a: !foo[}"),
]

C3 = [
    ("c3-a45", "&x: 1"),
    ("c3-flow", "m: {&x: 1}"),
    ("c3-flow-pair", "m: {&x: 1, b: 2}"),
    ("c3-nested-block", "a:\n  &x: 1\n  b: 2"),
    ("c3-space-colon", "&x : 1"),
    ("c3-bare", "&x: 1\n"),
    ("c3-blockseq", "- &x: 1"),
    ("c3-as-value", "a: &x: 1"),
    ("c3-explicit", "? &x: 1"),
    ("c3-blockval-nextline", "&x:\n  a: 1"),
    ("c3-under-m", "m:\n  &x: 1\n  b: 2"),
    ("c3-under-jobs", "jobs:\n  &x: 1\n  test:\n    runs-on: ubuntu-latest"),
    ("c3-two-anchored", "&x: 1\n&y: 2"),
    ("c3-anchored-nonempty", "&x: 1\nname: probe"),
    ("c3-anchor-key-val", "&x a: 1"),
    ("c3-anchor-quoted", '&x: "1"'),
    ("c3-anchor-flow-nested", "m: {a: {&x: 1}}"),
    ("c3-anchor-blockseq-map", "- &x: 1\n- b: 2"),
]

GROUPS = {"c1": C1, "c2": C2, "c3": C3}


def npm_parse(text):
    with tempfile.NamedTemporaryFile("w", suffix=".yml", delete=False) as f:
        f.write(text)
        path = f.name
    try:
        r = subprocess.run(
            ["node", "-e", NODE_SCRIPT, path],
            capture_output=True, text=True, cwd=str(REPO),
        )
        return json.loads(r.stdout)
    finally:
        Path(path).unlink()


def py_parse(text, loader):
    try:
        v = yaml.load(text, Loader=loader)
        return {"ok": True, "value": v}
    except yaml.YAMLError as e:
        msg = str(e).split("\n")[0][:160]
        return {"ok": False, "error": msg}


def fmt(v):
    if v.get("ok"):
        return "A " + json.dumps(v["value"], default=str, ensure_ascii=False)[:100]
    return "R " + str(v.get("error", "?"))[:100]


def main() -> int:
    rounds = sys.argv[1:] or ["all"]
    shapes = []
    for r in rounds:
        if r == "all":
            for g in GROUPS.values():
                shapes += g
        else:
            shapes += GROUPS[r]
    print(f"{'id':<24} {'npm':<46} {'safe_load':<46} {'oracle-loader'}")
    for sid, frag in shapes:
        npm = npm_parse(frag)
        safe = py_parse(frag, yaml.SafeLoader)
        orc = py_parse(frag, _StrictBaseLoader)
        print(f"{sid:<24} {fmt(npm):<46} {fmt(safe):<46} {fmt(orc)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
