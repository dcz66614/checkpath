# Scalar job definitions — divergence FIXED by FIX-P0-04 (final review R2 P0 residual, grouped P0 in T013 R5)

## Status (FIX-P0-04)

**FIXED — the divergence below no longer exists.** T013 R5 found 3
residual divergences on commit `2388be1` (FIX-P0-03); one of them
was J20: a scalar (non-mapping) job definition, `jobs: {test: True}`.
Everything agreed except one field:

- TypeScript `extractJobs` (non-dict branch, `src/core/e2e.ts`):
  `{"id": "test", "if": "__unsupported_if__", "name": null, "needs": []}`
  — no `unsupported_job` field.
- Oracle `extract_jobs` (non-dict branch,
  `oracle/checkpath_oracle/parser.py`): the same object plus
  `"unsupported_job": null`.

FIX-P0-04 fixes this on the **Oracle side**: the non-dict branch
now omits the field, matching the TypeScript output exactly. The
TypeScript product code is untouched (and `dist.zip` is therefore
unchanged). See ADR FIX-P0-04 in
`handoff/P020-FIX-P0-04/TASK_REPORT.md` §1 for the trade-off.

## Why the Oracle side (trade-off, in short)

The TypeScript side is the shape authority here: in the dict
branch it always carries `unsupported_job`, in the non-dict branch
it omits it — the Oracle is a mirror of that output shape, not a
normalizer. Omitting the field in one Oracle branch is a one-line
change with no downstream effect (the Oracle evaluator reads the
field with `job.get("unsupported_job")`, so a missing key reads as
`None`, the same value as before). The alternative — adding
`unsupported_job: null` to the TypeScript non-dict branch — would
have changed product code and `dist.zip` for a field whose value
carries no information. The dict branch is unchanged on both sides
(control case j06 locks `unsupported_job: null` there).

## Coverage

- j01 `True`, j02 empty/null, j03 sequence, j04 quoted string,
  j05 number: every non-mapping job-definition shape omits the
  field on both sides.
- j06 control: a normal mapping job definition still carries
  `unsupported_job: null` on both sides.
- The same shapes are covered end to end by the trigger suite
  (T6-50 scalar `True`, T6-51 scalar null) and the golden suite
  (G-114, G-115).
- The lock test is a parity test:
  `tests/unit/job-dag/scalar-job.test.ts` runs both job extractors
  on the 6 fixtures in this directory and asserts the job lists
  agree field-for-field.
- `expected.json` in this directory records both sides' agreed
  job lists for all 6 cases. It was generated only after the
  post-fix probe run showed TS == Oracle on every case.

## The divergence (historical)

The field asymmetry predates FIX-P0-03 (its report §7-3 lists it
as an untouched residual): the two extractors were written
independently, one spelling the field out unconditionally in the
non-dict branch and the other omitting it. No existing fixture
covered a scalar job definition, so nothing caught it until R5's
probe matrix.
