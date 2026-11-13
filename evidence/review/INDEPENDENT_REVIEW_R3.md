# P020 CheckPath — T013 Independent Review, Round 3 (final-review R1 fix re-review)

- **Reviewer:** T013 third-round independent reviewer (fresh session, isolated from T001–T012 builders, from the FIX-P1-01 / FIX-P1-02 fix executors, and from the first and second T013 reviewers; review only, no code fixed)
- **Review object:** HEAD `2d73c1c6d58886c07102219ead9a1d7cd0d94fc9` (7 commits above the T014 freeze baseline `3e5e145`: `a3a29d2` FIX-P1-02 + P2-3/4/6, `11f2fc0` FIX-P1-01, `36476cf` cat-file deadlock fix, `7638f06` trial freeze, `cf08826`, `2f3072c` stale-text fix, `2d73c1c` handoff report)
- **Review basis:** final-review R1 verdict `~/workspace/P020_R1_VERDICT.md` (FINAL_VERDICT: FAIL, P0 0 / P1 2 / P2 6); fix reports `handoff/P020-FIX-P1-01/TASK_REPORT_R1.md` and `handoff/P020-FIX-P1-02/TASK_REPORT.md`
- **Date:** 2026-11-08
- **Method:** every claim below was checked by running my own commands and reading the files myself. Nothing is taken from the fix executors' self-reports except as a pointer to where to look. All commands and their outputs are in §5.

## 0. Verdict

# **Verdict: PASS — P0 0 / P1 0 / P2 3**

Both R1 blockers are genuinely fixed and independently reproduced. All six R1 P2s are closed. The three new P2s are minor, non-blocking, and honestly recorded (one was already disclosed by the fix executors; two are my own findings). No new P0/P1.

| Severity | Count | Items |
|---|---|---|
| P0 (blocker — false PASS) | 0 | — |
| P1 (major) | 0 | — |
| P2 (minor, non-blocking) | 3 | P2-R3-1 `True:` vs `true:` residual divergence (fail-closed); P2-R3-2 formal re-freeze manifest still hardcodes the R2 review only; P2-R3-3 literal clean-dir (no `.git`) `release:freeze` re-run still fails at `git rev-parse HEAD` (by design; fresh-clone substitute verified) |

## 1. R1 blockers — both CLOSED (independently verified)

### P1-1 (R1): Oracle vs TS duplicate-key YAML — CLOSED

**R1 defect:** dup-branches / dup-event / dup-name were TS INVALID but Oracle VALID (PyYAML BaseLoader last-wins); ADR FIX-P2/01 could not waive the Oracle-consistency hard constraint.

**What I verified myself:**

- **Parser fix is real and complete.** `oracle/checkpath_oracle/parser.py` adds `_StrictBaseLoader(yaml.BaseLoader)` overriding `construct_mapping` to raise `yaml.YAMLError` on a repeated scalar mapping key, then delegating construction to `super().construct_mapping()`. Both `yaml.load` call sites (line 163 `parse_workflow_yaml`, line 447 `extract_jobs`) use it. My own tree-wide grep confirms these are the only two `yaml.load`/`safe_load` call sites in `oracle/`, `scripts/`, `tests/`. The constructor is registered with `add_constructor(DEFAULT_MAPPING_TAG, ...)` — the correct PyYAML pattern (a bare method override would never be called). No `flatten_mapping` call (correct: it lives on SafeConstructor, BaseLoader never merged `<<` keys, and my probe confirms a `<<` merge key still parses VALID, i.e. pre-fix semantics preserved).
- **All three forms now agree.** My own probes (Oracle `scripts/oracle-parse-probe.py --yaml … --fixture-id …` + Node `yaml.parse` on the same files):
  - dup-branches: Oracle `INVALID / ["yaml_parse_error"] / events []`; TS throws `Map keys must be unique` (line 5).
  - dup-event: Oracle `INVALID / ["yaml_parse_error"] / events []`; TS throws `Map keys must be unique` (line 3).
  - dup-name: Oracle `INVALID / ["yaml_parse_error"] / events []`; TS throws `Map keys must be unique` (line 2).
- **All three forms are in the automated comparison, not only in unit tests.** Trigger suite is 44 fixtures (`T6-17-dup-branches`, `T6-18-dup-event`, `T6-19-dup-name`, each with `workflow.yml` + `scenario.json` + `required-checks.json`; I read all three workflow files); golden suite is 83 fixtures (`G-81`/`G-82`/`G-83`). My own runs: `npm run test:oracle` 83 fixtures, 0 mismatches, 0 false PASS, formal-pipeline false PASS 0, UNKNOWN 19/19; `npm run oracle:diff:trigger` 44 fixtures, 0 mismatches (T006 report: 44 passed / 0 failed); jobs 48, checks 46, witness 44, all 0 mismatches. Golden expecteds are frozen as `jobs: []` + required check `test` → `PENDING_NOT_REPORTED / no_provider` (I read G-81/82/83 expected.json). `python3 scripts/build-golden.py --check-only` exit 0 (83 cases) — the suite regenerates byte-identically.
- **The old "should differ" assertion is gone.** `tests/unit/diff-boundaries/duplicate-key-yaml.test.ts` now asserts both sides reject and `expect(ts.status).toBe(oracle.status)` / `expect(ts.errors).toEqual(oracle.errors)`; `tests/fixtures/parser-divergence/duplicate-key/expected.json` lists all three cases as `INVALID / yaml_parse_error` on both sides. The ADR README (`tests/fixtures/parser-divergence/duplicate-key/README.md`) keeps the FIX-P2/01 history verbatim and adds a FIXED status section stating the waiver was superseded by the R1 verdict — the correct handling.
- **No semantic regression.** My own probes: normal workflow still `VALID` with `on` as string key; `if: false` still the string `"false"` in `extract_jobs`; duplicate key nested inside `jobs:` also `INVALID` (the check applies recursively through nested mappings); `extract_jobs` on a duplicate-key YAML returns `[]`, matching TS.
- **Gate hash unchanged.** My own `npm run s0:gate`: PASS, all 8 conditions true, determinism 100 runs / 1 unique hash, `gate_report_sha256 = f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386` — identical to the frozen value.

### P1-2 (R1): source.zip missing its declared freeze script — CLOSED

**R1 defect:** `scripts/deterministic-zip.py` was absent from source.zip (untracked at the freeze commit, built purely from `git ls-files`); GPT's clean-dir `npm run release:freeze` failed exit 2, file not found; only its SHA-256 was in the manifest.

**What I verified myself:**

- **The script is in the trial source.zip, three-way hash-consistent.** Trial freeze artifacts (committed at `7638f06`, HEAD `36476cf`): `release/source.zip` SHA-256 `2057e207bf35b47f6aabc94386bb8d9aa5b0e04cddf5f562145142fdadba4bd0` (1,203 files). I extracted `scripts/deterministic-zip.py` from that zip and hashed it: `d4a5784e857e63589eeeb358aa6400a5560b53e6abb02ff6c13d88d1d1dbfe3a`. `git show 36476cf:scripts/deterministic-zip.py` hashes to the identical `d4a5784e…`. The trial manifest's `freezer.sha256` is the identical `d4a5784e…`. All three agree.
- **dist.zip unchanged.** Trial `dist.zip` SHA-256 `da130ad2747a810c0f62488245fe7902298199faa6e8372f3975d58b573911e6` — byte-identical to the frozen T014 value. `sha256sum -c SHA256SUMS.txt` 3/3 OK (recomputed by me in the repo).
- **Fresh-clone reproduction, done by me (not from logs).** I cloned the repo to a fresh directory, checked out `36476cf`, ran `npm ci`, then `python3 scripts/deterministic-zip.py --freeze --trial`. Result: source.zip `2057e207…`, dist.zip `da130ad2…`, manifest `6745287584ce0ba5611794c326d8d4eba03d3a3a458e4a05ce50e90db2df7d94` — **all three byte-identical to the in-repo trial freeze**; `sha256sum -c` 3/3 OK. I also extracted the script from the clone-produced source.zip: hash `d4a5784e…`, matching the manifest and the repo file.
- **HEAD-state freeze is deterministic too.** I cloned again at HEAD `2d73c1c`, `npm ci`, ran `--freeze --trial` twice: both runs produced identical three hashes (source `449ec803d491ed73861c3c50ba1a69a3c515a5533de5db3a10a70f3c14a8ee3d`, 1,207 files; dist `da130ad2…` unchanged; manifest `867abde2116228013b97e3dfcc4dda111f1c6862d01723d4374be582d86b2850`). The 1,203 → 1,207 file growth is accounted for: 3 new test-log files from the trial-freeze commit `7638f06` + `handoff/P020-FIX-P1-01/TASK_REPORT_R1.md` from `2d73c1c`. At HEAD the script in the zip (`7598e960…`) equals the repo file and the manifest `freezer.sha256`, and the manifest's `known_limitations` carry the updated FIXED strings (see §4b).
- **The R1 failure mode is gone.** I extracted the trial source.zip to a fresh directory (no `.git`, no `node_modules`) and ran `npm run release:freeze`: the script is found and starts executing — the `can't open file 'scripts/deterministic-zip.py'` exit 2 from R1 no longer occurs. It now fails later at `git rev-parse HEAD` (`fatal: not a git repository`) — see P2-R3-3.

## 2. Freezer script + dist vendoring — independent review (R1 explicitly required)

I read `scripts/deterministic-zip.py` in full (current HEAD version, SHA-256 `7598e9603761392cae3ab0ad04780aa143e2260e8e53bf214dd5845f88685cc7`).

**Packaging logic — sound.** Deterministic ZIP construction (sorted entries, explicit directory entries, fixed 1980-01-01 timestamp, 0644/0755 permissions, DEFLATED level 9, duplicate-entry guard); `source.zip` = exact HEAD tree via `git ls-files` + `git cat-file --batch`, plus the freezer script itself (HEAD bytes when tracked, working-tree bytes when untracked — the dirty-check refuses a tracked-but-modified script, so the two sources cannot disagree); `dist.zip` = fresh `npm run build` + vendored yaml + examples/docs + QUICKSTART.md; `.map` files fail the freeze; `check_no_local_paths` guards dist content (the source.zip exception for absolute paths inside archived evidence text is disclosed in the header comment); `--verify` checks sorting, duplicates, CRC, timestamps, permissions, compression, path traversal, `.git` and non-yaml `node_modules` exclusion. `main()` accepts only `--freeze [--trial]` and `--verify <zip>`.

**HEAD gate — acceptable, documented.** `EXPECTED_COMMIT` (933dd35) exact-match was replaced by "HEAD == 933dd35 or a descendant of it" (`git merge-base --is-ancestor`), because the exact gate would refuse every post-fix freeze. The manifest records the actual HEAD as `source_commit`, so a freeze of an unrelated tree is still refused and the frozen tree is always identified. This is a deliberate, documented relaxation; the T013 review covers the frozen tree.

**Deadlock fix (`36476cf`) — correct.** I read the diff: `read_head_files` previously wrote all `git cat-file --batch` queries before reading any response; at 1,203 files the queries total ~71 KiB, over the ~64 KiB stdin pipe buffer, so git blocked writing responses while Python blocked writing queries. The fix interleaves one write + one full read per file. `read(n)` on the buffered pipe returns exactly n bytes unless EOF, the trailing LF is consumed, short reads and missing blobs fail loudly, and the process exit code is checked. My own fresh-clone freezes (1,203 and 1,207 files) ran in ~8 s each with no hang — the fix works at current tree size. No new problem introduced: on any failure the child is killed and `fail()` exits 1 without writing partial artifacts.

**Dist vendoring (F-T014-01) — verified.** `dist.zip` contains `node_modules/yaml/` with `package.json` (version **2.9.1**), `LICENSE` (738 bytes), and 74 `dist/*.js` files (76 vendored files total, matching the freeze log). The lockfile pins `node_modules/yaml` **2.9.1** and `package.json` requires `^2.9.1` — the vendored version matches the lockfile, and the freezer asserts this equality at freeze time. I also ran the bundle standalone: extracted `dist.zip` to a fresh directory (no `node_modules` from the repo) and `node checkpath.mjs demo` exited 2 (the agreed gate code for the synthetic scenario), with the vendored yaml present.

**Two minor observations (see P2-R3-2 and §4):** the manifest hardcodes the R2 review record and does not record this R3 review; `vite.config.ts` sets no explicit `emptyOutDir`, but Vite's default (empty the out dir when it is inside the project root, which `dist/` is) applies, so the fresh build cannot carry stale files — checked, not a finding.

## 3. R1 P2 closure — all six CLOSED (verified)

| R1 P2 | Verdict | My check |
|---|---|---|
| P2-1 static network check gaps | **CLOSED** | `expandedStaticNetworkCheck()` in `scripts/oracle-diff.mjs` now explicitly lists the 10 `src/core` files + `oracle/checkpath_oracle/witness.py` (plus recursive `src/report`/`src/cli`/`src/ui`/`src/worker` and `scripts/`). I counted the list myself: 11 + 17 + 17 = **45 files**. I ran the same `NETWORK_PATTERNS` grep over those 45 files myself: **0 matches** (grep exit 1). The frozen 11-file `staticNetworkCheck()` is untouched, so the S0 gate hash is unchanged (verified in §1). |
| P2-2 dup-name fixture | **CLOSED** | `tests/fixtures/parser-divergence/duplicate-key/dup-name.yml` exists; trigger `T6-19-dup-name` and golden `G-83` exist and are in the automated suites (44 / 83). |
| P2-3 README perf snapshot | **CLOSED** | README now reads P95 **768.3 ms** / peak RSS **98.3 MiB**. I recomputed from `evidence/tests/PERFORMANCE_REPORT.json`: p50 556.5 / p95 768.3 / max 965.5 / mean 582.3, peak_rss_mib 98.3, 31 timed runs, `ok: true`. The numbers are the project's own re-measurement (not GPT's 697.9 / 100.2), and the single-snapshot nature is still honestly noted as a known limitation. Both are within thresholds (P95 ≤ 1000 ms, RSS ≤ 256 MiB). |
| P2-4 PyYAML lock vs environment | **CLOSED** | `evidence/environment/PYYAML_6_0_3_VENV_VERIFICATION.md` exists and records the 6.0.1-vs-6.0.3 comparison. The fix log shows 83 probes byte-identical per interpreter. I spot-checked independently: all three duplicate-key forms return `INVALID / yaml_parse_error` under both system PyYAML **6.0.1** and the venv PyYAML **6.0.3** (`/tmp/p020-pyyaml-venv`). The lockfile itself is correct and was rightly left unchanged. |
| P2-5 Windows NOT_TESTED | **CLOSED (as a record)** | Honestly recorded in `release/RELEASE_NOTES.md` (§5, U-01) and in the manifest `known_limitations`. No Windows machine exists for this review either; Linux-only acceptance stands as before. |
| P2-6 source/freeze commit link | **CLOSED** | `evidence/release/T014_FREEZE_REPORT.md` §9 addendum records `source_commit 933dd35` vs `freeze_commit 3e5e145` with git evidence (I verified the claim myself: `3e5e145^` is `933dd35`, `933dd35..3e5e145` is exactly 1 commit). The freezer now writes `source_commit` / `freeze_commit` / `freeze_status` / `freeze_history` into every manifest; both the trial manifest (`source_commit 36476cf`, `freeze_status TRIAL`, history seeding the original `933dd35 → 3e5e145` mapping) and my HEAD-clone manifest (`source_commit 2d73c1c`) carry them. |

## 4. The four honest reminders — my judgments

**(a) Clean-dir literal re-run without `.git` still fails (`git rev-parse HEAD`).** Confirmed by me (see §1, P1-2): the script is found and runs, then fails at the first git call. **Judgment: acceptable, as P2-R3-3 (not a blocker).** The freeze is by design a repository operation — every input is read from HEAD via git, and the build needs dev dependencies. A source.zip without `.git` cannot literally re-run it, and including `.git` would break the "exact HEAD tree" packaging contract; falling back to working-tree files would break the freeze's trust model (freeze the reviewed commit, not whatever is on disk). The substitute verification — fresh clone + `npm ci` + trial freeze with byte-identical three hashes — is the meaningful reproducibility check, and I reproduced it myself. GPT R2 must be told this plainly (it was told the literal form in R1; the substitute and its result must be stated, not glossed).

**(b) Trial zip predates the `2f3072c` text fix.** Confirmed: I read the `2f3072c` diff — it changes exactly three `known_limitations` string literals in `scripts/deterministic-zip.py` (plus the same text in `release/RELEASE_NOTES.md`); no logic, no constants, no control flow. The trial manifest therefore still carries the stale strings (it lists P2-R2-1/2 and the dup-key divergence as open limitations). My HEAD-clone freeze proves the updated strings are picked up by a freeze at HEAD (manifest `known_limitations` show all three as FIXED). The formal T014 re-freeze will regenerate the manifest from the current script. No action needed beyond stating it in the R2 submission.

**(c) `True:` vs `true:` still not flagged as duplicates by BaseLoader.** Confirmed by me (see P2-R3-1 below): TS rejects them (`Map keys must be unique`, both resolve to boolean `true` under the `yaml` package), Oracle returns `UNKNOWN` (the two spellings are distinct strings to BaseLoader, so no duplicate is raised; the trigger evaluator then treats the unknown `True`/`true` keys as unsupported). **Judgment: real but negligible — P2, fail-closed.** Both outcomes are non-green (INVALID vs UNKNOWN; neither is VALID, so no false PASS is possible). No such keys occur in real workflow YAML (a `push:` mapping has no boolean-spelled keys). No fixture covers it, and adding one would lock in a TS-INVALID-vs-Oracle-UNKNOWN mismatch that the current comparison would flag — correctly, as a known divergence. It is disclosed here and should be disclosed to GPT R2; it does not reopen P1-1, which concerned the three realistic duplicate-key shapes, all now fixed.

**(d) `handoff/P020-FIX-P1-01/` mixes old and new reports.** Confirmed by listing the directory: the T013-era `TASK_REPORT.md` (17:18) plus its `changed_files.txt` / `sha256.txt` / `test_commands.txt` / `test_logs/` / `unresolved_items.md` sit alongside the R1 report `TASK_REPORT_R1.md` (19:02) and a new `logs/` directory (18:59). The R1 report itself explains the collision at the top. **Recorded only, as instructed; no fix.** It is a naming/housekeeping wart, not an evidence problem: both reports are intact and distinguishable by timestamp and filename.

## 5. New P2 findings

### P2-R3-1: `True:` vs `true:` residual divergence (fail-closed, negligible)
- TS: `yaml.parse` throws `Map keys must be unique` (verified by me with Node on a workflow carrying sibling `True:` / `true:` keys under `push:`).
- Oracle: `parse_workflow_yaml` returns `UNKNOWN`, no errors (verified by me with the strict loader under both PyYAML 6.0.1 and 6.0.3).
- Both outcomes are non-green; no false PASS is possible. No realistic workflow input contains such keys. Disclose to GPT R2; no fix required. Non-blocking.

### P2-R3-2: formal re-freeze manifest hardcodes the R2 review only
- `scripts/deterministic-zip.py` writes `inputs.t013_review_r2` (verdict PASS, P0 0 / P1 0 / P2 3, with the R2 report's SHA-256) and reads no R3 report. The formal T014 re-freeze manifest will therefore still cite R2 as the operative T013 review, even though this R3 review is the one that cleared the R1 fixes.
- The R3 report itself (`evidence/review/INDEPENDENT_REVIEW_R3.md`) is the record, and the R2 submission can include it in the review pack — but the coordinator should either extend the freezer to record `t013_review_r3` before the formal re-freeze, or state explicitly in the R2 submission that the manifest's review pointer is R2 while the operative review is R3. Non-blocking; do not change the script after the formal freeze without a new review cycle.

### P2-R3-3: literal clean-dir (no `.git`) `release:freeze` still fails at `git rev-parse HEAD`
- See §4(a). By design; the fresh-clone substitute was reproduced byte-identically by me. Must be stated plainly in the R2 submission. Non-blocking.

## 6. Regression — all re-run by me

| Check | Command (run by me, HEAD `2d73c1c`) | Result |
|---|---|---|
| Full tests | `npm test` | 32 files, **855/855 passed** (baseline 842 at `3e5e145`; +13 = golden +3, formal-pipeline +6, trigger +3, dup-key +1) |
| Oracle golden | `npm run test:oracle` | 83 fixtures, **0 mismatches, 0 false PASS**, formal-pipeline false PASS 0, UNKNOWN 19/19 |
| Oracle trigger | `npm run oracle:diff:trigger` | 44 fixtures, **0 mismatches** (T006 report 44 passed / 0 failed) |
| Oracle jobs | `npm run oracle:diff:jobs` | 48 fixtures, **0 mismatches** |
| Oracle checks | `npm run oracle:diff:checks` | 46 fixtures, **0 mismatches** |
| Oracle witness | `npm run oracle:diff:witness` | 44 fixtures, **0 mismatches** |
| Golden regen | `python3 scripts/build-golden.py --check-only` | exit 0, 83 cases |
| S0 gate | `npm run s0:gate` | **PASS**, oracle 24/24, 0 mismatch, 0 false PASS, determinism 100 runs / 1 unique hash, `gate_report_sha256 f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386` (unchanged), all 8 conditions true |
| Release verify | `npm run release:verify` | **PASS** (offline static scan 34 files, 0 remote references; license guard: no LICENSE file, `PENDING_SAM_DECISION`) |
| Deterministic zip verify | `python3 scripts/deterministic-zip.py --verify release/source.zip` / `--verify release/dist.zip` | both OK (via `sha256sum -c SHA256SUMS.txt` 3/3 OK in the repo; trial zip `--verify` also run by the fix executor and re-checked by me through the clone reproduction) |
| Specs | `sha256sum ~/workspace/P020_PROJECT_BOOK.md ~/workspace/P020_IMPLEMENTATION_PLAN.md` | `028c2472…` / `bb645205…` — unchanged; the 7 commits touch no spec or license file |
| License | `ls LICENSE`; grep `LICENSE_STATUS.md`, manifest | No LICENSE file; `PENDING_SAM_DECISION` everywhere; no license name written anywhere in `src/` or `oracle/` |
| Work tree | `git status --short` | Only the 4 regenerated evidence JSONs modified (`S0_ORACLE_REPORT.json`, `ORACLE_PARITY_REPORT.json`, `RELEASE_VERIFY_REPORT.json`, `T006_ORACLE_TRIGGER_REPORT.json`) + untracked `reports/` — the same state the fix executors left; my review added no commits and changed no tracked file except by re-running the acceptance commands (evidence regeneration). `evidence/S0_GATE.json` content unchanged by my runs. |

**Environment note (not a project finding):** `/tmp` on this VM is a 512 MB tmpfs and filled up (100%) during my first fresh-clone `npm ci` (`ENOSPC`). I freed it by removing stale scratch directories (`/tmp/p020-seed-test`, `/tmp/p020-untracked-test`, `/tmp/clean-freeze-test*`, `/tmp/t014*`, `/tmp/pytest-of-root` — their logs live in the repo, no evidence lost) and ran the clean-clone verifications from `~/workspace/r3-clean-clone*` instead (overlay disk, 7.2 GB free). Future clean-clone verifications should use workspace disk or clean `/tmp` first. My scratch clones were deleted after the verification.

## 7. What the R2 submission must state (for the coordinator)

1. P1-1 and P1-2 are fixed; this R3 review (PASS, P0 0 / P1 0 / P2 3) is the independent re-review R1 required.
2. The three new P2s above, in full — especially P2-R3-3 (literal clean-dir freeze fails at `git rev-parse HEAD`; the fresh-clone reproduction is the substitute and is byte-identical) and P2-R3-1 (the `True:`/`true:` residual).
3. The trial freeze artifacts (`source.zip 2057e207…`, 1,203 files) predate the `2f3072c` text-only fix; the formal T014 re-freeze at the current HEAD will regenerate the manifest with the corrected `known_limitations`. The trial manifest's stale limitation strings must not be presented as current.
4. The formal T014 re-freeze has **not** happened yet (current `release/` artifacts are the TRIAL freeze at `36476cf`); after it, Drive must be re-archived and R2 submitted in the same establishment conversation.

## 8. Files read (review evidence)

- `~/workspace/P020_R1_VERDICT.md`; `handoff/P020-FIX-P1-01/TASK_REPORT_R1.md`; `handoff/P020-FIX-P1-02/TASK_REPORT.md`
- `oracle/checkpath_oracle/parser.py` (diff `11f2fc0` + full current file); `scripts/deterministic-zip.py` (full current file; diffs `a3a29d2`, `36476cf`, `2f3072c`)
- `tests/fixtures/trigger/T6-17/18/19-dup-*`; `tests/fixtures/golden/G-81/82/83-*`; `tests/fixtures/trigger/suite.json`; `tests/fixtures/golden/suite.json`; `tests/fixtures/parser-divergence/duplicate-key/{README.md,expected.json,dup-name.yml}`; `tests/unit/diff-boundaries/duplicate-key-yaml.test.ts`
- `scripts/oracle-diff.mjs` (expanded check); `evidence/S0_GATE.json`; `evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`; `evidence/tests/PERFORMANCE_REPORT.json`; `evidence/environment/PYYAML_6_0_3_VENV_VERIFICATION.md`; `evidence/release/T014_FREEZE_REPORT.md` §9; `release/RELEASE_MANIFEST.json`; `release/RELEASE_NOTES.md`; `README.md`; `vite.config.ts`; `package.json` / `package-lock.json`
