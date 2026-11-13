"""Round-3 mapping for FIX-P0-13: C3 nested-single-pair threshold +
error-string inspection for the puzzling full-doc reversals.
Prints full TS/Oracle status + errors for each shape.
Usage: python3 evidence/probes/fix-p0-13/map3-p0-13.py
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
    ("c3-nested-single", "a:\n  &x: 1\n" + TAIL),
    ("c3-under-m-single", "m:\n  &x: 1\n" + TAIL),
    ("c3-on-first", "on: push\n&x: 1\nname: probe\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"),
    ("c3-lone-doc", "&x: 1\n"),
    ("c3-seqitem-two", "- a:\n    &x: 1\n  b: 2\n" + TAIL),
    ("c3-seqitem-one", "- a:\n    &x: 1\n" + TAIL),
    ("c3-space-colon", "&x : 1\n" + TAIL),
    ("c3-space-colon-nested", "a:\n  &x : 1\n  b: 2\n" + TAIL),
    ("c1-seqval-after", "m: {a: !foo, [1, 2]}\n" + TAIL),
    ("c1-mapval-after", "m: {a: !foo, {b: 1}}\n" + TAIL),
    ("c1-bang-comma", "m: {a: !, b: 1}\n" + TAIL),
    ("c1-tag-comma-crlf", "m: {a: !foo,\r\n b: 1}\r\n" + TAIL.replace("\n", "\r\n")),
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
    with tempfile.TemporaryDirectory(prefix="map3-p0-13-") as tmp:
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
            print(f"=== {sid}: {'MATCH' if ts == orc else 'DIFF'}")
            print(f"    TS: {ts.get('status')} {ts.get('errors')}")
            print(f"    O : {orc.get('status')} {orc.get('errors')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
