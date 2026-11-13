# P020 CheckPath — FIX-P0-06 终报

**任务**：修复终审 R2 遗留的两个新已知分歧 N5（块式别名键 + 映射锚点）与 H6（流式别名键 + tab 分隔），均来自 FIX-P0-05 的边界探查（见 `handoff/P020-FIX-P0-05/TASK_REPORT.md` §7、`evidence/probes/fix-p0-05/cases.json` 中标注 `known_divergence` 的 4 个检查）。

**基线**：HEAD 5133396（FIX-P0-05 已提交并验收）。**代码提交**：`f29faec`。本报告为单独提交。

**结论先行**：N5 与 H6 均已关闭。fix-p0-06 探针矩阵 67 行、134/134 检查 MATCH，**0 个已知分歧残留**。全部验收实测通过（§5），s0 gate 哈希未变（`f511a847…`）。修复期间工作树独占，未与任何复核并行。

---

## 1. 任务与范围

只修 N5 + H6，TS 侧规则，与 FIX-P0-04 的 `hasUnrepresentableKey` 同一机制家族；Oracle 侧不动。禁止事项全部遵守：未删测试、未缩小 Oracle 比较范围、未加 mismatch 忽略名单、未把 P0 改回 P2、未破坏已一致的用例（`? {a: b} : 1` / `? [a, b] : 1` 等全部锁定为 no-regression 对照）。

## 2. 根因

### 2.1 N5 — 块式别名键 + 映射锚点

输入：`x: &a {b: c}` 后 `on:` 下用 `*a : 1` 作键。

- TS 侧：`yaml` 2.9.1 解析时把别名解析为映射，再 stringify 成事件名 → INVALID / `event_config_not_mapping`，jobs `[test]`。
- Oracle 侧：PyYAML 6.0.1 拒绝不可哈希的 dict 键 → INVALID / `yaml_parse_error`，jobs `[]`。
- 根因：`hasUnrepresentableKey` 只处理字面集合键（Map/Seq 直接作键），不处理**解析后为集合的别名键**。修复方向二选一时选了 (b) TS 侧扩展（见 FIX-P0-05 §7）：(a) Oracle 侧把集合键 stringify 会破坏已达成一致的 `? {a: b} : 1` / `? [a, b] : 1`，**未采用**。

探针确认的 N5 边界（修复前，`evidence/probes/fix-p0-06/cases.json`）：

| 形状 | 修复前 |
|---|---|
| 映射/序列锚点作键（块式/流式） | DIFF |
| 事件/过滤器/jobs/matrix 位置 | DIFF |
| 空集合锚点（`&a {}` / `&a []`） | DIFF |
| 过滤器位置：TS 甚至返回 VALID | DIFF |
| jobs 位置：TS 取 job id `"*a"` | DIFF |
| 标量锚点（`&a foo`）、null 锚点（`&a ~`）、int 锚点（`&a 1`） | 已 MATCH，不得破坏 |
| 显式集合键 `? {a: b} : 1` / `? [a, b] : 1` | 已 MATCH，不得破坏 |
| 标量锚点在 jobs 位置、前向引用映射锚点、链式别名 `*b`（`&b *a`） | 已 MATCH（两侧同为 `yaml_parse_error`） |

### 2.2 H6 — 流式别名键 + tab 分隔（实为整个 tab 族）

输入：`on: {*a<TAB>: 1}`。

- TS 侧：`yaml` 接受 tab 作分隔 → INVALID / `event_config_not_mapping`，jobs `[test]`。
- Oracle 侧：PyYAML 扫描器在 flow 上下文拒绝别名后的 tab → INVALID / `yaml_parse_error`，jobs `[]`。
- 根因：两侧 YAML 扫描器对 tab 的容忍度不同。探针（直接对 PyYAML 6.0.1 + 完整矩阵）证明分歧远不止 H6 一个形状——**PyYAML 拒绝 tab 的规则是通用的**：除引号标量内部、块标量内容、注释内部之外，tab 出现在任何位置都被拒绝，包括冒号前后、别名后（键/值位置）、普通标量后、逗号/`{`/`-`/`?` 后、锚点/标签后、普通标量内部，块式与流式皆然。标量键带 tab、冒号后带 tab、别名值带 tab 等形状修复前全部 DIFF。

块标量内容缩进边界（探针确认）：`- run: |`（头部缩进 6、键缩进 8）内容须 > 8（缩进 9/10 接受、8/7 拒绝）；顶层 `key: |` 内容须 > 0。

Oracle 侧修不了（输入文本手术被 PROJECT_BOOK §7.3 禁止），故从 TS 侧修：让 TS 拒绝 PyYAML 拒绝的 tab，走既有 `yaml_parse_error` 路径。

## 3. 改动（TS 侧，Oracle 不动）

### 3.1 `src/core/workflow-parser.ts`

- **N5**：扩展 `hasUnrepresentableKey` 的 walk——别名键经 `key.resolve(doc)` 一步解析为 Map/Seq 即返回 true；标量、不可解析/前向引用/链式别名（resolve 返回 `undefined`）一律放过（两侧已同为 `yaml_parse_error`，无需跟链）。Docstring 已更新。
- **H6**：新增 `hasRejectedTab(yamlText)`——对原始文本的小型状态机：引号状态（单/双引号，含转义，仅在 token 边界识别：行首或空格/`[`/`{`/`,` 之后）；块标量状态（在块上下文的值位置识别头部，内容按相对头部行的缩进判定，含 `- run: |` → 行缩进 + 2 与裸 `- |` → 行缩进）；注释状态至行末；flow 深度跟踪。引号标量/块标量内容/注释之外的任何 tab 返回 true。辅助函数 `isQuoteStart`、`blockScalarHeaderIndent`（模块私有）。
- 两个调用点：`parseWorkflowYaml`（`if (hasUnrepresentableKey(yamlText) || hasRejectedTab(yamlText))` → `base(false, "INVALID", [], ["yaml_parse_error"])`）。

### 3.2 `src/core/e2e.ts`

`extractJobs` 同条件 → 返回 `[]`；`hasRejectedTab` 加入其 `workflow-parser.js` 导入。

### 3.3 Fixture 与测试

- `tests/fixtures/parser-divergence/collection-alias-key/`：18 例（f01–f18）+ expected.json（note 集）+ README.md。
- `tests/fixtures/parser-divergence/tab-rejected/`：49 例（f01–f49）+ expected.json（note 集）+ README.md。两侧先跑并断言全 JSON 深相等后才冻结。
- `tests/unit/diff-boundaries/collection-alias-key.test.ts`（18 例）、`tab-rejected.test.ts`（49 例），各带完整头部注释（根因、规则、no-regression 锁定、Oracle 对照指针）。
- Trigger T6-56–T6-61（N5 块式映射锚点、N5 流式映射锚点、N5 序列锚点、H6 流式别名 tab、H6 块式别名 tab、T01 流式标量键 tab），suite 80 → 86，source `"fix-p0-06"`。
- Golden G-120–G-125（`scripts/build-golden.py` 新增 fix-p0-06 块，与 fix-p0-05 同理），suite 119 → 125。
- 计数注释同步更新：`tests/unit/event/trigger-oracle-dump.test.ts`、`trigger-suite.ts`、`scripts/oracle-diff-trigger.mjs`（80→86）、`tests/unit/golden/golden.test.ts`、`tests/unit/cli/formal-pipeline-unsupported.test.ts`、`scripts/oracle-diff.mjs`（119→125）。
- `evidence/probes/fix-p0-05/README.md` 与 `tests/fixtures/parser-divergence/flow-alias-key/README.md` 各加 FIX-P0-06 更新附录（N5/H6 已关闭；与 FIX-P0-05 为 fix-p0-04 做的附录同例）。

## 4. 探针证据

新建 `evidence/probes/fix-p0-06/`（cases.json、run-matrix.py、ts-probe-entry.ts、README、results.json）。

- 67 行 × trigger+jobs = **134/134 检查 MATCH，0 个 flagged known-divergence**。
- 修复前基线（HEAD 5133396，59 行核心）：38/118 MATCH（80 DIFF）。
- 行构成：N5 ×18、H6 ×14、T01–T25（tab 族全边界）、B1/B3/B4/B5/B6（块标量/引号/注释边界）、Q1–Q8（近似边界锁定）。
- 探针方法与 fix-p0-05 相同：esbuild 打包 TS 探针入口，TS 与 Oracle 全 JSON 深相等，trigger+jobs 两种模式。

### 4.1 自伤回归事件（Q3，诚实记录）

第一版 `hasRejectedTab` 未识别裸序列项块标量头部（`- |`）：`blockScalarHeaderIndent` 把 trim 后的文本与 `"-"` 比较时未剥离行缩进，导致其后内容行被当作普通文本扫描、其中 tab 被误拒。基线 TS 接受该文档（VALID），v1 引入了**反向分歧**（TS `yaml_parse_error` vs Oracle VALID），被探针行 X-Q3 捕获。修复：比较缩进相对文本（`line.slice(indent, i).trimEnd() === "-"`）；Q3 现为 MATCH。基线状态经 `git stash` 验证（基线 TS 对 X-Q3 返回 VALID）。此事件已记入 `evidence/probes/fix-p0-06/README.md`。

## 5. 验收实测数（全部亲自重跑，同一干净窗口）

| 命令 | 实测结果 |
|---|---|
| `npm run typecheck` | PASS（`tsc --noEmit`，无输出错误） |
| `npm test` | **1178/1178**，39 文件全部通过（基线 1085；新增 93：18 集合别名键 + 49 tab + trigger 6 + golden 6 + 其余计数测试） |
| `npm run test:oracle` | 125 fixtures，TS==expected 0 失败，Oracle==expected 0 失败，**mismatch 0，false PASS 0**，TS formal false PASS 0，unsupported 34/34 |
| `npm run oracle:diff:trigger` | 86 fixtures，**mismatch 0** |
| `npm run oracle:diff:jobs` | 48 fixtures，**mismatch 0** |
| `npm run oracle:diff:checks` | 46 fixtures，**mismatch 0** |
| `npm run oracle:diff:witness` | 44 fixtures，**mismatch 0** |
| `npm run s0:oracle` | 24/24，mismatch 0，false PASS 0，unsupported 2/2 |
| `npm run s0:gate` | **PASS**：determinism 100 runs、1 unique hash、0 mismatch；network matches 0；**gate_report_sha256 = `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`（与基线完全一致）** |
| `npm run release:verify` | **PASS**（offline scan 34 文件 0 远程引用；license guard 仍为 PENDING_SAM_DECISION；dist tree sha 变为 `8a1cee81…`——产品代码变了，属预期） |
| `python3 scripts/build-golden.py --check-only` | PASS，125 cases |
| `evidence/probes/fix-p0-06/run-matrix.py` | **134/134 MATCH**，0 flagged |
| `evidence/probes/fix-p0-05/run-matrix.py` | **76/76 MATCH**（修复前 72/76；其 2 个 flagged 行 N5/H6 现均 MATCH） |
| `evidence/probes/fix-p0-04/run-matrix.py` | **100/100 MATCH**；其中 R5 子集 66 行（前 66 行）**66/66 MATCH** |

## 6. 回归矩阵重跑（§5 已含，此处汇总）

- fix-p0-05 矩阵：76/76（N5/H6 两 flagged 行均已 MATCH；其 cases.json 的 `known_divergence` 标注保留为历史记录，未改写）。
- fix-p0-04 矩阵：100/100，R5 子集 66/66。
- fix-p0-06 矩阵：134/134，0 已知分歧。
- **无新分歧发现**：三矩阵合计 310 检查全部 MATCH；另 `? {a: b} : 1` / `? [a, b] : 1`、标量锚点、引号内 tab、块标量内 tab、注释内 tab 等 no-regression 对照全部保持一致。

## 7. 残留分歧清单

**无。** N5 与 H6 两个家族均已关闭，fix-p0-06 矩阵 0 flagged；fix-p0-05 矩阵的 2 个 flagged 行现均 MATCH；fix-p0-04 矩阵 0 非 MATCH。

诚实记录的近似（非分歧，见 `hasRejectedTab` docstring 与 §4.1）：

1. 引号起始仅在 token 边界识别；多行普通标量续行行首的 `"` 会被当作引号起始——由 Q1 行锁定（两侧一致）。
2. 块标量内容按相对头部行的缩进判定；缩进错误的内容行被当作块标量结束——由 Q2 行锁定（两侧一致）。
3. Q3 事故（§4.1）已修复并由探针锁定；基线行为经 `git stash` 验证。

以上三点均有探针行锁定，且当前矩阵全部 MATCH；若未来终审复核以更刁钻的形状探出新分歧，按同一机制家族处理。

## 8. 文件与提交

- 代码提交 `f29faec`：137 文件（src 2、scripts 3、tests/fixtures + tests/unit、evidence/probes/fix-p0-06 全套、evidence/tests 3 份报告、fix-p0-05 README + results.json、flow-alias-key README）。
- 本报告：单独提交（`handoff/P020-FIX-P0-06/TASK_REPORT.md`）。
- 未提交（预先存在，不属于本次修复）：`evidence/review/INDEPENDENT_REVIEW_R4.md`、`INDEPENDENT_REVIEW_R5.md`、`handoff/P020-T013-R4/`、`handoff/P020-T013-R5/`、`reports/`。
- 修复期间工作树独占，未与任何复核并行（R4 的污染教训）。

## 9. 下一步建议（给 parent）

1. 派 T013 R6 复核（独立 clean clone，复核 HEAD `f29faec`；须确认 fix-p0-06 矩阵 134/134 与全部验收数可独立复现）。
2. R6 通过后：T014 重新冻结 + Drive 重新归档，然后终审 R3（第 3 轮，共 5 轮上限）。
3. License 仍为 PENDING_SAM_DECISION（release:verify 已确认），终审前需 Sam 定夺。
