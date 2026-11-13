#!/usr/bin/env python3
"""Generate FIX-P0-15 fixtures + expected.json.

20 fixtures covering the 5 P0 families' key shapes + controls:
  (a) unwrap: flow-map / block-map / full workflow in the value /
      tagged value / jobs-only value / !!str block-map value
  (b) second anchor: scalar / flow-seq / self-alias value
  (c) tag on key: plain tag / handle tag / docmark + tag
  (d) unglued: lone / nested single-pair
  (e) nested block map: anchored key / block-map value
  controls: flow twin (must stay missing_on_key), quoted empty key,
      lone scalar (R13 core), anchored non-empty key + 2nd anchor.

Runs both sides on each fixture and asserts they agree
(status / errors / events) before writing expected.json — a
disagreement here is a generator failure, not a fixture.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
OUT = REPO / "tests" / "fixtures" / "parser-divergence" / "lone-anchored-empty-key-p0-15"

FIXTURES = [
    ("p01-flowmap-on", "&x: {on: push}\n", "(a) unwrap: flow-map value WITH on"),
    ("p02-blockmap-on", "&x:\n  on: push\n", "(a) unwrap: block-map value WITH on"),
    ("p03-flow-full", "&x: {on: push, jobs: {test: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}}}\n", "(a) unwrap: full workflow in flow-map value"),
    ("p04-tag-map-on", "&x: !foo {on: push}\n", "(a) unwrap: tagged flow-map value WITH on"),
    ("p05-jobs-only", "&x: {jobs: {test: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}}}\n", "(a) unwrap: jobs but no on (trigger stays missing_on_key)"),
    ("p06-anchor-val", "&x: &y 1\n", "(b) second anchor, scalar value"),
    ("p07-anchor-seq", "&x: &y [1]\n", "(b) second anchor, flow-seq value"),
    ("p08-self-alias-val", "&x: *x\n", "(b) alias to the outer anchor as the value"),
    ("p09-tag-key", "!foo &x: 1\n", "(c) tag on the key"),
    ("p10-handle-key", "!!str &x: 1\n", "(c) handle tag on the key"),
    ("p11-docmark-tagkey", "---\n!foo &x: 1\n", "(c) docmark + tag on the key"),
    ("p12-unglued", "&x : 1\n", "(d) unglued anchor-colon"),
    ("p13-unglued-nested", "m:\n  &x : 1\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "(d) unglued, nested single pair"),
    ("p14-nested-block", "&x:\n  &y: 1\n", "(e) nested block-map value, anchored key"),
    ("p15-nested-blockmap", "&x:\n  &y:\n    b: 2\n", "(e) nested, block-map value"),
    ("p16-nested-flow-twin", "&x: {&y: 1}\n", "control: flow twin (both missing_on_key)"),
    ("p17-quoted-empty", "\"\": 1\n", "control: quoted empty key (both missing_on_key)"),
    ("p18-lone-scalar", "&x: 1\n", "control: R13 lone-doc core (both workflow_root_not_mapping)"),
    ("p19-nonempty-2anchor", "&x k: &y 1\n", "control: anchor on non-empty key + 2nd anchor on value"),
    ("p20-str-blockmap-on", "&x: !!str\n  on: push\n", "(a) unwrap: !!str on block-map value WITH on (span re-parse)"),
]


def run_json(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"command failed: {' '.join(cmd)}\n{r.stderr[:500]}")
    return json.loads(r.stdout)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    esbuild = REPO / "node_modules" / ".bin" / "esbuild"
    entry = REPO / "evidence" / "probes" / "fix-p0-13" / "ts-probe-entry.ts"
    cases = []
    with tempfile.TemporaryDirectory(prefix="gen-fixtures-p0-15-") as tmp:
        tmp = Path(tmp)
        bundle = tmp / "ts-probe.cjs"
        r = subprocess.run(
            [str(esbuild), str(entry), "--bundle", "--platform=node",
             "--format=cjs", f"--outfile={bundle}", "--log-level=error"],
            capture_output=True, text=True)
        if r.returncode != 0:
            print("esbuild failed:\n" + r.stderr, file=sys.stderr)
            return 2
        for fid, text, note in FIXTURES:
            yf = OUT / f"{fid}.yml"
            yf.write_text(text, encoding="utf-8")
            ts = run_json(["node", str(bundle), "trigger", str(yf), fid])
            ora = run_json(["python3", str(REPO / "scripts" / "oracle-parse-probe.py"),
                            "--yaml", str(yf), "--fixture-id", fid])
            for side in ("status", "errors", "events"):
                if ts[side] != ora[side]:
                    raise SystemExit(
                        f"{fid}: TS and Oracle disagree on {side}:\n"
                        f"  TS: {json.dumps(ts[side])}\n"
                        f"  O:  {json.dumps(ora[side])}")
            cases.append({
                "id": fid,
                "file": f"{fid}.yml",
                "note": note,
                "typescript": {"status": ts["status"], "errors": ts["errors"], "events": ts["events"]},
                "oracle": {"status": ora["status"], "errors": ora["errors"], "events": ora["events"]},
            })
            print(f"{fid}: {ts['status']}/{','.join(ts['errors'])} events={json.dumps(ts['events'])}")
    (OUT / "expected.json").write_text(
        json.dumps({"schema": "checkpath.parser-divergence/v1", "cases": cases},
                   indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(cases)} fixtures + expected.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
