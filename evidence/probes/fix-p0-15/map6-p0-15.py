#!/usr/bin/env python3
"""FIX-P0-15 map6: `!!str` / known-tag on the unwrap value mapping.

Four variants (space after `:` x flow/block) plus controls, end-to-end
(TS bundle vs Oracle probe drivers, full JSON compare — same harness
as map5-p0-15.py). The no-space variants are scanner-level divergences
(PyYAML does not see the `:` as a value indicator); the with-space
variants are the ones the unwrap + span re-parse must close.
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
    ("a-str-flow-space", "&x: !!str {on: push}\n"),
    ("a-str-flow-nospace", "&x:!!str {on: push}\n"),
    ("a-str-block-space", "&x: !!str\n  on: push\n  jobs:\n    test:\n      runs-on: ubuntu-latest\n"),
    ("a-str-block-nospace", "&x:!!str\n  on: push\n  jobs:\n    test:\n      runs-on: ubuntu-latest\n"),
    ("a-str-flow-space-jobs", "&x: !!str {jobs: {test: {runs-on: ubuntu-latest, steps: [{run: 'echo hi'}]}}}\n" + WF),
    ("a-int-flow-space", "&x: !!int {on: push}\n"),
    ("a-bool-flow-space", "&x: !!bool {on: push}\n"),
    ("a-unknown-flow-space", "&x: !foo {on: push}\n"),
    ("a-unknown-block-space", "&x: !foo\n  on: push\n  jobs:\n    test:\n      runs-on: ubuntu-latest\n"),
    ("a-handle-flow-space", "&x: !!str {on: push, jobs: {test: {runs-on: ubuntu-latest, steps: [{run: 'echo hi'}]}}}\n"),
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
    with tempfile.TemporaryDirectory(prefix="map6-p0-15-") as tmp:
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
            print(f"{sid:<28} {' '.join(line)}")
    (HERE / "map6-results.json").write_text(json.dumps(rows, indent=2))
    nd = sum(1 for r in rows if not (r["trigger"]["match"] and r["jobs"]["match"]))
    print(f"map6: {len(rows)} shapes, {nd} DIFF")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
