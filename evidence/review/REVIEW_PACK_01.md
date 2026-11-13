# REVIEW_PACK_01 — Live-probe evidence for P0-1 and P1-1 (T013)

Project: P020 CheckPath. Reviewer: T013 independent reviewer.
Candidate commit: `1dadc0a91f2637107ff37274fe245f807d50ee55` (HEAD verified).
Date: 2026-11-08. All probes use synthetic fixtures only, no network, no token.
Probe inputs were built from the frozen fixtures under `tests/fixtures/` (copied to
`/tmp/t013/fresh/`); the shipped `dist/` (built from the candidate commit sources)
was the binary under test. `dist/` was verified to correspond to source:
`git diff 1dadc0a -- src oracle scripts` = 0 lines, and `dist/core/job-dag.js`
contains the same `evaluateJobsKeyed` mapping as `src/core/job-dag.ts` (see §3).

## 1. P0-1 — matrix / reusable-workflow jobs reported REPORTABLE_PENDING by the shipped CLI

### 1.1 Frozen Oracle expectation (the ground truth)

| Fixture | Golden id | Job (Oracle) | Required check (Oracle) |
|---|---|---|---|
| `tests/fixtures/unsupported/U-07-matrix-job/` | G-79 | `test`: `UNKNOWN` / `unsupported_matrix` | `unit-tests`: `UNKNOWN` / `provider_unknown` |
| `tests/fixtures/unsupported/U-08-reusable-workflow-job/` | G-80 | `call-reusable`: `UNKNOWN` / `unsupported_reusable_workflow` | `unit-tests`: `UNKNOWN` / `provider_unknown` |

Source: each fixture's `expected.json` (generated from the Reference Oracle by
`scripts/build-golden.py` / `scripts/property-oracle-dump.py`, frozen).

### 1.2 Probe commands (re-run fresh in this session)

```sh
# U-07
node dist/checkpath.mjs analyze --repo /tmp/t013/fresh/u07/repo \
  --scenario /tmp/t013/fresh/u07/scenario.json \
  --required-checks /tmp/t013/fresh/u07/required-checks.yml \
  --out /tmp/t013/fresh/u07/out
# U-08 — same shape with /tmp/t013/fresh/u08/...
```

Probe inputs: `workflow.yml` copied to `repo/.github/workflows/ci.yml`,
`scenario.json` and `required-checks.json` copied verbatim (required-checks
converted JSON→YAML, same entries).

### 1.3 Observed CLI output (verbatim, both cases)

U-07 (`u07` log):

```text
scenario: G-79
event: pull_request/synchronize
workflows: 1 (1 triggered)
jobs: 1
required checks: 1 (REPORTABLE_PENDING=1)
witnesses: 0
report_sha256: 11f5523cb5e2164651da5289ee7a6e34074a451aa7d10c2589e47fad05a18cbd
json: /tmp/t013/fresh/u07/out/report.json
html: /tmp/t013/fresh/u07/out/report.html
exit code: 0
```

U-08 (`u08` log): identical shape, `scenario: G-80`,
`report_sha256: d4b4cad7339a929b625395220c2e37176cd5a6077e7d12fdbd3ca4c183983a33`,
`exit code: 0`. Both hashes are byte-identical to the first probe run earlier
in this review session (deterministic reproduction).

### 1.4 Observed report contents (from `report.json`, `report` object)

U-07:

```json
"job_evaluations": [{"context": "unit-tests", "job_id": "test",
  "reason": "eligible", "status": "ELIGIBLE",
  "workflow_path": ".github/workflows/ci.yml"}]
"required_check_results": [{"context": "unit-tests", "provider_count": 1,
  "provider_job_id": "test", "provider_workflow_path": ".github/workflows/ci.yml",
  "reason": "provider_reportable", "status": "REPORTABLE_PENDING"}]
"unsupported_features": []
```

U-08: same shape with `job_id: "call-reusable"`. `unsupported_features` is `[]`
in both — the product does not even name the unsupported feature, although
README §"Supported semantics" promises "The report always names the
unsupported feature."

### 1.5 Report-hash recomputation (independent, python3)

`report_sha256` = SHA-256 of canonical JSON (recursive sorted keys, `,`/`:` separators)
of the `report` object minus its own `report_sha256` field:

- U-07: recorded `11f5523c…` == recomputed `11f5523cb5e2164651da5289ee7a6e34074a451aa7d10c2589e47fad05a18cbd` ✓
- U-08: recorded `d4b4cad7…` == recomputed `d4b4cad7339a929b625395220c2e37176cd5a6077e7d12fdbd3ca4c183983a33` ✓

The reports are internally consistent — the defect is in the verdict, not in the hashing.

### 1.6 Verdict on P0-1

The shipped CLI reports a required check backed by a `strategy.matrix` job
(resp. a reusable-workflow `uses:` job) as `REPORTABLE_PENDING` with exit code 0,
i.e. "will be reported", while the frozen Oracle semantics (and README, and the
ADR-04 fix intent) require `UNKNOWN` / `provider_unknown`. This is a false PASS
(§10 P0: wrongly reporting a required check as reportable). The check would
silently pass a merge gate that should have been flagged UNKNOWN.

### 1.7 Root cause (source chain, all read in full)

1. `src/core/workflow-ir.ts:117` correctly propagates `unsupported_job` into IR jobs.
2. `src/core/witness-reducer.ts` `runFormalPipeline()` → `evaluateJobsForTrigger()`
   → `evaluateJobsKeyed()` (`src/core/job-dag.ts:455-472`).
3. `evaluateJobsKeyed` rebuilds each job as `{id, name, needs, if}` — **`unsupported_job`
   is dropped**. `evaluateJobs()` therefore never sees it in this path, although
   it handles it correctly at `job-dag.ts:319` (`reusable_workflow`) and `:327` (`matrix`).
4. `src/report/build.ts` `buildReport()` uses `runFormalPipeline()`; the UI worker
   (`src/worker/analysis.worker.ts`) also calls `buildReport`, so the in-browser
   path is affected too.
5. `dist/core/job-dag.js` contains the identical mapping — the shipped artifact
   carries the defect.

### 1.8 Why every existing test missed it

- Golden (80), property (1,000), S0 (24), and the trigger/jobs/checks/witness
  diffs all exercise `evaluateE2E()` in `src/core/e2e.ts`, whose `extractJobs()`
  (`e2e.ts:275`) includes `unsupported_job`.
- The ADR-04 unit test (`tests/unit/job-dag/unsupported-job.test.ts`) calls
  `evaluateJobs` directly with the field set.
- No test or script ever runs `buildReport` / `runFormalPipeline` on a
  matrix / `uses:` fixture and compares with the Oracle.
- `scripts/oracle-diff.mjs` `falsePassCount()` is computed from **Oracle reports**
  vs expected, not from TS reports — so the formal pipeline's false PASS is
  invisible to the golden gate. (The "unsupported surfaced as UNKNOWN: 19/19"
  line in `test:oracle` output counts Oracle-side fixtures, not product behaviour.)

## 2. P1-1 — shipped CLI rejects manifests the frozen resolver / Oracle accept

### 2.1 Frozen semantics

- T8-05 (`tests/fixtures/checks/T8-05-external-source/`, golden G-57): same context
  `unit-tests` ×3 with sources `github-actions` / `external-app` / `""`, plus
  `ghost` and `lint`. The T008 resolver test locks per-entry resolution
  (three `REPORTABLE_PENDING` rows for the three `unit-tests` entries).
- T8-10: same context ×3 identical → three identical rows.
- Oracle accepts these manifests; the checks-suite loader reads manifests
  directly without validation.

### 2.2 Probe command (re-run fresh in this session)

```sh
node dist/checkpath.mjs analyze --repo /tmp/t013/fresh/t805/repo \
  --scenario /tmp/t013/fresh/t805/scenario.json \
  --required-checks /tmp/t013/fresh/t805/required-checks.yml \
  --out /tmp/t013/fresh/t805/out
```

Manifest converted verbatim from `T8-05-external-source/required-checks.json`
to YAML (entry without `source` kept sourceless).

### 2.3 Observed CLI output (verbatim)

```text
error: required-checks file failed validation (/tmp/t013/fresh/t805/required-checks.yml):
$.required_checks[1].context: duplicate_value: duplicate required check context "unit-tests",$.required_checks[4].context: duplicate_value: duplicate required check context "unit-tests"
```

Exit code: **3**. No report is written.

### 2.4 Verdict on P1-1

The shipped CLI cannot analyse the project's own golden fixture G-57
(T8-05) end-to-end: a manifest the frozen resolver semantics accept is
rejected at the CLI validation layer (`src/cli/commands/common.ts`
`loadRequiredChecks()` → `src/core/validate.ts:621` `validateRequiredChecks()`
`duplicate_value` on any repeated `context`). T005 documented duplicate
rejection as a contract decision; T008 later locked per-entry resolution of
duplicate contexts. The two decisions were never reconciled. Classification
P1 (major: shipped CLI rejects valid-by-Oracle inputs; fail-closed rejection,
not a false PASS).

### 2.5 Consequence for README

README §"Supported semantics" states "duplicate context → `AMBIGUOUS`".
In the shipped CLI, a duplicate-context manifest never reaches the resolver:
it is rejected with exit 3. The README documents semantics the CLI does not
implement (see INDEPENDENT_REVIEW.md §P2-7 for the related README staleness
items).

## 3. Method note

Probes were run against `dist/` built by the candidate commit's own build
(`npm run build` is part of `release:verify`, which passed). Source↔dist
correspondence was confirmed by `git diff 1dadc0a -- src oracle scripts`
(0 lines) plus the matching `evaluateJobsKeyed` body in `dist/core/job-dag.js`.
Probe inputs are the frozen fixtures themselves; nothing was edited in the
repo to produce these results. Probe artefacts live only in `/tmp/t013/fresh/`
(scratch, not committed); the commands, outputs and hashes above are the
committed record.
