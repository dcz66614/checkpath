"""Round-4 mapping for FIX-P0-13: C3 edge cases (anchor on nested
block value vs empty key; seq-item mapping with >=2 pairs; double
properties) + C1 seq-item flow map. Prints full TS/Oracle status.
Usage: python3 evidence/probes/fix-p0-13/map4-p0-13.py
"""
from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent.parent
TAIL = ("name: probe\non: push\njobs:\n  test:\n"
        "    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n")

SHAPES = [
    ("c3-anchor-blockval", "&x:\n  a: 1\n" + TAIL),
    ("c3-anchor-nullval", "&x:\n" + TAIL),
    ("c3-anchor-nullval-mid", "name: probe\n&x:\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("c3-anchor-another-anchor", "&x: &y 1\n" + TAIL),
    ("c3-tag-anchor-key", "!foo &x: 1\n" + TAIL),
    ("c3-anchor-tag-key", "&x !foo: 1\n" + TAIL),
    ("c3-seqitem-2pairs", "m:\n  - &x: 1\n    b: 2\n" + TAIL),
    ("c3-seqitem-1pair", "m:\n  - &x: 1\n" + TAIL),
    ("c3-anchor-flowval", "&x: {a: 1}\n" + TAIL),
    ("c3-anchor-seqval", "&x: [1, 2]\n" + TAIL),
    ("c3-anchor-blockseq-val", "&x:\n  - 1\n  - 2\n" + TAIL),
    ("c1-seqitem-flowmap", "m:\n  - {a: !foo, b: 1}\n" + TAIL),
    ("c1-anchor-then-comma", "m: {a: &x, b: 1}\n" + TAIL),
]


def run_json(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        return {"_error": (r.stderr.strip() or r.stdout.strip())[:200]}
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return {"_error": "non-json: " + r.stdout[:200]}


def main() -> int:
    esbuild = REPO / "node_modules" / ".bin" / "esbuild"
    entry = REPO / "evidence" / "probes" / "fix-p0-12" / "ts-probe-entry.ts"
    with tempfile.TemporaryDirectory(prefix="map4-p0-13-") as tmp:
        tmp = Path(tmp)
        bundle = tmp / "ts-probe.cjs"
        r = subprocess.run(
            [str(esbuild), str(entry), "--bundle", "--platform=node",
             "--format=cjs", f"--outfile={bundle}", "--log-level=error"],
            capture_output=True, text=True)
        if r.returncode != 0:
            print("esbuild failed:\n" + r.stderr)
            return 2
        for sid, text in SHAPES:
            yf = tmp / "case.yml"
            yf.write_text(text, encoding="utf-8")
            ts = run_json(["node", str(bundle), "trigger", str(yf), "probe"])
            orc = run_json(["python3", str(REPO / "scripts" / "oracle-parse-probe.py"),
                            "--yaml", str(yf), "--fixture-id", "probe"])
            print(f"=== {sid:<26} {'MATCH' if ts == orc else 'DIFF'}")
            print(f"    TS: {ts.get('status')} {ts.get('errors')}")
            print(f"    O : {orc.get('status')} {orc.get('errors')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
