"""Extra boundary shapes for the FIX-P0-14 discriminant (nested
anchored empty keys, tag/anchor on values). End-to-end verdicts
through the real probe drivers (TS bundle + Oracle drivers, full
JSON compare) — the third mapping round, after the parser-level
map-p0-14.py and the end-to-end map2-p0-14.py.

Usage (from the repo root, after `npm ci`):
    python3 evidence/probes/fix-p0-14/map3-p0-14.py
"""
import json, subprocess, sys, tempfile
from pathlib import Path
REPO = Path(__file__).resolve().parent.parent.parent.parent
SHAPES = [
    ("x-nested-block", "&x:\n  &y: 1\n", "block-map value, single anchored-empty-key pair"),
    ("x-nested-flow", "&x: {&y: 1}\n", "flow-map value, single anchored-empty-key pair"),
    ("x-nested-mixed", "&x:\n  &y: 1\n  a: 2\n", "block-map value, anchored key + real key"),
    ("x-nested-flow-mixed", "&x: {&y: 1, a: 2}\n", "flow-map value, anchored key + real key"),
    ("x-tag-noval", "&x: !foo\n", "tag value with no node"),
    ("x-anchor-seq", "&x: &y [1]\n", "anchored seq value"),
    ("x-anchor-null", "&x: &y\n", "anchored null value"),
    ("x-tag-seq", "&x: !foo [1]\n", "tagged seq value"),
    ("x-tag-map", "&x: !foo {a: 1}\n", "tagged flow-map value"),
    ("x-tag-map-on", "&x: !foo {on: push}\n", "tagged flow-map value WITH on"),
    ("x-seq-anchor-item", "&x:\n  - &y: 1\n", "block-seq value, anchored-empty-key item"),
    ("x-docmark-tagkey", "---\n!foo &x: 1\n", "docmark + tag on key"),
]
def run_json(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        return {"_error": (r.stderr.strip() or r.stdout.strip())[:200]}
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return {"_error": "non-json: " + r.stdout[:200]}
def verdict(x):
    if isinstance(x, dict):
        return "ERR" if "_error" in x else f"{x.get('status')}/{','.join(x.get('errors', []))}"
    if isinstance(x, list):
        return f"[{len(x)} jobs]"
    return "?"
esbuild = REPO / "node_modules" / ".bin" / "esbuild"
entry = REPO / "evidence" / "probes" / "fix-p0-13" / "ts-probe-entry.ts"
with tempfile.TemporaryDirectory(prefix="extra-p0-14-") as tmp:
    tmp = Path(tmp)
    bundle = tmp / "ts-probe.cjs"
    r = subprocess.run([str(esbuild), str(entry), "--bundle", "--platform=node",
                        "--format=cjs", f"--outfile={bundle}", "--log-level=error"],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    for sid, text, note in SHAPES:
        yf = tmp / "case.yml"
        yf.write_text(text, encoding="utf-8")
        out = []
        for mode in ("trigger", "jobs"):
            ts = run_json(["node", str(bundle), mode, str(yf), "probe"])
            orc = run_json(["python3", str(REPO / "scripts" / ("oracle-parse-probe.py" if mode == "trigger" else "oracle-jobs-probe.py")),
                            "--yaml", str(yf)] + (["--fixture-id", "probe"] if mode == "trigger" else []))
            out.append(f"{mode}:{'MATCH' if ts == orc else 'DIFF'}(TS {verdict(ts)} / O {verdict(orc)})")
        print(f"{sid:<22} {' '.join(out)}  # {note}")
