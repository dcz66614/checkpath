// T010 — Self-contained offline HTML report (PROJECT_BOOK §5.2).
//
// One HTML file, no CDN, no remote fonts/images/scripts, no external
// links at all (asserted by tests: the output contains no `http://`,
// `https://`, `<link`, `<img` or `<script src`). All styling is one
// inline `<style>` block; all behaviour is one inline `<script>`
// block that only reads the embedded JSON data block. User-supplied
// strings (workflow paths, job names, contexts, branch values,
// patterns, commit messages) are HTML-escaped before interpolation,
// never concatenated as markup (PROJECT_BOOK §9: no HTML injection
// from YAML content).
//
// Page sections (§5.2):
//   1. Summary — scenario, event, branches, counts, status counts,
//      scenario/input/report SHA-256, diff-boundary annotation.
//   2. Event Path — per workflow, the ordered chain
//      event -> activity type -> branch -> path -> commit skip, each
//      with PASS / FAIL / UNKNOWN and its basis; filter nodes are
//      <details> elements that expand to the matched patterns.
//   3. Workflow / Job DAG — workflow nodes + job nodes; edges are the
//      `needs` relations, written out as text (no canvas, no library).
//   4. Required Checks — one row per context with final status,
//      provider, source behaviour and whether it reports; clicking a
//      row highlights the provider workflow/job in the DAG section.
//   5. Witness — minimal failing input, first blocking condition,
//      recommendation; clicking a witness toggles a reduced-vs-
//      original scenario diff (line-based, computed in-page from the
//      embedded JSON).
//   6. Export — download the canonical JSON file / this HTML file
//      (Blob URLs created locally; no network), plus the fingerprints.
// Colour is never the only channel: every status also carries its
// status text and a text marker (✓ / ! / ? / ✕). There is deliberately
// NO "auto-fix and write back" button (§5.2).
//
// The report JSON is embedded as `<script type="application/json">`
// with `<` escaped as \u003c, so the page works from `file://` with
// no server and no fetch.

import type { PipelineEvaluation } from "../core/witness-reducer.js";
import type { CheckStatus, ReportV1, ScenarioV1 } from "../core/types.js";
import type { ReportFile } from "./json.js";
import { canonicalJson } from "../core/canonical-json.js";

/** HTML-escape a value for interpolation into text or attributes. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusMark(status: string): string {
  switch (status) {
    case "REPORTABLE_PENDING":
    case "ELIGIBLE":
    case "TRIGGERED":
      return "✓";
    case "SKIPPED_SUCCESS":
    case "SKIPPED":
      return "!";
    case "UNKNOWN":
      return "?";
    default:
      return "✕";
  }
}

function stepState(value: boolean | null): { label: string; mark: string } {
  if (value === true) return { label: "PASS", mark: "✓" };
  if (value === false) return { label: "FAIL", mark: "✕" };
  return { label: "UNKNOWN", mark: "?" };
}

function branchValueFor(scenario: ScenarioV1): string | null {
  const event = scenario.event;
  if (event.name === "pull_request") return event.base_branch;
  if (event.name === "push") return event.branch;
  if (event.name === "merge_group") return event.target_branch;
  return null;
}

/** Pretty JSON (2-space) for <pre> blocks, escaped for HTML. */
function prettyJson(value: unknown): string {
  return escapeHtml(JSON.stringify(value, null, 2));
}

const CSS = [
  "body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;margin:0 auto;max-width:1100px;padding:24px;color:#1a1a1a;background:#fff;line-height:1.5}",
  "h1{font-size:24px}h2{font-size:19px;border-bottom:1px solid #ddd;padding-bottom:4px}h3{font-size:15px}",
  "table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f0f0f0}",
  "code{background:#f4f4f4;padding:1px 4px;border-radius:3px;word-break:break-all}pre{background:#f4f4f4;padding:10px;overflow:auto;font-size:12px}",
  ".badge{display:inline-block;padding:1px 8px;border-radius:10px;border:1px solid #888;font-weight:600;font-size:12px;white-space:nowrap}",
  ".st-REPORTABLE_PENDING,.st-ELIGIBLE,.st-TRIGGERED,.st-PASS{background:#e2f5e2;border-color:#2a7a2a}",
  ".st-SKIPPED_SUCCESS,.st-SKIPPED,.st-CONDITIONAL_AFTER_NEEDS{background:#fff3cd;border-color:#8a6d00}",
  ".st-PENDING_NOT_REPORTED,.st-FAIL{background:#fde2e2;border-color:#a00}",
  ".st-AMBIGUOUS,.st-UNKNOWN{background:#e8e8f8;border-color:#555}",
  ".st-INVALID{background:#333;color:#fff;border-color:#000}",
  ".node{border:1px solid #999;border-radius:6px;padding:8px 12px;margin:6px 0;background:#fafafa}",
  ".highlight{outline:3px solid #005fcc;background:#e8f1ff}",
  "tr.clickable{cursor:pointer}tr.clickable:hover{background:#eef4ff}",
  "details{margin:4px 0}summary{cursor:pointer;font-weight:600}",
  ".muted{color:#555;font-size:13px}.hidden{display:none}",
  ".diff-add{background:#e2f5e2}.diff-del{background:#fde2e2}",
].join("\n");

const SCRIPT = [
  "(function(){",
  "var dataEl=document.getElementById('checkpath-data');",
  "var data=JSON.parse(dataEl.textContent);",
  "function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}",
  "function clearHighlights(){document.querySelectorAll('.highlight').forEach(function(el){el.classList.remove('highlight');});}",
  "document.querySelectorAll('tr[data-provider-workflow]').forEach(function(row){",
  "  row.addEventListener('click',function(){",
  "    clearHighlights();",
  "    row.classList.add('highlight');",
  "    var wf=row.getAttribute('data-provider-workflow');",
  "    var job=row.getAttribute('data-provider-job');",
  "    if(wf){document.querySelectorAll('[data-workflow-path=\"'+wf+'\"]').forEach(function(el){el.classList.add('highlight');});}",
  "    if(wf&&job){var jobEl=document.querySelector('[data-workflow-path=\"'+wf+'\"][data-job-id=\"'+job+'\"]');if(jobEl){jobEl.classList.add('highlight');jobEl.scrollIntoView({block:'nearest'});}}",
  "    var note=document.getElementById('highlight-note');",
  "    if(note){note.textContent=wf?('Highlighted provider: '+wf+(job?(' / job '+job):'')+' — click another check to move the highlight.'):'No single provider for this check (see the witness for the conflicting providers).';}",
  "  });",
  "});",
  "document.querySelectorAll('[data-witness-toggle]').forEach(function(btn){",
  "  btn.addEventListener('click',function(){",
  "    var id=btn.getAttribute('data-witness-toggle');",
  "    var panel=document.getElementById('witness-diff-'+id);",
  "    var witness=data.report.witnesses.find(function(w){return w.id===id;});",
  "    if(!witness||!witness.scenario){panel.textContent='This witness has no scenario (it is witnessed by its providers, not by a scenario).';panel.classList.remove('hidden');return;}",
  "    if(!panel.classList.contains('hidden')){panel.classList.add('hidden');btn.textContent='Show reduced vs original scenario';return;}",
  "    btn.textContent='Hide reduced vs original scenario';",
  "    var orig=JSON.stringify(data.scenario,null,2).split('\\n');",
  "    var red=JSON.stringify(witness.scenario,null,2).split('\\n');",
  "    var html='<p class=\\'muted\\'>Lines kept in the reduced scenario are shown plainly; lines only in the original are marked removed, lines only in the reduced scenario are marked added. The reduced scenario reproduces the same failure when re-run.</p>';",
  "    html+='<h4>Original scenario</h4><pre>'+esc(JSON.stringify(data.scenario,null,2))+'</pre>';",
  "    html+='<h4>Reduced scenario (witness)</h4><pre>'+esc(JSON.stringify(witness.scenario,null,2))+'</pre>';",
  "    var removed=orig.filter(function(l){return red.indexOf(l)===-1;});",
  "    var added=red.filter(function(l){return orig.indexOf(l)===-1;});",
  "    html+='<h4>Line difference</h4><pre>';",
  "    removed.forEach(function(l){html+='<span class=\\'diff-del\\'>- '+esc(l)+'</span>\\n';});",
  "    added.forEach(function(l){html+='<span class=\\'diff-add\\'>+ '+esc(l)+'</span>\\n';});",
  "    if(removed.length===0&&added.length===0){html+='(no line differs — the witness scenario equals the original input)';}",
  "    html+='</pre>';",
  "    panel.innerHTML=html;",
  "    panel.classList.remove('hidden');",
  "  });",
  "});",
  "document.getElementById('download-json').addEventListener('click',function(){",
  "  var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});",
  "  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='report.json';a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);",
  "});",
  "document.getElementById('download-html').addEventListener('click',function(){",
  "  var blob=new Blob(['<!DOCTYPE html>\\n'+document.documentElement.outerHTML],{type:'text/html'});",
  "  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='report.html';a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);",
  "});",
  "})();",
].join("\n");

/**
 * Build the single-file offline HTML report for one report file.
 * `evaluation` supplies the trigger detail (path file results,
 * declared filter patterns) that the frozen ReportV1 rows do not
 * carry; it is render detail only and never changes a verdict.
 */
export function buildReportHtml(file: ReportFile, evaluation: PipelineEvaluation): string {
  const report: ReportV1 = file.report;
  const scenario: ScenarioV1 = file.scenario;
  const counts: Record<CheckStatus, number> = {
    REPORTABLE_PENDING: 0,
    SKIPPED_SUCCESS: 0,
    PENDING_NOT_REPORTED: 0,
    AMBIGUOUS: 0,
    UNKNOWN: 0,
    INVALID: 0,
  };
  for (const row of report.required_check_results) counts[row.status] += 1;

  const eventLabel =
    scenario.event.action !== null
      ? `${scenario.event.name}/${scenario.event.action}`
      : scenario.event.name;
  const branchValue = branchValueFor(scenario);
  const embedded = canonicalJson(file).replace(/</g, "\\u003c");

  const summaryRows = (Object.keys(counts) as CheckStatus[])
    .map(
      (status) =>
        `<tr><td><span class="badge st-${status}">${statusMark(status)} ${escapeHtml(status)}</span></td><td>${counts[status]}</td></tr>`,
    )
    .join("\n");

  const eventPathSections = evaluation.perWorkflow
    .map((wf) => {
      const ev = wf.triggerEvaluation;
      const declared = wf.build.trigger.events.find((e) => e.name === scenario.event.name) ?? null;
      const step = (
        name: string,
        value: boolean | null,
        basis: string,
        patterns: string[] | null = null,
        patternsKind: string | null = null,
      ): string => {
        const state = stepState(value);
        const details =
          patterns !== null && patterns.length > 0
            ? `<details><summary>Declared ${escapeHtml(patternsKind ?? "patterns")} (${patterns.length})</summary><pre>${escapeHtml(JSON.stringify(patterns, null, 2))}</pre></details>`
            : "";
        return `<tr><td>${escapeHtml(name)}</td><td><span class="badge st-${state.label}">${state.mark} ${state.label}</span></td><td>${escapeHtml(basis)}</td></tr>${details ? `<tr><td colspan="3">${details}</td></tr>` : ""}`;
      };
      const matchedFiles = ev.path_file_results.filter((r) => r.matched).length;
      const firstBad = ev.path_file_results.find((r) => !r.matched)?.file ?? null;
      const branchPatterns = declared?.branches ?? declared?.branches_ignore ?? null;
      const pathPatterns = declared?.paths ?? declared?.paths_ignore ?? null;
      return [
        `<div class="node" data-workflow-path="${escapeHtml(wf.path)}">`,
        `<h3>Workflow <code>${escapeHtml(wf.path)}</code> — ${escapeHtml(wf.build.status)} / ${ev.triggered === null ? "trigger unknown" : ev.triggered ? "TRIGGERED" : "NOT TRIGGERED"}</h3>`,
        `<table><thead><tr><th>Step</th><th>Result</th><th>Basis</th></tr></thead><tbody>`,
        step("Event", ev.event_match, `scenario event is ${eventLabel}; workflow declares on.${scenario.event.name}: ${declared !== null ? "yes" : "no"}`),
        step(
          "Activity type",
          ev.activity_type_match,
          declared?.types ? `workflow types are ${JSON.stringify(declared.types)}; scenario action is ${JSON.stringify(scenario.event.action)}` : "workflow declares no types restriction; any action matches",
          declared?.types ?? null,
          "types",
        ),
        step(
          "Branch",
          ev.branch_match,
          `branch value for ${scenario.event.name} is ${JSON.stringify(branchValue)}${ev.branch_match === false ? "; filter did not match" : ""}`,
          branchPatterns,
          declared?.branches_ignore !== null ? "branches-ignore" : "branches",
        ),
        step(
          "Path",
          ev.path_match,
          ev.path_file_results.length === 0
            ? "no changed files listed"
            : `${matchedFiles} of ${ev.path_file_results.length} listed files matched${firstBad !== null ? `; first non-matching file is ${firstBad}` : ""}`,
          pathPatterns,
          declared?.paths_ignore !== null ? "paths-ignore" : "paths",
        ),
        step(
          "Commit skip",
          ev.commit_skip ? false : true,
          ev.commit_skip
            ? `commit message contains a skip token; workflow is skipped (reason: ${ev.reason})`
            : "commit message contains no skip token",
        ),
        `</tbody></table>`,
        `<p class="muted">Trigger reason: <code>${escapeHtml(ev.reason)}</code>${ev.unsupported.length > 0 ? ` — unsupported: <code>${escapeHtml(ev.unsupported.join("; "))}</code>` : ""}</p>`,
        `</div>`,
      ].join("\n");
    })
    .join("\n");

  const dagSections = evaluation.perWorkflow
    .map((wf) => {
      const jobs = wf.jobs
        .map((job) => {
          const needs = wf.irJobs.find((j) => j.id === job.job_id)?.needs ?? [];
          return `<div class="node" data-workflow-path="${escapeHtml(wf.path)}" data-job-id="${escapeHtml(job.job_id)}"><strong>Job <code>${escapeHtml(job.job_id)}</code></strong> (context <code>${escapeHtml(job.context)}</code>) — <span class="badge st-${job.status}">${statusMark(job.status)} ${escapeHtml(job.status)}</span><br><span class="muted">reason: <code>${escapeHtml(job.reason)}</code>${needs.length > 0 ? `; needs: ${needs.map((n) => escapeHtml(n)).join(", ")}` : "; needs: (none)"}${job.status === "CONDITIONAL_AFTER_NEEDS" ? "; runs only if its upstream jobs succeed" : ""}</span></div>`;
        })
        .join("\n");
      const triggerState =
        wf.triggerState === "triggered"
          ? "TRIGGERED"
          : wf.triggerState === "not_triggered"
            ? "NOT TRIGGERED"
            : wf.triggerState.toUpperCase();
      return `<div class="node" data-workflow-path="${escapeHtml(wf.path)}"><h3>Workflow <code>${escapeHtml(wf.path)}</code> — <span class="badge st-${triggerState === "TRIGGERED" ? "TRIGGERED" : triggerState === "NOT TRIGGERED" ? "FAIL" : "UNKNOWN"}">${statusMark(triggerState)} ${escapeHtml(triggerState)}</span></h3>${jobs || '<p class="muted">No jobs declared.</p>'}</div>`;
    })
    .join("\n");

  const checkRows = report.required_check_results
    .map((row) => {
      const provider =
        row.provider_count === 1
          ? `${row.provider_workflow_path ?? ""} / ${row.provider_job_id ?? ""}`
          : row.provider_count === 0
            ? "(no provider)"
            : `(${row.provider_count} providers — ambiguous)`;
      const reports =
        row.status === "REPORTABLE_PENDING"
          ? "Yes — will be reported (real outcome unknown)"
          : row.status === "SKIPPED_SUCCESS"
            ? "Yes — reported as skipped/success without running"
            : "No";
      return `<tr class="clickable" data-context="${escapeHtml(row.context)}" data-provider-workflow="${escapeHtml(row.provider_workflow_path ?? "")}" data-provider-job="${escapeHtml(row.provider_job_id ?? "")}"><td><code>${escapeHtml(row.context)}</code></td><td><span class="badge st-${row.status}">${statusMark(row.status)} ${escapeHtml(row.status)}</span></td><td>${escapeHtml(provider)}</td><td>${escapeHtml(reports)}</td><td><code>${escapeHtml(row.reason)}</code></td></tr>`;
    })
    .join("\n");

  const witnessSections =
    report.witnesses.length === 0
      ? "<p>No failing required checks — no witness was needed.</p>"
      : report.witnesses
          .map((witness) => {
            const rec = file.recommendations.find((r) => r.witness_id === witness.id);
            return `<div class="node"><h3>Witness <code>${escapeHtml(witness.id)}</code> — ${escapeHtml(witness.kind)}</h3><p>Check: <code>${escapeHtml(witness.check_context ?? "(none)")}</code><br>First blocking condition: <code>${escapeHtml(witness.first_blocking_condition)}</code></p><p>${escapeHtml(witness.note)}</p>${rec ? `<p><strong>Recommendation (${escapeHtml(rec.rule_id)}):</strong> ${escapeHtml(rec.recommendation)}</p>` : ""}<p><button type="button" data-witness-toggle="${escapeHtml(witness.id)}">Show reduced vs original scenario</button></p><div id="witness-diff-${escapeHtml(witness.id)}" class="hidden"></div>${witness.scenario !== null ? `<details><summary>Reduced scenario (JSON)</summary><pre>${prettyJson(witness.scenario)}</pre></details>` : "<p class=\"muted\">This witness is not scenario-shaped; it is witnessed by its conflicting providers.</p>"}</div>`;
          })
          .join("\n");

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>CheckPath report — ${escapeHtml(report.scenario_id)}</title>`,
    `<style>${CSS}</style>`,
    "</head>",
    "<body>",
    `<h1>CheckPath report — ${escapeHtml(report.scenario_id)}</h1>`,
    `<p class="muted">Self-contained offline report. No remote resources, no network, no token. <code>REPORTABLE_PENDING</code> means the check will be reported — it does NOT mean the job passed.</p>`,
    "<h2>Summary</h2>",
    `<table><tbody>`,
    `<tr><th>Scenario</th><td><code>${escapeHtml(report.scenario_id)}</code> — event <code>${escapeHtml(eventLabel)}</code>${branchValue !== null ? `, branch <code>${escapeHtml(branchValue)}</code>` : ""}</td></tr>`,
    `<tr><th>Workflows</th><td>${report.workflow_evaluations.length} (${report.workflow_evaluations.filter((w) => w.triggered === true).length} triggered)</td></tr>`,
    `<tr><th>Required checks</th><td>${report.required_check_results.length}</td></tr>`,
    `<tr><th>Jobs</th><td>${report.job_evaluations.length}</td></tr>`,
    `<tr><th>Witnesses</th><td>${report.witnesses.length}</td></tr>`,
    `<tr><th>Input SHA-256</th><td><code>${escapeHtml(report.input_sha256)}</code></td></tr>`,
    `<tr><th>Workflow set SHA-256</th><td><code>${escapeHtml(report.workflow_set_sha256)}</code></td></tr>`,
    `<tr><th>Required-checks SHA-256</th><td><code>${escapeHtml(report.required_checks_sha256)}</code></td></tr>`,
    `<tr><th>Report SHA-256</th><td><code>${escapeHtml(report.report_sha256)}</code></td></tr>`,
    file.diff_boundary !== null
      ? `<tr><th>Diff boundary</th><td><code>${escapeHtml(file.diff_boundary)}</code> <span class="muted">(report-layer annotation from the formal diff-boundary rules; not a ReportV1 field and not part of any Oracle comparison — see T010 report, T006 U-02)</span></td></tr>`
      : "",
    report.unsupported_features.length > 0
      ? `<tr><th>Unsupported features</th><td><code>${escapeHtml(report.unsupported_features.join("; "))}</code> — these inputs are UNKNOWN, never silently passed.</td></tr>`
      : "",
    `</tbody></table>`,
    "<h2>Required-check results</h2>",
    `<table><thead><tr><th>Context</th><th>Status</th><th>Count</th></tr></thead><tbody>${summaryRows}</tbody></table>`,
    "<h2>Event Path</h2>",
    `<p class="muted">One chain per workflow: event → activity type → branch → path → commit skip. Click a filter step's details to expand the declared patterns.</p>`,
    eventPathSections || '<p class="muted">No workflows found.</p>',
    "<h2>Workflow / Job DAG</h2>",
    `<p class="muted">Nodes are workflows and their jobs; edges are the <code>needs</code> relations shown on each job. Click a required check below to highlight its provider path here.</p>`,
    dagSections || '<p class="muted">No workflows found.</p>',
    "<h2>Required Checks</h2>",
    `<p id="highlight-note" class="muted">Click a row to highlight its provider workflow / job in the DAG above.</p>`,
    `<table><thead><tr><th>Context</th><th>Status</th><th>Provider</th><th>Will report?</th><th>Reason</th></tr></thead><tbody>${checkRows || '<tr><td colspan="5">No required checks declared.</td></tr>'}</tbody></table>`,
    "<h2>Witness</h2>",
    witnessSections,
    "<h2>Export</h2>",
    `<p><button type="button" id="download-json">Download canonical JSON</button> <button type="button" id="download-html">Download this HTML report</button></p>`,
    `<p class="muted">Tool version: <code>${escapeHtml(report.tool_version)}</code> — report schema <code>${escapeHtml(report.schema)}</code>. There is no auto-fix button: CheckPath never rewrites your workflows.</p>`,
    `<script type="application/json" id="checkpath-data">${embedded}</script>`,
    `<script>${SCRIPT}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
