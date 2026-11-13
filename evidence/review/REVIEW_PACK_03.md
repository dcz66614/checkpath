# REVIEW_PACK_03 — Live-probe evidence for T013 round 19 (R18 P0 family re-verification)

Project: P020 CheckPath. Reviewer: T013 independent reviewer (round 19).
Candidate commit: `9dac3e1` (FIX-P0-19, HEAD verified in a clean clone
`~/workspace/p020-r19-review`). Review window: 2026-11-09 ~23:30 GMT →
2026-11-10 ~00:11 GMT. All probes use synthetic fixtures only, no network,
no token. This pack was compiled in the R3-FINAL rework (2026-11-10) from
`evidence/review/INDEPENDENT_REVIEW_R19.md` (the round-19 report itself,
committed as `9fd0233`) and the probe evidence it cites — no number below
is new; every figure is quoted from that report and its committed probe
files (`evidence/probes/r19/`).

## 1. R18's P0 family — CLOSED (independently re-verified)

R18定级 the 1 P0 family (8 shapes, 16 checks; 20 DIFFs across probe sets).
R19 re-ran each probe set against the FIX-P0-19 code:

| Probe | Result |
|---|---|
| R18 hunt probe (`evidence/probes/r18/`, 50 checks) | **50/50 MATCH** (was 44/50; 6 DIFFs now 0) |
| R18 adjudication probe (22 checks) | **22/22 MATCH** (was 12/22; 10 DIFFs now 0) |
| R18 adjudication-2 probe (10 checks) | **10/10 MATCH** (was 8/10; 2 DIFFs now 0) |
| fix-p0-18 grid (79 checks) | **79/79 MATCH** (was 77/79; the only 2 DIFFs `c-flow-key-null-2nd` ×2 now 0) |
| fix-p0-19 grid (35 shapes, 70 checks) | **70/70 MATCH** (A group 16/16, B group 18/18, C group 36/36) |

The 8 family shapes, each independently rebuilt in the hunt, adjudication
and fix-p0-19-grid probes and confirmed double-sided INVALID /
`yaml_parse_error`: `{a: 1, *w:2}`, `{a: 1, *w}`, `{*w, a: 1}`,
`{*w, *w}`, nested flow `{x: {a: 1, *w:2}}`, `{*w:2, a: 1}`,
`{a: 1, *w:2:3}`, `{a: 1, *w:2} # c`. The R17 9-shape family did not
regress (R17 probe 141/141, see §6).

The fix (from the R19 report §7, verified by `git diff e2c418f..9dac3e1`):
`src/` diff = only `src/core/workflow-parser.ts` (+127/−1, new
`hasDuplicateAliasKey`) and `src/core/e2e.ts` (+7/−2, wiring);
`oracle/` / `scripts/` / `release/` diff = empty; 0 tests deleted; no new
`skip` / `only` weakening (the single `it.skip` hit is pre-existing
FIX-P0-09-era code, `git blame` commit `d9611356`); `deepDiff` untouched
(0 hits); Oracle side 0 changes.

## 2. R19 self-hunt probe — no new divergence (60 checks, 0 DIFF)

Self-written hunt probe, 30 shapes / 60 checks
(`evidence/probes/r19/r19-probe.py`, reusing the R18 driver: esbuild-bundled
TS probe + Oracle double driver, full-JSON deep comparison; trigger mode
compares the full TriggerIR, jobs mode the full job list). **60/60 MATCH.**

| Group | Shapes | Result |
|---|---|---|
| Explicit `?` keys (H1–H4) | flow `{? *w, a: 1}`, `{? *w: 1, a: 1}`; block `? *w` + `a: 1` (null / `: 1`) | **8/8 MATCH** (all double-sided INVALID; block explicit keys also rejected) |
| Cross-mapping non-duplicates (H5, H19, H24) | alias key alone in an inner mapping; same alias key in two mappings; duplicate candidate only in the outer mapping | **6/6 MATCH** (all double-sided VALID; per-mapping `seen` lists cause no cross-mapping false positives) |
| Two flow mappings in a sequence (H6) | `[{a: 1, *w}, {a: 1, *w}]` | **2/2 MATCH** (double-sided INVALID; each mapping judged independently) |
| Triple colon (H7–H8) | `{a: 1, *w:2:3:4}`, `{*w:2:3:4, a: 1}` | **4/4 MATCH** (double-sided INVALID) |
| Canonical folding (H9–H12, H16, H22, H26–H29) | `.inf` duplicates / `.inf` vs `-.inf`, `0` vs `false` / `false` vs `0`, quoted `'a'`, `'1'` vs `1` / `1` vs `'1'`, `True` vs `1`, `~` vs `null`, `.nan` | **20/20 MATCH** (duplicate shapes double-sided INVALID; non-duplicates double-sided VALID) |
| Duplicates inside `on:` / `jobs:` (H13–H15, H25) | `on: {push: {}, *w}`, `on: {*w, pull_request: {}}`, `jobs: {check: {...}, *w}`, `on: {push: {branches: [main]}, *w}` | **8/8 MATCH** (duplicate shapes double-sided INVALID; H15 covers the `extractJobs` chain, jobs-mode job lists double-sided identical and empty) |
| Anchor defined later (H17) | same flow mapping `m: {*w, &w a: 1}` | **2/2 MATCH** (double-sided INVALID; different mechanisms, same conclusion — Oracle reports undefined alias, TS rejects under the new rule) |
| Two anchors, same value (H18) | `m: {*w, *v, b: 1}` (`&w a`, `&v a`) | **2/2 MATCH** (double-sided INVALID; alias–alias collisions also rejected) |
| Nested values / deep nesting (H20, H21, H30) | `{a: {x: 1}, *w}`, `{n: [{a: 1, *w}]}`, step `env: {a: 1, *w}` | **6/6 MATCH** (all double-sided INVALID; recursion reaches them) |
| Comment inside flow (H23) | `{a: 1, *w # c\n}` | **2/2 MATCH** (double-sided INVALID) |

Conclusion (R19 §2): the new rule fires only on "a valid key collision
where at least one side is an alias key"; all negative controls
(H5, H10, H11, H12, H14, H19, H22, H24, H26–H28) are double-sided VALID
— no false positives. The `!` guard fix did not regress (R17 probe H1
group 18/18 MATCH, see §6).

## 3. Parser-layer reproduction (fix report's probes, re-run)

R19 re-ran the fix session's parser-layer probes (outputs committed as
`evidence/probes/r19/parser-probe-p19-r19.txt` /
`parser-probe-p19b-r19.txt`); every row agrees with FIX-P0-19 report §3:

| Shape group | PyYAML `_StrictBaseLoader` | `yaml` 2.9.1 | End-to-end (§1, §2) |
|---|---|---|---|
| F1–F8 (8 family shapes) | all LOAD-ERROR `duplicate mapping key: 'a'` | all 0 errors, accepted (new rule off) | all double-sided INVALID |
| B1–B2 valued alias keys | LOAD-ERROR duplicate | parse() THROW (colon ambiguity) | double-sided INVALID, unchanged |
| B3 block-mapping alias keys | LOAD-ERROR / SCAN-ERROR | parse() THROW | double-sided INVALID, unchanged |
| B4–B6 (different scalar / alone / as value) | LOAD-OK | 0 errors | double-sided VALID, unchanged |
| B7 pure-scalar duplicate keys | LOAD-ERROR duplicate | parse() THROW `Map keys must be unique` | double-sided INVALID, unchanged |
| B8/B10 block null alias keys | SCAN-ERROR `while scanning a simple key` | parse() THROW | double-sided INVALID, unchanged |
| B11–B18 canonical folding | B11/B13/B15/B16 duplicate; B12/B14/B17/B18 LOAD-OK | Alias resolves to the corresponding Scalar; `1` vs `'1'`, `True` vs `1`, `!!str 1` vs `1`, `NaN` all `!==` | agrees with §2 H9–H12, H16, H22, H26–H29 end-to-end |
| B19–B22 (spread pairs / sequences in flow / `on:` / anchor defined in same flow) | LOAD-ERROR duplicate (B21: `'push'`) | corresponding Alias resolve | double-sided INVALID, unchanged |

Note (R19 §3): the `.nan` shape prints as `Scalar(null)` in the `.mjs`
output — a `JSON.stringify(NaN) === "null"` artefact; the fix report
verified separately that both sides hold number NaN, and end-to-end H22
(double-sided VALID) corroborates it. The first `parser-probe-p19.mjs`
draft's B11–B18/B21/B25 design flaw (anchor definition on a bare line
start) was disclosed in fix report §3 and corrected in `p19b`; R19
re-ran the corrected version.

## 4. Boundary verification (fix report §3/§4 control shapes, re-checked)

| Shape family | Expected | Result |
|---|---|---|
| Valued alias keys `{*w: 1, a: 1}`, `{*w: 1, *w: 2}` | MATCH (double-sided INVALID, unchanged) | **MATCH** (fix-p0-19 grid B group + R18 adjudication对照) |
| Block-mapping alias keys (valued/null, `*w` / `*w:2`) | MATCH (double-sided INVALID, unchanged) | **MATCH** (grid B group; H3–H4 explicit-key supplement) |
| D2 `on: {*a: 1}` (valued flow alias key) | MATCH (closed, unchanged) | **MATCH** (fix-p0-04 matrix 100/100, 0 flagged) |
| Pure-scalar duplicate keys `{a: 1, a: 2}` | MATCH (double-sided INVALID, unchanged) | **MATCH** (grid B group; `parse()` `uniqueKeys` owns it) |
| Alias key after a different scalar `{b: 2, *w}`, alias alone `{*w}`, alias as value `b: *w` | MATCH (double-sided VALID, unchanged) | **MATCH** (grid B group; H5, H19, H24 cross-mapping negative controls) |
| Canonical folding, 8 shapes (int/bool/null/quoted/tagged/NaN) | MATCH | **MATCH** (grid C group + H9–H12, H16, H22, H26–H29) |
| Alias key twice spread, sequences in flow, flow `on:`, anchor defined in same flow, deep nesting, two anchors same value, flow `jobs:`, forward reference, alias to collection, chained alias | MATCH | **MATCH** (grid C group; H6, H13, H15, H18, H21, H30 supplements) |
| Non-duplicate alias keys, different-anchor alias keys, nested/explicit-key shapes (new this round) | MATCH | **MATCH** (§2 groups) |

Conclusion (R19 §4): the new rule's trigger boundary matches the Oracle's
`_duplicate_key_canonical` folding; no false positives or misses found.

## 5. Trial-freeze triple-hash reproduction (clean clone, `--trial`, ×3)

Three `npm run release:freeze -- --trial` runs at `9dac3e1` in the clean
clone `~/workspace/p020-r19-review`; all three hashes identical every time:

| Artifact | SHA-256 | Note |
|---|---|---|
| source.zip | `3c059bc351b5204f90ae6ea521a4941c2a0d02c2a140b612304912af8731be91` (2,693 files) | identical to the fix report's value; differs from R18's `1b527601…` (2,597 files) as expected (`src/` change + new evidence/fixtures) |
| dist.zip | `b8e2aa77074cd2f62a518c1c7969cfdaa7cff202c6d87239080c3dfe2c6d335c` (114 files) | identical to the fix report's value; changed from FIX-P0-18's `f2bcd53f…` as expected after the `src/` change |
| RELEASE_MANIFEST.json | `89ff8504cc24aeb467bc2a4a714cd5b46a39311d68f90feb2c9079e3bcffecf6` | **identical to the fix report §6 value, reproduced three times** |

`sha256sum -c SHA256SUMS.txt` 3/3 OK (verified in `release/` on the third
trial run; the first two runs' checks were executed in the wrong working
directory and are not counted). After the trials the clone's `release/`
was restored with `git checkout release/` (HEAD formal artifacts:
source.zip `3a778b93…`, dist.zip `da130ad2…`).

## 6. Full acceptance re-run (clean clone, HEAD `9dac3e1`)

| Command | Result |
|---|---|
| `npm run typecheck` | **PASS** (`tsc --noEmit`, exit 0) |
| `npm test` | **1697/1697** (53 test files; baseline 1661 + 36 new) |
| `npm run test:oracle` | 167/167, 0 mismatch, 0 false PASS; unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 128 fixtures, 0 mismatch |
| `npm run oracle:diff:jobs` | 48 fixtures, 0 mismatch |
| `npm run oracle:diff:checks` | 46 fixtures, 0 mismatch |
| `npm run oracle:diff:witness` | 44 fixtures, 0 mismatch |
| `npm run s0:oracle` | 0 mismatch, 0 false PASS, 2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**; oracle 24/24; 100 runs, 1 unique hash (gate hash differs from the committed `f511a847…` only in `environment_fingerprint` — different clone path; all other fields identical, including `input_fixture_sha256`, all conditions true, determinism 100/1, unsupported 2/2; same phenomenon as R4–R18, not a regression) |
| `npm run release:verify` | **PASS**; license guard: no LICENSE file, `LICENSE_STATUS.md` still `PENDING_SAM_DECISION` |
| `npx eslint src/core/workflow-parser.ts src/core/e2e.ts tests/unit/diff-boundaries/duplicate-alias-key-p0-19.test.ts` | exit 0, no warnings |
| `python3 scripts/build-golden.py --check-only` | golden cases 167, exit 0 |

**Probe-matrix re-runs (clean clone, in-repo runners, full JSON deep equality):**

| Matrix / probe | Result |
|---|---|
| fix-p0-04 | **100/100 MATCH** (first 66 rows, R5 subset: 66/66) |
| fix-p0-05 | **76/76 MATCH** |
| fix-p0-06 | **134/134 MATCH** |
| fix-p0-07 | **86/86 MATCH** |
| fix-p0-08 | **164/164 MATCH** |
| fix-p0-09 | **98/98 MATCH** |
| fix-p0-10 | **314/314 MATCH** |
| fix-p0-11 | **248/248 MATCH** (0 flagged) |
| fix-p0-12 | **486/486 MATCH** (0 flagged) |
| fix-p0-13 | **196/196 MATCH** (0 flagged) |
| fix-p0-14 | **114/114 MATCH** (0 flagged) |
| fix-p0-15 | **260/260 MATCH** (0 flagged) |
| R10 probe | **88/88 MATCH** |
| R11 probe | **74/74 MATCH** |
| R12 probe | **118/118 MATCH** |
| R13 probe | **98/98 MATCH** |
| R14 probe | **78/78 MATCH** (22 FLAG STALE checks = 11 rows, expected at the time) |
| R15 probe | **122/122 MATCH** (24 FLAG STALE, expected at the time) |
| R16 probe | **362/362 MATCH** |
| R17 probe | **141/141 MATCH** |
| R18 hunt probe | **50/50 MATCH** |
| R18 adjudication probe | **22/22 MATCH** |
| R18 adjudication-2 probe | **10/10 MATCH** |
| fix-p0-16 grid | **238/238 MATCH** (119 shapes) |
| fix-p0-17 grid | **216/216 MATCH** (108 shapes) |
| fix-p0-18 grid | **79/79 MATCH** |
| fix-p0-19 grid | **70/70 MATCH** (35 shapes; A 16/16, B 18/18, C 36/36) |
| R19 self-hunt probe | **60/60 MATCH** (0 DIFF, §2) |

**Total: 4,102 checks** (twelve matrices 2,276 + R10–R17 probes 1,081 +
fix-p0-16/17 grids 454 + fix-p0-18/19 grids 149 + R18 three probe sets 82 +
R19 hunt probe 60; matrices and probes overlap in shapes, so the total is
a check count, not a de-duplicated shape count), **0 DIFF**.

## 7. Verdict on R19 (re-verification)

**PASS — P0 0 / P1 0 / P2 8.** The R18 P0 family is closed (all five probe
sets re-run green, §1); the self-hunt probe found no new divergence (§2);
the parser-layer reproduction and boundary checks agree with the fix
report (§3, §4); the trial manifest hash reproduces three times (§5);
the full acceptance battery passes (§6). The 8 P2s from R19 §5 are all
non-blocking and unchanged from R18 (P2-R3-3, P2-R2-3, Windows PowerShell
Quick Start NOT_TESTED, USER_VALUE no human data, one-generation lag,
manifest `freeze_commit` PENDING by design, P2-R6-1, P2-R6-2).

**R3-FINAL addendum (2026-11-10, recorded after R19, not part of the R19
review):** P2-R6-1 (manifest `inputs` recorded T013 reviews only to R3)
was FIXED by the T014 R3 formal re-freeze — the R3 manifest
(`f4ba7a17…`) records `t013_review_r4`…`t013_review_r19`. P2-R3-1
(`True:` vs `true:` residual) was already closed before R19 by FIX-P0-02
and verified by T013 R4 §1; the R4 manifest records it RESOLVED (see
`release/RELEASE_NOTES_R3.md`, "R3-FINAL correction"). The R19 report's
own §5 list is preserved verbatim above as the historical record; the
addendum states the post-R19 status only.

## 8. Method note

Probes were run against the clean clone at the candidate commit
(`git clone` + `git checkout 9dac3e1`, `npm ci`); no work was done in the
main repository's working tree during the review (the R4 contamination
lesson). Probe artefacts are committed in `evidence/probes/r19/`
(`cases.json`, `gen-cases.py`, `r19-probe.py`, `results.json`,
`parser-probe-p19-r19.txt` / `parser-probe-p19b-r19.txt`, `reruns/`,
README) — not left in `/tmp` (the P2-R6-2 lesson). The fix report
commit `3991856` contains report text only and was not in the code
review scope; all figures in this pack were independently re-run by the
R19 reviewer and are quoted here from `INDEPENDENT_REVIEW_R19.md`.
