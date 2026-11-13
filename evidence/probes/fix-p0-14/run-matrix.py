"""FIX-P0-14 probe matrix runner (T013 R13 lone-doc P0:
lone documents consisting only of an anchored empty key).

Re-runs the 57-row matrix from `cases.json` in this directory
(114 checks: every row in trigger + jobs mode): the R13 P0 core
shapes (`&x: 1` / `&x:` alone), the threshold mapping for the
classification rule (scalar / quoted / bool / float / flow-seq /
block-seq / tagged values; doc markers; trailing comments; tag on
the value; tag on the key; glued vs unglued anchor-colon; second
anchor on the value; mapping values with and without `on`;
nested anchored-empty-key values), and the controls that must stay
MATCH (quoted empty keys `"": 1` / `'': 1`, explicit / bare-colon
keys, the C3 domain, lone scalars / sequences / anchored scalars,
flow and nested single-pair exemptions, quoted empty key + full
workflow).

11 rows are flagged `known_divergence` (see README §7 and the
TASK_REPORT §7): lone-doc anchored-empty-key shapes the
classification alignment deliberately does NOT close — mapping
values containing `on` (TS VALID), a second anchor on the value
node, a tag on the key, an unglued anchor-colon, and a nested
block-map value with an anchored key (all TS `yaml_parse_error`
vs Oracle `missing_on_key`). Those 11 trigger checks are allowed
to differ; every other row must match after the fix.

Method: builds the TypeScript probe bundle from the repo source with
esbuild (into a temp dir, never into the worktree), then for each row
runs the TS bundle and the Oracle probe drivers
(`scripts/oracle-parse-probe.py` / `scripts/oracle-jobs-probe.py`) on
the same YAML and compares the full JSON deep-equal (whole TriggerIR
in trigger mode, whole job list in jobs mode — the R5 standard,
stricter than the R4 field subset). Writes `results.json` in this
directory (deterministic: no timestamps; a re-run on the same tree
reproduces it byte-for-byte) and exits non-zero unless every check
matches except the flagged known-divergence rows.

Usage (from the repo root, after `npm ci`):
    python3 evidence/probes/fix-p0-14/run-matrix.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent


def run(cmd, strict_stderr=True):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        return {"_error": r.stderr.strip()[:300]}
    if strict_stderr and r.stderr:
        return {"_error": "stderr: " + r.stderr.strip()[:300]}
    return json.loads(r.stdout)


def main() -> int:
    cases = json.loads((HERE / "cases.json").read_text(encoding="utf-8"))
    esbuild = REPO / "node_modules" / ".bin" / "esbuild"
    if not esbuild.exists():
        print("esbuild not found — run `npm ci` first.", file=sys.stderr)
        return 2
    with tempfile.TemporaryDirectory(prefix="fix-p0-14-probe-") as tmp:
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
            tmp_yaml = Path(tmp) / "case.yml"
            tmp_yaml.write_text(row["yaml"], encoding="utf-8")
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
                # collection key (flow-key rows); noise, not a failure.
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
