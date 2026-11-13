#!/usr/bin/env python3
"""T011 — Oracle cross-check for the mutation fixtures.

For every case in tests/fixtures/mutations/M-*, evaluates the base
and the mutated input with the Python Reference Oracle and compares
the triggered flag + per-context check statuses against the frozen
expected.json (the same values the TypeScript mutation test asserts).
Exit 0 only when all 12 cases agree on both sides.

Usage: python3 scripts/verify-mutations.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from oracle.checkpath_oracle.evaluator import evaluate_e2e_fixture  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
MUT = REPO / "tests" / "fixtures" / "mutations"


def load_side(case_dir: Path, side: str):
    side_dir = case_dir / side
    workflows = [
        (name, (side_dir / name).read_text(encoding="utf-8"))
        for name in sorted(p.name for p in side_dir.glob("*.yml"))
    ]
    scenario = json.loads((side_dir / "scenario.json").read_text(encoding="utf-8"))
    required_checks = json.loads(
        (case_dir / "required-checks.json").read_text(encoding="utf-8")
    )
    return evaluate_e2e_fixture(f"{case_dir.name}-{side}", workflows, scenario, required_checks)


def main() -> int:
    failures = 0
    cases = sorted(p for p in MUT.iterdir() if p.name.startswith("M-"))
    for case_dir in cases:
        expected = json.loads((case_dir / "expected.json").read_text(encoding="utf-8"))
        for side in ("base", "mutated"):
            report = load_side(case_dir, side)
            triggered = any(
                w["trigger"]["evaluation"]["triggered"] is True
                for w in report["workflows"]
            )
            checks = {c["context"]: c["status"] for c in report["required_checks"]}
            exp = expected[side]
            ok = triggered == exp["triggered"] and checks == exp["checks"]
            print(
                f"{case_dir.name} {side}: "
                f"triggered={triggered} checks={checks} -> {'PASS' if ok else 'FAIL'}"
            )
            if not ok:
                failures += 1
                print(f"  expected: triggered={exp['triggered']} checks={exp['checks']}")
    print(f"{len(cases) * 2 - failures}/{len(cases) * 2} mutation sides agree with expected.json")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
