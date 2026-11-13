"""FIX-P0-12 probe matrix runner (T013 R11 grouped P0s: P0-A anchor/tag
nospace, P0-B FIX-P0-09 S1 over-rejection of null-value multi-line
keys).

Re-runs the 243-row matrix from `cases.json` in this directory
(486 checks: every row in trigger + jobs mode): the R11 core shapes
(`&x#c` / `!!str#c` in flow map, flow sequence, block value, `on:`
slot; the 8 null-value multi-line-key shapes), the anchor/tag
threshold mapping (name-extending characters `.` `/` `;` `+` `<`
`!` `*` `|` `>` quotes `[` `{` `&` `%` `@` backtick after an anchor
name; empty anchor names; tag followed by `,` `}` `]` `[` `{` `|`
`>` quotes `&` `*` `!`; verbatim-tag `#` inside and after `>`;
handle-form tags; `%XX` escapes; tag `:`/`?` consumed by the
suffix scan), the `:`/`?`-after-anchor position mapping (implicit
key in flow after `{`/`,`/`[` and in block at line start or after
`-`; value position after `:`/`?`/another property; `?` always
rejects), the double-property chains (tag-then-anchor-colon is the
only divergent chain), the unknown-tag controls (all accepted by
both sides — no unknown-tag rule), the S1 narrowing controls
(null-value multi-line keys with no colon now accepted; valued
multi-line keys — including null-valued keys *with* a colon —
still rejected; comment-skipping in the colon scan; CRLF), and
the plain/quoted/block-scalar controls (`#` inside scalars and
after a space never triggers).

2 rows are flagged `known_divergence` (see README §7 and the
TASK_REPORT §7): A45 (anchored empty key at the document root —
TS INVALID vs Oracle VALID; needs an Oracle-side rejection) and
A70 (`!foo[bar]` — TS INVALID vs Oracle VALID; needs an Oracle-side
rejection of `[`/`]` in tag suffixes). 10 further rows document the
tag-suffix swallowing a structural `,` / `]` (A60, X04, X08, X09,
X11, Y03, Y05, Y08, Y09, Y10 — parser-level, not scanner-level;
see README §7 for the per-row fix direction). Those 12 rows are
allowed to differ; every other row must match after the fix.

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
    python3 evidence/probes/fix-p0-12/run-matrix.py
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
    with tempfile.TemporaryDirectory(prefix="fix-p0-12-probe-") as tmp:
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
