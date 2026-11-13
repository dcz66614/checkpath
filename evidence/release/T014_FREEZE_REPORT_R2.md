# P020 CheckPath — T014 Formal Re-freeze Report (R2)

- **Task:** T014 — 正式重新冻结与 SHA-256 清单 (S5, second formal freeze)
- **Source commit:** `538c669`
  (`538c669e11a383aa0554d05239e298cf34aadd4d`, "FIX-P2-R3-2:
  record T013 R3 review in the re-freeze manifest")
- **Freeze commit:** PENDING — recorded in §9 after committing
  (the manifest records it as PENDING by design; see §9)
- **Date:** 2026-11-08
- **Result:** **PASS** — all acceptance commands exit 0; both ZIPs
  verified; `dist.zip` standalone demo verified; fresh-clone
  re-freeze byte-identical.
- **Why a re-freeze:** final-review R1 verdict FAIL (P0 0 / P1 2 /
  P2 6). Both P1s were fixed (FIX-P1-01 Oracle duplicate-key
  rejection, FIX-P1-02 freezer script in source.zip) and cleared by
  the independent T013 round-3 review (R3 = PASS, P0 0 / P1 0 /
  P2 3, `evidence/review/INDEPENDENT_REVIEW_R3.md`). The R1
  freeze artifacts (`3e5e145`, source `5e84c787…`) are superseded
  and kept as history in Drive `01_release`; they are NOT
  overwritten. This report covers the R2 formal re-freeze only.
- **Zero humans. No network (except the pre-existing `node_modules`,
  installed before this task), no GitHub API, no token. Synthetic
  data only.**
- **License:** `PENDING_SAM_DECISION` (no LICENSE file created;
  `LICENSE_STATUS.md` unchanged).

## 1. Result summary

| Artifact | SHA-256 | Files |
|---|---|---|
| `release/source.zip` | `3a778b933f827b5d1fbf1d617f40de465ec9bd00590a9bc1003cac2f2409743f` | 1,209 (exact HEAD tree at `538c669`) |
| `release/dist.zip` | `da130ad2747a810c0f62488245fe7902298199faa6e8372f3975d58b573911e6` | 114 (29 built + 76 vendored yaml + 6 examples + 2 docs + QUICKSTART.md) — byte-identical to the R1 dist.zip |
| `release/RELEASE_MANIFEST.json` | `04a07733755c36ba5a614514859ef8698eb2c1b7d92d4c4ebd75d335cfb0a2fb` | — |
| `release/SHA256SUMS.txt` | `sha256sum -c` all OK | 3 entries |

- `source.zip` file listing identical to `git ls-files` at HEAD
  (1,209 files, no missing/extra) and contents byte-identical to a
  `git archive 538c669` extraction (`diff -r`, zero differences).
- `dist.zip` extracted and run standalone with no `node_modules`
  visible: `demo` exit 2 (`report_sha256 9dc3af31…`, identical to the
  in-repo demo/analyze report), `analyze` pr-docs-only exit 2.
  `dist.zip` is byte-identical to R1 (no product-code change since
  R1; the two P1 fixes touch the Oracle parser, the freezer script
  and fixtures, not the built bundle).
- Determinism: a fresh clone at `538c669` + `npm ci` + formal
  `release:freeze` reproduces all three hashes byte-for-byte
  (source `3a778b93…`, dist `da130ad2…`, manifest `04a07733…`).
  A re-run in-repo at the same HEAD reproduces them as well.
- `RELEASE_MANIFEST.json` records source commit `538c669`,
  toolchain (Node v24.22.1, npm 10.9.4, Python 3.12.3, PyYAML
  6.0.1, TypeScript 5.9.3, Vite 7.3.7, Vitest 5.1.0, React 19.3.1,
  yaml 2.9.1), S0 input fixture hash `afce74c9…`, golden suite hash
  `5c89e827…` (83 fixtures), Oracle parity report hash, S0 gate
  hash `f511a847…`, T013 R2 **and R3** review hashes, both ZIP
  hashes, the freezer script hash (`5c3142ec…`, matches the
  committed patched script), and the freeze history chain
  (R1 formal `3e5e145` ← `933dd35`; trial `36476cf`).
- S0 gate still PASS after freeze: `gate_report_sha256 f511a847…`
  unchanged, independently recomputed — matches.
- Specs unchanged: PROJECT_BOOK SHA-256 `028c2472…`,
  IMPLEMENTATION_PLAN SHA-256 `bb645205…`.

## 2. Acceptance commands (personally run; logs in `handoff/P020-T014-R2/test_logs/`)

| Command | Exit | Result |
|---|---|---|
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | clean |
| `npm test` | 0 | 32 files, **855/855** |
| `npm run test:oracle` | 0 | Golden 83/83, 0 mismatches, false PASS 0, TS formal false PASS 0, UNKNOWN 19/19 |
| `npm run s0:oracle` | 0 | S0 24/24, 0 mismatches, false PASS 0, TS formal false PASS 0, UNKNOWN 2/2 |
| `npm run s0:gate` | 0 | PASS, 100 runs, 1 hash, `gate_report_sha256 f511a847…` unchanged |
| `npm run release:freeze` | 0 | source.zip `3a778b93…` (1,209 files), dist.zip `da130ad2…`, manifest `04a07733…` |
| `npm run release:verify` | 0 | PASS; CLI smoke incl. U-07/U-08/T8-05; report hash recompute OK; offline scan 34 files, 0 remote refs; license guard PASS |
| `python3 scripts/deterministic-zip.py --verify release/source.zip` | 0 | verify OK (1,520 entries incl. dirs, sorted, fixed timestamp, fixed permissions, CRC OK) |
| `python3 scripts/deterministic-zip.py --verify release/dist.zip` | 0 | verify OK (139 entries incl. dirs, sorted, fixed timestamp, fixed permissions, CRC OK) |

## 3. Freeze iterations (what was done before and during the freeze)

1. **P2-R3-2 fixed BEFORE the freeze (commit `538c669`).**
   The R3 review found the formal re-freeze manifest hardcoded
   only `t013_review_r2`. The freezer script was patched (20
   insertions, 0 deletions): `t013_review_r3` is now recorded in
   `inputs` alongside `t013_review_r2` (both hashed from HEAD),
   and `known_limitations` carries the three new R3 P2s (R3-1
   residual `True:`/`true:` divergence, R3-2 this fix, R3-3 the
   by-design clean-dir-without-`.git` limitation). The script hash
   changed (`7598e960…` → `5c3142ec…`); the manifest re-records it
   — that is expected and correct. Independent small commit, no
   packaging-logic change.
2. **R3 review evidence committed first (commit `f8df2fe`).**
   `evidence/review/INDEPENDENT_REVIEW_R3.md` (24,036 bytes) +
   `handoff/P020-T013-R3/SUMMARY.md` + the 4 regenerated evidence
   JSONs were committed before the freeze. The JSONs had to be
   committed, not restored (unlike R1 §6): the frozen tree now has
   83 golden fixtures (G-81/82/83) and 44 trigger fixtures
   (T6-17/18/19), so the HEAD parity reports must say 83/44 for
   the manifest's `fixture_count` and `golden_suite_sha256`
   (`5c89e827…`) to be truthful. See §6 for the full reasoning.
3. **Formal freeze run 1 succeeded immediately (exit 0).**
   No iterations were needed: the trial freeze during FIX-P1-02
   had already shaken out the `cat-file --batch` pipe deadlock
   (`36476cf`) and the script-inclusion gap. The freeze log is in
   `handoff/P020-T014-R2/test_logs/release-freeze.log`; a second
   in-repo re-run reproduced all three hashes byte-for-byte
   (`release-freeze-rerun.log`).
4. **F-T014-01 unchanged.** The vendored `yaml` 2.9.1 fix from R1
   still holds; `dist.zip` is byte-identical to R1
   (`da130ad2…`). The clean-dir standalone demo was re-verified
   (§4).
5. **RELEASE_NOTES.md rewritten for R2** (candidate `538c669`,
   R3 review, R2 hashes, R3 known limitations, fresh-clone
   verification, one-generation lag disclosed). It is recorded at
   the freeze commit; the `source.zip` (built from HEAD
   `538c669`) contains the R1-era notes — see the lag note in §6.
   The manifest, not the notes, is the authoritative hash record.

## 4. Independent verification (beyond the acceptance commands)

- **source.zip vs HEAD:** extracted to a scratch dir; file list
  compared against `git ls-files` at `538c669` — 1,209 vs 1,209,
  no missing, no extra; `diff -r` against a `git archive 538c669`
  extraction — byte-identical (zero differences, including
  `release/`).
- **Freezer script three-way hash:** the script inside
  `source.zip` hashes to `5c3142ec…`; the repo file hashes to the
  identical `5c3142ec…`; the manifest `freezer.sha256` is the
  identical `5c3142ec…`. The R3 report is inside the zip
  (`evidence/review/INDEPENDENT_REVIEW_R3.md`); its hash
  `1e55294d…` equals the manifest `inputs.t013_review_r3.sha256`.
- **dist.zip standalone (U-02, re-verified):** extracted to a
  clean dir (no `node_modules` above it); `demo` exit 2,
  `report_sha256 9dc3af313677f795b3a836d9074833c9cfd2bf190d5e2201b7a99b08a23375b7`
  — identical to the in-repo demo/analyze report and to R1's
  recorded hash; `analyze` pr-docs-only exit 2 with the same
  report hash. Vendored `node_modules/yaml` version 2.9.1 with
  LICENSE present. Logs in `test_logs/dist2-*.log`.
- **No local paths in dist.zip:** entry names all relative; all
  timestamps `(1980, 1, 1, 0, 0, 0)`; file mode `0644`, dir mode
  `0755` throughout (source.zip 1,520 entries, dist.zip 139
  entries incl. dirs).
- **SHA256SUMS:** `sha256sum -c SHA256SUMS.txt` — all three OK.
- **Manifest consistency:** `freezer.sha256` equals the SHA-256 of
  the committed `scripts/deterministic-zip.py` (`5c3142ec…`);
  `s0_gate.sha256` equals the SHA-256 of the HEAD
  `evidence/S0_GATE.json`; `oracle_parity_report.sha256` equals
  the SHA-256 of the HEAD
  `evidence/tests/ORACLE_PARITY_REPORT.json` (83 fixtures);
  both R2/R3 review hashes equal the SHA-256 of the HEAD review
  files; `source_commit` is the full `538c669e…` hash;
  `freeze_history` lists the R1 formal freeze and the trial
  freeze, in order.
- **Fresh-clone reproduction (P2-R3-3 substitute, done by me):**
  fresh clone at `538c669` (workspace disk — `/tmp` is a 512 MB
  tmpfs and filled up during an earlier `npm ci`), `npm ci`
  (181 packages), formal `npm run release:freeze` — all three
  hashes byte-identical to the in-repo freeze (source
  `3a778b93…`, dist `da130ad2…`, manifest `04a07733…`).
  Log: `test_logs/fresh-clone-freeze.log`.
- **Clean-dir without `.git` (P2-R3-3, reproduced literally):**
  extracted `source.zip` to a fresh dir (no `.git`, no
  `node_modules`); `scripts/deterministic-zip.py` IS present —
  the R1 exit-2 "file not found" failure is gone. `npm run
  release:freeze` there now fails at `git rev-parse HEAD`
  (`FAIL: command failed (128): git rev-parse HEAD`, `fatal: not
  a git repository`) — by design: the freeze identifies the frozen
  tree by commit, and there is no commit to identify in a bare
  extraction. The accepted substitute is the fresh-clone re-run
  above, verified byte-identical. Log:
  `test_logs/clean-dir-nogit-freeze.log`. This must be stated
  plainly to GPT in final-review R2; it is NOT a defect in the
  shipped `dist.zip`, which runs standalone.

## 5. What the freeze did NOT change

- No product code, Oracle code, fixture, test, doc or spec file was
  modified by the freeze itself. The only source-tree changes
  since R1 are the two P1 fixes, the R3 review evidence, and the
  P2-R3-2 freezer patch — all reviewed (R3) and committed before
  the freeze. `git status` for `src/`, `oracle/`, `tests/`,
  `examples/`, `README.md`, `LICENSE_STATUS.md`,
  `THIRD_PARTY_NOTICES.md`, `package.json`, `package-lock.json` is
  clean vs the source commit.
- `source.zip` is the exact HEAD tree, including the historical
  evidence/log files that contain absolute workspace paths as text
  (`evidence/environment/ENVIRONMENT_REPORT.md`, some `handoff/`
  test logs). That content is part of the T013-reviewed commit and
  was not altered; the "no absolute paths" rule is satisfied at the
  archive level (relative entry names, fixed metadata) and at the
  content level for `dist.zip`. Disclosed in `RELEASE_NOTES.md`.
- The `source.zip` inside the frozen `source.zip`
  (`release/source.zip` entry) is the trial-era artifact from HEAD
  `538c669` — expected: the zip archives the HEAD tree as it is,
  including the previous release outputs. It is NOT the new
  freeze; the new hashes are in `release/SHA256SUMS.txt` at the
  freeze commit and in Drive `01_release_R2`.

## 6. Working-tree note (pre-existing drift, handled differently from R1)

At task start the tree was **not** clean: 4 evidence JSONs were
modified (test-run regenerations) and the R3 review report +
handoff summary were untracked. R1 §6 restored such files with
`git checkout` before committing. This re-freeze **committed**
them instead (commit `f8df2fe`), deliberately, because the
manifest reads its truth from HEAD:

- `evidence/tests/ORACLE_PARITY_REPORT.json`: HEAD said 80
  fixtures / suite `3a5f46ae…`; the frozen tree has 83 (G-81/82/83
  added by FIX-P1-01). Freezing without committing would have put
  a false `fixture_count: 80` in the manifest.
- `evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`: 41 → 44
  (T6-17/18/19 dup-key fixtures).
- `evidence/s0/S0_ORACLE_REPORT.json`: gained the
  formal-pipeline fields (`ts_formal_false_pass_count: 0` etc.)
  that the S0 gate now requires.
- `evidence/tests/RELEASE_VERIFY_REPORT.json`: dist tree hash
  `14cd8492…` (rebuilt assets) and the U-07/U-08/T8-05 smoke
  lines from the fix verification runs.

All four were verified to be pure re-run outputs (no timestamps,
no hand edits; diffs inspected before staging). The R3 report and
handoff summary are the reviewer's deliverables and belong in the
tree like the R1/R2 reports. Untracked `reports/` (demo outputs)
was left untouched throughout and is excluded from the commit and
from both ZIPs. The verification re-runs in this task regenerated
the same reports byte-identically (working tree stayed clean apart
from the intended release files).

**One-generation lag (disclosed):** the `RELEASE_NOTES.md`
inside `source.zip` is the R1-era file, because the zip is built
from the HEAD tree and the R2 notes were written after the freeze
(a notes file cannot contain the hash of the zip that contains
it). Same as R1, where the zip contained no notes at all. The R2
notes are recorded at the freeze commit and in Drive
`01_release_R2`; the manifest is the authoritative hash record.
This is stated in the R2 notes themselves.

## 7. Unresolved / carried-forward items

- **U-01 — Windows PowerShell Quick Start NOT_TESTED** (no Windows
  machine; unchanged).
- **P2-R3-1 — residual `True:` vs `true:` divergence** (T013 R3,
  minor, non-blocking). TS `INVALID`, Oracle `UNKNOWN`,
  fail-closed. No such keys in real workflow YAML. Recorded in
  `RELEASE_NOTES.md` §5 and the manifest.
- **P2-R3-2 — FIXED by this re-freeze** (manifest now records R3).
- **P2-R3-3 — clean-dir-without-`.git` freeze fails by design**
  (see §4). Fresh-clone substitute verified byte-identical.
  Must be stated plainly in final-review R2.
- **P2-R2-3 — README performance figures are single-run
  snapshots** (unchanged).
- **F-T014-01 follow-up (optional, not blocking):** a future task
  could bundle the CLI into a single self-contained file instead
  of vendoring `node_modules/yaml`, and could extend the release
  gate with a standalone-extracted `dist.zip` smoke run so this
  class of defect is caught by `release:verify` itself. Neither
  was done here: both would change reviewed build code and require
  a new T013/T014 cycle.

## 8. Deliverables

- `release/source.zip`, `release/dist.zip`,
  `release/SHA256SUMS.txt`, `release/RELEASE_MANIFEST.json`,
  `release/RELEASE_NOTES.md` (R2)
- `evidence/release/T014_FREEZE_REPORT_R2.md` (this file)
- `scripts/deterministic-zip.py` (P2-R3-2 patch, commit `538c669`)
- Handoff package: `handoff/P020-T014-R2/` (TASK_REPORT.md,
  changed_files.txt, test_commands.txt, test_logs/, sha256.txt,
  unresolved_items.md)

## 9. Addendum — freeze commit (filled after committing)

> 补记（冻结提交后追加，2026-11-08）。本节只追加，不改写上文。
> source_commit 与 freeze_commit 的对应关系：
> - **source_commit（被冻结的源码）**：`538c669`
>   （`538c669e11a383aa0554d05239e298cf34aadd4d`，
>   "FIX-P2-R3-2: record T013 R3 review in the re-freeze
>   manifest"）。
> - **freeze_commit（冻结提交本身）**：`03c2f16`
>   （`03c2f168a40b114ff1a0f408fa783f5d5389e15d`，
>   "T014: Formal re-freeze (R2) — source.zip 3a778b93… dist.zip
>   da130ad2…"，2026-11-08 19:49:39 +0000）。该提交在
>   source_commit 之上只加了冻结产物与冻结报告（25 文件：
>   `release/source.zip`、`release/SHA256SUMS.txt`、
>   `release/RELEASE_MANIFEST.json`、`release/RELEASE_NOTES.md`、
>   本报告、`handoff/P020-T014-R2/`），未改任何源码、Oracle、
>   fixture、测试或规格。`release/dist.zip` 在该提交中无变化
>   （与 R1 字节一致，已在 `7638f06` 入库）。
> - **可核对的 Git 证据**（本机仓库实测，2026-11-08）：
>   - `git rev-parse 03c2f16^` →
>     `538c669e11a383aa0554d05239e298cf34aadd4d`
>     （freeze_commit 的直接父提交就是 source_commit）。
>   - `git merge-base --is-ancestor 538c669 03c2f16` → 是；
>     `git log 538c669..03c2f16` → 仅 1 个 commit。
>   - `git ls-tree 03c2f16 -- scripts/deterministic-zip.py
>     release/source.zip` → 两者均存在；脚本内容 SHA-256
>     `5c3142ec…`，与 Manifest `freezer.sha256` 一致。
> - **后续冻结的记录方式**：Manifest 同时记录 `source_commit`、
>   `freeze_commit`、`freeze_status` 与 `freeze_history`；每次
>   冻结的真实 freeze commit 哈希在产物提交后补记于此报告
>   （或其后续补记）。下一次正式冻结应在 `freeze_history`
>   中看到本轮：source `538c669` / freeze `03c2f16` /
>   status FORMAL。
