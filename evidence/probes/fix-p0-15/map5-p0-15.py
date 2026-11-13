#!/usr/bin/env python3
"""FIX-P0-15 map5: final boundary round (end-to-end, TS bundle vs Oracle
probe drivers, full JSON compare — same harness style as map2-p0-15.py).

Covers the last open questions before implementation:
  * (c) E05 in flow positions: 2nd pair, 1st-of-2-pair, flow seq of flow map.
  * (d) tagged+unglued condition: block-seq-item single pair, root-seq item,
    block-seq-item 2-pair (C3 covers?), e-position tagged+unglued nested key,
    nested single-pair tagged+unglued (needs (d) tagged condition).
  * Controls: lone tagged+unglued (must stay MATCH), C3 over-fire shapes
    (pre-existing, disclosed residual, stay DIFF).
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

SHAPES = [
    # (c) flow positions
    ("c-flow-2nd", "m: {a: 1, !foo &x: 2}\n" + WF),
    ("c-flow-1st-2pair", "m: {!foo &x: 1, b: 2}\n" + WF),
    ("c-flow-seq-of-map", "m: [{!foo &x: 1}]\n" + WF),
    # (d) tagged+unglued condition
    ("d-blockseq-item-single", "m:\n  - !foo &x : 1\n" + WF),
    ("d-rootseq-item", "- !foo &x : 1\n- b: 2\n" + WF),
    ("d-blockseq-item-2pair", "m:\n  - !foo &x : 1\n  - b: 2\n" + WF),
    ("d-epos-tag-unglued", "&x:\n  !foo &y : 1\n" + WF),
    ("d-nested-single-tag-unglued", "m:\n  !foo &x : 1\n" + WF),
    # controls / disclosed residual
    ("f-lone-tag-unglued", "!foo &x : 1\n"),
    ("x-c3-overfire-tag-unglued-2nd", "a: 1\n!foo &x : 2\n" + WF),
    ("x-c3-overfire-tag-unglued-2nd-nested", "m:\n  a: 1\n  !foo &x : 2\n" + WF),
    ("d-rootseq-item-untagged", "- &x : 1\n- b: 2\n" + WF),
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
    rows = []
    with tempfile.TemporaryDirectory(prefix="map5-p0-15-") as tmp:
        tmp = Path(tmp)
        bundle = tmp / "ts-probe.cjs"
        r = subprocess.run(
            [str(esbuild), str(entry), "--bundle", "--platform=node",
             "--format=cjs", f"--outfile={bundle}", "--log-level=error"],
            capture_output=True, text=True)
        if r.returncode != 0:
            print("esbuild failed:\n" + r.stderr, file=sys.stderr)
            return 2
        for sid, text in SHAPES:
            yf = tmp / "case.yml"
            yf.write_text(text, encoding="utf-8")
            line = []
            row = {"id": sid, "yaml": text}
            for mode in ("trigger", "jobs"):
                ts = run_json(["node", str(bundle), mode, str(yf), "probe"])
                if mode == "trigger":
                    orc = run_json(["python3", str(REPO / "scripts" / "oracle-parse-probe.py"),
                                    "--yaml", str(yf), "--fixture-id", "probe"])
                else:
                    orc = run_json(["python3", str(REPO / "scripts" / "oracle-jobs-probe.py"),
                                    "--yaml", str(yf)])
                match = ts == orc
                row[mode] = {"ts": ts, "oracle": orc, "match": match}
                line.append(f"{mode}:{'MATCH' if match else 'DIFF'}(TS {verdict(ts)} / O {verdict(orc)})")
            rows.append(row)
            print(f"{sid:<38} {' '.join(line)}")
    (HERE / "map5-results.json").write_text(json.dumps(rows, indent=2))
    nd = sum(1 for r in rows if not (r["trigger"]["match"] and r["jobs"]["match"]))
    print(f"map5: {len(rows)} shapes, {nd} DIFF")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
