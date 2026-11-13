# T003 Report — Job / Required Check Semantics PoC (P020 CheckPath)

- **Task:** T003 (§6 of IMPLEMENTATION_PLAN.md), S0 gate
- **Base commit:** `e9e59f6cdae945c3052a1981e2761e94a2a4446e` (T001)
- **Date:** 2026-11-08
- **Status:** PASS — 12/12 fixtures match frozen expected results in both
  the TypeScript implementation and the independent Python Oracle.

## 1. Results per fixture (12/12)

| ID | Case | Job statuses | Required-check result |
|---|---|---|---|
| jc01-branch-skip | (a) workflow branch-filter skip | test: SKIPPED | unit-tests: PENDING_NOT_REPORTED |
| jc02-path-skip | (a) workflow path-filter skip | test: SKIPPED | unit-tests: PENDING_NOT_REPORTED |
| jc03-commit-skip | (a) workflow `[skip ci]` commit skip | test: SKIPPED | unit-tests: PENDING_NOT_REPORTED |
| jc04-if-false | (b) Job `if: false` | test: SKIPPED | unit-tests: SKIPPED_SUCCESS |
| jc05-needs-skipped-propagation | (c) upstream skipped, downstream default-skipped | build: SKIPPED, deploy: SKIPPED | build/deploy: SKIPPED_SUCCESS |
| jc06-always-overrides-skipped-needs | (d) `if: always() && github.event_name == 'pull_request'` with skipped upstream | build: SKIPPED, aggregate: ELIGIBLE | build: SKIPPED_SUCCESS, ci-ok: REPORTABLE_PENDING |
| jc07-no-provider | (e) required check has no provider job | test: ELIGIBLE | integration: PENDING_NOT_REPORTED |
| jc08-duplicate-context | (f) two jobs share context `tests` | test-a/b: ELIGIBLE | tests: AMBIGUOUS |
| jc09-unsupported-if | (g) `if: contains(...)` outside frozen subset | test: UNKNOWN | unit-tests: UNKNOWN |
| jc10-missing-need | (h) `needs: [nonexistent]` | deploy: INVALID | deploy: INVALID |
| jc11-needs-cycle | (h) `a needs b`, `b needs a` | a/b: INVALID | job-a: INVALID |
| jc12-conditional-after-needs | downstream of ELIGIBLE upstream, no `if` | build: ELIGIBLE, test: CONDITIONAL_AFTER_NEEDS | integration-tests: REPORTABLE_PENDING |

Workflow-level skip vs job-level skip are distinguished correctly in all
cases: workflow skip → `PENDING_NOT_REPORTED`; job skip → `SKIPPED_SUCCESS`.
No Job's real success/failure is predicted anywhere.

## 2. Acceptance commands (actually run)

| Command | Exit code | Log |
|---|---|---|
| `npm run s0:semantics` | 0 | `evidence/s0/logs/s0-semantics.log` — vitest 13 passed (12 cases + suite-shape check) |
| `python3 -m oracle.checkpath_oracle.cli --suite tests/fixtures/s0/job-check/suite.json` | 0 | `evidence/s0/logs/oracle-job-check.log` — summary total 12, passed 12, failed 0 |
| `npm run typecheck` (extra check) | 0 | `evidence/s0/logs/typecheck-t003.log` |

TS and Python agree field-for-field with the same frozen `expected`
values (12/12 each), which is the T003 parity evidence. Full Oracle
diffing across suites is T004's job.

## 3. Files changed (this commit only)

- `src/core/job-dag.ts` — PoC: needs DAG (missing/cycle/duplicate-id
  detection, INVALID propagation, topological order), frozen `if`-subset
  parser + Kleene three-valued evaluator, skip propagation, `always()`
  exception.
- `src/core/check-resolver.ts` — PoC: exact context match
  (`name`, else `job_id`), duplicate → AMBIGUOUS, status mapping per §4.5.
- `oracle/checkpath_oracle/evaluator.py` — independent Python
  implementation of the same semantics; reads raw fixture JSON only,
  never imports/calls TypeScript.
- `oracle/checkpath_oracle/cli.py` — minimal T003-scoped suite runner
  (see §5; the full Oracle CLI is T004's).
- `tests/fixtures/s0/job-check/suite.json` — 12 frozen fixtures;
  `expected` values were written before the implementations and never
  edited to fit them.
- `tests/unit/s0-semantics/job-check.test.ts` — vitest glue for
  `npm run s0:semantics`.
- `evidence/s0/T003_REPORT.md` (this file) + `evidence/s0/logs/`.

Nothing else was touched. In particular, no T002 files, no CLI/UI/report
templates, no release files, no spec files, no `package.json` scripts.
Spec hashes re-verified after the work:
`PROJECT_BOOK.md 028c2472…`, `IMPLEMENTATION_PLAN.md bb645205…`.

## 4. Frozen semantic decisions (PoC contract for T004)

1. **Trigger input (T002 interface assumption).** T002 had not delivered
   when T003 ran. Fixtures supply `workflow_triggered: boolean` plus
   `trigger_reason` directly, and a minimal `scenario`
   (`event_name`, `action`, `ref`, `base_ref`, `head_ref`). T004 should
   replace these fixture fields with T002's real trigger IR; the job/check
   layer only consumes the boolean.
2. **`if` subset lives in `job-dag.ts` for now.** `src/core/if-subset.ts`
   belongs to T007; T007 should extract the parser/evaluator there
   unchanged. `success()` is NOT in the frozen subset (§3.3) and yields
   UNKNOWN; the default needs gate implements the implicit `success()`
   precondition instead.
3. **Job status when the workflow did not trigger:** `SKIPPED` with
   reason `workflow_not_triggered`. The workflow/job distinction is
   carried at check level (`PENDING_NOT_REPORTED` vs `SKIPPED_SUCCESS`),
   not by inventing a new job status outside §4.4.
4. **Precedence per job:** structural INVALID (missing need / cycle /
   duplicate id / invalid need) > workflow-not-triggered > `if` FALSE →
   SKIPPED / unsupported or unresolvable `if` → UNKNOWN > needs gate
   (SKIPPED need → SKIPPED unless `if` contains `always()` → ELIGIBLE;
   UNKNOWN need → UNKNOWN; needs that will run → CONDITIONAL_AFTER_NEEDS,
   or ELIGIBLE when `always()` is present).
5. **Resolver precedence:** external source → UNKNOWN; zero providers →
   PENDING_NOT_REPORTED; >1 provider → AMBIGUOUS; provider INVALID →
   INVALID; workflow not triggered → PENDING_NOT_REPORTED; provider
   SKIPPED → SKIPPED_SUCCESS; provider UNKNOWN → UNKNOWN; otherwise
   REPORTABLE_PENDING. AMBIGUOUS is checked before the trigger test:
   a duplicate context is a matching defect independent of triggering.
6. **INVALID scope:** only the jobs in / depending on the broken part of
   the DAG are INVALID; independent jobs in the same workflow still
   evaluate normally. (No fixture exercises a mixed workflow; T004 may
   tighten this to whole-workflow INVALID if the spec is read that way.)

## 5. Notes / deviations

- **Oracle CLI:** `oracle/checkpath_oracle/cli.py` was a T001 placeholder
  raising `NotImplementedError` (the full CLI is T004's). The task
  instructed T003 to make the acceptance command runnable, so this file
  now contains a minimal suite runner: `--suite <path>`, JSON report on
  stdout, exit 0 only when all cases pass, 1 on any mismatch, 2 on
  usage/input error. It does not fake a pass.
- **Python environment:** system has `python3` only (no `python` alias)
  and PyYAML 6.0.1, while `oracle/requirements.lock.txt` pins 6.0.3 and
  `pip install` fails under PEP 668. The T003 evaluator uses only the
  Python standard library (no PyYAML import), so it runs on the stock
  `python3` + PyYAML 6.0.1 with no `--break-system-packages` and no
  install step. The 6.0.1-vs-6.0.3 deviation is inherited from T001 and
  is not resolved here.
- **Parallel T002 work:** T002's uncommitted changes (workflow-parser.ts,
  glob-subset.ts, oracle parser.py / glob_subset.py,
  tests/fixtures/s0/parser-trigger/, tests/unit/s0-parser/) were present
  in the shared worktree during this task and were NOT touched, staged,
  or committed by T003. At 13:19 GMT `npm run typecheck` briefly showed
  an error in T002's `workflow-parser.ts`; T002 fixed it in their own
  working tree afterwards and typecheck now passes (exit 0, log above).
- **Zero humans, zero network:** all inputs are synthetic fixtures in
  `tests/fixtures/s0/job-check/`; no network calls, tokens, or real
  repositories were used.

## 6. Unresolved items

- T002 trigger-IR handoff: when T002 lands, T004 must confirm the
  `workflow_triggered` / `trigger_reason` / `scenario` fields assumed in
  §4.1 match the real trigger IR, and re-point the fixtures if they differ.
- The §4.6 whole-workflow-INVALID question (§4.6 above) is a spec-reading
  decision for T004/T007, not settled by any T003 fixture.
- No license name was added anywhere (license still pending Sam's decision).
