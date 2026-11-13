# P020 T013 R12 复核摘要

- **审查对象**：`309b2ee`（FIX-P0-12：TS 侧 `hasRejectedAnchorOrTag` + S1 收窄至带 `:` 的 key）
- **复核环境**：干净克隆 `~/workspace/p020-review-r12/`，HEAD `309b2ee`
- **结论：NOT PASS — P0 3 / P1 0 / P2 9**

## R11 的两项 P0 已关闭（已验证）

- P0-A（anchor/tag 无空格）：4 形状重建 8/8 MATCH；17 个边界变体 34/34 MATCH。
- P0-B（S1 过拒 null 值多行 key）：8 形状重建 16/16 MATCH；S1 目标（带值多行 key）9 形状 18/18 MATCH，仍双边拒。
- R11 探针 74/74 MATCH；fix-p0-11 矩阵 248/248 MATCH（8 个先前残留行全部变为 MATCH）。

## 新发现 P0（3 项，24 检查，全部为终报 §7 披露的 12 个残留行）

| P0 | 族 | 检查 | 方向 |
|---|---|---|---|
| P0-C1 | `,`-suffix 族（A60、X04、Y03、Y05、Y08、Y09、Y10、X11） | 16 | 7 行 TS VALID vs Oracle INVALID；X11 反向 |
| P0-C2 | tag 后缀 `[`/`]` 字符集（A70、X08、X09） | 6 | TS INVALID vs Oracle VALID |
| P0-C3 | A45 anchored empty key（文档根部） | 2 | TS INVALID vs Oracle VALID |

定级依据：PROJECT_BOOK §7.3/§8.2、IMPLEMENTATION_PLAN §10（Oracle mismatch = P0）；
R7/R10 裁决先例（TS 更严定 P0；方向不改变定级）；终审 R2 先例（驳回降级）。
计数按根因 + 修复位置（R11 先例）：终报 §7 的 4 个家族合并为 3 项
（A70 与 X08/X09 同一修复；X11 是 `,`-suffix 族的 block 变体）。

## 全量重跑（干净克隆，全部亲自跑）

- `npm test` 1507/1507（45 文件）；`typecheck` PASS；`test:oracle` 167 夹具 0 偏差 0 false PASS；
  trigger/jobs/checks/witness 128/48/46/44 全部 0 mismatch；`s0:gate` PASS（24/24，gate hash
  仅 `environment_fingerprint` 不同，非回归）；`release:verify` PASS。
- 九矩阵：100/100、76/76、134/134、86/86、164/164、98/98、314/314、248/248、462/486；
  R5 子集 66/66；R10 探针 88/88；R11 探针 74/74。
- R12 独立探针（59 形状 × 2）：**94/118 MATCH**，24 处 DIFF 全部为上述三族。
- 试冻两次：source `267ba902…`、dist `16af8080…` 与终报一致；manifest `933f7e8b…`
  与终报值 `5e44f660…` 不一致（两次一致，内容逐项核对无误——终报文案订正，不计入定级）；
  `sha256sum -c` 3/3；`release/` 已恢复 R2 正式件。

## P2（9 个，非阻断）

终审 R2 的 6 个 + R6 的 2 个（P2-R6-1 范围扩大到 R12）+ **本轮新增 P2-R12-1**：
fix-p0-11 `cases.json` 的 8 个 `known_divergence` 标志过期未清（行已全部 MATCH，
与 P2-R10-1 同类）。P2-R10-1/2 仍为已修复状态。

## 下一步

定点修复 P0-C1/C2/C3（P0-C2/C3 只能 Oracle 侧修；P0-C1 需 parser 层规则或
Oracle 侧拒 `,` 后缀）+ 清 P2-R12-1 标志 → 派 R13 独立复核 → R13 PASS 后
T014 正式重冻（manifest `inputs` 补记 R4–R12）→ Drive 新 01_release_R3 归档 →
同一立项对话终审 R3。终审轮次已用 2/5。

证据：`evidence/review/INDEPENDENT_REVIEW_R12.md`、`evidence/probes/r12/`（59 形状探针）。
