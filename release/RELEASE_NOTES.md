# CheckPath — Release Notes (T014 formal re-freeze, R4)

- **Project:** P020 CheckPath — deterministic GitHub Actions
  required-check coverage simulator (local CLI + offline HTML report)
- **Spec version:** 1.0.0 (`P020_PROJECT_BOOK.md`,
  SHA-256 `028c2472…`; `P020_IMPLEMENTATION_PLAN.md`,
  SHA-256 `bb645205…` — both unchanged)
- **Source commit:** `2ddc2ad`
  (`2ddc2ad0a7afd34bc2d5fe989f7d2e2bdb4e0b98`, "R3-FINAL-04: git
  final check report (real outputs, 9dac3e1/3a83371/4c67520 chain)")
- **Freeze commit:** recorded in
  `evidence/release/T014_FREEZE_REPORT_R4.md` §9 (the freeze commit
  does not exist until the freeze artifacts are committed; this
  final edition of the notes is committed in the freeze commit
  itself)
- **Review:** T013 independent review round 19, verdict **PASS**
  (P0 0 / P1 0 / P2 8); see
  `evidence/review/INDEPENDENT_REVIEW_R19.md`
  (SHA-256 `c6ec2c2415baedeab47914f34f1fe7238ca910ff1cc158e7ba417cbed2750470`).
  No code changed since R19: the R4 re-freeze is a documentation /
  traceability / packaging re-freeze only (R3-FINAL-01…04), with
  zero `src/` / `oracle/` / `tests/` changes.
- **Why a re-freeze:** the final review (round 4) returned FAIL
  (P0 0 / P1 0 / P2 7) on T014 final-release acceptance — not on
  the algorithm (R19 core fix passed independent review; no new
  P0/P1). Its four documentation/traceability blockers are closed
  by this re-freeze: (1) the T014 R3 freeze report is now inside
  the frozen package (it was in-tree but outside the R3 source.zip)
  and its header freeze commit is closed to `d8ffdeb`;
  (2) R3 Release Notes now exist as a standalone file
  (`release/RELEASE_NOTES_R3.md`, full R3 hashes) and as the
  complete R3 chapter below; (3) `REVIEW_INDEX.md` now covers
  rounds R3–R19, with a new R19 coverage matrix
  (`evidence/review/COVERAGE_MATRIX_R19.csv`), review pack
  (`evidence/review/REVIEW_PACK_03.md`) and sums
  (`evidence/review/REVIEW_SHA256SUMS_R19.txt`); (4) the Git chain
  is closed in the manifest (`freeze_history`: R2 → `03c2f16`,
  R3 → `d8ffdeb`) and evidenced in
  `evidence/release/GIT_FINAL_CHECK_R4.md`.
- **Freeze history:** R1 formal freeze `3e5e145` (source
  `933dd35`); FIX-P1-02 trial freeze `7638f06` (source `36476cf`,
  trial only); R2 formal re-freeze `03c2f16` (source `538c669`);
  R3 formal re-freeze `d8ffdeb` (source `3a83371`); this R4 formal
  re-freeze (source = R3-FINAL HEAD, freeze commit in
  `T014_FREEZE_REPORT_R4.md` §9). The full chain is in
  `RELEASE_MANIFEST.json` (`freeze_history`).
- **License status:** `PENDING_SAM_DECISION` — no LICENSE file exists
  and no license has been selected. Do not redistribute as licensed
  work. `LICENSE_STATUS.md` is included in both archives.
- **Version:** `0.0.0-t001-skeleton` (from `package.json`; the product
  has no separate release version number)

## What is in this release

| File | SHA-256 | Contents |
|---|---|---|
| `source.zip` | `ab23e4a70bef6e462e47875ccbecce4d3a6167a4d9cd3a3b204d9cd0e39a41ba` | Exact archive of the R3-FINAL source tree (2,734 tracked files at `2ddc2ad`): TypeScript source, Python Reference Oracle, tests, examples, README, dependency locks, docs, build scripts, evidence and handoff records. No `.git`, `node_modules`, `dist/`, `reports/` or other untracked content. |
| `dist.zip` | `b8e2aa77074cd2f62a518c1c7969cfdaa7cff202c6d87239080c3dfe2c6d335c` | Directly runnable CLI bundle (114 files, byte-identical to the R3 `dist.zip`: no `src/` change since FIX-P0-19): fresh `npm run build` output (`checkpath.mjs` at the root), the vendored `yaml` 2.9.1 runtime (see below), synthetic examples, offline HTML assets (`index.html` + `assets/`), `QUICKSTART.md`, `LICENSE_STATUS.md`, `THIRD_PARTY_NOTICES.md`. No source maps. |
| `SHA256SUMS.txt` | — | SHA-256 of `source.zip`, `dist.zip` and `RELEASE_MANIFEST.json` (verify with `sha256sum -c SHA256SUMS.txt`). |
| `RELEASE_MANIFEST.json` | `2076f08773c0d765140cd74936c20b70259fce7da8f87ddbdd18a60920633baa` | Machine-readable manifest: commit, toolchain, input fixture / Oracle parity / S0 gate / T013 review hashes (R1–R19), both ZIP hashes, freeze history with R2/R3 freeze commits closed. |

Both ZIPs are deterministic: entries sorted by path, fixed
timestamp `1980-01-01T00:00:00Z`, fixed permissions (files `0644`,
directories `0755`), `ZIP_DEFLATED` level 9. A re-run of
`npm run release:freeze` at the source commit reproduces all three
hashes byte-for-byte (verified by a `--trial` freeze before the
formal run, twice, same hashes; see
`evidence/release/T014_FREEZE_REPORT_R4.md` §3).
Verify the archives with
`python3 scripts/deterministic-zip.py --verify release/source.zip`
and `--verify release/dist.zip` (checks ordering, timestamps,
permissions, relative entry names and CRCs).

**One-generation lag, disclosed:** `source.zip` is the exact HEAD
tree at the source commit, so the `release/RELEASE_NOTES.md`
inside it is the pre-freeze edition (R4 hashes listed as "see
SHA256SUMS.txt" because they did not exist yet at freeze time).
This file is the post-freeze final edition — with the formal R4
hashes filled in — committed in the freeze commit and uploaded to
Drive `01_release_R4` alongside the ZIPs. The manifest is the
authoritative hash record.

## R3 release (superseded, preserved — complete chapter)

The R3 formal re-freeze, in full (the standalone file
`release/RELEASE_NOTES_R3.md` in this same package carries the
same content):

- **Source commit:** `3a83371`
  (`3a8337151461b80e4ae50e75ab2edf417f4f9165`); **freeze commit:**
  `d8ffdeb` (`d8ffdebb775e5b3241936ec86c11689c51f29bf1`,
  2026-11-10 00:34 UTC; `git rev-parse d8ffdeb^` → `3a83371…`).
- **Review:** T013 round 19, verdict **PASS** (P0 0 / P1 0 / P2 8),
  `evidence/review/INDEPENDENT_REVIEW_R19.md`
  (SHA-256 `c6ec2c2415baedeab47914f34f1fe7238ca910ff1cc158e7ba417cbed2750470`).
- **Hashes:** `source.zip`
  `9a54081ec8d322f0f7d78c6c08a2dc8cf9370396a026a7a2d6fd0e85b4dc83cd`
  (2,728 files); `dist.zip`
  `b8e2aa77074cd2f62a518c1c7969cfdaa7cff202c6d87239080c3dfe2c6d335c`
  (114 files); `RELEASE_MANIFEST.json`
  `f4ba7a17bf188fbea8acf61ffbf7ee01b5011b27a8cc2f0310122c3e3a332465`.
- **What changed vs R2:** FIX-P0-19 (`hasDuplicateAliasKey` in
  `src/core/workflow-parser.ts` +127/−1, `src/core/e2e.ts` +7/−2);
  manifest records all 19 T013 rounds (P2-R6-1 FIXED); R14/R15
  stale-flag rows cleared (78/78 and 122/122, both exit 0).
- **Verification at R3 freeze time:** `npm test` 1697/1697;
  `test:oracle` 167/167, 0 mismatches, 0 false PASS;
  `oracle:diff` 128/48/46/44, all 0 mismatches; `s0:gate` PASS,
  `gate_report_sha256 f511a847…` unchanged; `release:verify` PASS;
  R19 re-verification 4,102 checks, 0 DIFF.
- **Known limitations at R3:** R19's 8 P2s, all non-blocking
  (P2-R3-3 clean-dir freeze by design; P2-R2-3 README perf
  snapshots; Windows PowerShell Quick Start NOT_TESTED; USER_VALUE
  no human data; one-generation lag; manifest `freeze_commit`
  PENDING by design; P2-R6-1 FIXED by the R3 freeze; P2-R6-2
  partially mitigated, R7/R8 probes lost, R9–R19 archived).
  **R3-FINAL correction:** P2-R3-1 (`True:` vs `true:`) was listed
  as a residual in the R3 manifest but had already been closed by
  FIX-P0-02 and verified by T013 R4 §1 (both sides INVALID /
  `yaml_parse_error`, fixture-locked T6-20 / dup-bool-true / G-84);
  the R4 manifest records it RESOLVED.
- **License:** `PENDING_SAM_DECISION`.
- **R2 archiving:** R2 (source `538c669`, freeze `03c2f16`,
  source.zip `3a778b93…` 1,209 files, dist.zip `da130ad2…`,
  manifest `04a07733…` FORMAL) preserved in git history and Drive
  `01_release_R2`, never overwritten.

## Quick Start (from `dist.zip`)

Machine needs Node.js 24.x only — no `npm ci`, no network, no token:

```sh
node checkpath.mjs demo
node checkpath.mjs analyze --repo examples/repo-basic --scenario examples/scenarios/pr-docs-only.json --required-checks examples/required-checks.yml --out reports/pr-docs-only
node checkpath.mjs matrix --repo examples/repo-basic --suite examples/suites/merge-queue.json --required-checks examples/required-checks.yml --out reports/merge-queue
```

The demo exits with code **2** — that is the gate outcome for the
demo scenario (both required checks `PENDING_NOT_REPORTED`), not a
failure. Full instructions are in `QUICKSTART.md` inside `dist.zip`.
Exit codes: `0` gate green, `2` pending/ambiguous/unknown,
`3` invalid input.

## Verification at freeze time (all personally run, exit 0)

At the R3-FINAL source HEAD, before the formal freeze:

- `npm run typecheck`, `npm run lint` — clean.
- `npm test` — **1697/1697** (53 files; unchanged since R19: no
  `src/` / `oracle/` / `tests/` change in R3-FINAL).
- `npm run test:oracle` — **167/167**, 0 mismatches, 0 false PASS,
  unsupported UNKNOWN 34/34.
- `npm run s0:gate` — **PASS**; oracle 24/24, 0 mismatches,
  0 false PASS; determinism 100 runs, 1 unique hash;
  `gate_report_sha256 f511a847…` unchanged.
- `npm run release:verify` — **PASS** (build determinism; CLI smoke;
  report hash recompute; offline scan; license guard).
- `python3 evidence/probes/r14/r14-probe.py` — **78/78 MATCH**,
  0 DIFF, 0 stale flag.
- `python3 evidence/probes/r15/r15-probe.py` — **122/122 MATCH**,
  0 DIFF, 0 stale flag.
- `--trial` freeze at the source HEAD, run twice: identical hashes
  both times (see `evidence/release/T014_FREEZE_REPORT_R4.md` §3).
- `SHA256SUMS.txt`: all three entries verified with `sha256sum -c`
  after the formal freeze.

## Known limitations (read before use)

1. **P2-R3-3 — clean-directory `release:freeze` without `.git`
   fails by design.** A literal extraction of `source.zip`
   (no `.git`) cannot run the freeze: it fails at
   `git rev-parse HEAD` (`fatal: not a git repository`), because
   the freeze identifies the frozen tree by commit. The accepted
   substitute is a fresh-clone re-run, verified byte-identical.
2. **P2-R2-3 — README performance figures are single-run
   snapshots.** The README cites P95 768.3 ms / peak RSS 98.3 MiB;
   independent re-runs measured P95 697.9 ms / 100.2 MiB (T013 R2)
   and P95 701.2 ms / 101.1 MiB (T012). All are far inside the
   thresholds (P95 ≤ 1000 ms, peak RSS ≤ 256 MiB).
3. **Windows PowerShell Quick Start NOT_TESTED (U-01).** The Linux
   Quick Start is verified; the PowerShell commands are the same
   commands on single lines, but no Windows machine was available
   to run them. Do not treat them as tested.
4. **USER_VALUE has no real-human experiment data.** Zero-human
   constraint: no human data exists; nothing here claims otherwise.
5. **source.zip contains the previous generation's freeze
   artifacts and older Release Notes (one-generation lag).**
   See "One-generation lag" above; the manifest is authoritative.
6. **The manifest's `freeze_commit` field reads PENDING by design.**
   A freeze run cannot know its own future freeze commit hash; the
   real hash is recorded in `evidence/release/T014_FREEZE_REPORT_R4.md`
   §9. `freeze_history` now closes the earlier runs: R2 →
   `03c2f16`, R3 → `d8ffdeb`.
7. **P2-R6-1 — manifest `inputs` recorded T013 reviews only to R3
   — FIXED by the R3 re-freeze** (manifest records R4–R19).
8. **P2-R6-2 — review-probe evidence not all in the repository —
   PARTIALLY MITIGATED, still open as a historical residual.**
   The R7/R8 self-written probes lived only in `/tmp` and were lost
   in a VM restart (reconstructible only from report text); R9–R19
   probes are archived in `evidence/probes/r9/`–`r19/`. Non-blocking.
9. **P2-R3-1 — `True:` vs `true:` residual divergence — RESOLVED.**
   Closed by FIX-P0-02 (Oracle `_StrictBaseLoader` folds
   `True:`/`true:` to one bool key) and verified by T013 R4 §1
   (the R2 input now returns INVALID / `yaml_parse_error` on both
   sides, MATCH; fixture-locked by T6-20-dup-bool-true,
   dup-bool-true.yml case 4, golden G-84). Note: R4 does not cite
   the label "P2-R3-1" literally; the closure is of the exact
   underlying divergence R3 recorded.
10. **P2-6 (final review R4) — `USER=root` ZIP-validator false
    positive (tool defect, NOT a product defect).**
    `scripts/deterministic-zip.py` `do_verify` flags any entry
    name containing the `$USER` substring; run as root it fails
    `release/source.zip` with 5 "username in entry name" FAILs on
    fixture filenames containing `root` (e.g.
    `tests/fixtures/parser-divergence/anchored-empty-key/k01-anchored-root.yml`).
    Verified live 2026-11-10: `USER=root` → exit 1 (5 FAILs);
    `USER` unset → verify OK. The ZIPs are unaffected. (Not to be
    confused with final-review R3's P2-6, the false "hashes
    unchanged" claim, which GPT revoked in R4.)

## Packaging note (freeze-discovered, F-T014-01)

The first frozen `dist.zip` could **not** run standalone: the built
CLI imports the `yaml` npm package (`from "yaml"` in
`dist/core/workflow-ir.js`, `workflow-parser.js`, `e2e.js` and
`dist/cli/commands/common.js` — the only bare package import in
`dist/`), and the bundle shipped no `node_modules`, so
`node checkpath.mjs demo` failed with `ERR_MODULE_NOT_FOUND`
outside the repository. The in-repo `release:verify` could not catch
this (it runs `dist/` with the repo's `node_modules` present).
Packaging-only fix, no product code / fixture / doc / `source.zip`
change: `dist.zip` vendors the exact locked runtime dependency —
`yaml` 2.9.1 (`node_modules/yaml`: `package.json`, `LICENSE`,
`dist/**/*.js`, 76 files; browser build, `.d.ts`, `bin.mjs` and
`README.md` excluded as unused at runtime). The standalone demo was
then verified end to end (see "Verification" above). The freeze
script that performs the vendoring (`scripts/deterministic-zip.py`)
was created by the T014 task itself — it did not exist before T014
(`package.json` referenced it, T012 only rehearsed packaging).
