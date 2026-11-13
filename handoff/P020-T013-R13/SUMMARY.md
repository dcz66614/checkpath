# T013 R13 复核摘要 — FIX-P0-13（R12 P0-C1/C2/C3）

- **审查对象**：代码提交 `01509e0`（FIX-P0-13），干净克隆
  `~/workspace/p020-review-r13`，全部亲自重跑。
- **结论：NOT PASS — P0 1 / P1 0 / P2 9。**

## 已关闭（验证通过）

- **P0-C1 `,`-suffix**：8 形状（A60、X04、Y03、Y05、Y08、Y09、Y10 +
  X11 block 变体）16/16 MATCH；both-accept 形状、4 对照、5 个 flow-KIND
  判别式形状全部 MATCH。
- **P0-C2 `[`/`]`-suffix**：3 形状（A70、X08、X09）6/6 MATCH；%5B 转义、
  verbatim、key 位置等 5 对照全部 MATCH。
- **P0-C3 anchored empty key**：A45 2/2 MATCH；flow / 单对 / 首对 null 值等
  8 个豁免边 16/16 MATCH。
- 全量门禁：npm test **1554/1554**（48 文件）；test:oracle 167 夹具
  0 mismatch 0 false PASS；trigger/jobs/checks/witness 128/48/46/44 全 0
  mismatch；s0:gate PASS（哈希仅 environment_fingerprint 差异，非回归）；
  release:verify PASS；typecheck clean。
- 十矩阵全 100%：100/76/134/86/164/98/314/248/486/194（fix-p0-13 的 2 DIFF
  即 lone-doc 行）；R5 子集 66/66；R10 88/88；R11 74/74；R12 探针 118/118。
- **P2-R12-1 已修复**：fix-p0-11 的 8 个过期标志全部清零。

## 新 P0（1 项，2 检查）

**lone 文档 anchored empty key**（`&x: 1` / `&x:` 单独成文档，trigger 模式；
jobs 模式 MATCH）：TS INVALID / `workflow_root_not_mapping` vs Oracle
INVALID / `missing_on_key`。根因：PyYAML 把 `&x: 1` 渲染为 1 对映射
`{'' : '1'}`，npm 解析为纯量 `1`——解析器层结构分歧。对照证明分歧只在
anchored 形态（lone 纯量/字符串/序列/tagged scalar 及引号空 key `"": 1`
全部 MATCH）。拒收规则关不上（得 `yaml_parse_error`，仍不同），但分类
对齐原则上可行（Oracle 根检查对"全由 anchored empty key 构成的退化映射"
返回 `workflow_root_not_mapping`；判据须用 token 模式，不可只看空 key，
否则破坏 `"": 1` 的 MATCH）。定级依据 §7.3/§8.2/§10 + R3-ON 先例
（双边 INVALID、错误码不同不自动通过）+ R2 先例（降级驳回）；退化输入、
产品域之外、修复难度、诚实披露均已权衡，不改变定级。

## 新 P2（1 项）

- **P2-R13-1**：fix-p0-12 `cases.json` 的 12 个 `known_divergence` 标志过期
  未清（行已全部 MATCH，486/486）。证据卫生问题，非阻断。

## 终报文案订正（不计入定级）

- 终报 §4 试冻 manifest 哈希 `677e5e82…` 无法复现；本轮两次试冻均为
  **`9e68492a…`**（source `95908685…`、dist `f2bcd53f…` 与终报一致）。
  另在 `309b2ee` 上两次试冻得 `933f7e8b…`，与 R12 完全一致——R12
  "其值为可信值"的结论成立，FIX-P0-12 的 `5e44f660…` 确为错误值。
  修复方 manifest 哈希已连续两轮无法复现；以后各轮以自己实测的两次
  一致值为准。

## 下一步

FIX-P0-14 定点修复 lone-doc P0（分类对齐，见复核报告 §12）+ 清 P2-R13-1
→ R14 独立复核 → R14 PASS 后 T014 R3 正式重冻 → Drive 01_release_R3 →
终审 R3（终审已用 2/5 轮）。

完整报告：`evidence/review/INDEPENDENT_REVIEW_R13.md`。
探针证据：`evidence/probes/r13/`（49 行，96/98 MATCH）。
