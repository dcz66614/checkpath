"""CheckPath Reference Oracle — required-check context resolver (T003 PoC, T004 per-provider).

Independent Python implementation of PROJECT_BOOK sections 4.5 and 4.7.
Maps each required check to its provider Job(s) by exact context match
(job ``name``, else ``job_id``) and derives the check status from the
provider Job status and the provider workflow's trigger outcome. Never
predicts whether a Job will really succeed or fail.

T004: the resolver takes one trigger state per provider Job
(``"triggered"`` | ``"not_triggered"`` | ``"unknown"`` | ``"invalid"``)
so the end-to-end pipeline can resolve checks across several workflow
files. The T003 single-boolean entry point delegates to it with one
shared trigger state.

Precedence (frozen):
  1. non-"github-actions" source            -> UNKNOWN (external App)
  2. zero providers                         -> PENDING_NOT_REPORTED
  3. more than one provider                 -> AMBIGUOUS
  4. single provider INVALID                -> INVALID
  5. provider's workflow trigger INVALID    -> INVALID
  6. provider's workflow trigger UNKNOWN    -> UNKNOWN
  7. provider's workflow not triggered      -> PENDING_NOT_REPORTED
  8. provider SKIPPED                       -> SKIPPED_SUCCESS
  9. provider UNKNOWN                       -> UNKNOWN
 10. provider ELIGIBLE / CONDITIONAL_AFTER_NEEDS -> REPORTABLE_PENDING

Workflow-level skip and job-level skip are deliberately different
outcomes (PENDING_NOT_REPORTED vs SKIPPED_SUCCESS, section 4.5).
It never imports or calls any TypeScript code.
"""

from __future__ import annotations

__all__ = [
    "resolve_required_checks",
    "resolve_required_checks_per_provider",
]


def resolve_required_checks_per_provider(required_checks, jobs_with_trigger):
    """Resolve checks with one trigger state per provider Job.

    ``jobs_with_trigger`` is a list of ``(job_evaluation, trigger_state)``
    pairs, in evaluation order; ``trigger_state`` is one of ``"triggered"``,
    ``"not_triggered"``, ``"unknown"`` or ``"invalid"``.
    """
    results = []
    for check in required_checks:
        context = check["context"]
        source = check.get("source")
        if source is not None and source != "github-actions":
            results.append({
                "context": context,
                "status": "UNKNOWN",
                "provider_job_id": None,
                "provider_count": 0,
                "reason": "external_source",
            })
            continue
        providers = [
            pair for pair in jobs_with_trigger if pair[0]["context"] == context
        ]
        if not providers:
            results.append({
                "context": context,
                "status": "PENDING_NOT_REPORTED",
                "provider_job_id": None,
                "provider_count": 0,
                "reason": "no_provider",
            })
        elif len(providers) > 1:
            results.append({
                "context": context,
                "status": "AMBIGUOUS",
                "provider_job_id": None,
                "provider_count": len(providers),
                "reason": "duplicate_context",
            })
        else:
            provider, trigger = providers[0]
            if provider["status"] == "INVALID":
                status, reason = "INVALID", "provider_invalid"
            elif trigger == "invalid":
                status, reason = "INVALID", "trigger_invalid"
            elif trigger == "unknown":
                status, reason = "UNKNOWN", "trigger_unknown"
            elif trigger == "not_triggered":
                status, reason = "PENDING_NOT_REPORTED", "workflow_not_triggered"
            elif provider["status"] == "SKIPPED":
                status, reason = "SKIPPED_SUCCESS", "provider_skipped"
            elif provider["status"] == "UNKNOWN":
                status, reason = "UNKNOWN", "provider_unknown"
            else:
                status, reason = "REPORTABLE_PENDING", "provider_reportable"
            results.append({
                "context": context,
                "status": status,
                "provider_job_id": provider["job_id"],
                "provider_count": 1,
                "reason": reason,
            })
    return results


def resolve_required_checks(required_checks, job_evaluations, workflow_triggered):
    """T003 single-boolean entry point: every provider shares one trigger outcome."""
    pairs = [
        (job, "triggered" if workflow_triggered else "not_triggered")
        for job in job_evaluations
    ]
    return resolve_required_checks_per_provider(required_checks, pairs)
