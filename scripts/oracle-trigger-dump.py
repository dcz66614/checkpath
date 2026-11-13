#!/usr/bin/env python3
"""CheckPath trigger Oracle dump driver (T006).

Reads tests/fixtures/trigger/suite.json and writes one normalized
trigger IR per case (``<id>.json``) by calling the Reference Oracle's
``build_trigger_ir`` — the same function the T002 parser suite and the
T004 e2e Oracle use. This driver contains NO evaluation algorithm of
its own: it only adapts each case's checkpath.scenario/v1 scenario to
the trigger shape (event fields + changed_files + diff metadata),
mirroring evaluator._trigger_scenario field-for-field, and dumps the
Oracle's output. The TypeScript side is produced by
tests/unit/event/trigger-oracle-dump.test.ts; scripts/oracle-diff-trigger.mjs
diffs the two directories field-by-field.

Usage:
    python3 scripts/oracle-trigger-dump.py --suite tests/fixtures/trigger/suite.json --out /tmp/trigger-py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from oracle.checkpath_oracle.parser import build_trigger_ir  # noqa: E402


def _trigger_scenario(scenario):
    """Adapt a checkpath.scenario/v1 scenario to the T002 trigger shape."""
    event = scenario.get("event") or {}
    diff = scenario.get("diff") or {}
    return {
        "event": {
            "name": event.get("name"),
            "action": event.get("action"),
            "branch": event.get("branch"),
            "base_branch": event.get("base_branch"),
            "head_branch": event.get("head_branch"),
            "target_branch": event.get("target_branch"),
            "commit_message": event.get("commit_message"),
        },
        "changed_files": list(diff.get("changed_files") or []),
        "diff": {
            "changed_files_total": diff.get("changed_files_total"),
            "returned_files": diff.get("returned_files"),
            "first_3000_confirmed": diff.get("first_3000_confirmed"),
            "diff_timed_out": diff.get("diff_timed_out"),
            "push_commit_count": diff.get("push_commit_count"),
        },
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)

    suite_path = Path(args.suite)
    suite = json.loads(suite_path.read_text(encoding="utf-8"))
    if suite.get("schema") != "checkpath.trigger-suite/v1":
        print(f"oracle trigger dump: unexpected suite schema: {suite.get('schema')!r}",
              file=sys.stderr)
        return 2
    base_dir = suite_path.parent
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    for entry in suite.get("fixtures", []):
        fixture_id = entry["id"]
        fixture_dir = base_dir / entry["dir"]
        yaml_text = (fixture_dir / entry["workflow"]).read_text(encoding="utf-8")
        scenario = json.loads((fixture_dir / entry["scenario"]).read_text(encoding="utf-8"))
        ir = build_trigger_ir(yaml_text, _trigger_scenario(scenario), fixture_id)
        with open(out_dir / f"{fixture_id}.json", "w", encoding="utf-8") as fh:
            json.dump(ir, fh, indent=2, sort_keys=True, ensure_ascii=False)
            fh.write("\n")
        total += 1
        print(f"{fixture_id}: dumped")
    print(f"{total}/{total} trigger IRs dumped to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
