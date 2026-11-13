# P020 CheckPath — T014 Release Freeze Report

- **Task:** T014 — 发布冻结与 SHA-256 清单 (S5)
- **Base commit:** `933dd35`
  (`933dd354e109436551ba40b96d5b4a2d83b839a6`, "T013 re-review —
  PASS, P0 0 / P1 0 / P2 3")
- **Date:** 2026-11-08
- **Result:** **PASS** — all acceptance commands exit 0; both ZIPs
  verified; `dist.zip` standalone demo verified (T012 U-02 CLOSED).
- **Zero humans. No network (except the pre-existing `node_modules`,
  installed before this task), no GitHub API, no token. Synthetic
  data only.**
- **License:** `PENDING_SAM_DECISION` (no LICENSE file created;
  `LICENSE_STATUS.md` unchanged).

## 1. Result summary

| Artifact | SHA-256 | Files |
|---|---|---|
| `release/source.zip` | `5e84c787c73cb1430d022537f3ae9982c574921de93bf60a2cb06684881aefb8` | 1,144 (exact HEAD tree) |
| `release/dist.zip` | `da130ad2747a810c0f62488245fe7902298199faa6e8372f3975d58b573911e6` | 114 (29 built + 76 vendored yaml + 6 examples + 2 docs + QUICKSTART.md) |
| `release/RELEASE_MANIFEST.json` | `6c25a3812df4da9d4d63f269751d2a451621f7368e34fb94603a492a2a61a0ba` | — |
| `release/SHA256SUMS.txt` | `sha256sum -c` all OK | 3 entries |

- `source.zip` file listing identical to `git ls-files` at HEAD
  (1,144 files, no missing/extra) and contents byte-identical to a
  `git archive HEAD` extraction.
- `dist.zip` extracted and run standalone with no `node_modules`
  visible: `demo` exit 2 (`report_sha256 9dc3af31…`, identical to the
  in-repo demo/analyze report), `analyze` pr-docs-only exit 2,
  `matrix` exit 2, `analyze` pr-src-only exit 0.
- Determinism: a full re-run of `npm run release:freeze` reproduces
  all three hashes byte-for-byte (verified twice: before and after
  the F-T014-01 fix).
- `RELEASE_MANIFEST.json` records commit `933dd35`, toolchain
  (Node v24.22.1, npm 10.9.4, Python 3.12.3, PyYAML 6.0.1,
  TypeScript 5.9.3, Vite 7.3.7, Vitest 5.1.0, React 19.3.1,
  yaml 2.9.1), S0 input fixture hash `afce74c9…`, golden suite hash
  `3a5f46ae…`, Oracle parity report hash, S0 gate hash `f511a847…`,
  T013 R1/R2 review hashes, both ZIP hashes and the freezer script
  hash (`33b026f3…`, matches the committed script file).
- S0 gate still PASS after freeze: `gate_report_sha256 f511a847…`
  unchanged, independently recomputed — matches.
- Specs unchanged: PROJECT_BOOK SHA-256 `028c2472…`,
  IMPLEMENTATION_PLAN SHA-256 `bb645205…`.

## 2. Acceptance commands (personally run; logs in `handoff/P020-T014/test_logs/`)

| Command | Exit | Result |
|---|---|---|
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | clean |
| `npm test` | 0 | 32 files, **842/842** |
| `npm run test:oracle` | 0 | Golden 80/80, 0 mismatches, false PASS 0, TS formal false PASS 0, UNKNOWN 19/19 |
| `npm run s0:oracle` | 0 | S0 24/24, 0 mismatches, false PASS 0, TS formal false PASS 0, UNKNOWN 2/2 |
| `npm run s0:gate` | 0 | PASS, 100 runs, 1 hash, `gate_report_sha256 f511a847…` unchanged |
| `npm run release:freeze` | 0 | source.zip `5e84c787…`, dist.zip `da130ad2…`, manifest `6c25a381…` |
| `npm run release:verify` | 0 | PASS; dist tree `14cd8492…` (29 files, identical across builds — same as T013 R2); smoke incl. U-07/U-08/T8-05; report hash recompute OK; offline scan 34 files, 0 remote refs; license guard PASS |
| `python3 scripts/deterministic-zip.py --verify release/source.zip` | 0 | verify OK (1,144 files + dirs, sorted, fixed timestamp, fixed permissions, CRC OK) |
| `python3 scripts/deterministic-zip.py --verify release/dist.zip` | 0 | verify OK (114 files + dirs, sorted, fixed timestamp, fixed permissions, CRC OK) |

## 3. Freeze iterations (what went wrong on the way, and what was done)

1. **The freezer script did not exist.** `package.json` referenced
   `python3 scripts/deterministic-zip.py --freeze`, but no such file
   existed anywhere in the repo (T012 rehearsed packaging via
   `release-verify.mjs` only). Per plan §7, a script not yet
   implemented must be actually implemented by its owning task, not
   faked with `exit 0` — T014 is the owning task for
   `release:freeze`. The script was therefore created by this task
   (`scripts/deterministic-zip.py`, SHA-256 `33b026f3…`). It is
   release tooling, not product code: it never modifies `src/`,
   `oracle/`, tests, fixtures or evidence; all frozen inputs are
   read from the reviewed HEAD commit. It was **not** covered by the
   T013 review — its outputs were verified independently (§4). The
   parent should confirm whether a re-review of this tooling is
   wanted (see §7).
2. **Freeze run 1 failed (exit 1)** — the script's dirty-check
   flagged its own untracked file. Fixed the check to allow the
   freezer script itself while still failing on any tracked
   modification to build inputs or any untracked file under
   `src/`/`oracle/`/`examples/`.
3. **Freeze run 2 succeeded but `--verify` failed (exit 1)** — two
   checker bugs of this task's own making: the writer emitted all
   directory entries before file entries (not globally sorted), and
   the `.git` exclusion test matched `.gitignore`. Both fixed; the
   writer now emits one globally sorted entry stream and the
   exclusion test matches path segments.
4. **Freeze run 3 + re-freeze: verify OK, hashes stable** — but the
   standalone `dist.zip` demo then failed (see item 5).
5. **F-T014-01 — first frozen `dist.zip` could not run standalone.**
   `node checkpath.mjs demo` from the extracted bundle died with
   `ERR_MODULE_NOT_FOUND: Cannot find package 'yaml'` (imported by
   `dist/core/workflow-ir.js`, `workflow-parser.js`, `e2e.js` and
   `dist/cli/commands/common.js` — the only bare package import in
   `dist/`). The in-repo `release:verify` cannot catch this because
   it runs `dist/` with the repo's `node_modules` present. This is a
   packaging defect, not a product-code change: `dist.zip` now
   vendors the exact locked runtime dependency — `yaml` 2.9.1
   (`node_modules/yaml`: `package.json`, `LICENSE`,
   `dist/**/*.js`, 76 files; browser build, `.d.ts`, `bin.mjs` and
   `README.md` excluded as unused at runtime). The installed
   version is asserted to equal the lockfile pin (2.9.1), and the
   vendored files contain no local absolute paths. No product code,
   fixture, doc or `source.zip` byte changed (source.zip hash
   `5e84c787…` is identical before and after the fix). The
   standalone demo/analyze/matrix then passed (§4). Recorded in
   full in `release/RELEASE_NOTES.md` and in the manifest's
   `artifacts["dist.zip"].vendored_runtime_dependency`.
6. **Freeze run 6 (final) + re-freeze: byte-identical**, both
   `--verify` exit 0, standalone checks green.

## 4. Independent verification (beyond the acceptance commands)

- **source.zip vs HEAD:** extracted to a scratch dir; file list
  compared byte-wise against `git ls-files -z` — 1,144 vs 1,144,
  no missing, no extra (the one apparent `diff` line was only
  `git ls-files` C-quoting the non-ASCII `→` in one trace.zip
  name); `diff -r` against a `git archive HEAD` extraction —
  byte-identical.
- **dist.zip standalone (U-02):** extracted to `/tmp/t014/dist2`
  (no `node_modules` above it); `demo` exit 2,
  `report_sha256 9dc3af313677f795b3a836d9074833c9cfd2bf190d5e2201b7a99b08a23375b7`
  — identical to the in-repo demo/analyze report and to T012's
  recorded hash; demo report == analyze report from the same
  bundle; both checks `PENDING_NOT_REPORTED`. `analyze`
  pr-docs-only exit 2, `matrix` exit 2, `analyze` pr-src-only
  exit 0. Logs copied to `test_logs/dist2-*.log`.
- **No local paths in dist.zip:** `grep -r "/home/|/root/"` over the
  extracted bundle — no matches (exit 1). Entry names are all
  relative; all timestamps `(1980, 1, 1, 0, 0, 0)`; file mode
  `0644`, dir mode `0755` throughout (source.zip 1,443 entries,
  dist.zip 139 entries incl. dirs).
- **SHA256SUMS:** `sha256sum -c SHA256SUMS.txt` — all three OK.
- **Manifest consistency:** `freezer.sha256` equals the SHA-256 of
  the committed `scripts/deterministic-zip.py`; `s0_gate.sha256`
  equals the SHA-256 of the HEAD `evidence/S0_GATE.json`;
  `oracle_parity_report.sha256` equals the SHA-256 of the HEAD
  `evidence/tests/ORACLE_PARITY_REPORT.json`; both review hashes
  equal the SHA-256 of the HEAD review files; `git_commit` is the
  full `933dd35…` hash.
- **Build determinism:** the freeze build's dist tree hash
  (`14cd8492…`) equals the hash `release:verify` computed in its
  own two builds and equals T013 R2's recorded hash.

## 5. What the freeze did NOT change

- No product code, Oracle code, fixture, test, doc or spec file was
  modified. `git status` for `src/`, `oracle/`, `tests/`,
  `examples/`, `README.md`, `LICENSE_STATUS.md`,
  `THIRD_PARTY_NOTICES.md`, `package.json`, `package-lock.json` is
  clean vs HEAD.
- `source.zip` is the exact HEAD tree, including the historical
  evidence/log files that contain absolute workspace paths as text
  (`evidence/environment/ENVIRONMENT_REPORT.md`, some `handoff/`
  test logs). That content is part of the T013-reviewed commit and
  was not altered; the "no absolute paths" rule is satisfied at the
  archive level (relative entry names, fixed metadata) and at the
  content level for `dist.zip`. Disclosed in `RELEASE_NOTES.md` §7.
- The expanded static network check in `s0:gate` now counts 34
  files (was 33 in T013 R2) because the new
  `scripts/deterministic-zip.py` is a `.py` file under `scripts/`;
  0 matches. No network call was introduced.

## 6. Working-tree note (pre-existing drift, handled)

At task start the tree was **not** clean, contrary to the task
card: `evidence/s0/S0_ORACLE_REPORT.json` and
`evidence/tests/RELEASE_VERIFY_REPORT.json` were already modified
(test-run regenerations left over from a run after the T013
commit). This task's own regression runs additionally rewrote
`evidence/tests/ORACLE_PARITY_REPORT.json` (same class: generated
reports gaining the formal-pipeline fields). All three were restored
with `git checkout -- evidence/` before the commit, exactly as the
T013 reviewers did; they are **not** included in the T014 commit.
Untracked `reports/` was left untouched throughout and is excluded
from the commit and from both ZIPs. Test-run rewrites of
`evidence/tests/e2e-output/*.last-run.json` and trace files were
not produced (no `test:e2e` run in this task).

## 7. Unresolved / carried-forward items

- **U-01 — Windows PowerShell Quick Start NOT_TESTED** (no Windows
  machine; unchanged).
- **P2-R2-1 / P2-R2-2 / P2-R2-3** (T013 R2, minor, non-blocking) —
  recorded verbatim in `release/RELEASE_NOTES.md` §§1–3.
- **Duplicate-key YAML divergence (ADR FIX-P2/01)** — known
  limitation, recorded in `RELEASE_NOTES.md` §4.
- **Freezer script not T013-reviewed** (see §3 item 1): the parent
  should confirm whether a re-review of
  `scripts/deterministic-zip.py` and of the `dist.zip` vendoring
  (F-T014-01) is wanted. The freeze's independent verifications
  (§4) are the compensating evidence.
- **F-T014-01 follow-up (optional, not blocking):** a future task
  could bundle the CLI into a single self-contained file (e.g. via
  the build step) instead of vendoring `node_modules/yaml`, and
  could extend the release gate with a standalone-extracted
  `dist.zip` smoke run so this class of defect is caught by
  `release:verify` itself. Neither was done here: both would change
  reviewed build code and require a new T013/T014 cycle.

## 8. Deliverables

- `release/source.zip`, `release/dist.zip`,
  `release/SHA256SUMS.txt`, `release/RELEASE_MANIFEST.json`,
  `release/RELEASE_NOTES.md`
- `evidence/release/T014_FREEZE_REPORT.md` (this file)
- `scripts/deterministic-zip.py` (new release tooling)
- Handoff package: `handoff/P020-T014/` (TASK_REPORT.md,
  changed_files.txt, test_commands.txt, test_logs/, sha256.txt,
  unresolved_items.md)

## 9. Addendum 2026-11-08 — P2-6: source commit vs freeze commit (R1)

> 补记（FIX-P1-02 任务，2026-11-08）。本节只追加，不改写上文。
> 终审 R1 P2-6：Manifest 与本报告只记录了 933dd35，未明确它与提交的
> 冻结 commit 3e5e145 的对应关系。GPT 已明确表示没有证据证明两
> commit 存在代码污染或篡改，只是记录不清，补记录即可。

- **source_commit（被冻结的源码）**：`933dd35`
  （`933dd354e109436551ba40b96d5b4a2d83b839a6`，
  "T013 re-review — PASS, P0 0 / P1 0 / P2 3"，2026-11-08 17:57:29 +0000）。
  `release/source.zip`（`5e84c787…81aefb8`，1,144 文件）就是该 commit
  的 `git ls-files` 树。
- **freeze_commit（冻结提交本身）**：`3e5e145`
  （`3e5e14556f37e78ed411369d3e2324dcad199e20`，
  "T014: Release freeze — source.zip 5e84c787… dist.zip da130ad2…"，
  2026-11-08 18:10:57 +0000）。该提交在 source_commit 之上只加了
  冻结产物与冻结工具本身（29 文件：`scripts/deterministic-zip.py`、
  `release/source.zip`、`release/dist.zip`、`release/SHA256SUMS.txt`、
  `release/RELEASE_MANIFEST.json`、`release/RELEASE_NOTES.md`、本报告、
  `handoff/P020-T014/`），未改任何源码、Oracle、fixture、测试或规格。
- **可核对的 Git 证据**（本机仓库实测，2026-11-08）：
  - `git rev-parse 3e5e145^` → `933dd354e109436551ba40b96d5b4a2d83b839a6`
    （freeze_commit 的直接父提交就是 source_commit）。
  - `git merge-base --is-ancestor 933dd35 3e5e145` → 是；
    `git log 933dd35..3e5e145` → 仅 1 个 commit。
  - `git ls-tree 933dd35 -- scripts/deterministic-zip.py` → 为空
    （冻结脚本在 source_commit 时还不存在，是 T014 任务中创建的；
    这正是 R1 P1-2 的根因，见 FIX-P1-02 说明）。
  - `git ls-tree 3e5e145 -- scripts/deterministic-zip.py release/source.zip`
    → 两者均存在；脚本内容 SHA-256 `33b026f3…`，与 Manifest
    `freezer.sha256` 一致。
- **后续冻结的记录方式**（FIX-P1-02 起）：`scripts/deterministic-zip.py`
  生成的 Manifest 现同时记录 `source_commit`、`freeze_commit`、
  `freeze_status` 与 `freeze_history`（此前各次冻结的链）；每次冻结
  的真实 freeze commit 哈希在产物提交后补记于此报告（或其后续补记）。
  本次试冻验证产物见 `handoff/P020-FIX-P1-02/TASK_REPORT.md`——
  试冻不是正式 T014 重新冻结。
