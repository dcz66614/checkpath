# P020 CheckPath — T013 Independent Review Index

- **Review:** T013 Independent Review (S5)
- **Verdict (round 1): NOT PASS — P0 1 / P1 1 / P2 10**
- **Candidate commit (round 1):** `1dadc0a91f2637107ff37274fe245f807d50ee55`
- **Reviewer (round 1):** T013 independent reviewer (fresh session, isolated from T001–T012 builders)
- **Date (round 1):** 2026-11-08
- **Verdict (round 2, re-review): PASS — P0 0 / P1 0 / P2 3** (three new minor issues P2-R2-1…P2-R2-3, non-blocking)
- **Candidate commit (round 2):** `857e670aa1612567094f08d49241427df0a6add7`
- **Reviewer (round 2):** T013 independent re-reviewer (fresh session, isolated from T001–T012 builders, from the FIX-P0-01 / FIX-P1-01 / FIX-P2 executors, and from the round-1 reviewer)
- **Date (round 2):** 2026-11-08

## Deliverables

### Round 1 (NOT PASS — P0 1 / P1 1 / P2 10; records preserved unchanged)

| # | File | Contents |
|---|---|---|
| 1 | `evidence/review/INDEPENDENT_REVIEW.md` | Full review report: method, acceptance-command results, graded issue list (P0-1, P1-1, P2-1…P2-10), itemised conclusions per area, NOT_READ list (none), carried-forward items |
| 2 | `evidence/review/REVIEW_PACK_01.md` | Live-probe evidence pack: P0-1 (U-07 matrix, U-08 reusable) and P1-1 (T8-05 duplicate manifest) — commands, verbatim outputs, report contents, hash recomputations, root-cause chain |
| 3 | `evidence/review/COVERAGE_MATRIX.csv` | Source coverage matrix: 59 files under `src/` + `oracle/` + `scripts/`, 14,240 lines, 100% READ, 0 NOT_READ |
| 4 | `evidence/review/REVIEW_SHA256SUMS.txt` | SHA-256 sums of the round-1 review deliverables |
| 5 | `handoff/P020-T013/` | Handoff package per plan §5: TASK_REPORT.md, changed_files.txt, test_commands.txt, test_logs/, sha256.txt, unresolved_items.md |

### Round 2 (PASS — P0 0 / P1 0 / P2 3; all 12 round-1 issues closed, verified by independent live probes)

| # | File | Contents |
|---|---|---|
| 1 | `evidence/review/INDEPENDENT_REVIEW_R2.md` | Full re-review report: method, acceptance-command results (13 commands, all exit 0),逐项 re-verification of P0-1 / P1-1 / P2-1…P2-10 (all CLOSED), new issues P2-R2-1…P2-R2-3, ADR re-verification, NOT_READ list (none) |
| 2 | `evidence/review/REVIEW_PACK_02.md` | Live-probe evidence pack: U-07 / U-08 / T8-05 re-probes against shipped `dist/` rebuilt from 857e670 — hashes byte-identical to the fix sessions (59fb7bf4… / 4b9d167b… / 78109845…), all hashes independently recomputed; plus the P2-4 dup-name third-shape live check |
| 3 | `evidence/review/COVERAGE_MATRIX_R2.csv` | Source coverage matrix: 60 files under `src/` + `oracle/` + `scripts/`, 14,703 lines — 8 changed source files READ in full this session, 52 unchanged files READ-R1 carried forward (byte-identical to R1); 10 changed non-source files (tests, fixtures, README, THIRD_PARTY_NOTICES) also READ; 0 NOT_READ |
| 4 | `evidence/review/REVIEW_SHA256SUMS_R2.txt` | SHA-256 sums of the round-2 review deliverables |
| 5 | `handoff/P020-T013-REVIEW/` | Handoff package per plan §5: TASK_REPORT.md, changed_files.txt, test_commands.txt, test_logs/, sha256.txt, unresolved_items.md |

`REVIEW_INDEX.md` (this file) — this index (work-area root).

## Headline findings (round 1 — NOT PASS)

- **P0-1:** matrix / reusable-workflow jobs are reported `REPORTABLE_PENDING`
  (exit 0) by the shipped CLI, although the frozen Oracle requires
  `UNKNOWN` / `provider_unknown` — a false PASS. Root cause:
  `src/core/job-dag.ts:455-472` (`evaluateJobsKeyed` drops `unsupported_job`).
  Confirmed by live probe on frozen fixtures G-79/G-80.
- **P1-1:** the shipped CLI rejects duplicate-context manifests (exit 3,
  `duplicate_value`) that the frozen resolver / Oracle accept — it cannot
  analyse its own golden fixture G-57 (T8-05) end-to-end.
- Acceptance commands: all 10 pass (typecheck, lint, test 673/673,
  test:oracle 80/80, test:e2e 8/8, test:offline 0 syscalls, release:verify,
  s0:oracle 24/24, s0:gate 100 runs 1 hash, npm ci) — the suite is green
  while the product contains a false PASS, because no differential test
  exercises the formal report pipeline on a matrix / `uses:` fixture.

## Headline findings (round 2 — re-review, PASS)

- **P0-1 CLOSED:** U-07 / U-08 re-probed against shipped `dist/` rebuilt
  from 857e670 — job UNKNOWN (`unsupported_matrix` /
  `unsupported_reusable_workflow`), check UNKNOWN / `provider_unknown`,
  exit 2; hashes byte-identical to the FIX-P0-01 report
  (`59fb7bf4…` / `4b9d167b…`), independently recomputed.
- **P1-1 CLOSED:** T8-05 re-probed — exit 2 (was exit 3), 5 check rows
  exactly equal to golden G-57 frozen expected; hash byte-identical to
  the FIX-P1-01 report (`78109845…`), independently recomputed.
  FIX-P0-01/04 bypass verified removed from the formal-pipeline test.
- **P2-1…P2-10 all CLOSED** (verified item by item in
  `INDEPENDENT_REVIEW_R2.md` §3, including the TS-formal false-pass
  count now reported by `test:oracle` / `s0:oracle` as 0).
- **New minor issues:** P2-R2-1 (P2-5 residual: 10 `src/core` files +
  `oracle/witness.py` still outside both static network checks),
  P2-R2-2 (duplicate-key `dup-name` shape probed but not fixture-locked),
  P2-R2-3 (README perf figures are single-run snapshots; re-run
  P95 697.9 ms / 100.2 MiB vs printed 794.5 / 94.2, thresholds still pass).
- Acceptance commands (round 2): all 13 pass — npm ci, typecheck, lint,
  test 842/842, test:oracle 80/80 (TS formal false PASS 0), test:e2e 8/8,
  test:offline 0 syscalls, release:verify (U-07/U-08/T8-05 smoke PASS),
  test:property 1000/1000, test:mutation 13/13, test:performance
  P95 697.9 ms / 100.2 MiB, s0:oracle 24/24, s0:gate PASS 100 runs 1 hash
  (`f511a847…` unchanged).

## Rounds 3–19 (summary — appended in the R3-FINAL rework, 2026-11-10; rounds 1–2 above untouched)

After round 2, each round reviewed one FIX-P0 fix and (except R3 and R19)
found a new P0 family, which the next fix closed. Round 19 is the first
PASS since round 3. All 19 review files are hashed in
`RELEASE_MANIFEST.json` (`inputs.t013_review_r*`); SHA-256 prefixes below
are from the R3 manifest (R4 manifest carries the same values).

| Round | Verdict | Candidate (code) commit | Review file SHA-256 (prefix) | Headline |
|---|---|---|---|---|
| R3 | PASS — P0 0 / P1 0 / P2 3 | `2d73c1c` | `1e55294d0417` | Final-review R1 P1-1 (duplicate-key Oracle) and P1-2 (source.zip missing freeze script) both CLOSED; new P2-R3-1 (`True:` vs `true:` residual), P2-R3-2 (manifest recorded R2 only), P2-R3-3 (clean-dir freeze by design) |
| R4 | NOT PASS — P0 1 / P1 0 / P2 6 | `53fa36a` (FIX-P0-02) | `3be14a499e61` | R2 P0 (`True:` vs `true:`) fixed and fixture-locked (T6-20 / dup-bool-true / G-84); new grouped P0: 13 numeric-scalar + 9 event-name divergences (22 cases) |
| R5 | NOT PASS — P0 1 / P1 0 / P2 7 | `2388be1` (FIX-P0-03) | `5e8f8f0b151b` | Reviewed FIX-P0-03 (Oracle scalar rendering per YAML 1.2 core); new P0 1 — see `INDEPENDENT_REVIEW_R5.md` |
| R6 | NOT PASS — P0 1 / P1 0 / P2 8 | `baf881f` (FIX-P0-06) | `f4ced18a671e` | Reviewed FIX-P0-06 (N5 set alias keys + H6 tab); new P0 1 — see `INDEPENDENT_REVIEW_R6.md` |
| R7 | NOT PASS — P0 1 / P1 0 / P2 8 | `b6e2f2b` (FIX-P0-07) | `484a8cc7ea0c` | Reviewed FIX-P0-07 (inline plain scalar in-progress quote tab); new P0 1 — see `INDEPENDENT_REVIEW_R7.md` |
| R8 | NOT PASS — P0 1 / P1 0 / P2 8 | `c157f41` (FIX-P0-08) | `fabb3aa739cb` | Reviewed FIX-P0-08 (Oracle rejects unindented multi-line quoted scalar continuations); new P0 1 — see `INDEPENDENT_REVIEW_R8.md` |
| R9 | NOT PASS — P0 1 / P1 0 / P2 9 | `a8ca5ec` (FIX-P0-09) | `d1f91c6dd3ed` | Reviewed FIX-P0-09 (TS rejects multi-line quoted keys in flow mappings); new P0 1 — see `INDEPENDENT_REVIEW_R9.md` |
| R10 | NOT PASS — P0 1 / P1 0 / P2 10 | `8ef847b` (FIX-P0-10) | `e159387e60d9` | Reviewed FIX-P0-10 (Oracle rejects indent-0 flow continuations); new P0 1 — see `INDEPENDENT_REVIEW_R10.md` |
| R11 | NOT PASS — P0 2 / P1 0 / P2 8 | `479810e` (FIX-P0-11) | `1cc23c974281` | Reviewed FIX-P0-11 (Oracle rejects indent-0 standalone comment lines in flow mappings); new P0 2 — see `INDEPENDENT_REVIEW_R11.md` |
| R12 | NOT PASS — P0 3 / P1 0 / P2 9 | `309b2ee8f5a92eb1b1f85850bed93cedd6832e1b` (FIX-P0-12) | `d28e8a349dd1` | Reviewed FIX-P0-12 (TS rejects anchor/tag without space; S1 narrowed to keys with `:`); new P0 3 — see `INDEPENDENT_REVIEW_R12.md` |
| R13 | NOT PASS — P0 1 / P1 0 / P2 9 | `01509e0c245b28c241b6e38d20782ee479e56fc6` (FIX-P0-13) | `4206873e3a0e` | Reviewed FIX-P0-13 (closes R12 P0-C1 `,`-suffix, P0-C2 `[`/`]`-suffix, P0-C3 anchored empty key); new P0 1 — see `INDEPENDENT_REVIEW_R13.md` |
| R14 | NOT PASS — P0 5 / P1 0 / P2 8 | `45487eb` (FIX-P0-14) | `3814dc3e5e47` | Reviewed FIX-P0-14 (closes R13 lone-doc P0); new P0 5 — see `INDEPENDENT_REVIEW_R14.md` |
| R15 | NOT PASS — P0 3 / P1 0 / P2 9 | `5e3cda7` (FIX-P0-15) | `74ef2e5ded0a` | Reviewed FIX-P0-15 (closes R14's 5 P0 families); new P0 3 — see `INDEPENDENT_REVIEW_R15.md` |
| R16 | NOT PASS — P0 2 / P1 0 / P2 9 | `6821ed0` (FIX-P0-16) | `8a969fbec1e2` | Reviewed FIX-P0-16 (closes R15's 3 P0 families); new P0 2 — see `INDEPENDENT_REVIEW_R16.md` |
| R17 | NOT PASS — P0 1 / P1 0 / P2 8 | `50788a7` (FIX-P0-17) | `34d42f18ca4e` | Reviewed FIX-P0-17 (closes R16's 2 P0 families; Oracle `parser.py` +320/−12, `src/` 0 changes); new P0 1 (flow-mapping alias-key family) — see `INDEPENDENT_REVIEW_R17.md` |
| R18 | NOT PASS — P0 1 / P1 0 / P2 8 | `55bd04a` (FIX-P0-18) | `bc42eede06cf` | Reviewed FIX-P0-18 (absorbed-colon position rule extended from `AnchorToken` to `(AnchorToken, AliasToken)`); new P0 1 — the flow-mapping null-value alias-key family (8 shapes, 20 DIFFs) — see `INDEPENDENT_REVIEW_R18.md` |
| R19 | PASS — P0 0 / P1 0 / P2 8 | `9dac3e1` (FIX-P0-19) | `c6ec2c2415ba` | R18 P0 family CLOSED (50/50, 22/22, 10/10, 79/79, 70/70); self-hunt 60/60, 0 new divergence; full acceptance green; 4,102 checks, 0 DIFF (see Round 19 deliverables below) |

### Round 19 (PASS — P0 0 / P1 0 / P2 8; R18 P0 family closed)

| # | File | Contents |
|---|---|---|
| 1 | `evidence/review/INDEPENDENT_REVIEW_R19.md` | Full review report: R18 family re-verification (§1), self-hunt probe 60/60 (§2), parser-layer reproduction (§3), boundary verification (§4), P2 list (§5), manifest hash check — trial manifest `89ff8504…` reproduced ×3 (§6, §9), shortcut check (§7), full acceptance re-run + 4,102-check probe-matrix re-runs (§8), command log (§10) |
| 2 | `evidence/review/REVIEW_PACK_03.md` | Live-probe evidence pack (compiled in the R3-FINAL rework from the R19 report and its committed probe files — no new numbers): R18 family re-verification, self-hunt 60/60 table, parser-layer table, boundary table, trial-freeze triple-hash table, full acceptance + matrix re-run tables |
| 3 | `evidence/review/COVERAGE_MATRIX_R19.csv` | Source coverage matrix at `9dac3e1`: 62 files under `src/` + `oracle/` + `scripts/` (20,481 lines) + 37 new FIX-P0-19 test/fixture rows (35 fixtures + `expected.json` + 1 test file) = 99 rows, 0 NOT_READ. `src/core/workflow-parser.ts` is READ-R19 (+127/−1, `hasDuplicateAliasKey`) — this supersedes the stale `COVERAGE_MATRIX_R2.csv` flag "Unchanged since R1" for that file (R2's flag predates FIX-P0-19). 54 files unchanged since the R2 candidate `857e670` carry their R2 coverage forward (verified byte-identical); the other 8 carry the round that last changed them (R3/R5/R9/R10/R18/R19, noted per row) |
| 4 | `evidence/review/REVIEW_SHA256SUMS_R19.txt` | SHA-256 sums of the round-19 review deliverables (this index included) |
| 5 | `evidence/probes/r19/` | R19 probe evidence (committed with the R19 report as `9fd0233`): `cases.json`, `gen-cases.py`, `r19-probe.py`, `results.json`, `parser-probe-p19-r19.txt` / `parser-probe-p19b-r19.txt`, `reruns/`, README |

## Headline findings (rounds 3–19)

- **R3 PASS** closed both final-review R1 P1 blockers; its three new P2s
  were all non-blocking. P2-R3-1 (`True:` vs `true:`) was later closed by
  FIX-P0-02 and verified by R4 §1 (both sides INVALID / `yaml_parse_error`,
  fixture-locked T6-20 / dup-bool-true / G-84) — the R4 manifest records it
  RESOLVED (see `release/RELEASE_NOTES_R3.md`, "R3-FINAL correction").
  P2-R3-2 was fixed by the R2 re-freeze manifest; P2-R3-3 stands (by design).
- **R4–R18 (all NOT PASS)** form one fix-and-review loop: each round found
  exactly one new P0 family (R11: 2, R12: 3, R14: 5), each closed by the
  next FIX-P0 fix and re-verified by the following round. No round ever
  raised a P1. The loop's last family (R18: flow-mapping alias keys
  resolving to duplicate scalars, 8 shapes) was closed by FIX-P0-19.
- **R19 PASS** (the verdict the R3 re-freeze is built on): R18 family
  closed on all five probe sets; self-hunt 60/60 with 0 new divergence;
  `npm test` 1697/1697, `test:oracle` 167/167, `s0:gate` PASS
  (`f511a847…`), `release:verify` PASS; trial manifest `89ff8504…`
  reproduced three times in a clean clone.
- **P2s carried into R19 (8, all non-blocking):** P2-R3-3, P2-R2-3, Windows
  PowerShell Quick Start NOT_TESTED, USER_VALUE no human data,
  one-generation lag, manifest `freeze_commit` PENDING by design,
  P2-R6-1 (fixed by the R3 re-freeze — manifest now records R4–R19),
  P2-R6-2 (partially mitigated: R7/R8 probes lost, R9–R19 archived).
- Acceptance commands (round 19): all pass — typecheck, test 1697/1697,
  test:oracle 167/167 (TS formal false PASS 0), oracle:diff 128/48/46/44,
  s0:oracle 24/24, s0:gate PASS 100 runs 1 hash, release:verify PASS,
  build-golden 167 cases.

## Specs (unchanged by this review)

- `~/workspace/P020_PROJECT_BOOK.md` — SHA-256 `028c24720e0780542217719f6e9b14c0fe22b31b79c662520441c2116262b8de`
- `~/workspace/P020_IMPLEMENTATION_PLAN.md` — SHA-256 `bb645205174eca1d111687928c41505407392d0eefd1281455a776273aaa1e0e`
