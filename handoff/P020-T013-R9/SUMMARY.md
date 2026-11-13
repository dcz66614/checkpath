# T013 R9 独立复核 — 摘要

- **审查对象**：FIX-P0-09 代码提交 `a8ca5ec`（干净克隆 `~/workspace/p020-review-r9/`，全部亲自重跑）。
- **结论：NOT PASS — P0 1 / P1 0 / P2 9。**

## R8 的 R3：已关闭（验证通过）

R8 的 10 形状 × trigger+jobs = 20 检查全部 MATCH（双边 INVALID / `yaml_parse_error`）。全量电池全过：npm test 1372/1372（42 文件），test:oracle 155 夹具 0 mismatch 0 false PASS，trigger/jobs/checks/witness 116/48/46/44 全部 0 mismatch，s0:gate PASS（24/24，100 次运行 1 哈希；gate hash 与提交版仅 environment_fingerprint 不同，非回归），release:verify PASS，试冻两次三哈希一致（source `b8a4139f…`、dist `57dc0f8d…`、manifest `2dd4fe13…`，与修复方值逐字节一致）。

## 新发现：Grouped P0 — R4/R5（TS 更严的反向分歧）

修复方终报 §7 披露的 R4/R5 属实，且分歧面比披露更宽：**9 形状 × 2 模式 = 18 检查 DIFF**（修复方矩阵 6 处 + 本轮新增 12 处）。

- **R4**：flow 映射中逗号独占一行且缩进 0（`m: {a\n, b: 1}`）——TS INVALID vs Oracle VALID；嵌套、`on:` 槽位、`jobs:` `env:` 均分歧。
- **R5**：显式键的 `:` 在下一行且缩进 0（`m: {? a\n: 1}`、`m: {? "a"\n: 1}`）——TS INVALID vs Oracle VALID；单引号、嵌套、`on: {? "push"\n: {types: [opened]}}` 均分歧。
- 两者均为 TS 侧 `parse()` 本身拒绝（`yaml` 包："Flow map in block collection must be sufficiently indented"），AST 规则到不了门，只能 Oracle 侧加拒收规则；边界精确（缩进 ≥ 1 双边一致）。
- 定级依据：PROJECT_BOOK §7.3（任何字段不一致都判失败）、§8.2（Oracle parity 100%）、IMPLEMENTATION_PLAN §10（P0 含 Oracle mismatch）；R7 RESID（同方向 TS 更严）定 P0 的先例；终审 R2 驳回降级先例。反方考虑（形状退化、规范合规性、修复难度）已权衡，不改变定级。R4 与 R5 同一根因，分组计 1 项。

## P2：9 个（终审 R2 的 6 个 + R6 的 2 个 + R9 新增 1 个）

新增 **P2-R9-1**：修复方终报称 flow-quoted-key `expected.json` 为 “25 INVALID / 13 VALID”，实测 per-side 为 **27 INVALID / 11 VALID**；数据本身正确，仅终报文案计数错。P2-R6-1（manifest `inputs` 只记到 R3）仍成立，T014 重冻时须补记 R4–R9。P2-R6-2 部分缓解：R9 自写探针已入仓库（`evidence/probes/r9/`），R7/R8 探针仍只在报告文本中。

## 证据（全部在仓库内）

- `evidence/review/INDEPENDENT_REVIEW_R9.md`（本轮完整报告）
- `evidence/probes/r9/`（`cases.json` 26 行、`r9-probe.py`、`results.json` 34/52、`README.md`）——形状自 R8 报告原文与修复方 §7 文本重建，未复制修复方 `cases.json`
- 六矩阵重跑后 `results.json` 与提交版逐字节一致

## 下一步

1. 派 FIX-P0-10：Oracle 侧拒收规则（拒绝 flow 映射中缩进 0 的续行），然后派新的独立复核 R10（干净克隆，重跑 R4/R5 9 形状 + 六矩阵 + R5 66 例）。
2. R10 PASS → T014 R3 正式再冻结 → Drive 再归档（新 01_release_R3）→ 终审 R3。
