"""Parser-level parallel mapping for FIX-P0-16 (T013 R15 3 P0 families).

Runs each shape through two parsers and prints accept/reject +
rendered value + PyYAML token sequence:
  - npm `yaml` package YAML.parse (the TS side's parser)
  - PyYAML yaml.load with the Oracle's _StrictBaseLoader (the
    Oracle's actual loader; accept/reject here is the Oracle's
    parser-level verdict before the _reject_* rules run)

Families (R15 §2, all trigger mode unless noted):
  p1 C3 overreach — tag + unglued anchored empty key at root 1st /
     root 2nd+ / nested 2nd+ pair: TS VALID vs Oracle yaml_parse_error
     (C3 fires; (d)/(c) do not). Narrow C3 to skip tag+unglued pairs.
  p2 scanner layer — no-space `&x:!!tag`: PyYAML does not treat `:`
     as a value indicator without a following space (flow reads a
     plain-scalar key; block throws ScannerError), so the token walk
     never sees the lone-doc pattern. Text-layer scanner mirror.
  p3 loader boundary — scalar tags on collection values
     (`!!int`/`!!bool`/`!!float` crash the loader with native
     TypeError/AttributeError; `!!str` renders the collection as a
     string repr so `on` comes back UNKNOWN). Loader must ignore
     scalar tags on collection nodes, like the yaml package.

Every live divergence is confirmed end-to-end by map2-p0-16.py
before fixing, because parser-level mapping can mislead
(FIX-P0-11 lesson).

Usage (from the repo root):
    python3 evidence/probes/fix-p0-16/map-p0-16.py [group]
Group selects a shape group: p1, p2, p3, or all (default).
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


# ---------------------------------------------------------------- p1: C3
P1 = [
    ("p1-root-first", full("!bar &b : 2\n"), "FIXED: tag+unglued, root 1st pair (C3 narrowed)"),
    ("p1-root-first-str", full("!!str &b : 2\n"), "FIXED: !!str tag+unglued, root 1st pair (C3 narrowed)"),
    ("p1-root-first-foo", full("!foo &x : 1\n"), "FIXED: !foo tag+unglued, root 1st pair (C3 narrowed)"),
    ("p1-root-second", full("a: 1\n!bar &b : 2\n"), "FIXED: tag+unglued, root 2nd pair (C3 narrowed)"),
    ("p1-root-third", full("a: 1\nb: 2\n!bar &b : 3\n"), "tag+unglued, root 3rd pair"),
    ("p1-root-second-null", full("a: 1\n!bar &b :\n"), "tag+unglued, root 2nd pair, null value"),
    ("p1-nested-second", full("m:\n  a: 1\n  !bar &b : 2\n"), "FIXED: tag+unglued, nested 2nd pair (C3 narrowed)"),
    ("p1-nested-third", full("m:\n  a: 1\n  b: 2\n  !bar &b : 3\n"), "tag+unglued, nested 3rd pair"),
    ("p1-nested-first", full("m:\n  !bar &b : 2\n"), "CONTROL: tag+unglued, nested 1st pair of value map — (d) must still reject"),
    ("p1-nested-first-2pair", full("m:\n  !bar &b : 2\n  c: 3\n"), "tag+unglued, nested 1st pair + 2nd pair — (d) must still reject"),
    ("p1-nested-first-3pair", full("m:\n  !bar &b : 2\n  c: 3\n  d: 4\n"), "tag+unglued, nested 1st pair + 2 more pairs"),
    ("p1-deep-second", full("a:\n  b:\n    c: 1\n    !bar &x : 2\n"), "tag+unglued, deeply nested 2nd pair"),
    ("p1-flow-first", full("m: {!bar &b : 1}\n"), "tag+unglued in flow map, 1st pair"),
    ("p1-flow-second", full("m: {a: 1, !bar &b : 2}\n"), "tag+unglued in flow map, 2nd pair"),
    ("p1-seq-item", full("m:\n  - !bar &b : 2\n"), "tag+unglued in block-seq item map"),
    ("p1-lone", "!bar &b : 2\n", "tag+unglued, lone doc (single pair)"),
    ("p1-docmark-first", full("---\n!bar &b : 2\n"), "tag+unglued, root 1st pair after docmark"),
    ("p1-glued-ctrl", full("a: 1\n!bar &b: 2\n"), "CONTROL: tag+GLUED — (c)/C3 must still reject"),
    ("p1-glued-root-first", full("!bar &b: 2\n"), "CONTROL: tag+glued, root 1st pair (single pair map, (c) fires)"),
    ("p1-untagged-unglued-ctrl", full("a: 1\n&b : 2\n"), "CONTROL: untagged unglued — (d) must still reject"),
    ("p1-untagged-glued-ctrl", full("a: 1\n&b: 2\n"), "CONTROL: untagged glued — C3 must still reject"),
    ("p1-first-null-exempt", full("&b:\n"), "CONTROL R13 4.2: first-pair null glued — both VALID"),
    ("p1-first-null-unglued", full("&b :\n"), "CONTROL R13 4.2: first-pair null unglued — both reject"),
    ("p1-tag-no-anchor", full("m:\n  !bar : 2\n"), "FIXED: tag, no anchor — _reject_tagged_empty_key"),
    ("p1-explicit-key", full("m:\n  ? !bar &b : 2\n"), "tag+unglued, explicit key"),
    ("p1-verbatim-tag", full("!<foo> &b : 2\n"), "verbatim tag+unglued, root 1st pair"),
    ("p1-handle-tag-second", full("a: 1\n!!str &b : 2\n"), "handle tag+unglued, root 2nd pair"),
]

# ---------------------------------------------------------------- p2: nospace
P2 = [
    ("p2-str-flow", "&b:!!str {on: pull_request}\n", "FIXED: nospace !!str, flow-map lone doc (scanner mirror)"),
    ("p2-str-block", "&b:!!str\n  on: pull_request\n  jobs:\n    test:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n", "FIXED: nospace !!str, block-map lone doc (scanner mirror)"),
    ("p2-int-flow", "&b:!!int {on: pull_request}\n", "nospace !!int, flow-map lone doc"),
    ("p2-bool-block", "&b:!!bool\n  on: pull_request\n  jobs:\n    test:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n", "nospace !!bool, block-map lone doc"),
    ("p2-foo-flow", "&b:!foo {on: pull_request}\n", "nospace !foo, flow-map lone doc"),
    ("p2-foo-block", "&b:!foo\n  on: pull_request\n  jobs:\n    test:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n", "nospace !foo, block-map lone doc"),
    ("p2-str-scalar", "&b:!!str hello\n", "nospace !!str, scalar lone-doc value"),
    ("p2-str-scalar-wf", full("&b:!!str hello\n"), "nospace !!str, scalar value + workflow pairs"),
    ("p2-str-seq", "&b:!!str [1, 2]\n", "nospace !!str, flow-seq lone-doc value"),
    ("p2-str-null", "&b:!!str\n", "nospace !!str, null lone-doc value"),
    ("p2-str-nobrace", "&b:!!str{on: pull_request}\n", "nospace !!str, no space before brace either"),
    ("p2-nested", full("m:\n  &b:!!str {a: 1}\n"), "nospace !!str, nested pair"),
    ("p2-root-second", full("a: 1\n&b:!!str {c: 3}\n"), "nospace !!str, root 2nd pair"),
    ("p2-flow-map", full("m: {&b:!!str {a: 1}}\n"), "nospace !!str inside a flow map"),
    ("p2-value-pos", full("m: &b:!!str {a: 1}\n"), "nospace anchor-colon in a value slot"),
    ("p2-on-value", "on: &b:!!str {push: {}}\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "nospace anchor-colon on the on: value"),
    ("p2-str-flow-spaced", "&b: !!str {on: pull_request}\n", "CONTROL: spaced !!str flow — already MATCH"),
    ("p2-str-block-spaced", "&b: !!str\n  on: pull_request\n  jobs:\n    test:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n", "CONTROL: spaced !!str block — already MATCH"),
    ("p2-quoted", full('a: "&b:!!str {on: push}"\n'), "CONTROL: pattern inside a double-quoted scalar — must NOT be mirrored"),
    ("p2-squoted", full("a: '&b:!!str {on: push}'\n"), "CONTROL: pattern inside a single-quoted scalar — must NOT be mirrored"),
    ("p2-comment", "# &b:!!str {on: push}\n" + WF, "CONTROL: pattern inside a comment — must NOT be mirrored"),
    ("p2-plain-mid", full("a: x&b:!!str\n"), "CONTROL: pattern mid plain scalar — must NOT be mirrored"),
    ("p2-plain-key", full("&b:!!str hello: 1\n"), "nospace !!str as a plain-scalar key fragment?"),
]

# ---------------------------------------------------------------- p3: loader
P3 = [
    ("p3-int-lone", "&b: !!int {on: pull_request}\n", "FIXED: !!int on flow-map lone-doc value (loader)"),
    ("p3-bool-lone", "&b: !!bool {on: pull_request}\n", "FIXED: !!bool on flow-map lone-doc value (loader)"),
    ("p3-float-lone", "&b: !!float {on: pull_request}\n", "!!float on flow-map lone-doc value"),
    ("p3-str-lone", "&b: !!str {on: pull_request}\n", "CONTROL: !!str on flow-map lone-doc value — already MATCH via unwrap"),
    ("p3-int-m", full("m: !!int {a: 1}\n"), "FIXED: !!int on flow-map m: value (loader)"),
    ("p3-float-m", full("m: !!float {a: 1}\n"), "FIXED: !!float on flow-map m: value (loader)"),
    ("p3-bool-m", full("m: !!bool {a: 1}\n"), "!!bool on flow-map m: value"),
    ("p3-str-m", full("m: !!str {a: 1}\n"), "!!str on flow-map m: value"),
    ("p3-null-m", full("m: !!null {a: 1}\n"), "!!null on flow-map m: value"),
    ("p3-foo-m", full("m: !foo {a: 1}\n"), "unknown !foo on flow-map m: value"),
    ("p3-int-on", "on: !!int {push: {}}\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "FIXED: !!int on flow-map on: value (loader)"),
    ("p3-bool-on", "on: !!bool {push: {}}\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "FIXED: !!bool on flow-map on: value (loader)"),
    ("p3-float-on", "on: !!float {push: {}}\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "FIXED: !!float on flow-map on: value (loader)"),
    ("p3-str-on", "on: !!str {push: {}}\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "FIXED: !!str on flow-map on: value (was UNKNOWN; loader)"),
    ("p3-null-on", "on: !!null {push: {}}\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "!!null on flow-map on: value"),
    ("p3-foo-on", "on: !foo {push: {}}\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "unknown !foo on flow-map on: value"),
    ("p3-int-on-block", "on: !!int\n  push: {}\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "!!int on block-map on: value"),
    ("p3-str-on-block", "on: !!str\n  push: {}\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "!!str on block-map on: value"),
    ("p3-int-jobs", "on: push\njobs: !!int {test: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}}\n", "!!int on flow-map jobs: value"),
    ("p3-str-jobs", "on: push\njobs: !!str {test: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}}\n", "!!str on flow-map jobs: value"),
    ("p3-int-jobs-block", "on: push\njobs: !!int\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "!!int on block-map jobs: value"),
    ("p3-int-seq", full("m: !!int [1, 2]\n"), "!!int on flow-seq m: value"),
    ("p3-bool-seq", full("m: !!bool [1, 2]\n"), "!!bool on flow-seq m: value"),
    ("p3-str-seq", full("m: !!str [1, 2]\n"), "!!str on flow-seq m: value"),
    ("p3-float-seq-block", full("m: !!float\n  - 1\n  - 2\n"), "!!float on block-seq m: value"),
    ("p3-int-blockmap", full("m: !!int\n  a: 1\n"), "!!int on block-map m: value"),
    ("p3-str-blockmap", full("m: !!str\n  a: 1\n"), "!!str on block-map m: value"),
    ("p3-bool-blockmap", full("m: !!bool\n  a: 1\n"), "!!bool on block-map m: value"),
    ("p3-on-list", "on: !!int [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "!!int on flow-seq on: value"),
    ("p3-on-str-list", "on: !!str [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "!!str on flow-seq on: value"),
    ("p3-nested", full("m:\n  n: !!int {a: 1}\n"), "!!int on flow-map, nested value"),
    ("p3-deep", full("m:\n  n:\n    o: !!bool {a: 1}\n"), "!!bool on flow-map, deeply nested value"),
    ("p3-timestamp-m", full("m: !!timestamp {a: 1}\n"), "!!timestamp (non-core tag) on flow-map m: value"),
    ("p3-set-m", full("m: !!set {a: null}\n"), "!!set (non-core tag) on flow-map m: value"),
    ("p3-scalar-int", full("a: !!int 1\n"), "CONTROL: !!int on a scalar value — must stay MATCH"),
    ("p3-scalar-str", full("a: !!str 1\n"), "CONTROL: !!str on a scalar value — must stay MATCH"),
    ("p3-scalar-bool", full("a: !!bool true\n"), "CONTROL: !!bool on a scalar value — must stay MATCH"),
    ("p3-scalar-float", full("a: !!float 1.5\n"), "CONTROL: !!float on a scalar value — must stay MATCH"),
    ("p3-scalar-null", full("a: !!null 1\n"), "CONTROL: !!null on a scalar value — must stay MATCH"),
    ("p3-int-key", full("!!int 1: x\n"), "tagged scalar key — control"),
    ("p3-map-key", full("!!int {a: 1}: x\n"), "tagged MAP as a key — boundary probe"),
]

# ---------------------------------------------------------------- p4: residual boundaries
# Boundary probes for the grid residuals found while fixing the
# three R15 families (p1-tag-no-anchor, p2-flow-map, and the
# !foo &b:!!str (c)-interaction shape). All three were closed with
# targeted rules (see _reject_tagged_empty_key,
# _reject_flow_anchored_empty_key_collection, and the prevProp
# mirror extension); the p4 group now stands 56/56 MATCH.
P4 = [
    # flow anchor-colon (p2-flow-map family: ':' is already a value
    # indicator in flow, so PyYAML builds a pair where the yaml
    # package reads a collection key)
    ("p4-flow-notag", full("m: {&b: {a: 1}}\n"), "nospace anchor-colon, no tag, flow-map value"),
    ("p4-flow-seq", full("m: {&b:!!str [1, 2]}\n"), "nospace anchor-colon, flow-seq value"),
    ("p4-flow-second", full("m: {a: 1, &b:!!str {c: 3}}\n"), "nospace anchor-colon, flow 2nd pair"),
    ("p4-flow-scalar", full("m: {&b:!!str hello}\n"), "CONTROL: nospace anchor-colon, scalar value — both VALID"),
    ("p4-flow-spaced", full("m: {&b: !!str {a: 1}}\n"), "CONTROL: spaced anchor-colon, flow-map value — both VALID"),
    ("p4-flow-blockseq", full("m: [{&b:!!str {a: 1}}]\n"), "nospace anchor-colon, flow-seq of flow-map"),
    # tag without anchor (p1-tag-no-anchor family: TS hasUnrepresentableKey
    # rejects a bare tagged empty key; no Oracle rule fires)
    ("p4-tag-noanchor-flow", full("m: {!bar : 2}\n"), "tag, no anchor, flow map"),
    ("p4-tag-noanchor-root", full("!bar : 2\n"), "tag, no anchor, root 1st pair"),
    ("p4-tag-noanchor-null", full("m:\n  !bar :\n"), "tag, no anchor, null value"),
    ("p4-tag-noanchor-quoted", full('m:\n  !bar "": 2\n'), "CONTROL: tag + QUOTED empty key — both VALID"),
    ("p4-tag-noanchor-plain", full("m:\n  !bar x: 2\n"), "CONTROL: tag + scalar key — both VALID"),
    ("p4-tag-noanchor-second", full("m:\n  a: 1\n  !bar : 2\n"), "tag, no anchor, 2nd pair of pair-value map"),
    ("p4-tag-noanchor-seq", full("m:\n  - !bar : 2\n"), "tag, no anchor, block-seq item map"),
    ("p4-tag-noanchor-deep", full("a:\n  b:\n    !bar : 2\n"), "tag, no anchor, deeply nested 1st pair"),
    ("p4-tag-noanchor-root2", full("a: 1\n!bar : 2\n"), "tag, no anchor, root 2nd pair"),
    ("p4-flow-valpos-map", full("m: {a: &b:!!str {c: 3}}\n"), "nospace anchor-colon, flow VALUE pos, map value"),
    ("p4-flow-valpos-scalar", full("m: {a: &b:!!str hello}\n"), "CONTROL: nospace anchor-colon, flow VALUE pos, scalar value"),
    ("p4-flow-valpos-notag", full("m: {a: &b: {c: 3}}\n"), "nospace anchor-colon, flow VALUE pos, no tag, map value"),
    ("p4-flow-valpos-seq", full("m: {a: &b: [1, 2]}\n"), "nospace anchor-colon, flow VALUE pos, seq value"),
    ("p4-block-coll-map", full("m:\n  &b: {a: 1}\n"), "block pair, anchor-colon, flow-map value"),
    ("p4-block-coll-seq", full("m:\n  &b: [1, 2]\n"), "block pair, anchor-colon, flow-seq value"),
    ("p4-block-coll-blockmap", full("m:\n  &b:\n    a: 1\n"), "block pair, anchor-colon, block-map value"),
    ("p4-block-coll-tag", full("m:\n  !foo &b: {a: 1}\n"), "block pair, tag+anchor-colon, flow-map value — (c) fires"),
    ("p4-block-scalar", full("m:\n  &b: 1\n"), "CONTROL: block pair, anchor-colon, scalar value — both VALID"),
    ("p4-flow-seqitem-map", full("m: [&b:!!str {a: 1}]\n"), "flow-seq item pair, anchor-colon, map value"),
    ("p4-flow-seqitem-scalar", full("m: [&b: 1]\n"), "CONTROL: flow-seq item pair, anchor-colon, scalar value"),
    # (c) interaction: a tag before a nospace anchor-colon. The
    # mirror must not fire (prevProp) and (c) must not fire on the
    # unmirrored tokens; TS rejects via E05 (hasRejectedAnchorOrTag).
    ("p4-tag-anchor-nospace", full("!foo &b:!!str {on: push}\n"), "tag + nospace anchor-colon, flow value"),
    ("p4-tag-anchor-nospace-2", full("a: 1\n!foo &b:!!str {c: 3}\n"), "tag + nospace anchor-colon, root 2nd pair"),
]

GROUPS = {"p1": P1, "p2": P2, "p3": P3, "p4": P4}


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
    except Exception as e:  # native crash (P0-3): record the type
        return {"ok": False, "error": f"CRASH {type(e).__name__}: {e}"[:160]}


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
    for g in (["p1", "p2", "p3", "p4"] if group == "all" else [group]):
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
