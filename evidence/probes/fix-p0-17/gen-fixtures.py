"""Generate tests/fixtures/parser-divergence/absorbed-anchor-colon-p0-17/
(fixture .yml files + expected.json) from the FIX-P0-17 probe grid.

Selects 37 representative shapes (P0-A 10, P0-B 9, boundary 8,
D/E/F/G 10) and records both sides' {status, errors, events} as the
parity lock. Run from the repo root after `npm ci`:

    python3 evidence/probes/fix-p0-17/gen-fixtures.py

The generated expected.json is the lock: the test asserts both sides
match the recording AND each other. Regenerate only when the fix
intentionally changes a verdict; a regeneration that flips a verdict
must be explained in the FIX-P0-17 report.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
FIXTURE_DIR = (
    REPO
    / "tests"
    / "fixtures"
    / "parser-divergence"
    / "absorbed-anchor-colon-p0-17"
)

SELECTED = [
    # P0-A: mirror alias-key exemption (7 shapes + 3 controls).
    "a-alias-key", "a-alias-key-push", "a-alias-key-lone",
    "a-alias-key-int", "a-alias-key-custom", "a-alias-seq-key",
    "a-alias-undef-key",
    "a-ctrl-scalar-key", "a-ctrl-qmark", "a-ctrl-spaced",
    # P0-B: anchor absorbs ':' (9 shapes).
    "b-absorb-2", "b-absorb-2-push", "b-absorb-foo",
    "b-absorb-hyphen", "b-absorb-num", "b-absorb-2x",
    "b-absorb-value-pos", "b-absorb-flow", "b-absorb-lone",
    # C boundary: multi-colon, tag-after, tag-root-block, nobrace,
    # '?', comma, '?' explicit key.
    "c-multi-colon", "c-double-colon", "c-tag-after",
    "c-tag-root-block", "c-tag-nobrace", "c-qmark-colon",
    "c-comma-colon", "c-qmark",
    # D: alias-key boundary.
    "d-alias-key-bool-tag",
    # E: flow null-key boundary.
    "e-flow-null-key", "e-flow-colon-scalar", "e-flow-colon-tag",
    "e-flow-colon-alias", "e-flow-null-spaced",
    # F: alias-colon (existing rule, control).
    "f-alias-colon-key",
    # G: lone-doc absorbed.
    "g-lone-colon-scalar", "g-lone-colon-map", "g-lone-absorb-map",
]


def run_json(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"command failed: {' '.join(cmd)}\n{r.stderr[:500]}")
    return json.loads(r.stdout)


def main() -> int:
    cases = json.loads((HERE / "cases.json").read_text(encoding="utf-8"))
    by_id = {row["id"]: row for row in cases}
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    esbuild = REPO / "node_modules" / ".bin" / "esbuild"
    entry = REPO / "evidence" / "probes" / "fix-p0-14" / "ts-probe-entry.ts"
    expected_cases = []
    with tempfile.TemporaryDirectory(prefix="p17-gen-fixtures-") as tmp:
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
        for short_id in SELECTED:
            full_id = "p17-" + short_id
            row = by_id[full_id]
            fname = short_id + ".yml"
            (FIXTURE_DIR / fname).write_text(row["yaml"], encoding="utf-8")
            tmp_yaml = tmp / "case.yml"
            tmp_yaml.write_text(row["yaml"], encoding="utf-8")
            ts = run_json(["node", str(bundle), "trigger", str(tmp_yaml), full_id])
            oracle = run_json(
                ["python3", str(REPO / "scripts" / "oracle-parse-probe.py"),
                 "--yaml", str(tmp_yaml), "--fixture-id", full_id])
            if ts != oracle:
                print(f"WARNING {full_id}: TS != Oracle "
                      f"({ts.get('status')}/{ts.get('errors')} vs "
                      f"{oracle.get('status')}/{oracle.get('errors')})",
                      file=sys.stderr)
            expected_cases.append({
                "id": short_id,
                "file": fname,
                "typescript": {
                    "status": ts["status"],
                    "errors": ts["errors"],
                    "events": ts["events"],
                },
                "oracle": {
                    "status": oracle["status"],
                    "errors": oracle["errors"],
                    "events": oracle["events"],
                },
            })
    payload = {"schema": "checkpath.parser-divergence/v1",
               "cases": expected_cases}
    (FIXTURE_DIR / "expected.json").write_text(
        json.dumps(payload, indent=1, ensure_ascii=False) + "\n",
        encoding="utf-8")
    print(f"wrote {len(expected_cases)} fixtures + expected.json to {FIXTURE_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
