"""Round-2 mapping for FIX-P0-14: the map-p0-14.py shape grid through
the real end-to-end probe drivers (TS bundle + Oracle drivers, full
JSON compare). Bare-fragment parser mapping (map-p0-14.py) can
mislead: the probe only compares TriggerIR (trigger mode) and the
job list (jobs mode), so a difference in an ignored key's VALUE is
invisible — only parse status / on: / jobs: content matter.

Usage (from the repo root, after `npm ci`):
    python3 evidence/probes/fix-p0-14/map2-p0-14.py [group]
Groups: a (lone-doc value forms), b (controls), all (default).
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
sys.path.insert(0, str(HERE))

import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("map_p0_14", HERE / "map-p0-14.py")
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
A, B = _mod.A, _mod.B

GROUPS = {"a": A, "b": B}


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
    group = sys.argv[1] if len(sys.argv) > 1 else "all"
    shapes = []
    for g in (["a", "b"] if group == "all" else [group]):
        shapes += GROUPS[g]
    esbuild = REPO / "node_modules" / ".bin" / "esbuild"
    entry = REPO / "evidence" / "probes" / "fix-p0-13" / "ts-probe-entry.ts"
    with tempfile.TemporaryDirectory(prefix="map2-p0-14-") as tmp:
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
            print(f"{sid:<22} {' '.join(line)}  # {note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
