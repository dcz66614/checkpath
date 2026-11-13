# P020 CheckPath — FIX-P0-04 任务报告（终审 R2 P0 残留分歧定点修复，T013 R5 grouped P0）

- 任务：T013 R5 grouped P0 的 3 例残留分歧（R5 报告 `evidence/review/INDEPENDENT_REVIEW_R5.md` §2：X-empty-1 裸空事件键、X-filter-empty 裸空 filter 键、J20 标量 job 定义的 `unsupported_job` 字段）
- 执行员：FIX-P0-04 修复执行员（全新会话，与之前所有施工/修复/复核会话隔离）
- 日期：2026-11-09（GMT ~00:40–01:20）
- 基线：HEAD `2388be1`（FIX-P0-03 报告 commit；tree 除预先存在未跟踪的 `reports/` 与 R4/R5 复核报告外干净）
- 环境：Node v24.22.1、Python 3.12.3、PyYAML 6.0.1（与冻结环境一致）
- 范围：只做修复。未做复核、未做冻结、未动 Drive、未发终审、未改 specs、未改许可证（仍 `PENDING_SAM_DECISION`）。

## 结论

**R5 的 grouped P0 已关闭。** R5 的 66 例探针矩阵修后 66/66 全 JSON 深相等（修前 63/66，恰好是 R5 报出的 3 例 DIFF）；边界探针 11 位置 × trigger/jobs 双模式修前 0/22、修后 22/22；另加 5 个无回归形状 10/10。全部验收命令 exit 0：

| 命令 | 结果 |
|---|---|
| `npm test` | 36 文件，1052/1052（基线 982/982，+70），exit 0 |
| `npm run test:oracle` | 115 fixtures（基线 105，+10），0 mismatch，0 false PASS，unsupported 34/34，exit 0 |
| `npm run oracle:diff:trigger` | 76 fixtures（基线 66，+10），0 mismatch，exit 0 |
| `npm run oracle:diff:jobs` | 48 fixtures，0 mismatch，exit 0 |
| `npm run oracle:diff:checks` | 46 fixtures，0 mismatch，exit 0 |
| `npm run oracle:diff:witness` | 44 fixtures，0 mismatch，exit 0 |
| `npm run s0:oracle` | 24/24，0 mismatch，0 false PASS，exit 0 |
| `npm run s0:gate` | PASS，oracle 24/24，100 runs 1 hash，`gate_report_sha256` 仍为 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`，exit 0 |
| `npm run release:verify` | PASS，license guard 仍 `PENDING_SAM_DECISION`，exit 0（见 §5 末：dist tree hash 变了，属预期内变化） |
| `python3 scripts/build-golden.py --check-only` | golden cases 115，exit 0 |
| `npm run typecheck` | exit 0 |
| 探针矩阵（仓库内可重跑） | 98/100 checks MATCH；仅 2 checks 为已标注的已知分歧 D2（见 §7-1） |

## §1 ADR FIX-P0-04（全文）

### 背景

R5 在 `2388be1` 上用比 R4 更严的标准（全 JSON 深相等）重跑 66 例探针，63 MATCH / 3 DIFF；3 例均为 FIX-P0-03 报告 §7 已披露的残留。根因分两支：

- **裸空键（X-empty-1 / X-filter-empty）：** TS 的 `yaml` 解析器接受行内只有一个 `:` 的空键（null 键 → 渲染 `""`）；PyYAML 解析器在 Oracle 代码运行前就拒绝整个文档（`expected <block end>, but found ':'`），Oracle 只能返回 INVALID / `yaml_parse_error`。这是解析器层分歧，与 FIX-P0-03 的标量渲染层不同——换 Oracle 解析器或对输入文本做手术都在禁区内（前者动规格组件，后者违反 PROJECT_BOOK §7.3“分别读取原始 workflow YAML”）。
- **J20：** TS `extractJobs` 的非 dict 分支（`src/core/e2e.ts` L276–285）push 的对象不含 `unsupported_job` 字段；Oracle `extract_jobs` 的非 dict 分支（`oracle/checkpath_oracle/parser.py` L861–865）显式写出 `"unsupported_job": None`。除该字段有无外全部一致。

### 决策 1 — 裸空键：TS 侧加一条 AST 形状规则，拒空键（不换解析器，不动文本，不动 Oracle）

新增 `hasUnrepresentableKey(yamlText)`（`src/core/workflow-parser.ts`，导出供 `extractJobs` 复用）：对 `yaml` 2.x 的 Document 做递归 AST 检查，任一映射键满足以下任一形状即判整个文档 INVALID / `yaml_parse_error` / events `[]`（`on_key_is_string: false`，与 Oracle 的解析错误 base 逐字一致），接进 `parseWorkflowYaml` 现有的 `yaml_parse_error` 错误路径（`parse()` 抛错之后、`on` 检查之前）；`extractJobs` 同样先查，命中则返回 `[]`（与 Oracle 的 `extract_jobs` 在解析失败时返回 `[]` 一致）：

1. **裸空键：** PLAIN 标量键，值 null，且源 range 为空（`range[0] === range[1]`，即 YAML 文本里该位置就是一个 `:`，前面没有任何字符）。AST 实测为判据之锚：裸键 `range=[18,18]`、源文本 `""`；而 `null:` 源文本 `"null"`、`~:` 源文本 `"~"`、`''` 是 QUOTE_SINGLE 标量（值 `""` 非 null）——三者天然不在规则内。
2. **非标量、非别名键：** 集合键（行内显式 `?` 形式如 `? :` / `? [a, b] : 1` / `? {a: b} : 1`、序列/映射键）。`yaml` 包会把这类键字符串化成垃圾事件名，PyYAML 则拒绝文档（解析错误 / 不可哈希键）。规则 2 是边界探查中发现的同根分歧（B8/C1/C2/C4，见 §2.2），与裸空键同一修复点，顺带一次修掉。

**规则的范围（探针定界，非假设）：** 规则是全文档的，因为 PyYAML 是全文档失败——裸空键在 `jobs:`、顶层、job 定义内、steps 项内、filter 值映射内、flow 映射内同样分歧（B1–B7、B9、B11 全是修前 DIFF，见 §2.2 全表）。规则**不扩大**到不分歧的位置，逐项探针锁定（§2.3）：显式 null 拼写（`null:`/`Null:`/`NULL:`/`~:`，FIX-P0-03 ADR：null 拼写→`""`，R4 的 N4、P4a/b/c 夹具覆盖）、引号空键（`''`）、标准两行显式键（`? push` 换行 `: {}`，AST 上是正常标量键）、锚定标量键（`&k push:`）、merge 键（`<<:`）、块式别名键（`*a : 1`，两边都把别名解析为标量）——全部保持原行为。

### 决策 2 — J20：Oracle 侧在非 dict 分支省略 `unsupported_job` 字段（首选方案；TS 产品代码不动）

取舍（任务书二选一，取改动最小且规格一致者）：

- **首选 Oracle 侧省略（已实施）：** 一处改动（`parser.py` 非 dict 分支去掉 `"unsupported_job": None`），TS 产品代码零改动，`dist.zip` 不因此项变化。Oracle 在此是 TS 输出形状的镜像而非规范器：TS 在 dict 分支恒含该字段、非 dict 分支省略，Oracle 照镜子即可。下游无影响：Oracle evaluator 用 `job.get("unsupported_job")` 读该字段，缺键读作 `None`，与之前的值相同；witness 的 `raw_jobs` 直通，TS 侧同样无该字段，两边反而更一致。Golden G-114/G-115 的 expected 由 Oracle 自身生成，TS e2e 与之逐字段一致（§5）。
- **备选 TS 侧补 `unsupported_job: null`（未取）：** 会动产品代码（`src/core/e2e.ts` 非 dict 分支）并改变 `dist.zip`，而该字段的值（null）不携带任何信息；且裸空键修复已必须动 TS 产品代码，J20 再动一次只会扩大 `dist.zip` 的变化面，无收益。仅当 Oracle 侧被证明是形状权威时才应取备选——本项目中 TS 是形状权威（Oracle 的 docstring 与实现处处以 TS 输出为对齐目标），故不取。

### 后果

- R5 的 3 例残留全部关闭；探针矩阵 98/100（仅 D2 已标注，见 §7-1）。
- 夹具三层新增 10 组（trigger T6-42..T6-51、golden G-106..G-115、parser-divergence 两新目录 22+6），另有探针矩阵本身入仓（`evidence/probes/fix-p0-04/`）。
- TS 产品代码有改动（裸空键规则必须落在 TS 侧），故 **T014 重新冻结时的 `dist.zip` 必然与 R2 的 `da130ad2…` 不同**——与 FIX-P0-02/FIX-P0-03 的“dist.zip 逐字节一致”不同，这是本修复的固有性质，不是回归：`release:verify` 的 dist tree sha256 由 `14cd8492…` 变为 `c06f1487…`（29 文件，两次构建一致，确定性成立）。J20 的 Oracle 侧取舍避免了除此之外的任何 TS 改动。

## §2 探针结果（实现前实测，非假设）

探针方法：TS 侧用 esbuild 打包 `src/core/workflow-parser.ts` 的 `parseWorkflowYaml` 与 `src/core/e2e.ts` 的 `extractJobs`（CJS bundle，从仓库源码重建）；Oracle 侧直接调 `oracle/checkpath_oracle/parser.py` 的 `parse_workflow_yaml` / `extract_jobs`（经仓库自带 `scripts/oracle-parse-probe.py` / `scripts/oracle-jobs-probe.py`）。比较标准与 R5 一致：trigger 模式比较整个 TriggerIR、jobs 模式比较整个 job 列表，全 JSON 深相等，无容差、无忽略字段。每个探针输入均为最小 workflow（`name` + `on:` + 一个 `test` job；jobs 模式输入见表）。探针 case 文件与驱动脚本已存入仓库 `evidence/probes/fix-p0-04/`（cases.json / run-matrix.py / ts-probe-entry.ts / results.json），R6 可从仓库重跑（`python3 evidence/probes/fix-p0-04/run-matrix.py`，exit 0）。

### 2.1 R5 的 66 例矩阵（从 R5 报告 §1–§2 与 R4 报告 §2 全文重建，/tmp 已清空故以报告文本为权威来源）

**修前 63/66 MATCH / 3 DIFF；修后 66/66 MATCH。** 组成：R4 的 46 + FIX-P0-03 的 R1–R10 + R5 残留 10。R5 的算术（46+10+10）有一处重复计数：R3 与 R4 的 P2c 是同一 YAML（`True:` + `FALSE:`），本矩阵保留为两行，与 R5 的计数口径一致；X-empty-2/3/4 与 R4 的 Q4/E1/E2 是同一 YAML，由那三行覆盖，不另立行（详见 `evidence/probes/fix-p0-04/README.md`）。

| 组 | 例 | 输入 | 修前 | 修后 |
|---|---|---|---|---|
| R4 A（13） | E3 / N3 / N4 / N5 / N6 / N7 / M1 / M3 / M4 / M5 / M6 / K3 / K4 | `on:` 下两数字标量拼写键（`1:`+`01:`、`1.5:`+`1.50:`、`1:`+`1.0:`、`0x10:`+`16:`、`+1:`+`1:`、`-0:`+`0:`、`0o17:`+`15:`、`1e2:`+`100:`、`0.5:`+`.5:`、`5.:`+`5.0:`、`.inf:`+`.Inf:`、`1E2:`+`100:`、`.INF:`+`.inf:`） | MATCH | MATCH |
| R4 B（9） | P2c / N2 / N8 / M2 / M7 / M8 / K1 / K2 / K6 | 事件名渲染（`True:`+`FALSE:`、单个 `01:`、`1_000:`+`1000:`、`0b101:`+`5:`、`.nan:`+`.NaN:`、`1_0:`+`10:`、`0O17:`+`15:`、`0X10:`+`16:`、`0b0:`+`0:`） | MATCH | MATCH |
| R4 MATCH（24） | R2 / P2a / P2b / P4a / P4b / P4c / P3a / P3b / P5 / P6 / Q1 / Q2 / Q3 / Q4 / Q5 / E1 / E2 / E4 / E5 / E6 / E7 / E8 / N1 / K5 | R2 为终审输入 `on: {True: {branches: [main]}, true: {branches: [dev]}}`；P2a `TRUE:`+`True:`、P2b `False:`+`false:`、P4a/b/c null 三拼写两两组合、P3a `On:`+`on:`、P3b `yes:`+`Yes:`、P5 单个 `Push:`、P6 单个 `true:`、Q1/Q2 引号 `"True"`/`'True'` + `true:`、Q3 引号 `"true"` + `true:`、Q4 两个裸键、Q5 `ON:`+`on:`、E1 裸键+`null:`、E2 裸键+`~:`、E4 `1:`+`1:`、E5 jobs 层 `True:`/`true:`（jobs 模式）、E6 `"on":`+`on:`、E7 `on: push` 字符串、E8 正常 `push:`、N1 单个 `1:`、K5 单个 `1_000:` | MATCH | MATCH |
| FIX-P0-03 R1–R10 | R1–R10 | 复用 `scalar-rendering/s01..s10` 原文件（单个 `True:` / `FALSE:` / `True:`+`FALSE:` / `Null:` / `~:` / filter 键 `push: {True: [main]}` / `on: [True, push]` / `branches: [True]` / `types: [True]` / 单个 `TRUE:`） | MATCH | MATCH |
| R5 残留 10 | X-empty-1 | `on:` 下单个裸 `:` 键 | **DIFF**：TS UNKNOWN / `[]` / events `[{name: ""}]` / `unsupported_event:` / on_key_is_string true；Oracle INVALID / `["yaml_parse_error"]` / events `[]` / on_key_is_string false | **MATCH**：双边 INVALID / `["yaml_parse_error"]` / events `[]` / on_key_is_string false |
| | X-filter-empty | `on: {push: {: [main]}}` | **DIFF**：TS UNKNOWN / events `[{name: "push"}]` / `unsupported_filter:`；Oracle INVALID / `["yaml_parse_error"]` / events `[]` | **MATCH**：双边 INVALID / `["yaml_parse_error"]` / events `[]` |
| | J20 | `jobs: {test: True}`（jobs 模式） | **DIFF**：TS `[{"id": "test", "if": "__unsupported_if__", "name": null, "needs": []}]`；Oracle 同对象 + `"unsupported_job": null` | **MATCH**：双边均省略 `unsupported_job` |
| | X-empty-5 / X-empty-6 / X-huge-1 / X-huge-2 / X-nan-dup / X-inf-dup / X-neg0-dup | 两个引号空键 `''`、引号空键+`null:`、`9007199254740993:`、400 位整数键、`.nan:`+`.nan:`、`.inf:`+`.inf:`、`-0:`+`0:`（= N7 同 YAML） | MATCH | MATCH |

### 2.2 边界探查：裸空键的位置（新增 B1–B11，trigger + jobs 双模式；修前 0/22，修后 22/22）

| # | 裸空键位置 | 修前 TS | 修前 Oracle | 修后 |
|---|---|---|---|---|
| B1 | `jobs:` 映射（`jobs:` 下裸 `:` 键） | trigger VALID（push 正常）；jobs `[{id: "", …}]` | trigger INVALID / yaml_parse_error；jobs `[]` | 双边 INVALID / `[]` |
| B2 | 顶层映射（`:` 下挂 `foo: bar`） | trigger VALID；jobs `[test]` | INVALID；`[]` | 同上 |
| B3 | job 定义内（`test:` 下裸 `:` 键） | trigger VALID；jobs `[test]` | INVALID；`[]` | 同上 |
| B4 | steps 项映射内（`- run: …` 下裸 `:`） | trigger VALID；jobs `[test]` | INVALID；`[]` | 同上 |
| B5 | filter 值映射内（`branches:` 下裸 `:` 键） | trigger INVALID / `filter_not_string_or_list:branches` / on_key_is_string true；jobs `[test]` | INVALID / yaml_parse_error / on_key_is_string false；`[]` | 双边 INVALID / yaml_parse_error / on_key_is_string false；jobs `[]` |
| B6 | flow 式 `jobs:` 映射（`jobs: {test: True, : 1}`） | trigger VALID；jobs `[test, ""]` 两 job | INVALID；`[]` | 同上 |
| B7 | 序列项映射（`steps: - :`） | trigger VALID；jobs `[test]` | INVALID；`[]` | 同上 |
| B8 | 显式 `? :`（集合键） | trigger UNKNOWN，事件名被字符串化为 `"{ :, branches: [ main ] }"`；jobs `[test]` | INVALID；`[]` | 双边 INVALID / `[]`（规则 2 覆盖） |
| B9 | 裸键 + 行尾空格（`  :   `） | UNKNOWN / `""` 事件 | INVALID | 双边 INVALID（range 仍为空） |
| B10 | `on:` 列表项映射（`on: - :`） | trigger INVALID / `on_list_item_not_string` / on_key_is_string true；jobs `[test]` | INVALID / yaml_parse_error / false；`[]` | 双边 INVALID / yaml_parse_error / false；jobs `[]` |
| B11 | flow 式 `on:` 映射（`on: {push: {}, : 1}`） | trigger INVALID / `event_config_not_mapping` / true；jobs `[test]` | INVALID / yaml_parse_error / false；`[]` | 同上 |

结论：分歧不限于事件/filter 键——PyYAML 全文档失败，故规则必须全文档；B5/B10/B11 修前两边已同为 INVALID 但错误码不同，同样是分歧，规则一并关闭。

### 2.3 无回归形状（新增 D1/D3/D4/E1/E2，双模式 10/10 MATCH；修前修后一致）

| # | 输入 | 两边结果 |
|---|---|---|
| D1 | 块式别名键（`x: &a foo` 后 `on:` 下 `*a : 1`） | INVALID / `event_config_not_mapping` / on_key_is_string true；jobs `[test]` |
| D3 | merge 键（job 内 `<<: *b`） | trigger VALID；jobs `[test]` |
| D4 | 锚定标量键（`&k push:`） | trigger VALID；jobs `[test]` |
| E1 | 标准两行显式键（`? push` 换行 `: {}`） | trigger VALID；jobs `[test]` |
| E2 | 两行显式键 + 映射值（`? push` 换行 `:` + `branches: [main]`） | trigger VALID；jobs `[test]` |

另探针：行内显式键 `? push : {}`（E3/C4 形态）AST 上是集合键、PyYAML 拒绝，规则 2 覆盖（b10 的同类）；序列键 `? [a, b] : 1`、映射键 `? {a: b} : 1` 同样（C1/C2，Oracle 均为 INVALID / yaml_parse_error，TS 修后同）。

### 2.4 AST 判据实测（`yaml` 2.9.1 `parseDocument`，修前）

| 输入键 | key.value | key.type | key.range / 源文本 |
|---|---|---|---|
| 裸 `:`（block/flow 各处） | null | PLAIN | `[18,18]` / `""` |
| `null:` | null | PLAIN | `[18,22]` / `"null"` |
| `~:` | null | PLAIN | `[18,19]` / `"~"` |
| `''` | `""` | QUOTE_SINGLE | `[18,20]` / `"''"` |
| `? :`（B8） | —（key 为 YAMLMap） | — | 集合键 |
| `? push` 两行（E1/E2） | `"push"` | PLAIN | 正常标量键 |
| `*a : 1`（D1） | —（key 为 Alias） | — | 别名键，两边解析为标量 |

## §3 改动清单

### 3.1 `src/core/workflow-parser.ts`（TS 产品代码，裸空键规则）

- 新增导出 `hasUnrepresentableKey(yamlText)`：递归走查全部映射（经映射与序列），任一键为裸空键（PLAIN 标量、值 null、源 range 为空）或非标量非别名键（集合键）即返回 true；`parseDocument` 抛错时返回 false（由既有 `parse()` 路径处理）。附完整判据注释与探针依据。
- `parseWorkflowYaml`：在 `on_key_is_string` 的 `parseDocument` 检测之后、根检查之前接入该检测，命中返回 `base(false, "INVALID", [], ["yaml_parse_error"])`——与 Oracle 解析错误 base 逐字一致（含 `on_key_is_string: false`）。不改输入文本，不动 Oracle 解析器。
- 导入增加 `isAlias`、`isSeq`（`isMap`/`isScalar` 已有）。

### 3.2 `src/core/e2e.ts`（TS 产品代码，jobs 侧同规则）

- `extractJobs`：`parse()` 成功后先查 `hasUnrepresentableKey`，命中返回 `[]`（与 Oracle `extract_jobs` 解析失败返回 `[]` 一致）。`buildWorkflowIR` 经 `parseWorkflowYaml`（INVALID 时提前返回）与 `extractJobs` 两路覆盖，formal pipeline 无需另改。

### 3.3 `oracle/checkpath_oracle/parser.py`（Oracle 侧唯一改动，J20）

- `extract_jobs` 非 dict 分支去掉 `"unsupported_job": None`（附 FIX-P0-04 注释：TS 为形状权威、Oracle 为镜像、改动最小、dist.zip 不因此项变化；下游 `job.get("unsupported_job")` 缺键读作 `None`，值不变）。dict 分支未动（仍恒含该字段，j06 锁定）。

### 3.4 夹具（三层，按 FIX-P0-03 既有模式）

- (a) parser-divergence 新目录 `tests/fixtures/parser-divergence/bare-empty-key/`：22 个 `.yml`（b01..b22）+ `expected.json`（两边 status/errors/全 events，生成前先由 TS 与 Oracle 双跑核对一致才写入）+ `README.md`。
- (b) parser-divergence 新目录 `tests/fixtures/parser-divergence/scalar-job/`：6 个 `.yml`（j01..j06）+ `expected.json`（两边 job 列表）+ `README.md`。
- (c) trigger 夹具 `tests/fixtures/trigger/T6-42-…` … `T6-51-…`（各含 `workflow.yml` + `scenario.json` + `required-checks.json`，后两者照抄 T6-20 的 push 场景与 `test` 检查）+ `tests/fixtures/trigger/suite.json` 增加 10 条（`source: fix-p0-04`，66 → 76）。
- (d) golden 夹具 `tests/fixtures/golden/G-106-…` … `G-115-…`（`expected.json` 由 Oracle 自身生成，见 §3.5）+ `tests/fixtures/golden/suite.json` 增加 10 条（105 → 115）。
- (e) 探针矩阵入仓 `evidence/probes/fix-p0-04/`：`cases.json`（83 行）、`run-matrix.py`（驱动：esbuild 打包 TS 探针到临时目录、双边全 JSON 深相等比较、写 `results.json`、exit 0 当且仅当除已标注分歧外全匹配）、`ts-probe-entry.ts`、`results.json`（修后 98/100）、`README.md`（组成、重跑方法、修前基线、D2 记录）。回应 R5 的 P2-R5-1（探针证据未入仓库）。

### 3.5 `scripts/build-golden.py`（生成器扩展，与 FIX-P0-03 同法）

- 增加 `fix-p0-04` 生成区块（trigger `source == "fix-p0-04"` → `G-106` 起），其余逻辑未动。重建前 `build-golden.py --check-only` 如预期失败（`CHECK FAILED: golden dir differs from regeneration`，golden cases: 115）；重建后 `--check-only` exit 0（115 cases）；`git diff` 证实既有 105 个夹具字节级未变，只有 `suite.json` +150 行与 10 个新目录。

### 3.6 测试与计数同步

- 新测试 `tests/unit/diff-boundaries/bare-empty-key.test.ts`（23 tests：22 cases + schema/文件清单）与 `tests/unit/job-dag/scalar-job.test.ts`（7 tests：6 cases + 文件清单）。
- `tests/unit/event/trigger-oracle-dump.test.ts`、`tests/unit/event/trigger-suite.ts`、`scripts/oracle-diff-trigger.mjs`：trigger 计数注释/断言 66 → 76（sources 增加 `"fix-p0-04": 10`）。
- `tests/unit/golden/golden.test.ts`、`tests/unit/cli/formal-pipeline-unsupported.test.ts`、`scripts/oracle-diff.mjs`：golden 计数 105 → 115。
- 旧注释更新：`tests/unit/job-dag/scalar-rendering-jobs.test.ts` 头注（标量 job 定义现由 FIX-P0-04 覆盖，指向新测试）与 `tests/fixtures/parser-divergence/scalar-rendering/README.md` 的 Known residuals 两条（均标注已由 FIX-P0-04 修复并指向新目录）。
- **未动**：`tests/unit/diff-boundaries/duplicate-key-yaml.test.ts`（5 tests 全过）、`tests/unit/diff-boundaries/scalar-rendering-yaml.test.ts`（22 tests 全过）、`tests/unit/witness/witness-oracle-dump.test.ts`（52 tests 全过）、T7 jobs 套件。
- **Oracle 侧无自有 pytest 套件**：仓库内无任何 Python 测试文件（仅 vitest + diff runners），故无 pytest 可扩展；Oracle 覆盖靠 `test:oracle` / `oracle:diff:trigger` / `oracle:diff:jobs` 与两组 parity 单元测试（与 FIX-P0-03 相同）。

### 3.7 验收运行再生的 evidence 报告（随修复提交）

- `evidence/tests/ORACLE_PARITY_REPORT.json`：105 → 115（`passed: 115`，mismatches 仍 `[]`）。
- `evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`：66 → 76（`passed: 76`，mismatches 仍 `[]`）。
- `evidence/tests/RELEASE_VERIFY_REPORT.json`：dist tree sha256 `14cd8492…` → `c06f1487…`（见 §1 后果与 §5 末；其余字段不变，`report_sha256` 仍为 `9dc3af31…`）。
- `evidence/S0_GATE.json` 与 `evidence/s0/S0_DETERMINISM_REPORT.json`：修后重跑后与 HEAD 字节一致（`git status` 无修改；gate hash 不变，见 §5）。

### 3.8 回归面核对

- 正常事件名（push/pull_request/merge_group）、`on` 字符串键、`on` 列表形式、dup-branches/dup-event/dup-name、dup-bool-true（G-84/T6-20）、全部 FIX-P0-03 标量渲染夹具：行为与修前完全一致——旧夹具、expected 与测试未改动且全过；`npm test` 其余文件计数与基线逐项一致（仅 §5 的 +70 分解文件有变化）；探针 D1/D3/D4/E1/E2 类（别名/merge/锚定/两行显式键）证实规则未扩大到不分歧的位置。
- 唯一行为变化面：含裸空键或集合键的文档（此前分歧）与含标量 job 定义的文档（此前分歧）——均由新夹具锁定。

## §4 提交

（报告单独一 commit，不在此列；以下为实际提交记录。）

1. `b420e9d` — `FIX-P0-04: reject bare empty keys on the TS side and drop unsupported_job for scalar jobs in the Oracle — residual R2 P0 divergence closed` — §3.1–§3.7 的全部改动（126 files, +5280/−42）。
2. （本 commit）— `FIX-P0-04: handoff report TASK_REPORT.md` — 本报告单独一 commit。

完工时 HEAD 干净（除预先存在、未跟踪的 `reports/` 与 R4/R5 复核报告外）。

## §5 验收命令实际输出（逐字抄录，亲自运行；s0:gate 在全部编辑完成后的干净时间窗口一次链式跑完，无编辑重叠）

### `npm test` — exit 0（982 → 1052，+70）

```text
Test Files  36 passed (36)
     Tests  1052 passed (1052)
```

+70 分解（基线为任务书给定的 `2388be1` 实测 982/982）：

| 文件 | 基线 | 修后 | 变化 |
|---|---|---|---|
| `tests/unit/golden/golden.test.ts` | 107 | 117 | +10（G-106..G-115） |
| `tests/unit/event/trigger-oracle-dump.test.ts` | 67 | 77 | +10（T6-42..T6-51） |
| `tests/unit/cli/formal-pipeline-unsupported.test.ts` | 213 | 233 | +20（G-106..G-115 × 主差分 + two-path lock） |
| `tests/unit/diff-boundaries/bare-empty-key.test.ts` | — | 23 | +23（新文件：22 cases + schema/文件清单） |
| `tests/unit/job-dag/scalar-job.test.ts` | — | 7 | +7（新文件：6 cases + 文件清单） |
| `tests/unit/diff-boundaries/scalar-rendering-yaml.test.ts` | 22 | 22 | 0 |
| `tests/unit/job-dag/scalar-rendering-jobs.test.ts` | 16 | 16 | 0 |
| `tests/unit/diff-boundaries/duplicate-key-yaml.test.ts` | 5 | 5 | 0 |
| `tests/unit/witness/witness-oracle-dump.test.ts` | 52 | 52 | 0（未受影响） |
| 其余 27 个文件 | — | — | 0（逐项比对无变化） |

（另：测试输出中有一行 `yaml` 包的进程警告 `Keys with collection values will be stringified … "{ :, branches: [ main ] }"`——来自 b10（`? :`）在 `parse()` 内字符串化集合键的库内警告，是 deliberately degenerate 输入的噪音，不导致失败；见新测试头注。另有一条 “scenario file failed validation” 为负例测试的预期输出，非失败。）

### `npm run test:oracle` — exit 0

```text
suite: tests/fixtures/golden/suite.json
fixtures: 115, TS==expected exit=0, Oracle==expected exit=0, formal TS exit=0
TS vs Oracle mismatches: 0
false PASS: 0
TS formal-pipeline false PASS: 0
unsupported surfaced as UNKNOWN: 34/34 fixtures
report: evidence/tests/ORACLE_PARITY_REPORT.json
```

### `npm run oracle:diff:trigger` — exit 0

```text
suite: tests/fixtures/trigger/suite.json
fixtures: 76, TS exit=0, Oracle exit=0
TS vs Oracle mismatches: 0
report: evidence/tests/T006_ORACLE_TRIGGER_REPORT.json
```

### `npm run oracle:diff:jobs` — exit 0

```text
suite: tests/fixtures/jobs/suite.json + tests/fixtures/s0/job-check/suite.json
fixtures: 48, TS exit=0, Oracle exit=0
TS vs Oracle mismatches: 0
report: evidence/tests/T007_ORACLE_JOBS_REPORT.json
```

### `npm run oracle:diff:checks` — exit 0

```text
suite: tests/fixtures/checks/suite.json + tests/fixtures/s0/job-check/suite.json
fixtures: 46, TS exit=0, Oracle exit=0
TS vs Oracle mismatches: 0
report: evidence/tests/T008_ORACLE_CHECKS_REPORT.json
```

### `npm run oracle:diff:witness` — exit 0

```text
suite: tests/fixtures/witness/suite.json
fixtures: 44, TS exit=0, Oracle exit=0
TS vs Oracle mismatches: 0
report: evidence/tests/T009_ORACLE_WITNESS_REPORT.json
```

### `npm run s0:oracle` — exit 0

```text
suite: tests/fixtures/s0/all.json
fixtures: 24, TS==expected exit=0, Oracle==expected exit=0, formal TS exit=0
TS vs Oracle mismatches: 0
false PASS: 0
TS formal-pipeline false PASS: 0
unsupported surfaced as UNKNOWN: 2/2 fixtures
report: evidence/s0/S0_ORACLE_REPORT.json
```

### `npm run s0:gate` — exit 0

```text
iteration 100/100: ts_exit=0 oracle_exit=0 mismatches=0 hash=b39c0de1471856c4db4f2e3c8b8de3654031030586247ac04683012b183550e2
determinism: 100 runs, 1 unique hash(es), 0 mismatch(es)
gate: static network check: 0 matches
gate: expanded static network check: 46 files, 0 matches
gate: network table-confinement scripts/oracle-diff.mjs: 3 matches, 0 unexplained
gate: network table-confinement scripts/release-verify.mjs: 9 matches, 0 unexplained
gate: status=PASS
gate: oracle 24/24, mismatches=0, false PASS=0, TS formal false PASS=0
gate: determinism 100 runs, 1 unique hash(es)
gate: network matches=0
gate: gate_report_sha256=f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386
gate: report=evidence/S0_GATE.json
```

`gate_report_sha256` 与任务给定值逐字一致。确定性日志 100/100 全为同一 hash（`b39c0de1…`，与 FIX-P0-03 的基线 hash 相同），无 FAILED 迭代。expanded static network check 仍为 46 文件（与 FIX-P0-03 相同；新增的探针文件为 `.py`/`.ts`/`.json`/`.md`，不在该检查的统计口径内——与 FIX-P0-03 新增 `scripts/oracle-jobs-probe.py` 时 45→46 的变化口径一致）。

### `npm run release:verify` — exit 0

```text
[1/5] build + determinism (two independent builds, dist hash must match)
  PASS build determinism: dist tree sha256 c06f148776784da5… (29 files, identical across 2 builds)
[4/5] offline static scan (dist + generated reports)
  PASS offline static scan: 34 files scanned, 0 remote resource references
[5/5] license guard
  PASS license guard: no LICENSE file; LICENSE_STATUS.md still PENDING_SAM_DECISION
release:verify PASS
```

注：dist tree sha256 由基线的 `14cd8492…` 变为 `c06f1487…`——这是 TS 产品代码改动（裸空键规则必须落在 TS 侧）的直接后果，两次构建一致、确定性成立，不是回归。T014 重新冻结时 `dist.zip` 的哈希将与 R2 的 `da130ad2…` 不同（见 §1 后果）；CLI smoke 与 `report_sha256`（`9dc3af31…`）均未变。

### `python3 scripts/build-golden.py --check-only` — exit 0

```text
golden cases: 115
```

### `npm run typecheck` — exit 0

### 探针矩阵最终重跑（仓库内驱动） — exit 0

```text
CHECKS 98/100 MATCH (of which 2 checks are flagged known-divergence)
results: evidence/probes/fix-p0-04/results.json
```

## §6 P0 残留如何关闭

- **例 1（X-empty-1，裸空事件键）：** 根因是 `yaml` 接受裸 `:` 为 null 键而 PyYAML 整文档拒绝。修复：TS 侧 `hasUnrepresentableKey` 在 AST 层拒裸空键，走既有 `yaml_parse_error` 路径；两边均为 INVALID / `["yaml_parse_error"]` / events `[]` / on_key_is_string false。证据链：探针（§2.1 X-empty-1 行 + §2.2 B1–B11）→ 夹具三层（b01、T6-42、G-106）→ 生成器可重建（§3.5）→ 验收命令全部 exit 0 且 0 mismatch（§5）。
- **例 2（X-filter-empty，裸空 filter 键）：** 与例 1 同根同修（flow 风格映射同样被 AST 检查覆盖；b02、T6-43、G-107）。修后双边 INVALID / `["yaml_parse_error"]` / events `[]`。
- **例 3（J20，标量 job 定义）：** 根因是两边非 dict 分支的输出形状差一个 `unsupported_job` 字段。修复：Oracle 侧省略该字段（§1 决策 2），TS 产品代码不动。证据链：探针（§2.1 J20 行 + §2.4 j01–j06）→ 夹具三层（j01、T6-50/T6-51、G-114/G-115）→ 验收命令全部 exit 0。修后双边 job 列表逐字相等（`[{"id": "test", "if": "__unsupported_if__", "name": null, "needs": []}]`）。
- 未动用任何禁止手段：无测试删除、无 Oracle 比较范围缩小、无 mismatch 忽略名单、无 P0 改 P2、无 specs 改动、无许可证改动、无 Drive 操作、无 T013/T014、无终审发送。

### 3 例修后对照表（最终重跑，全 JSON 深相等）

| # | 输入 | TS | Oracle |
|---|---|---|---|
| X-empty-1 | `on:` 下单个裸 `:` | INVALID / `[yaml_parse_error]` / `[]` / on_key_is_string false | 相同 |
| X-filter-empty | `on: {push: {: [main]}}` | INVALID / `[yaml_parse_error]` / `[]` / on_key_is_string false | 相同 |
| J20 | `jobs: {test: True}` | `[{"id": "test", "if": "__unsupported_if__", "name": null, "needs": []}]` | 相同 |

## §7 遗留项

1. **流式别名键（D2，已探针、未修；`yaml` 库的 flow-alias quirk，反方向分歧）：** `on: {*a: 1}` 时 TS 的 `yaml` 库在解析期拒绝（INVALID / `yaml_parse_error`，jobs `[]`），PyYAML 接受并由 Oracle 判 INVALID / `event_config_not_mapping`（jobs `[test]`）。两边都判 INVALID，只有错误码（与 jobs 列表）不同；分歧方向与裸空键相反（TS 比 Oracle 严），根因是 flow 别名键的解析器差异而非裸空键，修它需 Oracle 侧 flow-alias 处理，超出本任务范围。已作为已标注行存入探针矩阵（`cases.json` 的 D2 行，`known_divergence: true`；驱动 exit 0 不计入通过 bar），R6 可复现而非重新发现。块式别名键（D1）两边一致，不受影响。
2. **`dist.zip` 将在 T014 重新冻结时变化：** 见 §1 后果与 §5 末。裸空键规则必须落在 TS 产品代码中，`dist.zip` 无法再与 R2 的 `da130ad2…` 逐字节一致；这是修复的固有性质。T014 需以新冻结包为准，终审 R3 亦应基于重新冻结后的包复核。
3. **无 Oracle pytest 套件：** 见 §3.6；与 FIX-P0-03 相同。
4. **探针矩阵的计数口径：** R5 的 66 = R4 46 + R1–R10 + 残留 10，其中 R3 与 P2c 同 YAML、X-empty-2/3/4 与 Q4/E1/E2 同 YAML；本矩阵保留 R5 的行计数（66 行，含重复 YAML 行），并在 `evidence/probes/fix-p0-04/README.md` 中写明去重后的 distinct 输入数为 64。R6 若按 distinct 计数复核，应得 64/64。
5. **后续步骤（不在本任务内）：** T013 独立复核（R6）→ T014 正式重新冻结 → Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3（仍在同一终审对话）。本修复未触碰冻结产物（`release/` 仍为 R2 冻结值），终审 R3 需基于重新冻结后的包复核。
6. **时间：** 全部工作在 Sam 电脑关机时间（约 07:02 GMT 2026-11-09）前完成，未做跨越关机时间的长运行；未使用 WorkBuddy/Qoder 路由（本地执行，无需模型调用）。
