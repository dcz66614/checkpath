# P020 T013 — Task Report: Independent Review

- **Task:** T013 Independent Review (S5, est. 7h)
- **Reviewer:** independent reviewer, fresh session, isolated from T001–T012 builders; review only, no code fixed
- **Review object:** commit `1dadc0a91f2637107ff37274fe245f807d50ee55` (T012 PASS)
- **Date:** 2026-11-08
- **Verdict: NOT PASS — P0 1 / P1 1 / P2 10**

## 1. What was reviewed

- Specs read in full: `~/workspace/P020_PROJECT_BOOK.md`
  (SHA-256 `028c24720e0780542217719f6e9b14c0fe22b31b79c662520441c2116262b8de`, unchanged),
  `~/workspace/P020_IMPLEMENTATION_PLAN.md`
  (SHA-256 `bb645205174eca1d111687928c41505407392d0eefd1281455a776273aaa1e0e`, unchanged).
- All task reports T005–T012, `evidence/S0_GATE.json`, handoff TASK_REPORT.md /
  unresolved_items.md for T005–T012, and the four T011 ADR decisions.
- Source review: **59 files under `src/` + `oracle/` + `scripts/`, 14,240 lines,
  100% READ, 0 NOT_READ** — see `evidence/review/COVERAGE_MATRIX.csv`.
  Reviewed tree confirmed to match the candidate commit:
  `git diff 1dadc0a -- src oracle scripts` = 0 lines.
- Privacy/compliance, README-vs-CLI consistency, `dist/`-vs-source
  correspondence, report-hash recomputation, S0 gate re-computation.

## 2. Acceptance commands (personally run, logs in test_logs/)

| Command | Exit | Result |
|---|---|---|
| `npm ci` | 0 | Real run; 181 packages in 3 s (registry reachable) |
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | clean |
| `npm run test` | 0 | 29 files, 673/673 tests passed |
| `npm run test:oracle` | 0 | 80 fixtures, 0 mismatches, false PASS 0 (Oracle-side count), unsupported UNKNOWN 19/19 |
| `npm run test:e2e` | 0 | 8/8 passed |
| `npm run test:offline` | 0 | strace 0 network syscalls; static scan 31 files, 0 remote refs |
| `npm run release:verify` | 0 | 2-build determinism, smoke, hash recompute, offline scan 34 files, license guard PASS |
| `npm run s0:oracle` | 0 | 24/24, false PASS 0, unsupported UNKNOWN 2/2 |
| `npm run s0:gate` | 0 | 100 runs, 1 hash `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`; S0_GATE.json status PASS; hash independently recomputed — matches |

All ten acceptance commands pass. The verdict is NOT PASS because of the
graded product defects below, which the acceptance suite does not cover.

## 3. Findings

### P0-1 — matrix / reusable-workflow false PASS in the shipped product path

`src/core/job-dag.ts:455-472` (`evaluateJobsKeyed`) drops `unsupported_job`
when rebuilding jobs, so `evaluateJobs()` never sees it on the formal report
path (`buildReport` → `runFormalPipeline` → `evaluateJobsForTrigger` →
`evaluateJobsKeyed`). Live probe against shipped `dist/` (frozen fixtures,
synthetic only): U-07 matrix (G-79) → job `test` ELIGIBLE, check `unit-tests`
REPORTABLE_PENDING, exit 0, `report_sha256 11f5523c…`; U-08 reusable (G-80) →
job `call-reusable` ELIGIBLE, check REPORTABLE_PENDING, exit 0,
`report_sha256 d4b4cad7…`. Oracle requires UNKNOWN / `provider_unknown` in
both cases. Both probe report hashes independently recomputed — match.
Full evidence: `evidence/review/REVIEW_PACK_01.md` §1.

### P1-1 — CLI rejects duplicate-context manifests the resolver / Oracle accept

`src/core/validate.ts:621` rejects any repeated `context` (`duplicate_value`).
Live probe: CLI `analyze` with the T8-05 manifest (golden G-57) → validation
error, exit 3, no report. T008 locked per-entry resolution of duplicate
contexts; T005's duplicate-rejection contract was never reconciled with it.
Full evidence: `evidence/review/REVIEW_PACK_01.md` §2.

### P2-1 … P2-10

Stale comments (types.ts "PoC", e2e.ts "Known S0 limitation",
THIRD_PARTY_NOTICES.md "T001 skeleton"); duplicate React keys
(`key={row.context}`); untested duplicate-key YAML divergence (TS throws,
Oracle BaseLoader last-wins); `staticNetworkCheck` 11-file scope; README
stale perf numbers (560.5 ms / 100.0 MiB vs T012's 701.2 ms / 101.1 MiB) and
false semantic claims (matrix/`uses:` → UNKNOWN, duplicate → AMBIGUOUS);
`release:verify` smoke lacks matrix/`uses:`/duplicate cases; `falsePassCount`
computed from Oracle reports, not TS reports. See INDEPENDENT_REVIEW.md §3.

### Positive confirmations

- S0 gate re-computable from original fixtures (100 runs, 1 hash; S0_GATE.json
  hash independently recomputed — matches).
- Privacy/compliance: no network/telemetry/token/real data; offline proof
  re-run (0 syscalls); LICENSE still PENDING_SAM_DECISION; "MIT" appears only
  as npm-generated dependency metadata in `package-lock.json`.
- All four T011 ADRs verified as implemented — except ADR-04, which holds in
  the e2e/Oracle path only and is contradicted by the product path (P0-1).
- README commands match the real CLI; example paths exist; `dist/` matches
  source; report hashes re-computable (S0, demo, both probe reports).

## 4. Deliverables

- `evidence/review/INDEPENDENT_REVIEW.md` — full review report
- `REVIEW_INDEX.md` — review index (work-area root)
- `evidence/review/REVIEW_PACK_01.md` — live-probe evidence pack (P0-1, P1-1)
- `evidence/review/COVERAGE_MATRIX.csv` — 59 files, 100% READ, 0 NOT_READ
- `evidence/review/REVIEW_SHA256SUMS.txt` — review deliverable hashes
- `handoff/P020-T013/` — this handoff package

## 5. What was NOT done (per hard rules)

- No code, fixture, Oracle expectation or threshold was modified.
- No fix was attempted for any finding; fixes require a separate independent
  task session, followed by re-running affected tests and T013.
- Pre-existing working-tree drift (PERFORMANCE_REPORT.json/.md + 8 e2e
  trace.zip files modified after commit `1dadc0a`, untracked `reports/`) was
  left untouched and excluded from the T013 commit.

## 6. Unresolved items

See `unresolved_items.md`: P0-1, P1-1, P2-1…P2-10 (new); T012 U-01/U-02
carried forward; T012 U-03 closed by this review (`npm ci` exit 0).
