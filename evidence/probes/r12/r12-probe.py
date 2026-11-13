"""T013 R12 independent probe driver.

Re-runs, from cases.json in this directory (written by the R12 reviewer
from the R11 review report §2.1/§3.1 text and the FIX-P0-12 report §7
text, NOT copied from the fixer's cases.json):

- the 4 R11 P0-A shapes (anchor/tag nospace) + 17 boundary variants;
- the 8 R11 P0-B shapes (null-value multi-line keys) + 9 S1-target /
  discriminant-edge shapes (valued multi-line keys must still reject);
- the 12 residual rows disclosed in FIX-P0-12 §7 (A45, A70,
  comma-suffix family, ]-suffix family, X11 block variant) + 4 controls;
- the 5 R10 R6 shapes (regression).

Method: builds the TypeScript probe bundle from the repo source with
esbuild (into a temp dir, never into the worktree), then for each row
runs the TS bundle and the Oracle probe drivers
(`scripts/oracle-parse-probe.py` / `scripts/oracle-jobs-probe.py`) on
the same YAML and deep-compares the full JSON (whole TriggerIR in
trigger mode, whole job list in jobs mode). Writes `results.json`
(deterministic: no timestamps) and exits 0 only when every check
matches.

Usage (from the repo root, after `npm ci`):
    python3 evidence/probes/r12/r12-probe.py
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
    """Shallow field-level diff for reporting (top-level keys + nested dicts one level)."""
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
    entry = REPO / "evidence" / "probes" / "fix-p0-12" / "ts-probe-entry.ts"
    with tempfile.TemporaryDirectory(prefix="r12-probe-") as tmp:
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
                results.append({
                    "id": row["id"],
                    "mode": mode,
                    "match": match,
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
    print(f"R12 probe: {n_match}/{n_total} MATCH, {n_total - n_match} DIFF")
    for row in results:
        if not row["match"]:
            print(f"  DIFF {row['id']} [{row['mode']}]: "
                  f"TS {row['ts_status']}/{row['ts_errors']} vs "
                  f"Oracle {row['oracle_status']}/{row['oracle_errors']}")
    return 0 if n_total == n_match else 1


if __name__ == "__main__":
    raise SystemExit(main())
