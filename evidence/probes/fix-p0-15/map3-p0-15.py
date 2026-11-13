"""Supplementary parser-level mapping for FIX-P0-15 (open questions
from the map-p0-15.py rounds).

  S1  alias nodes carrying a property: the `yaml` package rejects
      "An alias node must not specify any properties" — is that
      true in NORMAL (non-empty-key) positions too, and does PyYAML
      accept there? (R14 2.5(b) claims `&x *y` is legal; the B
      round contradicts it for the empty-key position.)
  S2  (e) scope edges: unglued outer anchor, anchor on a non-empty
      key, anchor on its own line nested under a normal key, a tag
      between the outer anchor and the nested block map.
  S3  (b) scope edges: anchor-tag-anchor on a workflow value,
      second anchor on an alias.
  S4  (a) unwrap edges: alias to the outer anchor itself inside
      the unwrapped value; a `!!str` tag on a block-map value.
  S5  (c)/(d) flow positions (parser level; end-to-end in map2).

Usage (from the repo root):
    python3 evidence/probes/fix-p0-15/map3-p0-15.py
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
    return body + WF


# (id, fragment, note)
S = [
    ("s-alias-anchor-normal", "a: &y 1\nb: &x *y\n", "S1: anchor on alias, normal key, alias defined"),
    ("s-alias-plain", "a: &y 1\nb: *y\n", "S1 CONTROL: plain alias, no anchor"),
    ("s-alias-tag", "a: &y 1\nb: !foo *y\n", "S1: tag on alias, normal key"),
    ("s-alias-anchor-flowseq", "a: &y 1\nm: [&x *y]\n", "S1: anchor on alias in flow seq"),
    ("s-alias-anchor-flowmap", "a: &y 1\nm: {k: &x *y}\n", "S1: anchor on alias in flow map value"),
    ("s-alias-anchor-wf", "a: &y 1\nm: &x *y\n" + WF, "S1: anchor on alias in workflow (alias defined BEFORE)"),
    ("s-alias-anchor-key", "a: &y 1\n&x *y: 1\n", "S1: anchor on alias as a KEY"),
    ("s-2anchor-alias", "a: &z 1\n&x: &y *z\n", "S3: second anchor on an alias value"),
    ("s-anchor-tag-anchor-wf", full("m: &x !foo &y 1\n"), "S3: anchor-tag-anchor on workflow value"),
    ("s-unglued-outer-e", "&x :\n  &y: 1\n", "S2: unglued outer anchor, nested anchored key"),
    ("s-nonempty-outer-e", "&x k:\n  &y: 1\n", "S2: anchor on non-empty key, nested anchored key"),
    ("s-ownline-nested-e", full("m: &x\n  &y: 1\n"), "S2: anchor on own line, nested under m"),
    ("s-tag-before-nested-e", "&x: !foo\n  &y: 1\n", "S2: tag between outer anchor and nested block map"),
    ("s-alias-self-unwrap", "&x: {on: *x}\n", "S4: alias to the outer anchor inside unwrap value"),
    ("s-str-blockmap-on", "&x: !!str\n  on: push\n", "S4: !!str tag on block-map value WITH on"),
    ("s-flow-tagkey", full("m: {!foo &x: 1}\n"), "S5: tag on key in flow map (workflow)"),
    ("s-flow-unglued", full("m: {&x : 1}\n"), "S5: unglued in flow map (workflow)"),
    ("s-flow-2anchor", full("m: {a: &x &y 1}\n"), "S5: second anchor in flow map (workflow)"),
    ("s-blockseq-tagkey", full("m:\n  - !foo &x: 1\n"), "S5: tag on key, block-seq item single pair"),
    ("s-blockseq-unglued", full("m:\n  - &x : 1\n"), "S5: unglued, block-seq item single pair"),
    ("s-blockseq-2anchor", full("m:\n  - &x: &y 1\n"), "S5: second anchor, block-seq item"),
    ("s-nested-2pair-tagkey", full("m:\n  !foo &x: 1\n  b: 2\n"), "S5: tag on key, nested 2-pair (parser ERR expected)"),
]


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
    for sid, text, note in S:
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
