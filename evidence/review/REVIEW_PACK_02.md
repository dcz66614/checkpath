# REVIEW_PACK_02 — Live-probe evidence for T013 round 2 (P0-1 / P1-1 re-verification)

Project: P020 CheckPath. Reviewer: T013 independent re-reviewer.
Candidate commit: `857e670aa1612567094f08d49241427df0a6add7` (HEAD verified).
Date: 2026-11-08. All probes use synthetic fixtures only, no network, no token.
Probe inputs were built from the frozen fixtures under `tests/fixtures/` (copied to
`/tmp/t013r2/probe/`); the shipped `dist/` was rebuilt from the candidate commit
(`npm run build`, exit 0) and was the binary under test. Source↔dist
correspondence: `git diff 857e670 -- src oracle scripts` = 0 lines, and
`dist/core/job-dag.js:343` carries the `unsupported_job` fix
(`unsupported_job: job.unsupported_job ?? null`).

## 1. P0-1 re-verification — matrix / reusable-workflow jobs (U-07 / U-08)

### 1.1 Frozen Oracle expectation (unchanged from R1)

| Fixture | Golden id | Job (Oracle) | Required check (Oracle) |
|---|---|---|---|
| `tests/fixtures/unsupported/U-07-matrix-job/` | G-79 | `test`: `UNKNOWN` / `unsupported_matrix` | `unit-tests`: `UNKNOWN` / `provider_unknown` |
| `tests/fixtures/unsupported/U-08-reusable-workflow-job/` | G-80 | `call-reusable`: `UNKNOWN` / `unsupported_reusable_workflow` | `unit-tests`: `UNKNOWN` / `provider_unknown` |

### 1.2 Probe commands (run fresh in this session)

```sh
# U-07
node dist/checkpath.mjs analyze --repo /tmp/t013r2/probe/u07/repo \
  --scenario /tmp/t013r2/probe/u07/scenario.json \
  --required-checks /tmp/t013r2/probe/u07/required-checks.yml \
  --out /tmp/t013r2/probe/u07/out
# U-08 — same shape with /tmp/t013r2/probe/u08/...
```

Probe inputs: `workflow.yml` copied to `repo/.github/workflows/ci.yml`,
`scenario.json` copied verbatim, `required-checks.json` converted JSON→YAML
(same entries; both fixtures declare `source: "github-actions"`).

### 1.3 Observed CLI output (verbatim)

U-07 (`probe-u07-cli.log`):

```text
scenario: G-79
event: pull_request/synchronize
workflows: 1 (1 triggered)
jobs: 1
required checks: 1 (UNKNOWN=1)
witnesses: 1
report_sha256: 59fb7bf4ddea3b5391ccc46a81e2a5c29e08469cef1271c0ab31ffc7386f5016
json: /tmp/t013r2/probe/u07/out/report.json
html: /tmp/t013r2/probe/u07/out/report.html
exit code: 2
```

U-08 (`probe-u08-cli.log`): identical shape, `scenario: G-80`,
`report_sha256: 4b9d167b806d0d73868d3f509c808da325776229ebb2f2947bc4d2279324ec46`,
`exit code: 2`.

### 1.4 Observed report contents (from `report.json`, `report` object)

U-07:

```json
"job_evaluations": [{"context": "unit-tests", "job_id": "test",
  "reason": "unsupported_matrix", "status": "UNKNOWN",
  "workflow_path": ".github/workflows/ci.yml"}]
"required_check_results": [{"context": "unit-tests", "provider_count": 1,
  "provider_job_id": "test", "provider_workflow_path": ".github/workflows/ci.yml",
  "reason": "provider_unknown", "status": "UNKNOWN"}]
"unsupported_features": []
```

U-08: same shape with `job_id: "call-reusable"`,
`reason: "unsupported_reusable_workflow"`. Both reports carry 1 witness
(`unsupported_feature` / `provider_unknown`). `unsupported_features` is
`[]` in both — unchanged, and identical to the frozen Oracle expected
(per FIX-P0-01 §3); the unsupported feature is named by the job reason
and the witness, not by that array.

### 1.5 Report-hash recomputation (independent, python3)

`report_sha256` = SHA-256 of canonical JSON (recursive sorted keys, `,`/`:` separators)
of the `report` object minus its own `report_sha256` field:

- U-07: recorded `59fb7bf4…` == recomputed `59fb7bf4ddea3b5391ccc46a81e2a5c29e08469cef1271c0ab31ffc7386f5016` ✓
- U-08: recorded `4b9d167b…` == recomputed `4b9d167b806d0d73868d3f509c808da325776229ebb2f2947bc4d2279324ec46` ✓

Both hashes are **byte-identical to the hashes reported by the FIX-P0-01
session** (and re-confirmed by FIX-P1-01 / FIX-P2) — the fix reproduces
exactly, with no drift across the three fix rounds.

### 1.6 Verdict on P0-1 (re-verification)

**CLOSED.** The shipped CLI now reports matrix / reusable-workflow jobs as
`UNKNOWN` with the ADR-04 reasons, the required check as `UNKNOWN` /
`provider_unknown`, exit code 2 (§4.7 UNKNOWN band). The false PASS is gone.
Job/check rows were additionally verified field-by-field against the frozen
G-79/G-80 `expected.json` (job_id/status/reason, check context/status/reason/
provider_count/provider_job_id) — equal.

## 2. P1-1 re-verification — duplicate-context manifest (T8-05 / G-57)

### 2.1 Probe command (run fresh in this session)

```sh
node dist/checkpath.mjs analyze --repo /tmp/t013r2/probe/t805/repo \
  --scenario /tmp/t013r2/probe/t805/scenario.json \
  --required-checks /tmp/t013r2/probe/t805/required-checks.yml \
  --out /tmp/t013r2/probe/t805/out
```

Manifest converted verbatim from `T8-05-external-source/required-checks.json`
to YAML (entry without `source` kept sourceless; `source: ""` preserved as
an empty string).

### 2.2 Observed CLI output (verbatim)

```text
scenario: T8-05
event: pull_request/synchronize
workflows: 1 (1 triggered)
jobs: 1
required checks: 5 (PENDING_NOT_REPORTED=1 REPORTABLE_PENDING=1 UNKNOWN=3)
witnesses: 4
report_sha256: 781098456ca6399183a89def05646893cd085165405219b7a26e3031f9674fbb
json: /tmp/t013r2/probe/t805/out/report.json
html: /tmp/t013r2/probe/t805/out/report.html
exit code: 2
```

### 2.3 Observed report contents vs frozen G-57 expected

Probe check rows (5, manifest order):

```json
[
  {"context": "unit-tests", "status": "REPORTABLE_PENDING", "reason": "provider_reportable", "provider_count": 1, "provider_job_id": "test"},
  {"context": "unit-tests", "status": "UNKNOWN", "reason": "external_source", "provider_count": 0, "provider_job_id": null},
  {"context": "ghost", "status": "UNKNOWN", "reason": "external_source", "provider_count": 0, "provider_job_id": null},
  {"context": "lint", "status": "PENDING_NOT_REPORTED", "reason": "no_provider", "provider_count": 0, "provider_job_id": null},
  {"context": "unit-tests", "status": "UNKNOWN", "reason": "external_source", "provider_count": 0, "provider_job_id": null}
]
```

Verified with python3 in this session: the five rows equal
`tests/fixtures/golden/G-57-t8-T8-05-external-source/expected.json`'s
`required_checks` **field-by-field** (context/status/reason/provider_count/
provider_job_id). Job row: `test` ELIGIBLE / `eligible` (verdict identical
to expected; `workflow_path` is `.github/workflows/ci.yml` in this probe
because the workflow was staged there, vs `"workflow": "workflow.yml"` in
the golden expected — a staging-path difference only, not a verdict
difference; the formal-pipeline test compares against the fixture's own
path and passes).

### 2.4 Report-hash recomputation (independent, python3)

- T8-05: recorded `78109845…` == recomputed `781098456ca6399183a89def05646893cd085165405219b7a26e3031f9674fbb` ✓
- The hash is **byte-identical to the hash reported by the FIX-P1-01
  session** (and re-confirmed by FIX-P2).

### 2.5 Verdict on P1-1 (re-verification)

**CLOSED.** The shipped CLI now accepts the duplicate-context manifest
(exit 2, full report) instead of rejecting it with exit 3 /
`duplicate_value`. The CLI can analyse its own golden fixture G-57
end-to-end, with per-entry resolution exactly as the frozen resolver /
Oracle semantics require.

## 3. P2-4 third-shape check (dup-name, probed live in this session)

The FIX-P2 README claims the TS side throws on "all three duplicate-key
shapes probed". This reviewer verified the third shape independently:

Input (`/tmp/t013r2/dup-name.yml`): top-level `name: a` followed by `name: b`,
`on: {push:}`, one job.

- TS (`dist/core/workflow-parser.js` `parseWorkflowYaml`): `{"status":
  "INVALID", "errors": ["yaml_parse_error"], ...}` — throws as claimed.
- Oracle (`python3 scripts/oracle-parse-probe.py --yaml … --fixture-id
  dup-name`): `{"status": "VALID", "errors": [], "events": [{"name":
  "push", ...}], ...}` — last-wins as claimed.

The behaviour claim is true; only the fixture/test lock for this third
shape is missing (see INDEPENDENT_REVIEW_R2.md §4 P2-R2-2).

## 4. Method note

Probes were run against `dist/` rebuilt by this review session from the
candidate commit's own sources (`npm run build`, exit 0).
Source↔dist correspondence was confirmed by `git diff 857e670 -- src oracle
scripts` (0 lines) plus the matching `unsupported_job` carry-through in
`dist/core/job-dag.js:343`. Probe inputs are the frozen fixtures themselves;
nothing was edited in the repo to produce these results. Probe artefacts
live only in `/tmp/t013r2/probe/` (scratch, not committed); the commands,
outputs and hashes above are the committed record. The R1 probe hashes
(`11f5523c…` / `d4b4cad7…`, the false-PASS reports) are superseded by the
post-fix hashes above.
