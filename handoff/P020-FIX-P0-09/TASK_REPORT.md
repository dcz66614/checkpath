# FIX-P0-09 任务终报 — R8 R3（反向 flow 键分歧）已关闭

- **任务**：修复 T013 R8 定级的 grouped P0——R3（反向 flow 键分歧：`yaml` 包接受多行引用标量作 flow 映射的键，PyYAML 拒绝）。
- **代码提交**：`a8ca5ec`（145 文件，+5998/−273；相对 `2920cc6`）。
- **结论**：R3 已关闭。R8 的 10 形状 × trigger+jobs = 20 检查全部 MATCH；全量电池全过；既往五个探针矩阵全过；试冻两次三哈希自洽。
- **残留**：新发现 R4、R5（反向分歧，TS 侧 `parse()` 本身拒绝）如实列于 §7，未修——只修 R3 是本轮范围；R4/R5 只能 Oracle 侧修，需另派一轮或交 R9 定级。

## 1. 根因

`yaml` npm 包（2.9.1）接受多行引用标量作 flow 映射的键
（`m: {"a\n b": 1}`、`on: {"a\n b": push}`，解析成功、键为
`"a b"`），而 PyYAML 对 flow 映射中的任何多行键都报
ParserError（"mapping values are not allowed here"）。分歧出在
`parse()` 本身，与 tab 无关：单引号键亦然，plain 键折行亦然，
任意续行缩进 > 0 均分歧，嵌套亦然。Oracle 侧无法修（PyYAML
在解析时即拒，无法使其接受），故只能 TS 侧在 `parse()` 接受
后加 AST 规则拒收，走既有 `yaml_parse_error` 路径。

R8 的 10 形状（§2，20 检查，14 处 DIFF）：

- 作额外键（`m: {"a\n b": 1}`，续行缩进 1）：TS **VALID** vs
  Oracle **INVALID / `yaml_parse_error`**——正式管线会接受
  Oracle 判为无效的文档；
- 作 `on:` 值（`on: {"a\n b": push}`，续行缩进 1）：双边
  INVALID，但错误码不同（TS `event_config_not_mapping` vs
  Oracle `yaml_parse_error`）、`on_key_is_string` 不同
  （true vs false）、jobs 不同（`[test]` vs `[]`）；
- 分歧面比修复方 6 行更宽（R8 自写探针）：单引号键、续行缩
  进 2 与 9、嵌套 `m: {n: {"a\n b": 1}}` 均分歧，同一根因。

## 2. AST 信号推导过程（先测绘，后写规则）

对 `yaml` 包（`parseDocument` AST，2.9.1）与 PyYAML（Oracle
自用的 `_StrictBaseLoader`，6.0.1）并行测绘 **34 个原始解析
用例**，覆盖：R8 的 10 形状、plain 折行键、转义引号键、锚定键、
序列内 flow 映射、`jobs:` 映射内的键、`on:` 嵌套下的键、文档根
flow 映射、多行引用值、V8 单行键内 tab、显式 `?` 键（含注释变
体）、块显式键、正常 flow `on:`、冒号在下一行（含注释变体）、
值/键写在下一行、续行缩进 0 边界。逐项锁定：

| 信号 / 边界 | 实测 |
|---|---|
| S1：键的源码跨行 | flow 映射的键是标量（PLAIN / QUOTE_SINGLE / QUOTE_DOUBLE），其 `key.range[0..1]` 切片含 `\n` 时分歧：双引号、单引号、plain 折行、嵌套、序列内、`jobs:` 内、`on:` 嵌套、锚定键、转义引号键全部命中；`parseDocument` 不抛错（它返回 `doc.errors`，`parse()` 才抛），故门在 `parse()` 接受后才可达 |
| S2：冒号在键的下一行 | 从键尾向前扫过空格/tab/换行/注释，换行后才遇到 `:` 时分歧：`{a\n : 1}`、`{"a"\n : 1}`、`on: {"a"\n : push}`、键与冒号之间的注释（`{a # c\n : 1}`、`{a\n # c\n : 1}`）全部命中 |
| 显式 `?` 键 | **必须排除**：PyYAML 接受跨行 `?` 键（`m: {? "a\n b" : 1}`、`m: {? a\n b : 1}` 双边 VALID；`on: {? "a\n b" : push}` 双边 INVALID / `event_config_not_mapping`，jobs 相同）。AST 上显式键与普通键无区别（QUOTE_DOUBLE 的 `spansLines` 相同），故必须从键首向后扫源码找 `?` |
| 注释扫描 | 必须引用感知：`#` 仅在引用标量范围之外、且行首或空白之后才开始注释；引用范围取自已解析 AST 的全部 QUOTE_SINGLE/QUOTE_DOUBLE 标量。`{"x": "a\n b # not a comment", ? "c\n d": 1}` 中的 `#` 不是注释 |
| 续行缩进 0 | 双边都拒（`parse()` 本身抛），门不可达，无需处理 |
| 块映射键 | 双边都拒（隐式多行块键 `parse()` 抛；显式块键 `? "a\n b"\n: 1` 双边接受） |
| 多行引用值 | **不得误拒**：`m: {"a": "x\n y"}` 双边接受（RESID 已由 Oracle 侧覆盖未缩进者） |
| V8 单行键内 tab | 双边接受（`m: {"a\tb": 1}`） |
| 值/键在下一行 | `m: {a:\n 1}`、`m: {\n a: 1}` 双边接受 |

**推导出的统一规则**（`hasMultilineFlowKey`）：遍历全部节点；
对每个 `flow === true` 的映射（块映射的 `flow` 为
`undefined`），对每个键对，若键不是显式 `?` 键（从键首向后扫
空白/换行/注释，首个结构字符 `?` 为显式、`{` / `,` 为普通对），
且满足 S1（键标量源码含 `\n`）或 S2（键尾向前扫，跨换行后遇
`:`），则拒收。这是 AST 形状检查加输入文本只读扫描：文本永
不改写（§7.3），Oracle 解析器未动。

**测绘中纠正的一处实现错误**：初版 `isExplicitKey` 在注释内
跳步时跳到注释所在行的上一行换行符，导致 `?` 与键之间的注释
把同一行的 `?` 也丢掉了——`m: {? # why?\n "a\n b" : 1}` 被误拒
（TS INVALID vs Oracle VALID，回归）。已修正为跳到注释起始
`#` 之前一位继续扫描；由 f25 锁定。另见 §3 过程记录。

## 3. 改动（TS 侧，`oracle/` 0 改动）

`src/core/workflow-parser.ts`（新函数 `hasMultilineFlowKey`，
约 +200 行，含完整 docstring 测绘表；唯一产品代码改动文件
之一）与 `src/core/e2e.ts`（调用点 + 导入，+9/−2）：

- 新函数 `hasMultilineFlowKey(yamlText: string): boolean`
  （位于 `hasUnrepresentableKey` 之后，同一机制家族）：
  `parseDocument` 抛错时返回 false（与
  `hasUnrepresentableKey` 同一模式）；收集全部引用标量范围供
  注释判断；`isExplicitKey` 向后扫描、`colonOnLaterLine` 向前
  扫描、递归 `walk` 遍历全部映射/序列。只对 flow 映射的键生
  效；`BLOCK_FOLDED` / `BLOCK_LITERAL` 键不在 S1 之列。
- 两处调用点并列接入既有 `yaml_parse_error` 路径：
  `parseWorkflowYaml`（`hasUnrepresentableKey(...) ||
  hasRejectedTab(...) || hasMultilineFlowKey(...)`，与
  `hasRejectedTab` 同一条件）与 `extractJobs`（同上，返回
  `[]`）。`on:` 面：命中后返回与 Oracle 解析错误基底完全一致
  的结果（`INVALID` / `yaml_parse_error` / events `[]` /
  `on_key_is_string: false` / reason `"invalid"`；jobs `[]`）。
- **明确未做**：换解析器（未尝试）；输入文本手术（无）；
  Oracle 侧改动（`oracle/` diff = 0）；删测试
  （`git diff --diff-filter=D` = 0）；缩小 Oracle 比较范围
  （`deepDiff` 未动）；mismatch 忽略名单（无）；P0 改回 P2
  （无）。

**夹具与测试**（防回归）：

- `tests/fixtures/parser-divergence/flow-quoted-key/`：38 例
  （f01–f10 为 R8 的 10 形状；f11–f19 为 S1 加宽；f20–f28
  为不得误拒边界；f29–f38 为 S2 形状）+
  `expected.json`（25 INVALID / 13 VALID，双模式双边全字段
  锁定；由双边实测生成并逐条复核）+ README +
  `tests/unit/diff-boundaries/flow-quoted-key.test.ts`
  （新文件，39 测试：1 schema + 38 用例）。
- trigger T6-80..T6-91（12 例，source `fix-p0-09`；suite
  104→116；`trigger-oracle-dump.test.ts` 与 `trigger-suite.ts`
  的硬编码 104 改为 116，sources 断言补 `"fix-p0-09": 12`；
  `oracle-diff-trigger.mjs` 注释同步）与 golden G-144..G-155
  （12 例；`build-golden.py` 新增 FIX-P0-09 段；suite
  143→155；`golden.test.ts`、`oracle-diff.mjs`、
  `formal-pipeline-unsupported.test.ts` 的硬编码 143 改为
  155）。`build-golden.py --check-only` 在写盘前先失败
  （预期：12 例新夹具缺失），写盘后 155 例全生成；既有
  143 例 `expected.json` 字节未变（仅 suite.json +12 条）。
- `evidence/probes/fix-p0-09/`：`cases.json`（49 行）、
  `run-matrix.py`、`ts-probe-entry.ts`、README、
  `results.json`。
- 另：本次重跑把 `evidence/probes/fix-p0-08/results.json`
  更新为 164/164（其 6 行 R3 已标记检查现全部 MATCH——
  R3 关闭的直接证据，由其自有 runner 重新生成，非手改），
  以及 `evidence/tests/ORACLE_PARITY_REPORT.json`（155 例）、
  `T006_ORACLE_TRIGGER_REPORT.json`（116 例）、
  `RELEASE_VERIFY_REPORT.json`（dist tree sha 变为
  `a4ea7d3e…`，TS 代码改动的预期结果；report_sha256
  `9dc3af31…` 不变）。

**过程诚实记录**：

1. 显式注释扫描回退错误（§2 末）：初版误拒
   `m: {? # why?\n "a\n b" : 1}`，探针发现后当场修正并由 f25
   锁定；无其他形状受影响。
2. 计数更新时 `trigger-suite.ts` 的注释一度写出重复行
   （旧尾行残留），已立即修正为干净文本；无测试影响。
3. 试冻首次尝试在代码提交前运行，因 `src/` 相对 HEAD 有未提
   交改动被冻结器的 HEAD 门拒绝（exit 1，`release/` 未动）；
   随后我对旧 `release/` 文件做的 `sha256sum` 读到的是 R2
   正式产物——这不是产物问题，是顺序错误：正确顺序是先提
   交代码、再试冻（§4 的两次试冻均在 `a8ca5ec` 上完成）。
4. 五个既往矩阵曾因一条 shell 循环各跑两遍（第一次的 grep
   与第二次的 grep 各跑一次），纯属浪费、无害；结果以
   `results.json` 为准，两次输出一致。

## 4. 验收（全部亲自重跑，HEAD `a8ca5ec`）

| 检查 | 实测 |
|---|---|
| `npm test` | **1372/1372（42 文件）**；基线 1285/1285（41 文件）；+87 = 39（新锁文件：1 schema + 38 用例）+ 12（trigger dump）+ 12（parser-trigger，遍历 trigger 套件）+ 12（golden）+ 12（formal-pipeline） |
| `npm run test:oracle` | **155 夹具，0 mismatch，0 false PASS，34/34 UNKNOWN** |
| `npm run oracle:diff:trigger` | **116 夹具，0 mismatch** |
| `npm run oracle:diff:jobs` | **48 夹具，0 mismatch** |
| `npm run oracle:diff:checks` | **46 夹具，0 mismatch** |
| `npm run oracle:diff:witness` | **44 夹具，0 mismatch** |
| `npm run s0:gate` | **PASS**，oracle 24/24，100 runs 1 hash，`gate_report_sha256=f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`（不变） |
| `npm run release:verify` | **PASS**（license guard PENDING_SAM_DECISION） |
| fix-p0-09 矩阵 | **92/98 MATCH**；仅 6 处已标记 R4/R5 分歧（§7）；exit 0；修复前基线 **48/98**（仅 `git stash` `src/` 两文件测得，矩阵文件未动：22 行未标记 DIFF + 6 处已标记） |
| R5 子集 | **66/66**（fix-p0-04 矩阵前 66 行，全 JSON 深相等） |
| fix-p0-04 矩阵 | **100/100**（2 处已标记 D2 检查现也 MATCH） |
| fix-p0-05 矩阵 | **76/76** |
| fix-p0-06 矩阵 | **134/134** |
| fix-p0-07 矩阵 | **86/86**（4 个已标记 RESID 检查现已 MATCH） |
| fix-p0-08 矩阵 | **164/164**（12 个已标记 R3 检查现全部 MATCH——R3 在旧矩阵中亦关闭） |
| 试冻两次 | 三哈希两次完全一致：source.zip `b8a4139f813598789c3211d33b82ff5caad54538b5af970b0926b14a0cff7d81`（2,029 文件，2,515 条目）；dist.zip `57dc0f8d2cbbad9fdb6b9fd45b5cc30bf19ddd587ac16147ad980a7c8b46e7b9`（114 文件，**已变**——本次改了 TS 产品代码，属预期；R2 为 `da130ad2…`）；manifest `2dd4fe131e9c5986bf2c7918b832ffb3ea052c74c655938acce9960f16366353`；`sha256sum -c` 3/3 OK；试冻后 `git checkout -- release/` 已恢复 R2 正式产物（`3a778b93…` / `da130ad2…` / `04a07733…`） |

冒烟：R8 10 形状在修复后全管线 trigger + jobs 均 MATCH
（含 IND9 VALID 边界与 IND0 双边拒绝边界）；S1 加宽形状
（plain 折行、转义引号、锚定、序列内、`jobs:` 内、嵌套
`on:`）与 S2 形状（冒号下一行、注释变体）亦全部 MATCH。

## 5. R8 报告对照

- R8 P0 的 10 形状 × trigger+jobs = 20 检查：**全部 MATCH**
  （作额外键均双边 INVALID / `yaml_parse_error`；作 `on:` 值
  均双边 INVALID / `yaml_parse_error`，`on_key_is_string`
  false，jobs `[]`；IND0/IND2/IND9、单引号、嵌套全部覆盖）。
- R8 §2.5 边界表：续行缩进 0（f03/f04/f35）、块映射键
  （f09/f27）、V8 单行键内 tab（f21）、V3/V4 引用标量值
  （f20）、V6/V7（fix-p0-06 矩阵 134/134 重跑覆盖）全部仍
  MATCH。
- R8 要求的修复后步骤：本轮已完成修复 + 全量验收 + 试冻；
  下一步为全新独立复核 T013 R9（新会话、干净克隆、复核
  `a8ca5ec`；须重跑 R3 的 10 形状 + 五矩阵 + R5 66 例 + 本轮
  49 行矩阵；并对 §7 的 R4/R5 独立定级）。

## 6. 未动事项

- R2 的 6 个 P2 与 R6 的 2 个 P2 全部仍在（本轮未碰；manifest
  的 `inputs` 仍只记到 R3——P2-R6-1 留待 T014 再冻结时补记
  R4–R9）。
- 许可证仍为 PENDING_SAM_DECISION。
- `reports/`（`2920cc6` 已有未跟踪目录，非本轮产生）未动。

## 7. 残留分歧清单

### R4 — flow 映射中逗号独占一行，缩进 0（新发现，测绘中发现，未修复）

`m: {a\n, b: 1}`：TS **INVALID / `yaml_parse_error`** vs
Oracle **VALID**（`{'m': {'a': None, 'b': 1}}`）。方向与 R3
相反——TS 侧更严。边界：逗号在缩进 ≥ 1 的行时双边 VALID
（矩阵行 `r4-comma-ind1` MATCH）。

**为什么本轮不修**：这是 `parse()` 本身在 TS 侧的拒绝（`yaml`
包不接受缩进 0 的行尾逗号续行），AST 规则修不了——门在
`parse()` 接受后才可达，而该形状到不了门。只能 Oracle 侧加
拒收规则（`_reject_adjacent_alias_colon` 同一家族：拒绝 flow
映射中缩进 0 的行首逗号），那是另一机制、另一轮范围。已在
矩阵中标记为已知分歧（`evidence/probes/fix-p0-09/cases.json`
行 `r4-comma-ind0`，2 检查 DIFF），并在此如实列出，未隐瞒。

### R5 — 显式键的冒号在下一行，缩进 0（新发现，测绘中发现，未修复）

`m: {? a\n: 1}`、`m: {? "a"\n: 1}`：TS **INVALID /
`yaml_parse_error`** vs Oracle **VALID**。方向与 R3 相反——TS
侧更严。边界：冒号在缩进 ≥ 1 的行时双边 VALID（矩阵行
`r5-explicit-ind1`、`r5-explicit-quoted-ind1` MATCH）。注意：
这是 S2 的反向边界——S2 处理的是**普通键**的冒号在下一行
（PyYAML 拒），R5 是**显式键**的冒号在下一行缩进 0（PyYAML
受、`yaml` 包拒）。

**为什么本轮不修**：同 R4——`parse()` 本身在 TS 侧拒绝，到
不了 AST 门；只能 Oracle 侧加拒收规则（拒绝显式键的冒号在
缩进 0 的下一行）。已在矩阵中标记为已知分歧
（`evidence/probes/fix-p0-09/cases.json` 行
`r5-explicit-plain-ind0`、`r5-explicit-quoted-ind0`，4 检查
DIFF），并在此如实列出，未隐瞒。

**建议**：请 R9 对 R4/R5 独立定级（P0/P2）；若定 P0，另派
FIX-P0-10（Oracle 侧拒收规则）处理；R9 的复核范围应包括
R4/R5 的 3 形状（矩阵已备好，可直接重跑）。

### 其他

无。测绘的 34 个原始用例中，除 R4/R5 外的所有分歧均已由本轮
规则关闭（矩阵 92/98，未标记检查全 MATCH）；无其他新分歧。

## 8. 文件与提交

- 代码提交：`a8ca5ec`（145 文件，+5998/−273）。
- 本终报：`handoff/P020-FIX-P0-09/TASK_REPORT.md`（单独提交，
  与代码提交分开）。
- 工作树独占：修复期间无任何复核并行（R4 的污染教训）。
- 关键路径：`src/core/workflow-parser.ts`
  （`hasMultilineFlowKey`）；`src/core/e2e.ts`（调用点）；
  `evidence/probes/fix-p0-09/`（cases.json / run-matrix.py /
  results.json / README）；`tests/fixtures/parser-divergence/
  flow-quoted-key/`；trigger T6-80..T6-91；golden G-144..G-155。
