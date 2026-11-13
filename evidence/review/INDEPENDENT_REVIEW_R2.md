# P020 CheckPath — T013 Independent Review, Round 2

- **Reviewer:** T013 independent re-reviewer (fresh session, isolated from T001–T012 builders, from the FIX-P0-01 / FIX-P1-01 / FIX-P2 executors, and from the first T013 reviewer; review only, no code fixed)
- **Review object:** commit `857e670aa1612567094f08d49241427df0a6add7` ("FIX-P2 … 842/842 tests, S0_GATE PASS, gate_report_sha256 f511a847 unchanged")
- **Date:** 2026-11-08
- **Verdict: PASS — P0 0 / P1 0 / P2 3** (three new minor issues, none blocking)

## 0. Verdict summary

| Grade | Count | Items |
|---|---|---|
| P0 (blocker — false PASS) | 0 | — |
| P1 (major) | 0 | — |
| P2 (minor) | 3 | P2-R2-1 (P2-5 residual: 10 `src/core` files + `oracle/witness.py` still outside both static network checks), P2-R2-2 (duplicate-key `dup-name` shape probed but not locked by a fixture/test), P2-R2-3 (README perf figures are single-run snapshots; independent re-run differs ~12% from the printed values) |

All 12 issues from the first review (P0-1, P1-1, P2-1…P2-10) are **CLOSED**,
each verified by an independent live probe and/or a re-run of the acceptance
suite in this session (see §3). The pass standard (plan §10) is met:
P0 = 0, P1 = 0, Oracle parity 100% **including the formal (shipped-product)
pipeline** — TS formal-pipeline false PASS = 0 over all 80 golden fixtures —
formal false PASS = 0, S0 gate still recomputable from the original fixtures
(`gate_report_sha256 f511a847…` unchanged, independently recomputed), source
coverage 100% (all 18 changed files read in full this session; 52 unchanged
files carried forward from R1, verified byte-identical), no undeclared
network/telemetry/token/real-data, no LICENSE overreach, and the reviewed
source matches the candidate commit (`git rev-parse HEAD` = `857e670…`;
`git diff 857e670 -- src oracle scripts` = 0 lines).

Per the hard rules, no code, fixture, Oracle expectation or threshold was
modified by this review. The three new P2s are recorded here only; they do
not block the verdict and no fix was attempted.

## 1. Method

1. Read the first review in full (`evidence/review/INDEPENDENT_REVIEW.md`,
   `REVIEW_PACK_01.md`) and the three fix reports
   (`handoff/P020-FIX-P0-01/TASK_REPORT.md`,
   `handoff/P020-FIX-P1-01/TASK_REPORT.md`,
   `handoff/P020-FIX-P2/TASK_REPORT.md`, including all ADRs).
2. Read the specs: `~/workspace/P020_PROJECT_BOOK.md`
   (SHA-256 `028c24720e0780542217719f6e9b14c0fe22b31b79c662520441c2116262b8de` —
   unchanged) and `~/workspace/P020_IMPLEMENTATION_PLAN.md`
   (SHA-256 `bb645205174eca1d111687928c41505407392d0eefd1281455a776273aaa1e0e` —
   unchanged).
3. Read **every** file changed in `dcd80d7..857e670` outside `handoff/` —
   18 files, 1,203 insertions / 49 deletions — in full via `git diff`
   (plus a full-file read of
   `tests/unit/cli/formal-pipeline-unsupported.test.ts`, 355 lines).
   The 52 unchanged files under `src/` + `oracle/` + `scripts/` were
   verified byte-identical to the R1-reviewed tree and their R1 coverage
   is carried forward explicitly (see `COVERAGE_MATRIX_R2.csv`).
   Confirmed the reviewed tree matches the candidate commit:
   `git rev-parse HEAD` = `857e670aa1612567094f08d49241427df0a6add7`;
   `git diff 857e670 -- src oracle scripts` = 0 lines.
4. Ran all acceptance commands personally and logged exit codes
   (logs in `handoff/P020-T013-REVIEW/test_logs/`).
5. Re-ran the S0 gate from the original fixtures; independently recomputed
   `S0_GATE.json`'s `gate_report_sha256` and the three probe reports'
   `report_sha256`.
6. Ran three fresh live probes against the shipped `dist/checkpath.mjs`
   (rebuilt from the candidate commit with `npm run build`, exit 0;
   `dist/core/job-dag.js:343` carries the `unsupported_job` fix):
   U-07 matrix, U-08 reusable workflow, T8-05 duplicate-context manifest.
   Full evidence in `REVIEW_PACK_02.md`. All three probe hashes are
   byte-identical to the hashes reported by the fix sessions — the fixes
   reproduce exactly.
7. Privacy/compliance greps over `src/`, `oracle/`, `scripts/`; license
   audit; README-vs-CLI consistency check; `dist/`-vs-source
   correspondence check; independent verification of the two new
   regression tests' effectiveness (see §3, P2-3 / P2-4 notes) and of
   the FIX-P2/01 third-shape claim (dup-name probed live in this session).

### Working-tree note (pre-existing, not part of the candidate commit)

At task start the tree had 3 modified files (test-run generated reports
left over from the previous fix session:
`evidence/s0/S0_ORACLE_REPORT.json`,
`evidence/tests/ORACLE_PARITY_REPORT.json`,
`evidence/tests/RELEASE_VERIFY_REPORT.json`) plus untracked `reports/`.
The 3 modified files were restored with `git checkout -- evidence/`
before work began (generated reports only, no source or frozen evidence).
This review's own test runs re-modified the same class of generated
files (`evidence/tests/*.json|md`, 8 e2e `trace.zip`); they were restored
again before the T013-REVIEW commit and are **not** included in it.
Untracked `reports/` was left untouched throughout.

## 2. Acceptance commands (personally run, exit codes)

| Command | Exit | Result (detail) |
|---|---|---|
| `npm ci` | 0 | Real run (registry reachable); 181 packages added in 3 s. Log `test_logs/npm-ci.log`. |
| `npm run typecheck` | 0 | `tsc --noEmit`, clean. |
| `npm run lint` | 0 | `eslint src tests scripts`, clean. |
| `npm run test` | 0 | 32 test files, **842/842 tests passed**. |
| `npm run test:oracle` | 0 | Golden 80 fixtures, **0 mismatches**; `false PASS: 0` (Oracle-side) **and `TS formal-pipeline false PASS: 0`** (formal-pipeline side, 80 fixtures checked); unsupported surfaced as UNKNOWN 19/19. |
| `npm run test:e2e` | 0 | Playwright **8/8 passed**. |
| `npm run test:offline` | 0 | `unshare -rn` CLI run + **strace: 0 network syscalls**; static scan 31 files, 0 remote references. |
| `npm run release:verify` | 0 | PASS; dist tree sha256 `14cd8492…` (29 files, identical across 2 builds — changed from T012's `f4464038…` by the source fixes, as expected); smoke now includes U-07, U-08 and T8-05 (all PASS, exit 2 with the correct verdicts); `report_sha256` recompute OK; offline scan 34 files 0 remote refs; license guard PASS. |
| `npm run test:property -- --seed 20261108 --count 1000` | 0 | 1000 cases, 0 mismatches, false PASS 0. |
| `npm run test:mutation` | 0 | 13/13. |
| `npm run test:performance` | 0 | P95 **697.9 ms** (≤1000), peak RSS **100.2 MiB** (≤256). See P2-R2-3. |
| `npm run s0:oracle` | 0 | S0 Oracle 24/24, false PASS 0, **TS formal false PASS 0** (24 fixtures), unsupported UNKNOWN 2/2. |
| `npm run s0:gate` | 0 | 100 iterations, 1 hash; `evidence/S0_GATE.json` status PASS; `gate_report_sha256 f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386` **unchanged, independently recomputed — matches**. Expanded network check (P2-5): 33 files, 0 matches; table confinement `oracle-diff.mjs` 3 matches / 0 unexplained, `release-verify.mjs` 9 matches / 0 unexplained. |

All 13 commands pass. Unlike R1, the green suite this time is backed by a
formal-pipeline differential test and by release-gate smoke cases covering
exactly the two previously missed defects.

## 3. Re-verification of the 12 first-review issues

### P0-1 — matrix / reusable false PASS in the shipped product path — CLOSED

- **Fix:** `src/core/job-dag.ts` `evaluateJobsKeyed` now carries
  `unsupported_job: job.unsupported_job ?? null` (one line + comment);
  `evaluateJobs()` itself untouched, so the ADR-04 UNKNOWN semantics
  (including skip-priority for `if: false` / skipped needs) are unchanged.
- **Independent probe (this session, shipped `dist/` rebuilt from 857e670):**
  - U-07: job `test` **UNKNOWN / `unsupported_matrix`**, check
    `unit-tests` **UNKNOWN / `provider_unknown`**, **exit 2**,
    `report_sha256 59fb7bf4ddea3b5391ccc46a81e2a5c29e08469cef1271c0ab31ffc7386f5016`
    — byte-identical to the FIX-P0-01 report; hash independently recomputed ✓.
  - U-08: job `call-reusable` **UNKNOWN / `unsupported_reusable_workflow`**,
    check UNKNOWN / `provider_unknown`, **exit 2**,
    `report_sha256 4b9d167b806d0d73868d3f509c808da325776229ebb2f2947bc4d2279324ec46`
    — byte-identical to the FIX-P0-01 report; hash independently recomputed ✓.
  - Both reports now carry 1 witness (`unsupported_feature` /
    `provider_unknown`, naming the unsupported reason), where R1's probes
    had 0 witnesses and `unsupported_features: []` (the latter is
    unchanged and matches the frozen Oracle expected, per FIX-P0-01 §3).
- **Test lock verified real, not just counted:** the new formal-pipeline
  differential test (162 tests + G-57 probe = 163 in the file) runs
  `buildReport()` on **every** golden fixture and compares job rows,
  check rows (shared subset) and the §4.7 exit code against the frozen
  Oracle `expected.json`, **and** against `evaluateE2E()` for the same
  fixture (two-path lock). The G-79/G-80 single-point probes assert exact
  job/check objects, exit 2, and the witness kind/first-blocking-condition.
  The test file was read in full; the assertions are field-level, not
  count-level. The suite passes 842/842 with it included.
- **Gate lock verified:** `test:oracle` now prints `TS formal-pipeline
  false PASS: 0` (80 fixtures) and `s0:oracle` the same (24 fixtures);
  the gate condition c6 requires both the Oracle-side and the TS-formal
  counts to be 0 (read `scripts/oracle-diff.mjs` diff in full; the new
  `formalFalsePassCount` uses the same definition as `falsePassCount`,
  rows matched by manifest index so duplicate-context rows cannot
  collapse — the same index-matching subtlety the Oracle-side count
  already handles). The `s0:gate` run in this session confirms c6 with
  both counts 0 and the gate hash unchanged.

### P1-1 — shipped CLI rejects duplicate-context manifests — CLOSED

- **Fix:** `src/core/validate.ts` `validateRequiredChecks()` no longer
  rejects duplicate contexts (the `seen` set and the `duplicate_value`
  issue are removed); `duplicate_value` still applies to job ids, `on`
  event names and `needs` entries. `src/core/types.ts` contract comment
  updated to match. T005's rejection decision is explicitly superseded
  by ADR FIX-P1-01/01.
- **Independent probe (this session, shipped `dist/`):** T8-05 manifest
  (verbatim, `source: ""` preserved) → **exit 2** (was exit 3,
  `duplicate_value`, no report), job `test` ELIGIBLE / `eligible`,
  5 check rows exactly equal to golden G-57's frozen expected
  (context/status/reason **and** provider_count/provider_job_id, verified
  field-by-field in this session with python3),
  `report_sha256 781098456ca6399183a89def05646893cd085165405219b7a26e3031f9674fbb`
  — byte-identical to the FIX-P1-01 report; hash independently recomputed ✓.
  (One staging note: the probe's job row carries
  `workflow_path: ".github/workflows/ci.yml"` where the golden expected
  says `"workflow": "workflow.yml"` — that is the probe's own staging
  path, not a verdict difference; the formal test compares against the
  fixture's own path and passes. The job verdict itself is identical.)
- **Bypass removal verified (ADR FIX-P1-01/02):** the formal-pipeline
  test's `loadFixture()` now routes required checks through
  `validateRequiredChecks()` — the FIX-P0-01/04 bypass is gone from the
  code (read in full; no raw-entry path remains) — and the new G-57
  probe test in the same file passes through that validator, locking
  that the CLI validation path admits the duplicate manifest.
- **No regression on P0:** the U-07/U-08 probes above reproduce the
  FIX-P0-01 hashes exactly, and `release:verify`'s T8-05 smoke case
  asserts the five rows in manifest order (read in full; the
  `stageChecksFixture` helper writes `source` whenever present in the
  fixture JSON, including `""` — the empty-source pitfall is handled
  explicitly, unlike `stageUnsupportedFixture`'s `if (entry.source)`
  guard, which is safe only because U-07/U-08 both declare
  `source: "github-actions"`; verified by reading both fixtures).

### P2-1 — stale `types.ts` header comments — CLOSED

`JobStatus` / `CheckStatus` comments now state the current fact (single
definition in `types.ts`; `job-dag.ts` re-based in T007 and re-exports;
`check-resolver.ts` re-based in T008, local copy removed) and the file
header paragraph is rewritten accordingly. Verified by reading the diff
and by grep: no local `JobStatus`/`CheckStatus` definition remains in
`job-dag.ts` (it imports from `./types.js`).

### P2-2 — stale "Known S0 limitation" comment / two-pipeline divergence — CLOSED

`src/core/e2e.ts` header now documents the explicit division of labour
(S0/Oracle-parity unkeyed path vs formal keyed product path), states the
unkeyed path's same-`job_id`-across-workflows limitation plainly, and
names the locking test. No "Known S0 limitation" residue remains (grep
confirmed). The divergence is no longer silent: the formal-pipeline
differential test locks formal ≡ Oracle expected ≡ `evaluateE2E()` for
all 80 golden fixtures, and it passes. The decision **not** to unify the
pipelines (ADR FIX-P0-01/02) is reasonable: unifying would change the
frozen `checkpath.e2e-report/v1` shape (trigger IR) that the Oracle
compares against; the test lock is the cheaper, safer control.

### P2-3 — duplicate React keys `key={row.context}` — CLOSED

`src/ui/RequiredCheckTable.tsx` now keys rows by `` `${index}:${row.context}` ``
with a comment explaining the manifest-index identity. The new regression
test (`tests/unit/cli/required-check-table.test.tsx`, read in full) is
genuine: it builds a real report from the frozen T8-05 fixture via
`buildReport`, renders it, and asserts (a) 5 data rows / 3 `unit-tests`
occurrences and (b) key uniqueness by walking the element tree under
`<tbody>` and collecting every `<tr>` key. The test honestly documents
that React 19's server renderer emits no duplicate-key warning, so it
asserts the guarded property directly instead of the warning. Both
tests pass inside the 842/842 run. (No independent pre-fix failure run
was repeated in this session; the FIX-P2 report records the pre-fix
failure `expected 3 to be 5`, and the test's logic was read and found
sound — it fails under the old key by construction.)

### P2-4 — duplicate-key YAML divergence untested — CLOSED (as a documented known limitation)

- The divergence was independently confirmed in this session for all
  three shapes: TS `yaml` `parse()` throws → `INVALID` /
  `yaml_parse_error`; Python Oracle (PyYAML 6.0.1 `BaseLoader`) silently
  last-wins → `VALID`. Two shapes are locked by the new test
  (`tests/unit/diff-boundaries/duplicate-key-yaml.test.ts`, 3 tests,
  read in full): `dup-branches` (TS INVALID, Oracle VALID with
  `branches: [dev]`) and `dup-event` (TS INVALID, Oracle VALID with the
  empty second `push:` winning). The third shape, top-level duplicate
  `name: a` / `name: b`, was probed live by this reviewer (TS INVALID /
  `yaml_parse_error`; Oracle VALID, last-wins) — see P2-R2-2 for the
  residual gap (probed but not fixture-locked).
- The new probe driver `scripts/oracle-parse-probe.py` (40 lines, read in
  full) is a thin adapter over `parse_workflow_yaml` with no evaluation
  logic of its own. The fixture directory (`expected.json` schema
  `checkpath.parser-divergence/v1` + README carrying ADR FIX-P2/01 in
  full) correctly keeps these cases out of every frozen suite, which
  requires TS ≡ Oracle.
- ADR FIX-P2/01 (maintain the divergence; TS reject is the product rule)
  is **reasonable**: a duplicate key is ambiguous authoring, a merge gate
  must not silently pick a winner, YAML itself forbids duplicate keys,
  and changing either side would either weaken the gate (TS last-wins)
  or rewrite frozen Oracle semantics. The decision is recorded in two
  places (fixture README + FIX-P2 report §5) and locked by a test that
  fails on drift in either direction (it asserts `ts.status !==
  oracle.status` plus the exact per-side values).

### P2-5 — `staticNetworkCheck()` greps only 11 files — CLOSED (with a residual, see P2-R2-1)

- `scripts/oracle-diff.mjs` now has `expandedStaticNetworkCheck()`:
  every `.ts`/`.tsx` under `src/report`, `src/cli`, `src/ui`,
  `src/worker` and every `.mjs`/`.py` under `scripts/` (minus the two
  pattern-table files, checked separately by table confinement).
- **Verified live:** this session's `s0:gate` log records
  `expanded static network check: 33 files, 0 matches` and
  `table-confinement scripts/oracle-diff.mjs: 3 matches, 0 unexplained`
  / `scripts/release-verify.mjs: 9 matches, 0 unexplained`; c8 now
  requires the original check, the expanded check and zero unexplained
  table matches. The file count was independently reproduced (33 files
  by the same directory/extension rules). The `-H` grep fix from the
  FIX-P2 session (single-file grep omits the filename prefix) is
  present in `checkTableFile` and the gate passes with it.
- The design choice to keep the expanded result in the gate log rather
  than in `evidence/S0_GATE.json` (ADR FIX-P2/02) is reasonable: the
  gate hash covers `network_check.command`, so embedding the wider list
  would have changed the frozen hash; the gate's actual strictness comes
  from c8's verdict, which does include the expanded check. The
  `s0:gate` log is the audit trail for it.
- Residual: see P2-R2-1.

### P2-6 — `THIRD_PARTY_NOTICES.md` "T001 skeleton" header — CLOSED

Header now reads as a current dependency list verified against
`package.json` / `package-lock.json` at the FIX-P2 review. Dependency
contents unchanged and verified against `package.json` in this session
(`react`, `react-dom`, `yaml`, `typescript`, `vite`,
`@vitejs/plugin-react`, `vitest`, `@playwright/test`, `eslint`,
`PyYAML` all present as listed).

### P2-7 — README perf numbers stale — CLOSED

README now cites P95 **794.5 ms** / peak RSS **94.2 MiB** with the
measurement conditions (1 warmup + 31 runs, full CLI `analyze`, wall
time, max `VmHWM` sampled every 2 ms, thresholds) and the unit-test
count is updated to **842** (matches this session's run: 842/842).
The numbers were a real fresh measurement at fix time (FIX-P2 ran the
perf suite twice: 756.0 / 98.4 and 794.5 / 94.2). See P2-R2-3 for the
inherent snapshot-drift observation.

### P2-8 — README semantic claims false in the shipped CLI — CLOSED

§"Supported semantics" now states matrix/`uses:` → UNKNOWN (true after
FIX-P0-01 — verified by the U-07/U-08 probes) and, for duplicate
contexts, that manifest entries resolve one row per entry in manifest
order while two PROVIDERS sharing one context → `AMBIGUOUS`
(`duplicate_context`) (true after FIX-P1-01 — verified by the T8-05
probe and the unchanged T8-03/T8-08 resolver locks, checks diff 46/46).
The old sentence conflated the two cases; the new wording separates
them correctly.

### P2-9 — `release:verify` smoke had no matrix/`uses:`/duplicate case — CLOSED

`scripts/release-verify.mjs` `cliSmoke()` now has three added cases
(read in full): U-07 (exit 2, job UNKNOWN/`unsupported_matrix`, check
UNKNOWN/`provider_unknown`), U-08 (same shape, `unsupported_reusable_workflow`),
T8-05 (exit 2, job ELIGIBLE, five per-entry rows compared exactly).
This session's `release:verify` run shows all three PASS with the
correct verdicts. The release gate would now catch a regression to
either R1 defect.

### P2-10 — `falsePassCount()` computed from Oracle reports only — CLOSED

`scripts/oracle-diff.mjs` now computes `formalFalsePassCount` from the
formal-pipeline (`buildReport`) dumps and the golden gate fails unless
**both** counts are 0 (plus `formal.exit === 0`). Verified live:
`test:oracle` prints `TS formal-pipeline false PASS: 0` (80 fixtures)
and `s0:oracle` the same (24 fixtures); the new report fields
(`ts_formal_false_pass_count`, `ts_formal_false_pass_details`,
`formal_pipeline_fixtures_checked`, `formal_typescript_exit_code`)
are present in the generated parity report. The dump-before-assert
design (the formal test writes each fixture's dump before asserting)
means a failing formal run still yields a real count instead of -1;
the -1 fallback only applies when the run crashes before writing any
dump, and that also fails the gate via `formal.exit !== 0`. Fail-closed
in both branches.

## 4. New issues found in this round (P2 only)

### P2-R2-1 — P2-5 residual: 10 `src/core` files and `oracle/witness.py` are still outside both static network checks

- **Location:** `scripts/oracle-diff.mjs` `staticNetworkCheck()` (11 files)
  + `expandedStaticNetworkCheck()` (`src/report`, `src/cli`, `src/ui`,
  `src/worker`, `scripts/`).
- **Gap:** `src/core/` has 15 files; the original check covers 5
  (`e2e`, `workflow-parser`, `glob-subset`, `job-dag`, `check-resolver`).
  The expanded check does not cover `src/core` at all, so these 10
  remain unchecked by either: `canonical-json.ts`, `event-evaluator.ts`,
  `if-subset.ts`, `recommendations.ts`, `sha256.ts`, `skip-annotation.ts`,
  `types.ts`, `validate.ts`, `witness-reducer.ts`, `workflow-ir.ts`.
  Likewise `oracle/checkpath_oracle/witness.py` (and the trivial
  `__init__.py`) are outside the 6 Oracle files. FIX-P2's report says
  the expanded check covers "the rest of the product" — that overstates
  it: `src/core` is the product's core and 10 of its files are still
  outside the gate's grep scope.
- **Severity P2:** no network call was found in any of them — this
  reviewer grepped all of `src/`, `oracle/` and `scripts/` directly
  (0 matches outside the two pattern tables) and `test:offline` proves
  0 network syscalls at runtime, so this is a gate-coverage gap, not a
  found call — the same classification R1 gave P2-5. The product-level
  offline proof (`test:offline` strace + dist scan) does cover the
  built artifact, which bounds the practical risk.
- **Fix direction (separate session, non-blocking):** extend the
  expanded check to `src/core` files not already in the 11 (or simply
  to all of `src/`) and to the remaining Oracle modules; keep the
  table-confinement treatment for the two gate files.

### P2-R2-2 — duplicate-key `dup-name` shape probed but not locked by a fixture/test

- **Location:** `tests/fixtures/parser-divergence/duplicate-key/` (2 cases)
  vs `tests/fixtures/parser-divergence/duplicate-key/README.md` ("the TS
  side throws on all three duplicate-key shapes probed").
- **Gap:** the README's "three shapes" claim is true — this reviewer
  verified the third shape live (top-level `name: a` / `name: b`:
  TS `INVALID` / `yaml_parse_error`, Oracle `VALID` last-wins) — but
  only two shapes (`dup-branches`, `dup-event`) exist as fixtures and
  are asserted by `duplicate-key-yaml.test.ts`. If either side's
  behaviour on the top-level duplicate-key shape drifted, no test would
  catch it, even though the README presents it as verified behaviour.
- **Severity P2:** the two locked shapes already pin the parser-level
  property (unique-key enforcement vs last-wins) on both sides, so the
  practical drift risk is small; this is a test-completeness nit, not a
  semantic gap.
- **Fix direction:** add `dup-name.yml` + its `expected.json` entry (or
  note in the README that only two shapes are locked).

### P2-R2-3 — README perf figures are single-run snapshots and already differ from an independent re-run

- **Location:** `README.md` status line (P95 794.5 ms / 94.2 MiB).
- **Observation:** this session's `npm run test:performance` (same
  conditions, deterministic input SHA-256 `82d175d7…` identical to T012)
  measured **P95 697.9 ms / peak RSS 100.2 MiB** — ~12% below the printed
  P95 and ~6% above the printed RSS. Both are far inside the thresholds
  (P95 ≤ 1000 ms, RSS ≤ 256 MiB), and FIX-P2's own two runs already
  differed (756.0 vs 794.5 ms), so this is run-to-run timing variance,
  not a stale-data error like R1's P2-7 (where the README cited numbers
  that contradicted the report it referenced). The "verified" claim holds;
  the exact figures are inherently unstable.
- **Severity P2:** documentation precision only.
- **Fix direction:** state the figures as a range or with the measurement
  date and a "re-measured at release" note, or drop exact figures in
  favour of the thresholds. Non-blocking.

## 5. Itemised conclusions by review area

### 5.1 Source review — 60/60 files covered, 0 NOT_READ

Coverage matrix: `evidence/review/COVERAGE_MATRIX_R2.csv` (60 files under
`src/` + `oracle/` + `scripts/`, 14,703 lines; 18 files changed in
`dcd80d7..857e670` marked READ and read in full this session; 52 unchanged
files marked READ-R1 with R1 coverage carried forward after verifying
`git diff dcd80d7..857e670` is empty for them). The 10 additional changed
files outside `src/`/`oracle/`/`scripts/` (4 test files, 4 parser-divergence
fixture files, `README.md`, `THIRD_PARTY_NOTICES.md`) are also listed in
the matrix as READ. NOT_READ list: **none**.
Key source matches the release candidate commit (HEAD `857e670`, zero diff
in `src/`, `oracle/`, `scripts/`); `dist/` was rebuilt from this commit
and carries the fix (`dist/core/job-dag.js:343`).

### 5.2 Tests & Oracle — parity now covers the shipped product path

- Golden 80/80, property 1000/1000 (seed 20261108), mutation 13/13,
  S0 24/24 — all re-run green in this session; `npm test` 842/842.
- **Product-level parity is now real:** the formal-pipeline differential
  test compares `buildReport()` output with the frozen Oracle expected
  for all 80 fixtures, and `test:oracle` / `s0:oracle` report the
  TS-formal false-pass count (0 in both suites). The R1 caveat — "Oracle
  parity 100%, false PASS 0 covers only the `evaluateE2E` path" — no
  longer holds: both paths are locked together and both counts are 0.
- S0 gate re-computable from original fixtures: `s0:gate` exit 0
  (100 runs, 1 hash `f511a847…`); `S0_GATE.json` status PASS and its hash
  independently recomputed — matches. S0 Oracle 24/24, false PASS 0.

### 5.3 Privacy & compliance — PASS (no findings)

- Grep over `src/`, `oracle/`, `scripts/` by this reviewer: no network
  calls in product code outside the two pattern tables (whose only
  matches are the tables themselves, confined by the c8 check); no
  tokens/secrets; no telemetry (the only "telemetry|analytics|track|segment"
  grep hits are the words "segment" in path-validation messages in
  `validate.ts` / `workflow-ir.ts` — false positives, no tracking code).
  Synthetic data only throughout (fixtures, demo, perf input, probes).
- Offline proof re-run in this session: `test:offline` exit 0, strace
  0 network syscalls, static scan 0 remote references.
- License: no `LICENSE` file; `package.json` has no `license` field;
  `LICENSE_STATUS.md` still reads `PENDING_SAM_DECISION`; no license
  name appears in any project file outside `package-lock.json`
  dependency metadata (checked: `MIT`/`Apache-2.0`/`GPL`/`BSD`/`ISC`
  absent from `src/`, `oracle/`, `scripts/`, `README.md`,
  `THIRD_PARTY_NOTICES.md`, `LICENSE_STATUS.md`, `package.json`).
  `release:verify` license guard also passes.

### 5.4 Delivery review

- README commands and semantic claims now match the shipped CLI
  (verified by the three live probes; perf figures are snapshots —
  P2-R2-3). Unit-test count "842" matches this session's run.
- `dist/` corresponds to source: rebuilt from commit `857e670` in this
  session; `dist/core/job-dag.js` contains the `unsupported_job`
  carry-through; release:verify 2-build determinism passed (dist tree
  hash `14cd8492…` across 2 builds).
- Report hashes re-computable: S0 gate hash ✓; all three probe reports ✓.

### 5.5 Prior ADRs — re-verified

- ADR FIX-P0-01/01 (carry the field, don't change the判定 logic):
  implemented exactly as decided — one-line carry-through,
  `evaluateJobs()` untouched. Holds.
- ADR FIX-P0-01/02 (two pipelines, explicit division, no unification):
  implemented as the `e2e.ts` header + the two-path locking test. The
  decision remains reasonable; the lock is real. Holds.
- ADR FIX-P0-01/03 (TS false-pass count, same definition, check layer
  only): implemented; both counts are 0 and the gate requires both.
  Holds. (Note: the check-layer-only definition is sufficient because a
  job-layer ELIGIBLE-vs-UNKNOWN divergence necessarily surfaces as a
  check-layer REPORTABLE_PENDING-vs-UNKNOWN divergence through the
  resolver — the P0-1 case itself is the evidence.)
- ADR FIX-P0-01/04 (formal test bypasses the CLI duplicate validator):
  **superseded and removed** — the bypass no longer exists in the test
  code (verified by full read); ADR FIX-P1-01/02 records the removal.
  CLOSED as designed.
- ADR FIX-P0-01/05 (c6 extended, gate hash unchanged by design):
  holds — c6 now requires both counts 0, both are 0, hash unchanged.
- ADR FIX-P1-01/01 (validator admits duplicate contexts, option (a)):
  implemented; the (a)-over-(b) reasoning holds — the frozen resolver,
  Oracle and G-57 all accept duplicates, so changing the validator is
  the minimal-blast-radius reconciliation, and provider-level ambiguity
  (`AMBIGUOUS` / `duplicate_context`) is preserved untouched in the
  resolver. Holds.
- ADR FIX-P1-01/02 (FIX-P0-01/04 bypass removed): verified removed (see
  §3 P1-1). CLOSED.
- ADR FIX-P2/01 (duplicate-key YAML divergence maintained, TS side is
  the product rule): reasonable (see §3 P2-4); documented in the fixture
  README and locked by test. Holds, with the P2-R2-2 completeness nit.
- ADR FIX-P2/02 (P2-5 expanded check logged, not embedded in frozen
  gate JSON): reasonable (see §3 P2-5); the gate is genuinely stricter
  (c8 includes the expanded check) while the frozen hash is preserved.
  Holds.

### 5.6 Regression check — no degradation found

- U-07/U-08 probe hashes are byte-identical to the FIX-P0-01 report;
  T8-05 probe hash is byte-identical to the FIX-P1-01 report.
- All 13 acceptance commands pass; golden/property/mutation/S0 counts
  are unchanged or improved (842 tests, up from 673 at R1 via the three
  new regression-test files, all of which assert real behaviour).
- The two new regression tests were read in full and their assertions
  verified to be field-level and failure-capable (the P2-3 test fails
  under the old key by construction; the P2-4 test asserts exact
  per-side values plus the designed disagreement).

## 6. NOT_READ list

None. All 60 source files under `src/`, `oracle/`, `scripts/` are covered
(8 changed source files READ in full this session, 52 unchanged source
files READ-R1 carried forward from the first review after byte-identity
verification; 0 NOT_READ). The 10 changed files outside the source tree
(tests, fixtures, README, THIRD_PARTY_NOTICES) were also read in full.
(Handoff packages and generated logs were spot-checked as evidence, not
line-by-line reviewed; that was not in the T013 scope's 100%-coverage
requirement, which covers the source tree plus the changed files.)

## 7. Unresolved / carried-forward items

- **New (this review):** P2-R2-1, P2-R2-2, P2-R2-3 (see §4). Minor,
  non-blocking; fixes (if desired) require a separate task session.
- **Carried forward from R1 / T012 (unchanged):**
  - U-01 Windows PowerShell Quick Start NOT_TESTED — still open (no
    Windows machine on this VM).
  - U-02 `dist.zip` `node checkpath.mjs demo` not end-to-end verified —
    still open, for T014.
- Pre-existing working-tree drift (test-run generated `evidence/` files
  re-modified by this review's own runs, untracked `reports/`) — the
  generated files were restored with `git checkout -- evidence/` before
  the T013-REVIEW commit; `reports/` left untouched, excluded from the
  commit.

## 8. Evidence paths

- This report: `evidence/review/INDEPENDENT_REVIEW_R2.md`
- Review index: `REVIEW_INDEX.md` (work-area root, updated with both rounds)
- Probe evidence pack: `evidence/review/REVIEW_PACK_02.md`
- Coverage matrix: `evidence/review/COVERAGE_MATRIX_R2.csv`
- Review hashes: `evidence/review/REVIEW_SHA256SUMS_R2.txt`
- Handoff package: `handoff/P020-T013-REVIEW/` (TASK_REPORT.md, changed_files.txt,
  test_commands.txt, test_logs/, sha256.txt, unresolved_items.md)
- Acceptance-command logs: `handoff/P020-T013-REVIEW/test_logs/` (also `/tmp/t013r2/logs/`)
- Probe scratch (not committed): `/tmp/t013r2/probe/` (inputs + outputs + logs)
