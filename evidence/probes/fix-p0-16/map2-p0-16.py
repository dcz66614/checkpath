"""Round-2 mapping for FIX-P0-16: the map-p0-16.py shape grid through
the real end-to-end probe drivers (TS bundle + Oracle drivers, full
JSON compare). Bare-fragment parser mapping (map-p0-16.py) can
mislead: the probe only compares TriggerIR (trigger mode) and the
job list (jobs mode), so a difference in an ignored key's VALUE is
invisible — only parse status / on: / jobs: content matter.

Usage (from the repo root, after `npm ci`):
    python3 evidence/probes/fix-p0-16/map2-p0-16.py [group] [--results <path>]
Groups: p1 (C3 overreach), p2 (nospace scanner), p3 (loader),
p4 (residual boundaries), all (default).
With --results, per-shape trigger+jobs verdicts (TS vs Oracle full
JSON) are written to the given path as deterministic JSON (no
timestamps); a re-run on the same tree reproduces it byte-for-byte.
"""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent

_spec = importlib.util.spec_from_file_location("map_p0_16", HERE / "map-p0-16.py")
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
GROUPS = _mod.GROUPS


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
    args = [a for a in sys.argv[1:] if not a.startswith("--results")]
    group = args[0] if args else "all"
    results_path = None
    for a in sys.argv[1:]:
        if a.startswith("--results="):
            results_path = Path(a.split("=", 1)[1])
        elif a == "--results":
            i = sys.argv.index(a)
            results_path = Path(sys.argv[i + 1])
    shapes = []
    for g in (["p1", "p2", "p3", "p4"] if group == "all" else [group]):
        shapes += GROUPS[g]
    esbuild = REPO / "node_modules" / ".bin" / "esbuild"
    entry = REPO / "evidence" / "probes" / "fix-p0-13" / "ts-probe-entry.ts"
    n_match = n_total = 0
    diffs = []
    records = []
    with tempfile.TemporaryDirectory(prefix="map2-p0-16-") as tmp:
        tmp = Path(tmp)
        bundle = tmp / "ts-probe.cjs"
        r = subprocess.run(
            [str(esbuild), str(entry), "--bundle", "--platform=node",
             "--format=cjs", f"--outfile={bundle}", "--log-level=error"],
            capture_output=True, text=True)
        if r.returncode != 0:
            print("esbuild failed:\n" + r.stderr, file=sys.stderr)
            return 2
        for sid, text, note in shapes:
            yf = tmp / "case.yml"
            yf.write_text(text, encoding="utf-8")
            line = []
            rec = {"id": sid, "note": note, "yaml": text, "checks": {}}
            for mode in ("trigger", "jobs"):
                ts = run_json(["node", str(bundle), mode, str(yf), "probe"])
                if mode == "trigger":
                    orc = run_json(["python3", str(REPO / "scripts" / "oracle-parse-probe.py"),
                                    "--yaml", str(yf), "--fixture-id", "probe"])
                else:
                    orc = run_json(["python3", str(REPO / "scripts" / "oracle-jobs-probe.py"),
                                    "--yaml", str(yf)])
                match = ts == orc
                n_total += 1
                n_match += match
                if not match:
                    diffs.append(f"{sid} [{mode}]")
                rec["checks"][mode] = {
                    "match": match,
                    "typescript": verdict(ts),
                    "oracle": verdict(orc),
                }
                line.append(f"{mode}:{'MATCH' if match else 'DIFF'}(TS {verdict(ts)} / O {verdict(orc)})")
            records.append(rec)
            print(f"{sid:<24} {' '.join(line)}  # {note}")
    print(f"\nmap2-p0-16 [{group}]: {n_match}/{n_total} MATCH")
    if diffs:
        print("DIFFs: " + ", ".join(diffs))
    if results_path is not None:
        results_path.write_text(
            json.dumps(
                {"group": group, "match": n_match, "total": n_total,
                 "diffs": diffs, "shapes": records},
                indent=1, sort_keys=False) + "\n",
            encoding="utf-8")
        print(f"results: {results_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
