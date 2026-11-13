"""Supplementary end-to-end mapping for FIX-P0-15 (open questions
from the map2-p0-15.py round).

  - self-alias / alias-value shapes in the (b) extension
  - `!!str` block-map unwrap value
  - tag+unglued in multi-pair mappings (does C3 over-fire there?
    R13 4.2 only covered the GLUED tag+anchor case)
  - (c)/(d)/(b) in flow maps and block-seq items
  - anchor on a non-empty key + second anchor on the value (control)

Usage (from the repo root, after `npm ci`):
    python3 evidence/probes/fix-p0-15/map4-p0-15.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent

WF = "on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"


def full(body: str) -> str:
    return body + WF


# (id, fragment, note)
S = [
    ("x-self-alias-val", "&x: *x\n", "alias to the outer anchor as the value"),
    ("x-tag-undef-alias", "&x: !foo *y\n", "tag + undefined alias value"),
    ("x-self-alias-unwrap", "&x: {on: *x}\n", "self-alias inside unwrap value"),
    ("x-str-blockmap-on", "&x: !!str\n  on: push\n", "!!str tag on block-map value WITH on"),
    ("x-tag-unglued-2nd-root", full("a: 1\n!foo &x : 2\n"), "tag+unglued as 2nd root pair (C3 over-fire check)"),
    ("x-tag-unglued-nested-2pair", full("m:\n  !foo &x : 1\n  b: 2\n"), "tag+unglued, nested 2-pair (C3 over-fire check)"),
    ("x-flow-tagkey", full("m: {!foo &x: 1}\n"), "(c) tag on key in flow map"),
    ("x-blockseq-tagkey", full("m:\n  - !foo &x: 1\n"), "(c) tag on key, block-seq item"),
    ("x-blockseq-unglued", full("m:\n  - &x : 1\n"), "(d) unglued, block-seq item"),
    ("x-blockseq-2anchor", full("m:\n  - &x: &y 1\n"), "(b) second anchor, block-seq item"),
    ("x-nonempty-2anchor", "&x k: &y 1\n", "CONTROL: anchor on non-empty key + 2nd anchor on value"),
    ("x-unglued-2anchor", "&x : &y 1\n", "unglued outer anchor + second anchor"),
    ("x-alias-inside-unwrap", "&x: {a: &y 1, b: *y}\n", "CONTROL: alias defined inside unwrap value, before use"),
    ("x-alias-before-def-unwrap", "&x: {on: *y, a: &y 1}\n", "alias BEFORE anchor definition inside unwrap value"),
    ("x-2anchor-alias-def", "a: &z 1\n&x: &y *z\n", "CONTROL: second anchor on alias (defined), both reject?"),
    ("x-anchor-tag-anchor-wf", full("m: &x !foo &y 1\n"), "CONTROL: anchor-tag-anchor in workflow value"),
    ("x-flow-tagkey-null", full("m: {!foo &x:}\n"), "(c) tag on key in flow map, null value"),
    ("x-flow-unglued-2pair", full("m: {&x : 1, b: 2}\n"), "(d) unglued in flow map, 2-pair"),
]


def run_json(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        return {"_error": (r.stderr.strip() or r.stdout.strip())[:300]}
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return {"_error": "non-json stdout: " + r.stdout[:300]}


def verdict(x):
    if isinstance(x, dict):
        if "_error" in x:
            return "ERR"
        return f"{x.get('status')}/{','.join(x.get('errors', []))}"
    if isinstance(x, list):
        return f"[{len(x)} jobs]"
    return "?"


def main() -> int:
    esbuild = REPO / "node_modules" / ".bin" / "esbuild"
    entry = REPO / "evidence" / "probes" / "fix-p0-13" / "ts-probe-entry.ts"
    with tempfile.TemporaryDirectory(prefix="map4-p0-15-") as tmp:
        tmp = Path(tmp)
        bundle = tmp / "ts-probe.cjs"
        r = subprocess.run(
            [str(esbuild), str(entry), "--bundle", "--platform=node",
             "--format=cjs", f"--outfile={bundle}", "--log-level=error"],
            capture_output=True, text=True)
        if r.returncode != 0:
            print("esbuild failed:\n" + r.stderr, file=sys.stderr)
            return 2
        for sid, text, note in S:
            yf = tmp / "case.yml"
            yf.write_text(text, encoding="utf-8")
            line = []
            for mode in ("trigger", "jobs"):
                ts = run_json(["node", str(bundle), mode, str(yf), "probe"])
                if mode == "trigger":
                    orc = run_json(["python3", str(REPO / "scripts" / "oracle-parse-probe.py"),
                                    "--yaml", str(yf), "--fixture-id", "probe"])
                else:
                    orc = run_json(["python3", str(REPO / "scripts" / "oracle-jobs-probe.py"),
                                    "--yaml", str(yf)])
                match = ts == orc
                line.append(f"{mode}:{'MATCH' if match else 'DIFF'}(TS {verdict(ts)} / O {verdict(orc)})")
            print(f"{sid:<28} {' '.join(line)}  # {note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
