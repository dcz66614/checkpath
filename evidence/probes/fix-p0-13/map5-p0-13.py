"""Round-5 mapping for FIX-P0-13: null-valued anchored empty keys in
every position (first/mid/last, root/nested, with comment) + lone
`&x:` doc. Prints full TS/Oracle status + errors.
Usage: python3 evidence/probes/fix-p0-13/map5-p0-13.py
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
    ("null-last", "name: probe\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n&x:\n"),
    ("null-first", "&x:\n" + TAIL),
    ("null-mid", "name: probe\n&x:\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("null-nested-first", "a:\n  &x:\n  b: 2\n" + TAIL),
    ("null-nested-last", "a:\n  b: 2\n  &x:\n" + TAIL),
    ("null-nested-only", "a:\n  &x:\n" + TAIL),
    ("null-first-comment", "&x:  # c\n" + TAIL),
    ("null-first-space", "&x :\n" + TAIL),
    ("lone-null", "&x:\n"),
    ("lone-scalar", "&x: 1\n"),
    ("null-first-blockseq", "m:\n  - &x:\n    b: 2\n" + TAIL),
    ("null-seqitem-only", "m:\n  - &x:\n" + TAIL),
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
    with tempfile.TemporaryDirectory(prefix="map5-p0-13-") as tmp:
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
            print(f"=== {sid:<22} {'MATCH' if ts == orc else 'DIFF'}")
            print(f"    TS: {ts.get('status')} {ts.get('errors')}")
            print(f"    O : {orc.get('status')} {orc.get('errors')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
