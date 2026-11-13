# T013 R16 复核摘要 — FIX-P0-16（代码提交 6821ed0）

- **结论：NOT PASS — P0 2 / P1 0 / P2 9。**
- **审查对象**：`6821ed0`（FIX-P0-16，相对 `ba71eed`，70 文件，+5348/−576；`oracle/checkpath_oracle/parser.py` +525/−22，`src/` 0 改动）。
- **复核环境**：干净克隆 `/tmp/p020-r16-1794247588`（`git checkout 6821ed0`），全部数字亲自重跑，未采信修复方报告数字。

## R15 的 3 个 P0 家族 — 全部关闭

- R15 探针重跑 **122/122 MATCH**（原 98/122；24 处 FLAG STALE 属预期）。
- 本轮自写探针 A 组 13 行重建（新锚名/值/事件）**26/26 MATCH**；R14 探针 78/78、R13 98/98、R12 118/118、R11 74/74、R10 88/88 全部 MATCH。
- 报告 §2 的判别式/边界控制全部重跑：C3 控制 40/40、mirror 边界 46/52（仅 §2 三形 DIFF）、loader 边界 48/48、网格残差 50/50、(c) 交互 20/20、R13 §4.2 豁免边 18/18、R14 抽查 12/12、新狩猎形状 60/60。

## 新发现 P0 — 2 项（16 形，31 检查），均在 ba71eed 上既有

- **P0-A（7 形，13 检查）**：mirror 的别名键豁免过度。`&q:!!str *w: 2`（别名作键）时 mirror 不触发，PyYAML 把 `:!!str *w` 读成普通标量键而接受，npm 则拒收（alias 不得带属性）。TS INVALID/yaml_parse_error vs Oracle UNKNOWN（schedule）/ VALID（push）/ INVALID-missing_on_key（lone）。带空格同形双边同拒，证明收窄豁免为纯量键即可修复。
- **P0-B（9 形，18 检查）**：anchor 名含 `:`（`&q:2` / `&q:foo`）后接映射时，npm 把整个 `q:2` 吸进 anchor 名并接受，PyYAML 锚名字符集不含 `:` 而 ScannerError。根位置 TS VALID/UNKNOWN vs Oracle INVALID；值/流位置方向相反。修复方"lone 形 MATCH"的声称只对 lone 形成立，不能外推。
- 定级依据：PROJECT_BOOK §7.3 / §8.2、IMPLEMENTATION_PLAN §8.1 / §10、R3-ON 与 R10 先例；按根因计 2 项。反方考虑（既有分歧、规模小、产品域外、修复难度）均已权衡，不改变定级。

## 其余复核结果

- 十二矩阵：100/76/134/86/164/98/314/248/486/196/114/260，全部 MATCH；fix-p0-16 网格 **238/238**（119 形）；R5 66-case 子集 66/66。
- 全量验收：typecheck PASS；`npm test` **1623/1623**（51 文件）；`test:oracle` 167/167；trigger/jobs/checks/witness **128/48/46/44** 全部 0 mismatch；`s0:gate` **PASS**（24/24，100 次运行 1 哈希；gate 哈希差异仅 `environment_fingerprint`，已逐字段核对）；`release:verify` **PASS**（license 仍 PENDING_SAM_DECISION）。
- Trial freeze ×2：manifest **`17f06f8628b4e6006e19e9354c2b07935cc0723878e147ea134339ccad422a18`**，与修复方报告逐字节一致；source `3ede7ad7…`（2,473 文件），dist `f2bcd53f…`（114 文件，未变）。
- 违规捷径检查：无（`src/` 空、删文件 0、skip/only 0、无忽略名单）。
- P2：9 项（R2 的 6 项 + P2-R6-1（范围扩至 R16）+ P2-R6-2 + **新增 P2-R16-1**：fix-p0-15 的 6 个过期 `known_divergence` 标志未清，矩阵 260/260 已 MATCH）。P2-R15-1 已清除（fix-p0-14 0 flagged，114/114）。
- 修复方报告订正：§2.2 的 `&b:2` 声称仅 lone 形成立；mirror 豁免声称中"别名键"一半错；§7"未发现新分歧"不成立。

## 证据（克隆内，待主控归档）

- 评审报告：`/tmp/p020-r16-1794247588/evidence/review/INDEPENDENT_REVIEW_R16.md`
- 探针：`/tmp/p020-r16-1794247588/evidence/probes/r16/`（`cases.json` 181 形、`gen-cases.py`、`r16-probe.py`、`parser-probe-r16.py`、`.mjs`、`results.json` 331/362、`grid-rerun-results.json` 238/238、`reruns/`、README）
- ba71eed 基线 worktree：`/tmp/p020-r16-ba71eed`（驱动脚本 `/tmp/r16-baseline-check.py`）

## 下一步

1. **FIX-P0-17**：P0-A 收窄 mirror 豁免至纯量键；P0-B 镜像 anchor 字符集（`:` 后接非空白、非 `!` 时吸入 anchor 名），守住 C3 域与 `&x:` null 豁免；清除 P2-R16-1 的 6 个过期标志。
2. 派 **T013 R17**（新会话、干净克隆）：重跑本报告 §2 的 16 形 + §4 边界 + 十二矩阵 + R5 66 + 本轮 181 行矩阵 + manifest 哈希复核。
3. R17 PASS → T014 R3 正式重冻（manifest `inputs` 记入 R4–R16）→ Drive 新 01_release_R3 → 终审 R3（同一立项对话，GPT-6 + Extra High）。
