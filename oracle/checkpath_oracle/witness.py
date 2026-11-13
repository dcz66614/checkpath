"""CheckPath Reference Oracle — minimal failure witness + recommendations (T009).

Minimal对照接口 for the TypeScript witness reducer
(src/core/witness-reducer.ts + src/core/recommendations.ts). This
module contains NO evaluation algorithm of its own: every verdict it
reads comes from the Oracle's existing ``evaluate_e2e_fixture``
(evaluator.py), every job ``if``/``needs`` string comes from the
existing ``extract_jobs`` (parser.py), and the commit-skip token list
is the existing ``COMMIT_SKIP_TOKENS`` (parser.py). The only logic
here is the witness derivation itself — kind classification, note and
recommendation templates, and the fixed-order reduction — written to
mirror the TypeScript implementation field-for-field so the witness
diff (``npm run oracle:diff:witness``) can compare the two sides with
no ignore list.

Kind precedence, note/recommendation templates, reduction order and
the merge_group_missing bucket for merge_group event/activity
mismatches are identical to the TypeScript side; see the header of
src/core/witness-reducer.ts for the frozen rules. ADR T011/T009-U01:
non-merge_group event/activity mismatches use the dedicated
``event_trigger_missing`` kind (rule R-EV-01) instead of
merge_group_missing.
"""

from __future__ import annotations

import json

from .evaluator import evaluate_e2e_fixture
from .parser import COMMIT_SKIP_TOKENS, extract_jobs

__all__ = ["build_witnesses", "normalize_scenario"]

_SCENARIO_SCHEMA = "checkpath.scenario/v1"
_IF_SUBSET = (
    "true, false, always(), !, &&, ||, ==, !=, parentheses, "
    "github.event_name, github.ref, github.base_ref, github.head_ref, "
    "github.event.action, string literals"
)
_TRIGGER_INVALID_FIXES = {
    "paths_and_paths_ignore_both_present":
        "keep only paths or only paths-ignore in the same event",
    "branches_and_branches_ignore_both_present":
        "keep only branches or only branches-ignore in the same event",
    "event_config_not_mapping":
        "give the event a mapping value (or an empty mapping {})",
    "missing_on_key": "add an on: key to the workflow",
    "on_key_not_string": "write the on: key as a string",
    "workflow_root_not_mapping": "make the workflow file a YAML mapping",
    "yaml_parse_error": "fix the YAML syntax error in the workflow file",
    "on_value_invalid":
        "give on: a string, a list of event names, or a mapping of event names",
    "on_list_item_not_string": "use string event names in the on: list",
}


def _q(value):
    return json.dumps(value, ensure_ascii=False)


def _list_str(items):
    return "[" + ", ".join(_q(item) for item in items) + "]"


def _providers_str(providers):
    return "; ".join(
        "workflow %s job %s" % (_q(p["workflow_path"]), _q(p["job_id"]))
        for p in providers
    )


def _branch_field(event_name):
    if event_name == "pull_request":
        return "base_branch"
    if event_name == "push":
        return "branch"
    return "target_branch"


def normalize_scenario(scenario):
    """Normalize a raw scenario dict to the full checkpath.scenario/v1 shape.

    Mirrors src/core/validate.ts ``validateScenario`` defaults: fields
    absent from the fixture become null (commit_message becomes "",
    algorithm becomes "three-dot", changed_files becomes []).
    """
    scenario = scenario or {}
    event = scenario.get("event") or {}
    diff = scenario.get("diff") or {}
    return {
        "schema": _SCENARIO_SCHEMA,
        "scenario_id": scenario.get("scenario_id"),
        "event": {
            "name": event.get("name"),
            "action": event.get("action"),
            "branch": event.get("branch"),
            "base_branch": event.get("base_branch"),
            "head_branch": event.get("head_branch"),
            "target_branch": event.get("target_branch"),
            "ref": event.get("ref"),
            "commit_message": event.get("commit_message") or "",
        },
        "diff": {
            "algorithm": diff.get("algorithm") or "three-dot",
            "changed_files": list(diff.get("changed_files") or []),
            "changed_files_total": diff.get("changed_files_total"),
            "returned_files": diff.get("returned_files"),
            "complete": diff.get("complete"),
            "first_3000_confirmed": diff.get("first_3000_confirmed"),
            "diff_timed_out": diff.get("diff_timed_out"),
            "push_commit_count": diff.get("push_commit_count"),
        },
    }


def _commit_skip_token(commit_message):
    message = (commit_message or "").lower()
    for token in COMMIT_SKIP_TOKENS:
        if token in message:
            return token
    return None


def _trigger_unknown_cause(evaluation, event_name):
    unsupported = evaluation.get("unsupported") or []
    if unsupported:
        return {"cause": "; ".join(unsupported), "kind": "unsupported_entry"}
    if evaluation.get("activity_type_match") is None:
        return {
            "cause": "the scenario does not provide an activity type (action) for event %s" % event_name,
            "kind": "missing_action",
        }
    if evaluation.get("branch_match") is None:
        return {
            "cause": "the scenario does not provide a branch value for event %s" % event_name,
            "kind": "missing_branch",
        }
    if evaluation.get("path_match") is None:
        return {
            "cause": "the path filter cannot be decided for the given diff",
            "kind": "path_undecided",
        }
    return {"cause": "the trigger evaluation is unknown", "kind": "generic"}


def _trigger_invalid_fixes(errors):
    fixes = []
    for error in errors:
        if error.startswith("filter_not_string_or_list:"):
            key = error[len("filter_not_string_or_list:"):]
            fixes.append("give filter %s a string or a list of strings" % _q(key))
        elif error in _TRIGGER_INVALID_FIXES:
            fixes.append(_TRIGGER_INVALID_FIXES[error])
        else:
            fixes.append("fix the trigger error %s" % _q(error))
    return "; ".join(fixes)


def _trigger_unknown_recommendation(inp):
    path = _q(inp["workflow_path"] or "")
    first = inp["first_unsupported"]
    if first == "diff_first_3000_unconfirmed":
        return (
            "Confirm the first 3,000 changed files by setting first_3000_confirmed to true with the actual first 3,000 files in the scenario, "
            "or reduce the diff below 3,001 files, so the path filter of workflow %s can be decided." % path
        )
    if first is not None and first.startswith("unsupported_glob:"):
        pattern = first[len("unsupported_glob:"):]
        return (
            "Replace the unsupported glob %s in workflow %s "
            "with a pattern from the supported subset (*, **, **/, ?, [..])." % (_q(pattern), path)
        )
    if first is not None and first.startswith("unsupported_event:"):
        name = first[len("unsupported_event:"):]
        return "Remove the unsupported event %s from workflow %s, or handle that event outside CheckPath." % (_q(name), path)
    if first is not None and first.startswith("unsupported_filter:"):
        key = first[len("unsupported_filter:"):]
        return "Remove the unsupported filter %s from workflow %s, or handle it outside CheckPath." % (_q(key), path)
    if first is not None:
        return "Remove or replace the unsupported construct %s in workflow %s, or handle it outside CheckPath." % (_q(first), path)
    cause = inp["trigger_unknown"] or {"kind": "generic"}
    if cause.get("kind") == "missing_action":
        return "Provide the activity type (action) for event %s in the scenario so workflow %s can be decided." % (inp["event_name"], path)
    if cause.get("kind") == "missing_branch":
        return "Provide the %s value for event %s in the scenario so workflow %s can be decided." % (
            _branch_field(inp["event_name"]), inp["event_name"], path)
    return "Supply the missing diff facts (changed_files_total, first_3000_confirmed, diff_timed_out, push_commit_count) in the scenario so the path filter of workflow %s can be decided." % path


def _recommendation(inp):
    ctx = _q(inp["check_context"])
    path = _q(inp["workflow_path"] or "")
    job = _q(inp["job_id"] or "")
    event = inp["event_name"]
    kind = inp["kind"]

    if kind == "merge_group_missing" or kind == "event_trigger_missing":
        rule_id = "R-EV-01" if kind == "event_trigger_missing" else "R-MG-01"
        if inp["trigger_reason"] == "activity_type_mismatch":
            return (rule_id,
                    "Add action %s to the types list of on.%s in workflow %s (currently %s), or remove the types filter so every %s action triggers it."
                    % (_q(inp["action"] or ""), event, path, _list_str(inp["event_types"] or []), event))
        if event == "merge_group":
            return (rule_id,
                    "Add merge_group with types [\"checks_requested\"] to the on: triggers of workflow %s so the merge queue event triggers it, "
                    "or move job %s providing %s into a workflow that already handles merge_group." % (path, job, ctx))
        return (rule_id,
                "Add %s to the on: triggers of workflow %s so it runs for %s events, "
                "or move job %s providing %s into a workflow that already handles %s." % (event, path, event, job, ctx, event))

    if kind == "path_filter":
        patterns = _list_str(inp["path_patterns"] or [])
        if inp["path_patterns_kind"] == "paths-ignore":
            if inp["retained_file"] is not None:
                return ("R-PATH-01",
                        "Remove %s from paths-ignore %s in workflow %s (or narrow the ignore patterns) so the changed file is not excluded, "
                        "or move job %s providing %s to a workflow without a paths-ignore filter." % (_q(inp["retained_file"]), patterns, path, job, ctx))
            return ("R-PATH-01",
                    "Add a changed file outside paths-ignore %s in workflow %s to the scenario, or remove the paths-ignore filter from that workflow, "
                    "or move job %s providing %s to a workflow without a paths-ignore filter." % (patterns, path, job, ctx))
        if inp["retained_file"] is not None:
            return ("R-PATH-01",
                    "Widen the paths filter %s in workflow %s to include %s, or remove the paths filter from that workflow, "
                    "or move job %s providing %s to a workflow without a path filter." % (patterns, path, _q(inp["retained_file"]), job, ctx))
        return ("R-PATH-01",
                "Add a changed file matching paths %s in workflow %s to the scenario, or remove the paths filter from that workflow, "
                "or move job %s providing %s to a workflow without a path filter." % (patterns, path, job, ctx))

    if kind == "branch_filter":
        patterns = _list_str(inp["branch_patterns"] or [])
        field = _branch_field(event)
        if inp["branch_patterns_kind"] == "branches-ignore":
            return ("R-BRANCH-01",
                    "Remove branch %s from branches-ignore %s in workflow %s (or narrow the ignore patterns), "
                    "or change the scenario %s to a branch the filter does not exclude." % (_q(inp["branch_value"] or ""), patterns, path, field))
        return ("R-BRANCH-01",
                "Add branch %s to branches %s in workflow %s (or adjust a pattern so it matches %s), "
                "or change the scenario %s to a branch the filter accepts." % (_q(inp["branch_value"] or ""), patterns, path, _q(inp["branch_value"] or ""), field))

    if kind == "commit_skip":
        return ("R-SKIP-01",
                "Remove the skip token %s from the commit message so workflow %s is not skipped." % (_q(inp["skip_token"] or ""), path))

    if kind == "missing_context":
        if not inp["scanned_contexts"]:
            return ("R-CTX-01",
                    "Add a job named %s to a workflow triggered by this event, or remove the required-checks entry %s because no workflow declares any job." % (ctx, ctx))
        return ("R-CTX-01",
                "Add a job named %s (or set a job's name to %s) in a workflow triggered by this event, "
                "or correct the required-checks entry %s to match an existing job context from %s." % (ctx, ctx, ctx, _list_str(inp["scanned_contexts"])))

    if kind == "duplicate_context":
        return ("R-DUP-01",
                "Rename one of the jobs providing %s so each context has exactly one provider: %s. "
                "Update the required-checks entry if it should point at a specific one." % (ctx, _providers_str(inp["providers"])))

    if kind == "unsupported_feature":
        if inp["resolver_reason"] == "external_source":
            return ("R-UNSUP-01",
                    "Change the source of required check %s to \"github-actions\" if it is reported by GitHub Actions, "
                    "or remove %s from the required-checks list because external App checks cannot be simulated." % (ctx, ctx))
        if inp["resolver_reason"] == "trigger_unknown" or inp["job_reason"] == "trigger_unknown":
            return ("R-UNSUP-01", _trigger_unknown_recommendation(inp))
        if inp["resolver_reason"] == "provider_unknown":
            if inp["job_reason"] == "unsupported_if":
                return ("R-UNSUP-01",
                        "Rewrite the if expression %s of job %s using only the supported subset (%s), "
                        "or remove the if condition from job %s in workflow %s." % (_q(inp["job_if"] or ""), job, _IF_SUBSET, job, path))
            if inp["job_reason"] == "if_unknown":
                return ("R-UNSUP-01",
                        "Provide the missing scenario value the if expression %s of job %s compares (set the event action or ref in the scenario), "
                        "or rewrite the condition so it can be decided statically." % (_q(inp["job_if"] or ""), job))
            if inp["job_reason"] == "needs_unknown":
                return ("R-UNSUP-01",
                        "Decide the upstream jobs %s first (fix their if conditions or triggers), "
                        "because job %s in workflow %s depends on them." % (_list_str(inp["unknown_needs"]), job, path))
            return ("R-UNSUP-01",
                    "Fix job %s in workflow %s (job reason is %s) so its status can be decided." % (job, path, _q(inp["job_reason"] or "")))
        return ("R-UNSUP-01",
                "Fix job %s in workflow %s (job reason is %s) so its status can be decided." % (job, path, _q(inp["job_reason"] or "")))

    if kind == "invalid_input":
        if inp["job_reason"] == "trigger_invalid" or inp["resolver_reason"] == "trigger_invalid":
            return ("R-INV-01",
                    "Fix the trigger of workflow %s: %s." % (path, _trigger_invalid_fixes(inp["trigger_errors"])))
        job_reason = inp["job_reason"] or ""
        if job_reason.startswith("missing_need:"):
            need = job_reason[len("missing_need:"):]
            return ("R-INV-01",
                    "Add a job %s to workflow %s, or correct the needs entry of job %s (currently needs %s)." % (_q(need), path, job, _q(need)))
        if job_reason == "needs_cycle":
            return ("R-INV-01",
                    "Break the needs cycle involving job %s in workflow %s by removing one of its needs edges." % (job, path))
        if job_reason == "duplicate_job_id":
            return ("R-INV-01",
                    "Rename one of the jobs with id %s in workflow %s so job ids are unique within the workflow." % (job, path))
        if job_reason.startswith("invalid_need:"):
            need = job_reason[len("invalid_need:"):]
            return ("R-INV-01",
                    "Fix the invalid need %s of job %s in workflow %s: the needed job is itself invalid, so fix that job first." % (_q(need), job, path))
        return ("R-INV-01",
                "Fix job %s in workflow %s (job reason is %s)." % (job, path, _q(job_reason)))

    raise ValueError("unknown witness kind: %r" % kind)


# ---------------------------------------------------------------------------
# Pipeline evaluation (read-only; delegates to evaluate_e2e_fixture).
# ---------------------------------------------------------------------------

def _evaluate_all(fixture_id, workflows, scenario, required_checks):
    report = evaluate_e2e_fixture(fixture_id, workflows, scenario, required_checks)
    per_workflow = []
    for (path, yaml_text), wf_report in zip(workflows, report["workflows"]):
        trigger = wf_report["trigger"]
        evaluation = trigger["evaluation"]
        if trigger["status"] == "INVALID":
            state = "invalid"
        elif trigger["status"] == "UNKNOWN" or evaluation.get("triggered") is None:
            state = "unknown"
        elif evaluation.get("triggered"):
            state = "triggered"
        else:
            state = "not_triggered"
        jobs = [j for j in report["jobs"] if j["workflow"] == path]
        per_workflow.append({
            "path": path,
            "yaml": yaml_text,
            "trigger": trigger,
            "evaluation": evaluation,
            "state": state,
            "jobs": jobs,
            "raw_jobs": extract_jobs(yaml_text),
        })
    providers = []
    for wf in per_workflow:
        for job in wf["jobs"]:
            providers.append({"job": job, "trigger": wf["state"], "workflow_path": wf["path"]})
    scanned = []
    for wf in per_workflow:
        for job in wf["jobs"]:
            if job["context"] not in scanned:
                scanned.append(job["context"])
    return {
        "report": report,
        "per_workflow": per_workflow,
        "providers": providers,
        "checks": report["required_checks"],
        "scanned": scanned,
    }


def _reproduces(fixture_id, candidate_workflows, candidate_scenario, single_entry, original, original_kind, original_fbc):
    evaluation = _evaluate_all(
        fixture_id,
        candidate_workflows,
        candidate_scenario,
        {"required_checks": [single_entry]},
    )
    rows = evaluation["checks"]
    if not rows:
        return False
    row = rows[0]
    if row["status"] != original["status"] or row["reason"] != original["reason"]:
        return False
    # Kind + first blocking condition are load-bearing: (status, reason)
    # alone is too weak — e.g. deleting the one path-matching file turns
    # a commit_skip block into a path_mismatch block while the check
    # verdict stays identical, and the reduced scenario would then
    # witness a different failure than the one it claims.
    evidence = _build_evidence(0, row, evaluation, candidate_scenario, [single_entry])
    return (
        evidence is not None
        and evidence["kind"] == original_kind
        and evidence["first_blocking_condition"] == original_fbc
    )


# ---------------------------------------------------------------------------
# Witness evidence.
# ---------------------------------------------------------------------------

def _build_evidence(index, result, evaluation, scenario, required_checks):
    if result["status"] in ("REPORTABLE_PENDING", "SKIPPED_SUCCESS"):
        return None
    context = result["context"]
    entry = required_checks[index] if index < len(required_checks) else {}
    providers = [p for p in evaluation["providers"] if p["job"]["context"] == context]
    single = providers[0] if len(providers) == 1 else None
    provider_wf = None
    if single is not None:
        for wf in evaluation["per_workflow"]:
            if wf["path"] == single["workflow_path"]:
                provider_wf = wf
                break
    provider_job = single["job"] if single is not None else None
    provider_list = [
        {"workflow_path": p["workflow_path"], "job_id": p["job"]["job_id"]}
        for p in providers
    ]
    trigger_eval = provider_wf["evaluation"] if provider_wf is not None else None
    trigger_reason = trigger_eval["reason"] if trigger_eval is not None else None
    matched_event = None
    if provider_wf is not None:
        for event in provider_wf["trigger"]["events"]:
            if event["name"] == scenario["event"]["name"]:
                matched_event = event
                break
    unknown_cause = None
    if trigger_eval is not None:
        unknown_cause = _trigger_unknown_cause(trigger_eval, scenario["event"]["name"])
    first_unsupported = None
    if trigger_eval is not None and (trigger_eval.get("unsupported") or []):
        first_unsupported = trigger_eval["unsupported"][0]
    retained_file = None
    if trigger_eval is not None:
        for row in trigger_eval.get("path_file_results") or []:
            if not row["matched"]:
                retained_file = row["file"]
                break
    provider_raw_job = None
    if provider_wf is not None and provider_job is not None:
        for raw in provider_wf["raw_jobs"]:
            if raw["id"] == provider_job["job_id"]:
                provider_raw_job = raw
                break
    unknown_needs = []
    if (
        provider_wf is not None
        and provider_job is not None
        and provider_job["reason"] == "needs_unknown"
        and provider_raw_job is not None
    ):
        for need in provider_raw_job.get("needs") or []:
            for job in provider_wf["jobs"]:
                if job["job_id"] == need and job["status"] == "UNKNOWN":
                    unknown_needs.append(need)
                    break

    event = scenario["event"]
    action = event.get("action")
    event_ref = "%s/%s" % (event["name"], action) if action is not None else event["name"]
    base = {
        "check_context": context,
        "resolver_reason": result["reason"],
        "trigger_reason": trigger_reason,
        "workflow_path": provider_wf["path"] if provider_wf is not None else None,
        "job_id": provider_job["job_id"] if provider_job is not None else None,
        "source": entry.get("source"),
        "event_name": event["name"],
        "action": action,
        "event_types": matched_event["types"] if matched_event is not None else None,
        "branch_value": trigger_eval["branch_value"] if trigger_eval is not None else None,
        "branch_patterns": None,
        "branch_patterns_kind": None,
        "path_patterns": None,
        "path_patterns_kind": None,
        "retained_file": retained_file,
        "skip_token": None,
        "scanned_contexts": list(evaluation["scanned"]),
        "providers": provider_list,
        "trigger_unknown": unknown_cause,
        "first_unsupported": first_unsupported,
        "trigger_errors": list(provider_wf["trigger"]["errors"]) if provider_wf is not None else [],
        "job_reason": provider_job["reason"] if provider_job is not None else None,
        "job_if": provider_raw_job.get("if") if provider_raw_job is not None else None,
        "unknown_needs": unknown_needs,
    }

    def fail(kind, first_blocking_condition, note, extra=None):
        inp = dict(base)
        inp["kind"] = kind
        if extra:
            inp.update(extra)
        return {
            "kind": kind,
            "first_blocking_condition": first_blocking_condition,
            "note": note,
            "recommendation_input": inp,
            "provider_workflow": provider_wf,
            "retained_file": retained_file,
        }

    reason = result["reason"]
    path = _q(provider_wf["path"]) if provider_wf is not None else _q("")
    if reason == "duplicate_context":
        return fail(
            "duplicate_context", "duplicate_context",
            "Required check context %s is provided by %d jobs: %s." % (_q(context), len(providers), _providers_str(provider_list)),
        )
    if reason == "no_provider":
        if not evaluation["scanned"]:
            note = "No job provides required check context %s; the workflows declare no jobs." % _q(context)
        else:
            note = "No job provides required check context %s; scanned job contexts are %s." % (_q(context), _list_str(evaluation["scanned"]))
        return fail("missing_context", "no_provider", note)
    if reason == "external_source":
        return fail(
            "unsupported_feature", "external_source",
            "Required check %s declares source %s, which is not github-actions; external App checks cannot be simulated." % (_q(context), _q(entry.get("source") or "")),
        )
    if reason in ("provider_invalid", "trigger_invalid"):
        job_reason = provider_job["reason"] if provider_job is not None else None
        if job_reason == "trigger_invalid" or reason == "trigger_invalid":
            errors = provider_wf["trigger"]["errors"] if provider_wf is not None else []
            return fail(
                "invalid_input", reason,
                "Workflow %s trigger is invalid: %s." % (path, "; ".join(errors)),
            )
        return fail(
            "invalid_input", reason,
            "Job %s in workflow %s is invalid: %s." % (_q(provider_job["job_id"]) if provider_job is not None else _q(""), path, job_reason or ""),
        )
    if reason == "trigger_unknown":
        cause = unknown_cause or {"cause": "the trigger evaluation is unknown", "kind": "generic"}
        return fail(
            "unsupported_feature", "trigger_unknown",
            "Workflow %s trigger cannot be decided: %s." % (path, cause["cause"]),
        )
    if reason == "provider_unknown":
        job_reason = provider_job["reason"] if provider_job is not None else None
        job = _q(provider_job["job_id"]) if provider_job is not None else _q("")
        job_if = provider_raw_job.get("if") if provider_raw_job is not None else None
        if job_reason == "unsupported_if":
            return fail(
                "unsupported_feature", "provider_unknown",
                "Job %s in workflow %s cannot be decided: if %s uses syntax outside the supported subset." % (job, path, _q(job_if or "")),
            )
        if job_reason == "if_unknown":
            return fail(
                "unsupported_feature", "provider_unknown",
                "Job %s in workflow %s cannot be decided: if %s cannot be decided statically." % (job, path, _q(job_if or "")),
            )
        if job_reason == "needs_unknown":
            return fail(
                "unsupported_feature", "provider_unknown",
                "Job %s in workflow %s cannot be decided: needs jobs %s cannot be decided." % (job, path, _list_str(unknown_needs)),
            )
        if job_reason == "trigger_unknown":
            cause = unknown_cause or {"cause": "the trigger evaluation is unknown", "kind": "generic"}
            return fail(
                "unsupported_feature", "provider_unknown",
                "Job %s in workflow %s cannot be decided: workflow trigger cannot be decided: %s." % (job, path, cause["cause"]),
            )
        return fail(
            "unsupported_feature", "provider_unknown",
            "Job %s in workflow %s cannot be decided: job reason is %s." % (job, path, _q(job_reason or "")),
        )
    if reason == "workflow_not_triggered":
        # ADR T011/T009-U01: merge_group_missing is exact only for the
        # merge_group event; any other event uses event_trigger_missing.
        event_kind = (
            "merge_group_missing"
            if event["name"] == "merge_group"
            else "event_trigger_missing"
        )
        if trigger_reason == "event_mismatch":
            return fail(
                event_kind, "event_mismatch",
                "Workflow %s does not declare on.%s for scenario event %s; required check %s has no triggered provider." % (path, event["name"], event_ref, _q(context)),
            )
        if trigger_reason == "activity_type_mismatch":
            return fail(
                event_kind, "activity_type_mismatch",
                "Workflow %s declares on.%s but its types %s do not include action %s; required check %s has no triggered provider." % (
                    path, event["name"], _list_str(matched_event["types"] or [] if matched_event is not None else []), _q(action or ""), _q(context)),
            )
        if trigger_reason == "branch_mismatch":
            branch_value = trigger_eval["branch_value"] if trigger_eval is not None else ""
            if matched_event is not None and matched_event.get("branches_ignore") is not None:
                return fail(
                    "branch_filter", "branch_mismatch",
                    "Workflow %s branches-ignore %s excludes branch %s for event %s; required check %s has no triggered provider." % (
                        path, _list_str(matched_event["branches_ignore"]), _q(branch_value or ""), event["name"], _q(context)),
                    {"branch_patterns": list(matched_event["branches_ignore"]), "branch_patterns_kind": "branches-ignore"},
                )
            patterns = matched_event["branches"] if matched_event is not None else []
            return fail(
                "branch_filter", "branch_mismatch",
                "Workflow %s branch filter %s does not match branch %s for event %s; required check %s has no triggered provider." % (
                    path, _list_str(patterns or []), _q(branch_value or ""), event["name"], _q(context)),
                {"branch_patterns": list(patterns or []), "branch_patterns_kind": "branches"},
            )
        if trigger_reason == "path_mismatch":
            is_ignore = matched_event is not None and matched_event.get("paths_ignore") is not None
            patterns = []
            if matched_event is not None:
                patterns = list(matched_event.get("paths_ignore") or matched_event.get("paths") or [])
            extra = {
                "path_patterns": patterns,
                "path_patterns_kind": "paths-ignore" if is_ignore else "paths",
            }
            if is_ignore:
                if retained_file is not None:
                    note = "Workflow %s paths-ignore %s excludes every changed file; first excluded file is %s; required check %s has no triggered provider." % (path, _list_str(patterns), _q(retained_file), _q(context))
                else:
                    note = "Workflow %s paths-ignore %s excludes every changed file; the changed-file list is empty; required check %s has no triggered provider." % (path, _list_str(patterns), _q(context))
            else:
                if retained_file is not None:
                    note = "Workflow %s path filter %s matches none of the changed files; first non-matching file is %s; required check %s has no triggered provider." % (path, _list_str(patterns), _q(retained_file), _q(context))
                else:
                    note = "Workflow %s path filter %s matches none of the changed files; the changed-file list is empty; required check %s has no triggered provider." % (path, _list_str(patterns), _q(context))
            return fail("path_filter", "path_mismatch", note, extra)
        if trigger_reason == "commit_skip":
            token = _commit_skip_token(event.get("commit_message")) or ""
            return fail(
                "commit_skip", "commit_skip",
                "Commit message contains skip token %s; workflow %s is skipped; required check %s has no triggered provider." % (_q(token), path, _q(context)),
                {"skip_token": token},
            )
        if trigger_reason == "unknown":
            cause = unknown_cause or {"cause": "the trigger evaluation is unknown", "kind": "generic"}
            return fail(
                "unsupported_feature", "unknown",
                "Workflow %s trigger cannot be decided: %s." % (path, cause["cause"]),
            )
        if trigger_reason == "invalid":
            errors = provider_wf["trigger"]["errors"] if provider_wf is not None else []
            return fail(
                "invalid_input", "invalid",
                "Workflow %s trigger is invalid: %s." % (path, "; ".join(errors)),
                {"trigger_errors": list(errors)},
            )
        return fail(
            "unsupported_feature", trigger_reason or "unknown",
            "Workflow %s did not trigger for this scenario (trigger reason is %s); required check %s has no triggered provider." % (path, _q(trigger_reason or "unknown"), _q(context)),
        )
    return fail(
        "unsupported_feature", reason,
        "Required check %s has status %s (reason %s)." % (_q(context), result["status"], _q(reason)),
    )


# ---------------------------------------------------------------------------
# Fixed-order reduction (mirrors the TypeScript reducer step for step).
# ---------------------------------------------------------------------------

def _greedy_reduce_files(try_files, files):
    current = list(files)
    progress = True
    while progress:
        progress = False
        for item in list(current):
            if item not in current:
                continue
            candidate = list(current)
            candidate.remove(item)
            if try_files(candidate):
                current = candidate
                progress = True
    return current


def _reduce_scenario(fixture_id, workflows, scenario, required_checks, index, original, evidence):
    single_entry = required_checks[index]

    def try_with(candidate_workflows, files, message):
        candidate_scenario = dict(scenario)
        candidate_scenario["event"] = dict(scenario["event"])
        candidate_scenario["event"]["commit_message"] = message
        candidate_scenario["diff"] = dict(scenario["diff"])
        candidate_scenario["diff"]["changed_files"] = list(files)
        return _reproduces(
            fixture_id, candidate_workflows, candidate_scenario, single_entry, original,
            evidence["kind"], evidence["first_blocking_condition"],
        )

    # 1. Workflows, in file order (skipped for missing_context).
    reduced_workflows = list(workflows)
    if evidence["kind"] != "missing_context":
        for workflow in list(workflows):
            candidate = [w for w in reduced_workflows if w is not workflow]
            if try_with(candidate, scenario["diff"]["changed_files"], scenario["event"]["commit_message"]):
                reduced_workflows = candidate

    # 2. Changed files.
    changed_files = list(scenario["diff"]["changed_files"])
    message = scenario["event"]["commit_message"]
    if evidence["kind"] == "path_filter":
        first_bad = evidence["retained_file"]
        reduced = [] if first_bad is None else [first_bad]
        if try_with(reduced_workflows, reduced, message):
            changed_files = reduced
        else:
            changed_files = _greedy_reduce_files(
                lambda files: try_with(reduced_workflows, files, message), changed_files
            )
    else:
        changed_files = _greedy_reduce_files(
            lambda files: try_with(reduced_workflows, files, message), changed_files
        )

    # 3. Commit message.
    commit_message = message
    if evidence["kind"] == "commit_skip":
        token = _commit_skip_token(message)
        if token is not None and try_with(reduced_workflows, changed_files, token):
            commit_message = token
    elif try_with(reduced_workflows, changed_files, ""):
        commit_message = ""

    reduced_scenario = dict(scenario)
    reduced_scenario["event"] = dict(scenario["event"])
    reduced_scenario["event"]["commit_message"] = commit_message
    reduced_scenario["diff"] = dict(scenario["diff"])
    reduced_scenario["diff"]["changed_files"] = list(changed_files)

    if _reproduces(fixture_id, reduced_workflows, reduced_scenario, single_entry, original,
                    evidence["kind"], evidence["first_blocking_condition"]):
        return reduced_scenario
    return scenario


# ---------------------------------------------------------------------------
# Public entry point.
# ---------------------------------------------------------------------------

def build_witnesses(fixture_id, workflows, scenario, required_checks):
    """Build minimal failure witnesses + recommendations for one case.

    ``workflows`` is a list of ``(path, yaml_text)`` pairs in suite
    order; ``scenario`` and ``required_checks`` are the parsed JSON
    inputs (``required_checks`` is the manifest dict, or the raw list).
    Returns ``{"witnesses": [...], "recommendations": [...]}``.
    """
    if isinstance(required_checks, dict):
        entries = list(required_checks.get("required_checks") or [])
    else:
        entries = list(required_checks or [])
    scenario = normalize_scenario(scenario)
    evaluation = _evaluate_all(fixture_id, workflows, scenario, {"required_checks": entries})
    witnesses = []
    recommendations = []
    ordinal = 0
    for index, result in enumerate(evaluation["checks"]):
        evidence = _build_evidence(index, result, evaluation, scenario, entries)
        if evidence is None:
            continue
        reduced_scenario = _reduce_scenario(
            fixture_id, workflows, scenario, entries, index, result, evidence
        )
        ordinal += 1
        witness_id = "witness-%03d" % ordinal
        witnesses.append({
            "id": witness_id,
            "kind": evidence["kind"],
            "check_context": result["context"],
            "first_blocking_condition": evidence["first_blocking_condition"],
            "scenario": reduced_scenario,
            "note": evidence["note"],
        })
        rule_id, text = _recommendation(evidence["recommendation_input"])
        recommendations.append({
            "witness_id": witness_id,
            "rule_id": rule_id,
            "kind": evidence["kind"],
            "check_context": result["context"],
            "recommendation": text,
        })
    return {"witnesses": witnesses, "recommendations": recommendations}
