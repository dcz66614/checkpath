# FIX-P0-08 任务终报 — R7 RESID（未缩进的多行引用标量续行）已关闭

- **任务**：修复 T013 R7 定级的 grouped P0——RESID（未缩进的多行引用标量续行）。
- **代码提交**：`c157f41`（126 文件，+6089/−154；相对 `a479b87`）。
- **结论**：RESID 已关闭。R7 的 6 形状全管线 MATCH；全量电池全过；既往四个探针矩阵全过；试冻两次三哈希自洽。
- **残留**：新发现 R3（反向 flow 键分歧）如实列于 §7，未修——只修 RESID 是本轮范围；R3 只能 TS 侧修，需另派一轮或交 R8 定级。

## 1. 根因

`yaml` npm 包拒绝多行引用标量续行缩进 ≤ 块上下文缩进的形状
（`Missing closing "quote`），而 PyYAML 接受任意缩进。分歧出在
`parse()` 本身，与 tab 无关：`run: "a\nb c"`（不带 tab、续行缩进 0）
同样分歧；双引号与单引号均受影响。TS 侧无法修（`parse()` 本身拒绝，
无规则可加），故 Oracle 侧拒收同一形状，走既有
`yaml_parse_error` 路径。

R7 的 6 形状（`run` 键缩进 8 的上下文）：续行缩进 0 / 2 / 8 时 TS
判 INVALID、Oracle 判 VALID；续行缩进 9 时双边接受。阈值不是
“9”这个数，而是“续行缩进必须严格大于块上下文缩进”——本轮先
测绘后写规则（§2），没有拍脑袋。

## 2. 阈值推导过程（先测绘，后写规则）

对 `yaml` 包（`YAML.parse`，2.9.1）与 PyYAML（Oracle 自用的
`_StrictBaseLoader`）并行测绘 **239 个原始解析用例**（183 + 44 +
10 + 2），覆盖：映射值（键缩进 0/2/4/6/8 × 续行 0..键+2）、
序列项（dash 缩进 0/2）、flow 值/键、flow-in-flow、映射键、值写在
下一行、多续行、空行、tab 行、闭合引号行、根标量。逐项锁定：

| 维度 | 实测边界（续行缩进必须严格大于） |
|---|---|
| 映射值 | 键缩进（0→1+；2→3+；4→5+；6→7+；8→9+；R7 的 8/9 是键缩进 8 的特例） |
| 序列项标量 | dash 缩进（dash 2→3+；dash 0→1+） |
| flow 集合内元素 | 外层块上下文缩进（`m: {k:…}`→1+；`branches: […]` 键缩进 4→5+；flow 嵌套本身不加阈值） |
| 值写在下一行 | 键缩进（`run:` 键 0→1+；工作流布局 `run` 键 8→9+） |
| 多续行 | 每一行都决定（9-then-0 拒，9-then-9 受） |
| 闭合引号行 | 计入（引号在缩进 0 的行拒，9 受） |
| 空行 / 纯空格行 | 跳过（不计入；M1–M4、M12 均接受） |
| 含 tab 的行 | **不**跳过：纯 tab 行拒（前导空格计 0，M11）；tab 终止前导空格计数（行首 tab 拒；9 空格 + tab 受） |
| 根标量 | 无块上下文，永不拒（任意续行缩进双边接受） |

DQ 与 SQ 行为完全一致；续行内的 tab 内容无关；锚点不改变规则；
CRLF 文档行为相同（空续行跳过）。

**推导出的统一规则**：对每个跨越多行的引用标量 token，取其最内层
块集合的缩进（`BlockMappingStartToken` /
`BlockSequenceStartToken` 的 `start_mark.column`）；若无块集合
（文档根标量）则不拒；否则每条续行（首行之后至闭合引号行，含
闭合行；空行或纯空格行跳过，含 tab 的行不跳过）的前导空格数
（遇首个非空格即停，tab 计 0）必须严格大于该缩进，否则拒收。
PyYAML token 流实测确认栈结构：K=8 的 `run` 形状最内层块为
col 8；flow 值为外层块 col 0；序列项为 dash col 2。

**测绘中纠正的两次假设**：(1) 空行起初以为计缩进 0——M1/M3
证明纯空白行被跳过，G-blank 的拒绝只来自 `b"` 行；(2) f20/f21
初版把标量写在与 `run` 键同缩进（8）的位置，实际成了同级映射键
（双边都拒的 R4 形状）而非“值在下一行”——已修正为标量行缩进 10，
f21 现为 VALID，矩阵 ownline 行同步修正并重跑。

## 3. 改动（Oracle 侧，`src/` 0 改动）

`oracle/checkpath_oracle/parser.py`（+102/−0，唯一产品代码改动）：

- 新函数 `_reject_underindented_multiline_quoted_scalar`（紧接
  `_reject_adjacent_alias_colon` 之后，同一机制家族）：扫描 PyYAML
  token 流，维护块缩进栈（`Block*StartToken` 入栈其
  `start_mark.column`，`BlockEndToken` 出栈）；对 style 为 `'`
  或 `"` 且跨行的 `ScalarToken`，按 §2 规则逐行检查，违规时抛
  `yaml.YAMLError`。这是拒收，不是 §7.3 禁止的输入文本手术
  （文本永不改写）；plain 标量与块标量（`|``>`）不受影响。
- 两处 `yaml.load` 调用点并列调用：`parse_workflow_yaml` 与
  `extract_jobs`（与 `_reject_adjacent_alias_colon` 同一行模式），
  均走既有 `yaml_parse_error` 路径（trigger INVALID /
  `yaml_parse_error` / events `[]`；jobs `[]`）。
- **明确未做**：换解析器（未尝试）；输入文本手术（无）；TS 侧改动
  （`src/` diff = 0）；删测试（`git diff --diff-filter=D` = 0）；
  缩小 Oracle 比较范围（`deepDiff` 未动）；mismatch 忽略名单
  （无）；P0 改回 P2（无）。

**夹具与测试**（防回归）：

- `tests/fixtures/parser-divergence/multiline-quoted-unindented/`：
  21 例（f01–f06 为 R7 的 6 形状；f07–f14 为各上下文阈值对；
  f15–f21 为空行/tab 行/闭合行/多续行/值在下一行边界）+
  `expected.json`（13 INVALID / 8 VALID）+ README +
  `tests/unit/diff-boundaries/multiline-quoted-unindented.test.ts`
  （新文件，22 测试：1 schema + 21 用例，双模式双边全字段锁定）。
- trigger T6-68..T6-79（12 例，source `fix-p0-08`；suite 92→104；
  `trigger-oracle-dump.test.ts` 与 `trigger-suite.ts` 的硬编码 92
  改为 104，sources 断言补 `"fix-p0-08": 12`）与 golden
  G-132..G-143（12 例；`build-golden.py` 新增 FIX-P0-08 段；
  suite 131→143；`golden.test.ts`、`oracle-diff.mjs`、
  `formal-pipeline-unsupported.test.ts` 的硬编码 131 改为 143）。
- `evidence/probes/fix-p0-08/`：`cases.json`（82 行）、
  `run-matrix.py`、`ts-probe-entry.ts`、README、`results.json`。

**过程诚实记录**：验收中途 1 个测试失败——
`trigger-oracle-dump.test.ts` 把 trigger 套件总数硬编码为 92，
属计数断言而非真实分歧（trigger diff 本身 mismatches: 0）；已
按上条修正并重跑全绿。另：初版 `tests/fixtures/trigger/suite.json`
曾因误用 indent=1 整文件重排（1496 行 diff），已恢复原文件并
以 indent=2 重加 12 条（现 diff 仅 +96 行）。

## 4. 验收（全部亲自重跑，HEAD `c157f41`）

| 检查 | 实测 |
|---|---|
| `npm test` | **1285/1285（41 文件）**；基线 1215/1215（40 文件）；+70 = 22（新文件）+ 12（trigger dump）+ 12（golden）+ 24（formal-pipeline，每夹具 2 例） |
| `npm run test:oracle` | **143 夹具，0 mismatch，0 false PASS，34/34 UNKNOWN**；`build-golden.py --check-only` exit 0（143 例） |
| `npm run oracle:diff:trigger` | **104 夹具，0 mismatch** |
| `npm run oracle:diff:jobs` | **48 夹具，0 mismatch** |
| `npm run oracle:diff:checks` | **46 夹具，0 mismatch** |
| `npm run oracle:diff:witness` | **44 夹具，0 mismatch** |
| `npm run s0:gate` | **PASS**，oracle 24/24，100 runs 1 hash，`gate_report_sha256=f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`（不变） |
| `npm run release:verify` | **PASS**（license guard PENDING_SAM_DECISION） |
| fix-p0-08 矩阵 | **156/164 MATCH**；未标记 152/152；仅 8 处已标记 R3 分歧（§7）；exit 0 |
| fix-p0-04 矩阵 | **100/100**（含 R5 子集 66/66；已标记 D2 的 2 检查现也 MATCH） |
| fix-p0-05 矩阵 | **76/76** |
| fix-p0-06 矩阵 | **134/134** |
| fix-p0-07 矩阵 | **86/86**（4 个已标记 RESID 检查现已 MATCH——RESID 在旧矩阵中亦关闭） |
| 试冻两次 | 三哈希两次完全一致：source.zip `64e950c3c14db028cac49b16723dd20c55baf137503117f1bf56c1acb8c82dea`（1,896 文件）；dist.zip `c391ad648d56db7c91e5a49fdae0fb2cae1972c2a771f1d2f83ba643249cf024`（114 文件，与 FIX-P0-07 试冻 dist 哈希一致——Oracle-only 改动，TS 未动）；manifest `5d2c158c999fbe0ca32b2e306acf753a614113901c5b5cde654fbadbbdec60db`；`sha256sum -c` 3/3 OK；试冻后 `git checkout -- release/` 已恢复 |

冒烟：R7 6 形状在修复后全管线 trigger + jobs 均 MATCH（含
IND9 VALID 边界与 IND7 拒绝边界）。

## 5. R7 报告对照

- R7 P0 的 6 形状 × trigger+jobs = 12 检查：**全部 MATCH**
  （RESID-DQ/SQ/NOTAB/IND2/IND8 均双边 INVALID /
  `yaml_parse_error`；IND9 双边 VALID）。
- R7 §2.4 边界表：V3/V4、V6/V7/V8、TAB-COMMENT、TAB-BLOCK/Q3、
  X-empty-2/3/4、IND9 全部仍 MATCH（矩阵覆盖）。
- R7 要求的修复后步骤：本轮已完成修复 + 全量验收 + 试冻；
  下一步为全新独立复核 T013 R8（新会话、干净克隆、复核
  `c157f41`；须重跑 RESID 6 形状 + 四矩阵 + R5 66 例 + 本轮
  82 行矩阵；并对 §7 的 R3 独立定级）。

## 6. 未动事项

- R2 的 6 个 P2 与 R6 的 2 个 P2 全部仍在（本轮未碰；manifest
  的 `inputs` 仍只记到 R3——P2-R6-1 留待 T014 再冻结时补记
  R4/R5/R6/R7/R8）。
- 许可证仍为 PENDING_SAM_DECISION。
- `reports/`（`a479b87` 已有未跟踪目录，非本轮产生）未动。

## 7. 残留分歧清单

### R3 — 反向 flow 键分歧（新发现，测绘中发现，未修复）

`yaml` 包**接受**多行引用标量作 flow 映射的键，而 PyYAML 拒绝
所有多行引用键（"mapping values are not allowed here"）。两面：

- 作额外键（`m: {"a\n b": 1}`，续行缩进 > 块上下文）：TS
  VALID vs Oracle INVALID / `yaml_parse_error`。
- 作 `on:` 值（`on: {"a\n b": push}`）：双边 INVALID，但错误码
  不同——TS 为 `event_config_not_mapping`（且
  `on_key_is_string: true`、jobs `[test]`），Oracle 为
  `yaml_parse_error`（`on_key_is_string: false`、jobs `[]`）。

边界：续行缩进为 0 时双边都拒（flow 集合无法跨到未缩进的行），
故矩阵中 `flowkey-ind0` 与 `flowkey-nested-ind0` 均 MATCH；分歧
只在续行缩进 > 块上下文时出现。块映射键不受影响：双边在所有
缩进下都拒（矩阵 `blockkey-*` 行 MATCH）。

**为什么本轮不修**：方向相反——Oracle 侧无法修（PyYAML 在解析
时即拒，无法使其接受）；只能 TS 侧加规则（`parse()` 接受后做
AST 检查，拒收 flow 映射中的多行引用键，类似
`hasUnrepresentableKey` 的机制），那是另一机制、另一轮范围。
本轮范围是“只修 RESID”。已在矩阵中标记为已知分歧
（`evidence/probes/fix-p0-08/cases.json` 6 行 / 12 检查；8 处
DIFF，4 处 MATCH），并在此如实列出，未隐瞒。

**建议**：请 R8 对 R3 独立定级（P0/P2）；若定 P0，另派
FIX-P0-09（TS 侧 AST 规则）处理；R8 的复核范围应包括 R3 的
6 形状（矩阵已备好，可直接重跑）。

### 其他

无。测绘的 239 个原始用例中，除 R3 外的所有分歧均已由本轮规则
关闭（矩阵 152/152 未标记检查 MATCH）；无其他新分歧。

## 8. 文件与提交

- 代码提交：`c157f41`（126 文件，+6089/−154）。
- 本终报：`handoff/P020-FIX-P0-08/TASK_REPORT.md`（单独提交，
  与代码提交分开）。
- 工作树独占：修复期间无任何复核并行（R4 的污染教训）。
- 关键路径：`oracle/checkpath_oracle/parser.py`
  （`_reject_underindented_multiline_quoted_scalar`）；
  `evidence/probes/fix-p0-08/`（cases.json / run-matrix.py /
  results.json / README）；`tests/fixtures/parser-divergence/
  multiline-quoted-unindented/`；trigger T6-68..T6-79；golden
  G-132..G-143。
