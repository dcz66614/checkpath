# P020 终审 R3 跟进消息 — 组装说明（ASSEMBLY_NOTES.md）

组装员：全新会话，与 T013/T014 各方隔离；工作目录 `~/workspace/p020-checkpath`，HEAD `4c67520`。
组装时间：2026-11-10 ~00:57–01:01 GMT。
产物：`message.txt`（64,970 字符 / 79,894 字节；目标约 70KB 文本——按字符计在目标内，按字节计约 80KB，因含中文 UTF-8；§1–§5 全文优先保留，未做删减）。

## 各章节来源与核对方法

### §0 R2→R3 哈希对照表
- R3 值：当前 `release/` 实测 `sha256sum`（组装时亲自跑）：manifest `f4ba7a17…`、source `9a54081e…`、dist `b8e2aa77…`；SHA256SUMS.txt 内容见 §2。
- R2 值：R2 正式冻结提交 `03c2f16` 的 `release/`（`git show 03c2f16:release/SHA256SUMS.txt` 与 `git show 03c2f16:release/RELEASE_MANIFEST.json` 实测）：source `3a778b93…`、dist `da130ad2…`、manifest `04a07733…`（freeze_status FORMAL）；与 `evidence/release/T014_FREEZE_REPORT_R2.md` §表（行 31–34）逐项一致。
- **陷阱（已避开）**：R2 源码提交 `538c669` 的 `release/SHA256SUMS.txt` 是 R1 时代文件（source `2057e207…`、manifest `67452875…`），因为冻结产物是在其后的冻结提交 `03c2f16` 才入库；报告 §3.5 亦注明了这一代滞后。切勿用 `538c669` 处的值当 R2 值。
- GPT 声称的 R2 manifest `1f8ef5c0…（DRAFT）`：在仓库 git 记录中找不到该值对应的 R2 manifest；实际 R2 manifest 为 `04a07733…` FORMAL。消息中只陈述了 git 实测值，未断言 `1f8ef5c0…` 是什么。
- 文件数：R2 source 1,209 文件（R2 冻结报告）、R3 source 2,728 文件（T014 报告 + `unzip -l` 总条目 3,293 含目录，文件数 2,728）；dist 均为 114 文件。

### §1 RELEASE_MANIFEST.json 全文
- 来源：`release/RELEASE_MANIFEST.json`（9,814 字节），全文原样贴入，未改动。
- 核对：`sha256sum` = `f4ba7a17…`，与 §0 表一致；`freeze_status` FORMAL；`inputs` 含 `t013_review_r1`–`r19` 全部 19 项（组装脚本外另由父 agent 先前核对过）。

### §2 SHA256SUMS.txt 全文
- 来源：`release/SHA256SUMS.txt`（240 字节），全文原样贴入；`sha256sum -c` 在 T014 冻结时 3/3 OK（本次未重跑 `-c`，因 §6 的 release:verify 已覆盖等价核验；见下）。

### §3 INDEPENDENT_REVIEW_R19.md 全文
- 来源：`evidence/review/INDEPENDENT_REVIEW_R19.md`（24,155 字节，223 行），全文原样贴入。
- 核对：结论行 `PASS — P0 0 / P1 0 / P2 8` 在文件第 6 行；其 §1 表（R18 狩猎 50/50 等）与父 agent 先前重计的 `evidence/probes/r19/reruns/` 结果一致（本次组装未重复重计，引用父 agent 的核对结论）。

### §4 FIX-P0-19 TASK_REPORT.md 全文
- 来源：`handoff/P020-FIX-P0-19/TASK_REPORT.md`（15,847 字节），全文原样贴入。

### §5 代码 diff
- 来源：`git show 9dac3e1 -- src/core/workflow-parser.ts src/core/e2e.ts`（186 行）全文贴入；另附 `git show --stat --oneline 9dac3e1` 完整清单。
- 核对：src/ 部分确为 `workflow-parser.ts +127/−1`、`e2e.ts +7/−2`（`git show --stat`）；其余文件为 35 夹具 + 1 测试文件 + 探针证据（stat 清单内可见）。

### §6 验收日志（本次组装时亲自重跑，HEAD 4c67520）
- `npm test`：53 文件，1697/1697 通过，exit 0（耗时 81.55s）。
- `npm run test:oracle`：167 夹具，0 mismatch，0 false PASS，34/34 UNKNOWN，exit 0。
- `npm run s0:gate`：PASS；oracle 24/24；100 次运行 1 个唯一哈希；gate_report_sha256 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`；exit 0。
- `npm run release:verify`：PASS，5/5 步，exit 0（CLI smoke 各预期 exit 码、report_sha256 重算一致、离线扫描 0 远程引用、license guard PENDING_SAM_DECISION）。
- `python3 evidence/probes/r14/r14-probe.py`：78/78 MATCH，0 DIFF，exit 0。
- `python3 evidence/probes/r15/r15-probe.py`：122/122 MATCH，0 DIFF，exit 0。
- 重跑后 `git status`：仅 `handoff/P020-FINAL-R3-FOLLOWUP/` 未跟踪；无任何已跟踪文件被改动（release:verify 重建的 `dist/` 与 `RELEASE_VERIFY_REPORT.json` 与已提交值逐字节一致），树保持干净。

### §7 文件清单
- dist.zip：`unzip -l release/dist.zip` 完整输出（114 文件，139 条目含目录；时间戳全 1980-01-01 固定值）。
- source.zip：`unzip -l` 前 35 行 + 尾部汇总（3,293 条目 = 2,728 文件）；与 `git ls-files` 的 reconciliation 引用 T014 冻结报告 `evidence/release/T014_FREEZE_REPORT_R3.md` §4（组装时未重复做全量 diff，引用该报告的已核对结论）。

## 未核对上的项
- 无。所有写进消息的数字均已按上法亲自核对。唯一未断言的是 GPT 所述 `1f8ef5c0…` 的来源（git 记录中无此 R2 manifest 值），消息中只给出了实测的正确值，未做猜测。

## 待父 agent 的下一步
- 将 `message.txt` 全文经浏览器任务发到同一立项对话（终审第 4 轮；已用 3/5）。发送前确认模型 GPT-6 + 思考 Extra High；Pro 锁定不可用。
