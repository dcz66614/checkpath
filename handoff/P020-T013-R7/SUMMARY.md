# P020 CheckPath — T013 第七轮独立复核（R7）交接摘要

**Verdict: NOT PASS — P0 1 / P1 0 / P2 8**

- 审查对象：`b6e2f2b`（FIX-P0-07：`ca7a584` 代码 + `b6e2f2b` 交接报告）
- 审查窗口：2026-11-09 ~04:43 GMT → ~05:20 GMT
- 全部验证在干净克隆 `/tmp/r7clone` 中完成（HEAD `b6e2f2b`，parser.py md5 与 `git show HEAD:` 一致）；未在共享工作树运行任何探针或测试；未改代码；报告文件未提交。

## 已关闭（全部验证）

- R6 grouped P0（V1/V2/V5/V9 行内普通标量进行中的引号内 tab）：全部关闭。R7 自写探针独立复现 10/10 MATCH；fix-p0-07 矩阵对应行全部 MATCH；V1e 自伤事故形状亦已修复。
- R5 子集 66/66、fix-p0-04 矩阵 100/100、fix-p0-05 矩阵 76/76、fix-p0-06 矩阵 134/134。
- 全量电池：npm test 1215/1215、test:oracle 131 fixtures 0 mismatch 0 false PASS、trigger/jobs/checks/witness 92/48/46/44 全 0 mismatch、s0:gate PASS、release:verify PASS、build-golden --check-only 131。
- S0 gate hash：克隆值 `b5ce164c…` 与提交版 `f511a847…` 的唯一差异是 `environment_fingerprint`（克隆路径），自哈希重算一致，非回归。
- 试冻两次：source `c1e2d4aa…`（1,781 文件）、dist `c391ad64…`（114 文件，与修复方试冻逐字节一致）、manifest `92219650…`，哈希一致；source.zip 含冻结脚本（SHA `5c3142ec…` 与 R2 记录一致）。

## 新 P0（分组计 1 项）：未缩进的多行引用标量续行（RESID）

`yaml` npm 包拒绝多行引用标量续行缩进 ≤ 块上下文缩进的形状，PyYAML 接受任意缩进；**不带 tab 也分歧**。R7 自写探针 6 形状 × trigger+jobs = 12 检查，2/12 MATCH（仅续行缩进 9 的两模式），其余 10 处 DIFF，**TS 判 INVALID、Oracle 判 VALID**：

| 例 | 输入 |
|---|---|
| RESID-DQ | `run: "a` / `b<TAB>c"`（续行缩进 0） |
| RESID-SQ | `run: 'a` / `b<TAB>c'`（续行缩进 0） |
| RESID-DQ-NOTAB | `run: "a` / `b c"`（续行缩进 0，无 tab） |
| RESID-DQ-IND2 | 续行缩进 2 |
| RESID-DQ-IND8 | 续行缩进 8（= `run` 键缩进） |

最小复现（与探针驱动无关）：PyYAML 对 RESID-DQ / NOTAB 全文解析成功；`yaml` npm 包对两全文均报错 `Missing closing "quote at line 7, column 16`。定级 P0 的依据：PROJECT_BOOK §7.3（L520，任何字段不一致都判失败）、§8.2（Oracle parity 100%）、IMPLEMENTATION_PLAN §8.1（L779）、§10（L827，P0 含 Oracle mismatch）及终审 R2 裁决先例；反方考虑（形状退化、修复难、PyYAML 更宽容）已权衡，均不改变定级。

修复方向：首选 Oracle 侧拒收规则（与 FIX-P0-05 的 `_reject_adjacent_alias_colon()` 同一机制家族；不是 §7.3 禁止的输入手术，但须精确推导阈值规则）；备选换解析器，高风险，勿盲目尝试。

## P2（8 项）

终审 R2 的 6 项 + R6 新增的 2 项（P2-R6-1 manifest `inputs` 只记到 R3，R4–R7 均未记入；P2-R6-2 复核探针证据未入仓库，R7 探针亦只在 `/tmp/r7probe/` 与本报告中）全部仍成立；无新增 P2。

## 下一步

不要就 b6e2f2b 发终审 R3（必 FAIL）。定点修复 §2 的 RESID → R8 复核（须重跑 RESID 6 形状 + 四矩阵 + R5 66 例）→ R8 PASS 后 T014 正式重新冻结（manifest 补记 R4/R5/R6/R7/R8）→ Drive 重归档（新 01_release_R3）→ 终审 R3。

完整报告：`evidence/review/INDEPENDENT_REVIEW_R7.md`（约 23 KB）。
