"""Parser-level parallel mapping for FIX-P0-15 (T013 R14 5 P0 families).

Runs each shape (bare YAML fragment) through two parsers and prints
accept/reject + rendered value + PyYAML token sequence:
  - npm `yaml` package YAML.parse (the TS side's parser)
  - PyYAML yaml.load with the Oracle's _StrictBaseLoader (the
    Oracle's actual loader; accept/reject here is the Oracle's
    parser-level verdict before the _reject_* rules run)

Purpose: derive the exact discriminant for each of the 5 P0 families
(R14 §2) before writing any rule. Every live divergence is
confirmed end-to-end by map2-p0-15.py before fixing, because
parser-level mapping can mislead (FIX-P0-11 lesson).

Families (R14 §2, all trigger mode; jobs mode MATCH for the 11):
  (a) mapping value contains `on` — TS VALID vs Oracle missing_on_key
      (unwrap semantics: parse_workflow_yaml + extract_jobs)
  (b) value node's second anchor — TS yaml_parse_error vs Oracle
      missing_on_key (mirror "at most one anchor" rejection)
  (c) key with tag — TS yaml_parse_error (E05) vs Oracle missing_on_key
      (mirror E05 at lone-doc position)
  (d) unglued anchor-colon — TS yaml_parse_error vs Oracle
      missing_on_key (mirror hasUnrepresentableKey at lone-doc position)
  (e) nested block-map value with anchored key — TS yaml_parse_error
      vs Oracle missing_on_key (mirror "at most one anchor" in a
      nested block mapping, block-context scoped)

Usage (from the repo root):
    python3 evidence/probes/fix-p0-15/map-p0-15.py [group]
Group selects a shape group: a (unwrap), b (second anchor),
c (tag on key), d (unglued), e (nested block map), f (controls),
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
    ("a-flowmap-on", "&x: {on: push}\n", "RESIDUAL (a): flow-map value WITH on"),
    ("a-blockmap-on", "&x:\n  on: push\n", "RESIDUAL (a): block-map value WITH on"),
    ("a-tag-map-on", "&x: !foo {on: push}\n", "RESIDUAL (a): tagged flow-map value WITH on"),
    ("a-flow-full", "&x: {on: push, jobs: {test: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}}}\n", "(a): full workflow in flow map"),
    ("a-block-full", "&x:\n  on: push\n  jobs:\n    test:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n", "(a): full workflow in block map"),
    ("a-on-list", "&x: {on: [push, pull_request]}\n", "(a): on as list"),
    ("a-on-config", "&x: {on: {push: {branches: [main]}}}\n", "(a): on with config"),
    ("a-on-bad", "&x: {on: bad_event}\n", "(a): on unsupported event"),
    ("a-on-name", "&x: {on: push, name: probe}\n", "(a): on + other key"),
    ("a-jobs-only", "&x: {jobs: {test: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}}}\n", "(a): jobs but no on"),
    ("a-name-only", "&x: {name: probe}\n", "(a): no on, no jobs"),
    ("a-on-anchored-2nd", "&x: {on: push, &y: 1}\n", "(a): value map has anchored key as 2nd pair (flow)"),
    ("a-on-anchored-2nd-block", "&x:\n  on: push\n  &y: 1\n", "(a): value map has anchored key as 2nd pair (block)"),
    ("a-docmark-on", "---\n&x: {on: push}\n", "(a): docmark + flow-map on"),
    ("a-comment-on", "&x: {on: push}  # note\n", "(a): trailing comment + flow-map on"),
    ("a-handle-map-on", "&x: !!str {on: push}\n", "(a): handle tag on map value WITH on"),
    ("a-on-jobs-empty", "&x: {on: push, jobs: {}}\n", "(a): on + empty jobs map"),
    ("a-on-bool-key", "&x: {True: push}\n", "(a): non-on key, bool spelling"),
    ("a-on-nested-anchor", "&x: {on: {push: {branches: [main]}, pull_request: {}}}\n", "(a): two events with configs"),
]

B = [
    ("b-anchor-val", "&x: &y 1\n", "RESIDUAL (b): second anchor, scalar value"),
    ("b-anchor-seq", "&x: &y [1]\n", "RESIDUAL (b): second anchor, flow-seq value"),
    ("b-anchor-null", "&x: &y\n", "RESIDUAL (b): second anchor, null value"),
    ("b-anchor-flowmap", "&x: &y {a: 1}\n", "(b): second anchor, flow-map value"),
    ("b-anchor-blockmap", "&x: &y\n  a: 1\n", "(b): second anchor, block-map value"),
    ("b-anchor-blockseq", "&x: &y\n  - a\n", "(b): second anchor, block-seq value"),
    ("b-anchor-tagval", "&x: &y !foo 1\n", "(b): second anchor + tag on value"),
    ("b-anchor-tagmid", "&x: !foo &y 1\n", "(b): tag between the two anchors"),
    ("b-anchor-tagfirst", "!foo &x &y 1\n", "(b): tag, then two anchors"),
    ("b-double-key", "&x &y: 1\n", "(b): two anchors on the key"),
    ("b-double-key-null", "&x &y:\n", "(b): two anchors on the key, null value"),
    ("b-anchor-colon-anchor", "&x: &y: 1\n", "(b): second anchor followed by colon"),
    ("b-wf-value", full("m: &x &y 1\n"), "(b): second anchor in workflow value slot"),
    ("b-wf-flow", full("m: {a: &x &y 1}\n"), "(b): second anchor in workflow flow map (R14 2.5b)"),
    ("b-wf-on", full("on: &x &y push\n"), "(b): second anchor on the on: value"),
    ("b-wf-seq", full("m: [&x &y 1]\n"), "(b): second anchor in workflow flow seq"),
    ("b-wf-nested-key", full("m:\n  &x &y: 1\n"), "(b): two anchors on nested key"),
    ("b-wf-explicit", full("m:\n  ? &x &y: 1\n"), "(b): two anchors on explicit key"),
    ("b-alias-ctrl", "a: &y 1\n&x: *y\n", "CONTROL: anchor on alias node (defined), must stay MATCH"),
    ("b-alias-ctrl-wf", full("m: &x *y\n") + "a: &y 1\n", "CONTROL: anchor on alias in workflow (defined alias)"),
    ("b-docmark-2anchor", "--- &x &y 1\n", "(b): two anchors after doc marker"),
    ("b-anchor-own-line", "&x\n&y: 1\n", "(b): anchor on own line, then anchored key"),
    ("b-anchor-tag-key", "&x !foo &y: 1\n", "(b): anchor, tag, anchor on key"),
]

C = [
    ("c-tag-key", "!foo &x: 1\n", "RESIDUAL (c): tag on the key"),
    ("c-handle-key", "!!str &x: 1\n", "RESIDUAL (c): handle tag on the key"),
    ("c-docmark-tagkey", "---\n!foo &x: 1\n", "RESIDUAL (c): docmark + tag on key"),
    ("c-tag-key-null", "!foo &x:\n", "(c): tag on key, null value"),
    ("c-tag-key-mapval", "!foo &x: {a: 1}\n", "(c): tag on key, map value"),
    ("c-verbatim-tagkey", "!<foo> &x: 1\n", "(c): verbatim tag on key"),
    ("c-tagkey-nested", full("m:\n  !foo &x: 1\n"), "(c): tag on key, nested single pair"),
    ("c-tagkey-nested-2pair", full("m:\n  !foo &x: 1\n  b: 2\n"), "(c): tag on key, nested 2-pair map"),
    ("c-tagkey-2nd-root", full("a: 1\n!foo &x: 2\n"), "(c): tag on key as 2nd root pair"),
    ("c-tagkey-explicit", full("m:\n  ? !foo &x: 1\n"), "(c): explicit key, tag + anchor"),
    ("c-tagkey-unglued", "!foo &x : 1\n", "(c): tag on key + unglued"),
    ("c-anchor-tag-val", "&x !foo: 1\n", "CONTROL: anchor then tag (both reject per FIX-P0-13)"),
]

D = [
    ("d-unglued", "&x : 1\n", "RESIDUAL (d): space between anchor and colon"),
    ("d-unglued-null", "&x :\n", "(d): unglued, null value"),
    ("d-unglued-mapval", "&x : {a: 1}\n", "(d): unglued, map value"),
    ("d-unglued-2sp", "&x  : 1\n", "(d): two spaces"),
    ("d-unglued-seqval", "&x : [1]\n", "(d): unglued, seq value"),
    ("d-unglued-nested", full("m:\n  &x : 1\n"), "(d): unglued, nested single pair"),
    ("d-unglued-2nd-root", full("a: 1\n&x : 2\n"), "(d): unglued as 2nd root pair"),
    ("d-unglued-flow", full("m: {&x : 1}\n"), "(d): unglued in flow map"),
    ("d-unglued-null-2pair", full("&x :\nname: probe\n"), "(d): unglued null + subsequent pairs (R13 4.2: both reject)"),
]

E = [
    ("e-nested-block", "&x:\n  &y: 1\n", "RESIDUAL (e): nested block-map value, anchored key"),
    ("e-nested-null", "&x:\n  &y:\n", "(e): nested, null value"),
    ("e-nested-seq", "&x:\n  &y: [1]\n", "(e): nested, flow-seq value"),
    ("e-nested-flowmap", "&x:\n  &y: {a: 1}\n", "(e): nested, flow-map value"),
    ("e-nested-blockmap", "&x:\n  &y:\n    b: 2\n", "(e): nested, block-map value"),
    ("e-nested-tagkey", "&x:\n  !foo &y: 1\n", "(e): nested, tag on nested key"),
    ("e-nested-unglued", "&x:\n  &y : 1\n", "(e): nested, unglued nested key"),
    ("e-nested-flow", "&x: {&y: 1}\n", "CONTROL twin: flow-map value, anchored key; must MATCH"),
    ("e-nested-2pair", "&x:\n  &y: 1\n  z: 2\n", "CONTROL: nested 2-pair variant (both reject per R14)"),
    ("e-nested-2nd", "&x:\n  z: 2\n  &y: 1\n", "(e): anchored key as 2nd pair of nested map"),
    ("e-deeper", "a:\n  &x:\n    &y: 1\n", "(e): deeper nesting under a normal key"),
    ("e-deeper-wf", full("m:\n  &x:\n    &y: 1\n"), "(e): deeper nesting in workflow"),
    ("e-nested-nonempty-key", "&x:\n  &y k: 1\n", "(e): nested, anchor on NON-empty key"),
    ("e-nested-plain-key", "&x:\n  k: 1\n", "CONTROL: nested, plain key; must stay MATCH"),
    ("e-nested-2anchor", "&x:\n  &y: 1\n  &z: 2\n", "(e): two anchored keys nested"),
    ("e-seq-item", "&x:\n  - &y: 1\n", "CONTROL: block-seq item anchored key (R14 4: MATCH)"),
]

F = [
    ("f-quoted", '"": 1\n', "CONTROL: quoted empty key"),
    ("f-squoted", "'': 1\n", "CONTROL: single-quoted empty key"),
    ("f-scalar", "&x: 1\n", "CONTROL: lone-doc P0 core (closed)"),
    ("f-null", "&x:\n", "CONTROL: lone-doc P0 core null (closed)"),
    ("f-tagval", "&x: !foo 1\n", "CONTROL: tag on value (closed)"),
    ("f-flowseq-on", "&x: [{on: pull_request}]\n", "CONTROL: flow-seq value with on (closed)"),
    ("f-blockseq-anchor", "&x:\n  - &b: 2\n", "CONTROL: block-seq value, anchored item (closed)"),
    ("f-explicit", "? : 1\n", "CONTROL: explicit empty key"),
    ("f-bare-colon", ": 1\n", "CONTROL: bare colon"),
    ("f-lone-scalar", "42\n", "CONTROL: lone scalar"),
    ("f-lone-anchored", "&x hello\n", "CONTROL: lone anchored scalar"),
    ("f-lone-tagged", "!foo 1\n", "CONTROL: lone tagged scalar"),
    ("f-c3-reject", full("&x: 1\n"), "CONTROL: C3 domain, both reject"),
    ("f-c3-exempt", full("&x:\n"), "CONTROL: first-pair null exempt, both VALID"),
    ("f-nested-single", full("m:\n  &x: 1\n"), "CONTROL: nested single pair"),
    ("f-two-doc", "&x: 1\n---\n&y: 2\n", "CONTROL: two documents"),
    ("f-anchor-alias-undef", "&x: *y\n", "CONTROL: undefined alias value"),
]

GROUPS = {"a": A, "b": B, "c": C, "d": D, "e": E, "f": F}


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
    for g in (["a", "b", "c", "d", "e", "f"] if group == "all" else [group]):
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
