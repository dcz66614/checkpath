#!/usr/bin/env python3
"""CheckPath witness Oracle dump driver (T009).

Reads tests/fixtures/witness/suite.json and writes one normalized
witness output per case (``<id>.json``: ``{"witnesses": [...],
"recommendations": [...]}``) by calling the Reference Oracle's
witness module — which itself only calls the Oracle's existing
``evaluate_e2e_fixture`` (no evaluation algorithm of its own).
The TypeScript side is produced by
tests/unit/witness/witness-oracle-dump.test.ts;
scripts/oracle-diff-witness.mjs diffs the two directories
field-by-field.

Usage:
    python3 scripts/oracle-witness-dump.py --suite tests/fixtures/witness/suite.json --out /tmp/witness-py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from oracle.checkpath_oracle.witness import build_witnesses  # noqa: E402


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)

    suite_path = Path(args.suite)
    suite = json.loads(suite_path.read_text(encoding="utf-8"))
    if suite.get("schema") != "checkpath.witness-suite/v1":
        print(f"oracle witness dump: unexpected suite schema: {suite.get('schema')!r}",
              file=sys.stderr)
        return 2
    base_dir = suite_path.parent
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    for entry in suite.get("fixtures", []):
        fixture_id = entry["id"]
        fixture_dir = base_dir / entry["dir"]
        workflows = [
            (path, (fixture_dir / path).read_text(encoding="utf-8"))
            for path in entry["workflows"]
        ]
        scenario = json.loads((fixture_dir / entry["scenario"]).read_text(encoding="utf-8"))
        required_checks = json.loads(
            (fixture_dir / entry["required_checks"]).read_text(encoding="utf-8")
        )
        output = build_witnesses(fixture_id, workflows, scenario, required_checks)
        with open(out_dir / f"{fixture_id}.json", "w", encoding="utf-8") as fh:
            json.dump(output, fh, indent=2, sort_keys=True, ensure_ascii=False)
            fh.write("\n")
        total += 1
        print(f"{fixture_id}: dumped ({len(output['witnesses'])} witnesses, "
              f"{len(output['recommendations'])} recommendations)")
    print(f"{total}/{total} witness dumps written to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
