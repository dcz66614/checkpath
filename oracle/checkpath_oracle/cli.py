"""CheckPath Reference Oracle CLI — T002 + T003 suite runner.

Dispatches on the suite file's ``schema`` so both S0 PoC suites share one
entry point (the T001 placeholder is replaced, not faked: any mismatch exits
non-zero):

* ``checkpath.s0-parser-suite/v1`` (T002): builds the normalized trigger IR
  from each fixture's raw workflow YAML + scenario, compares it
  field-by-field with the fixture's fixed ``expected.json``, prints one
  PASS/FAIL line per fixture, exits 0 only when every fixture matches.
* ``checkpath.job-check-suite/v1`` (T003): runs the job/check evaluator
  over the suite's cases and prints the machine-readable result JSON to
  stdout; exits 0 only when no case failed.
* ``checkpath.s0-e2e-suite/v1`` (T004): runs the end-to-end evaluator
  (raw workflow YAML + scenario + required checks -> normalized e2e
  report) over the suite's 24 fixtures, compares each report
  field-by-field with the fixture's fixed ``expected.json``, prints one
  PASS/FAIL line per fixture, exits 0 only when every fixture matches.

The full Oracle CLI (all suites, diff/gate modes) is T004's work.
This CLI never imports or calls any TypeScript code.

Usage:
    python3 -m oracle.checkpath_oracle.cli \
        --suite tests/fixtures/s0/parser-trigger/suite.json
    python3 -m oracle.checkpath_oracle.cli \
        --suite tests/fixtures/s0/job-check/suite.json
    python3 -m oracle.checkpath_oracle.cli \
        --suite tests/fixtures/s0/all.json --report-out /tmp/e2e-py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .evaluator import evaluate_e2e_fixture, evaluate_suite
from .parser import build_trigger_ir

PARSER_SUITE_SCHEMA = "checkpath.s0-parser-suite/v1"
JOB_CHECK_SUITE_SCHEMA = "checkpath.job-check-suite/v1"
E2E_SUITE_SCHEMA = "checkpath.s0-e2e-suite/v1"


def _load_json(path: Path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def run_parser_suite(suite_path: Path, ir_out: Path | None) -> int:
    """Run one T002 parser-trigger suite. Returns 0 only when all fixtures pass."""
    suite = _load_json(suite_path)
    if suite.get("schema") != PARSER_SUITE_SCHEMA:
        print(
            f"FAIL: unexpected parser suite schema: {suite.get('schema')!r}",
            file=sys.stderr,
        )
        return 1
    base_dir = suite_path.parent
    total = 0
    passed = 0
    for entry in suite.get("fixtures", []):
        total += 1
        fixture_id = entry["id"]
        fixture_dir = base_dir / entry["dir"]
        yaml_text = (fixture_dir / entry["workflow"]).read_text(encoding="utf-8")
        scenario = _load_json(fixture_dir / entry["scenario"])
        expected = _load_json(fixture_dir / entry["expected"])
        ir = build_trigger_ir(yaml_text, scenario, fixture_id)
        if ir_out is not None:
            ir_out.mkdir(parents=True, exist_ok=True)
            with open(ir_out / f"{fixture_id}.json", "w", encoding="utf-8") as fh:
                json.dump(ir, fh, indent=2, sort_keys=True, ensure_ascii=False)
                fh.write("\n")
        if ir == expected:
            passed += 1
            print(f"{fixture_id}: PASS")
        else:
            print(f"{fixture_id}: FAIL")
            for key in sorted(set(ir) | set(expected)):
                if ir.get(key) != expected.get(key):
                    print(f"  {key}: got      {json.dumps(ir.get(key), sort_keys=True)}")
                    print(f"  {key}: expected {json.dumps(expected.get(key), sort_keys=True)}")
    print(f"{passed}/{total} fixtures PASS")
    return 0 if passed == total and total > 0 else 1


def run_job_check_suite(suite_path: Path) -> int:
    """Run one T003 job-check suite; prints the result JSON to stdout."""
    suite = _load_json(suite_path)
    result = evaluate_suite(suite)
    json.dump(result, sys.stdout, indent=2, sort_keys=False)
    sys.stdout.write("\n")
    return 0 if result["summary"]["failed"] == 0 else 1


def run_e2e_suite(suite_path: Path, report_out: Path | None) -> int:
    """Run one T004 end-to-end suite. Returns 0 only when all fixtures pass."""
    suite = _load_json(suite_path)
    if suite.get("schema") != E2E_SUITE_SCHEMA:
        print(
            f"FAIL: unexpected e2e suite schema: {suite.get('schema')!r}",
            file=sys.stderr,
        )
        return 1
    base_dir = suite_path.parent
    total = 0
    passed = 0
    for entry in suite.get("fixtures", []):
        total += 1
        fixture_id = entry["id"]
        fixture_dir = base_dir / entry["dir"]
        workflows = [
            (path, (fixture_dir / path).read_text(encoding="utf-8"))
            for path in entry["workflows"]
        ]
        scenario = _load_json(fixture_dir / entry["scenario"])
        required_checks = _load_json(fixture_dir / entry["required_checks"])
        expected = _load_json(fixture_dir / entry["expected"])
        report = evaluate_e2e_fixture(
            fixture_id, workflows, scenario, required_checks
        )
        if report_out is not None:
            report_out.mkdir(parents=True, exist_ok=True)
            with open(report_out / f"{fixture_id}.json", "w", encoding="utf-8") as fh:
                json.dump(report, fh, indent=2, sort_keys=True, ensure_ascii=False)
                fh.write("\n")
        if report == expected:
            passed += 1
            print(f"{fixture_id}: PASS")
        else:
            print(f"{fixture_id}: FAIL")
            _print_report_diff(report, expected)
    print(f"{passed}/{total} fixtures PASS")
    return 0 if passed == total and total > 0 else 1


def _print_report_diff(report, expected, prefix="") -> None:
    """Print the differing field paths between two reports (no ignore list)."""
    if type(report) is not type(expected):
        print(f"  {prefix or '<root>'}: got      {json.dumps(report, sort_keys=True)}")
        print(f"  {prefix or '<root>'}: expected {json.dumps(expected, sort_keys=True)}")
        return
    if isinstance(report, dict):
        for key in sorted(set(report) | set(expected)):
            if report.get(key) != expected.get(key):
                _print_report_diff(
                    report.get(key), expected.get(key),
                    f"{prefix}.{key}" if prefix else key,
                )
        return
    if isinstance(report, list):
        if len(report) != len(expected):
            print(f"  {prefix}: length got {len(report)}, expected {len(expected)}")
        for index, (got_item, exp_item) in enumerate(zip(report, expected)):
            if got_item != exp_item:
                _print_report_diff(got_item, exp_item, f"{prefix}[{index}]")
        return
    print(f"  {prefix}: got      {json.dumps(report, sort_keys=True)}")
    print(f"  {prefix}: expected {json.dumps(expected, sort_keys=True)}")


def main(argv: list | None = None) -> int:
    """Entry point."""
    parser = argparse.ArgumentParser(
        prog="oracle.checkpath_oracle.cli",
        description="CheckPath Reference Oracle CLI (T002 parser / T003 job-check suites).",
    )
    parser.add_argument("--suite", required=True, help="Path to suite.json.")
    parser.add_argument(
        "--ir-out",
        default=None,
        help="Optional directory to write the normalized trigger IR per fixture "
        "(parser suite only; used for TS/Python parity diffing).",
    )
    parser.add_argument(
        "--report-out",
        default=None,
        help="Optional directory to write the normalized e2e report per fixture "
        "(e2e suite only; used for TS/Python parity diffing).",
    )
    args = parser.parse_args(argv)

    suite_path = Path(args.suite)
    if not suite_path.is_file():
        print(f"oracle cli: suite file not found: {args.suite}", file=sys.stderr)
        return 2
    try:
        schema = _load_json(suite_path).get("schema")
    except json.JSONDecodeError as exc:
        print(f"oracle cli: invalid JSON in {args.suite}: {exc}", file=sys.stderr)
        return 2

    if schema == PARSER_SUITE_SCHEMA:
        return run_parser_suite(suite_path, Path(args.ir_out) if args.ir_out else None)
    if schema == JOB_CHECK_SUITE_SCHEMA:
        return run_job_check_suite(suite_path)
    if schema == E2E_SUITE_SCHEMA:
        return run_e2e_suite(
            suite_path, Path(args.report_out) if args.report_out else None
        )
    print(f"oracle cli: unsupported suite schema: {schema!r}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
