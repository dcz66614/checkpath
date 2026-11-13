# P020 终审 R4 跟进消息 — 组装说明（ASSEMBLY_NOTES.md）

组装员：R3-FINAL 返工执行员本人（与 T013/T014 各方隔离的说法不适用——本包由返工执行员按任务书组装，复核员由协调员另派）；工作目录 `~/workspace/p020-checkpath`，组装时 HEAD `e2956d0`。
组装时间：2026-11-10 ~02:30–02:45 GMT。
产物：`message.txt`（113,421 字符 / 118,284 字节）。

**注意体积**：本包比 R3 跟进包（64,970 字符）大得多，因为任务书要求同时贴出两份冻结报告全文（R3 + R4）、两份 Release Notes 全文（R3 + R4）、Git 核对报告全文与 REVIEW_PACK_03 全文。未做删减；如协调员认为过长，可删 §9（REVIEW_PACK_03 全文，可只留 §9 的摘要表）或 §3（R3 报告全文，Drive 与 source.zip 内均有），但删减前请注意：§3 与 §5 正是终审 R4 点名的缺失项，全文贴出是最直接的闭合证据。

## 各章节来源与核对方法

### §0 四项返工对照表 + R3→R4 哈希对照表
- 四项核实结论：逐项亲核，见 `handoff/P020-T014-R4/TASK_REPORT.md` §1（R3 报告在 source.zip 内缺失经 `python3 zipfile` 实测；Drive `01_release_R3` 6 文件清单经 Drive API 实测；R2 条目 PENDING 经 manifest 实测；R2 矩阵 stale 标记经 CSV 实测；`9dac3e1..3a83371` 四提交经 `git log` 实测；P2-R3-1 引用口径经全仓库 grep 实测；`USER=root` 误报经实测复现）。
- R4 值：当前 `release/` 实测 `sha256sum`：source `ab23e4a7…`（2,734 文件）、dist `b8e2aa77…`（114 文件）、manifest `2076f087…`（FORMAL）；R3 值：R3 冻结提交 `d8ffdeb` 的 `release/` 实测值（source `9a54081e…`、dist `b8e2aa77…`、manifest `f4ba7a17…`），与 `T014_FREEZE_REPORT_R3.md` §1 一致。
- Drive 文件夹与文件 id：创建与上传时 API 实测返回（见 TASK_REPORT §5）。

### §1 RELEASE_MANIFEST.json 全文
- 来源：`release/RELEASE_MANIFEST.json`（R4 正式冻结产物），全文原样贴入，未改动。
- 核对：`sha256sum` = `2076f087…`，与 §0 表一致；`freeze_status` FORMAL；`freeze_history` 四项含 R2→`03c2f16`、R3→`d8ffdeb`；`inputs` 含 `t013_review_r1`–`r19` 全部 19 项；`known_limitations` 含 P2-R3-1 RESOLVED、P2-R6-2、P2-6 (final-review R4)。

### §2 SHA256SUMS.txt 全文
- 来源：`release/SHA256SUMS.txt`，全文原样贴入；`sha256sum -c` 在正式冻结后 3/3 OK（本次组装时在 `release/` 内重跑确认）。

### §3 T014_FREEZE_REPORT_R3.md 全文
- 来源：`evidence/release/T014_FREEZE_REPORT_R3.md`（R3-FINAL-01 订正后版本），全文原样贴入。
- 核对：正文头 Freeze commit 为 `d8ffdeb`，与 §9 一致；该文件在 R4 source.zip 内（试冻 zip 实测在列），亦在 Drive `01_release_R4` 内。

### §4 T014_FREEZE_REPORT_R4.md 全文
- 来源：`evidence/release/T014_FREEZE_REPORT_R4.md`（§9 已补记冻结提交 `a153b94`），全文原样贴入。
- 核对：§9 的父提交核对（`a153b94^` = `2ddc2ad…`、merge-base 是、log 仅 1 commit）与脚本哈希（`c2a1c9e8…` = manifest `freezer.sha256`）均在 §9 提交前实测。

### §5 RELEASE_NOTES_R3.md 全文
- 来源：`release/RELEASE_NOTES_R3.md`（R3-FINAL-02 新建），全文原样贴入。
- 核对：R3 三件套哈希与 R3 冻结报告 §1 一致；R19 PASS 与 `INDEPENDENT_REVIEW_R19.md` 一致。

### §6 RELEASE_NOTES.md 全文
- 来源：`release/RELEASE_NOTES.md`（R4 终版，冻结提交 `a153b94` 内版本），全文原样贴入。
- 核对：R4 三件套哈希与 §2 一致；R3 章节哈希与 §5 一致。注意：R4 source.zip 内的 RELEASE_NOTES.md 是预冻结版（R4 哈希处写“见 SHA256SUMS.txt”），一代滞后已在正文与 §4 报告中披露；此处贴的是终版。

### §7 GIT_FINAL_CHECK_R4.md 全文
- 来源：`evidence/release/GIT_FINAL_CHECK_R4.md`，全文原样贴入。
- 核对：文件由脚本直接写入真实命令输出（非手抄）；其中 `9dac3e1..3a83371` 四提交的认定已在 TASK_REPORT §1 说明（与任务简报的初步预期不同，以实测为准）。

### §8 REVIEW_INDEX.md R3–R19 新增章节
- 来源：`REVIEW_INDEX.md` 中 "## Rounds 3–19" 至 "## Specs" 之间的新增章节，原样贴入。
- 核对：R1/R2 原文未动（`git diff` 显示 REVIEW_INDEX.md +66/−0）；各轮 verdict 与 manifest `T013_REVIEW_VERDICTS` 一致；R19 报告 SHA-256 前缀 `c6ec2c2415ba` 与 manifest 一致。矩阵与 sums 文件未全文贴入（见 §8 末尾的哈希），全文在 Drive `02_evidence/review` 及 R4 source.zip 内。

### §9 REVIEW_PACK_03.md 全文
- 来源：`evidence/review/REVIEW_PACK_03.md`，全文原样贴入。
- 核对：包内数字全部引自 `INDEPENDENT_REVIEW_R19.md` 原文与已入库探针文件（R3-FINAL 编写整理时逐项对照，未新增数字）；R3-FINAL addendum 段明确标注为事后补记，非 R19 报告原文。

### §10 验收日志
- 来源：`handoff/P020-T014-R4/test_logs/`（11 个日志 + 2 个试冻产物副本），各取尾部关键行原样贴入。
- 核对：全部命令均在源提交 `2ddc2ad` 上亲自跑过（见 TASK_REPORT §3）；重跑后 `git status` 干净（`S0_GATE.json` 逐字节一致，`release:verify` 未改动任何已跟踪文件）。完整日志在 Drive `02_evidence/logs`（13 个 P020-T014-R4_ 文件）。

## 未核对上的项
- 无。所有写进消息的数字均已按上法亲自核对。唯一需要协调员注意的是消息体积（见顶部“注意体积”）。

## 待父 agent 的下一步
- 将 `message.txt` 全文经浏览器任务发到同一立项对话（终审第 5 轮；已用 4/5，本轮为本对话最后一轮）。发送前确认模型 GPT-6 + 思考 Extra High；每条消息末尾加“请使用谷歌云盘以及任何需要的插件，如果有了的话就算了。”（本消息末尾已加）。
- 若第 5 轮仍不通过，需按工厂规则开新对话继续终审（同一对话最多 5 轮）。
