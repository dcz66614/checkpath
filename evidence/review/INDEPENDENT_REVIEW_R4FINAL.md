# P020 CheckPath — T014 R4-FINAL 独立复核（R3-FINAL 返工验证）

**Verdict: PASS — P0 0 / P1 0 / P2 1（新增 P2-1，见 §11，非阻断）**

| 项 | 内容 |
|---|---|
| 审查对象 | R3-FINAL-01…04 返工 + T014 第 4 次正式重冻（R4）：源提交 `2ddc2ad`，冻结提交 `a153b94`，§9 补记 `e2956d0`，HEAD `106c00e` |
| 复核员 | 独立会话，与 T001–T014 施工者、R3-FINAL 修复员、前 19 轮 T013 复核员完全隔离；只验证，不改任何代码或文档 |
| 审查窗口 | 2026-11-10 ~02:35 GMT → ~03:00 GMT |
| 审查方法 | 全新 clone `~/workspace/p020-checkpath-clean-r4`（`git clone ~/workspace/p020-checkpath`，`checkout a153b94` 做哈希核对，再 `checkout 2ddc2ad` 重跑验收）；主仓库 `~/workspace/p020-checkpath/` 全程只读，未在其中运行任何验证命令、未改任何文件 |
| 工具链（实测） | Node v24.22.1 / npm 10.9.4 / Python 3.12.3 / PyYAML 6.0.1 / git 2.43.0 — 与 R4 manifest `toolchain` 一致 |

## §0 审查对象与结论先行

终审第 4 轮 FINAL_VERDICT: FAIL（P0 0 / P1 0 / P2 7），四项阻断全部是 T014 最终发布验收的文档/可追溯性问题。本轮复核逐项实测，结论：

| # | 终审 R4 阻断 | 复核结论 |
|---|---|---|
| 1 | T014_FREEZE_REPORT_R3.md 缺失 | **关闭**：R4 source.zip 内有该报告，正文头 freeze commit 为 `d8ffdeb`（与 §9 一致）；Drive `01_release_R4` 内亦有该文件 |
| 2 | R3 Release Notes 缺失 | **关闭**：包内有完整独立文件 `release/RELEASE_NOTES_R3.md`（R3 三件套全哈希、R19 PASS、限制、许可证 PENDING、R2 归档）；包内 `RELEASE_NOTES.md` 已是 R4 版，不再是纯 R2 内容 |
| 3 | Git 链未闭合 | **关闭**：新 manifest `freeze_history` 闭合 R2→`03c2f16`、R3→`d8ffdeb`（逐项核对全哈希）；`inputs` 含 `t013_review_r1`…`r19` 全部 19 项；`git diff 9dac3e1..2ddc2ad -- src/ oracle/` 为空；`git log 2ddc2ad..a153b94` 仅 1 commit 且 `a153b94^ = 2ddc2ad` |
| 4 | REVIEW_INDEX 只记到 R1/R2；无 R19 矩阵；无 REVIEW_PACK_03 | **关闭**：REVIEW_INDEX 追加 R3–R19（+66/−0，R1/R2 原文未动）；`COVERAGE_MATRIX_R19.csv` 99 行，workflow-parser.ts 为 READ-R19；`REVIEW_PACK_03.md` 与 `REVIEW_SHA256SUMS_R19.txt` 存在且 sums 4/4 OK |

其余复核项：R4 冻结三件套哈希全部复现（`sha256sum -c` 3/3 OK；试冻 ×2 亦复现，见 §8）；`dist.zip` 与 R3 逐字节一致（`b8e2aa77…`）；source.zip 2,734 文件，R3 的 2,728 文件全在，新增恰为 6 文件；验收命令全部 exit 0（§7）；许可证仍为 `PENDING_SAM_DECISION`，无 LICENSE 文件；R4 报告自身不在 R4 source.zip 内已在 R4 报告 §7 如实披露。

唯一新增问题是 P2-1（§11）：`s0:gate` 的 `gate_report_sha256` 含工作区绝对路径依赖，在异路径 clean clone 重跑得 `5d0e1c69…` 而非 `f511a847…`；但 gate 实质结果全同，且我已证明代入原路径指纹即精确复现 `f511a847…`。属表述口径问题，非阻断，不推翻 PASS。

## §1 哈希复现（冻结产物，`a153b94` 上的 `release/` 实测）

修复员声称值与我实测值逐项比对：

| 产物 | 修复员声称 | 我实测（clean clone，`a153b94`） | 结论 |
|---|---|---|---|
| source.zip | `ab23e4a70bef6e462e47875ccbecce4d3a6167a4d9cd3a3b204d9cd0e39a41ba`（2,734 文件） | `sha256sum` 同值；zip 内文件 2,734 个 + 目录 565 个 = 3,299 条目 | ✓ 一致 |
| dist.zip | `b8e2aa77074cd2f62a518c1c7969cfdaa7cff202c6d87239080c3dfe2c6d335c`（114 文件） | `sha256sum` 同值；与 R3 的 dist.zip 哈希逐字节一致；zip 内文件 114 个 + 目录 25 个 = 139 条目 | ✓ 一致 |
| RELEASE_MANIFEST.json | `2076f08773c0d765140cd74936c20b70259fce7da8f87ddbdd18a60920633baa`（FORMAL） | `sha256sum` 同值；`freeze_status` FORMAL | ✓ 一致 |
| SHA256SUMS.txt 自身 | `332088b73d6e434e8dd6e53bd64db1929b7c869ceb1c60bcc545fc219bd8ba8e` | `sha256sum release/SHA256SUMS.txt` 同值 | ✓ 一致 |

```sh
$ (cd release && sha256sum -c SHA256SUMS.txt)
source.zip: OK
dist.zip: OK
RELEASE_MANIFEST.json: OK
```

source.zip 内容核对（Python `zipfile` + `git ls-tree -r --name-only 2ddc2ad`）：zip 文件集合与 `2ddc2ad` 树逐项一致（2,734 对 2,734；唯一表面差异是含 Unicode 箭头的文件名在 git 输出中被引号转义，实为同一文件）。与 R3 source.zip（`git show d8ffdeb:release/source.zip`，哈希 `9a54081ec8d322f0f7d78c6c08a2dc8cf9370396a026a7a2d6fd0e85b4dc83cd`，2,728 文件）逐项比对：R3 的 2,728 文件全部仍在，新增恰为以下 6 个，无删除、无修改：

1. `evidence/release/T014_FREEZE_REPORT_R3.md`（R3 报告）
2. `evidence/release/GIT_FINAL_CHECK_R4.md`
3. `evidence/review/COVERAGE_MATRIX_R19.csv`
4. `evidence/review/REVIEW_PACK_03.md`
5. `evidence/review/REVIEW_SHA256SUMS_R19.txt`
6. `release/RELEASE_NOTES_R3.md`

与任务简报的预期（“R3 报告 + 5 个新文件”）一致。另核：R3 manifest 哈希 `f4ba7a17bf188fbea8acf61ffbf7ee01b5011b27a8cc2f0310122c3e3a332465`（`git show d8ffdeb:release/RELEASE_MANIFEST.json | sha256sum` 实测）与 R3 Notes 所载一致；R2 manifest `04a07733755c36ba5a614514859ef8698eb2c1b7d92d4c4ebd75d335cfb0a2fb`（`git show 03c2f16:…` 实测）与 R3 Notes 所载 R2 归档值一致；R2 source `3a778b93…` / dist `da130ad2…` 与 R3 Notes 及 R2 的 `SHA256SUMS.txt` 一致。

## §2 阻断 1 — R3 冻结报告（解压 R4 source.zip 只读检查 + Drive 核对）

- 解压 `/tmp/r4src`（`unzip -q release/source.zip`，仅读）：`evidence/release/` 内有 `T014_FREEZE_REPORT_R3.md`（另有 `T014_FREEZE_REPORT.md`、`T014_FREEZE_REPORT_R2.md`；R4 报告本身不在包内，见 §10）。
- 该报告正文头：`**Freeze commit:** \`d8ffdeb\``（全哈希 `d8ffdebb775e5b3241936ec86c11689c51f29bf1`），并附 R3-FINAL-01 订正说明（冻结时头写 PENDING 属设计使然，真实值在 §9；订正后头与 §9 一致，其余正文一字未改）。§9 补记亦为 `d8ffdeb`。头与 §9 一致，无 PENDING 残留（正文中出现的 "PENDING" 仅在解释历史写法的句子里）。
- Drive 核对（`hatch_gws_cli drive files list`，文件夹 `1_dsB0yymoygK_IgsNod_LngBZBqRu1Xv`）：9 个文件，含 `T014_FREEZE_REPORT_R3.md`（id `16ziwPmUTltGI2CSz7j1ahVeflXI0bRKY`，13,122 字节，与本地文件大小一致）。其余 8 个：`source.zip`（18,197,930 字节，与本地一致）、`dist.zip`（269,248）、`RELEASE_MANIFEST.json`（11,091）、`SHA256SUMS.txt`（240）、`RELEASE_NOTES.md`（13,876）、`RELEASE_NOTES_R3.md`（11,807）、`T014_FREEZE_REPORT_R4.md`、`TASK_REPORT.md`——文件 id 与第 5 轮证据包草稿 §0 所列 9 个 id 逐项一致。
- 交叉核：R3 source.zip（`git show d8ffdeb:release/source.zip` 重建）内 `evidence/release/` 只有 R3 报告缺失前的两份（`T014_FREEZE_REPORT.md`、`T014_FREEZE_REPORT_R2.md`），确认修复员 TASK_REPORT §1 的“部分属实”定性：文件当时在树内、确不在 R3 包内；Drive `01_release_R3`（`1O-8F49Ntm8NMyF6pEPF9xOaMJqMYG6LY`）实测恰为 6 文件（TASK_REPORT.md、INDEPENDENT_REVIEW_R19.md、SHA256SUMS.txt、RELEASE_MANIFEST.json、dist.zip、source.zip），无 R3 报告、无 R3 Notes。
- **阻断 1：关闭。**

## §3 阻断 2 — R3 Release Notes

- 包内 `release/RELEASE_NOTES_R3.md`（R4 source.zip 解压实测）：标题“Release Notes (T014 formal re-freeze, R3)”；源提交 `3a83371`、冻结提交 `d8ffdeb`；三件套全哈希：source `9a54081ec8d322f0f7d78c6c08a2dc8cf9370396a026a7a2d6fd0e85b4dc83cd`、dist `b8e2aa77…`、manifest `f4ba7a17bf188fbea8acf61ffbf7ee01b5011b27a8cc2f0310122c3e3a332465`；T013 R19 PASS（P0 0 / P1 0 / P2 8，报告哈希 `c6ec2c24…` 与 manifest `inputs.t013_review_r19` 一致）；R19 的 8 项 P2 限制；许可证 `PENDING_SAM_DECISION`（无 LICENSE 文件）；R2 归档说明（R2 source `3a778b93…`、dist `da130ad2…`、manifest `04a07733…`，均已在 §1 独立核对）；一代滞后披露。
- 包内 `release/RELEASE_NOTES.md`（解压实测）：标题已是“(T014 formal re-freeze, R4)”，不再是纯 R2 内容；含完整 R3 章节（“## R3 release (superseded, preserved — complete chapter)”）与四项返工说明。注意：包内此文件是预冻结版，R4 三件套哈希处写“见 SHA256SUMS.txt”（冻结时哈希尚不存在）；终版（含正式 R4 哈希 `ab23e4a7…` / `2076f087…`）在冻结提交 `a153b94` 内与 Drive `01_release_R4` 内——该一代滞后在正文与 R4 报告中均已披露（见 §10）。
- **阻断 2：关闭。**

## §4 阻断 3 — Git 链（全部 git 命令在 clean clone 内实测）

```sh
$ git rev-parse 03c2f16 d8ffdeb 3e5e145 7638f06
03c2f168a40b114ff1a0f408fa783f5d5389e15d
d8ffdebb775e5b3241936ec86c11689c51f29bf1
3e5e14556f37e78ed411369d3e2324dcad199e20
7638f066505376fd993970179da54c897df16a9b
```

- Manifest `freeze_history`（R4，`release/RELEASE_MANIFEST.json` 实测）：R1 `3e5e1455…` / 源 `933dd35…` FORMAL；FIX-P1-02 试冻 `TRIAL` / 源 `36476cf…`；R2 `03c2f168a40b114ff1a0f408fa783f5d5389e15d` / 源 `538c669e11a383aa0554d05239e298cf34aadd4d` FORMAL；R3 `d8ffdebb775e5b3241936ec86c11689c51f29bf1` / 源 `3a8337151461b80e4ae50e75ab2edf417f4f9165` FORMAL——与 `git rev-parse` 逐项一致，R2/R3 条目均已闭合，无 PENDING。
- Manifest `inputs` 含 `t013_review_r1`…`r19` 共 19 项；抽查哈希：`t013_review_r19` `c6ec2c2415baedeab47914f34f1fe7238ca910ff1cc158e7ba417cbed2750470` 与 `git show 2ddc2ad:evidence/review/INDEPENDENT_REVIEW_R19.md | sha256sum` 一致；`t013_review_r1` `8cf3033ac3d63ca00fb55ebd587f07a67c4fafc5d0e1184cf8274c3888ed1823` 与 `git show 2ddc2ad:evidence/review/INDEPENDENT_REVIEW.md | sha256sum` 一致。
- R19 之后零业务代码变更（关键项）：
  - `git diff 9dac3e1..2ddc2ad -- src/ oracle/` 输出 0 行（空）；`git diff --quiet 4c67520..2ddc2ad -- src/ oracle/ tests/` exit 0（与修复员 TASK_REPORT §0 的声称一致）。
  - `git diff 9dac3e1..3a83371`：4 提交 / 46 文件（35 新增 + 11 修改），`-- src/ oracle/` 子集为 0。逐项定性：FIX-P0-19 报告 1 个（`handoff/P020-FIX-P0-19/TASK_REPORT.md`，提交 `3991856`）；R19 证据 34 个（`evidence/review/INDEPENDENT_REVIEW_R19.md` + `evidence/probes/r19/` 33 个，提交 `9fd0233`）；R14/R15 stale-flag 清理 10 个（`evidence/probes/r14/`、`r15/` 各 5 个，均为修改非新增，提交 `a4106d8`）；freezer 补丁 1 个（`scripts/deterministic-zip.py`，提交 `3a83371`）。其中 freezer 补丁的 diff 实测为：hash 清单新增 R4–R19 的 16 个 review 文件路径 + `T013_REVIEW_VERDICTS` 表（R4–R18 NOT PASS、R19 PASS 及各轮 p0/p1/p2），无任何产品逻辑改动。修复员称“46 文件”与任务简报的初步预期（“只有 freezer 脚本 + manifest 输入”）不同——以实测为准，GIT_FINAL_CHECK_R4.md §2–§3 已如实记录此修正。
  - `git diff 3a83371..4c67520`：仅 6 文件——`evidence/release/T014_FREEZE_REPORT_R3.md`（§9 补记）、`evidence/tests/RELEASE_VERIFY_REPORT.json`、`release/RELEASE_MANIFEST.json`、`release/SHA256SUMS.txt`、`release/dist.zip`、`release/source.zip`；无 `src/`/`oracle/` 改动。
  - `git log 2ddc2ad..a153b94`：仅 1 commit（`a153b94`）；`git rev-parse a153b94^` = `2ddc2ad0a7afd34bc2d5fe989f7d2e2bdb4e0b98`；R4 报告 §9（`e2956d0` 版）所载父提交核对与之一致。
- **阻断 3：关闭。**

## §5 阻断 4 — 索引、矩阵与证据包

- `REVIEW_INDEX.md`：`git diff 3a83371..2ddc2ad -- REVIEW_INDEX.md` 为 **66 insertions, 0 deletions**（`--stat` 实测）；`git diff d8ffdeb..2ddc2ad -- REVIEW_INDEX.md` 的删除行数为 0——R1/R2 原文未动，新增为 "## Rounds 3–19" 章节 + "## Headline findings (rounds 3–19)"，逐轮 verdict 与 manifest `T013_REVIEW_VERDICTS` 一致（R3 PASS 0/0/3 … R18 NOT PASS 1/0/8，R19 PASS 0/0/8）。
- `evidence/review/COVERAGE_MATRIX_R19.csv`：100 行 = 表头 + 99 行；状态值分布 READ-R1 48 / READ-R19 39 / READ-R2 6 / READ-R9 2 / READ-R3、R5、R10、R18 各 1；NOT_READ 0 行。`src/core/workflow-parser.ts` 行为 `READ-R19`（2,099 行，FIX-P0-19 `+127/−1`，`hasDuplicateAliasKey`），并明文写明取代 R2 矩阵的 stale 标记；全文唯一的 "Unchanged since R1" 命中即在该行注释内（说明被取代的旧标记），无任何文件仍以该状态登记。
- `evidence/review/REVIEW_PACK_03.md`：存在（212 行）；头声明“由 R3-FINAL 整理自 R19 报告原文与已入库探针文件，无新增数字”。
- `evidence/review/REVIEW_SHA256SUMS_R19.txt`：4 项，在仓库根目录 `sha256sum -c` 全部 OK（R19 报告 `c6ec2c24…`、PACK_03 `f08eb502…`、矩阵 `5d64c4d1…`、REVIEW_INDEX `53efc19f…`）。
- **阻断 4：关闭。**

## §6 Manifest `known_limitations`（P2-R3-1 / P2-R6-2 / 新 P2-6）

- **P2-R3-1 标 RESOLVED，依据充分。** 修复员承认 R4 报告从未逐字写出编号 "P2-R3-1"——我独立核实属实：全仓库 grep "P2-R3-1" 命中 `INDEPENDENT_REVIEW_R3.md`、`T014_FREEZE_REPORT_R2.md`、`T014_FREEZE_REPORT_R4.md`、`GIT_FINAL_CHECK_R4.md`、`REVIEW_PACK_03.md`，**不含** `INDEPENDENT_REVIEW_R4.md`。但该编号所指的分歧本身在 R4 §1 已由独立复核员在干净克隆中验证关闭：R3 定义的分歧是 `True:` vs `true:` 残余分歧（TS INVALID vs Oracle UNKNOWN）；FIX-P0-02 后 R2 输入双边均为 INVALID / `yaml_parse_error`，MATCH；夹具锁定真实存在于树内——`tests/fixtures/trigger/T6-20-dup-bool-true/workflow.yml` 与 R2 输入逐字一致（仅 name 不同）、`tests/fixtures/parser-divergence/duplicate-key/dup-bool-true.yml`（第 4 个 case）及 golden G-84。Manifest 条目正文亦明文写清“R4 does not cite the label 'P2-R3-1' literally; the closure is of the exact underlying divergence R3 recorded.”RESOLVED 的标注有充分依据，非空口改标。
- **P2-R6-2 已登记**（"PARTIALLY MITIGATED, still open as a historical residual"：R7/R8 自写探针仅存于 /tmp、VM 重启后丢失，R9–R19 已归档于 `evidence/probes/r9/`–`r19/`）。R4 报告 §7 同样登记。非阻断。
- **新 P2-6（USER=root 验证器误报）已披露且与旧 P2-6 区分清楚。** Manifest 条目标注 "P2-6 (final-review R4)"，并说明终审 R3 的 P2-6（“哈希未变”的错误认定，GPT 已在 R4 撤销）与之不同。**我亲自复现**（clean clone，`2ddc2ad`）：
  ```sh
  $ USER=root python3 scripts/deterministic-zip.py --verify /tmp/r4_source.zip   # R4 source.zip，哈希 ab23e4a7…
  FAIL: username in entry name: tests/fixtures/parser-divergence/absorbed-anchor-colon-p0-17/c-tag-root-block.yml
  FAIL: username in entry name: tests/fixtures/parser-divergence/anchored-empty-key-p0-16/p01-root-first-tag-unglued.yml
  FAIL: username in entry name: tests/fixtures/parser-divergence/anchored-empty-key-p0-16/p02-root-second-tag-unglued.yml
  FAIL: username in entry name: tests/fixtures/parser-divergence/anchored-empty-key/k01-anchored-root.yml
  FAIL: username in entry name: tests/fixtures/parser-divergence/flow-quoted-key/f19-flow-key-root.yml
  exit=1
  $ env -u USER python3 scripts/deterministic-zip.py --verify /tmp/r4_source.zip
  verify OK: /tmp/r4_source.zip (3299 entries, sorted, fixed timestamp 1980-01-01, fixed permissions, CRC OK)
  exit=0
  ```
  复现结果与修复员声称完全一致：`USER=root` 时 exit 1、恰 5 条 FAIL（均为夹具文件名含 `root` 子串）；`USER` 为空时 verify OK；`dist.zip` 在 `USER=root` 下亦 verify OK（139 条目，无含 `root` 的条目名）。属工具缺陷（`do_verify` 用子串匹配 `$USER`），非产品问题；ZIP 本身不受影响。R4 报告 §7 亦登记了该项。

## §7 验收命令重跑（clean clone，源提交 `2ddc2ad`，`npm ci` 后亲自运行）

| 命令 | Exit | 结果（我实测） | 与修复员声称 |
|---|---|---|---|
| `npm run typecheck` | 0 | clean | 一致 |
| `npm run lint` | 0 | clean | 一致 |
| `npm test` | 0 | **1697/1697**，53 文件（80.42s） | 一致 |
| `npm run test:oracle` | 0 | **167/167**，0 mismatches，0 false PASS，unsupported UNKNOWN 34/34 | 一致 |
| `npm run s0:gate` | 0 | **PASS**；oracle 24/24，0 mismatches，0 false PASS；determinism 100 runs，1 unique hash | 见下段 hash 说明 |
| `npm run release:verify` | 0 | **PASS**（5/5 步：build determinism、cli smoke、report_sha256 recompute、offline scan、license guard） | 一致 |
| `python3 evidence/probes/r14/r14-probe.py` | 0 | **78/78 MATCH**，0 DIFF | 一致 |
| `python3 evidence/probes/r15/r15-probe.py` | 0 | **122/122 MATCH**，0 DIFF | 一致 |

**s0:gate 哈希说明（P2-1 的全部依据，见 §11）。** 我重跑的 `s0:gate` 输出 `gate_report_sha256=5d0e1c6957bda7ce5580f19adbb10d5032878858715a6f06ac5ba6284a162f4b`，不是清单记录的 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`。根因已查明：`evidence/S0_GATE.json` 重跑后与入库版**仅 2 个字段不同**——`environment_fingerprint` 与其派生的自哈希 `gate_report_sha256`；其余全部字段（24/24、100 次 1 哈希、0 网络、0 false PASS、输入夹具哈希 `afce74c9…`）逐字节相同。而 `environment_fingerprint` 由 `scripts/env-check.mjs` 计算，输入含 `workspace=${root}`（绝对路径）。我用 Python 精确复算：`workspace=/home/hatch/workspace/p020-checkpath` 时指纹恰为入库值 `e1cfe76c50cb7383d15f11d1e43e804207ec5ce1c8922da86d97b5499627378e`；`workspace=/home/hatch/workspace/p020-checkpath-clean-r4` 时恰为我实测值 `9f5e677f8dcb5850fa61d890af1b99fed7a8cb45b9a8680e7a3266855c5bbb0c`。进一步：入库报告的自哈希按文档公式重算确为 `f511a847…`；把我新生成的报告仅将指纹换回原路径值后重算自哈希，亦精确得 `f511a847…`。结论：gate 实质全部通过，`f511a847…` 是“同一工作区路径下”的可复现值，不是跨路径可复现值。R4 报告 §2/§10 与第 5 轮消息 §10 称其“不变”时未注明该前提（见 P2-1）。

## §8 试冻复现（`npm run release:freeze -- --trial`，`2ddc2ad`，亲自运行 ×2）

两次结果完全一致，均为 exit 0：

```sh
source.zip: ab23e4a70bef6e462e47875ccbecce4d3a6167a4d9cd3a3b204d9cd0e39a41ba (2734 files)
dist.zip:   b8e2aa77074cd2f62a518c1c7969cfdaa7cff202c6d87239080c3dfe2c6d335c (114 files)
RELEASE_MANIFEST.json: 231047b0e4327ee1c6d3032bda39d739bc4aead22ce11813c2d18ea24a33ba8b
freeze OK
```

与修复员声称的试冻 manifest `231047b0…`（TRIAL 文案）一致；source/dist 与正式冻结逐字节同哈希。试冻后我用 `git checkout -- release/ evidence/S0_GATE.json evidence/tests/ORACLE_PARITY_REPORT.json` 将 clean clone 恢复至 `2ddc2ad` 干净状态（`git status` 空），再写入本报告。

## §9 第 5 轮证据包草稿抽查（`handoff/P020-FINAL-R4-FOLLOWUP/message.txt`，取自 `106c00e`）

- 体积：`wc -c` = 118,284 字节；ASSEMBLY_NOTES 称“113,421 字符 / 118,284 字节”——字符数与字节数之别（中文字符 UTF-8 占 3 字节），无出入。
- 全部 64 位十六进制哈希：共 40 个不同值，逐项核对——R4/R3/R2 三件套、试冻 manifest `231047b0…`、试冻源 `3c059bc3…`、S0 gate `f511a847…`、R1–R19 全部 review 哈希、矩阵/索引/sums 哈希（`5d64c4d1…` / `53efc19f…` / `586566e0…`，其中 `586566e0…` 为 `REVIEW_SHA256SUMS_R19.txt` 自身哈希，实测一致）、freezer 脚本 `c2a1c9e8…`、golden 套件 `62a8b519…`、Oracle parity `db20127f…`、S0 输入夹具 `afce74c9…`——**全部与我实测或 manifest 记录一致，无一不符**。
- 六个全文粘贴节与原文逐字节比对（Python 行级 diff）：§3 R3 报告（235 行）、§5 R3 Notes（208 行）、§7 Git 核对（266 行）、§9 REVIEW_PACK_03（212 行）、§4 R4 报告（`e2956d0` 版，313 行）、§6 R4 Notes 终版（239 行）——**全部 identical**。§1 manifest 全文（249 行）亦 identical。§8 索引节选除组装员自写的一句说明外，全部逐行出自 REVIEW_INDEX.md 新增章节。
- §0 对照表：四项“核实结论/修复/证据”与本报告 §2–§5 的实测结论一致；三处“核实修正”（`9dac3e1..3a83371` 实为 4 提交/46 文件；P2-R3-1 无逐字编号但分歧本身已关闭；两个 P2-6 同名不同项）均属实，我在 §4/§6 独立复核过。R3→R4 哈希对照表与 §1 一致；“+6：R3 报告 + 5 个新文件”与 §1 的 6 文件清单一致；REVIEW_INDEX “+66/−0”与 §5 的 diff --stat 一致。
- §10 验收表：全部 10 行命令与结果与本报告 §7/§8 的我实测一致（typecheck/lint/test/oracle/s0:gate/release:verify/r14/r15/试冻 ×2/正式冻结/`sha256sum -c` 3/3）。唯一口径问题是 s0:gate 一行的“`f511a847…` 不变”未注明路径前提（即 P2-1，同样出现在 R4 报告 §2）。
- Drive id 核对：§0 所列 P020 文件夹 `13R1g7xeRkh_IWSg4q6GTWYSgHK0Sftdo` 下确有 `01_release_R4` / `01_release_R3` / `01_release_R2` / `02_evidence` / `01_release` / `00_spec`；`01_release_R4` 内 9 文件的 id 与 §0 所列逐项一致（§2 已列）。`02_evidence/review` 内确有 REVIEW_PACK_03.md、COVERAGE_MATRIX_R19.csv、REVIEW_SHA256SUMS_R19.txt、REVIEW_INDEX.md、GIT_FINAL_CHECK_R4.md；`02_evidence/logs` 内确有 13 个 `P020-T014-R4_` 文件（typecheck、lint、test、test-oracle、s0-gate、release-verify、r14、r15、trial1、trial2、formal freeze 日志 + 2 个试冻产物副本）。
- **草稿抽查结论：未发现与事实不符之处。** 唯一待修正的是 P2-1 的一句话口径（建议在 §10 的 s0:gate 行加注路径前提；不改不影响四项阻断的闭合）。

## §10 许可证与一代滞后披露（另核）

- 许可证：工作树内无 `LICENSE` 文件（仅 `LICENSE_STATUS.md`，内容 `PENDING_SAM_DECISION`）；R4 manifest `license_status` 为 `PENDING_SAM_DECISION`；包内 R4 Notes 与 R3 Notes 均明文“no LICENSE file exists and no license has been selected”。`dist.zip` 内 vendored `yaml` 的 `LICENSE` 是该依赖自身的许可证文件，非本项目许可证。**许可证仍为 PENDING_SAM_DECISION，无已定许可证的表述。**
- R4 报告自身不在 R4 source.zip 内：属实（§2 解压清单中无 `T014_FREEZE_REPORT_R4.md`），已在 R4 报告 §7 明文披露（“This report itself is NOT inside the R4 `source.zip` (one-generation lag …); it is committed in the freeze commit and uploaded to Drive `01_release_R4`, and it enters the frozen package at the next freeze, if any. The R3 report — the one GPT asked for — IS inside the R4 `source.zip`.”）。与 R3 报告在 R3 时的一代滞后属同一设计，非新增缺陷。R4 报告在 `e2956d0` 的版本正文头已闭合为 `a153b94`（§9 补记亦为 `a153b94`），自洽。

## §11 分级问题清单

- **P0：0。** 无阻断性问题。
- **P1：0。** 无须返工的重大问题。
- **P2：1（新增，非阻断）。**
  - **P2-1（新）：`s0:gate` 的 `gate_report_sha256` 具有工作区路径依赖性，R4 报告与第 5 轮消息称其“不变”时未注明前提。** 证据：§7 的完整推导——异路径 clean clone 重跑 gate 实质全同但自哈希为 `5d0e1c69…`；指纹含 `workspace=${root}`；代入原路径即精确复现 `f511a847…`。影响：任何在异路径 clone 中重跑的验证者（包括 GPT 如自行重跑）会看到不同哈希，可能误判 gate 已变。建议（后续任务，不属本次返工范围）：在 R4 报告 §2、消息 §10 的 s0:gate 行加一句“该哈希含工作区路径指纹，仅在同一路径下复现”；或将 `environment_fingerprint` 改为与路径无关（需另行冻结，不建议为此再冻一次）。**不阻断 PASS**：gate 命令本身 exit 0 且实质结果全同；四项阻断、冻结哈希、零代码变更均已闭合。

## §12 NOT_READ 清单（本次未读 / 未独立验证项）

- 第 5 轮消息 §10 所贴的 11 份验收日志“尾部关键行”未逐行下载 Drive `02_evidence/logs` 内的日志原文比对——但表中全部 10 行命令的结果已由我在 §7/§8 亲自重跑并核对一致，日志尾部粘贴不影响裁决。
- Drive `01_release_R2` / `01_release_R3` 文件夹的“未动”仅核对到文件夹仍以各自 id 独立存在、R3 文件夹恰为 6 文件（§2）；未逐字节下载比对 R2/R3 的全部历史文件（非本次返工范围，R2/R3 已是历史归档）。
- REVIEW_PACK_03.md 内引用的全部数字未逐项回溯 R19 报告原文与探针文件——包头已明文标注为 R3-FINAL 整理、无新增数字；R19 报告本身的正确性由 R19 轮次负责，不属本次 R3-FINAL 复核范围。
- 修复员 TASK_REPORT.md §3 之后的章节（§4–§5 的 Drive 上传细节）仅抽查了 §0–§1 与关键声称；Drive 侧的关键事实（9 文件、id、大小、02_evidence 内容）已在 §2/§9 独立核对。

## §13 裁决

**PASS。** 四项阻断全部关闭（§2–§5）；R4 冻结哈希全部复现（§1、§8，`sha256sum -c` 3/3 OK，试冻 ×2 同哈希）；R19 之后零业务代码变更（`9dac3e1..2ddc2ad -- src/ oracle/` 为空，46 文件定性无 `src/`/`oracle/` 改动）；验收命令全部 exit 0 且实质结果与声称一致（§7）；许可证仍待 Sam 决定；一代滞后已如实披露。唯一新增 P2-1 为表述口径问题，非阻断，建议在第 5 轮消息发出前顺手加注（不改不影响本裁决）。

复核员注：本报告写于 clean clone `~/workspace/p020-checkpath-clean-r4` 的 `evidence/review/INDEPENDENT_REVIEW_R4FINAL.md`；主仓库未被修改。报告全文同时交回协调员，由协调员负责入库。
