# P020 T013 R11 复核摘要

- **审查对象**：`479810e`（FIX-P0-11：Oracle 拒 flow 映射内缩进 0 的独立注释行）
- **复核环境**：干净克隆 `~/workspace/p020-review-r11/`，HEAD `479810e`，全部命令亲自跑
- **结论：NOT PASS — P0 2 / P1 0 / P2 8**

## 已关闭

- **R10 的 R6 P0 已关闭**：5 形状重建重跑 10/10 MATCH；R10 探针 88/88；fix-p0-11 矩阵 232/248（其余 16 检查均为已标注残留）；R6 边界 20/20 MATCH；FlowEndToken 豁免收窄 12/12 MATCH（无过度拒、无漏拒）。
- **全量电池全绿**：npm test 1469/1469；test:oracle 167 夹具 0 mismatch 0 false PASS；trigger/jobs/checks/witness 128/48/46/44 全部 0 mismatch；typecheck、s0:oracle、build-golden、s0:gate（PASS，24/24）、release:verify 全部通过；七旧矩阵 100/100、76/76、134/134、86/86、164/164、98/98、314/314；R5 子集 66/66。
- **P2-R10-1 / P2-R10-2 已解决**：14 个过期 `known_divergence` 标志逐项核实均为 `false` 且行 MATCH；T006 报告 `suite_sha256` 与 suite.json 实测哈希一致（`36c3853d…`，128/128）。
- **试冻两次三哈希一致**：source `08b8c360…`（2188 文件）、dist `57dc0f8d…`（114 文件，未变）、manifest `19b26ec1…`，与修复方值逐字节一致；`sha256sum -c` 3/3 OK；`release/` 已恢复 R2 正式件。

## 新发现 P0（2 项，均为修复方 §7 披露残留的独立定级）

- **P0-A — 锚点/标签后无空格注释（`&x#c` / `!!str#c`）**：TS 接受、PyYAML 拒绝（解析器层证实；方向与 R4–R7 相反，Oracle 更严）。本轮 4 形状 × 2 模式 = **8/8 DIFF**，含 `on:` 槽位变体（双边 INVALID 但错误码不同，R3-ON 先例仍属 P0）与 flow 序列内变体。只能 TS 侧修（FIX-P0-06 风格）。
- **P0-B — FIX-P0-09 S1 过度拒（null 值多行 key）**：`m: {a\n b}` 等 6 个披露形状 + 2 个边界变体，**16/16 DIFF**：两个底层解析器都接受，只有 TS 侧 `hasMultilineFlowKey` S1 拒绝。S1 文档记载的实证基础只有带 `:` 与值的 key（`{a\n b: 1}`，双边拒、无分歧），规则触发面宽于实证基础。修复须收窄 S1 至带 `:` 的 key（`src/` 改动）；修复方不用 Oracle 掩盖的决定正确。

定级依据：PROJECT_BOOK §7.3（任何字段不一致都判失败）、§8.2（Oracle parity 100%）、IMPLEMENTATION_PLAN §8.1/§10（Oracle mismatch 属 P0）；R7 RESID 先例（TS 更严定 P0）、R3-ON 先例（错误码不同定 P0）、R10 先例（方向不改变定级）。退化输入、规范合规性、披露诚实、修复位置均不改变定级（详见报告 §4）。

## P2（8 项，非阻断）

终审 R2 的 6 项 + P2-R6-1（manifest `inputs` 只到 R3，现扩大到 R11）+ P2-R6-2（R7/R8 探针仍只在报告中；R9/R10/R11 已入仓）。P2-R10-1、P2-R10-2 已解决，不再列入。

## 下一步

1. 定点修复 P0-A（新增 TS 侧锚点/标签规则）与 P0-B（收窄 S1 至带 `:` 的 key，保留对带值多行 key 的拒绝），然后派独立复核 **R12**（干净克隆；重跑本报告 §2/§3 形状 + 八矩阵 + R5 66 例 + 本轮 37 行矩阵）。
2. R12 PASS 后：T014 正式重冻（manifest `inputs` 记入 R4–R11）→ Drive 新 01_release_R3 归档 → 终审 R3（同一立项对话）。
3. 终审轮次已用 2/5。

详见 `evidence/review/INDEPENDENT_REVIEW_R11.md`；探针证据 `evidence/probes/r11/`（37 形状，74 检查，50/74 MATCH）。
