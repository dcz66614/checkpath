# T013 R12 独立复核探针

复核对象：代码提交 `309b2ee`（FIX-P0-12：TS 侧 `hasRejectedAnchorOrTag` +
`hasMultilineFlowKey` S1 收窄至带 `:` 的 key）。

## 内容

- `cases.json` — 59 形状，由 `gen-cases.py` 生成。形状全部由 R12 复核员
  按 R11 复核报告 §2.1/§3.1 原文与 FIX-P0-12 终报 §7 原文独立重建，
  未复制修复方 `cases.json`。
- `gen-cases.py` — 生成 `cases.json` 的脚本（形状定义即审查依据）。
- `r12-probe.py` — 驱动：esbuild 打包 TS 探针入口
  （`evidence/probes/fix-p0-12/ts-probe-entry.ts`），逐形状在 trigger +
  jobs 双模式下跑 TS 与 Oracle 探针驱动，全 JSON 深比较，写
  `results.json`，有 DIFF 时 exit 1。
- `results.json` — 本轮实测：**118 检查，94 MATCH，24 DIFF**。
  24 处 DIFF 全部为 FIX-P0-12 终报 §7 披露的 12 个残留行
  （A45、A70、`,`-suffix 族 8 行、`]`-suffix 族 2 行）。

## 分组（59 形状 × 2 模式 = 118 检查）

| 组 | 形状 | 结果 |
|---|---|---|
| P0-A 重建（R11 §2.1，4 形状） | r12-a1–a4 | 8/8 MATCH（P0-A 已关闭） |
| P0-A 边界（17 形状） | r12-a5–a21 | 34/34 MATCH（空格对照、引用/纯量内 `#`、隐式 key 位置锚点冒号、未知 tag、锚点后逗号/结尾、值位置锚点冒号、双属性链、未知 tag 无空格 `#`） |
| P0-B 重建（R11 §3.1，8 形状） | r12-b1–b8 | 16/16 MATCH（P0-B 已关闭） |
| S1 目标与判别式边界（9 形状） | r12-b9–b17 | 18/18 MATCH（带值多行 key 仍拒；冒号判别式边界全一致） |
| 残留行（FIX-P0-12 §7，12 形状） | r12-r1–r12 | 0/24 MATCH（24 处 DIFF，定级见复核报告 §2–§5） |
| `,`-suffix 对照（4 形状） | r12-c1–c4 | 8/8 MATCH |
| R6 回归（R10 §2.1，5 形状） | r12-r6-1–5 | 10/10 MATCH |

用法（干净克隆内，`npm ci` 后）：

```
python3 evidence/probes/r12/r12-probe.py
```
