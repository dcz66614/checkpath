# CheckPath — Release Notes (T014 formal re-freeze, R3)

- **Project:** P020 CheckPath — deterministic GitHub Actions
  required-check coverage simulator (local CLI + offline HTML report)
- **Spec version:** 1.0.0 (`P020_PROJECT_BOOK.md`,
  SHA-256 `028c2472…`; `P020_IMPLEMENTATION_PLAN.md`,
  SHA-256 `bb645205…` — both unchanged)
- **Source commit:** `3a83371`
  (`3a8337151461b80e4ae50e75ab2edf417f4f9165`, "T014: freezer
  records T013 reviews R4-R19 in manifest inputs (P2-R6-1)")
- **Freeze commit:** `d8ffdeb`
  (`d8ffdebb775e5b3241936ec86c11689c51f29bf1`, "T014: Formal
  re-freeze (R3) — source.zip 9a54081e… dist.zip b8e2aa77…",
  2026-11-10 00:34 UTC). The freeze commit's direct parent is the
  source commit (`git rev-parse d8ffdeb^` → `3a83371…`; see
  `evidence/release/T014_FREEZE_REPORT_R3.md` §9).
- **Review:** T013 independent review round 19, verdict **PASS**
  (P0 0 / P1 0 / P2 8); see
  `evidence/review/INDEPENDENT_REVIEW_R19.md`
  (SHA-256 `c6ec2c2415baedeab47914f34f1fe7238ca910ff1cc158e7ba417cbed2750470`).
  Round 19 closes the last P0 family (FIX-P0-19, code `9dac3e1`:
  TS-side `hasDuplicateAliasKey` rejects flow-mapping alias keys
  resolving to duplicate scalars). All 19 T013 rounds (R1–R19)
  are recorded in `RELEASE_MANIFEST.json` (`inputs.t013_review_r*`).
- **Freeze history:** R1 formal freeze `3e5e145` (source
  `933dd35`); FIX-P1-02 trial freeze `7638f06` (source `36476cf`,
  trial only); R2 formal re-freeze `03c2f16` (source `538c669`);
  this R3 formal re-freeze `d8ffdeb` (source `3a83371`). The full
  chain is in `RELEASE_MANIFEST.json` (`freeze_history`).
- **License status:** `PENDING_SAM_DECISION` — no LICENSE file exists
  and no license has been selected. Do not redistribute as licensed
  work. `LICENSE_STATUS.md` is included in both archives.
- **Version:** `0.0.0-t001-skeleton` (from `package.json`; the product
  has no separate release version number)

## What is in this release

| File | SHA-256 | Contents |
|---|---|---|
| `source.zip` | `9a54081ec8d322f0f7d78c6c08a2dc8cf9370396a026a7a2d6fd0e85b4dc83cd` | Exact archive of the release-candidate tree (2,728 tracked files at `3a83371`): TypeScript source, Python Reference Oracle, tests, examples, README, dependency locks, docs, build scripts, evidence and handoff records. No `.git`, `node_modules`, `dist/`, `reports/` or other untracked content. |
| `dist.zip` | `b8e2aa77074cd2f62a518c1c7969cfdaa7cff202c6d87239080c3dfe2c6d335c` | Directly runnable CLI bundle (114 files): fresh `npm run build` output (`checkpath.mjs` at the root), the vendored `yaml` 2.9.1 runtime (see below), synthetic examples, offline HTML assets (`index.html` + `assets/`), `QUICKSTART.md`, `LICENSE_STATUS.md`, `THIRD_PARTY_NOTICES.md`. No source maps. |
| `SHA256SUMS.txt` | — | SHA-256 of `source.zip`, `dist.zip` and `RELEASE_MANIFEST.json` (verify with `sha256sum -c SHA256SUMS.txt`). |
| `RELEASE_MANIFEST.json` | `f4ba7a17bf188fbea8acf61ffbf7ee01b5011b27a8cc2f0310122c3e3a332465` | Machine-readable manifest: commit, toolchain, input fixture / Oracle parity / S0 gate / T013 review hashes (R1–R19), both ZIP hashes, freeze history. |

Both ZIPs are deterministic: entries sorted by path, fixed
timestamp `1980-01-01T00:00:00Z`, fixed permissions (files `0644`,
directories `0755`), `ZIP_DEFLATED` level 9. A re-run of
`npm run release:freeze` at the source commit reproduces all three
hashes byte-for-byte (verified by the R19 reviewer in a fresh clone
at `9dac3e1` with `--trial`, three times: source `3c059bc3…`
(2,693 files at that commit), dist `b8e2aa77…`, manifest
`89ff8504…`; see `evidence/review/INDEPENDENT_REVIEW_R19.md` §9).
Verify the archives with
`python3 scripts/deterministic-zip.py --verify release/source.zip`
and `--verify release/dist.zip` (checks ordering, timestamps,
permissions, relative entry names and CRCs).

**What changed vs R2:** `src/` changed in FIX-P0-19
(`hasDuplicateAliasKey` in `src/core/workflow-parser.ts` +127/−1,
wiring in `src/core/e2e.ts` +7/−2), so `dist.zip` changed
(`da130ad2…` → `b8e2aa77…`, byte-identical to the FIX-P0-19 trial
bundle and to the R19 review's three trial reproductions).
`source.zip` grew 1,209 → 2,728 files through the R4–R19
fix/review loop (fixtures, probes, evidence, review reports);
reconciled in `evidence/release/T014_FREEZE_REPORT_R3.md` §1
(trial freeze at `9dac3e1`: 2,693 files; +1 FIX-P0-19 report
commit `3991856`; +34 R19 evidence commit `9fd0233` = 2,728).
The manifest now records all 19 T013 review rounds (P2-R6-1 FIXED)
and the R14/R15 stale-flag probe rows are cleared (both probes
exit 0).

**One-generation lag, disclosed:** `source.zip` is the exact HEAD
tree at the source commit, so the `release/RELEASE_NOTES.md`
inside it is the R2-era notes (same as R2, where the zip contained
the R1-era notes). These R3 notes were recorded at the freeze
commit and in Drive `01_release_R3`. The manifest is the
authoritative hash record.

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

- `npm run typecheck` — clean.
- `npm test` — **1697/1697** (53 files).
- `npm run test:oracle` — **167/167**, 0 mismatches, 0 false PASS,
  unsupported UNKNOWN 34/34.
- `npm run oracle:diff:trigger` / `jobs` / `checks` / `witness` —
  128 / 48 / 46 / 44 fixtures, all 0 mismatches.
- `npm run s0:oracle` — S0 24/24, 0 mismatches, false PASS 0,
  UNKNOWN 2/2.
- `npm run s0:gate` — **PASS**, 100 runs, 1 hash,
  `gate_report_sha256 f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`
  (unchanged, independently recomputed).
- `npm run release:verify` — **PASS** (build determinism; CLI smoke;
  report hash recompute; offline scan; license guard:
  no LICENSE file, `LICENSE_STATUS.md` still
  `PENDING_SAM_DECISION`).
- `python3 evidence/probes/r14/r14-probe.py` — **78/78 MATCH**,
  0 DIFF, 0 stale flag (after clearing).
- `python3 evidence/probes/r15/r15-probe.py` — **122/122 MATCH**,
  0 DIFF, 0 stale flag (after clearing).
- R19 independent re-verification (clean clone at `9dac3e1`):
  R18 hunt probe 50/50, adjudication 22/22 + 10/10, fix-p0-18 grid
  79/79, fix-p0-19 grid 70/70, self-hunt 60/60 with 0 new
  divergence; twelve fix matrices + R10–R17 probes + fix-p0-16/17
  grids + R18/R19 probes re-run: **4,102 checks, 0 DIFF**
  (see `evidence/review/INDEPENDENT_REVIEW_R19.md` §8).
- `SHA256SUMS.txt`: all three entries verified with `sha256sum -c`.

## Known limitations (read before use)

R19's 8 P2s, all non-blocking (see
`evidence/review/INDEPENDENT_REVIEW_R19.md` §5):

1. **P2-R3-3 — clean-directory `release:freeze` without `.git`
   fails by design.** A literal extraction of `source.zip`
   (no `.git`) cannot run the freeze: it fails at
   `git rev-parse HEAD` (`fatal: not a git repository`), because
   the freeze identifies the frozen tree by commit. The accepted
   substitute is a fresh-clone re-run, verified byte-identical
   for this freeze (see "Verification" above).
2. **P2-R2-3 — README performance figures are single-run
   snapshots.** The README cites P95 768.3 ms / peak RSS 98.3 MiB;
   independent re-runs measured P95 697.9 ms / 100.2 MiB (T013 R2)
   and P95 701.2 ms / 101.1 MiB (T012). All are far inside the
   thresholds (P95 ≤ 1000 ms, peak RSS ≤ 256 MiB); the exact
   figures vary run to run with VM scheduling.
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
   real hash is recorded in `evidence/release/T014_FREEZE_REPORT_R3.md`
   §9 (`d8ffdeb`) and in `freeze_history` from the next freeze on.
7. **P2-R6-1 — manifest `inputs` recorded T013 reviews only to R3
   — FIXED by this re-freeze.** The manifest now records
   `t013_review_r4`…`t013_review_r19` alongside r1/r2/r3 (verdict +
   p0/p1/p2, hashed from HEAD).
8. **P2-R6-2 — review-probe evidence not all in the repository —
   PARTIALLY MITIGATED, still open as a historical residual.**
   The R7/R8 self-written probes lived only in `/tmp` and were lost
   in a VM restart (reconstructible only from report text); R9–R19
   probes are archived in `evidence/probes/r9/`–`r19/`. Non-blocking.

**R3-FINAL correction (2026-11-10, recorded after this freeze):**
the R3 manifest listed P2-R3-1 (`True:` vs `true:` residual
divergence, TS INVALID vs Oracle UNKNOWN) as an open residual.
That divergence was in fact already closed before this freeze by
FIX-P0-02 and verified by T013 R4 §1 (the R2 input now returns
INVALID / `yaml_parse_error` on both sides, MATCH; fixture-locked
by `tests/fixtures/trigger/T6-20-dup-bool-true`,
`tests/fixtures/parser-divergence/duplicate-key/dup-bool-true.yml`
case 4, golden G-84). R4 does not cite the label "P2-R3-1"
literally; the closure is of the exact underlying divergence R3
recorded. The R4 manifest records P2-R3-1 as RESOLVED on that
basis. No product code changed for this correction — it is a
record correction only.

## R2 archiving (superseded release, preserved)

- R2 formal re-freeze: source commit `538c669`, freeze commit
  `03c2f16` (2026-11-08); `source.zip`
  `3a778b933f827b5d1fbf1d617f40de465ec9bd00590a9bc1003cac2f2409743f`
  (1,209 files), `dist.zip`
  `da130ad2747a810c0f62488245fe7902298199faa6e8372f3975d58b573911e6`
  (114 files), manifest
  `04a07733755c36ba5a614514859ef8698eb2c1b7d92d4c4ebd75d335cfb0a2fb`
  (freeze_status FORMAL).
- R2 files survive in git history (`03c2f16`) and in Drive
  `01_release_R2` — never overwritten. R3 goes to a NEW folder
  `01_release_R3`.

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
then verified end to end (see "Verification" above).
