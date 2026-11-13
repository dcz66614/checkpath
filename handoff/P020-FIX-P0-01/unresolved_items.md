# P020 FIX-P0-01 — Unresolved items

## New (this fix — none blocking P0-1)

None. P0-1 is fixed and verified (see TASK_REPORT.md §3–§4).

## Carried forward (not in this task's scope — separate independent tasks)

### P1-1 — CLI rejects duplicate-context manifests the resolver / Oracle accept

- `src/core/validate.ts:621`: `duplicate_value` on any repeated `context`.
- CLI `analyze` with the T8-05 manifest (golden G-57) exits 3 with no report.
- Needs an ADR reconciling the T005 validator contract with the T008 resolver
  semantics. Evidence: `evidence/review/REVIEW_PACK_01.md` §2.
- Note: the new formal-pipeline test deliberately bypasses that validator
  (ADR FIX-P0-01/04); the bypass must be revisited when P1-1 is fixed —
  if the validator is changed to admit duplicate contexts, the test can
  route through it; if the resolver is changed instead, the G-57
  expectations in the formal test must be re-checked.

### P2-1, P2-3, P2-4, P2-5, P2-6, P2-7, P2-8 (remainder)

- Untouched by this fix, per the task's hard rules. See
  `evidence/review/INDEPENDENT_REVIEW.md` §3. P2-8's matrix/`uses:` claim
  in README is now true as a consequence of this fix (see TASK_REPORT.md
  §3); its duplicate-context half still belongs to P1-1. P2-2's stale
  comment is handled (division of labour + two-path lock test); P2-9 is
  partly handled (matrix/`uses:` smoke added; a duplicate-manifest smoke
  case still belongs to P1-1's fix); P2-10 is handled (TS formal-side
  false-pass count + gate c6).

## Carried forward from T012/T013

### U-01 — Windows PowerShell Quick Start: NOT_TESTED

- README PowerShell Quick Start has not been executed on Windows (no Windows
  machine on this VM). Still open.

### U-02 — `dist.zip` `node checkpath.mjs demo` not end-to-end verified

- Still open, for T014.

## Working-tree note (not a graded item)

- Pre-existing untracked `reports/` directory (present before this task
  started) left untouched and excluded from the commit.
- Test-run-regenerated evidence files (`evidence/tests/PERFORMANCE_REPORT.*`,
  `evidence/tests/RELEASE_VERIFY_REPORT.json`,
  `evidence/tests/ORACLE_PARITY_REPORT.json`,
  `evidence/s0/S0_ORACLE_REPORT.json`, 8 e2e `trace.zip` files) were
  restored with `git checkout -- evidence/` and excluded from the commit,
  per the task's hard rules. The fresh values are in this handoff's
  `test_logs/` (notably: performance P95 679.4 ms / RSS 101.5 MiB;
  ORACLE_PARITY_REPORT now carries `ts_formal_false_pass_count: 0` over
  80 fixtures; S0_ORACLE_REPORT carries the same over 24 fixtures).
  The next session may re-run the acceptance commands to regenerate them.
