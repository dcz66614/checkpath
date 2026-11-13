#!/usr/bin/env python3
"""CheckPath Oracle jobs probe driver (FIX-P0-03).

Reads one workflow YAML file and prints the Reference Oracle's
``extract_jobs`` result as JSON. This driver contains NO evaluation
algorithm of its own: it only adapts the call so the scalar-rendering
jobs parity test
(tests/unit/job-dag/scalar-rendering-jobs.test.ts) can run the Oracle
on a fixture that deliberately lives outside every frozen suite (a
T7-suite entry would have renumbered the golden suite).

Usage:
    python3 scripts/oracle-jobs-probe.py --yaml <workflow.yml>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from oracle.checkpath_oracle.parser import extract_jobs  # noqa: E402


def main(argv: list | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract jobs from one workflow YAML file with the Reference Oracle.",
    )
    parser.add_argument("--yaml", required=True, help="Path to the workflow YAML file.")
    args = parser.parse_args(argv)
    yaml_text = Path(args.yaml).read_text(encoding="utf-8")
    print(json.dumps(extract_jobs(yaml_text), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
