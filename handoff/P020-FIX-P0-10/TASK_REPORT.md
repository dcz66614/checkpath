# FIX-P0-10 任务终报 — R9 R4/R5（flow 续行缩进分歧）已关闭

**结论：R9 分组 P0（R4/R5）已关闭。** R9 的 18 个 DIFF 全部变为 MATCH（R9 探针 52/52）；新测绘矩阵 157 行 / 314 检查全部 MATCH；全部验收在代码提交 HEAD `8ef847b` 上亲自重跑通过；`src/` 0 改动；S0 门哈希未变；trial freeze 两次三哈希一致；`release/` 已恢复为 R2 正式件。可派遣 R10。

## 1. 根因

R9 证明 R4/R5 的分歧面比 FIX-P0-09 披露的宽：13 个形状、26 项检查、**18 DIFF**（修复方披露的 6 个 + 拓宽发现的 12 个）。

- **R4**：flow 映射中逗号独占一行、缩进 0，例如 `m: {a\n, b: 1}` —— TS 侧 INVALID（`yaml_parse_error`），Oracle 侧 VALID。嵌套、`on: {a\n, b: push}`、`jobs:` `env:` 全部发散。
- **R5**：显式键的 `:` 落在下一行、缩进 0，例如 `m: {? a\n: 1}`、`m: {? "a"\n: 1}` —— TS 侧 INVALID，Oracle 侧 VALID。单引号、嵌套、`on: {? "push"\n: {types: [opened]}}`（触及核心 `on:` 槽位）全部发散。
- 边界精确：**缩进 ≥ 1 时两侧一致**。R4-ON 是两侧同 INVALID 但错误码不同（与 R3-ON 同类）；其余 8 个发散形状是一侧 VALID / 一侧 INVALID 的完全分歧。

根因在解析器本身：`yaml` npm 包的 flow 解析器拒绝“flow 集合位于 block 集合内、且续行缩进不足”的输入（"Flow map in block collection must be sufficiently indented"），`parse()` 直接拒绝，TS 侧的 AST 规则够不到门。**只有 Oracle 侧能修。** 这与 R8 R3 相反（R3 是 PyYAML 在解析时拒绝、只有 TS 侧能修），两轮合起来证明：flow 续行类分歧的修复方取决于哪一侧的解析器先拒绝。

## 2. 阈值推导过程（先测绘，后写规则）

修复前先做平行测绘：TS（esbuild 打包 `evidence/probes/fix-p0-09/ts-probe-entry.ts`）对 Oracle（`scripts/oracle-parse-probe.py` / `scripts/oracle-jobs-probe.py`），全 JSON 深比较，trigger + jobs 双模式。

- **第 1 轮 132 例**：R4 逗号续行、R5 冒号续行，缩进 0–6、嵌套、`on:`、`jobs:`/`env:`、深层 `with:`、block 序列项，另加相邻形状（键/值/首项落下一行、plain 标量续行、flow 序列、空行/注释行、仅闭合行、引号值续行、tab、文档根 flow 映射、显式 block 键）。修复前 **60 例 DIFF**（120/264 检查）。
- **第 2 轮 25 例**：边界形状——内层 flow 闭合后同行外层内容、嵌套 flow 在续行上开启、`on:`/`branches:` 中的 flow 序列、引号标量值从续行开始、锚点、文档根 block 序列、显式 block 键中的 flow 映射。修复前 **14 例 DIFF**（28/50 检查）。
- 合计修复前：**74 例 DIFF / 148 检查**，全部是 TS 拒绝 / Oracle 接受，除两行两侧同 INVALID 但错误码不同（R4-ON 与文档根 block 序列逗号）。

导出的阈值与 FIX-P0-08 同族，但适用面从“引号标量”扩展到**一切 flow 续行 token**：

| 维度 | 阈值（续行前导空格必须严格大于） |
|---|---|
| 映射值 | 该映射的缩进，即键的缩进（顶层 `m: {…}` → 1+；`jobs: test: env:` 键缩进 4 → 5+；深层 `with: m:` 键缩进 10 → 11+） |
| 序列项 | 该序列的缩进，即 `-` 的缩进（`- {…}` 破折号 6 → 7+） |
| flow 起始行 | **不是**阈值（`m:\n  {a: 1,\n  b: 2}` 接受：续行 2 超过 block 缩进 0，尽管等于 flow 起始行缩进） |
| 每个续行 token | 逗号（R4）、显式键 `:`（R5）、键、值、首项、plain 标量续行、嵌套 flow 开启、锚点/标签——flow 映射与 flow 序列同样，额外键、`on:`、`jobs:`/`env:`、`branches:` 同样 |
| 闭合行 | 仅含 flow 闭合 token（`}` / `]` 独占一行）时任意缩进豁免——但同行有其他 token 时仍检查（`}, b: 2` 缩进 0 拒绝） |
| 空行 / 注释行 | 跳过（无 token；PyYAML 丢弃注释） |
| 标量跨行 | plain 或引号标量跨行时，每一行都检查（引号标量与 `_reject_underindented_multiline_quoted_scalar` 完全重合） |
| 文档根 | 文档根的 flow 集合无外围 block 集合，永不拒绝（`yaml` 包对顶层 flow 集合忽略缩进） |

PyYAML token 列直接扫描确认：block 栈取值恰好是键/`-` 的缩进（根 0、`jobs` 2、`test` 4、步骤序列 6、步骤映射 8、`with` 映射 10）。

## 3. 改动（Oracle 侧，`src/` 0 改动）

**代码：`oracle/checkpath_oracle/parser.py`，+147 行，0 删除。**

- 新规则 `_reject_underindented_flow_continuation(yaml_text)`（第 687 行）及辅助 `_flow_line_indent(lines, line_no)`（第 672 行），与 `_reject_adjacent_alias_colon`（FIX-P0-05）与 `_reject_underindented_multiline_quoted_scalar`（FIX-P0-08）同族。
- 实现：PyYAML token 流扫描。`block_stack` 取 `BlockMappingStartToken` / `BlockSequenceStartToken` 的 `start_mark.column`（`BlockEndToken` 出栈）；`flow_stack` 取 `FlowMappingStartToken` / `FlowSequenceStartToken` 的 `start_mark.line`（flow 闭合 token 出栈）。flow 闭合 token 豁免；嵌套 flow 开启 token 先作为外层 flow 的续行 token 检查、再入栈；其余位于 flow 集合内的 token 按起始行检查；`ScalarToken` 额外按其跨越的每一行检查。
- 实现中抓到的 bug：第一版 `check_line` 缺少续行守卫，会把 flow 自身起始行上的 token 也拒绝。已修：`check_line` 在 `line_no <= flow_stack[-1]` 时直接返回。
- 接线：`parse_workflow_yaml`（第 836 行）与 `extract_jobs`（第 1146 行）在 `yaml.load` 之前调用，顺序为 `_reject_adjacent_alias_colon` → `_reject_underindented_multiline_quoted_scalar` → `_reject_underindented_flow_continuation`。抛 `yaml.YAMLError`，走既有 `yaml_parse_error` 路径。
- 无解析器替换、无输入手术、无忽略列表。

**锁定件（生成器逐例实测 TS 与 Oracle、任一形状仍分歧即 `GENERATOR MISMATCH` 中止）：**

- `tests/fixtures/parser-divergence/flow-continuation/`：48 个 `.yml`（f01–f21 R4、f22–f38 R5、f39–f48 相邻）+ `expected.json`（`checkpath.parser-divergence/v1`）+ `README.md`。
- `tests/unit/diff-boundaries/flow-continuation.test.ts`：48 例，TS trigger+jobs 对 Oracle 探针，全状态/错误/事件/任务逐字段相等。
- `tests/fixtures/trigger/T6-92..T6-103/`：12 例（`fix-p0-10` 来源）；`suite.json` 116 → 128（仅追加，0 删除，顺序不变）。
- `scripts/build-golden.py`：新增 FIX-P0-10 段（G-156…）；golden 155 → 167（G-156..G-167，仅追加，0 删除）。
- `tests/unit/event/trigger-oracle-dump.test.ts`：冻结计数 pin 116 → 128（与 FIX-P0-09 同一做法），另加 `"fix-p0-10": 12` 来源分解。

**探针证据：`evidence/probes/fix-p0-10/`**——`cases.json`（157 行）、`ts-probe-entry.ts`、`run-matrix.py`（无 `known_divergence` 行，任一检查不匹配即非零退出）、`results.json`、`README.md`（阈值表、测绘维度、豁免、重跑方法）。

## 4. 验收（全部亲自重跑，HEAD `8ef847b`）

| 检查 | 结果 |
|---|---|
| `npm test` | **1469/1469（43 文件）**，0 失败（原 1372；+97 = 新锁定测试 49 + trigger dump 12 + golden 12 + formal-pipeline 24） |
| `npm run test:oracle` | **167 fixtures，0 mismatch，0 false PASS**，34/34 UNKNOWN |
| oracle diff trigger / jobs / checks / witness | **128 / 48 / 46 / 44，全部 0 mismatch** |
| `npm run s0:gate` | **PASS**：oracle 24/24，0 mismatch，0 false PASS；100 次运行 1 个哈希 `b39c0de1…`；`gate_report_sha256=f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386` **未变** |
| `npm run release:verify` | **PASS**（`ok: True`，5 步全 True；LICENSE 仍为 `PENDING_SAM_DECISION`） |
| `npm run typecheck` | PASS |
| R9 探针重跑 | **52/52 MATCH，0 DIFF**（修复前 34/52） |
| 新矩阵 fix-p0-10 | **314/314 MATCH**（157 行 × trigger+jobs；修复前 148 检查 DIFF） |
| 旧矩阵 fix-p0-04 / 05 / 06 / 07 / 08 / 09 | **100/100、76/76、134/134、86/86、164/164、98/98**（fix-p0-09 原 92/98，6 个 R4/R5 行现已 MATCH） |
| R5 66 例子集 | **66/66**（内含于 fix-p0-04 矩阵：33 个 R5 形状 × 2 模式；全矩阵 100/100，故子集 66/66） |
| `build-golden.py --check-only` | 167 例，稳定 |

**Trial freeze（代码提交后，冻结器 HEAD 门要求先提交）：两次，三哈希完全一致。**

| | 第 1 次 | 第 2 次 |
|---|---|---|
| source.zip（2176 文件） | `53ac6dae6e94dfc2235117163c6bde2c5ce5edde833499dc819907ced53ecb45` | 相同 |
| dist.zip（114 文件） | `57dc0f8d2cbbad9fdb6b9fd45b5cc30bf19ddd587ac16147ad980a7c8b46e7b9` | 相同 |
| RELEASE_MANIFEST.json | `b0b9da2afd6844aeebb15e47ceb6c07faf5daf645ff11d8d2fa394a2cbb8d7b2` | 相同 |

**订正任务书中的一处预期：** 任务书说“`dist.zip` WILL change（Oracle 代码改了）”——实测 `dist.zip` **未变**，与 `a8ca5ec` 时的 trial freeze 哈希 `57dc0f8d…` 完全相同。原因是 dist 是纯 TS 发行物（29 个构建产物 + 76 个 vendored `yaml` + 6 示例 + 2 文档 + QUICKSTART.md），不含 Oracle（Python）；Oracle 只进 source.zip。source.zip 从 `a8ca5ec` 时的 2,029 文件变为 2,176 文件（R9 证据 + 本轮新增件）。trial freeze 后已 `git checkout release/`，`release/` 恢复为 R2 正式件（source.zip `3a778b93…`、dist.zip `da130ad2…`，已核对）。

## 5. R9 报告对照

- R9 分组 P0（R4/R5，18 DIFF）：**全部关闭**。R9 探针 34/52 → 52/52；新矩阵覆盖 R9 全部 9 个发散形状及拓宽面（嵌套、`on:`、`jobs:`/`env:`、单引号、深层 `with:`、序列项），314/314。
- **P2-R9-1 订正（已核实原始文件）：** FIX-P0-09 报告中 `expected.json` 的计数文字“25 INVALID / 13 VALID”是错的；**两侧实测均为 27 INVALID / 11 VALID**（f01–f10 10/0、f11–f19 9/0、f20–f28 1/8、f29–f38 7/3）。fixture 数据本身正确，**未动**；仅报告文字错。见 `evidence/probes/fix-p0-10/README.md` 亦有记录。
- R9 的其余 9 个 P2：未动（仍待 T014 重冻结时处理，其中 P2-R6-1 要求重冻结记录 R4–R9 评审）。

## 6. 未动事项

- `src/` 0 改动；无测试删除；无 `skip`/`only`。
- `release/` 仅经 trial-freeze 流程触碰，已恢复为 R2 正式件，未作其他修改。
- LICENSE 仍 `PENDING_SAM_DECISION`（待 Sam 定）。
- 预先存在、非本轮的 `reports/`（2026-11-08，demo/ 与 merge-queue/）未动、未提交。
- 旧矩阵 `results.json` 中的 `known_divergence` 旗标按 FIX-P0-09 先例**未改**——它们是行的来源元数据，不是当前失败；各矩阵现为 100% MATCH（含 fix-p0-09 的 6 个 R4/R5 行）。

## 7. 残留分歧清单

**本轮测绘（157 例）中未发现 R4/R5 之外的新分歧。** 需如实说明的三点：

1. 两行“两侧同 INVALID 但错误码不同”（R4-ON、文档根 block 序列逗号）现已 MATCH——Oracle 侧新规则抛 `yaml_parse_error`，与 TS 侧同码；这是规则的副产品，不是另修。
2. 旧矩阵的 `known_divergence` 旗标仍留在 `results.json` 里（见 §6）：旗标行现已 MATCH，旗标本身是历史标记；R10 评审时若见旗标，应以检查结果（MATCH）为准。
3. 本轮规则的适用面是“flow 集合位于 block 集合内”的续行；文档根 flow 集合与仅闭合行已豁免（均已探针确认与 TS 一致）。未测绘的形状不存在——157 例覆盖了测绘中遇到的全部维度；若 R10 用新形状探出分歧，按流程如实披露、不悄悄扩修。

## 8. 文件与提交

- 代码提交：`8ef847b` — "FIX-P0-10: Oracle rejects indent-0 flow continuations (R9 R4/R5)"（149 文件，+8819/−328；`oracle/` 仅 `parser.py`，`src/` 0 改动）。
- 本报告：`handoff/P020-FIX-P0-10/TASK_REPORT.md`，单独提交（提交哈希见交接记录）。
- 证据路径：`evidence/probes/fix-p0-10/`（cases / runner / results / README）、`evidence/probes/r9/results.json`（52/52）、`evidence/probes/fix-p0-09/results.json`（98/98）、`evidence/tests/ORACLE_PARITY_REPORT.json`（167）、`evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`（128）。
- R10 可派遣：新会话、clean clone、重跑 R4/R5 9 形状 + 六矩阵 + R5 66 例子集 + 新 157 行矩阵。
