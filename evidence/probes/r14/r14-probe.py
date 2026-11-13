"""T013 R14 independent probe driver.

Re-runs cases.json in this directory (written by gen-cases.py from
the R13 review report text and the FIX-P0-14 report's threshold
description, NOT copied from the fixer's cases.json): the lone-doc
P0 core, controls, five-condition discriminant necessity shapes,
the 11 disclosed residual rows (expected trigger DIFF, jobs MATCH),
and the 5 R6 shapes.

Method: builds the TypeScript probe bundle from the repo source with
esbuild (into a temp dir, never into the worktree), then for each row
runs the TS bundle and the Oracle probe drivers
(`scripts/oracle-parse-probe.py` / `scripts/oracle-jobs-probe.py`) on
the same YAML and deep-compares the full JSON (whole TriggerIR in
trigger mode, whole job list in jobs mode). Writes `results.json`
(deterministic: no timestamps). Exits 0 only when every unflagged
check MATCHes and every flagged (expected_diff) check DIFFs in
trigger mode and MATCHes in jobs mode; a flagged row that MATCHes
is reported as FLAG STALE.

NOTE (T014, 2026-11-10): the 11 disclosed residual rows were closed
by later fixes (verified 78/78 MATCH at the R19 re-run); their
expected_diff flags were cleared in gen-cases.py, so this probe now
expects MATCH on every check and exits 0 on 78/78.

Usage (from the repo root, after `npm ci`):
    python3 evidence/probes/r14/r14-probe.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent


def run_json(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        return {"_error": (r.stderr.strip() or r.stdout.strip())[:400]}
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return {"_error": "non-json stdout: " + r.stdout[:400]}


def diff_fields(a, b, prefix=""):
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a:
                out.append(f"{prefix}{k}: <absent> vs {json.dumps(b[k])[:120]}")
            elif k not in b:
                out.append(f"{prefix}{k}: {json.dumps(a[k])[:120]} vs <absent>")
            elif a[k] != b[k]:
                if isinstance(a[k], dict) and isinstance(b[k], dict):
                    out.extend(diff_fields(a[k], b[k], prefix + k + "."))
                else:
                    out.append(
                        f"{prefix}{k}: {json.dumps(a[k])[:160]} vs {json.dumps(b[k])[:160]}"
                    )
    elif a != b:
        out.append(f"{prefix}<value>: {json.dumps(a)[:160]} vs {json.dumps(b)[:160]}")
    return out


def main() -> int:
    cases = json.loads((HERE / "cases.json").read_text(encoding="utf-8"))
    esbuild = REPO / "node_modules" / ".bin" / "esbuild"
    if not esbuild.exists():
        print("esbuild not found — run `npm ci` first.", file=sys.stderr)
        return 2
    entry = REPO / "evidence" / "probes" / "fix-p0-14" / "ts-probe-entry.ts"
    with tempfile.TemporaryDirectory(prefix="r14-probe-") as tmp:
        tmp = Path(tmp)
        bundle = tmp / "ts-probe.cjs"
        r = subprocess.run(
            [str(esbuild), str(entry), "--bundle", "--platform=node",
             "--format=cjs", f"--outfile={bundle}", "--log-level=error"],
            capture_output=True, text=True,
        )
        if r.returncode != 0:
            print("esbuild failed:\n" + r.stderr, file=sys.stderr)
            return 2
        results = []
        n_match = n_total = 0
        problems = []
        for row in cases:
            tmp_yaml = tmp / "case.yml"
            tmp_yaml.write_text(row["yaml"], encoding="utf-8")
            modes = ["trigger", "jobs"] if row["mode"] == "both" else [row["mode"]]
            for mode in modes:
                n_total += 1
                ts = run_json(["node", str(bundle), mode, str(tmp_yaml), "probe"])
                if mode == "trigger":
                    oracle = run_json(
                        ["python3", str(REPO / "scripts" / "oracle-parse-probe.py"),
                         "--yaml", str(tmp_yaml), "--fixture-id", "probe"])
                else:
                    oracle = run_json(
                        ["python3", str(REPO / "scripts" / "oracle-jobs-probe.py"),
                         "--yaml", str(tmp_yaml)])
                match = ts == oracle
                n_match += match
                expected_diff = row.get("expected_diff", False)
                # Residual rows: trigger DIFF expected, jobs MATCH expected.
                if expected_diff and mode == "trigger" and match:
                    problems.append(f"FLAG STALE {row['id']} [{mode}]: expected DIFF, got MATCH")
                if expected_diff and mode == "jobs" and not match:
                    problems.append(f"UNEXPECTED DIFF {row['id']} [{mode}]: residual jobs mode must MATCH")
                if not expected_diff and not match:
                    problems.append(f"UNEXPECTED DIFF {row['id']} [{mode}]: "
                        f"TS {ts.get('status') if isinstance(ts, dict) else '?'}"
                        f"/{ts.get('errors') if isinstance(ts, dict) else '?'} vs "
                        f"Oracle {oracle.get('status') if isinstance(oracle, dict) else '?'}"
                        f"/{oracle.get('errors') if isinstance(oracle, dict) else '?'}")
                results.append({
                    "id": row["id"],
                    "mode": mode,
                    "match": match,
                    "expected_diff": expected_diff,
                    "diff": [] if match else diff_fields(ts, oracle),
                    "ts_status": ts.get("status") if isinstance(ts, dict) else None,
                    "oracle_status": oracle.get("status") if isinstance(oracle, dict) else None,
                    "ts_errors": ts.get("errors") if isinstance(ts, dict) else None,
                    "oracle_errors": oracle.get("errors") if isinstance(oracle, dict) else None,
                })
    payload = {"checks": n_total, "match": n_match, "diff": n_total - n_match,
               "rows": results}
    (HERE / "results.json").write_text(
        json.dumps(payload, indent=1, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8")
    print(f"R14 probe: {n_match}/{n_total} MATCH, {n_total - n_match} DIFF")
    for p in problems:
        print("  " + p)
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())
