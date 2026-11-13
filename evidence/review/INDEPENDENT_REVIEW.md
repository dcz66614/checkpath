# P020 CheckPath — T013 Independent Review

- **Reviewer:** T013 independent reviewer (fresh session, isolated from T001–T012 builders; review only, no code fixed)
- **Review object:** commit `1dadc0a91f2637107ff37274fe245f807d50ee55` ("T012: E2E/offline/performance/packaging rehearsal — PASS")
- **Date:** 2026-11-08
- **Verdict: NOT PASS — P0 1 / P1 1 / P2 10**

## 0. Verdict summary

| Grade | Count | Items |
|---|---|---|
| P0 (blocker — false PASS) | 1 | P0-1: matrix / reusable-workflow jobs reported `REPORTABLE_PENDING` by the shipped CLI |
| P1 (major) | 1 | P1-1: shipped CLI rejects duplicate-context manifests the frozen resolver / Oracle accept |
| P2 (minor) | 10 | P2-1 … P2-10 (stale comments/docs, untested divergences, test/gate scope gaps) |

Pass standard (plan §10) requires P0 = 0 and P1 = 0. **The candidate does not pass.**
Per the hard rules, this report records the issues and stops; no fix was
attempted, no code, fixture, Oracle expectation or threshold was modified.
Fixes require a separate independent task session, followed by re-running the
affected tests and T013.

The two graded defects were both **confirmed by live probes against the
shipped `dist/`** (see `REVIEW_PACK_01.md` for full probe evidence), not by
code reading alone. Notably, every acceptance command below passes (exit 0)
— the existing test suite is green while the shipped product contains a
false PASS. That is itself a finding: the differential test harness never
exercises the formal report pipeline (`buildReport` / `runFormalPipeline`)
on a matrix / `uses:` fixture, and the golden gate's `falsePassCount` is
computed from Oracle reports, not from TS reports.

## 1. Method

1. Read the specs in full: `~/workspace/P020_PROJECT_BOOK.md`
   (SHA-256 `028c24720e0780542217719f6e9b14c0fe22b31b79c662520441c2116262b8de` —
   unchanged), `~/workspace/P020_IMPLEMENTATION_PLAN.md`
   (SHA-256 `bb645205174eca1d111687928c41505407392d0eefd1281455a776273aaa1e0e` —
   unchanged), T013 card and §10 risk grading.
2. Read all task reports `evidence/tests/T005_REPORT.md` … `T012_REPORT.md`,
   `evidence/S0_GATE.json`, `handoff/P020-T005/` … `P020-T012/` TASK_REPORT.md
   and `unresolved_items.md`, and the four T011 ADR decisions
   (T011_REPORT.md §2).
3. Read **every** source file under `src/`, `oracle/`, `scripts/` — 59 files,
   14,240 lines, 100% READ, 0 NOT_READ (see `COVERAGE_MATRIX.csv`).
   Confirmed the reviewed tree matches the candidate commit:
   `git rev-parse HEAD` = `1dadc0a91f2637107ff37274fe245f807d50ee55`;
   `git diff 1dadc0a -- src oracle scripts` = 0 lines.
4. Ran all acceptance commands personally and logged exit codes
   (logs in `handoff/P020-T013/test_logs/`).
5. Re-ran the S0 gate from the original fixtures; independently recomputed
   `S0_GATE.json`'s `gate_report_sha256` and the probe reports'
   `report_sha256`.
6. Ran three fresh live probes against the shipped `dist/checkpath.mjs`
   (synthetic fixtures only): U-07 matrix, U-08 reusable workflow, T8-05
   duplicate-context manifest. Full evidence in `REVIEW_PACK_01.md`.
7. Privacy/compliance greps over `src/`, `oracle/`, `scripts/`; license audit;
   README-vs-CLI consistency check; `dist/`-vs-source correspondence check.

### Working-tree note (pre-existing, not part of the candidate commit)

At task start the tree already had 10 modified files (timestamps 2026-11-08
16:35–16:36, after the 16:35:06 commit): `evidence/tests/PERFORMANCE_REPORT.json`,
`PERFORMANCE_REPORT.md`, and 8 `evidence/tests/e2e-output/*/trace.zip` files,
plus untracked `reports/`. The PERFORMANCE_REPORT diff is timing variance
(P95 701.2 ms → 654.7 ms, peak RSS 101.1 MiB → 99 MiB on re-run). These files
were **not** included in the T013 commit and are not graded against commit
`1dadc0a`; they are recorded here so the next session is not surprised by them.

## 2. Acceptance commands (personally run, exit codes)

| Command | Exit | Result (detail) |
|---|---|---|
| `npm ci` | 0 | Real run (registry reachable); 181 packages added in 3 s. Log `test_logs/npm-ci.log`. |
| `npm run typecheck` | 0 | `tsc --noEmit`, clean. |
| `npm run lint` | 0 | `eslint src tests scripts`, clean. |
| `npm run test` | 0 | 29 test files, **673/673 tests passed**. |
| `npm run test:oracle` | 0 | Golden 80 fixtures, **0 mismatches**; `false PASS: 0` (Oracle-side count — see P2-10); unsupported surfaced as UNKNOWN 19/19. |
| `npm run test:e2e` | 0 | Playwright **8/8 passed**. |
| `npm run test:offline` | 0 | `unshare -rn` CLI run + **strace: 0 network syscalls** in whole process tree; static scan 31 files, 0 remote references. |
| `npm run release:verify` | 0 | 2-build determinism, CLI smoke (demo 2 / analyze docs-only 2 / analyze src-only 0 / matrix 2), `report_sha256` recompute OK, offline scan 34 files 0 remote refs, license guard PASS. |
| `npm run s0:oracle` | 0 | S0 Oracle 24/24, false PASS 0, unsupported UNKNOWN 2/2. |
| `npm run s0:gate` | 0 | 100 iterations, 1 hash `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`; `evidence/S0_GATE.json` status PASS. Hash **independently recomputed** from the file (canonical JSON minus the hash field) — matches. |

All ten commands pass. The verdict is NOT PASS because of the graded product
defects in §3, which the acceptance suite does not cover — not because any
acceptance command failed.

## 3. Graded issues

### P0-1 — ADR-04 matrix / reusable false PASS survives in the shipped product path (false PASS)

- **Severity:** P0 (plan §10: false PASS — a required check wrongly reported as reportable).
- **Location:** `src/core/job-dag.ts:455-472` (`evaluateJobsKeyed`), reached via
  `src/report/build.ts` `buildReport()` → `src/core/witness-reducer.ts`
  `runFormalPipeline()` → `evaluateJobsForTrigger()` → `evaluateJobsKeyed()`.
- **Defect:** `evaluateJobsKeyed` rebuilds each job as `{id, name, needs, if}`,
  **dropping `unsupported_job`**. `evaluateJobs()` therefore never sees it in
  this path, although it handles it correctly at `job-dag.ts:319`
  (`reusable_workflow`) and `:327` (`matrix`). `src/core/workflow-ir.ts:117`
  correctly propagates `unsupported_job` into IR jobs; the drop happens only
  in `evaluateJobsKeyed`. The UI worker (`src/worker/analysis.worker.ts`)
  also calls `buildReport`, so the in-browser path is affected too.
- **Live probe (synthetic fixtures, fresh re-run in this session):**
  - U-07 matrix (`tests/fixtures/unsupported/U-07-matrix-job/`, golden G-79):
    CLI `analyze` → job `test` `ELIGIBLE`/`eligible`, check `unit-tests`
    **`REPORTABLE_PENDING`**, exit **0**, `report_sha256 11f5523c…`,
    `unsupported_features: []`, witnesses 0. Frozen Oracle expected: job
    `UNKNOWN`/`unsupported_matrix`, check `UNKNOWN`/`provider_unknown`.
  - U-08 reusable (`tests/fixtures/unsupported/U-08-reusable-workflow-job/`,
    golden G-80): job `call-reusable` `ELIGIBLE`, check `REPORTABLE_PENDING`,
    exit 0, `report_sha256 d4b4cad7…`. Expected: job
    `UNKNOWN`/`unsupported_reusable_workflow`, check `UNKNOWN`/`provider_unknown`.
  - Both probe reports' `report_sha256` were independently recomputed
    (canonical JSON minus own field) and match — the reports are internally
    consistent; the verdict itself is wrong.
  - Both hashes are byte-identical to the first probe run earlier in this
    review session (deterministic reproduction).
- **Why tests missed it:** every differential test (golden 80, property 1000,
  S0 24, trigger/jobs/checks/witness diffs) exercises `evaluateE2E()` in
  `src/core/e2e.ts`, whose `extractJobs()` (`e2e.ts:275`) includes
  `unsupported_job`; the ADR-04 unit test calls `evaluateJobs` directly with
  the field set. No test or script ever runs `buildReport`/`runFormalPipeline`
  on a matrix/`uses:` fixture and compares with the Oracle. `dist/` carries
  the identical mapping (`dist/core/job-dag.js`), so the shipped artifact is
  defective, not just the source.
- **Impact:** a merge gate relying on CheckPath would see a required check
  backed by a matrix or reusable-workflow job as "will be reported" (exit 0)
  when its reportability is in fact UNKNOWN. README promises the opposite
  (§"Supported semantics": matrix/`uses:` expansion → UNKNOWN, "The report
  always names the unsupported feature") — the product contradicts its own
  documented contract.
- **Fix direction (for the separate fix session, not done here):** carry
  `unsupported_job` through `evaluateJobsKeyed` into `evaluateJobs`
  (and add a formal-pipeline differential test that runs `buildReport` on
  U-07/U-08 and compares with the Oracle, plus a `release:verify` smoke case).
  Full probe evidence: `REVIEW_PACK_01.md` §1.

### P1-1 — Shipped CLI rejects manifests the frozen resolver / Oracle semantics accept

- **Severity:** P1 (major: shipped CLI rejects valid-by-Oracle inputs; fail-closed, not a false PASS).
- **Location:** `src/cli/commands/common.ts` `loadRequiredChecks()` →
  `src/core/validate.ts:621` `validateRequiredChecks()` rejects any repeated
  `context` with `duplicate_value`.
- **Conflict:** T008 resolver tests lock per-entry resolution of duplicate
  contexts (T8-05: same context `unit-tests` ×3 with sources `github-actions` /
  `external-app` / `""`, plus `ghost`; T8-10: same context ×3 identical → three
  identical `REPORTABLE_PENDING` rows). Oracle accepts them; the checks-suite
  loader reads manifests directly without validation. T005 documented duplicate
  rejection as a contract decision, contradicting the later T008 resolver
  semantics; the two decisions were never reconciled.
- **Live probe (fresh re-run in this session):** CLI `analyze` with the T8-05
  manifest (converted verbatim to YAML) →
  `error: required-checks file failed validation … $.required_checks[1].context: duplicate_value … [4] …`,
  **exit 3**, no report. The CLI cannot analyse the project's own golden
  fixture G-57 end-to-end (G-57 is the copy of T8-05 in the golden suite).
- **Fix direction (separate session):** reconcile the contract — either the
  validator must admit duplicate contexts (matching the resolver) or the
  resolver/tests must be changed to match the validator, with an ADR; either
  way the CLI, the resolver, the golden fixtures and README must agree.
  Full probe evidence: `REVIEW_PACK_01.md` §2.

### P2 issues

| # | Issue | Location / evidence |
|---|---|---|
| P2-1 | Stale header comment: JobStatus/CheckStatus "also defined locally in job-dag.ts (PoC)" — T007/T008 re-based them onto `types.ts`. | `src/core/types.ts` |
| P2-2 | Stale header comment: "Known S0 limitation" (same job_id across workflows not distinguished) — the keyed API now exists, though `e2e.ts` still uses the unkeyed path. This two-pipeline divergence is the root context of P0-1. | `src/core/e2e.ts` |
| P2-3 | `key={row.context}` — duplicate-context manifests (a tested case, T8-05/T8-10) produce duplicate React keys. | `src/ui/RequiredCheckTable.tsx` |
| P2-4 | Duplicate-key YAML divergence untested (adversarial): TS `yaml` `parse()` throws → `yaml_parse_error`/INVALID; Python BaseLoader silently last-wins → Oracle proceeds. No fixture covers it. | `src/core/workflow-parser.ts` vs `oracle/checkpath_oracle/parser.py` |
| P2-5 | `staticNetworkCheck()` greps only 11 files (core e2e/parser/glob/job-dag/check-resolver + Oracle files); it does not cover `src/report/*`, `src/cli/*`, `src/ui/*`, `src/worker/*`, or `scripts/*` — gate condition c8's scope is narrower than "no network calls" reads. (No network call was found anywhere by this reviewer's own grep; this is a gate-coverage gap, not a found call.) | `scripts/oracle-diff.mjs` |
| P2-6 | `THIRD_PARTY_NOTICES.md` still headed "T001 skeleton" (content lists dependencies; header stale). | `THIRD_PARTY_NOTICES.md` |
| P2-7 | README perf numbers stale: README claims "P95 560.5 ms, peak RSS 100.0 MiB", but the T012 report it cites records P95 701.2 ms / 101.1 MiB, and this review's re-run measured 654.7 ms / 99 MiB. | `README.md` vs `evidence/tests/T012_REPORT.md` |
| P2-8 | README §"Supported semantics" claims matrix/`uses:` → UNKNOWN and duplicate context → `AMBIGUOUS`; neither holds in the shipped CLI (consequences of P0-1 and P1-1, recorded here as the documentation defect). | `README.md` |
| P2-9 | `release:verify` CLI smoke covers only demo / docs-only / src-only / matrix — no matrix/`uses:` or duplicate-manifest case, so neither P0-1 nor P1-1 could have been caught by the release gate. | `scripts/release-verify.mjs` |
| P2-10 | `scripts/oracle-diff.mjs` `falsePassCount()` is computed from **Oracle reports** vs expected, not from TS reports — the formal pipeline's false PASS is invisible to the golden gate (this is how P0-1 passed a green suite). | `scripts/oracle-diff.mjs` |

## 4. Itemised conclusions by review area

### 4.1 Source review — 59/59 files READ, 0 NOT_READ

Coverage matrix: `evidence/review/COVERAGE_MATRIX.csv` (59 files, 14,240
lines, every file marked READ with a reviewer note). NOT_READ list: **none**.
Key source matches the release candidate commit (HEAD `1dadc0a`, zero diff
in `src/`, `oracle/`, `scripts/`).

Verified mirrors between TS and Oracle (no divergences found except the
items above): glob-subset (ordered `!`, `/**` dir-self, `**/` zero dirs,
unsupported `{a,b}`/`(`/`)`/`\`/POSIX/`***`/empty`); if-subset (Kleene
three-valued logic, `always()` waives needs precondition incl. under
`!`/comparisons, bare context/string → UNKNOWN, `==`/`!=` only same-type
known values); job-dag precedence (structural INVALID > workflow-not-triggered
SKIPPED > `if` FALSE/unsupported > needs gate; Kahn topo with input-order
tie-break; `(workflow, job_id)` key JSON-encoded); event-evaluator precedence
(event → activity → branch → path/diff → commit skip; PR base_branch, push
branch, merge_group target_branch; always-run on diff timeout or push >1000
commits; >3000 files + unconfirmed first-3000 → UNKNOWN); check-resolver
10-level precedence (exact case-sensitive context match, name shadows job_id);
witness-reducer (fixed 4-step reduction, strong reproduction predicate,
9 kinds incl. `event_trigger_missing` R-EV-01 vs `merge_group_missing` R-MG-01);
report hash contract (`workflow_set_sha256`/`required_checks_sha256`/
`input_sha256` over canonical JSON, `report_sha256` = canonical report minus
its own field; builder self-validates); HTML report escaping (`escapeHtml`,
no remote resources); exit codes per PROJECT_BOOK §4.7.

### 4.2 Tests & Oracle — evidence re-checked, but the parity claim is narrower than it reads

- Golden 80/80, property 1000/1000 (seed 20261108), mutation 12 cases
  (13 tests incl. the existence test) — re-run green in this session as part
  of `npm test` (673/673) and `test:oracle` (0 mismatches).
- S0 gate re-computable from original fixtures: `s0:gate` exit 0 (100 runs,
  1 hash `f511a847…`); `S0_GATE.json` status PASS and its hash independently
  recomputed — matches. S0 Oracle 24/24, false PASS 0.
- **However:** "Oracle parity 100%, false PASS 0" as reported by the suite
  covers only the `evaluateE2E` path and Oracle-side counts. The shipped
  product path (`buildReport`) diverges from the Oracle on the two frozen
  unsupported fixtures G-79/G-80 (P0-1) — so product-level Oracle parity is
  **not** 100% and product-level false PASS is **not** 0. The pass standard
  fails on this ground as well as on P0/P1 counts.

### 4.3 Privacy & compliance — PASS (no findings)

- Grep over `src/`, `oracle/`, `scripts/`: no network calls in product code
  (only the pattern tables as string literals inside `scripts/oracle-diff.mjs`
  and `scripts/release-verify.mjs`); no tokens/secrets (`ghp_` / api key /
  password etc. — only the word "secrets" in an if-subset comment listing
  unsupported contexts); no telemetry; synthetic data only throughout
  (fixtures, demo, perf input, probes).
- Offline proof re-run in this session: `test:offline` exit 0, strace
  0 network syscalls, static scan 0 remote references.
- License: no `LICENSE` file; `package.json` has no `license` field;
  `LICENSE_STATUS.md` still reads `PENDING_SAM_DECISION`. The word "MIT"
  (and other license names) appears **only** as npm-generated third-party
  dependency metadata in `package-lock.json` (231 packages carry a `license`
  field) — not a project license selection; checked and explained, not a
  violation. `release:verify` license guard also passes.

### 4.4 Delivery review — mixed

- README commands verified against the real CLI: `demo` / `analyze` /
  `matrix` exist with the documented flags; example paths exist
  (`examples/scenarios/pr-docs-only.json`, `examples/required-checks.yml`,
  `examples/suites/merge-queue.json`, `examples/repo-basic/.github/workflows/ci.yml`);
  exit-code table matches PROJECT_BOOK §4.7. **But** README's semantic
  claims are false for the shipped CLI (P2-8) and its perf numbers are stale
  (P2-7).
- `dist/` corresponds to source: `git diff 1dadc0a -- src oracle scripts`
  = 0 lines; `dist/core/job-dag.js` contains the same `evaluateJobsKeyed`
  mapping as the source (which is also how P0-1 was confirmed in the shipped
  artifact). `release:verify` 2-build determinism passed (dist tree hash
  `f4464038…` across 2 builds per T012).
- Report hashes re-computable: S0 gate hash ✓; demo report hash ✓ (via
  `release:verify`); both probe reports ✓ (see `REVIEW_PACK_01.md` §1.5).

### 4.5 Prior ADRs — all four T011 decisions verified as implemented

- ADR T011/T008-U01 (empty event value `on: {pull_request:}` — Oracle folds
  `''` to None, VALID): implemented in `oracle/checkpath_oracle/parser.py`;
  trigger suite 41 cases incl. T6-16; no mismatch. CLOSED, holds.
- ADR T011/T009-U01 (new WitnessKind `event_trigger_missing`, rule R-EV-01):
  implemented both sides; witness diff 44/44. CLOSED, holds.
- ADR T011/T006-U03 (`complete: false` does not participate in verdicts):
  confirmed — `complete`/`returned_files` not consulted in
  `event-evaluator.ts`. CLOSED, holds.
- ADR T011/ADR-04 (matrix / reusable-workflow jobs were false PASS — fix:
  UNKNOWN with reasons `unsupported_matrix` / `unsupported_reusable_workflow`):
  **implemented in the e2e/Oracle path only; NOT in the shipped product path
  (P0-1).** The ADR is therefore not fully landed. CLOSED in T011's records,
  but the product behaviour contradicts it.

## 5. NOT_READ list

None. All 59 source files under `src/`, `oracle/`, `scripts/` were read in
full. (Test files and fixtures were spot-checked as evidence, not line-by-line
reviewed; that was not in the T013 scope's 100%-coverage requirement, which
covers `src/` + `oracle/` + `scripts/`.)

## 6. Unresolved / carried-forward items

- **New (this review):** P0-1, P1-1, P2-1 … P2-10 (see §3). Fixes require a
  separate independent task session; after the fix, re-run the affected tests
  and T013.
- **Carried forward from T012:**
  - U-01 Windows PowerShell Quick Start NOT_TESTED — still open (no Windows
    machine on this VM).
  - U-02 `dist.zip` `node checkpath.mjs demo` not end-to-end verified — still
    open, for T014.
  - U-03 README `npm ci` not re-run in T012 — **CLOSED by this review**
    (`npm ci` exit 0, real run, 181 packages).
- Pre-existing working-tree drift (PERFORMANCE_REPORT + 8 trace.zip files
  modified after commit `1dadc0a`, untracked `reports/`) — left untouched,
  excluded from the T013 commit; the next session should decide whether to
  commit or restore them.

## 7. Evidence paths

- This report: `evidence/review/INDEPENDENT_REVIEW.md`
- Review index: `REVIEW_INDEX.md` (work-area root)
- Probe evidence pack: `evidence/review/REVIEW_PACK_01.md`
- Coverage matrix: `evidence/review/COVERAGE_MATRIX.csv`
- Review hashes: `evidence/review/REVIEW_SHA256SUMS.txt`
- Handoff package: `handoff/P020-T013/` (TASK_REPORT.md, changed_files.txt,
  test_commands.txt, test_logs/, sha256.txt, unresolved_items.md)
- Acceptance-command logs: `handoff/P020-T013/test_logs/` (also `/tmp/t013/logs/`)
- Probe scratch (not committed): `/tmp/t013/fresh/` (inputs + outputs + logs),
  `/tmp/t013/probe/` (first probe run)
