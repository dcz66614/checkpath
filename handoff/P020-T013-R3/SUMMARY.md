# P020 T013 Round 3 — Independent Re-review (after final-review R1 fixes) — SUMMARY

- **Reviewer:** independent T013 R3 reviewer (fresh session; isolated from builders, fix executors, and R1/R2 reviewers; review only, no code changed)
- **Review object:** HEAD `2d73c1c` (7 commits above freeze baseline `3e5e145`)
- **Report:** `evidence/review/INDEPENDENT_REVIEW_R3.md` (24,036 bytes)
- **Date:** 2026-11-08

## Verdict

# **PASS — P0 0 / P1 0 / P2 3**

Both R1 blockers are genuinely fixed and independently reproduced. All six R1 P2s are closed. Three new minor, non-blocking P2s.

## P1-1 (dup-key Oracle) — CLOSED

- Oracle `_StrictBaseLoader` rejects duplicate mapping keys at both `yaml.load` call sites (my grep: only two call sites in the tree).
- My own probes: all three forms Oracle `INVALID / yaml_parse_error / events []`; TS `Map keys must be unique`.
- All three forms in automated comparison: trigger 44, golden 83 — my runs: test:oracle 83/83, 0 mismatches, 0 false PASS; trigger/jobs/checks/witness 44/48/46/44, all 0 mismatches.
- Old "should differ" unit test rewritten to assert agreement; ADR FIX-P2/01 history kept, FIXED status added, waiver superseded.
- S0 gate re-run by me: PASS, `gate_report_sha256 f511a847…` unchanged.

## P1-2 (freeze script in source.zip) — CLOSED

- Trial source.zip `2057e207…` (1,203 files) contains the script; three-way hash `d4a5784e…` verified by me (zip bytes = `36476cf` file = manifest `freezer.sha256`).
- dist.zip `da130ad2…` unchanged; `sha256sum -c` 3/3 OK.
- **Fresh-clone reproduction done by me:** fresh clone at `36476cf` + `npm ci` + `--freeze --trial` → all three hashes byte-identical to the in-repo trial freeze (source `2057e207…`, dist `da130ad2…`, manifest `67452875…`).
- HEAD (`2d73c1c`) trial freeze run twice in a fresh clone: identical three hashes (source `449ec803…`, 1,207 files; dist `da130ad2…`; manifest `867abde2…`); script-in-zip = repo file = manifest hash (`7598e960…`); updated `known_limitations` present.
- Clean-dir literal re-run: script found (R1 exit-2 gone), now fails at `git rev-parse HEAD` — see P2-R3-3.
- Freezer script read in full: packaging logic sound; deadlock fix (`36476cf`, interleaved write/read) correct and proven at 1,203/1,207 files; vendored yaml 2.9.1 + LICENSE verified in dist.zip, matches lockfile; clean-dir dist demo exit 2 verified by me.

## R1 P2s — all six CLOSED

- P2-1: expanded network check 45 files (counted by me), 0 matches (my own grep).
- P2-2: dup-name fixture (parser-divergence + T6-19 + G-83).
- P2-3: README P95 768.3 ms / RSS 98.3 MiB — recomputed from PERFORMANCE_REPORT.json (31 runs, ok).
- P2-4: venv record exists; 3 dup forms identical under PyYAML 6.0.1 and 6.0.3 (my spot check).
- P2-5: Windows NOT_TESTED honestly recorded (RELEASE_NOTES + manifest).
- P2-6: T014 report §9 + manifest source/freeze_commit/history (verified: `3e5e145^` = `933dd35`, 1 commit).

## New P2s (non-blocking)

- **P2-R3-1:** `True:` vs `true:` residual — TS INVALID, Oracle UNKNOWN. Fail-closed, no realistic input, no fix required.
- **P2-R3-2:** formal re-freeze manifest hardcodes `t013_review_r2`; it will not record this R3 review. Extend the freezer before the formal re-freeze, or state it explicitly in the R2 submission.
- **P2-R3-3:** literal clean-dir (no `.git`) `release:freeze` still fails at `git rev-parse HEAD` — by design; fresh-clone substitute verified byte-identical. Must be stated plainly to GPT R2.

## Four honest reminders — judgments

- (a) Clean-dir failure: acceptable (P2-R3-3), substitute adequate.
- (b) Trial zip predates `2f3072c`: confirmed text-only (3 string literals); HEAD freeze picks up the corrected text; formal re-freeze regenerates the manifest.
- (c) `True:`/`true:`: real but negligible (P2-R3-1), fail-closed.
- (d) `handoff/P020-FIX-P1-01/` mixes old (T013-era) and new (R1) reports: confirmed, recorded only, no fix.

## Regression (all re-run by me at HEAD 2d73c1c)

npm test 855/855; test:oracle 83/83 0 mismatch 0 false PASS; trigger 44, jobs 48, checks 46, witness 44, all 0 mismatches; build-golden --check-only exit 0; s0:gate PASS (100 runs / 1 hash, f511a847…); release:verify PASS; specs unchanged (028c2472…/bb645205…); license PENDING_SAM_DECISION, no LICENSE file. Work tree: only 4 regenerated evidence JSONs modified + untracked `reports/` (pre-existing state; no commits made by this review).

## Environment note

`/tmp` is a 512 MB tmpfs and filled up during the first fresh-clone `npm ci` (ENOSPC). Stale scratch removed (logs preserved in repo); clean-clone verifications were run from `~/workspace/r3-clean-clone*` and deleted afterwards. Future clean-clone checks should use workspace disk or clean `/tmp` first.

## Next steps (coordinator)

1. Decide P2-R3-2 (record R3 in the freezer before the formal re-freeze, or state it in the R2 submission).
2. Formal T014 re-freeze at current HEAD (NOT the trial artifacts in `release/`).
3. Drive re-archive, then final review R2 in the same establishment conversation, stating: both P1s fixed + R3 PASS; the three new P2s in full; trial manifest staleness; P2-R3-3 plainly.
4. No ACCEPTED marking, no completion notice, no P021 until final PASS.
