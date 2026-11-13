#!/usr/bin/env python3
"""CheckPath Oracle parse probe driver (FIX-P2, T013 P2-4).

Reads one workflow YAML file and prints the Reference Oracle's
``parse_workflow_yaml`` result as JSON. This driver contains NO
evaluation algorithm of its own: it only adapts the call so the
duplicate-key divergence test
(tests/unit/diff-boundaries/duplicate-key-yaml.test.ts) can run the
Oracle on a fixture that deliberately lives outside every frozen suite.

Usage:
    python3 scripts/oracle-parse-probe.py --yaml <workflow.yml> --fixture-id <id>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from oracle.checkpath_oracle.parser import parse_workflow_yaml  # noqa: E402


def main(argv: list | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Parse one workflow YAML file with the Reference Oracle.",
    )
    parser.add_argument("--yaml", required=True, help="Path to the workflow YAML file.")
    parser.add_argument("--fixture-id", required=True, help="Fixture id for the IR.")
    args = parser.parse_args(argv)
    yaml_text = Path(args.yaml).read_text(encoding="utf-8")
    print(json.dumps(parse_workflow_yaml(yaml_text, args.fixture_id), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
