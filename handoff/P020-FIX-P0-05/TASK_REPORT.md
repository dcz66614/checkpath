# P020 CheckPath — FIX-P0-05 任务报告（终审 R2 P0 残留分歧 D2 定点修复，流式别名键）

- 任务：FIX-P0-04 报告 §7-1 遗留的已知分歧 D2（`on: {*a: 1}` 流式别名键；终审 R2 P0 的同根残留，按 PROJECT_BOOK §7.3 若被复核探到仍会定为 P0）
- 执行员：FIX-P0-05 修复执行员（全新会话，与之前所有施工/修复/复核会话隔离；修复期间无任何复核并行，工作树独占）
- 日期：2026-11-09（GMT ~01:30–02:15）
- 基线：HEAD `93aadf9`（FIX-P0-04 代码 + 终报 commit；parent 亲自验收：npm test 1052/1052、test:oracle 115 fixtures 0 mismatch、s0:gate PASS `f511a847…`、release:verify PASS）
- 环境：Node v24.22.1、Python 3.12.3、PyYAML 6.0.1（与冻结环境一致）
- 范围：只修 D2。未做复核、未做冻结、未动 Drive、未发终审、未改 specs、未改许可证（仍 `PENDING_SAM_DECISION`）、**TS 产品代码未动**。

## 结论

**D2 已关闭。** D2 族探针矩阵修后 72/76 checks MATCH（修前 43/76）；仅剩的 4 个非 MATCH 检查是已标注的已知残留 N5/H6（见 §7，与 D2 不同根）。fix-p0-04 矩阵重跑 100/100 MATCH（D2 行现已 MATCH；驱动仍把它的 2 个检查计为"已标注已知分歧"，因 `cases.json` 里的 flag 是历史标注），其中 R5 的 66 例子集 66/66 全 MATCH。全部验收命令 exit 0：

| 命令 | 结果 |
|---|---|
| `npm test` | 37 文件，1085/1085（基线 1052/1052，+33），exit 0 |
| `npm run test:oracle` | 119 fixtures（基线 115，+4），0 mismatch，0 false PASS，0 TS formal-pipeline false PASS，unsupported 34/34，exit 0 |
| `npm run oracle:diff:trigger` | 80 fixtures（基线 76，+4），0 mismatch，exit 0 |
| `npm run oracle:diff:jobs` | 48 fixtures，0 mismatch，exit 0 |
| `npm run oracle:diff:checks` | 46 fixtures，0 mismatch，exit 0 |
| `npm run oracle:diff:witness` | 44 fixtures，0 mismatch，exit 0 |
| `npm run s0:oracle` | 24/24，0 mismatch，0 false PASS，exit 0 |
| `npm run s0:gate` | PASS，oracle 24/24，100 runs 1 hash，`gate_report_sha256` 仍为 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`，exit 0 |
| `npm run release:verify` | PASS，dist tree sha256 仍为 `c06f148776784da5…`（TS 产品代码未动），license guard 仍 `PENDING_SAM_DECISION`，exit 0 |
| `python3 scripts/build-golden.py --check-only` | golden cases 119，exit 0 |
| `npm run typecheck` | exit 0 |
| 探针矩阵 fix-p0-05（仓库内可重跑） | 72/76 checks MATCH；仅 4 checks 为已标注的已知残留 N5/H6（见 §7） |
| 探针矩阵 fix-p0-04 重跑 | 100/100 checks MATCH；R5 子集 66/66 全 MATCH |

## §1 ADR FIX-P0-05（全文）

### 背景

D2（FIX-P0-04 报告 §7-1，探针矩阵 `evidence/probes/fix-p0-04/` case D2）：

```yaml
name: test
on: {*a: 1}
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
```

其中 `&a` 锚点在别处定义（探针用例的完整输入见 `evidence/probes/fix-p0-05/cases.json` 的 D2 行）。两侧输出：

- TS（`yaml` 2.9.1）：INVALID / `yaml_parse_error`，jobs `[]`——解析期拒绝。
- Oracle（PyYAML）：INVALID / `event_config_not_mapping`，jobs `[test]`——接受并解析别名。

两侧都判 INVALID，仅错误码与 jobs 列表不同。按 PROJECT_BOOK §7.3（任何字段不一致都判失败），D2 若被复核探到仍会定为 P0——与 R4、R5 的模式相同。

### 根因（探查所得，非假设）

`yaml` 2.9.1 拒绝别名键的条件是**冒号与别名之间没有空白分隔**（"Alias ending in : is ambiguous" → "Missing, or: between flow map items"），与 flow/block 样式无关：

- 拒绝：`{*a: 1}`、`{? *a: 1}`（显式 `?` 也救不了）、块式 `*a: 1`、`{*a:b}`。
- 接受：`{*a : 1}`（空格）、`{*a\t: 1}`（tab）、`{? *a : 1}`、`{?*a: 1}`（`?` 与别名粘连时 TS 读作普通标量 "?*a"，不是显式键）。
- 两侧本来就一致的：锚定/标签别名键（`{&k *a: 1}`、`{!!str *a: 1}`，两侧都 `yaml_parse_error`）、未定义别名（`{*zz: 1}`）、前向引用（`*a` 在 `&a` 定义前使用）、序列锚作键（Oracle 侧因不可哈希键报错）、同 map 内锚定+别名（重复键 → 两侧 `yaml_parse_error`）。

检测只能在扫描器 token 流上做，原因有三（均已实测验证）：

1. 组合后的节点树无法用于检测——PyYAML 把别名键解析为被锚定的节点对象本身，别名身份丢失。
2. 事件流与 token 流都不区分隐式键与显式 `?` 键——只有 token 的起止位置（mark）能区分。
3. `?*a` 粘连标量必须豁免：此时 KeyToken 紧贴别名左侧（gap 恰好为 1 个字符），而真正的别名键要么 gap 为 0（隐式键），要么 gap ≥ 2（显式 `?` + 空格）。

### 决策 — Oracle 侧加一条扫描器 token 流规则，TS 产品代码不动

`oracle/checkpath_oracle/parser.py` 新增 `_reject_adjacent_alias_colon(yaml_text)`，在 `parse_workflow_yaml` 与 `extract_jobs` 两个 `yaml.load` 调用点之前执行（Oracle 全库仅此两处调用点）：

- 扫描 `yaml.scan` 的 token 流；对每个 AliasToken 向前越过 Anchor/Tag token，只有前一个有效 token 是 KeyToken 时才是键位置；
- KeyToken 与别名起始位置的字符间距恰好为 1 时豁免（`?*a` 粘连标量）；
- 其余情况若别名结束位置的源字符恰好是 `:`，抛 `yaml.YAMLError`，落入既有的 `yaml_parse_error` 路径（trigger：INVALID / `yaml_parse_error` / events `[]` / `on_key_is_string` false；jobs：`[]`）。

不做的事：不改 TS 产品代码（`yaml` 库行为是既定事实，Oracle 向它对齐）；不做输入文本手术（§7.3 禁止）；不删测试、不缩小 Oracle 比较范围、不加 mismatch 忽略名单、不把 P0 改回 P2。

### 后果

- D2 族 29 个检查（D2 + F2–F6/F8/F10/F11/F14、G1/G3/G6/G8、H4 的 trigger+jobs）由 DIFF 变 MATCH；其中 F2/F10 两例修前 Oracle 甚至返回 VALID（别名在 `jobs:` 内时 TS 解析失败而 Oracle 正常跑完），修后同为 INVALID / `yaml_parse_error`。
- 空格/tab 分隔的别名键与所有非键位置的别名（值、序列项）不受影响——无回归形状 10/10 保持 MATCH（修前修后一致）。
- 残留 2 个已知分歧（N5、H6），与 D2 不同根，见 §7。

## §2 探针结果（实现前实测，非假设）

### 2.1 D2 族边界探查（/tmp 驱动，trigger + jobs 双模式，全 JSON 深相等）

修前基线（commit `93aadf9`，三批驱动，36 行）：

- DIFF 33 检查：D2 ×2、F2–F6/F8/F10/F11（trigger）/F14 ×2、G1/G3/G6/G8 ×2、H4 ×2，另加已标注的 N5/H6 ×4。
- MATCH 43 检查：F7/F9/F12/F13/F15、G2/G4/G5/G7/G9、H1/H2/H3/H5/H8、N2/N3/N4/N7/N8/N9。

关键判据实测（`yaml` 2.9.1 vs PyYAML 6.0.1）：

| 输入形态 | TS | Oracle（修前） |
|---|---|---|
| `{*a: 1}`（D2） | INVALID / yaml_parse_error | INVALID / event_config_not_mapping |
| `*a: 1` 块式（G1） | INVALID / yaml_parse_error | INVALID / event_config_not_mapping |
| `{? *a: 1}`（G3） | INVALID / yaml_parse_error | INVALID / event_config_not_mapping |
| `{*a : 1}`（G2） | 接受，INVALID / event_config_not_mapping | 同左 MATCH |
| `{*a\t: 1}`（H6） | 接受，INVALID / event_config_not_mapping | INVALID / yaml_parse_error（残留，见 §7-2） |
| `{?*a: 1}`（H3） | 标量 "?*a"，INVALID / event_config_not_mapping | 同左 MATCH |
| `{&k *a: 1}` / `{!!str *a: 1}`（G4/G9） | INVALID / yaml_parse_error | 同左 MATCH |
| `{*zz: 1}` 未定义（F9）/ 前向引用（F12） | INVALID / yaml_parse_error | 同左 MATCH |
| 别名在值位置（N2/N3/N4/N8/N9） | 正常解析 | 同左 MATCH |

### 2.2 修后对照（仓库内矩阵 `evidence/probes/fix-p0-05/`，38 行 × 双模式 = 76 检查）

**72/76 MATCH。** 仅 N5/H6 的 4 个检查为已标注的已知分歧（见 §7）。修前 43/76 → 修后 72/76，+29 检查。

### 2.3 fix-p0-04 矩阵重跑（仓库内驱动，含 R5 的 66 例子集）

**100/100 checks MATCH，0 个非 MATCH。** 其中 R5 的 66 行（R4 的 46 + R1–R10 + 残留 10）66/66 全 MATCH；B1–B11 边界 22/22；无回归形状 10/10；D2 行现已 MATCH（驱动仍把它的 2 个检查计为"已标注已知分歧"，因 `cases.json` 里的 flag 是 FIX-P0-04 时的历史标注，未改动该文件的数据语义——D2 的关闭状态以本报告与 fix-p0-05 的 README 为准）。

## §3 改动清单

### 3.1 `oracle/checkpath_oracle/parser.py`（Oracle 侧唯一改动，TS 产品代码不动）

- 新增 `_reject_adjacent_alias_colon(yaml_text)`（约 50 行，含完整 docstring 说明根因与判据）。
- `parse_workflow_yaml` 与 `extract_jobs` 的 `try` 块内、`yaml.load` 之前各加一行调用。无其他改动。

### 3.2 夹具（三层，按 FIX-P0-04 既有模式）

- parser-divergence 层：`tests/fixtures/parser-divergence/flow-alias-key/`，f01..f16（`.yml` + `expected.json`，仅在两侧双模式一致后才生成 expected；trigger 状态/错误/events + jobs）+ `README.md`（16 例：D2、F2、F3、F4、F5、F6、F7、F8、F9、F10、F11、F12、F13、F14、F15、G1 的覆盖映射）。
  - 注意：`yaml` 库在退化输入上会向 stderr 打印 BAD_ALIAS 警告——库噪音，不是失败（见 `tests/unit/diff-boundaries/flow-alias-key.test.ts` 注释）。
- trigger 层：`tests/fixtures/trigger/T6-52-flow-alias-key/`、`T6-53-block-alias-no-space/`、`T6-54-filter-flow-alias-key/`、`T6-55-jobs-flow-alias-key/`（各含 `workflow.yml` + `scenario.json` + `required-checks.json`，后两者照抄 T6-20 的 push 场景与 `test` 检查）+ `tests/fixtures/trigger/suite.json` 增加 4 条（`source: fix-p0-05`，76 → 80）。
  - 过程记录：初次编辑时曾用 `json.dump(indent=1)` 把整个 `suite.json` 重写为 1 空格缩进，git diff 审阅时发现，立即恢复为原文件 2 空格缩进；最终 diff 仅为 +32 行（4 条新增），无格式改动。
- golden 层：`tests/fixtures/golden/G-116-fix-p0-05-T6-52-flow-alias-key/` … `G-119-fix-p0-05-T6-55-jobs-flow-alias-key/`（`scripts/build-golden.py --check-only` 通过，119 例）+ `tests/fixtures/golden/suite.json` 增加 4 条（纯增量，+60 行 0 删除）。

### 3.3 `scripts/build-golden.py`（生成器扩展，与 FIX-P0-03/FIX-P0-04 同法）

- 增加 fix-p0-05 块：`source == "fix-p0-05"` 的 trigger 条目生成 golden G-116…（显式 required-checks 文件；别名键工作流 Oracle 不可解析，`extract_jobs` 返回 `[]`，显式 manifest 固定 no_provider 检查 verdict）。

### 3.4 测试与计数同步

- `tests/unit/diff-boundaries/flow-alias-key.test.ts`（新增）：16 例 × trigger+jobs 双模式。
- 计数注释：trigger 76 → 80（`tests/unit/event/trigger-oracle-dump.test.ts`、`tests/unit/event/trigger-suite.ts`、`scripts/oracle-diff-trigger.mjs`，sources 增加 `"fix-p0-05": 4`）；golden 115 → 119（`tests/unit/golden/golden.test.ts`、`tests/unit/cli/formal-pipeline-unsupported.test.ts`、`scripts/oracle-diff.mjs`）。
- 未动：jobs/checks/witness 套件（计数不变，报告未改动）。

### 3.5 探针证据（仓库内可重跑）

- `evidence/probes/fix-p0-05/`（新建）：`cases.json`（38 行，76 检查；N5/H6 两行标 `known_divergence`）、`run-matrix.py`（驱动，沿用 fix-p0-04 格式；temp 目录内构建 TS bundle，不写工作树）、`ts-probe-entry.ts`（与 fix-p0-04 相同）、`README.md`（组成、重跑方法、修前基线 43/76、根因一段话、残留说明）、`results.json`（修后运行：72/76，确定性——无时间戳，同树重跑字节一致）。
- `evidence/probes/fix-p0-04/README.md`：增加 FIX-P0-05 update 附录（D2 已关闭；该矩阵重跑 100/100）。
- `evidence/probes/fix-p0-04/results.json`：重跑再生（D2 行由 DIFF 变 MATCH）。
- `tests/fixtures/parser-divergence/bare-empty-key/README.md`：Known residuals 增加 FIX-P0-05 update 附录（D2 已关闭，指向 flow-alias-key/ 与 fix-p0-05 矩阵）。

### 3.6 验收运行再生的 evidence 报告（随修复提交）

- `evidence/tests/ORACLE_PARITY_REPORT.json`：115 → 119（`fixture_count`/`passed` 115 → 119，`failed` 0，`mismatches` `[]`，`false_pass_count` 0）。
- `evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`：76 → 80。
- `evidence/tests/RELEASE_VERIFY_REPORT.json` 未改动（dist tree sha256 仍为 `c06f148776784da5…`，与 FIX-P0-04 验收时一致）；`evidence/s0/` 未改动（gate hash 不变）。

### 3.7 回归面核对

- 未删任何测试、未缩小 Oracle 比较范围、未加 mismatch 忽略名单、未改 P0 定级。
- TS 产品代码零改动（`git diff` 仅 Oracle parser + 脚本 + 夹具 + 测试 + evidence）。
- 预先存在未跟踪的 R4/R5 复核报告（`evidence/review/INDEPENDENT_REVIEW_R4.md`、`INDEPENDENT_REVIEW_R5.md`）、`handoff/P020-T013-R4/`、`handoff/P020-T013-R5/`、`reports/` 均未动、未提交——本次提交只含 FIX-P0-05 自身文件。

## §4 提交

- 代码提交（FIX-P0-05）：见 git log（本报告提交之前）。
- 终报提交（本文件，单独 commit）：`handoff/P020-FIX-P0-05/TASK_REPORT.md`。

## §5 验收命令实际输出（逐字抄录，亲自运行；全部编辑完成后的干净时间窗口一次链式跑完，无编辑重叠）

### `npm test` — exit 0（1052 → 1085，+33）

```
 Test Files  37 passed (37)
      Tests  1085 passed (1085)
```

### `npm run test:oracle` — exit 0

```
suite: tests/fixtures/golden/suite.json
fixtures: 119, TS==expected exit=0, Oracle==expected exit=0, formal TS exit=0
TS vs Oracle mismatches: 0
false PASS: 0
TS formal-pipeline false PASS: 0
unsupported surfaced as UNKNOWN: 34/34 fixtures
report: evidence/tests/ORACLE_PARITY_REPORT.json
```

### `npm run oracle:diff:trigger` — exit 0

```
suite: tests/fixtures/trigger/suite.json
fixtures: 80, TS exit=0, Oracle exit=0
TS vs Oracle mismatches: 0
report: evidence/tests/T006_ORACLE_TRIGGER_REPORT.json
```

### `npm run oracle:diff:jobs` — exit 0

```
suite: tests/fixtures/jobs/suite.json + tests/fixtures/s0/job-check/suite.json
fixtures: 48, TS exit=0, Oracle exit=0
TS vs Oracle mismatches: 0
report: evidence/tests/T007_ORACLE_JOBS_REPORT.json
```

### `npm run oracle:diff:checks` — exit 0

```
suite: tests/fixtures/checks/suite.json + tests/fixtures/s0/job-check/suite.json
fixtures: 46, TS exit=0, Oracle exit=0
TS vs Oracle mismatches: 0
report: evidence/tests/T008_ORACLE_CHECKS_REPORT.json
```

### `npm run oracle:diff:witness` — exit 0

```
suite: tests/fixtures/witness/suite.json
fixtures: 44, TS exit=0, Oracle exit=0
TS vs Oracle mismatches: 0
report: evidence/tests/T009_ORACLE_WITNESS_REPORT.json
```

### `npm run s0:oracle` — exit 0

```
suite: tests/fixtures/s0/all.json
fixtures: 24, TS==expected exit=0, Oracle==expected exit=0, formal TS exit=0
TS vs Oracle mismatches: 0
false PASS: 0
TS formal-pipeline false PASS: 0
unsupported surfaced as UNKNOWN: 2/2 fixtures
report: evidence/s0/S0_ORACLE_REPORT.json
```

### `npm run s0:gate` — exit 0

```
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

### `npm run release:verify` — exit 0

```
[4/5] offline static scan (dist + generated reports)
  note: dist/assets/index-XyZd31iV.js: 20x bare URL string(s), e.g. https://react.dev/errors/, http://www.w3.org/2000/svg, http://www.w3.org/1998/Math/MathML, http://www.w3.org/1999/xlink, http://www.w3.org/XML/1998/namespace — string constant, not a fetched resource
  note: dist/assets/index-XyZd31iV.js: contains fetch( from Vite's modulepreload polyfill; it only fetches in-document <link rel="modulepreload"> entries, and dist/index.html contains none — no request is issued
  note: dist/report/html.js: 2x bare URL string(s), e.g. http://`,, https://`, — string constant, not a fetched resource
  PASS offline static scan: 34 files scanned, 0 remote resource references
[5/5] license guard
  PASS license guard: no LICENSE file; LICENSE_STATUS.md still PENDING_SAM_DECISION
release:verify PASS
```

（其余步骤 [1/5]–[3/5] 均 PASS；完整报告见 `evidence/tests/RELEASE_VERIFY_REPORT.json`，`ok: true`，`dist_tree_sha256: c06f148776784da5f38770e580abbd6484bbf41dcc97b8e35fc15342040855fa`，与 FIX-P0-04 验收时一致。）

### `python3 scripts/build-golden.py --check-only` — exit 0

```
golden cases: 119
```

### `npm run typecheck` — exit 0

```
> checkpath@0.0.0-t001-skeleton typecheck
> tsc --noEmit
```

### 探针矩阵最终重跑（仓库内驱动） — exit 0

```
CHECKS 72/76 MATCH (of which 4 checks are flagged known-divergence)   # evidence/probes/fix-p0-05/run-matrix.py
DIFF H6-flow-alias-tab-before-colon [trigger] (flagged known-divergence)
DIFF H6-flow-alias-tab-before-colon [jobs] (flagged known-divergence)
DIFF N5-block-alias-key-map-anchor [trigger] (flagged known-divergence)
DIFF N5-block-alias-key-map-anchor [jobs] (flagged known-divergence)
CHECKS 100/100 MATCH (of which 2 checks are flagged known-divergence) # evidence/probes/fix-p0-04/run-matrix.py
```

（R5 子集核对：对再生的 `evidence/probes/fix-p0-04/results.json` 逐行核查，66 行 R5 行全部 `match: true`，0 个非 MATCH——66/66。）

## §6 D2 如何关闭

| 形态 | 修前（93aadf9） | 修后 |
|---|---|---|
| D2 `on: {*a: 1}` trigger | TS INVALID/yaml_parse_error vs Oracle INVALID/event_config_not_mapping | 同为 INVALID / yaml_parse_error，events `[]`，全 JSON 深相等 |
| D2 `on: {*a: 1}` jobs | TS `[]` vs Oracle `[test]` | 同为 `[]` |
| F2 `jobs:` 内流式别名键 | TS INVALID vs Oracle VALID（push 事件） | 同为 INVALID / yaml_parse_error |
| F10 job 定义内流式别名键 | TS INVALID vs Oracle VALID | 同为 INVALID / yaml_parse_error |
| F3/F8 filter 内别名键 | TS INVALID/yaml_parse_error vs Oracle UNKNOWN | 同为 INVALID / yaml_parse_error |

## §7 遗留项（修 D2 时发现的新分歧，如实列出，不得隐瞒）

### 7-1 N5 — 块式别名键 + 映射锚点（已知分歧，超出 FIX-P0-05 范围）

```yaml
x: &a {b: c}
name: test
on:
  *a : 1
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
```

- TS：别名解析为映射后被当作事件名 stringify，INVALID / `event_config_not_mapping`，jobs `[test]`。
- Oracle：PyYAML 拒绝不可哈希的 dict 键，INVALID / `yaml_parse_error`，jobs `[]`。
- 与 D2 不同根（不可哈希键处理，不是邻接性）。修复方向二选一，均有代价：(a) Oracle 侧把集合键 stringify——会破坏已达成一致的 `? {a: b} : 1` / `? [a, b] : 1` 两例；(b) TS 侧扩展 `hasUnrepresentableKey`，拒绝对解析为集合的别名键。需后续决策，不在本任务内解决。
- 探针位置：`evidence/probes/fix-p0-05/cases.json` N5 行（`known_divergence: true`）。

### 7-2 H6 — 流式别名键 + tab 分隔（已知分歧，超出 FIX-P0-05 范围）

```yaml
name: test
on: {*a<TAB>: 1}
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
```

- TS：接受 tab 作为分隔，INVALID / `event_config_not_mapping`，jobs `[test]`。
- Oracle：PyYAML 扫描器在 flow 上下文中拒绝别名后的 tab，INVALID / `yaml_parse_error`，jobs `[]`。
- PyYAML 扫描器限制，非 Oracle 侧可修——输入文本手术被 PROJECT_BOOK §7.3 禁止。不在本任务内解决。
- 探针位置：`evidence/probes/fix-p0-05/cases.json` H6 行（`known_divergence: true`）。

### 7-3 其他诚实记录

- `yaml` 库在退化输入（如未定义别名）上会向 stderr 打印 BAD_ALIAS 警告——库噪音，不是失败；边界测试文件中有注释说明。
- 本次未动 TS 产品代码：T014 R3 重冻时 dist.zip 的内容与 R2 的 `da130ad2…` 相同（dist 树哈希 `c06f1487…` 自 FIX-P0-04 后未变），但仍须按流程重跑 `release:verify` 并记录新 zip 的 SHA，不得直接复用 R2 的 zip。
- 下一步（不在本任务内）：派 T013 R6 独立复核 → T014 R3 正式重冻（manifest 记录 R6）→ Drive 新建 01_release_R3 文件夹重归档（不覆盖 R1/R2）→ 同一立项对话终审 R3（GPT-6 + Extra High + 完整 tail）。
