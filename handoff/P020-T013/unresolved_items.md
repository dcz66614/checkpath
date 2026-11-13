# P020 T013 — Unresolved items

## New (this review — NOT PASS)

### P0-1 — matrix / reusable-workflow false PASS in the shipped product path

- `src/core/job-dag.ts:455-472`: `evaluateJobsKeyed` drops `unsupported_job`.
- Shipped CLI reports matrix/`uses:` jobs' checks as REPORTABLE_PENDING (exit 0);
  Oracle requires UNKNOWN / `provider_unknown` (fixtures G-79/G-80).
- Fix requires a separate independent task session; after the fix, re-run the
  affected tests and T013. Evidence: `evidence/review/REVIEW_PACK_01.md` §1.

### P1-1 — CLI rejects duplicate-context manifests the resolver / Oracle accept

- `src/core/validate.ts:621`: `duplicate_value` on any repeated `context`.
- CLI `analyze` with the T8-05 manifest (golden G-57) exits 3 with no report.
- Needs an ADR reconciling the T005 validator contract with the T008 resolver
  semantics; fix in a separate independent task session.
  Evidence: `evidence/review/REVIEW_PACK_01.md` §2.

### P2-1 … P2-10

See `evidence/review/INDEPENDENT_REVIEW.md` §3: stale comments/docs
(P2-1, P2-2, P2-6), duplicate React keys (P2-3), untested duplicate-key YAML
divergence (P2-4), `staticNetworkCheck` 11-file scope (P2-5), README stale perf
numbers (P2-7) and false semantic claims (P2-8), `release:verify` smoke gaps
(P2-9), `falsePassCount` from Oracle reports not TS reports (P2-10).

## Carried forward from T012

### U-01 — Windows PowerShell Quick Start: NOT_TESTED

- README PowerShell Quick Start has not been executed on Windows (no Windows
  machine on this VM). Still open.

### U-02 — `dist.zip` `node checkpath.mjs demo` not end-to-end verified

- Still open, for T014.

### U-03 — README `npm ci` not re-run in T012 — CLOSED by this review

- `npm ci` run personally in T013: exit 0, 181 packages in 3 s (registry
  reachable). Log: `handoff/P020-T013/test_logs/npm-ci.log`.

## Working-tree note (not a graded item)

Pre-existing drift at task start, left untouched and excluded from the T013
commit: `evidence/tests/PERFORMANCE_REPORT.json`, `PERFORMANCE_REPORT.md`
(P95 701.2 ms → 654.7 ms, peak RSS 101.1 MiB → 99 MiB on re-run — timing
variance), 8 `evidence/tests/e2e-output/*/trace.zip` files, plus untracked
`reports/`. Next session should decide whether to commit or restore them.
