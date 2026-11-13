#!/usr/bin/env python3
"""T011 property-test helper — dump Oracle e2e reports for a suite.

Reads an e2e suite (checkpath.s0-e2e-suite/v1) and writes one Oracle
report per fixture as <out>/<id>.json AND as the fixture's own
expected.json (<fixture-dir>/expected.json), so the TypeScript side
(tests/unit/golden/golden.test.ts, via CHECKPATH_E2E_SUITE) can be
locked against the Oracle output and scripts/make-fixtures.mjs can
diff the two sides field-by-field.

This is the same method as scripts/build-golden.py (expected values
generated once from the independent implementation); the property
suite itself is regenerated deterministically from the fixed seed by
make-fixtures.mjs, so the expected files are reproducible, not
hand-frozen.

Usage: python3 scripts/property-oracle-dump.py --suite <suite.json> --out <dir>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from oracle.checkpath_oracle.evaluator import evaluate_e2e_fixture  # noqa: E402


def main(argv) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--suite", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    suite_path = Path(args.suite)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    suite = json.loads(suite_path.read_text(encoding="utf-8"))
    base = suite_path.parent
    for entry in suite["fixtures"]:
        fixture_dir = base / entry["dir"]
        workflows = [
            (name, (fixture_dir / name).read_text(encoding="utf-8"))
            for name in entry["workflows"]
        ]
        scenario = json.loads((fixture_dir / entry["scenario"]).read_text(encoding="utf-8"))
        required_checks = json.loads(
            (fixture_dir / entry["required_checks"]).read_text(encoding="utf-8")
        )
        report = evaluate_e2e_fixture(entry["id"], workflows, scenario, required_checks)
        text = json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
        (out_dir / f"{entry['id']}.json").write_text(text, encoding="utf-8")
        (fixture_dir / entry["expected"]).write_text(text, encoding="utf-8")
    print(f"{len(suite['fixtures'])}/{len(suite['fixtures'])} oracle reports dumped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
