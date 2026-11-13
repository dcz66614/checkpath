#!/usr/bin/env python3
"""T011 — Build the golden e2e suite (tests/fixtures/golden/).

Assembles 80 fixed golden cases from the already-frozen layer suites
(S0 24, T6 trigger 16, T7 jobs 12, T8 checks 10, T9 witness 10) plus
8 hand-written unsupported cases (U-01..U-08, inputs defined inline
below), and freezes one expected.json per case.

Method (same precedent as T009: expected values generated once from
the independent implementation run, then reviewed before freezing):
  * inputs are COPIES of frozen layer fixtures (case ids and semantics
    preserved; scenario_id rewritten to the golden id);
  * expected.json is produced by the Python Reference Oracle's own
    evaluate_e2e_fixture (no TypeScript code involved);
  * the TypeScript side is then locked against the same expected files
    by tests/unit/golden/golden.test.ts, and TS-vs-Oracle parity by
    `npm run test:oracle` (scripts/oracle-diff.mjs --suite
    tests/fixtures/golden/suite.json). Any later drift fails loudly.
  * required-checks manifests are copied from the source fixture,
    except when the source has none (T6) or an empty one (T7): then
    they are DERIVED from the workflow's job contexts (name ?? id,
    file order, de-duplicated), so every golden case pins at least
    one check verdict.
  * unsupported cases are ASSERTED to surface UNKNOWN (trigger, job
    or check) as designed; the script exits non-zero otherwise.

Deterministic: fixed seed 20261108, sorted JSON keys, LF, no time /
random / environment input. Re-running reproduces byte-identical
files (verified by `npm run test:property` regeneration checks and by
the input-hash list in evidence/tests/ORACLE_PARITY_REPORT.json).

Usage: python3 scripts/build-golden.py [--check-only]
  --check-only: regenerate into a temp dir and compare with the
    committed files instead of writing them.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from oracle.checkpath_oracle.evaluator import evaluate_e2e_fixture  # noqa: E402
from oracle.checkpath_oracle.parser import extract_jobs  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
GOLDEN_DIR = REPO / "tests" / "fixtures" / "golden"
SEED = 20261108

STANDARD_SCENARIO = {
    "schema": "checkpath.scenario/v1",
    "scenario_id": "PLACEHOLDER",
    "event": {
        "name": "pull_request",
        "action": "synchronize",
        "branch": None,
        "base_branch": "main",
        "head_branch": "feature/x",
        "target_branch": None,
        "ref": "refs/pull/42/merge",
        "commit_message": "feat: change",
    },
    "diff": {
        "algorithm": "three-dot",
        "changed_files": ["src/app.ts"],
        "changed_files_total": 1,
        "returned_files": 1,
        "complete": True,
        "first_3000_confirmed": True,
        "diff_timed_out": False,
        "push_commit_count": None,
    },
}

# ---------------------------------------------------------------------------
# Unsupported cases (hand-written inputs; expected UNKNOWN asserted below).
# ---------------------------------------------------------------------------

UNSUPPORTED = [
    (
        "U-01",
        "contains-if",
        "contains() in if is outside the frozen subset (§3.4)",
        """name: ci
on:
  pull_request: {}
jobs:
  test:
    runs-on: ubuntu-latest
    name: unit-tests
    if: contains(github.event_name, 'pull')
    steps:
      - run: echo hi
""",
        "job_unknown",
    ),
    (
        "U-02",
        "hashfiles-if",
        "hashFiles() in if is outside the frozen subset (§3.4)",
        """name: ci
on:
  pull_request: {}
jobs:
  test:
    runs-on: ubuntu-latest
    name: unit-tests
    if: hashFiles('src/**') != ''
    steps:
      - run: echo hi
""",
        "job_unknown",
    ),
    (
        "U-03",
        "pull-request-target-event",
        "pull_request_target is not a supported event (§3.3)",
        """name: ci
on:
  pull_request_target: {}
jobs:
  test:
    runs-on: ubuntu-latest
    name: unit-tests
    steps:
      - run: echo hi
""",
        "trigger_unknown",
    ),
    (
        "U-04",
        "workflow-run-event",
        "workflow_run is not a supported event (§3.3)",
        """name: ci
on:
  workflow_run: {}
jobs:
  test:
    runs-on: ubuntu-latest
    name: unit-tests
    steps:
      - run: echo hi
""",
        "trigger_unknown",
    ),
    (
        "U-05",
        "brace-glob",
        "brace expansion in a path glob is unsupported (§3.4)",
        """name: ci
on:
  pull_request:
    paths:
      - 'src/{a,b}/**'
jobs:
  test:
    runs-on: ubuntu-latest
    name: unit-tests
    steps:
      - run: echo hi
""",
        "trigger_unknown",
    ),
    (
        "U-06",
        "needs-outputs-if",
        "needs.*.outputs in if is outside the frozen subset (§3.4)",
        """name: ci
on:
  pull_request: {}
jobs:
  build:
    runs-on: ubuntu-latest
    name: build
    steps:
      - run: echo hi
  test:
    runs-on: ubuntu-latest
    name: unit-tests
    needs: build
    if: needs.build.outputs.result == 'ok'
    steps:
      - run: echo hi
""",
        "job_unknown",
    ),
    (
        "U-07",
        "matrix-job",
        "strategy.matrix expansion has no single check context (§3.4, ADR-04)",
        """name: ci
on:
  pull_request: {}
jobs:
  test:
    runs-on: ubuntu-latest
    name: unit-tests
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    steps:
      - run: echo hi
""",
        "job_unknown",
    ),
    (
        "U-08",
        "reusable-workflow-job",
        "a reusable-workflow call job has no local check context (§3.4, ADR-04)",
        """name: ci
on:
  pull_request: {}
jobs:
  call-reusable:
    name: unit-tests
    uses: ./.github/workflows/reusable.yml
""",
        "job_unknown",
    ),
]


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def dump_json(path: Path, value) -> None:
    path.write_text(
        json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def derive_required_checks(workflow_texts):
    """One required check per job context (name ?? id), file order, deduped."""
    contexts = []
    for text in workflow_texts:
        for job in extract_jobs(text):
            ctx = job.get("name") or job["id"]
            if ctx not in contexts:
                contexts.append(ctx)
    return {
        "schema": "checkpath.required-checks/v1",
        "required_checks": [
            {"context": ctx, "source": "github-actions"} for ctx in contexts
        ],
    }


def build_case(out_dir: Path, golden_id: str, workflows, scenario, required_checks):
    """Write one golden case dir; return the Oracle expected report."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for filename, text in workflows:
        (out_dir / filename).write_text(text, encoding="utf-8")
    scenario = dict(scenario)
    scenario["scenario_id"] = golden_id
    dump_json(out_dir / "scenario.json", scenario)
    dump_json(out_dir / "required-checks.json", required_checks)
    report = evaluate_e2e_fixture(
        golden_id,
        [(filename, text) for filename, text in workflows],
        scenario,
        required_checks,
    )
    dump_json(out_dir / "expected.json", report)
    return report


def suite_entries():
    """Yield (golden_id, slug, group, cp, description, adversarial,
    source_dir, workflow_files, scenario_file, required_checks_file|None)."""
    s0 = load_json(REPO / "tests/fixtures/s0/all.json")
    for i, entry in enumerate(s0["fixtures"]):
        slug = entry["dir"].split("-", 2)[2] if entry["dir"].count("-") >= 2 else entry["dir"]
        yield (
            f"G-{i + 1:02d}",
            slug,
            entry.get("group", "s0"),
            entry.get("cp"),
            entry.get("description", ""),
            bool(entry.get("adversarial", False)),
            REPO / "tests/fixtures/s0" / entry["dir"],
            list(entry["workflows"]),
            entry["scenario"],
            entry["required_checks"],
        )
    trigger = load_json(REPO / "tests/fixtures/trigger/suite.json")
    t6 = [e for e in trigger["fixtures"] if e["source"] == "t006"]
    for j, entry in enumerate(t6):
        yield (
            f"G-{25 + j:02d}",
            "t6-" + entry["dir"],
            "filter",
            None,
            f"T6 trigger case {entry['id']} as a golden e2e case.",
            False,
            REPO / "tests/fixtures/trigger" / entry["dir"],
            [entry["workflow"]],
            entry["scenario"],
            None,
        )
    # FIX-P1-01: the three duplicate-key trigger cases (source
    # "fix-p1-01") become golden cases G-81..G-83. Their trigger
    # entries carry an explicit required-checks file (the job context
    # "test"): derive_required_checks would return an empty manifest
    # here, because extract_jobs returns [] for an unparseable
    # workflow — the explicit manifest pins the no_provider check
    # verdict instead, so every golden case still pins at least one
    # check verdict.
    dup = [e for e in trigger["fixtures"] if e["source"] == "fix-p1-01"]
    for j, entry in enumerate(dup):
        yield (
            f"G-{81 + j:02d}",
            "fix-p1-01-" + entry["dir"],
            "filter",
            None,
            f"FIX-P1-01 duplicate-key case {entry['id']} as a golden e2e case.",
            True,
            REPO / "tests/fixtures/trigger" / entry["dir"],
            [entry["workflow"]],
            entry["scenario"],
            entry["required_checks"],
        )
    # FIX-P0-02: the boolean-spelling duplicate-key trigger case
    # (source "fix-p0-02") becomes golden case G-84. Same explicit
    # required-checks reasoning as FIX-P1-01 above: extract_jobs
    # returns [] for the unparseable workflow, so the explicit
    # manifest pins the no_provider check verdict.
    dup_bool = [e for e in trigger["fixtures"] if e["source"] == "fix-p0-02"]
    for j, entry in enumerate(dup_bool):
        yield (
            f"G-{84 + j:02d}",
            "fix-p0-02-" + entry["dir"],
            "filter",
            None,
            f"FIX-P0-02 duplicate-key case {entry['id']} as a golden e2e case.",
            True,
            REPO / "tests/fixtures/trigger" / entry["dir"],
            [entry["workflow"]],
            entry["scenario"],
            entry["required_checks"],
        )
    # FIX-P0-03: the scalar-rendering trigger cases (source
    # "fix-p0-03") become golden cases G-85... Their trigger entries
    # carry an explicit required-checks file, same reasoning as
    # FIX-P1-01/FIX-P0-02 above (several are unparseable workflows,
    # and the explicit manifest pins the no_provider check verdict).
    scalar = [e for e in trigger["fixtures"] if e["source"] == "fix-p0-03"]
    for j, entry in enumerate(scalar):
        yield (
            f"G-{85 + j:02d}",
            "fix-p0-03-" + entry["dir"],
            "filter",
            None,
            f"FIX-P0-03 scalar-rendering case {entry['id']} as a golden e2e case.",
            True,
            REPO / "tests/fixtures/trigger" / entry["dir"],
            [entry["workflow"]],
            entry["scenario"],
            entry["required_checks"],
        )
    # FIX-P0-04: the bare-empty-key / scalar-job trigger cases (source
    # "fix-p0-04") become golden cases G-106... Their trigger entries
    # carry an explicit required-checks file, same reasoning as
    # FIX-P1-01/FIX-P0-02 above (the bare-key workflows are
    # unparseable to the Oracle, so extract_jobs returns [] and the
    # explicit manifest pins the no_provider check verdict; the
    # scalar-job workflows pin their UNKNOWN job verdict the same
    # way).
    bare = [e for e in trigger["fixtures"] if e["source"] == "fix-p0-04"]
    for j, entry in enumerate(bare):
        yield (
            f"G-{106 + j:02d}",
            "fix-p0-04-" + entry["dir"],
            "filter",
            None,
            f"FIX-P0-04 bare-empty-key / scalar-job case {entry['id']} as a golden e2e case.",
            True,
            REPO / "tests/fixtures/trigger" / entry["dir"],
            [entry["workflow"]],
            entry["scenario"],
            entry["required_checks"],
        )
    # FIX-P0-05: the flow-alias-key trigger cases (source
    # "fix-p0-05") become golden cases G-116... Their trigger entries
    # carry an explicit required-checks file, same reasoning as
    # FIX-P1-01/FIX-P0-02/FIX-P0-04 above (the alias-key workflows
    # are unparseable to the Oracle, so extract_jobs returns [] and
    # the explicit manifest pins the no_provider check verdict).
    alias = [e for e in trigger["fixtures"] if e["source"] == "fix-p0-05"]
    for j, entry in enumerate(alias):
        yield (
            f"G-{116 + j:02d}",
            "fix-p0-05-" + entry["dir"],
            "filter",
            None,
            f"FIX-P0-05 flow-alias-key case {entry['id']} as a golden e2e case.",
            True,
            REPO / "tests/fixtures/trigger" / entry["dir"],
            [entry["workflow"]],
            entry["scenario"],
            entry["required_checks"],
        )
    # FIX-P0-06: the collection-alias-key / tab trigger cases
    # (source "fix-p0-06") become golden cases G-120... Their
    # trigger entries carry an explicit required-checks file, same
    # reasoning as FIX-P1-01/FIX-P0-02/FIX-P0-04/FIX-P0-05 above
    # (the collection-alias-key and tab workflows are unparseable to
    # the Oracle, so extract_jobs returns [] and the explicit
    # manifest pins the no_provider check verdict).
    tab = [e for e in trigger["fixtures"] if e["source"] == "fix-p0-06"]
    for j, entry in enumerate(tab):
        yield (
            f"G-{120 + j:02d}",
            "fix-p0-06-" + entry["dir"],
            "filter",
            None,
            f"FIX-P0-06 collection-alias-key / tab case {entry['id']} as a golden e2e case.",
            True,
            REPO / "tests/fixtures/trigger" / entry["dir"],
            [entry["workflow"]],
            entry["scenario"],
            entry["required_checks"],
        )
    # FIX-P0-07: the quoted-mid-plain-scalar trigger cases
    # (source "fix-p0-07") become golden cases G-126... Their
    # trigger entries carry an explicit required-checks file, same
    # reasoning as FIX-P1-01/FIX-P0-02/FIX-P0-04/FIX-P0-05/FIX-P0-06
    # above (the quoted-mid-plain-scalar workflows are unparseable to
    # the Oracle, so extract_jobs returns [] and the explicit
    # manifest pins the no_provider check verdict).
    qmp = [e for e in trigger["fixtures"] if e["source"] == "fix-p0-07"]
    for j, entry in enumerate(qmp):
        yield (
            f"G-{126 + j:02d}",
            "fix-p0-07-" + entry["dir"],
            "filter",
            None,
            f"FIX-P0-07 quoted-mid-plain-scalar case {entry['id']} as a golden e2e case.",
            True,
            REPO / "tests/fixtures/trigger" / entry["dir"],
            [entry["workflow"]],
            entry["scenario"],
            entry["required_checks"],
        )
    # FIX-P0-08: the multiline-quoted-unindented trigger cases
    # (source "fix-p0-08") become golden cases G-132... Their
    # trigger entries carry an explicit required-checks file, same
    # reasoning as FIX-P1-01/FIX-P0-02/FIX-P0-04/FIX-P0-05/FIX-P0-06/
    # FIX-P0-07 above (the unindented-continuation workflows are
    # unparseable to the Oracle, so extract_jobs returns [] and the
    # explicit manifest pins the no_provider check verdict; the
    # VALID-boundary cases pin their REPORTABLE_PENDING verdict the
    # same way).
    mqu = [e for e in trigger["fixtures"] if e["source"] == "fix-p0-08"]
    for j, entry in enumerate(mqu):
        yield (
            f"G-{132 + j:02d}",
            "fix-p0-08-" + entry["dir"],
            "filter",
            None,
            f"FIX-P0-08 multiline-quoted-unindented case {entry['id']} as a golden e2e case.",
            True,
            REPO / "tests/fixtures/trigger" / entry["dir"],
            [entry["workflow"]],
            entry["scenario"],
            entry["required_checks"],
        )
    # FIX-P0-09: the flow-quoted-key trigger cases (source
    # "fix-p0-09") become golden cases G-144... Their trigger
    # entries carry an explicit required-checks file, same reasoning
    # as FIX-P1-01/FIX-P0-02/FIX-P0-04/FIX-P0-05/FIX-P0-06/FIX-P0-07/
    # FIX-P0-08 above (the multi-line-key workflows are unparseable
    # to the Oracle, so extract_jobs returns [] and the explicit
    # manifest pins the no_provider check verdict; the VALID-boundary
    # cases pin their REPORTABLE_PENDING verdict the same way).
    fqk = [e for e in trigger["fixtures"] if e["source"] == "fix-p0-09"]
    for j, entry in enumerate(fqk):
        yield (
            f"G-{144 + j:02d}",
            "fix-p0-09-" + entry["dir"],
            "filter",
            None,
            f"FIX-P0-09 flow-quoted-key case {entry['id']} as a golden e2e case.",
            True,
            REPO / "tests/fixtures/trigger" / entry["dir"],
            [entry["workflow"]],
            entry["scenario"],
            entry["required_checks"],
        )
    # FIX-P0-10: the flow-continuation trigger cases (source
    # "fix-p0-10") become golden cases G-156... Their trigger
    # entries carry an explicit required-checks file, same reasoning
    # as FIX-P1-01/FIX-P0-02/FIX-P0-04/FIX-P0-05/FIX-P0-06/FIX-P0-07/
    # FIX-P0-08/FIX-P0-09 above (the underindented-continuation
    # workflows are unparseable to the Oracle, so extract_jobs returns
    # [] and the explicit manifest pins the no_provider check verdict;
    # the VALID-boundary cases pin their REPORTABLE_PENDING verdict the
    # same way).
    fpc = [e for e in trigger["fixtures"] if e["source"] == "fix-p0-10"]
    for j, entry in enumerate(fpc):
        yield (
            f"G-{156 + j:02d}",
            "fix-p0-10-" + entry["dir"],
            "filter",
            None,
            f"FIX-P0-10 flow-continuation case {entry['id']} as a golden e2e case.",
            True,
            REPO / "tests/fixtures/trigger" / entry["dir"],
            [entry["workflow"]],
            entry["scenario"],
            entry["required_checks"],
        )
    jobs = load_json(REPO / "tests/fixtures/jobs/suite.json")
    t7 = [e for e in jobs["fixtures"] if e["id"].startswith("T7-")]
    for j, entry in enumerate(t7):
        yield (
            f"G-{41 + j:02d}",
            "t7-" + entry["dir"],
            "job",
            None,
            f"T7 job/DAG case {entry['id']} as a golden e2e case.",
            False,
            REPO / "tests/fixtures/jobs" / entry["dir"],
            list(entry["workflows"]),
            entry["scenario"],
            entry["required_checks"],
        )
    checks = load_json(REPO / "tests/fixtures/checks/suite.json")
    t8 = [e for e in checks["fixtures"] if e["id"].startswith("T8-")]
    for j, entry in enumerate(t8):
        yield (
            f"G-{53 + j:02d}",
            "t8-" + entry["dir"],
            "job",
            None,
            f"T8 check-resolver case {entry['id']} as a golden e2e case.",
            False,
            REPO / "tests/fixtures/checks" / entry["dir"],
            list(entry["workflows"]),
            entry["scenario"],
            entry["required_checks"],
        )
    witness = load_json(REPO / "tests/fixtures/witness/suite.json")
    wanted = ["T9-01", "T9-03", "T9-05", "T9-07", "T9-09",
              "T9-11", "T9-13", "T9-16", "T9-18", "T9-19"]
    t9 = [e for e in witness["fixtures"] if e["id"] in wanted]
    assert [e["id"] for e in t9] == wanted, "witness selection drifted"
    for j, entry in enumerate(t9):
        yield (
            f"G-{63 + j:02d}",
            "t9-" + entry["dir"],
            "job",
            None,
            f"T9 witness case {entry['id']} as a golden e2e case.",
            False,
            REPO / "tests/fixtures/witness" / entry["dir"],
            list(entry["workflows"]),
            entry["scenario"],
            entry["required_checks"],
        )


def assert_unsupported(report, design: str, golden_id: str) -> None:
    """The designed UNKNOWN must actually surface somewhere in the report."""
    if design == "trigger_unknown":
        bad = [w for w in report["workflows"] if w["trigger"]["status"] != "UNKNOWN"]
        assert not bad, f"{golden_id}: trigger should be UNKNOWN: {bad}"
    elif design == "job_unknown":
        # A case may legitimately mix an ELIGIBLE upstream job with an
        # UNKNOWN downstream job (U-06); the pin is that at least one
        # job is UNKNOWN and every required check is UNKNOWN.
        unknown_jobs = [j for j in report["jobs"] if j["status"] == "UNKNOWN"]
        assert unknown_jobs, f"{golden_id}: at least one job should be UNKNOWN"
    else:  # pragma: no cover - defensive
        raise ValueError(design)
    bad_checks = [c for c in report["required_checks"] if c["status"] != "UNKNOWN"]
    assert not bad_checks, f"{golden_id}: checks should be UNKNOWN: {bad_checks}"


def build(target_dir: Path) -> dict:
    entries = []
    reports = {}
    for (gid, slug, group, cp, desc, adv, src, wf_files, sc_file, rc_file) in suite_entries():
        out_dir = target_dir / f"{gid}-{slug}"
        workflows = [
            (name, (src / name).read_text(encoding="utf-8")) for name in wf_files
        ]
        scenario = load_json(src / sc_file)
        if rc_file is None:
            required_checks = derive_required_checks([t for _, t in workflows])
            derived = True
        else:
            required_checks = load_json(src / rc_file)
            derived = False
            if not required_checks.get("required_checks"):
                required_checks = derive_required_checks([t for _, t in workflows])
                derived = True
        report = build_case(out_dir, gid, workflows, scenario, required_checks)
        reports[gid] = report
        entries.append({
            "id": gid,
            "dir": out_dir.name,
            "description": desc,
            "cp": cp,
            "group": group,
            "adversarial": adv,
            "workflows": wf_files,
            "scenario": "scenario.json",
            "required_checks": "required-checks.json",
            "expected": "expected.json",
            "source": ("derived-required-checks" if derived else "copied"),
        })
    # Unsupported cases (inputs live in tests/fixtures/unsupported/).
    unsup_dir = REPO / "tests" / "fixtures" / "unsupported"
    for j, (uid, slug, desc, wf_text, design) in enumerate(UNSUPPORTED):
        gid = f"G-{73 + j:02d}"
        case_dir = unsup_dir / f"{uid}-{slug}"
        case_dir.mkdir(parents=True, exist_ok=True)
        (case_dir / "workflow.yml").write_text(wf_text, encoding="utf-8")
        scenario = json.loads(json.dumps(STANDARD_SCENARIO))
        scenario["scenario_id"] = gid
        dump_json(case_dir / "scenario.json", scenario)
        required_checks = {
            "schema": "checkpath.required-checks/v1",
            "required_checks": [
                {"context": "unit-tests", "source": "github-actions"}
            ],
        }
        dump_json(case_dir / "required-checks.json", required_checks)
        report = evaluate_e2e_fixture(
            gid, [("workflow.yml", wf_text)], scenario, required_checks
        )
        assert_unsupported(report, design, gid)
        dump_json(case_dir / "expected.json", report)
        # Golden suite references the unsupported dir, it does not copy it.
        entries.append({
            "id": gid,
            "dir": f"../unsupported/{case_dir.name}",
            "description": f"Unsupported case {uid} ({slug}): {desc}.",
            "cp": None,
            "group": "unsupported",
            "adversarial": True,
            "workflows": ["workflow.yml"],
            "scenario": "scenario.json",
            "required_checks": "required-checks.json",
            "expected": "expected.json",
            "source": "unsupported",
        })
        reports[gid] = report
    suite = {
        "schema": "checkpath.s0-e2e-suite/v1",
        "suite_id": "golden",
        "seed": SEED,
        "fixtures": entries,
    }
    dump_json(target_dir / "suite.json", suite)
    return {"suite": suite, "reports": reports}


def dir_sha256(path: Path) -> str:
    h = hashlib.sha256()
    for p in sorted(path.rglob("*")):
        if p.is_file():
            h.update(str(p.relative_to(path)).encode())
            h.update(b"\0")
            h.update(p.read_bytes())
            h.update(b"\0")
    return h.hexdigest()


def main(argv) -> int:
    check_only = "--check-only" in argv
    if check_only:
        with tempfile.TemporaryDirectory(prefix="checkpath-golden-") as tmp:
            tmp_path = Path(tmp) / "golden"
            tmp_path.mkdir()
            # Unsupported dirs are written to the repo by build(); stash
            # them, run, compare, restore.
            unsup = REPO / "tests" / "fixtures" / "unsupported"
            backup = Path(tmp) / "unsupported-backup"
            if unsup.exists():
                shutil.copytree(unsup, backup)
            result = build(tmp_path)
            ok = True
            if dir_sha256(tmp_path) != dir_sha256(GOLDEN_DIR):
                print("CHECK FAILED: golden dir differs from regeneration")
                ok = False
            if backup.exists():
                shutil.rmtree(unsup, ignore_errors=True)
                shutil.copytree(backup, unsup)
            elif unsup.exists():
                shutil.rmtree(unsup, ignore_errors=True)
            print(f"golden cases: {len(result['suite']['fixtures'])}")
            return 0 if ok else 1
    result = build(GOLDEN_DIR)
    print(f"golden cases: {len(result['suite']['fixtures'])}")
    # Coverage summary for the T011 report.
    from collections import Counter
    check_statuses = Counter()
    job_statuses = Counter()
    trigger_statuses = Counter()
    trigger_reasons = Counter()
    job_reasons = Counter()
    for report in result["reports"].values():
        for c in report["required_checks"]:
            check_statuses[c["status"]] += 1
        for j in report["jobs"]:
            job_statuses[j["status"]] += 1
            job_reasons[j["reason"]] += 1
        for w in report["workflows"]:
            trigger_statuses[w["trigger"]["status"]] += 1
            trigger_reasons[w["trigger"]["evaluation"]["reason"]] += 1
    print("check statuses:", dict(sorted(check_statuses.items())))
    print("job statuses:", dict(sorted(job_statuses.items())))
    print("trigger statuses:", dict(sorted(trigger_statuses.items())))
    print("trigger reasons:", dict(sorted(trigger_reasons.items())))
    print("job reasons:", dict(sorted(job_reasons.items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
