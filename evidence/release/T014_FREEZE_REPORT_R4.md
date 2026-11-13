# P020 CheckPath — T014 Formal Re-freeze Report (R4)

- **Task:** T014 — 正式重新冻结与 SHA-256 清单 (S5, fourth formal freeze)
- **Source commit:** `2ddc2ad`
  (`2ddc2ad0a7afd34bc2d5fe989f7d2e2bdb4e0b98`, "R3-FINAL-04: git
  final check report (real outputs, 9dac3e1/3a83371/4c67520 chain)")
- **Freeze commit:** `a153b94`
  (`a153b94f2767d93afc415080e29f52b63b173eea`, "T014: Formal
  re-freeze (R4) — source.zip ab23e4a7… dist.zip b8e2aa77…")
  — recorded in §9 after committing; this header was corrected
  in the §9 addendum commit (same R3-FINAL-01 pattern) so the
  report is self-consistent when read standalone. At freeze time
  the header read PENDING by design (the freeze commit did not
  exist yet); §9 is the authoritative addendum and records the
  same value.
- **Date:** 2026-11-10
- **Result:** **PASS** — all acceptance commands exit 0; both ZIPs
  verified; trial freeze reproduced byte-identically twice before
  the formal run; manifest history now closes R2/R3 freeze commits.
- **Why a re-freeze:** the final review (round 4) returned
  FINAL_VERDICT: FAIL (P0 0 / P1 0 / P2 7) on T014 final-release
  acceptance — NOT on the algorithm (T013 R19 = PASS, P0 0 / P1 0 /
  P2 8; no new P0/P1). Its four documentation/traceability blockers
  are closed by the R3-FINAL rework (commits `810a7ef`, `a24e1b2`,
  `a3a1212`, `4f212f7`, `2ddc2ad`, all on top of the R3 §9 addendum
  commit `4c67520`): (1) the R3 freeze report now enters the frozen
  package and its header freeze commit is closed to `d8ffdeb`;
  (2) R3 Release Notes now exist standalone
  (`release/RELEASE_NOTES_R3.md`) and as a complete chapter in the
  R4 notes; (3) `REVIEW_INDEX.md` now covers R3–R19 with a new R19
  coverage matrix, review pack 03 and sums file; (4) the Git chain
  is closed in the manifest (`freeze_history`: R2 → `03c2f16`,
  R3 → `d8ffdeb`) and evidenced in
  `evidence/release/GIT_FINAL_CHECK_R4.md`. The R3 artifacts
  (`d8ffdeb`, source `9a54081e…`) are superseded and kept as history
  in Drive `01_release_R3`; they are NOT overwritten. This report
  covers the R4 formal re-freeze only.
- **Zero humans. No network (except the pre-existing `node_modules`,
  installed before this task), no GitHub API, no token. Synthetic
  data only.**
- **License:** `PENDING_SAM_DECISION` (no LICENSE file created;
  `LICENSE_STATUS.md` unchanged).

## 1. Result summary

| Artifact | SHA-256 | Files |
|---|---|---|
| `release/source.zip` | `ab23e4a70bef6e462e47875ccbecce4d3a6167a4d9cd3a3b204d9cd0e39a41ba` | 2,734 (exact HEAD tree at `2ddc2ad`) |
| `release/dist.zip` | `b8e2aa77074cd2f62a518c1c7969cfdaa7cff202c6d87239080c3dfe2c6d335c` | 114 (29 built + 76 vendored yaml + 6 examples + 2 docs + QUICKSTART.md) |
| `release/RELEASE_MANIFEST.json` | `2076f08773c0d765140cd74936c20b70259fce7da8f87ddbdd18a60920633baa` | — (freeze_status FORMAL) |
| `release/SHA256SUMS.txt` | `sha256sum -c` all OK | 3 entries |

- `source.zip` file count 2,734 vs R3's 2,728: +6, reconciled —
  the R3 freeze report itself (untracked at the R3 source commit,
  committed in `d8ffdeb`) plus the five new R3-FINAL files
  (`release/RELEASE_NOTES_R3.md`,
  `evidence/review/COVERAGE_MATRIX_R19.csv`,
  `evidence/review/REVIEW_PACK_03.md`,
  `evidence/review/REVIEW_SHA256SUMS_R19.txt`,
  `evidence/release/GIT_FINAL_CHECK_R4.md`). Listing identical to
  `git ls-files` at the source commit (one filename carries a
  non-ASCII arrow `→`; `git ls-tree` quotes it octal-escaped,
  the ZIP stores the real UTF-8 name — same file, verified in R3).
- `dist.zip` UNCHANGED vs R3 (`b8e2aa77…`, byte-identical): expected —
  no `src/` change since FIX-P0-19 (`9dac3e1`). This rework touched
  zero `src/` / `oracle/` / `tests/` files (see §5 and
  `GIT_FINAL_CHECK_R4.md` §6, `git diff --quiet … -- src/ oracle/
  tests/` exit 0).
- `RELEASE_MANIFEST.json` records source commit `2ddc2ad`,
  toolchain (Node v24.22.1, npm 10.9.4, Python 3.12.3, PyYAML
  6.0.1, TypeScript 5.9.3, Vite 7.3.7, Vitest 5.1.0, React 19.3.1,
  yaml 2.9.1), S0 input fixture hash, golden suite hash, Oracle
  parity report hash, S0 gate hash `f511a847…`, **all 19 T013
  review hashes (R1–R19)**, both ZIP hashes, the freezer script
  hash (`c2a1c9e8…`, matches the committed patched script), and the
  freeze history chain (R1 formal `3e5e145` ← `933dd35`; trial
  `36476cf`; R2 formal `538c669` → freeze `03c2f16` **closed**;
  R3 formal `3a83371` → freeze `d8ffdeb` **closed**).
- S0 gate still PASS after freeze: `gate_report_sha256 f511a847…`
  unchanged, independently recomputed — matches.
- Specs unchanged: PROJECT_BOOK / IMPLEMENTATION_PLAN untouched
  by this task (only docs, review index/matrix/pack, the freezer
  script, and the freeze artifacts changed).

## 2. Acceptance commands (personally run)

| Command | Exit | Result |
|---|---|---|
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | clean |
| `npm test` | 0 | **1697/1697** (53 files) |
| `npm run test:oracle` | 0 | **167/167**, 0 mismatches, 0 false PASS, unsupported UNKNOWN 34/34 |
| `npm run s0:gate` | 0 | PASS; oracle 24/24, 0 mismatches, 0 false PASS; determinism 100 runs, 1 unique hash; `gate_report_sha256 f511a847…` unchanged |
| `npm run release:verify` | 0 | PASS; all 5 steps (build determinism, cli smoke, report_sha256 recompute, offline static scan, license guard) |
| `python3 evidence/probes/r14/r14-probe.py` | 0 | 78/78 MATCH, 0 DIFF, 0 stale flag |
| `python3 evidence/probes/r15/r15-probe.py` | 0 | 122/122 MATCH, 0 DIFF, 0 stale flag |
| `npm run release:freeze -- --trial` (×2) | 0 | identical hashes both times (see §3): source `ab23e4a7…` (2,734), dist `b8e2aa77…` (114), manifest `231047b0…` (TRIAL text) |
| `npm run release:freeze` (formal, no `--trial`) | 0 | `freeze OK`; source `ab23e4a7…` (2,734), dist `b8e2aa77…` (114), manifest `2076f087…` — all from this run's own stdout |
| `sha256sum -c SHA256SUMS.txt` (in `release/`) | 0 | source.zip OK, dist.zip OK, RELEASE_MANIFEST.json OK |

Full logs: `handoff/P020-T014-R4/test_logs/` (`P020-T014-R4_typecheck.log`,
`…_lint.log`, `…_test.log`, `…_test-oracle.log`, `…_s0-gate.log`,
`…_release-verify.log`, `…_r14.log`, `…_r15.log`,
`…_release-freeze-trial1.log`, `…_release-freeze-trial2.log`,
`…_release-freeze-formal.log`).

## 3. Freeze iterations (what was done before and during the freeze)

1. **Four-blocker verification first (R3-FINAL-01…04, commits
   `810a7ef`–`2ddc2ad`, all before the freeze):** each final-review
   R4 blocker was re-verified from primary evidence before any fix
   (see `handoff/P020-T014-R4/TASK_REPORT.md` §1). Corrections to
   the brief's preliminary claims are recorded there and in
   `evidence/release/GIT_FINAL_CHECK_R4.md`: (a) `git diff
   9dac3e1..3a83371` holds FOUR commits, not "only the freezer
   script" — the freezer-only portion is the single commit
   `3a83371`; (b) T013 R4 never cites the label "P2-R3-1"
   literally — R4 §1 verifies the exact underlying divergence
   closed, which is what the manifest's RESOLVED entry cites;
   (c) final-review R3's P2-6 (false "hashes unchanged" claim,
   revoked by GPT in R4) and final-review R4's new P2-6
   (`USER=root` validator false positive) are different items
   sharing a number — the manifest labels the new one
   "P2-6 (final-review R4)".
2. **R3-FINAL-01** (`810a7ef`): `T014_FREEZE_REPORT_R3.md` header
   freeze commit PENDING → `d8ffdeb`, with a dated correction note;
   body otherwise untouched; §9 already recorded the same value.
3. **R3-FINAL-02** (`a24e1b2`): new `release/RELEASE_NOTES_R3.md`
   (complete R3 notes: source `3a83371`, freeze `d8ffdeb`, the R3
   three-piece hashes, R19 PASS, R14/R15 results, R2 archiving);
   `release/RELEASE_NOTES.md` rewritten as the R4 pre-freeze
   edition (describes the R4 re-freeze, carries the complete R3
   chapter, states the formal R4 hashes are filled in only in the
   post-freeze final edition — one-generation lag, as in R2).
4. **R3-FINAL-03** (`a3a1212`): `REVIEW_INDEX.md` appended
   (+66/−0 — R1/R2 text untouched) with the R3–R19 summary table,
   R19 deliverables and headline findings; new
   `evidence/review/COVERAGE_MATRIX_R19.csv` (99 rows at `9dac3e1`:
   62 code files, 20,481 lines + 37 new FIX-P0-19 test/fixture
   rows; `workflow-parser.ts` READ-R19, superseding the stale R2
   "Unchanged since R1" flag; 54 files carry R2 coverage forward
   byte-identical); new `evidence/review/REVIEW_PACK_03.md`
   (compiled from the R19 report + committed probe files, no new
   numbers); `evidence/review/REVIEW_SHA256SUMS_R19.txt`.
5. **R3-FINAL-04** (`4f212f7` + `2ddc2ad`): freezer patch —
   `KNOWN_FREEZE_COMMITS` table closes still-PENDING history
   entries (R2 → `03c2f16`, R3 → `d8ffdeb`, idempotent);
   `known_limitations`: P2-R3-1 → RESOLVED (FIX-P0-02, verified
   T013 R4 §1), P2-R6-2 registered (partially mitigated historical
   residual: R7/R8 probes lost, R9–R19 archived), P2-6
   (final-review R4) `USER=root` validator false positive disclosed
   as a tool defect (verified live: `USER=root` → exit 1 with 5
   "username in entry name" FAILs on `root` fixture filenames;
   `USER` unset → verify OK; ZIPs unaffected). Plus
   `evidence/release/GIT_FINAL_CHECK_R4.md` with verbatim
   rev-parse/log/diff outputs (this rework's own diff: docs /
   matrix / freezer only, zero `src/` / `oracle/` / `tests/`).
6. **Acceptance re-run** at the source HEAD `2ddc2ad` (see §2):
   all commands exit 0; `git status` clean afterwards
   (`evidence/S0_GATE.json` byte-identical, `release:verify`
   rewrote nothing).
7. **Trial freeze ×2** at `2ddc2ad`: identical hashes both times
   (source `ab23e4a7…`, dist `b8e2aa77…`, manifest `231047b0…`);
   `sha256sum -c` 3/3 OK on the trial artifacts. Trial manifest
   inspected before the formal run: history closes R2/R3, P2-R3-1
   RESOLVED, P2-R6-2 and P2-6 (R4) present, all 19 review hashes
   in `inputs`, trial `source.zip` (2,734 files) confirmed to
   contain the R3 report, R3 notes, R19 matrix/pack/sums, updated
   index, git check and R4 notes.
8. **Formal freeze** at `2ddc2ad`: `npm run release:freeze`
   (no `--trial`). Exit 0. The formal manifest (`2076f087…`)
   differs from the trial manifest (`231047b0…`) only in the
   `freeze_commit` / `freeze_status` text (PENDING/FORMAL vs
   TRIAL), as designed; source/dist hashes are identical to trial.

## 4. Independent verification (beyond the acceptance commands)

- Manifest review hashes: all 19 `t013_review_r*` SHA-256 values
  re-computed from `git show HEAD:<path>` by the freezer and
  compared — 0 mismatches (the freeze refuses otherwise). R19
  entry: PASS, p0 0 / p1 0 / p2 8.
- Freezer script hash in the manifest (`c2a1c9e8…`) equals the
  committed `scripts/deterministic-zip.py` SHA-256 (checked after
  the formal freeze).
- `source.zip` listing vs `git ls-files` at `2ddc2ad`: same 2,734
  files (modulo the octal-quoted non-ASCII filename, §1). The R3
  report, R3 notes, R19 matrix/pack/sums, updated index, git check
  and R4 notes are all present in the archive (checked on the
  trial `source.zip`, byte-identical to the formal one).
- `dist.zip`: `checkpath.mjs` present, 76 vendored `yaml` files
  present (package.json + LICENSE + 74 dist/*.js), 114 files total;
  byte-identical to the R3 `dist.zip` (no `src/` change).
- `release:verify` rebuilt `dist/` and rewrote
  `evidence/tests/RELEASE_VERIFY_REPORT.json`: the file is
  byte-identical to HEAD after the re-run (no diff) — no change to
  commit.
- `evidence/S0_GATE.json` is byte-identical to HEAD after the
  `s0:gate` re-run (gate hash unchanged) — no diff.
- `USER=root` validator check (disclosed, not fixed in this task):
  `USER=root python3 scripts/deterministic-zip.py --verify
  release/source.zip` exits 1 with 5 "username in entry name"
  FAILs (fixture filenames containing `root`); `USER= … --verify`
  exits 0, verify OK. The failure is the substring check
  (`user in name`) in `do_verify`, a tool defect, not a product
  defect; the ZIPs are unaffected. Recorded in the manifest as
  P2-6 (final-review R4).

## 5. What the freeze did NOT change

- No `src/`, `oracle/`, fixture, test, or spec change in this task
  (the only code change is the freezer script's manifest inputs
  and history-closure table, `scripts/deterministic-zip.py`).
- No `dist.zip` standalone run was repeated in this task: `dist.zip`
  is byte-identical to the R3 bundle, and `release:verify`'s cli
  smoke (demo / analyze / matrix, exit codes as expected) ran on
  the freshly built `dist/` in this task.
- The R3 artifacts in `release/` were overwritten by the R4
  artifacts in the working tree; the R3 files survive in git
  history (`d8ffdeb`) and in Drive `01_release_R3` — never
  overwritten there either (R4 goes to a NEW folder
  `01_release_R4`).
- The `release/RELEASE_NOTES.md` inside the R4 `source.zip` is the
  pre-freeze edition (R4 hashes listed as "see SHA256SUMS.txt");
  the post-freeze final edition — with the formal R4 hashes filled
  in — is committed in the freeze commit and uploaded to Drive
  `01_release_R4`. Same one-generation lag as R2; disclosed in
  both editions and here.

## 6. Working-tree note

- `git status` before the freeze commit shows exactly:
  `M release/RELEASE_MANIFEST.json`, `M release/SHA256SUMS.txt`,
  `M release/source.zip`, plus this report (untracked) and the
  post-freeze final edition of `release/RELEASE_NOTES.md`
  (modified). `release/dist.zip` is UNCHANGED (byte-identical to
  R3, so no diff). `dist/` is git-ignored (rebuilt by the freeze
  and by `release:verify`); `node_modules/` untouched.

## 7. Unresolved / carried-forward items

- P2-R6-2 is PARTIALLY MITIGATED and still open as a historical
  residual: the R7/R8 self-written probes are unrecoverable (only
  `/tmp`, lost in a VM restart); R9–R19 probes are archived in
  `evidence/probes/r9/`–`r19/`. Non-blocking.
- P2-6 (final-review R4), the `USER=root` ZIP-validator false
  positive, is a disclosed tool defect, not fixed in this task
  (one-line follow-up for T014 if wanted: match whole path
  segments instead of a substring in `do_verify`). Non-blocking;
  the ZIPs verify OK under a non-root user.
- The manifest's `freeze_commit` for THIS run reads PENDING by
  design; the real hash is recorded in §9 below. `freeze_history`
  now closes R2 and R3.
- This report itself is NOT inside the R4 `source.zip`
  (one-generation lag: the report is written after the freeze run);
  it is committed in the freeze commit and uploaded to Drive
  `01_release_R4`, and it enters the frozen package at the next
  freeze, if any. The R3 report — the one GPT asked for — IS
  inside the R4 `source.zip`.
- License still `PENDING_SAM_DECISION` (Sam to decide).

## 8. Deliverables

- `release/source.zip`, `release/dist.zip`,
  `release/RELEASE_MANIFEST.json`, `release/SHA256SUMS.txt`
  (formal R4 freeze, committed in the freeze commit below)
- `release/RELEASE_NOTES.md` (post-freeze final edition, with the
  formal R4 hashes — committed in the freeze commit below)
- `release/RELEASE_NOTES_R3.md` (in the frozen package and in Drive)
- `evidence/release/T014_FREEZE_REPORT_R4.md` (this file)
- `evidence/release/T014_FREEZE_REPORT_R3.md` (corrected header;
  in the frozen package and in Drive)
- `evidence/release/GIT_FINAL_CHECK_R4.md` (in the frozen package)
- `evidence/review/COVERAGE_MATRIX_R19.csv`,
  `evidence/review/REVIEW_PACK_03.md`,
  `evidence/review/REVIEW_SHA256SUMS_R19.txt`, `REVIEW_INDEX.md`
  (in the frozen package and in Drive `02_evidence/review`)
- Drive `01_release_R4` folder (new; created after the freeze
  commit — see the T014 parent report for the folder id and
  per-file Drive ids)

## 9. Addendum — freeze commit (filled after committing)

> 补记（冻结提交后追加，2026-11-10）。本节只追加，不改写上文。
> source_commit 与 freeze_commit 的对应关系：
> - **source_commit（被冻结的源码）**：`2ddc2ad`
>   （`2ddc2ad0a7afd34bc2d5fe989f7d2e2bdb4e0b98`，
>   "R3-FINAL-04: git final check report (real outputs,
>   9dac3e1/3a83371/4c67520 chain)"）。
> - **freeze_commit（冻结提交本身）**：`a153b94`
>   （`a153b94f2767d93afc415080e29f52b63b173eea`，
>   "T014: Formal re-freeze (R4) — source.zip ab23e4a7…
>   dist.zip b8e2aa77…"，2026-11-10 02:24 UTC）。该提交在
>   source_commit 之上只加了冻结产物、最终版 R4 Notes 与本
>   报告（5 文件：`release/source.zip`、
>   `release/SHA256SUMS.txt`、`release/RELEASE_MANIFEST.json`、
>   `release/RELEASE_NOTES.md`、本报告），未改任何源码、
>   Oracle、fixture、测试或规格。`release/dist.zip` 在该提交
>   中无变化（与 R3 字节一致）。
> - **可核对的 Git 证据**（本机仓库实测，2026-11-10）：
>   - `git rev-parse a153b94^` →
>     `2ddc2ad0a7afd34bc2d5fe989f7d2e2bdb4e0b98`
>     （freeze_commit 的直接父提交就是 source_commit）。
>   - `git merge-base --is-ancestor 2ddc2ad a153b94` → 是；
>     `git log 2ddc2ad..a153b94` → 仅 1 个 commit。
>   - `git ls-tree a153b94 -- scripts/deterministic-zip.py
>     release/source.zip` → 两者均存在；脚本内容 SHA-256
>     `c2a1c9e8…`，与 Manifest `freezer.sha256` 一致。
> - **后续冻结的记录方式**：Manifest 同时记录 `source_commit`、
>   `freeze_commit`、`freeze_status` 与 `freeze_history`；每次
>   冻结的真实 freeze commit 哈希在产物提交后补记于此报告
>   （或其后续补记）。下一次正式冻结应在 `freeze_history`
>   中看到本轮：source `2ddc2ad` / freeze `a153b94` /
>   status FORMAL。
