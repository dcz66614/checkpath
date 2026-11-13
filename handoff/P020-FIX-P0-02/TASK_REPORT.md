# P020 CheckPath — FIX-P0-02 任务报告（终审 R2 P0 定点修复）

- 任务：终审 R2 唯一阻断项 P0（`True:` vs `true:` 布尔键大小写分歧）的定点修复
- 执行员：P0 定点修复执行员（全新会话，与之前施工/修复/复核会话隔离）
- 日期：2026-11-08（GMT 23:12–23:30 左右）
- 基线：HEAD `f4bc39c`（T014 正式重新冻结 R2；tree 除未跟踪 `reports/` 外干净）
- 环境：Node v24.22.1、Python 3.12.3、PyYAML 6.0.1（与冻结环境一致；终审 GPT 环境 Node 22.16.0 / Python 3.13.5 / PyYAML 6.0.3 不同，仅作参考）
- 范围：只做修复。未做复核、未做冻结、未动 Drive、未发终审、未改 specs、未改许可证（仍 `PENDING_SAM_DECISION`）、未改 TS 产品代码。

## 结论

**P0 已关闭。** 终审复现输入在 TS 与 Oracle 两边逐字段一致，均为
`INVALID` / `yaml_parse_error` / `events []`。全部验收命令 exit 0：

| 命令 | 结果 |
|---|---|
| `npm run test:oracle` | 84 fixtures，0 mismatch，0 false PASS（两边），unsupported 19/19，exit 0 |
| `npm test` | 32 文件，860/860（基线 855，+5），exit 0 |
| `npm run s0:gate` | PASS，oracle 24/24，100 runs 1 hash，`gate_report_sha256` 不变（见 §5），exit 0 |
| `npm run release:verify` | PASS，license guard 仍 `PENDING_SAM_DECISION`，exit 0 |
| `npm run oracle:diff:trigger`（附加） | 45 fixtures，0 mismatch，exit 0 |
| `python3 scripts/build-golden.py --check-only`（附加） | exit 0，golden cases 84 |

## §1 ADR FIX-P0-02（全文）

### 背景

终审 R2 从最终冻结包实际复现：同一输入（`on:` 下 `True: branches:[main]`
与 `true: branches:[dev]`），TypeScript 正式解析器判 INVALID
（`yaml_parse_error`，events 为空），Python Oracle 判 UNKNOWN（errors 为空，
events 2 个）。R3 将其定为非阻断 P2 的理由（两边均 fail-closed、无 false PASS
风险）被终审驳回：PROJECT_BOOK §7.3、IMPLEMENTATION_PLAN §8.1（不得增加忽略字段
白名单）、§10（P0 明确包含 Oracle mismatch）为硬性约束。

### 决策

1. **定性**：`True:` 与 `true:` 属同一 YAML key。TS 用 `yaml` 2.x（YAML 1.2
   core schema，PROJECT_BOOK §7.2）：`true|True|TRUE` 均解析为布尔 true，
   `false|False|FALSE` 为布尔 false；包默认 uniqueKeys 拒绝解析后重复的键 →
   `yaml_parse_error` → INVALID。Oracle 的 `_StrictBaseLoader`（BaseLoader，
   全标量字符串）把两者当不同字符串键 → 两 unsupported 事件 → UNKNOWN。
   **改 Oracle 一侧，与 TS 对齐。**
2. **对齐结果：两边都 INVALID**（`yaml_parse_error`，events `[]`）。理由：该
   workflow 是重复键的畸形 YAML（GitHub Actions 同样会拒绝）；且沿用 FIX-P1-01
   的先例（Oracle 必须拒绝 TS 拒绝的东西）。另一方向（两边 UNKNOWN）要求 TS
   放弃 YAML 1.2 core-schema 解析，与 §7.2 mandated 的解析器冲突，不采纳。
3. **折叠集合只能是 YAML 1.2 core-schema 布尔拼写**：`true/True/TRUE`、
   `false/False/FALSE`。**绝不折叠 `on`/`off`/`yes`/`no`/`Yes`/`No`**——1.2
   core 下它们不是布尔，§7.3 明确要求 Oracle 保持 `on` 为字符串；折叠它们会
   重新引入 §7.3 要防的 YAML 1.1 误读。
4. **探针确认后一并折叠 null 拼写**：TS 探针证实 `null`/`Null`/`NULL`/`~`/
   空键两两组合均被 TS 拒绝（§2 P4a/P4b/P4c），故同一规范化函数里一并折叠
   null 拼写（`null`/`Null`/`NULL`/`~`/空标量 → 同一 null 键）。
5. **这是 YAML 解析层问题，不是事件名规范化问题。** 事件名仍按大小写敏感
   匹配冻结支持集（`push`/`pull_request`/`merge_group`），不引入事件名大小写
   折叠；`Push:` 在两边仍是 unsupported_event → UNKNOWN（§2 P5）。
6. **只改重复检测，不改构造语义**：`construct_mapping` 里 `seen` 集合用规范化键
   （布尔/null 拼写折叠）做比较，构造出的映射键仍与原来完全一致（字符串；
   `on` 仍是 `"on"`，`if: false` 仍是 `"false"`）。
7. **引号键不折叠**：引号标量对两边解析器都是字符串。探针证实 `"True":` +
   `true:` 在 TS 侧是不同键（UNKNOWN，不报错），故折叠只适用于无样式
   （plain）标量（`ScalarNode.style is None`）。不做此区分会把当前已一致的
   Q1/Q2 探针 case 改成不一致（§2）。
8. **数字键不在本次范围**：不折叠、不探针、不改动（遗留项 §7-2）。

### 后果

- `dup-bool-true` 成为第四个重复键 parity 夹具，三层覆盖（§4）。
- 探针发现一个此前未记录的反向分歧被顺带修复：`"true":` + `true:` 修前 Oracle
  判 INVALID 而 TS 判 UNKNOWN；样式感知折叠后 Oracle 判 UNKNOWN，事件名
  `["true"]`，与 TS 逐字段一致（§2 Q3）。
- 探针发现一个残留分歧（未修，在范围外）：`True:` vs `FALSE:` 两边均为
  UNKNOWN，但事件名拼写不同（TS `["true","false"]`，Oracle `["True","FALSE"]`），
  因为 TS 把解析后的布尔值字符串化而 Oracle 保留原始字符串。见遗留项 §7-1。

## §2 探针结果（实现前实测，非假设）

探针方法：TS 侧用 esbuild 打包 `src/core/workflow-parser.ts` 的
`parseWorkflowYaml`（bundle 为 CJS 后 node 运行；ESM bundle 因 `yaml` 包的动态
require 失败，改 CJS 即通）；Oracle 侧直接调
`oracle/checkpath_oracle/parser.py` 的 `parse_workflow_yaml`（另用
`scripts/oracle-parse-probe.py` 复核 R2 输入）。探针输入与脚本保留在
`/tmp/p0probe/`（临时目录，不随仓库提交；case 定义见 `cases.py` /
`cases2.json`）。下表 status/errors/events 为两边实测值。

### 2.1 主探针（修前）

| # | 输入（`on:` 下） | TS（修前） | Oracle（修前） | 结论 |
|---|---|---|---|---|
| P1 | `True:` + `true:`（本案） | INVALID / `yaml_parse_error` / `[]` | UNKNOWN / `[]` / `["True","true"]` | **P0 本案**，须修 Oracle |
| P2a | `TRUE:` + `True:` | INVALID / `yaml_parse_error` / `[]` | UNKNOWN / `[]` / 2 events | 折叠 TRUE/True |
| P2b | `False:` + `false:` | INVALID / `yaml_parse_error` / `[]` | UNKNOWN / `[]` / 2 events | 折叠 FALSE/false |
| P2c | `True:` + `FALSE:` | UNKNOWN / `[]` / `["true","false"]` | UNKNOWN / `[]` / `["True","FALSE"]` | 不同键、不报错；但事件名拼写不同（遗留 §7-1） |
| P3a | `On:` + `on:` | UNKNOWN / `[]` / `["On","on"]` | UNKNOWN / `[]` / `["On","on"]` | 不同字符串键，不折叠 |
| P3b | `yes:` + `Yes:` | UNKNOWN / `[]` / `["yes","Yes"]` | UNKNOWN / `[]` / `["yes","Yes"]` | 不同字符串键，不折叠 |
| P4a | `null:` + `Null:` | INVALID / `yaml_parse_error` / `[]` | UNKNOWN / `[]` / 2 events | **TS 报错 → 一并折叠 null** |
| P4b | `null:` + `~:` | INVALID / `yaml_parse_error` / `[]` | UNKNOWN / `[]` / 2 events | **TS 报错 → 一并折叠 `~`** |
| P4c | `Null:` + `NULL:` | INVALID / `yaml_parse_error` / `[]` | UNKNOWN / `[]` / 2 events | **TS 报错 → 一并折叠 NULL** |
| P5 | `Push:`（单个） | UNKNOWN / `[]` / `["Push"]` | UNKNOWN / `[]` / `["Push"]` | 事件名大小写敏感，不折叠 |
| P6 | `true:`（单个） | UNKNOWN / `[]` / `["true"]` | UNKNOWN / `[]` / `["true"]` | 单个布尔键本身合法，两边一致 |

### 2.2 引号/空键补充探针（修前，决定样式感知折叠）

| # | 输入（`on:` 下） | TS（修前） | Oracle（修前） | 结论 |
|---|---|---|---|---|
| Q1 | `"True":` + `true:` | UNKNOWN / `[]` / `["True","true"]` | UNKNOWN / `[]` / `["True","true"]` | 引号键是字符串，已一致；**不得折叠** |
| Q2 | `'True':` + `true:` | UNKNOWN / `[]` / `["True","true"]` | UNKNOWN / `[]` / `["True","true"]` | 同上（单引号） |
| Q3 | `"true":` + `true:` | UNKNOWN / `[]` / `["true"]` | **INVALID** / `yaml_parse_error` / `[]` | 反向分歧：Oracle 修前过度拒绝；样式感知折叠后修好 |
| Q4 | 空键 + 空键 | INVALID / `yaml_parse_error` / `[]` | INVALID / `yaml_parse_error` / `[]` | 已一致；空标量归入 null 折叠后仍一致 |
| Q5 | `ON:` + `on:` | UNKNOWN / `[]` / `["ON","on"]` | UNKNOWN / `[]` / `["ON","on"]` | 不同字符串键，不折叠 |

### 2.3 修后 Oracle 复测（全部 16 个探针 case，与 TS 逐项一致）

| # | Oracle（修后） | 与 TS 是否一致 |
|---|---|---|
| P1 | INVALID / `yaml_parse_error` / `[]` | ✅ |
| P2a | INVALID / `yaml_parse_error` / `[]` | ✅ |
| P2b | INVALID / `yaml_parse_error` / `[]` | ✅ |
| P2c | UNKNOWN / `[]` / `["True","FALSE"]` | ⚠️ status/errors 一致，事件名拼写不同（遗留 §7-1） |
| P3a | UNKNOWN / `[]` / `["On","on"]` | ✅ |
| P3b | UNKNOWN / `[]` / `["yes","Yes"]` | ✅ |
| P4a / P4b / P4c | INVALID / `yaml_parse_error` / `[]` | ✅ |
| P5 | UNKNOWN / `[]` / `["Push"]` | ✅ |
| P6 | UNKNOWN / `[]` / `["true"]` | ✅ |
| Q1 / Q2 | UNKNOWN / `[]` / `["True","true"]` | ✅ |
| Q3 | UNKNOWN / `[]` / `["true"]` | ✅（反向分歧已修复） |
| Q4 | INVALID / `yaml_parse_error` / `[]` | ✅ |
| Q5 | UNKNOWN / `[]` / `["ON","on"]` | ✅ |

另验证 PyYAML 节点样式：plain 标量 `style is None`，双引号标量 `style == '"'`，
与折叠条件（仅 `style is None` 时折叠）一致。

### 2.4 终审复现输入逐字段核对（修后）

输入（与终审裁决一致的 `on:` 块；`name: r2-p0-repro` + 标准 `jobs:`）：

```yaml
on:
  True:
    branches: [main]
  true:
    branches: [dev]
```

| 字段 | TS | Oracle |
|---|---|---|
| status | INVALID | INVALID |
| errors | `["yaml_parse_error"]` | `["yaml_parse_error"]` |
| events | `[]` | `[]` |
| on_key_is_string | false | false |
| evaluation.reason（Oracle 全 IR） | —（TS 同为 invalid，见夹具） | `invalid`，其余 evaluation 字段均为 null（`commit_skip: false` 除外，与既有 INVALID 形态一致） |

## §3 改动清单（Oracle 侧唯一改动点；TS 产品代码未动）

### 3.1 `oracle/checkpath_oracle/parser.py`（唯一产品代码改动）

- 新增 `_BOOL_TRUE_SPELLINGS = {"true","True","TRUE"}`、
  `_BOOL_FALSE_SPELLINGS = {"false","False","FALSE"}`、
  `_NULL_SPELLINGS = {"null","Null","NULL","~",""}`。
- 新增 `_duplicate_key_canonical(key_node)`：plain 标量（`style is None`）的
  布尔/null 拼写折叠为 `("bool", True/False)` / `("null", None)`；其余一切
  （含引号标量）为 `("str", <原字符串>)`。仅用于重复检测。
- `_StrictBaseLoader.construct_mapping` 的 `seen` 集合由 `set[str]` 改为
  `set[tuple[str, object]]`，比较规范化键；构造仍委托给 `super()`，映射键
  完全不变。两个 `yaml.load` 调用点（parse + `extract_jobs`）共用该 loader，
  故 jobs 提取侧同步受益。
- 改写 `_StrictBaseLoader` docstring：删除“`True` vs `true` 是不同键”的旧句，
  写入 FIX-P0-02 折叠规则、探针依据、不折叠项、引号键规则；模块顶注释的
  FIX-P1-01 说明处追加 FIX-P0-02 说明。

### 3.2 夹具（三层，按 FIX-P1-01 既有模式）

- (a) `tests/fixtures/parser-divergence/duplicate-key/dup-bool-true.yml`
  （新；`on:` 块精确复现终审输入，`name: dup-bool-true` + 标准 `jobs:` 沿用
  `dup-branches.yml` 格式）+ `expected.json` 增加第 4 个 case（两边 INVALID /
  `yaml_parse_error` / events `[]`），顶层 note 更新为四 case、T6-17..T6-20、
  G-81..G-84；`README.md` 增加 FIX-P0-02 一节与第四行对照表，旧三 case 文本
  与历史 FIX-P2 记录原文未动。
- (b) trigger 夹具 `tests/fixtures/trigger/T6-20-dup-bool-true/`
  （`workflow.yml` 与 (a) 同文件，SHA-256 `9dc28ab1…` 两边一致；
  `scenario.json` / `required-checks.json` 照抄 T6-17 的 push 场景与 `test`
  检查）+ `tests/fixtures/trigger/suite.json` 增加 1 条（`source: fix-p0-02`，
  44 → 45）。
- (c) golden 夹具 `tests/fixtures/golden/G-84-fix-p0-02-T6-20-dup-bool-true/`
  （`expected.json` 由 Oracle 自身生成，见 §3.3；trigger INVALID /
  `yaml_parse_error`，jobs `[]`，required check `test` →
  `PENDING_NOT_REPORTED` / `no_provider`；`input_sha256`
  `8aac8d637219195a0bc166539fee352d48c76808497a2408960dca86cddc7dec`）
  + `tests/fixtures/golden/suite.json` 增加 1 条（83 → 84）。

### 3.3 `scripts/build-golden.py`（生成器扩展，与 FIX-P1-01 同法）

- 增加 `fix-p0-02` 生成区块（trigger `source == "fix-p0-02"` → `G-84` 起），
  其余逻辑未动。重建前 `build-golden.py --check-only` 如预期失败
  （`CHECK FAILED: golden dir differs from regeneration`，golden cases: 84）；
  重建后 `--check-only` exit 0（84 cases）；`git diff` 证实既有 83 个夹具
  字节级未变，只有 `suite.json` +15 行与 1 个新目录。

### 3.4 测试与计数同步

- `tests/unit/diff-boundaries/duplicate-key-yaml.test.ts`：case 数 3 → 4，
  头注释增加 FIX-P0-02 说明与 T6-17..T6-20 / G-81..G-84。
- `tests/unit/event/trigger-suite.ts`、`tests/unit/event/trigger-oracle-dump.test.ts`
  （含 `sources` 断言增加 `"fix-p0-02": 1`）、`scripts/oracle-diff-trigger.mjs`：
  trigger 计数注释/断言 44 → 45。
- `tests/unit/golden/golden.test.ts`、`tests/unit/cli/formal-pipeline-unsupported.test.ts`、
  `scripts/oracle-diff.mjs`（含分解式）：golden 计数 83 → 84。
- **未动**：`tests/unit/witness/witness-oracle-dump.test.ts` 与
  `scripts/oracle-diff-witness.mjs` 的 44——witness 套件独立（20 T9 + 24 S0），
  不受 T6-20 影响，实测仍为 52 tests 全过。
- **Oracle 侧无自有 pytest 套件**：仓库内无任何 Python 测试文件（仅 vitest +
  diff runners），故无 pytest 可扩展；Oracle 覆盖靠 `test:oracle` /
  `oracle:diff:trigger` 与 dup-key 单元测试（后者经 probe 驱动跑 Oracle）。

### 3.5 验收运行再生的 evidence 报告（随修复提交）

- `evidence/tests/ORACLE_PARITY_REPORT.json`：83 → 84（`passed: 84`，
  `adversarial_fixture_ids` 增加 `G-84`，mismatches 仍 `[]`）。
- `evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`：44 → 45（`passed: 45`，
  mismatches 仍 `[]`）。
- 说明：FIX-P1-01 的修复提交（`11f2fc0`）未包含此类再生报告，留待 T013
  提交（`f8df2fe`）统一更新；本次为满足“完工时 HEAD 干净（除未跟踪
  `reports/` 外）”的任务要求，将本次验收实际生成的两份报告随修复提交。
  `S0_GATE.json` 与 `RELEASE_VERIFY_REPORT.json` 未变（gate hash 不变）。

### 3.6 回归面核对

- 正常事件名（push/pull_request/merge_group）、`on` 字符串键、`on` 列表形式、
  dup-branches/dup-event/dup-name 三种旧重复键：行为与修前完全一致——
  旧三 case 的夹具、expected 与测试未改动且全过；`npm test` 其余文件计数
  与基线逐项一致（仅 §5 的 +5 文件有变化）；probe P3a/P3b/P5/P6/Q5
  证实 `on`/`yes`/`Push` 等拼写行为修前修后一致。

## §4 提交

（报告单独一 commit；以下为实际提交记录。）

1. `ba79452` `FIX-P0-02: Oracle rejects True:/true: boolean-key duplicates (R2 P0)` —
   §3.1–§3.5 的全部改动（23 files，+369/−47）。
2. `FIX-P0-02: handoff report TASK_REPORT.md` — 本报告单独一 commit（见下）。

完工时 HEAD 干净（除预先存在、未跟踪的 `reports/` 外）。

## §5 验收命令实际输出（逐字抄录，亲自运行）

### `npm run test:oracle` — exit 0

```text
suite: tests/fixtures/golden/suite.json
fixtures: 84, TS==expected exit=0, Oracle==expected exit=0, formal TS exit=0
TS vs Oracle mismatches: 0
false PASS: 0
TS formal-pipeline false PASS: 0
unsupported surfaced as UNKNOWN: 19/19 fixtures
report: evidence/tests/ORACLE_PARITY_REPORT.json
```

### `npm run oracle:diff:trigger`（附加）— exit 0

```text
suite: tests/fixtures/trigger/suite.json
fixtures: 45, TS exit=0, Oracle exit=0
TS vs Oracle mismatches: 0
report: evidence/tests/T006_ORACLE_TRIGGER_REPORT.json
```

### `npm test` — exit 0（855 → 860，+5）

```text
Test Files  32 passed (32)
     Tests  860 passed (860)
```

+5 分解（基线为 `f4bc39c` 的干净 worktree 实测，非自报——同一
`node_modules` 符号链接复跑，基线 855/855）：

| 文件 | 基线 | 修后 | 变化 |
|---|---|---|---|
| `tests/unit/diff-boundaries/duplicate-key-yaml.test.ts` | 4 | 5 | +1（第 4 个 case） |
| `tests/unit/golden/golden.test.ts` | 85 | 86 | +1（G-84） |
| `tests/unit/cli/formal-pipeline-unsupported.test.ts` | 169 | 171 | +2（G-84 × 主差分 + two-path lock） |
| `tests/unit/event/trigger-oracle-dump.test.ts` | 45 | 46 | +1（T6-20） |
| `tests/unit/witness/witness-oracle-dump.test.ts` | 52 | 52 | 0（未受影响） |
| 其余 27 个文件 | — | — | 0（逐项比对无变化） |

### `npm run s0:gate` — exit 0

```text
iteration 100/100: ts_exit=0 oracle_exit=0 mismatches=0 hash=b39c0de1471856c4db4f2e3c8b8de3654031030586247ac04683012b183550e2
determinism: 100 runs, 1 unique hash(es), 0 mismatch(es)
gate: static network check: 0 matches
gate: expanded static network check: 45 files, 0 matches
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

### `npm run release:verify` — exit 0

```text
[3/5] report_sha256 recomputation (shipped dist modules)
  PASS report_sha256 recompute: pr-docs-only 9dc3af313677f795… == demo report, both recompute OK
[4/5] offline static scan (dist + generated reports)
  PASS offline static scan: 34 files scanned, 0 remote resource references
[5/5] license guard
  PASS license guard: no LICENSE file; LICENSE_STATUS.md still PENDING_SAM_DECISION
release:verify PASS
```

（其余 [1/5][2/5] 各子项亦全部 PASS，含 CLI smoke 6 项；完整输出未全抄，
关键结论为 `release:verify PASS`，exit 0。）

### 单元测试（dup-key，修后）— exit 0

```text
✓ tests/unit/diff-boundaries/duplicate-key-yaml.test.ts (5 tests) 348ms
Test Files  1 passed (1)
     Tests  5 passed (5)
```

## §6 P0 如何关闭

- 根因：Oracle `_StrictBaseLoader` 用原始字符串比较映射键，而 TS `yaml`
  2.x 先按 YAML 1.2 core schema 解析标量再做 uniqueKeys 检查；`True` 与
  `true` 在 TS 侧是同一布尔键，在 Oracle 侧是两个字符串键。
- 修复：Oracle 重复检测改用规范化键（§3.1），只改检测、不改构造；TS 未动。
- 证据链：探针（§2）→ 夹具三层（§3.2）→ 生成器可重建（§3.3）→ 四条验收
  命令 + trigger 对照全部 exit 0 且 0 mismatch（§5）→ R2 输入逐字段一致
  （§2.4）。
- 未动用任何禁止手段：无测试删除、无 Oracle 比较范围缩小、无 mismatch
  忽略名单、无 P0 改 P2、无 specs 改动、无许可证改动、无 Drive 操作、
  无 T013/T014、无终审发送。

## §7 遗留项

1. **残留分歧（P2c 探针，未修，在本次范围外）**：`True:` vs `FALSE:`（不同
   布尔值）两边均为 UNKNOWN、errors 均为空，但事件名拼写不同——TS
   `["true","false"]`，Oracle `["True","FALSE"]`。原因是 TS 把解析后的布尔
   键字符串化为 JS 对象键，Oracle 保留原始字符串。status/errors 一致，
   仅事件名字段拼写不同；修它需要改动事件名构造语义（超出“只改重复检测”
   的任务范围），故未修、未立夹具。建议 T013 复核时知悉：若终审把该形状
   加为夹具，trigger/golden 对照会在事件名上 mismatch。
2. **数字键不在本次范围**：未探针、未折叠、未改动。TS `yaml` 2.x core schema
   下 `1:` vs `01:` 等数字拼写是否同键未知，如终审追问需另行探针 + ADR。
3. **无 Oracle pytest 套件**：见 §3.4；Oracle 覆盖靠 vitest + diff runners。
4. **后续步骤（不在本任务内）**：T013 独立复核（R4）→ T014 正式重新冻结 →
   终审 R3（仍在同一终审对话）。本修复未触碰冻结产物（`source.zip` /
   `dist.zip` / manifest 仍为 R2 冻结值），终审 R3 需基于重新冻结后的包复核。
5. **探针脚本未入仓库**：`/tmp/p0probe/` 下的 probe 脚本与 case 定义为临时
   文件（VM 重启即失），探针结果已全文记入本报告 §2；如需复现，按 §2
   方法（esbuild CJS bundle + 直接调 `parse_workflow_yaml`）即可重建。
6. **时间**：全部工作在 Sam 电脑关机时间（约 07:02 GMT 2026-11-09）前完成，
   未做跨越关机时间的长运行；未使用 WorkBuddy/Qoder 路由（本地执行，无需
   模型调用）。
