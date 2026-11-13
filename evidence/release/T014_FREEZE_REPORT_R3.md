# P020 CheckPath — T014 Formal Re-freeze Report (R3)

- **Task:** T014 — 正式重新冻结与 SHA-256 清单 (S5, third formal freeze)
- **Source commit:** `3a83371`
  (`3a8337151461b80e4ae50e75ab2edf417f4f9165`, "T014: freezer
  records T013 reviews R4-R19 in manifest inputs (P2-R6-1)")
- **Freeze commit:** `d8ffdeb`
  (`d8ffdebb775e5b3241936ec86c11689c51f29bf1`, "T014: Formal
  re-freeze (R3) — source.zip 9a54081e… dist.zip b8e2aa77…")
  — recorded in §9 after committing; this header was corrected
  in the R3-FINAL rework (2026-11-10, see the correction note
  below) so the report is self-consistent when read standalone.
  At freeze time the header read PENDING by design (the freeze
  commit did not exist yet); §9 is the authoritative addendum
  and records the same value.
- **Date:** 2026-11-10

> 订正（R3-FINAL-01，2026-11-10）：本报告正文头的 Freeze commit
> 在冻结时写为 PENDING（冻结提交尚不存在，属 T014 固有设计），
> 真实值只在 §9 补记中。终审 R4 指出该报告“缺失”，实为它不
> 在 R3 source.zip 与 Drive 01_release_R3 内（冻结发生在写报
> 告之前，一代滞后），而非文件不存在。本次订正把正文头改为
> 真实值 `d8ffdeb`（与 §9 一致），其余正文一字未改；订正后的
> 报告随 R4 正式重冻进入新 source.zip 并上传 Drive
> 01_release_R4。
- **Result:** **PASS** — all acceptance commands exit 0; both ZIPs
  verified; manifest inputs now record all 19 T013 review rounds;
  R14/R15 stale-flag probe rows cleared (both probes exit 0).
- **Why a re-freeze:** the independent T013 round-19 review
  (R19 = PASS, P0 0 / P1 0 / P2 8,
  `evidence/review/INDEPENDENT_REVIEW_R19.md`) closed the last
  P0 family (FIX-P0-19, code `9dac3e1`: TS-side alias-key duplicate
  check). The R2 freeze artifacts (`03c2f16`, source `3a778b93…`)
  are superseded and kept as history in Drive `01_release_R2`;
  they are NOT overwritten. This report covers the R3 formal
  re-freeze only.
- **Zero humans. No network (except the pre-existing `node_modules`,
  installed before this task), no GitHub API, no token. Synthetic
  data only.**
- **License:** `PENDING_SAM_DECISION` (no LICENSE file created;
  `LICENSE_STATUS.md` unchanged).

## 1. Result summary

| Artifact | SHA-256 | Files |
|---|---|---|
| `release/source.zip` | `9a54081ec8d322f0f7d78c6c08a2dc8cf9370396a026a7a2d6fd0e85b4dc83cd` | 2,728 (exact HEAD tree at `3a83371`) |
| `release/dist.zip` | `b8e2aa77074cd2f62a518c1c7969cfdaa7cff202c6d87239080c3dfe2c6d335c` | 114 (29 built + 76 vendored yaml + 6 examples + 2 docs + QUICKSTART.md) |
| `release/RELEASE_MANIFEST.json` | `f4ba7a17bf188fbea8acf61ffbf7ee01b5011b27a8cc2f0310122c3e3a332465` | — (freeze_status FORMAL) |
| `release/SHA256SUMS.txt` | `sha256sum -c` all OK | 3 entries |

- `source.zip` file count 2,728 vs R2's 1,209: the tree grew through
  the R4–R19 fix/review loop (fixtures, probes, evidence, review
  reports). Reconciled: FIX-P0-19 trial freeze at `9dac3e1` had
  2,693 files; +1 (FIX-P0-19 report commit `3991856`) +34 (R19
  evidence commit `9fd0233`) = 2,728. Listing identical to
  `git ls-files` at the source commit (one filename carries a
  non-ASCII arrow `→`; `git ls-tree` quotes it octal-escaped,
  the ZIP stores the real UTF-8 name — same file, verified).
- `dist.zip` changed vs R2 (`da130ad2…` → `b8e2aa77…`): expected —
  `src/` changed in FIX-P0-19 (`hasDuplicateAliasKey` in
  `src/core/workflow-parser.ts` +127/−1, wiring in `src/core/e2e.ts`
  +7/−2). The hash is byte-identical to the FIX-P0-19 trial freeze
  and to the R19 review's three trial reproductions
  (`89ff8504…` manifest) — no `src/` change since `9dac3e1`.
- `RELEASE_MANIFEST.json` records source commit `3a83371`,
  toolchain (Node v24.22.1, npm 10.9.4, Python 3.12.3, PyYAML
  6.0.1, TypeScript 5.9.3, Vite 7.3.7, Vitest 5.1.0, React 19.3.1,
  yaml 2.9.1), S0 input fixture hash, golden suite hash, Oracle
  parity report hash, S0 gate hash `f511a847…`, **all 19 T013
  review hashes (R1–R19, P2-R6-1 fixed)**, both ZIP hashes, the
  freezer script hash (`54cd0ed4…`, matches the committed patched
  script), and the freeze history chain (R1 formal `3e5e145` ←
  `933dd35`; trial `36476cf`; R2 formal `538c669e` — its
  freeze_commit is carried forward as the PENDING text the R2
  manifest recorded, per the script's carry-forward rule; the
  real R2 freeze commit `03c2f16` is recorded in
  `T014_FREEZE_REPORT_R2.md` §9).
- S0 gate still PASS after freeze: `gate_report_sha256 f511a847…`
  unchanged, independently recomputed — matches.
- Specs unchanged: PROJECT_BOOK / IMPLEMENTATION_PLAN untouched
  by this task (only probe expectations, the freezer script, and
  the freeze artifacts changed).

## 2. Acceptance commands (personally run)

| Command | Exit | Result |
|---|---|---|
| `npm run release:freeze` (formal, no `--trial`) | 0 | `freeze OK`; source `9a54081e…` (2,728), dist `b8e2aa77…` (114), manifest `f4ba7a17…` — all from this run's own stdout |
| `sha256sum -c SHA256SUMS.txt` (in `release/`) | 0 | source.zip OK, dist.zip OK, RELEASE_MANIFEST.json OK |
| `npm run s0:gate` | 0 | PASS; oracle 24/24, 0 mismatches, 0 false PASS; determinism 100 runs, 1 unique hash; `gate_report_sha256 f511a847…` unchanged |
| `npm run release:verify` | 0 | PASS; all 5 steps (build determinism, cli smoke, report_sha256 recompute, offline static scan, license guard) |
| `python3 evidence/probes/r14/r14-probe.py` | 0 | 78/78 MATCH, 0 DIFF, 0 stale flag (after clearing) |
| `python3 evidence/probes/r15/r15-probe.py` | 0 | 122/122 MATCH, 0 DIFF, 0 stale flag (after clearing) |

## 3. Freeze iterations (what was done before and during the freeze)

1. **Baseline stale-flag check** (HEAD `9fd0233`): R14 probe
   78/78 MATCH + 11 FLAG STALE (exit 1); R15 probe 122/122 MATCH
   + 24 FLAG STALE lines (exit 1). All checks already MATCHed —
   the residuals were genuinely closed by later fixes.
2. **Stale-flag clearing** (commit `a4106d8`): `gen-cases.py`
   expectations flipped for the 11 R14 rows (`expected_diff`
   true→false, notes re-labelled CLOSED RESIDUAL) and the 13 R15
   rows (`expected_diff=True` removed, including the two explicit
   `diff_modes=["trigger"]` on `r15-r2-str-flow-nospace` and
   `r15-r3-on-str`, which the first re-run caught — the `row()`
   helper only defaults `diff_modes` when it is not passed
   explicitly). Probe drivers' docstrings, `cases.json` (regenerated)
   and both READMEs updated with a T014 closure addendum; the
   R14/R15-time results are kept in the READMEs as the historical
   record. Re-run: R14 78/78 exit 0, R15 122/122 exit 0.
   10 files, +187/−168.
3. **Freezer inputs patch** (commit `3a83371`):
   `scripts/deterministic-zip.py` +58 lines — `meta_paths` gained
   the 16 review files R4–R19; a `T013_REVIEW_VERDICTS` table
   (verdicts read from each review file's verdict line: R4–R18
   NOT PASS, R19 PASS, with p0/p1/p2) feeds `inputs`; a
   `P2-R6-1: FIXED` line was added to `known_limitations`. No
   `src/` change, so no `npm test` / oracle re-run was required
   for this patch (the script compiles; the freeze itself
   re-verifies the manifest against HEAD — all 19 review SHA-256
   values re-checked against `git show HEAD:<path>`, 0 mismatches).
4. **Formal freeze** at `3a83371`: `npm run release:freeze`
   (no `--trial`; the FIX-P0-18 lesson — trial and formal manifest
   values differ — was followed deliberately). Exit 0.
5. **Service restart during verification:** one combined
   `s0:gate && release:verify` exec was aborted by a service
   restart mid-run. State was checked before retrying (only the
   4 `release/` files modified; `S0_GATE.json` /
   `RELEASE_VERIFY_REPORT.json` still at their pre-run mtimes —
   no partial state). Both commands were then re-run individually:
   `s0:gate` PASS, `release:verify` PASS (see §2).

## 4. Independent verification (beyond the acceptance commands)

- Manifest review hashes: all 19 `t013_review_r*` SHA-256 values
  re-computed from `git show HEAD:<path>` and compared — 0
  mismatches. R19 entry: PASS, p0 0 / p1 0 / p2 8.
- Freezer script hash in the manifest (`54cd0ed4…`) equals the
  committed `scripts/deterministic-zip.py` SHA-256.
- `source.zip` listing vs `git ls-files` at `3a83371`: same 2,728
  files (modulo the octal-quoted non-ASCII filename, §1).
- `dist.zip`: `checkpath.mjs` present, 76 vendored `yaml` files
  present (package.json + LICENSE + 74 dist/*.js), 114 files total.
- `release:verify` rebuilt `dist/` and rewrote
  `evidence/tests/RELEASE_VERIFY_REPORT.json`: the only change is
  the dist tree SHA `5a4f3337…` → `8f4636de53cb829f…` — the R2-era
  dist tree replaced by the current build (FIX-P0-19 `src/`
  change). This is the correct current value (same value the
  FIX-P0-19 fixer observed); it is committed with the freeze
  artifacts, not restored.
- `evidence/S0_GATE.json` is byte-identical to HEAD after the
  `s0:gate` re-run (gate hash unchanged) — no diff.

## 5. What the freeze did NOT change

- No `src/`, `oracle/`, fixture, test, or spec change in this task
  (the only code change is the freezer script's manifest inputs,
  `scripts/deterministic-zip.py`).
- No `dist.zip` standalone run was repeated in this task: `dist.zip`
  is byte-identical to the FIX-P0-19 trial bundle, and
  `release:verify`'s cli smoke (demo / analyze / matrix, exit
  codes as expected) ran on the freshly built `dist/` in this task.
- The R2 artifacts in `release/` were overwritten by the R3
  artifacts in the working tree; the R2 files survive in git
  history (`03c2f16`) and in Drive `01_release_R2` — never
  overwritten there either (R3 goes to a NEW folder
  `01_release_R3`).

## 6. Working-tree note

- `git status` before the freeze commit shows exactly:
  `M release/RELEASE_MANIFEST.json`, `M release/SHA256SUMS.txt`,
  `M release/dist.zip`, `M release/source.zip`,
  `M evidence/tests/RELEASE_VERIFY_REPORT.json`, plus this report
  (untracked). Nothing else. `dist/` is git-ignored (rebuilt by
  the freeze and by `release:verify`); `node_modules/` untouched.

## 7. Unresolved / carried-forward items

- P2-R6-1 is FIXED by this re-freeze (manifest now records
  R4–R19). The 8 P2s from R19 otherwise still stand (R2's 6 +
  P2-R6-1 now fixed + P2-R6-2, with P2-R16-1 still clear).
- The manifest's `freeze_history` carries the R2 run with its
  `freeze_commit` as the PENDING text (the R2 manifest's own
  wording), not the real hash `03c2f16` — that is the freezer
  script's carry-forward rule working as designed (the R2 manifest
  did the same for the trial run's TRIAL text); the real R2 hash
  is recorded in `T014_FREEZE_REPORT_R2.md` §9. Not redesigned
  in this task.
- License still `PENDING_SAM_DECISION` (Sam to decide).

## 8. Deliverables

- `release/source.zip`, `release/dist.zip`,
  `release/RELEASE_MANIFEST.json`, `release/SHA256SUMS.txt`
  (formal R3 freeze, committed in the freeze commit below)
- `evidence/tests/RELEASE_VERIFY_REPORT.json` (dist tree SHA
  updated to the current build)
- `evidence/release/T014_FREEZE_REPORT_R3.md` (this file)
- Drive `01_release_R3` folder (new; created after the freeze
  commit — see the T014 parent report for the folder id and
  per-file Drive ids)

## 9. Addendum — freeze commit (filled after committing)

> 补记（冻结提交后追加，2026-11-10）。本节只追加，不改写上文。
> source_commit 与 freeze_commit 的对应关系：
> - **source_commit（被冻结的源码）**：`3a83371`
>   （`3a8337151461b80e4ae50e75ab2edf417f4f9165`，
>   "T014: freezer records T013 reviews R4-R19 in manifest inputs
>   (P2-R6-1)"）。
> - **freeze_commit（冻结提交本身）**：`d8ffdeb`
>   （`d8ffdebb775e5b3241936ec86c11689c51f29bf1`，
>   "T014: Formal re-freeze (R3) — source.zip 9a54081e… dist.zip
>   b8e2aa77…"，2026-11-10 00:34 UTC）。该提交在 source_commit
>   之上只加了冻结产物、验证报告与本报告（6 文件：
>   `release/source.zip`、`release/dist.zip`、
>   `release/SHA256SUMS.txt`、`release/RELEASE_MANIFEST.json`、
>   `evidence/tests/RELEASE_VERIFY_REPORT.json`、本报告），未改
>   任何源码、Oracle、fixture、测试或规格。
> - **可核对的 Git 证据**（本机仓库实测，2026-11-10）：
>   - `git rev-parse d8ffdeb^` →
>     `3a8337151461b80e4ae50e75ab2edf417f4f9165`
>     （freeze_commit 的直接父提交就是 source_commit）。
>   - `git merge-base --is-ancestor 3a83371 d8ffdeb` → 是；
>     `git log 3a83371..d8ffdeb` → 仅 1 个 commit。
>   - `git ls-tree d8ffdeb -- scripts/deterministic-zip.py
>     release/source.zip` → 两者均存在；脚本内容 SHA-256
>     `54cd0ed4…`，与 Manifest `freezer.sha256` 一致。
> - **后续冻结的记录方式**：Manifest 同时记录 `source_commit`、
>   `freeze_commit`、`freeze_status` 与 `freeze_history`；每次
>   冻结的真实 freeze commit 哈希在产物提交后补记于此报告
>   （或其后续补记）。
