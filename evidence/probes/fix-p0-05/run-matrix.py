"""FIX-P0-05 probe matrix runner (D2 flow-alias-key re-verification).

Re-runs the D2-family probe matrix from `cases.json` in this
directory: D2 itself plus 37 flow-alias-key variants, boundary
shapes and no-regression shapes (38 rows, 76 checks) — 72 checks
must MATCH; the only 2 non-matching rows are the flagged known
divergences (N5 block alias key with a mapping anchor; H6 tab
before the colon in a flow alias key; see README.md).

Method: builds the TypeScript probe bundle from the repo source with
esbuild (into a temp dir, never into the worktree), then for each
row runs the TS bundle and the Oracle probe drivers
(`scripts/oracle-parse-probe.py` / `scripts/oracle-jobs-probe.py`)
on the same YAML and compares the full JSON deep-equal (whole
TriggerIR in trigger mode, whole job list in jobs mode — the R5
standard, stricter than the R4 field subset). Writes `results.json`
in this directory (deterministic: no timestamps; a re-run on the
same tree reproduces it byte-for-byte) and exits non-zero unless
every check matches except the flagged known-divergence rows.

Usage (from the repo root, after `npm ci`):
    python3 evidence/probes/fix-p0-05/run-matrix.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
FIXTURE_DIR = REPO / "tests" / "fixtures" / "parser-divergence" / "scalar-rendering"


def run(cmd, strict_stderr=True):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        return {"_error": r.stderr.strip()[:300]}
    if strict_stderr and r.stderr:
        return {"_error": "stderr: " + r.stderr.strip()[:300]}
    return json.loads(r.stdout)


def yaml_for(row):
    if "yaml" in row:
        return row["yaml"]
    if row["id"].startswith("R") and row["id"][1:].isdigit():
        # FIX-P0-03 R1-R10 reuse the scalar-rendering fixture files.
        sfiles = sorted(FIXTURE_DIR.glob("s*.yml"))
        return sfiles[int(row["id"][1:]) - 1].read_text(encoding="utf-8")
    raise ValueError(row)


def main() -> int:
    cases = json.loads((HERE / "cases.json").read_text(encoding="utf-8"))
    esbuild = REPO / "node_modules" / ".bin" / "esbuild"
    if not esbuild.exists():
        print("esbuild not found — run `npm ci` first.", file=sys.stderr)
        return 2
    with tempfile.TemporaryDirectory(prefix="fix-p0-05-probe-") as tmp:
        bundle = Path(tmp) / "ts-probe.cjs"
        r = subprocess.run(
            [str(esbuild), str(HERE / "ts-probe-entry.ts"), "--bundle",
             "--platform=node", "--format=cjs",
             f"--outfile={bundle}", "--log-level=error"],
            capture_output=True, text=True,
        )
        if r.returncode != 0:
            print("esbuild failed:\n" + r.stderr, file=sys.stderr)
            return 2
        results = []
        for row in cases:
            text = yaml_for(row)
            tmp_yaml = Path(tmp) / "case.yml"
            tmp_yaml.write_text(text, encoding="utf-8")
            modes = ["trigger", "jobs"] if row["mode"] == "both" else [row["mode"]]
            entry = {
                "id": row["id"],
                "mode": row["mode"],
                "note": row.get("note", ""),
                "known_divergence": row.get("known_divergence", False),
                "checks": {},
            }
            for mode in modes:
                # Non-strict stderr on the TS side: the `yaml` package
                # prints a process warning when parse() stringifies a
                # collection key (b10 / B8 `? :` form); noise, not a
                # failure.
                ts = run(["node", str(bundle), mode, str(tmp_yaml), "probe"],
                         strict_stderr=False)
                probe = ("scripts/oracle-parse-probe.py"
                         if mode == "trigger" else "scripts/oracle-jobs-probe.py")
                args = ["python3", str(REPO / probe), "--yaml", str(tmp_yaml)]
                if mode == "trigger":
                    args += ["--fixture-id", "probe"]
                ora = run(args)
                match = ts == ora
                entry["checks"][mode] = {
                    "match": match,
                    "ts": ts if not match else "MATCH",
                    "oracle": ora if not match else "MATCH",
                }
            results.append(entry)
    unexpected = [e["id"] for e in results for c in e["checks"].values()
                  if not c["match"] and not e.get("known_divergence")]
    match = sum(1 for e in results for c in e["checks"].values() if c["match"])
    total = sum(len(e["checks"]) for e in results)
    known = sum(1 for e in results if e.get("known_divergence")
                for _ in e["checks"].values())
    print(f"CHECKS {match}/{total} MATCH "
          f"(of which {known} checks are flagged known-divergence)")
    for e in results:
        for mode, c in e["checks"].items():
            if not c["match"]:
                flag = " (flagged known-divergence)" if e.get("known_divergence") else ""
                print(f"DIFF {e['id']} [{mode}]{flag}")
                print("  TS:     " + json.dumps(c["ts"], sort_keys=True)[:600])
                print("  Oracle: " + json.dumps(c["oracle"], sort_keys=True)[:600])
    (HERE / "results.json").write_text(
        json.dumps(results, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"results: {HERE / 'results.json'}")
    return 0 if not unexpected else 1


if __name__ == "__main__":
    raise SystemExit(main())
