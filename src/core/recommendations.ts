// T009 — Recommendation rules for CheckPath failure witnesses.
//
// Pure presentation rules: given the concrete evidence the witness
// reducer already collected (the exact workflow path, job id, check
// context, branch value, patterns, skip token, unsupported reason or
// invalid reason that actually fired), return the ONE rule that
// fired and its recommendation text. A recommendation never invents
// a cause: every value it names comes from the evidence object, and
// there is no generic fallback ("check your configuration" and
// friends do not exist in this module — a kind/reason combination
// with no rule is a programming error, not a prompt to be vague).
//
// Rule ids are stable per failure kind (PROJECT_BOOK §4.6):
//   R-MG-01    merge_group_missing
//   R-EV-01    event_trigger_missing (ADR T011/T009-U01)
//   R-PATH-01  path_filter
//   R-BRANCH-01 branch_filter
//   R-SKIP-01  commit_skip
//   R-CTX-01   missing_context
//   R-DUP-01   duplicate_context
//   R-UNSUP-01 unsupported_feature
//   R-INV-01   invalid_input
// The text varies by the exact reason inside the kind (e.g. the
// trigger-unknown variant is chosen by the first unsupported entry,
// the invalid variant by the exact job reason), so the rule that is
// cited is always the one whose condition actually fired.
//
// The Python Reference Oracle mirrors every template in this file
// byte-for-byte (oracle/checkpath_oracle/witness.py); the witness
// diff (`npm run oracle:diff:witness`) compares the rendered
// recommendations field-by-field, so any wording change here must be
// made in both places.

import type { WitnessKind } from "./types.js";

/** Double-quoted JSON rendering of one string (shared with notes). */
export function quote(value: string): string {
  return JSON.stringify(value);
}

/** Render a string list as ["a", "b"] (order preserved). */
export function formatQuotedList(items: readonly string[]): string {
  return "[" + items.map((item) => JSON.stringify(item)).join(", ") + "]";
}

/** Render providers as `workflow "p" job "j"; workflow "p" job "j"`. */
export function formatProviders(
  providers: readonly { workflow_path: string; job_id: string }[],
): string {
  return providers
    .map(
      (p) =>
        `workflow ${JSON.stringify(p.workflow_path)} job ${JSON.stringify(p.job_id)}`,
    )
    .join("; ");
}

/** Scenario branch field for an event (§4.2): PR -> base_branch, push -> branch, merge_group -> target_branch. */
export function branchFieldForEvent(eventName: string): string {
  if (eventName === "pull_request") return "base_branch";
  if (eventName === "push") return "branch";
  return "target_branch";
}

// ---------------------------------------------------------------------------
// Trigger-unknown cause: the one concrete reason a trigger evaluation
// is UNKNOWN, in fixed precedence (unsupported entries first, then the
// missing scenario value). The witness note and the recommendation
// variant both derive from this, so they can never disagree.
// ---------------------------------------------------------------------------

export interface TriggerUnknownEvidence {
  unsupported: readonly string[];
  activityTypeMatch: boolean | null;
  branchMatch: boolean | null;
  pathMatch: boolean | null;
  eventName: string;
}

export type TriggerUnknownCauseKind =
  | "unsupported_entry"
  | "missing_action"
  | "missing_branch"
  | "path_undecided"
  | "generic";

export interface TriggerUnknownCause {
  cause: string;
  kind: TriggerUnknownCauseKind;
}

export function triggerUnknownCause(
  ev: TriggerUnknownEvidence,
): TriggerUnknownCause {
  if (ev.unsupported.length > 0) {
    return { cause: ev.unsupported.join("; "), kind: "unsupported_entry" };
  }
  if (ev.activityTypeMatch === null) {
    return {
      cause: `the scenario does not provide an activity type (action) for event ${ev.eventName}`,
      kind: "missing_action",
    };
  }
  if (ev.branchMatch === null) {
    return {
      cause: `the scenario does not provide a branch value for event ${ev.eventName}`,
      kind: "missing_branch",
    };
  }
  if (ev.pathMatch === null) {
    return {
      cause: "the path filter cannot be decided for the given diff",
      kind: "path_undecided",
    };
  }
  return { cause: "the trigger evaluation is unknown", kind: "generic" };
}

// ---------------------------------------------------------------------------
// Trigger-invalid fixes: one concrete fix per parser error code.
// Unknown codes are rendered verbatim (never paraphrased into a
// generic instruction).
// ---------------------------------------------------------------------------

const TRIGGER_INVALID_FIXES: Record<string, string> = {
  paths_and_paths_ignore_both_present:
    "keep only paths or only paths-ignore in the same event",
  branches_and_branches_ignore_both_present:
    "keep only branches or only branches-ignore in the same event",
  event_config_not_mapping:
    "give the event a mapping value (or an empty mapping {})",
  missing_on_key: "add an on: key to the workflow",
  on_key_not_string: "write the on: key as a string",
  workflow_root_not_mapping: "make the workflow file a YAML mapping",
  yaml_parse_error: "fix the YAML syntax error in the workflow file",
  on_value_invalid:
    "give on: a string, a list of event names, or a mapping of event names",
  on_list_item_not_string: "use string event names in the on: list",
};

/** Concrete fixes for trigger error codes, joined with "; ". */
export function triggerInvalidFixes(errors: readonly string[]): string {
  return errors
    .map((error) => {
      if (error.startsWith("filter_not_string_or_list:")) {
        const key = error.slice("filter_not_string_or_list:".length);
        return `give filter ${JSON.stringify(key)} a string or a list of strings`;
      }
      return (
        TRIGGER_INVALID_FIXES[error] ??
        `fix the trigger error ${JSON.stringify(error)}`
      );
    })
    .join("; ");
}

// ---------------------------------------------------------------------------
// Recommendation input: the concrete evidence for one witness.
// Every field is a value that actually fired; fields irrelevant to the
// kind are null / empty.
// ---------------------------------------------------------------------------

export interface RecommendationInput {
  kind: WitnessKind;
  checkContext: string;
  /** Resolver reason of the check (no_provider, duplicate_context, ...). */
  resolverReason: string;
  /** Trigger evaluation reason of the provider workflow, if any. */
  triggerReason: string | null;
  workflowPath: string | null;
  jobId: string | null;
  /** Required-check source (external_source witnesses only). */
  source: string | null;
  eventName: string;
  action: string | null;
  /** Declared activity types of the matched event, if any. */
  eventTypes: readonly string[] | null;
  branchValue: string | null;
  branchPatterns: readonly string[] | null;
  branchPatternsKind: "branches" | "branches-ignore" | null;
  pathPatterns: readonly string[] | null;
  pathPatternsKind: "paths" | "paths-ignore" | null;
  /** First changed file that fails the path filter, if any. */
  retainedFile: string | null;
  skipToken: string | null;
  scannedContexts: readonly string[];
  providers: readonly { workflow_path: string; job_id: string }[];
  /** Trigger-unknown cause (unsupported_feature witnesses only). */
  triggerUnknown: TriggerUnknownCause | null;
  /** First trigger unsupported entry, if any. */
  firstUnsupported: string | null;
  triggerErrors: readonly string[];
  /** Job evaluation reason of the provider job, if any. */
  jobReason: string | null;
  /** Raw `if` expression of the provider job, if any. */
  jobIf: string | null;
  /** Needs of the provider job whose status is UNKNOWN, if any. */
  unknownNeeds: readonly string[];
}

export interface Recommendation {
  rule_id: string;
  recommendation: string;
}

const IF_SUBSET =
  "true, false, always(), !, &&, ||, ==, !=, parentheses, github.event_name, github.ref, github.base_ref, github.head_ref, github.event.action, string literals";

/** The one recommendation rule that fired for this witness. */
export function recommendationFor(input: RecommendationInput): Recommendation {
  const q = (value: string): string => JSON.stringify(value);
  const ctx = q(input.checkContext);
  const path = q(input.workflowPath ?? "");
  const job = q(input.jobId ?? "");
  const event = input.eventName;

  switch (input.kind) {
    case "merge_group_missing":
    case "event_trigger_missing": {
      const rule_id =
        input.kind === "event_trigger_missing" ? "R-EV-01" : "R-MG-01";
      if (input.triggerReason === "activity_type_mismatch") {
        return {
          rule_id,
          recommendation:
            `Add action ${q(input.action ?? "")} to the types list of on.${event} in workflow ${path} ` +
            `(currently ${formatQuotedList(input.eventTypes ?? [])}), or remove the types filter so every ${event} action triggers it.`,
        };
      }
      if (event === "merge_group") {
        return {
          rule_id,
          recommendation:
            `Add merge_group with types ["checks_requested"] to the on: triggers of workflow ${path} so the merge queue event triggers it, ` +
            `or move job ${job} providing ${ctx} into a workflow that already handles merge_group.`,
        };
      }
      return {
        rule_id,
        recommendation:
          `Add ${event} to the on: triggers of workflow ${path} so it runs for ${event} events, ` +
          `or move job ${job} providing ${ctx} into a workflow that already handles ${event}.`,
      };
    }

    case "path_filter": {
      const patterns = formatQuotedList(input.pathPatterns ?? []);
      if (input.pathPatternsKind === "paths-ignore") {
        if (input.retainedFile !== null) {
          return {
            rule_id: "R-PATH-01",
            recommendation:
              `Remove ${q(input.retainedFile)} from paths-ignore ${patterns} in workflow ${path} (or narrow the ignore patterns) so the changed file is not excluded, ` +
              `or move job ${job} providing ${ctx} to a workflow without a paths-ignore filter.`,
          };
        }
        return {
          rule_id: "R-PATH-01",
          recommendation:
            `Add a changed file outside paths-ignore ${patterns} in workflow ${path} to the scenario, or remove the paths-ignore filter from that workflow, ` +
            `or move job ${job} providing ${ctx} to a workflow without a paths-ignore filter.`,
        };
      }
      if (input.retainedFile !== null) {
        return {
          rule_id: "R-PATH-01",
          recommendation:
            `Widen the paths filter ${patterns} in workflow ${path} to include ${q(input.retainedFile)}, or remove the paths filter from that workflow, ` +
            `or move job ${job} providing ${ctx} to a workflow without a path filter.`,
        };
      }
      return {
        rule_id: "R-PATH-01",
        recommendation:
          `Add a changed file matching paths ${patterns} in workflow ${path} to the scenario, or remove the paths filter from that workflow, ` +
          `or move job ${job} providing ${ctx} to a workflow without a path filter.`,
      };
    }

    case "branch_filter": {
      const patterns = formatQuotedList(input.branchPatterns ?? []);
      const field = branchFieldForEvent(event);
      if (input.branchPatternsKind === "branches-ignore") {
        return {
          rule_id: "R-BRANCH-01",
          recommendation:
            `Remove branch ${q(input.branchValue ?? "")} from branches-ignore ${patterns} in workflow ${path} (or narrow the ignore patterns), ` +
            `or change the scenario ${field} to a branch the filter does not exclude.`,
        };
      }
      return {
        rule_id: "R-BRANCH-01",
        recommendation:
          `Add branch ${q(input.branchValue ?? "")} to branches ${patterns} in workflow ${path} (or adjust a pattern so it matches ${q(input.branchValue ?? "")}), ` +
          `or change the scenario ${field} to a branch the filter accepts.`,
      };
    }

    case "commit_skip": {
      return {
        rule_id: "R-SKIP-01",
        recommendation:
          `Remove the skip token ${q(input.skipToken ?? "")} from the commit message so workflow ${path} is not skipped.`,
      };
    }

    case "missing_context": {
      if (input.scannedContexts.length === 0) {
        return {
          rule_id: "R-CTX-01",
          recommendation:
            `Add a job named ${ctx} to a workflow triggered by this event, or remove the required-checks entry ${ctx} because no workflow declares any job.`,
        };
      }
      return {
        rule_id: "R-CTX-01",
        recommendation:
          `Add a job named ${ctx} (or set a job's name to ${ctx}) in a workflow triggered by this event, ` +
          `or correct the required-checks entry ${ctx} to match an existing job context from ${formatQuotedList(input.scannedContexts)}.`,
      };
    }

    case "duplicate_context": {
      return {
        rule_id: "R-DUP-01",
        recommendation:
          `Rename one of the jobs providing ${ctx} so each context has exactly one provider: ${formatProviders(input.providers)}. ` +
          `Update the required-checks entry if it should point at a specific one.`,
      };
    }

    case "unsupported_feature": {
      if (input.resolverReason === "external_source") {
        return {
          rule_id: "R-UNSUP-01",
          recommendation:
            `Change the source of required check ${ctx} to "github-actions" if it is reported by GitHub Actions, ` +
            `or remove ${ctx} from the required-checks list because external App checks cannot be simulated.`,
        };
      }
      if (input.resolverReason === "trigger_unknown" || input.jobReason === "trigger_unknown") {
        return {
          rule_id: "R-UNSUP-01",
          recommendation: triggerUnknownRecommendation(input),
        };
      }
      if (input.resolverReason === "provider_unknown") {
        if (input.jobReason === "unsupported_if") {
          return {
            rule_id: "R-UNSUP-01",
            recommendation:
              `Rewrite the if expression ${q(input.jobIf ?? "")} of job ${job} using only the supported subset (${IF_SUBSET}), ` +
              `or remove the if condition from job ${job} in workflow ${path}.`,
          };
        }
        if (input.jobReason === "if_unknown") {
          return {
            rule_id: "R-UNSUP-01",
            recommendation:
              `Provide the missing scenario value the if expression ${q(input.jobIf ?? "")} of job ${job} compares (set the event action or ref in the scenario), ` +
              `or rewrite the condition so it can be decided statically.`,
          };
        }
        if (input.jobReason === "needs_unknown") {
          return {
            rule_id: "R-UNSUP-01",
            recommendation:
              `Decide the upstream jobs ${formatQuotedList(input.unknownNeeds)} first (fix their if conditions or triggers), ` +
              `because job ${job} in workflow ${path} depends on them.`,
          };
        }
        return {
          rule_id: "R-UNSUP-01",
          recommendation:
            `Fix job ${job} in workflow ${path} (job reason is ${q(input.jobReason ?? "")}) so its status can be decided.`,
        };
      }
      return {
        rule_id: "R-UNSUP-01",
        recommendation:
          `Fix job ${job} in workflow ${path} (job reason is ${q(input.jobReason ?? "")}) so its status can be decided.`,
      };
    }

    case "invalid_input": {
      if (
        input.jobReason === "trigger_invalid" ||
        input.resolverReason === "trigger_invalid"
      ) {
        return {
          rule_id: "R-INV-01",
          recommendation:
            `Fix the trigger of workflow ${path}: ${triggerInvalidFixes(input.triggerErrors)}.`,
        };
      }
      if (input.jobReason !== null && input.jobReason.startsWith("missing_need:")) {
        const need = input.jobReason.slice("missing_need:".length);
        return {
          rule_id: "R-INV-01",
          recommendation:
            `Add a job ${q(need)} to workflow ${path}, or correct the needs entry of job ${job} (currently needs ${q(need)}).`,
        };
      }
      if (input.jobReason === "needs_cycle") {
        return {
          rule_id: "R-INV-01",
          recommendation:
            `Break the needs cycle involving job ${job} in workflow ${path} by removing one of its needs edges.`,
        };
      }
      if (input.jobReason === "duplicate_job_id") {
        return {
          rule_id: "R-INV-01",
          recommendation:
            `Rename one of the jobs with id ${job} in workflow ${path} so job ids are unique within the workflow.`,
        };
      }
      if (input.jobReason !== null && input.jobReason.startsWith("invalid_need:")) {
        const need = input.jobReason.slice("invalid_need:".length);
        return {
          rule_id: "R-INV-01",
          recommendation:
            `Fix the invalid need ${q(need)} of job ${job} in workflow ${path}: the needed job is itself invalid, so fix that job first.`,
        };
      }
      return {
        rule_id: "R-INV-01",
        recommendation:
          `Fix job ${job} in workflow ${path} (job reason is ${q(input.jobReason ?? "")}).`,
      };
    }
  }
}

/** Trigger-unknown recommendation, chosen by the first unsupported entry / missing value. */
function triggerUnknownRecommendation(input: RecommendationInput): string {
  const path = JSON.stringify(input.workflowPath ?? "");
  const first = input.firstUnsupported;
  if (first === "diff_first_3000_unconfirmed") {
    return (
      `Confirm the first 3,000 changed files by setting first_3000_confirmed to true with the actual first 3,000 files in the scenario, ` +
      `or reduce the diff below 3,001 files, so the path filter of workflow ${path} can be decided.`
    );
  }
  if (first !== null && first.startsWith("unsupported_glob:")) {
    const pattern = first.slice("unsupported_glob:".length);
    return (
      `Replace the unsupported glob ${JSON.stringify(pattern)} in workflow ${path} ` +
      `with a pattern from the supported subset (*, **, **/, ?, [..]).`
    );
  }
  if (first !== null && first.startsWith("unsupported_event:")) {
    const name = first.slice("unsupported_event:".length);
    return `Remove the unsupported event ${JSON.stringify(name)} from workflow ${path}, or handle that event outside CheckPath.`;
  }
  if (first !== null && first.startsWith("unsupported_filter:")) {
    const key = first.slice("unsupported_filter:".length);
    return `Remove the unsupported filter ${JSON.stringify(key)} from workflow ${path}, or handle it outside CheckPath.`;
  }
  if (first !== null) {
    return `Remove or replace the unsupported construct ${JSON.stringify(first)} in workflow ${path}, or handle it outside CheckPath.`;
  }
  const cause = input.triggerUnknown;
  if (cause?.kind === "missing_action") {
    return `Provide the activity type (action) for event ${input.eventName} in the scenario so workflow ${path} can be decided.`;
  }
  if (cause?.kind === "missing_branch") {
    return `Provide the ${branchFieldForEvent(input.eventName)} value for event ${input.eventName} in the scenario so workflow ${path} can be decided.`;
  }
  return `Supply the missing diff facts (changed_files_total, first_3000_confirmed, diff_timed_out, push_commit_count) in the scenario so the path filter of workflow ${path} can be decided.`;
}
