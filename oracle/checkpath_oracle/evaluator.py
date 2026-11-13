"""CheckPath Reference Oracle — job/check evaluator (T003 PoC).

Independent Python implementation of the Job DAG / `if`-subset /
required-check semantics in PROJECT_BOOK sections 3.3, 4.4, 4.5 and 4.7.
It reads raw fixture JSON only; it never imports or calls any TypeScript
code. It must agree field-for-field with src/core/job-dag.ts and
src/core/check-resolver.ts on every fixture in tests/fixtures/s0/job-check/.

Rules (frozen for this PoC):
  * `if` subset: true, false, always(), !, &&, ||, ==, !=, parentheses,
    github.event_name, github.ref, github.base_ref, github.head_ref,
    github.event.action, string literals. Everything else -> UNKNOWN.
  * Job statuses: ELIGIBLE / SKIPPED / CONDITIONAL_AFTER_NEEDS / UNKNOWN /
    INVALID. Real run success/failure is never predicted.
  * Default needs gate is the implicit success() precondition: a skipped
    need skips the downstream job, unless its `if` contains always(),
    which waives the precondition (ELIGIBLE). A need that will run makes
    the downstream job CONDITIONAL_AFTER_NEEDS.
  * Check statuses: REPORTABLE_PENDING / SKIPPED_SUCCESS /
    PENDING_NOT_REPORTED / AMBIGUOUS / UNKNOWN / INVALID. Workflow-level
    skip and job-level skip are different outcomes.
"""

from __future__ import annotations

from .canonical import canonical_bytes, sha256_hex
from .parser import build_trigger_ir, extract_jobs
from .resolver import (
    resolve_required_checks,
    resolve_required_checks_per_provider,
)

__all__ = [
    "evaluate_case",
    "evaluate_suite",
    "job_context",
    "diff_boundary",
    "evaluate_e2e_fixture",
]

SUPPORTED_CONTEXTS = {
    "github.event_name": "event_name",
    "github.ref": "ref",
    "github.base_ref": "base_ref",
    "github.head_ref": "head_ref",
    "github.event.action": "action",
}


class UnsupportedIf(Exception):
    """Raised when an `if` expression leaves the frozen subset."""


def job_context(job):
    """A job's required-check context: `name` if declared, else `job_id`."""
    return job.get("name") or job["id"]


# ---------------------------------------------------------------------------
# Frozen `if` subset: tokenizer + recursive-descent parser + Kleene logic.
# ---------------------------------------------------------------------------

def _tokenize(source):
    tokens = []
    i = 0
    while i < len(source):
        ch = source[i]
        if ch in " \t\n\r":
            i += 1
            continue
        if ch == "(":
            tokens.append(("lparen", ch))
            i += 1
            continue
        if ch == ")":
            tokens.append(("rparen", ch))
            i += 1
            continue
        if ch == "!" and (i + 1 >= len(source) or source[i + 1] != "="):
            tokens.append(("op", "!"))
            i += 1
            continue
        two = source[i : i + 2]
        if two in ("&&", "||", "==", "!="):
            tokens.append(("op", two))
            i += 2
            continue
        if ch in ("'", '"'):
            end = source.find(ch, i + 1)
            if end == -1:
                raise UnsupportedIf("unterminated string literal")
            tokens.append(("string", source[i + 1 : end]))
            i = end + 1
            continue
        if ch.isalnum() or ch in "._":
            j = i
            while j < len(source) and (source[j].isalnum() or source[j] in "._"):
                j += 1
            tokens.append(("ident", source[i:j]))
            i = j
            continue
        raise UnsupportedIf("unsupported character: %r" % ch)
    tokens.append(("eof", ""))
    return tokens


class _IfParser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def _peek(self):
        return self.tokens[self.pos]

    def _next(self):
        tok = self.tokens[self.pos]
        self.pos += 1
        return tok

    def parse(self):
        node = self._parse_or()
        if self._peek()[0] != "eof":
            raise UnsupportedIf("trailing tokens after expression")
        return node

    def _parse_or(self):
        left = self._parse_and()
        while self._peek() == ("op", "||"):
            self._next()
            left = ("or", left, self._parse_and())
        return left

    def _parse_and(self):
        left = self._parse_equality()
        while self._peek() == ("op", "&&"):
            self._next()
            left = ("and", left, self._parse_equality())
        return left

    def _parse_equality(self):
        left = self._parse_unary()
        while True:
            tok = self._peek()
            if tok[0] == "op" and tok[1] in ("==", "!="):
                self._next()
                right = self._parse_unary()
                left = ("eq" if tok[1] == "==" else "neq", left, right)
            else:
                return left

    def _parse_unary(self):
        if self._peek() == ("op", "!"):
            self._next()
            return ("not", self._parse_unary())
        return self._parse_primary()

    def _parse_primary(self):
        tok = self._next()
        if tok[0] == "lparen":
            inner = self._parse_or()
            if self._next()[0] != "rparen":
                raise UnsupportedIf("missing closing parenthesis")
            return inner
        if tok[0] == "string":
            return ("string", tok[1])
        if tok[0] == "ident":
            if tok[1] == "true":
                return ("bool", True)
            if tok[1] == "false":
                return ("bool", False)
            if tok[1] == "always":
                if self._next()[0] != "lparen" or self._next()[0] != "rparen":
                    raise UnsupportedIf("always() must be called with no arguments")
                return ("always",)
            if tok[1] in SUPPORTED_CONTEXTS:
                return ("context", tok[1])
            raise UnsupportedIf("unsupported identifier: %s" % tok[1])
        raise UnsupportedIf("unexpected token in if expression")


def _parse_if(raw):
    text = raw.strip()
    if text.startswith("${{") and text.endswith("}}"):
        text = text[3:-2].strip()
    return _IfParser(_tokenize(text)).parse()


def _contains_always(node):
    kind = node[0]
    if kind == "always":
        return True
    if kind == "not":
        return _contains_always(node[1])
    if kind in ("and", "or", "eq", "neq"):
        return _contains_always(node[1]) or _contains_always(node[2])
    return False


def _operand_value(node, scenario):
    kind = node[0]
    if kind == "string":
        return node[1]
    if kind == "bool":
        return node[1]
    if kind == "context":
        value = scenario.get(SUPPORTED_CONTEXTS[node[1]])
        return None if value is None else value
    return None


def _evaluate_if(node, scenario):
    """Three-valued (Kleene) evaluation: 'TRUE' | 'FALSE' | 'UNKNOWN'."""
    kind = node[0]
    if kind == "bool":
        return "TRUE" if node[1] else "FALSE"
    if kind == "always":
        return "TRUE"
    if kind in ("context", "string"):
        return "UNKNOWN"
    if kind == "not":
        inner = _evaluate_if(node[1], scenario)
        return {"TRUE": "FALSE", "FALSE": "TRUE"}.get(inner, "UNKNOWN")
    if kind == "and":
        left = _evaluate_if(node[1], scenario)
        right = _evaluate_if(node[2], scenario)
        if left == "FALSE" or right == "FALSE":
            return "FALSE"
        if left == "TRUE" and right == "TRUE":
            return "TRUE"
        return "UNKNOWN"
    if kind == "or":
        left = _evaluate_if(node[1], scenario)
        right = _evaluate_if(node[2], scenario)
        if left == "TRUE" or right == "TRUE":
            return "TRUE"
        if left == "FALSE" and right == "FALSE":
            return "FALSE"
        return "UNKNOWN"
    if kind in ("eq", "neq"):
        left = _operand_value(node[1], scenario)
        right = _operand_value(node[2], scenario)
        if left is None or right is None:
            return "UNKNOWN"
        if type(left) is not type(right):
            return "UNKNOWN"
        equal = left == right
        if kind == "eq":
            return "TRUE" if equal else "FALSE"
        return "FALSE" if equal else "TRUE"
    return "UNKNOWN"


# ---------------------------------------------------------------------------
# Job DAG evaluation.
# ---------------------------------------------------------------------------

def _evaluate_jobs(case):
    scenario = case.get("scenario") or {}
    jobs = case.get("jobs") or []
    triggered = bool(case.get("workflow_triggered"))
    by_id = {}
    duplicate_ids = set()
    for job in jobs:
        if job["id"] in by_id:
            duplicate_ids.add(job["id"])
        else:
            by_id[job["id"]] = job

    invalid = {}
    for job_id in duplicate_ids:
        invalid[job_id] = "duplicate_job_id"
    for job in jobs:
        for need in job.get("needs") or []:
            if need not in by_id:
                invalid[job["id"]] = "missing_need:%s" % need

    # Cycle detection (DFS, input order for determinism).
    state = {}
    stack = []

    def visit(job_id):
        if job_id in invalid or state.get(job_id) == "done":
            return
        if state.get(job_id) == "visiting":
            at = stack.index(job_id)
            for cyc in stack[at:]:
                if cyc not in invalid:
                    invalid[cyc] = "needs_cycle"
            return
        state[job_id] = "visiting"
        stack.append(job_id)
        for need in (by_id.get(job_id) or {}).get("needs") or []:
            visit(need)
        stack.pop()
        state[job_id] = "done"

    for job in jobs:
        visit(job["id"])

    # Propagate INVALID to transitive dependents (fixed point).
    changed = True
    while changed:
        changed = False
        for job in jobs:
            if job["id"] in invalid:
                continue
            bad = next(
                (n for n in (job.get("needs") or []) if n in invalid), None
            )
            if bad is not None:
                invalid[job["id"]] = "invalid_need:%s" % bad
                changed = True

    # Topological order (Kahn, input order as tie-break).
    remaining = {
        job["id"]: {
            n for n in (job.get("needs") or []) if n not in invalid
        }
        for job in jobs
        if job["id"] not in invalid
    }
    input_index = {job["id"]: i for i, job in enumerate(jobs)}
    order = []
    while remaining:
        ready = sorted(
            (job_id for job_id, deps in remaining.items() if not deps),
            key=lambda job_id: input_index[job_id],
        )
        if not ready:
            break  # Unreachable: cycles are already INVALID.
        for job_id in ready:
            order.append(job_id)
            del remaining[job_id]
            for deps in remaining.values():
                deps.discard(job_id)

    status_by_id = {}
    for job in jobs:
        if job["id"] in invalid:
            status_by_id[job["id"]] = {
                "job_id": job["id"],
                "context": job_context(job),
                "status": "INVALID",
                "reason": invalid[job["id"]],
            }
        elif not triggered:
            status_by_id[job["id"]] = {
                "job_id": job["id"],
                "context": job_context(job),
                "status": "SKIPPED",
                "reason": "workflow_not_triggered",
            }

    for job_id in order:
        if not triggered:
            break
        job = by_id[job_id]
        raw_if = job.get("if")
        if_value = "TRUE"
        has_always = False
        unsupported = False
        if raw_if is not None and str(raw_if).strip() != "":
            try:
                ast = _parse_if(str(raw_if))
                has_always = _contains_always(ast)
                if_value = _evaluate_if(ast, scenario)
            except UnsupportedIf:
                unsupported = True
        if unsupported or if_value == "UNKNOWN":
            status = ("UNKNOWN", "unsupported_if" if unsupported else "if_unknown")
        elif if_value == "FALSE":
            status = ("SKIPPED", "if_false")
        else:
            needs = job.get("needs") or []
            need_statuses = [
                status_by_id[n]["status"] for n in needs
            ]
            if "INVALID" in need_statuses:
                status = ("INVALID", "invalid_need")
            elif "UNKNOWN" in need_statuses:
                status = ("UNKNOWN", "needs_unknown")
            elif "SKIPPED" in need_statuses:
                if has_always:
                    status = ("ELIGIBLE", "always_overrides_skipped_needs")
                else:
                    status = ("SKIPPED", "needs_skipped")
            elif not needs:
                status = ("ELIGIBLE", "eligible")
            elif has_always:
                status = ("ELIGIBLE", "always_eligible")
            else:
                status = ("CONDITIONAL_AFTER_NEEDS", "needs_pending")
        # ADR T011/ADR-04: a reusable-workflow call or a matrix job has
        # no single reportable context, so it is UNKNOWN — but only
        # when it would otherwise run. A decidable skip (if: false, a
        # skipped need without always()) still wins.
        if status[0] in ("ELIGIBLE", "CONDITIONAL_AFTER_NEEDS"):
            unsupported_job = job.get("unsupported_job")
            if unsupported_job == "reusable_workflow":
                status = ("UNKNOWN", "unsupported_reusable_workflow")
            elif unsupported_job == "matrix":
                status = ("UNKNOWN", "unsupported_matrix")
        status_by_id[job_id] = {
            "job_id": job_id,
            "context": job_context(job),
            "status": status[0],
            "reason": status[1],
        }

    return [status_by_id[job["id"]] for job in jobs]


# ---------------------------------------------------------------------------
# Required-check resolver.
# ---------------------------------------------------------------------------

def _resolve_checks(case, job_evaluations):
    """T003 single-boolean resolver; delegates to resolver.py (one source of truth)."""
    return resolve_required_checks(
        case.get("required_checks") or [],
        job_evaluations,
        bool(case.get("workflow_triggered")),
    )


def evaluate_case(case):
    """Evaluate one fixture case; returns jobs/checks keyed by id/context."""
    jobs = _evaluate_jobs(case)
    checks = _resolve_checks(case, jobs)
    return {
        "id": case["id"],
        "jobs": {j["job_id"]: j["status"] for j in jobs},
        "job_details": jobs,
        "required_checks": {c["context"]: c["status"] for c in checks},
        "check_details": checks,
    }


def evaluate_suite(suite):
    """Evaluate a whole suite; compares each case against its frozen expected."""
    cases = []
    passed = 0
    for case in suite.get("cases") or []:
        result = evaluate_case(case)
        expected = case.get("expected") or {}
        ok = (
            result["jobs"] == (expected.get("jobs") or {})
            and result["required_checks"]
            == (expected.get("required_checks") or {})
        )
        passed += 1 if ok else 0
        cases.append({
            "id": case["id"],
            "jobs": result["jobs"],
            "required_checks": result["required_checks"],
            "expected": expected,
            "pass": ok,
        })
    return {
        "schema": "checkpath.oracle-job-check/v1",
        "suite_id": suite.get("suite_id"),
        "cases": cases,
        "summary": {
            "total": len(cases),
            "passed": passed,
            "failed": len(cases) - passed,
        },
    }


# ---------------------------------------------------------------------------
# End-to-end evaluation (T004): raw workflow YAML + scenario + required
# checks -> normalized e2e report (checkpath.e2e-report/v1). This is the
# pipeline the T004 fixtures verify: T002 trigger evaluation per workflow
# file, jobs extracted from the same YAML, T003 job/check semantics, and
# per-provider check resolution (resolver.py). No TypeScript is involved.
# ---------------------------------------------------------------------------

E2E_REPORT_SCHEMA = "checkpath.e2e-report/v1"

_JOB_STATUSES = (
    "CONDITIONAL_AFTER_NEEDS",
    "ELIGIBLE",
    "INVALID",
    "SKIPPED",
    "UNKNOWN",
)
_CHECK_STATUSES = (
    "AMBIGUOUS",
    "INVALID",
    "PENDING_NOT_REPORTED",
    "REPORTABLE_PENDING",
    "SKIPPED_SUCCESS",
    "UNKNOWN",
)


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


def _job_scenario(scenario):
    """Adapt a checkpath.scenario/v1 scenario to the T003 `if` context."""
    event = scenario.get("event") or {}
    return {
        "event_name": event.get("name"),
        "action": event.get("action"),
        "ref": event.get("ref"),
        "base_ref": event.get("base_branch"),
        "head_ref": event.get("head_branch"),
    }


def diff_boundary(scenario):
    """Scenario-level diff-boundary annotation (PROJECT_BOOK section 4.3).

    Precedence: diff timeout > push over 1,000 commits > unconfirmed
    first-3000 list. Returns None when no boundary applies. This is an
    annotation only; the per-workflow effect lives in each trigger IR.
    """
    event = scenario.get("event") or {}
    diff = scenario.get("diff") or {}
    changed_files = diff.get("changed_files") or []
    total = diff.get("changed_files_total")
    if not isinstance(total, int) or isinstance(total, bool):
        total = len(changed_files)
    if diff.get("diff_timed_out") is True:
        return "diff_timed_out"
    push_commits = diff.get("push_commit_count")
    if (
        event.get("name") == "push"
        and isinstance(push_commits, int)
        and not isinstance(push_commits, bool)
        and push_commits > 1000
    ):
        return "push_over_1000_commits"
    if total > 3000 and diff.get("first_3000_confirmed") is not True:
        return "first_3000_unconfirmed"
    return None


def evaluate_e2e_fixture(fixture_id, workflows, scenario, required_checks):
    """Evaluate one end-to-end fixture; returns the normalized e2e report.

    ``workflows`` is a list of ``(path, yaml_text)`` pairs in suite order;
    ``scenario`` and ``required_checks`` are the parsed JSON inputs.
    """
    trigger_scenario = _trigger_scenario(scenario)
    job_scenario = _job_scenario(scenario)
    required_list = (required_checks or {}).get("required_checks") or []
    workflow_reports = []
    jobs_out = []
    pairs = []
    for path, yaml_text in workflows:
        ir = build_trigger_ir(yaml_text, trigger_scenario, fixture_id)
        jobs = extract_jobs(yaml_text)
        triggered = ir["evaluation"]["triggered"]
        if ir["status"] == "INVALID":
            trigger_state = "invalid"
            job_evals = [
                {
                    "job_id": j["id"],
                    "context": job_context(j),
                    "status": "INVALID",
                    "reason": "trigger_invalid",
                }
                for j in jobs
            ]
        elif ir["status"] == "UNKNOWN" or triggered is None:
            trigger_state = "unknown"
            job_evals = [
                {
                    "job_id": j["id"],
                    "context": job_context(j),
                    "status": "UNKNOWN",
                    "reason": "trigger_unknown",
                }
                for j in jobs
            ]
        else:
            trigger_state = "triggered" if triggered else "not_triggered"
            job_evals = _evaluate_jobs(
                {
                    "workflow_triggered": triggered,
                    "scenario": job_scenario,
                    "jobs": jobs,
                    "required_checks": [],
                }
            )
        workflow_reports.append({"path": path, "trigger": ir})
        for job_eval in job_evals:
            jobs_out.append(
                {
                    "workflow": path,
                    "job_id": job_eval["job_id"],
                    "context": job_eval["context"],
                    "status": job_eval["status"],
                    "reason": job_eval["reason"],
                }
            )
            pairs.append((job_eval, trigger_state))
    checks = resolve_required_checks_per_provider(required_list, pairs)
    unsupported = []
    for workflow in workflow_reports:
        for item in workflow["trigger"]["evaluation"]["unsupported"]:
            if item not in unsupported:
                unsupported.append(item)
    for job in jobs_out:
        if job["reason"] == "unsupported_if":
            item = "unsupported_if:" + job["job_id"]
            if item not in unsupported:
                unsupported.append(item)
    for check in checks:
        if check["reason"] == "external_source":
            item = "external_source:" + check["context"]
            if item not in unsupported:
                unsupported.append(item)
    job_counts = {status: 0 for status in _JOB_STATUSES}
    for job in jobs_out:
        job_counts[job["status"]] += 1
    check_counts = {status: 0 for status in _CHECK_STATUSES}
    for check in checks:
        check_counts[check["status"]] += 1
    input_obj = {
        "required_checks": required_checks,
        "scenario": scenario,
        "workflows": [{"path": path, "yaml": yaml_text} for path, yaml_text in workflows],
    }
    triggered_count = sum(
        1
        for workflow in workflow_reports
        if workflow["trigger"]["status"] == "VALID"
        and workflow["trigger"]["evaluation"]["triggered"] is True
    )
    return {
        "schema": E2E_REPORT_SCHEMA,
        "fixture_id": fixture_id,
        "scenario_id": scenario.get("scenario_id") or fixture_id,
        "input_sha256": sha256_hex(canonical_bytes(input_obj)),
        "diff_boundary": diff_boundary(scenario),
        "workflows": workflow_reports,
        "jobs": jobs_out,
        "required_checks": checks,
        "unsupported_features": unsupported,
        "summary": {
            "workflow_count": len(workflow_reports),
            "triggered_workflow_count": triggered_count,
            "job_status_counts": job_counts,
            "check_status_counts": check_counts,
        },
    }
