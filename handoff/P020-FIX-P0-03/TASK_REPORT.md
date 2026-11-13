# P020 CheckPath — FIX-P0-03 任务报告（终审 R2 P0 残留分歧定点修复）

- 任务：终审 R2 P0 的同根残留分歧（主控 10-case 探针：FIX-P0-02 只修了重复检测，未修名字渲染与值位置的字符串检查）
- 执行员：P0 残留修复执行员（全新会话，与之前所有施工/修复/复核会话隔离）
- 日期：2026-11-08（GMT 23:25–约 00:00）
- 基线：HEAD `53fa36a`（FIX-P0-02 报告 commit；tree 除未跟踪 `reports/` 外干净）
- 环境：Node v24.22.1、Python 3.12.3、PyYAML 6.0.1（与冻结环境一致）
- 范围：只做修复。未做复核、未做冻结、未动 Drive、未发终审、未改 specs、未改许可证（仍 `PENDING_SAM_DECISION`）、未改 TS 产品代码。

## 结论

**P0 残留已关闭。** 主控 10-case 探针修后 10/10 逐字段一致；扩展探针 140
cases 中 137 一致（其余 3 项为已探针的残留，见 §7）。全部验收命令 exit 0：

| 命令 | 结果 |
|---|---|
| `npm run test:oracle` | 105 fixtures（基线 84，+21），0 mismatch，0 false PASS，unsupported 32/32，exit 0 |
| `npm run oracle:diff:trigger`（附加） | 66 fixtures（基线 45，+21），0 mismatch，exit 0 |
| `npm test` | 34 文件，982/982（基线 860，+122），exit 0 |
| `npm run s0:gate` | PASS，oracle 24/24，100 runs 1 hash，`gate_report_sha256` 仍为 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`，exit 0 |
| `npm run release:verify` | PASS，license guard 仍 `PENDING_SAM_DECISION`，exit 0 |
| `npm run oracle:diff:jobs`（附加） | 48 fixtures，0 mismatch，exit 0 |
| 10-case 探针重跑 | 10/10 逐字段一致（status/errors/events/unsupported/on_key_is_string） |

## §1 ADR FIX-P0-03（全文）

### 背景

FIX-P0-02 只把布尔/null 拼写折叠进了重复检测。主控用
`/tmp/p0probe-residual/cases.json`（10 个 case）+ `run.ts`/`run.py`
在两边实测全 IR，10/10 DIFF。根因与 P0 相同：TS 的 `yaml` 解析器按
YAML 1.2 core schema 解析所有 plain 标量（布尔/null/数字），Oracle
的 `BaseLoader` 一律保留字符串。

### 决策

1. **定性：这是标量解析层问题，不是事件名规范化问题。** 事件名仍按
   大小写敏感匹配冻结支持集，不引入事件名大小写折叠；`Push:` 在两边
   仍是 unsupported_event → UNKNOWN。改 Oracle 一侧，与 TS 对齐。
2. **键位置**：plain YAML 1.2 布尔/null/数字拼写作为键进入 IR 名字时，
   按 TS 的实际渲染规范化——`true/True/TRUE`→`"true"`，
   `false/False/FALSE`→`"false"`；`null/Null/NULL`/`~`/空标量→`""`
   （探针证实，不是 `"null"`）；数字按 JS `String(number)` 渲染
   （`01`→`"1"`，`0x10`→`"16"`，`0o17`→`"15"`，`1.0`→`"1"`，
   `1e3`→`"1000"`，`.inf`→`"Infinity"`，`.nan`→`"NaN"`，
   `.5`→`"0.5"`，`1e21`→`"1e+21"`，`9007199254740993`→
   `"9007199254740992"`，即 double 精度丢失）。覆盖事件名、filter
   键、job id。引号键不规范化（`"True"` 仍是 `"True"`，两边已一致；
   显式 `!!str True` 亦然）。
3. **值位置**：`on:` 列表项、五个 stringOrList filter 字段
   （branches/branches-ignore/paths/paths-ignore/types）中，plain
   布尔/null/数字标量必须像 TS 一样视为非字符串 → INVALID，错误码与
   TS 逐字一致（`on_list_item_not_string`、
   `filter_not_string_or_list:<字段>`）。只改 Oracle 一侧；区分
   plain 与引号标量（`"True"` 是合法字符串）靠 loader 层的节点
   tag 信息（见 §3.1 的 resolver 机制）。
4. **plain null 作 filter 标量值时不是 INVALID**：TS 的
   `stringOrList(null)` 返回 null，即“无此 filter”（VALID，字段
   null）——`branches: null`、`branches: ~`、空 `branches:` 三者皆
   如此；只有作为列表项时 null 才是 INVALID。探针证实，照此实现。
5. **数字一并修**：探针证实数字分歧与布尔/null 同一机制（core-schema
   标量解析 + JS 渲染），故一并修，包括数字重复键折叠（`1` vs
   `01` vs `1.0`、`0x10` vs `16`、`-0` vs `0` 各为一键）与 JS
   对象键顺序（见 6）。
6. **JS 对象键顺序**：TS 侧用 `Object.entries`/`Object.keys` 枚举
   解析出的对象，整数索引键（`"0"`..`"4294967294"`）先行、按数值
   升序，其余键保持文件顺序。Oracle 迭代映射时按同一规则重排
   （`on` 映射、事件 config 映射、jobs 映射），否则 `10:` 在前、
   `2:` 在后的输入两边事件顺序不同（探针 O2/O3/O4/O5/O6）。
7. **NaN 特例**：`.nan:` + `.nan:` 在 TS 侧不是重复键（`NaN !== NaN`，
   `uniqueKeys` 不报错），JS 对象把两者塌成一个 `"NaN"` 键、后值胜出
   （UNKNOWN，`branches: [dev]`）。Oracle 侧每个 NaN 键给一个全新
   身份、永不判重，构造出的 dict 同样塌成一个 `"NaN"` 键、后值胜出。
8. **不折叠**：`on`/`off`/`yes`/`no` 及其大小写变体（core schema 下是
   字符串）；`0b101`、`1_000`、`1:30`、`+.nan`、`+0x10`、
   `0o8`、`1e` 亦然（全部探针证实两边已一致为字符串）。
9. **显式标签与引号**：`!!str True` 与 `"True"` 都是字符串，不参与
   折叠/渲染；`!!bool true` 渲染 `"true"`。机制上靠 PyYAML 的隐式
   resolver 只对 plain 标量生效、显式标签优先（§3.1）。

### 后果

- 10 个主控探针 case 全部逐字段一致；扩展探针 140 cases 中 137
  一致（§2）。
- 夹具三层新增 21 组（trigger T6-21..T6-41、golden G-85..G-105、
  parser-divergence s01..s21），另有 15 个 jobs 标量渲染 parity
  锁（`scalar-rendering-jobs`，未进 T7 套件——T7 条目按位置映射
  golden G-41..，加条目会整体重编号；锁放在单元测试里）。
- 探针发现三组此前未记录的同根分歧并顺带修复：filter 空/null 标量
  值（F3/F4/F20）、事件 config 的引号空串与 plain null（Q7/Q8/Q9）、
  以及 jobs 的 `if`/`needs`/`name` 标量渲染（§2.2）。

## §2 探针结果（实现前实测，非假设）

探针方法：TS 侧用 esbuild 打包 `src/core/workflow-parser.ts` 的
`parseWorkflowYaml`（CJS bundle，node 运行）与 `src/core/e2e.ts` 的
`extractJobs`；Oracle 侧直接调 `oracle/checkpath_oracle/parser.py`
的 `parse_workflow_yaml` / `extract_jobs`。探针输入与脚本保留在
`/tmp/p0probe-residual/`（临时目录，不随仓库提交：`cases.json` /
`cases2.json` / `cases3.json` / `cases4.json` /
`jobs-cases.json`、`run*.ts` / `run*.py` / `run*.cjs` /
`ts*.json` / `oracle*.json`）。下表 status/errors/events 为两边实测值。

### 2.1 主探针（修前，10/10 DIFF；修后 10/10 一致，见 §2.6）

| # | 输入 | TS（修前） | Oracle（修前） |
|---|---|---|---|
| R1 | 单个 `True:` 事件 | UNKNOWN / `["true"]` / unsupported_event:true | UNKNOWN / `["True"]` / unsupported_event:True |
| R2 | 单个 `FALSE:` 事件 | UNKNOWN / `["false"]` | UNKNOWN / `["FALSE"]` |
| R3 | `True:` + `FALSE:` | UNKNOWN / `["true","false"]` | UNKNOWN / `["True","FALSE"]` |
| R4 | 单个 `Null:` 事件 | UNKNOWN / `[""]` | UNKNOWN / `["Null"]` |
| R5 | 单个 `~:` 事件 | UNKNOWN / `[""]` | UNKNOWN / `["~"]` |
| R6 | filter 键 `push: {True: [main]}` | UNKNOWN / unsupported_filter:true | UNKNOWN / unsupported_filter:True |
| R7 | `on: [True, push]` | INVALID / on_list_item_not_string / events [] | UNKNOWN / events [True, push] |
| R8 | `push: {branches: [True]}` | INVALID / filter_not_string_or_list:branches | VALID / branches ["True"] |
| R9 | `pull_request: {types: [True]}` | INVALID / filter_not_string_or_list:types | VALID / types ["True"] |
| R10 | 单个 `TRUE:` 事件 | UNKNOWN / `["true"]` | UNKNOWN / `["TRUE"]` |

### 2.2 扩展探针 A（null/数字/值位置，修前 12/55 一致、43 DIFF；修后 53/55，仅剩 N3/K5 两项裸空键残留）

| # | 输入 | TS | Oracle（修前） | 结论 |
|---|---|---|---|---|
| N1/N2 | `null:` / `NULL:` 单事件 | UNKNOWN / `[""]` | UNKNOWN / `["null"]` / `["NULL"]` | null 渲染为空串（规则确认） |
| N3 | 裸空键 `:` 单事件 | UNKNOWN / `[""]` | **INVALID / yaml_parse_error** | PyYAML 解析器拒裸空键（遗留 §7-1） |
| N4/N5 | `"Null":` / `"true":`（引号） | 与 Oracle 相同 | 相同 | 引号键不规范化 |
| E1/E4/E10/E11 | `1:` / `1.5:` / `1_000:` / `-1:` 事件 | 与 Oracle 相同 | 相同 | 已规范的数字拼写 / 非 core 拼写 |
| E2/E3/E5/E6/E7/E8/E9 | `01:` / `1.0:` / `0x10:` / `0o17:` / `1e3:` / `.inf:` / `.nan:` 事件 | `["1"]` / `["1"]` / `["16"]` / `["15"]` / `["1000"]` / `["Infinity"]` / `["NaN"]` | 保留原拼写 | 数字渲染分歧，同机制修 |
| D1/D2 | `1:`+`01:` / `1:`+`1.0:` | INVALID / yaml_parse_error | UNKNOWN，2 事件 | 数字重复键折叠 |
| D3 | `true:` + `1:` | UNKNOWN，事件顺序 `["1","true"]` | UNKNOWN，顺序 `["true","1"]` | JS 整数索引键在先（ADR §1-6） |
| K1 | filter 键 `1:` | 相同（`unsupported_filter:1`） | 相同 | 已规范 |
| K2/K3/K4 | filter 键 `01:` / `1.0:` / `null:` | `unsupported_filter:1` / `:1` / `:`（空） | 保留原拼写 | 同 R6 |
| K5 | filter 裸空键 `:` | UNKNOWN / unsupported_filter:（空） | **INVALID / yaml_parse_error** | 同 N3（遗留 §7-1） |
| V1/V2/V3 | `on: True` / `on: 1` / `on: null` | INVALID / on_value_invalid | UNKNOWN（当作事件名） | on 标量值须判类型 |
| V4/V5/V7 | `on: [1, push]` / `[null, push]` / `[1.5, push]` | INVALID / on_list_item_not_string | UNKNOWN | 同 R7 |
| V6 | `on: ["True", push]` | 与 Oracle 相同 | 相同 | 引号列表项是字符串 |
| F1/F2/F5/F6/F7/F8/F9/F10/F11/F15 | filter 标量/列表值 `1` / `True` / `[1]` / `[01]` / `[1.0]` / `[0x10]` / `[1.5]` / `[.inf]` / `[1e3]` / `[False]` | INVALID / filter_not_string_or_list | VALID（当作字符串） | 同 R8/R9 |
| F3/F4 | `branches: null` / `branches: ~` | VALID，branches null | VALID，branches `["null"]` / `["~"]` | null 标量值 = 无 filter |
| F12/F13 | `branches: [null]` / `[~]` | INVALID / filter_not_string_or_list | VALID | 列表项 null 不是字符串 |
| F14 | `branches: ["1"]` | 与 Oracle 相同 | 相同 | 引号是字符串 |
| F16/F17/F18/F19/F21 | `types: [1]` / `paths: [1]` / `branches-ignore: [True]` / `paths-ignore: [null]` / `[main, True]` | INVALID / filter_not_string_or_list | VALID | 五个字段全覆盖 |
| F20 | `branches:`（空值） | VALID，branches null | UNKNOWN / unsupported_glob:（空） | 空标量 = null，不是 `[""]` |
| C1/C2/C3 | `push: True` / `push: 1` / `push:`（空） | 与 Oracle 相同 | 相同 | config 非映射已一致；空 config 折叠已一致 |

### 2.3 扩展探针 B（数字拼写与键顺序，修前 6/27 一致、21 DIFF；修后 27/27 一致）

| # | 输入 | TS | Oracle（修前） | 结论 |
|---|---|---|---|---|
| O1/O7 | `2:`+`10:`+`push:` / `0:`+`1:` | 与 Oracle 相同 | 相同 | 文件顺序恰与 JS 顺序一致 |
| O2/O3/O4/O5/O6 | `10:`+`2:` / filter 键 `10:`+`2:` / `1.5:`+`1:` / `push:`+`1:` / `-1:`+`1:` | 整数索引键在先（`["2","10"]` 等） | 文件顺序 | JS 键顺序（ADR §1-6） |
| X1/X12/X15/X18 | `0b101:` / `1e-7:` / `0.00001:` / `branches: [0b101]` | 与 Oracle 相同 | 相同 | 非 core 拼写是字符串；`1e-7` 与 `0.00001` 的拼写恰与 JS 渲染相同 |
| X2/X3/X4/X5/X6/X7/X8/X9/X10/X11/X16/X17 | `.5:` / `5.:` / `1.00:` / `0x1F:` / `+1:` / `00:` / `1E3:` / `-.inf:` / `.Inf:` / `.NAN:` / `-0:` / `1.0e2:` | `["0.5"]` / `["5"]` / `["1"]` / `["31"]` / `["1"]` / `["0"]` / `["1000"]` / `["-Infinity"]` / `["Infinity"]` / `["NaN"]` / `["0"]` / `["100"]` | 保留原拼写 | 数字渲染全覆盖 |
| X13/X14 | `1e21:` / `9007199254740993:` | `["1e+21"]` / `["9007199254740992"]` | 保留原拼写 | JS 指数记法 / double 精度丢失 |
| X19/X20 | `branches: [.5]` / `on: [-1, push]` | INVALID / filter_not_string_or_list:branches；INVALID / on_list_item_not_string | VALID / UNKNOWN | 值位置数字 |

### 2.4 扩展探针 C（边界：NaN/Inf 重复、引号空串、显式标签，修前 17/28 一致、11 DIFF；修后 28/28 一致）

| # | 输入 | TS | Oracle（修前） | 结论 |
|---|---|---|---|---|
| Q1/Q3 | `.nan:`+`.nan:` / `.nan:`+`.NaN:` | UNKNOWN，1 事件 `["NaN"]`（branches `[dev]`，后值胜出） | Q1 INVALID（原样重复键）；Q3 UNKNOWN，2 事件 | NaN 永不判重 + 塌键后值胜出（ADR §1-7） |
| Q2 | `.inf:`+`.inf:` | INVALID / yaml_parse_error | INVALID | 已一致（Infinity 相等） |
| Q4 | `-0:`+`0:` | INVALID / yaml_parse_error | UNKNOWN，2 事件 | `-0` 与 `0` 同键 |
| Q5 | `.inf:`+`-.inf:` | UNKNOWN，`["Infinity","-Infinity"]` | UNKNOWN，保留原拼写 | 正负无穷不同键 |
| Q6/Q10/Q11/Q26 | `on: "null"` / `branches: ["null"]` / `branches: "True"` / `on: "1"` | 与 Oracle 相同 | 相同 | 引号标量是字符串 |
| Q7 | `push: ""`（引号空串） | INVALID / event_config_not_mapping | VALID（当作无 config） | 只有 null-kind 才折叠为空 config |
| Q8/Q9 | `push: null` / `push: ~` | VALID（无 config） | INVALID / event_config_not_mapping | 同上（反向） |
| Q12–Q19/Q22/Q23 | `+0x10:` / `-0x10:` / `0o8:` / `08:`→`["8"]` / `0.:`→`["0"]` / `1e:` / `+.nan:` / `-.nan:` / `0x:` / `1:30:` | 见表（Q15 `08`→`8`、Q16 `0.`→`0` 为分歧，其余已一致） | — | `08` 是十进制 8；`0.` 是浮点 0 |
| Q20/Q21 | `!!str True:` / `!!bool true:` | 与 Oracle 相同 | 相同 | 显式标签优先（ADR §1-9） |
| Q24/Q25 | `0o17:`+`15:` / `0x10:`+`16:` | INVALID / yaml_parse_error | UNKNOWN，2 事件 | 八/十六进制与十进制同键 |
| Q27/Q28 | `"true":`+`true:` / `true:`+`"true":` | UNKNOWN，1 事件 `["true"]`（后值胜出） | 相同 | 引号与 plain 不同键，但渲染后塌成一键 |

### 2.5 JS 数字渲染核对

`_js_number_to_string`（ECMA-262 Number::toString：最短往返数字，
`-6 < p <= 21` 时十进制记法，否则指数记法，指数带 `+`、不补零）
与 Node 实测 15/15 一致：`1e21`→`"1e+21"`、`1e20`→
`"100000000000000000000"`、`1e-6`→`"0.000001"`、`1e-7`→`"1e-7"`、
`2.5e-7`→`"2.5e-7"`、`0.00001`→`"0.00001"`、`123456789.123`、
`1.5`、`1000`、`0.1`、`1e16`→`"10000000000000000"`、`5e-324`→
`"5e-324"`、`1.2345678901234568e20`→`"123456789012345680000"`、
`0.5`、`9007199254740992`。

### 2.6 修后复测（全部探针 case，与 TS 逐项一致）

| 探针集 | 修后 |
|---|---|
| 主探针 R1–R10 | 10/10 一致 |
| 扩展 A（cases2，55） | 53/55；仅 N3/K5（裸空键，遗留 §7-1） |
| 扩展 B（cases3，27） | 27/27 一致 |
| 扩展 C（cases4，28） | 28/28 一致 |
| jobs（20） | 19/20；仅 J20（遗留 §7-3） |
| 合计 | 137/140 |

另验证 PyYAML 节点 tag：plain 标量按 core-schema 得
`bool`/`null`/`int`/`float`/`str` tag，引号标量恒为 `str`，
`!!str True` 为 `str`，`!!bool true` 为 `bool`；空 plain 标量得
`null` tag（resolver 的 `''` 首字符桶）。

### 2.7 终审 R2 输入逐字段核对（修后，与 FIX-P0-02 §2.4 相同输入）

输入 `on: {True: {branches: [main]}, true: {branches: [dev]}}`：
TS 与 Oracle 均为 INVALID / `yaml_parse_error` / events `[]`
（复核方式：dup-bool-true 夹具 + `npm run test:oracle` 105/105；
探针 R1–R10 已覆盖该输入的渲染侧）。

## §3 改动清单（Oracle 侧唯一改动点；TS 产品代码未动）

### 3.1 `oracle/checkpath_oracle/parser.py`（唯一产品代码改动）

- 新增 `_TScalar(str)`：字符串值即 TS 侧渲染，`core_kind` 记录
  core-schema 种别（`string`/`bool`/`null`/`int`/`float`）。`str`
  子类：相等、哈希、JSON 序列化与 `str` 完全相同，下游无感知。
- 新增 core-schema 正则（`_CORE_BOOL_PATTERN` /
  `_CORE_NULL_PATTERN` / `_CORE_INT_PATTERN` /
  `_CORE_FLOAT_PATTERN`）并在 `_StrictBaseLoader` 上注册为隐式
  resolver（int 先于 float 注册；null 含 `''` 首字符桶，覆盖空
  plain 标量）。PyYAML 只对 plain 标量应用隐式 resolver，显式
  标签优先，引号标量恒为 `str`——因此无需 style 判断，且
  `!!str True` 不会被误折叠。
- 新增 `_construct_core_scalar`（为 `str`/`bool`/`null`/`int`/
  `float` 五个 tag 注册）：bool→`"true"`/`"false"`，null→`""`，
  int→`_render_int_spelling`（2^53 内原样，之外走 double 渲染，
  超出 double 范围为 `±Infinity`），float→`_parse_float_spelling`
  + `_js_number_to_string`。
- `_duplicate_key_canonical` 改为按节点 tag 折叠：bool→
  `("bool", True/False)`，null→`("null", None)`，int/float→
  `("num", <JS number>)`（`1`/`01`/`1.0`/`0x10`/`16` 同键），
  NaN→`("nan", object())`（全新身份，永不判重）；其余→
  `("str", <渲染>)`。
- 新增 `_js_object_key_order`：整数索引键先行升序，其余保持文件
  顺序；用于 `on` 映射、事件 config 映射、jobs 映射的迭代。
- `_string_or_list` 改写：null-kind 标量→`None`（无 filter），
  bool/int/float-kind 标量或列表项→`"INVALID"`，string-kind→
  字符串；其余逻辑未动。
- `parse_workflow_yaml`：`on` 标量值非 string-kind→
  `on_value_invalid`；`on` 列表项非 string-kind→
  `on_list_item_not_string`；事件 config 只当 null-kind 才折叠为
  `None`（引号 `""` 不再误折叠，Q7/Q8/Q9）；unsupported filter
  键按 JS 顺序迭代。
- `extract_jobs`：jobs 按 JS 顺序迭代；job id 即渲染键；`name`
  仅 string-kind 保留，否则 `None`；`needs` 空/null→`[]`，标量
  bool/number→`[渲染]`，列表项 null→`__invalid_needs__`；
  `if` 空/null→`None`，bool/number→渲染字符串。
- 两个实现中的小插曲（均已修好并回归）：初版 `_duplicate_key_canonical`
  的 float 分支用 `float('.inf')`（Python 不接受 `.inf` 拼写，
  ValueError）→ 新增 `_parse_float_spelling`；初版 NaN 判重用了
  `("num", math.nan)`，CPython 的 identity 快捷比较让两个 NaN
  元组相等而误判重复 → 改为每键一个全新 `object()` 身份。

### 3.2 夹具（三层，按 FIX-P1-01/FIX-P0-02 既有模式）

- (a) parser-divergence 新目录
  `tests/fixtures/parser-divergence/scalar-rendering/`：21 个
  `.yml`（s01..s21，与 trigger T6-21..T6-41 一一对应）+
  `expected.json`（两边 status/errors/全 events，生成前先由 TS 与
  Oracle 双跑核对一致才写入）+ `README.md`。
- (b) trigger 夹具 `tests/fixtures/trigger/T6-21-…` … `T6-41-…`
  （各含 `workflow.yml` + `scenario.json` + `required-checks.json`，
  后两者照抄 T6-20 的 push 场景与 `test` 检查）+
  `tests/fixtures/trigger/suite.json` 增加 21 条（`source:
  fix-p0-03`，45 → 66）。
- (c) golden 夹具 `tests/fixtures/golden/G-85-…` …
  `G-105-…`（`expected.json` 由 Oracle 自身生成，见 §3.3）+
  `tests/fixtures/golden/suite.json` 增加 21 条（84 → 105）。
- (d) jobs 锁：`tests/fixtures/parser-divergence/scalar-rendering-jobs/`
  15 个 `.yml`（J1/J2/J4/J5/J7/J9/J10/J11/J12/J13/J14/J15/J16/J17/J18）
  + 新测试 `tests/unit/job-dag/scalar-rendering-jobs.test.ts`（TS
  `extractJobs` 与 Oracle `extract_jobs` 逐项相等）。未进 T7 套件：
  T7 条目按位置映射 golden G-41..，加条目会整体重编号。

### 3.3 `scripts/build-golden.py`（生成器扩展，与 FIX-P1-01 同法）

- 增加 `fix-p0-03` 生成区块（trigger `source == "fix-p0-03"` →
  `G-85` 起），其余逻辑未动。重建前 `build-golden.py --check-only`
  如预期失败（`CHECK FAILED: golden dir differs from regeneration`，
  golden cases: 105）；重建后 `--check-only` exit 0（105 cases）；
  `git diff` 证实既有 84 个夹具字节级未变，只有 `suite.json`
  +315 行与 21 个新目录。
- 新增 `scripts/oracle-jobs-probe.py`（`extract_jobs` 探针驱动，
  照抄 `oracle-parse-probe.py` 的结构）。

### 3.4 测试与计数同步

- 新测试 `tests/unit/diff-boundaries/scalar-rendering-yaml.test.ts`
  （22 tests：21 cases + schema/文件清单）与
  `tests/unit/job-dag/scalar-rendering-jobs.test.ts`（16 tests：
  15 cases + 文件清单）。
- `tests/unit/event/trigger-suite.ts`、`tests/unit/event/trigger-oracle-dump.test.ts`
  （含 `sources` 断言增加 `"fix-p0-03": 21`）、`scripts/oracle-diff-trigger.mjs`：
  trigger 计数注释/断言 45 → 66。
- `tests/unit/golden/golden.test.ts`、`tests/unit/cli/formal-pipeline-unsupported.test.ts`、
  `scripts/oracle-diff.mjs`（含分解式）：golden 计数 84 → 105。
- **未动**：`tests/unit/diff-boundaries/duplicate-key-yaml.test.ts`
  （4 cases 仍全过）、`tests/unit/witness/witness-oracle-dump.test.ts`
  （52 tests 全过）、T7 jobs 套件（见 §3.2(d)）。
- **Oracle 侧无自有 pytest 套件**：仓库内无任何 Python 测试文件（仅 vitest +
  diff runners），故无 pytest 可扩展；Oracle 覆盖靠 `test:oracle` /
  `oracle:diff:trigger` / `oracle:diff:jobs` 与两组 parity 单元测试。

### 3.5 验收运行再生的 evidence 报告（随修复提交）

- `evidence/tests/ORACLE_PARITY_REPORT.json`：84 → 105（`passed: 105`，
  mismatches 仍 `[]`）。
- `evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`：45 → 66（`passed: 66`，
  mismatches 仍 `[]`）。
- `evidence/S0_GATE.json` 与
  `evidence/s0/S0_DETERMINISM_REPORT.json`：修后重跑后与 HEAD
  字节一致（`git status` 无修改；gate hash 不变，见 §5）。

### 3.6 回归面核对

- 正常事件名（push/pull_request/merge_group）、`on` 字符串键、`on`
  列表形式、dup-branches/dup-event/dup-name、dup-bool-true（G-84/T6-20）：
  行为与修前完全一致——旧夹具、expected 与测试未改动且全过；
  `npm test` 其余 27 个文件计数与基线逐项一致（仅 §5 的 +122
  分解文件有变化）；探针 P3a/P3b/P5/P6/Q5 类（`On`/`yes`/`Push`/
  `1_000`/`0b101` 等）证实非 core 拼写修前修后一致。

## §4 提交

（报告单独一 commit；以下为实际提交记录。）

1. `c24972b` — `FIX-P0-03: Oracle scalar rendering per YAML 1.2 core
   (bool/null/number) — residual R2 P0 divergence closed` —
   §3.1–§3.5 的全部改动（200 files, +6212/−91）。
2. （本 commit）— `FIX-P0-03: handoff report TASK_REPORT.md` —
   本报告单独一 commit。

完工时 HEAD 干净（除预先存在、未跟踪的 `reports/` 外）。

## §5 验收命令实际输出（逐字抄录，亲自运行）

### `npm run test:oracle` — exit 0

```text
suite: tests/fixtures/golden/suite.json
fixtures: 105, TS==expected exit=0, Oracle==expected exit=0, formal TS exit=0
TS vs Oracle mismatches: 0
false PASS: 0
TS formal-pipeline false PASS: 0
unsupported surfaced as UNKNOWN: 32/32 fixtures
report: evidence/tests/ORACLE_PARITY_REPORT.json
```

### `npm run oracle:diff:trigger`（附加）— exit 0

```text
suite: tests/fixtures/trigger/suite.json
fixtures: 66, TS exit=0, Oracle exit=0
TS vs Oracle mismatches: 0
report: evidence/tests/T006_ORACLE_TRIGGER_REPORT.json
```

### `npm test` — exit 0（860 → 982，+122）

```text
Test Files  34 passed (34)
     Tests  982 passed (982)
```

+122 分解（基线为 `53fa36a` 的干净 worktree 实测，非自报——
test:oracle 与 trigger diff 在改动前已跑过基线；npm test /
s0:gate / release:verify 的基线由 FIX-P0-02 报告在同一 HEAD
实测为 860/860、gate hash `f511a847…`、release:verify PASS）：

| 文件 | 基线 | 修后 | 变化 |
|---|---|---|---|
| `tests/unit/golden/golden.test.ts` | 86 | 107 | +21（G-85..G-105） |
| `tests/unit/event/trigger-oracle-dump.test.ts` | 46 | 67 | +21（T6-21..T6-41） |
| `tests/unit/cli/formal-pipeline-unsupported.test.ts` | 171 | 213 | +42（G-85..G-105 × 主差分 + two-path lock） |
| `tests/unit/diff-boundaries/scalar-rendering-yaml.test.ts` | — | 22 | +22（新文件：21 cases + schema/文件清单） |
| `tests/unit/job-dag/scalar-rendering-jobs.test.ts` | — | 16 | +16（新文件：15 cases + 文件清单） |
| `tests/unit/diff-boundaries/duplicate-key-yaml.test.ts` | 5 | 5 | 0 |
| `tests/unit/witness/witness-oracle-dump.test.ts` | 52 | 52 | 0（未受影响） |
| 其余 27 个文件 | — | — | 0（逐项比对无变化；其余文件合计 500，与基线一致） |

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

`gate_report_sha256` 与任务给定值
`f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386` **逐字一致**。
确定性日志 100/100 全为同一 hash，无 FAILED 迭代（`evidence/s0/logs/s0-determinism.log`
`grep -c`：100 行 `mismatches=0 hash=b39c0de…`，0 行 FAILED）。
expanded static network check 由 45 变为 46 个文件（新增
`scripts/oracle-jobs-probe.py`），0 matches。

### `npm run release:verify` — exit 0

```text
[4/5] offline static scan (dist + generated reports)
  PASS offline static scan: 34 files scanned, 0 remote resource references
[5/5] license guard
  PASS license guard: no LICENSE file; LICENSE_STATUS.md still PENDING_SAM_DECISION
release:verify PASS
```

### `npm run oracle:diff:jobs`（附加）— exit 0

```text
suite: tests/fixtures/jobs/suite.json + tests/fixtures/s0/job-check/suite.json
fixtures: 48, TS exit=0, Oracle exit=0
TS vs Oracle mismatches: 0
report: evidence/tests/T007_ORACLE_JOBS_REPORT.json
```

（`evidence/tests/T007_ORACLE_JOBS_REPORT.json` 修后与 HEAD 字节一致，
无修改——jobs 提取改动未造成任何回归。）

### 10-case 探针最终重跑 — 10/10 一致

（§2.6；TS 与 Oracle 全 IR 逐字段一致，见 §6 对照表。）

### 基线说明（一次重叠事故）

基线验收命令在改动前已全部发出：`test:oracle`（84/0）与
`oracle:diff:trigger`（45/0）在前台跑完、exit 0；`npm test` +
`s0:gate` + `release:verify` 以一条后台命令发出。但后台的
`s0:gate` 与本人的 parser 编辑窗口重叠：其 100 次确定性迭代的
前 9 次恰逢 parser.py 两次短暂损坏的中间态（`float('.inf')`
ValueError、`_resolve_scalar_node` NameError），`oracle_exit=1`、
hash `FAILED`，导致该次 gate 判 FAIL
（`gate_report_sha256=163d87a5…`），第 10–100 次全部恢复正常
（hash `b39c0de1…`）。该 FAIL 是编辑窗口重叠造成的人为事故，
不是回归——§5 的 `s0:gate` 为修后干净重跑（PASS，
`gate_report_sha256` 仍为 `f511a847…`），以它为准；且重跑后
`evidence/S0_GATE.json` 与 `evidence/s0/S0_DETERMINISM_REPORT.json`
与 HEAD 字节一致。
基线 `npm test` 860 亦以 FIX-P0-02 在同一 HEAD 的实测为准；
基线后台任务交付的输出亦证实基线 `s0:gate` PASS（同一
`f511a847…`）与 `release:verify` PASS。

## §6 P0 残留如何关闭

- 根因：Oracle 用 `BaseLoader` 全字符串解析，而 TS `yaml` 2.x 先
  按 YAML 1.2 core schema 解析标量、再按 JS 语义使用；FIX-P0-02
  只在重复检测里做了折叠，构造出的名字与值位置仍保留原始拼写。
- 修复：Oracle 在 loader 层按同一 core schema 解析并按 JS 渲染
  （§3.1），只改 Oracle 一侧；TS 未动。
- 证据链：探针（§2，140 cases）→ 夹具三层（§3.2）→ 生成器可重建
  （§3.3）→ 五条验收命令 + trigger/jobs 对照全部 exit 0 且
  0 mismatch（§5）→ 10-case 探针逐字段一致（下表）。
- 未动用任何禁止手段：无测试删除、无 Oracle 比较范围缩小、无
  mismatch 忽略名单、无 P0 改 P2、无 specs 改动、无许可证改动、无
  Drive 操作、无 T013/T014、无终审发送。

### 10 个探针 case 修后对照表（最终重跑，全 IR 逐字段一致）

| # | 输入 | TS | Oracle |
|---|---|---|---|
| R1 | 单个 `True:` 事件 | UNKNOWN / `[]` / `["true"]` / unsupported_event:true | 相同 |
| R2 | 单个 `FALSE:` 事件 | UNKNOWN / `[]` / `["false"]` / unsupported_event:false | 相同 |
| R3 | `True:` + `FALSE:` | UNKNOWN / `[]` / `["true","false"]` / unsupported_event:true,false | 相同 |
| R4 | 单个 `Null:` 事件 | UNKNOWN / `[]` / `[""]` / unsupported_event:（空） | 相同 |
| R5 | 单个 `~:` 事件 | UNKNOWN / `[]` / `[""]` / unsupported_event:（空） | 相同 |
| R6 | filter 键 `push: {True: [main]}` | UNKNOWN / `[]` / `["push"]` / unsupported_filter:true | 相同 |
| R7 | `on: [True, push]` | INVALID / `[on_list_item_not_string]` / `[]` | 相同 |
| R8 | `push: {branches: [True]}` | INVALID / `[filter_not_string_or_list:branches]` / `[]` | 相同 |
| R9 | `pull_request: {types: [True]}` | INVALID / `[filter_not_string_or_list:types]` / `[]` | 相同 |
| R10 | 单个 `TRUE:` 事件 | UNKNOWN / `[]` / `["true"]` / unsupported_event:true | 相同 |

（字段顺序：status / errors / events（名字）/ unsupported；
`on_key_is_string` 两边均为 true；events 的其余字段亦逐字段一致，
由探针脚本的全 dict 比较核对。）

## §7 遗留项

1. **裸空键（N3/K5，未修；PyYAML 解析器限制）**：行内只有一个
   `:` 的空键，TS `yaml` 接受（null 键 → `""`），PyYAML 解析器在
   compose 之前就报错（`expected <block end>, but found ':'`），
   Oracle 只能返回 INVALID / `yaml_parse_error`。现实的 null 拼写
   （`null`/`Null`/`NULL`/`~`）全部已修；只有裸 `:` 拼写分歧。
   修它需要换 YAML 解析器或对输入文本做手术，二者都超出本任务
   范围。真实 workflow 中几乎不会出现裸空键。
2. **超大整数精度（已探针，未单独立夹具）**：`9007199254740993:`
   渲染 `"9007199254740992"`（double 精度丢失），实现与 TS 一致；
   超出 double 范围的整数拼写（如 400 位数字）渲染为
   `"Infinity"`，与 TS 的 `Number()` 行为一致，未立夹具（形状
   过于病态）。
3. **标量 job 定义的 `unsupported_job` 字段（J20，未修；TS 侧形状
   差异）**：`jobs: {test: True}` 时 TS 的 `extractJobs` 省略
   `unsupported_job` 字段，Oracle 输出含 `unsupported_job: null`。
   与标量渲染无关、修前已存在，改它需动 TS 产品代码或改 Oracle
   输出形状，超出本任务范围；无任何现有夹具覆盖该形状。
4. **无 Oracle pytest 套件**：见 §3.4；Oracle 覆盖靠 vitest + diff
   runners。
5. **后续步骤（不在本任务内）**：T013 独立复核（R4）→ T014 正式重新冻结 →
   终审 R3（仍在同一终审对话）。本修复未触碰冻结产物（`source.zip` /
   `dist.zip` / manifest 仍为 R2 冻结值），终审 R3 需基于重新冻结后的包复核。
6. **探针脚本未入仓库**：`/tmp/p0probe-residual/` 下的 probe 脚本与
   case 定义为临时文件（VM 重启即失），探针结果已全文记入本报告
   §2；如需复现，按 §2 方法（esbuild CJS bundle + 直接调
   `parse_workflow_yaml` / `extract_jobs`）即可重建。
7. **时间**：全部工作在 Sam 电脑关机时间（约 07:02 GMT 2026-11-09）前完成，
   未做跨越关机时间的长运行；未使用 WorkBuddy/Qoder 路由（本地执行，无需
   模型调用）。
