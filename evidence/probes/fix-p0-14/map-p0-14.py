"""Parser-level parallel mapping for FIX-P0-14 (T013 R13 lone-doc P0).

Runs each shape (bare YAML fragment) through two parsers and prints
accept/reject + rendered value + PyYAML token sequence:
  - npm `yaml` package YAML.parse (the TS side's parser)
  - PyYAML yaml.load with the Oracle's _StrictBaseLoader (the
    Oracle's actual loader; accept/reject here is the Oracle's
    parser-level verdict before the _reject_* rules run)

Purpose: derive the exact discriminant for the classification
alignment (Oracle root check returns workflow_root_not_mapping for a
degenerate mapping consisting entirely of anchored empty keys).
The discriminant must use TOKEN patterns, not just "empty key":
the quoted empty key `"": 1` currently MATCHES and must keep
matching. Every live divergence is confirmed end-to-end by
map2-p0-14.py before fixing, because parser-level mapping can
mislead (FIX-P0-11 lesson).

Usage (from the repo root):
    python3 evidence/probes/fix-p0-14/map-p0-14.py [group]
Group selects a shape group: a (lone-doc value forms), b (controls),
or all (default).
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

WF = "on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"


def full(body: str) -> str:
    """Wrap a body fragment in a full workflow doc (on + jobs)."""
    return body + WF


# (id, fragment, note)
A = [
    ("a-scalar", "&x: 1\n", "P0 core: lone &x: 1"),
    ("a-null", "&x:\n", "P0 core: lone &x:"),
    ("a-null-space", "&x: \n", "null value, trailing space"),
    ("a-str", "&x: hello\n", "string value"),
    ("a-dq", '&x: "1"\n', "double-quoted value"),
    ("a-sq", "&x: 'a'\n", "single-quoted value"),
    ("a-bool", "&x: true\n", "bool value"),
    ("a-float", "&x: 1.5\n", "float value"),
    ("a-flowseq", "&x: [1]\n", "flow-seq value"),
    ("a-flowmap", "&x: {a: 1}\n", "flow-map value (no on)"),
    ("a-flowmap-on", "&x: {on: push}\n", "flow-map value WITH on"),
    ("a-blockseq", "&x:\n  - a\n", "block-seq value"),
    ("a-blockmap", "&x:\n  a: 1\n", "block-map value (no on)"),
    ("a-blockmap-on", "&x:\n  on: push\n", "block-map value WITH on"),
    ("a-anchor-val", "&x: &y 1\n", "anchored scalar value"),
    ("a-alias-val", "&x: *y\n", "alias value (undefined anchor)"),
    ("a-tag-val", "&x: !foo 1\n", "tagged scalar value"),
    ("a-handle-val", "&x: !!str 1\n", "handle-tagged value"),
    ("a-comment", "&x: 1 # note\n", "trailing comment"),
    ("a-docmark", "---\n&x: 1\n", "explicit doc start"),
    ("a-docend", "&x: 1\n...\n", "explicit doc end"),
    ("a-tag-key", "!foo &x: 1\n", "tag on the key"),
    ("a-handle-key", "!!str &x: 1\n", "handle tag on the key"),
    ("a-double-anchor", "&x &y: 1\n", "two anchors on key"),
    ("a-unglued", "&x : 1\n", "space between anchor and colon"),
    ("a-two-scalar", "&x: 1\n&y: 2\n", "two pairs, scalar values"),
    ("a-two-null", "&x:\n&y:\n", "two pairs, null values"),
    ("a-null-scalar", "&x:\n&y: 2\n", "first null, second scalar"),
    ("a-scalar-null", "&x: 1\n&y:\n", "first scalar, second null"),
    ("a-list-on", "&x: [{on: push}]\n", "flow-seq value containing on"),
]

B = [
    ("b-quoted", '"": 1\n', "CONTROL: quoted empty key, must stay MATCH"),
    ("b-squoted", "'': 1\n", "CONTROL: single-quoted empty key"),
    ("b-explicit", "? : 1\n", "CONTROL: explicit empty key"),
    ("b-bare-colon", ": 1\n", "CONTROL: bare colon"),
    ("b-c3-reject", full("&x: 1\n"), "CONTROL: C3 domain, both reject"),
    ("b-c3-exempt", full("&x:\n"), "CONTROL: first-pair null exempt, both VALID"),
    ("b-plain", "1\n", "CONTROL: lone scalar"),
    ("b-string", "hello\n", "CONTROL: lone string"),
    ("b-seq", "- a\n- b\n", "CONTROL: lone sequence"),
    ("b-anchored-scalar", "&x hello\n", "CONTROL: lone anchored scalar"),
    ("b-tagged", "!foo 1\n", "CONTROL: lone tagged scalar"),
    ("b-flow-exempt", full("m: {&x: 1}\n"), "CONTROL: flow exempt"),
    ("b-nested-single", full("m:\n  &x: 1\n"), "CONTROL: nested single pair"),
    ("b-quoted-wf", full('"": 1\n'), "CONTROL: quoted empty key + full workflow"),
    ("b-two-doc", "&x: 1\n---\n&y: 2\n", "CONTROL: two documents"),
]

GROUPS = {"a": A, "b": B}


def npm_parse(text: str):
    with tempfile.NamedTemporaryFile("w", suffix=".yml", delete=False) as f:
        f.write(text)
        path = f.name
    try:
        r = subprocess.run(
            ["node", "-e", NODE_SCRIPT, path],
            capture_output=True, text=True, cwd=str(REPO),
        )
        out = json.loads(r.stdout) if r.stdout.strip() else {"ok": False, "error": "no stdout: " + r.stderr[:200]}
        return out
    finally:
        Path(path).unlink(missing_ok=True)


def py_parse(text: str):
    try:
        doc = yaml.load(text, Loader=_StrictBaseLoader)
        return {"ok": True, "value": repr(doc)}
    except yaml.YAMLError as e:
        return {"ok": False, "error": str(e).split("\n")[0][:160]}


def tokens(text: str) -> str:
    try:
        toks = list(yaml.scan(text))
        parts = []
        for t in toks:
            name = type(t).__name__.replace("Token", "")
            v = getattr(t, "value", "")
            parts.append(f"{name}({v!r})" if v != "" else name)
        return " ".join(parts)
    except yaml.YAMLError as e:
        return f"<scan error: {str(e).splitlines()[0][:120]}>"


def main() -> int:
    group = sys.argv[1] if len(sys.argv) > 1 else "all"
    shapes = []
    for g in (["a", "b"] if group == "all" else [group]):
        shapes += GROUPS[g]
    for sid, text, note in shapes:
        npm = npm_parse(text)
        py = py_parse(text)
        npm_v = json.dumps(npm.get("value"), ensure_ascii=False) if npm.get("ok") else "ERR: " + str(npm.get("error", ""))[:100]
        py_v = py.get("value", "ERR: " + str(py.get("error", ""))[:100]) if py.get("ok") else "ERR: " + str(py.get("error", ""))[:100]
        print(f"== {sid}: {note}")
        print(f"   yaml: {text!r}")
        print(f"   npm : {'OK ' if npm.get('ok') else 'ERR'} {npm_v}")
        print(f"   py  : {'OK ' if py.get('ok') else 'ERR'} {py_v}")
        print(f"   toks: {tokens(text)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
