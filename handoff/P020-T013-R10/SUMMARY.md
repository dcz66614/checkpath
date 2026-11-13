# T013 R10 复核摘要 — FIX-P0-10（R9 R4/R5）

- **审查对象**：代码提交 `8ef847b`（FIX-P0-10：Oracle 拒收缩进 0 的 flow 续行），干净克隆 `~/workspace/p020-review-r10/` 内亲自重跑。
- **结论：NOT PASS — P0 1 / P1 0 / P2 10。**

## R9 的 R4/R5：已关闭

R9 的 9 形状独立重建重跑 **18/18 MATCH**；fix-p0-10 新矩阵 **314/314**；六旧矩阵 **100/100、76/76、134/134、86/86、164/164、98/98**（R5 子集 66/66）；R9 探针 **52/52**。全量电池全过：`npm test` 1469/1469（43 文件）、`test:oracle` 167 夹具 0 mismatch 0 false PASS、trigger/jobs/checks/witness 128/48/46/44 全部 0 mismatch、`s0:gate` PASS（hash 仅 environment_fingerprint 不同，非回归）、`release:verify` PASS。试冻三次三哈希一致（source `53ac6dae…`、dist `57dc0f8d…`、manifest `b0b9da2a…`），`sha256sum -c` 3/3 OK。

## 新发现：Grouped P0 — R6（独立注释行）

修复方称“注释行跳过”，但其矩阵只测过 2 例**行内**注释。本轮发现：**flow 映射内、完整 `key: value` 对之后、缩进 0 的独立注释行**，TS 拒绝（"Comments must be separated from other tokens by white space characters"）而 Oracle 接受——**5 形状 × trigger+jobs = 10 检查 DIFF**，触及核心 `on:` 槽位（`on: {push: {types: [opened]}` + 注释行 + `, pull_request}`）。边界精确：注释缩进 ≥ 1、逗号后、裸键后、flow 序列内、行内注释均双边一致。只能 Oracle 侧修；约束：PyYAML token 流看不见注释，需新增原文行扫描（见终报 §2.6）。

## P2：10 个

终审 R2 的 6 个 + R6 的 2 个仍成立；P2-R9-1 已解决（`expected.json` 27/11 已订正并独立核实）；新增 **P2-R10-1**（旧矩阵 `known_divergence` 旗标行已 MATCH 但旗标未清除）、**P2-R10-2**（提交版 T006 报告的 `suite_sha256` 过期，数字本身正确）。

## 下一步

**FIX-P0-11**：Oracle 侧原文行扫描拒收规则（见终报 §2.5/§2.6 边界表）；然后派新的独立复核 R11（干净克隆，重跑 R6 5 形状 + 七矩阵 + R5 66 例 + 本轮 44 行矩阵）。R11 PASS → T014 R3 正式再冻结（manifest `inputs` 须补记 R4–R10，P2-R6-1）→ Drive 再归档（新 01_release_R3）→ 终审 R3。

完整报告：`evidence/review/INDEPENDENT_REVIEW_R10.md`；自写探针：`evidence/probes/r10/`（`cases.json` 44 行、`r10-probe.py`、`results.json` 78/88、README）。
