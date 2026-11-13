#!/usr/bin/env python3
"""CheckPath jobs Oracle dump driver (T007).

Reads tests/fixtures/jobs/suite.json and writes one normalized jobs
list per case (``<id>.json``) by calling the Reference Oracle's own
entry points — the same functions the T004 e2e Oracle and the S0
job-check Oracle use. This driver contains NO evaluation algorithm of
its own:
  * YAML cases (36): ``evaluate_e2e_fixture`` per case, ``.jobs`` taken
    verbatim (each row: workflow, job_id, context, status, reason).
  * S0 job-check cases (12): ``evaluate_case`` per case, ``.job_details``
    taken verbatim (each row: job_id, context, status, reason).
The TypeScript side is produced by
tests/unit/job-dag/jobs-oracle-dump.test.ts; scripts/oracle-diff-jobs.mjs
diffs the two directories field-by-field.

Usage:
    python3 scripts/oracle-jobs-dump.py --suite tests/fixtures/jobs/suite.json --out /tmp/jobs-py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from oracle.checkpath_oracle.evaluator import (  # noqa: E402
    evaluate_case,
    evaluate_e2e_fixture,
)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)

    suite_path = Path(args.suite)
    suite = json.loads(suite_path.read_text(encoding="utf-8"))
    if suite.get("schema") != "checkpath.jobs-suite/v1":
        print(f"oracle jobs dump: unexpected suite schema: {suite.get('schema')!r}",
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
        report = evaluate_e2e_fixture(fixture_id, workflows, scenario, required_checks)
        with open(out_dir / f"{fixture_id}.json", "w", encoding="utf-8") as fh:
            json.dump(report["jobs"], fh, indent=2, sort_keys=True, ensure_ascii=False)
            fh.write("\n")
        total += 1
        print(f"{fixture_id}: dumped ({len(report['jobs'])} jobs)")
    job_check_path = base_dir / suite["job_check_suite"]
    job_check_suite = json.loads(job_check_path.read_text(encoding="utf-8"))
    for case in job_check_suite.get("cases", []):
        result = evaluate_case(case)
        with open(out_dir / f"{case['id']}.json", "w", encoding="utf-8") as fh:
            json.dump(result["job_details"], fh, indent=2, sort_keys=True, ensure_ascii=False)
            fh.write("\n")
        total += 1
        print(f"{case['id']}: dumped ({len(result['job_details'])} jobs)")
    print(f"{total}/{total} jobs dumps written to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
