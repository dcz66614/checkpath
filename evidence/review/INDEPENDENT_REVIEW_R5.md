# P020 CheckPath — T013 第五轮独立复核（R5）

**Verdict: NOT PASS — P0 1 / P1 0 / P2 7**

| 项 | 内容 |
|---|---|
| 审查对象（任务指定） | commit `2388be1`（FIX-P0-03：`c24972b` 代码 + `2388be1` 交接报告） |
| 审查开始时 HEAD | `2388be1`（`git log` 核对一致，见 §0） |
| 审查窗口 | 2026-11-09 ~00:15 GMT → ~00:35 GMT |
| 复核员 | 独立会话，与 T001–T012 施工者、FIX-P0-02/FIX-P0-03 修复执行员、前四轮 T013 复核员完全隔离；只审查，不改代码 |
| 结论 | R4 的 P0（46 例探针分歧）已全部关闭；全量电池在干净克隆中通过；但 FIX-P0-03 报告 §7 披露的 3 项残留中有 3 处可复现的字段分歧仍在，构成新的 grouped P0，故 NOT PASS |

## §0 审查对象与无污染声明（先读）

1. **审查对象确为 `2388be1`**：审查开始时 `git log --oneline -1` = `2388be1 FIX-P0-03: handoff report TASK_REPORT.md`，其父为 `c24972b`，再上为 `53fa36a`。审查期间 HEAD 未移动（结束时仍为 `2388be1`）。
2. **全部验证均在干净克隆 `/tmp/r5clone` 中完成**（`git clone ~/workspace/p020-checkpath`，`git rev-parse HEAD` = `2388be185787b324e147918fb3ed3d6482601bd7`；`oracle/checkpath_oracle/parser.py` md5 `2329d662b57a220f384208e0a566d8cf`，与 `git show HEAD:...` 逐字节一致；`npm ci` 181 包）。探针、电池、试冻一律在克隆内跑，**从未在共享工作树上运行任何探针或测试**。工作树上的操作仅为只读（`git log/diff/show`、`grep`、`read`）+ 最后写入本报告与 SUMMARY 两个交付文件。R4 遭遇的修复并行污染（§10 教训）本轮未复现：审查开始时 FIX-P0-03 已提交，修复协调员的工作已完成。
3. **比较标准比 R4 更严**：R4 比较 status / errors / events / on_key_is_string 四个字段；本轮探针比较**全 JSON 深相等**（trigger 模式的整个 TriggerIR，jobs 模式的整个 job 列表），无容差、无忽略字段。63/66 MATCH 是在此标准下的结果。
4. **探针方法**：TS 侧为 `src/core/workflow-parser.ts` 的 `parseWorkflowYaml` 与 `src/core/e2e.ts` 的 `extractJobs`，经克隆内 esbuild 打包为 CJS bundle（`/tmp/r5probe/ts-probe.cjs`，从克隆源码重建）；Oracle 侧为仓库自带 `scripts/oracle-parse-probe.py` / `scripts/oracle-jobs-probe.py`（cwd=`/tmp/r5clone`）。每个探针输入均为最小 workflow（`name` + `on:` + 一个 `test` job；jobs 模式输入见 §2）。R4 的 46 例矩阵按 R4 报告 §2.2/§2.3 全文重建（`/tmp/r4probe/` 已不在——VM /tmp 已清，故以报告文本为权威来源；Q4/E1/E2 的“空键”原文未给出确切 YAML，本轮以 X-empty-1..6 六种显式变体覆盖，见 §2.4）。

## §1 R4 的 P0 已关闭（已验证）：46/46 MATCH

R4 报告 §2 的 46 例矩阵在 2388be1 上**全部一致**（全 JSON 深相等）：

**A 组 — 数字标量拼写重复键（13 例，R4 时 TS INVALID vs Oracle UNKNOWN，现全部 MATCH）：**

| 例 | 输入（`on:` 下两键） | 现结果 |
|---|---|---|
| E3 | `1:` + `01:` | MATCH（双边 INVALID / yaml_parse_error / events `[]`） |
| N3 | `1.5:` + `1.50:` | MATCH |
| N4 | `1:` + `1.0:` | MATCH |
| N5 | `0x10:` + `16:` | MATCH |
| N6 | `+1:` + `1:` | MATCH |
| N7 | `-0:` + `0:` | MATCH |
| M1 | `0o17:` + `15:` | MATCH |
| M3 | `1e2:` + `100:` | MATCH |
| M4 | `0.5:` + `.5:` | MATCH |
| M5 | `5.:` + `5.0:` | MATCH |
| M6 | `.inf:` + `.Inf:` | MATCH |
| K3 | `1E2:` + `100:` | MATCH |
| K4 | `.INF:` + `.inf:` | MATCH |

**B 组 — 事件名渲染分歧（9 例，R4 时仅 events 不同，现全部 MATCH；顺序敏感 6 例各重跑 3 次均稳定）：**

| 例 | 输入 | 现结果 |
|---|---|---|
| P2c | `True:` + `FALSE:` | MATCH（双边 events `["true","false"]`） |
| N2 | 单个 `01:` | MATCH（`["1"]`） |
| N8 | `1_000:` + `1000:` | MATCH 3/3 |
| M2 | `0b101:` + `5:` | MATCH 3/3 |
| M7 | `.nan:` + `.NaN:` | MATCH 3/3（双边 1 个事件 `["NaN"]`） |
| M8 | `1_0:` + `10:` | MATCH 3/3 |
| K1 | `0O17:` + `15:` | MATCH 3/3 |
| K2 | `0X10:` + `16:` | MATCH 3/3 |
| K6 | `0b0:` + `0:` | MATCH 3/3 |

**MATCH 组（24 例，R4 时已一致，现仍一致）：** R2（`True:` branches `[main]` + `true:` branches `[dev]`——终审 R2 原输入，双边 INVALID / yaml_parse_error / events `[]`）、P2a（`TRUE:`+`True:`）、P2b（`False:`+`false:`）、P4a/b/c（null 三拼写两两组合）、P3a（`On:`+`on:` 不折叠）、P3b（`yes:`+`Yes:` 不折叠）、P5（单个 `Push:`）、P6（单个 `true:`）、Q1/Q2（引号 `"True"`/`'True'` + `true:` 不折叠）、Q3（引号 `"true"` + `true:`）、Q5（`ON:`+`on:`）、E4（`1:`+`1:` 真重复）、E5（jobs 层 `True:`/`true:`，jobs 模式）、E6（`"on":`+`on:`）、E7（`on: push` 字符串）、E8（正常 `push:` 事件）、N1（单个 `1:`）、K5（单个 `1_000:`）。

**FIX-P0-03 10-case 探针（报告 §2.1，R1–R10）全部 MATCH**：单个 `True:`/`FALSE:`/`Null:`/`~:`/`TRUE:` 渲染、filter 键 `push: {True: [main]}`、`on: [True, push]`（INVALID / on_list_item_not_string）、`branches: [True]` 与 `types: [True]`（INVALID / filter_not_string_or_list），修后双边逐字段一致。

## §2 新发现：Grouped P0 — 3 处残留分歧（66 例探针，63 MATCH / 3 DIFF）

探针总数 66（R4 46 + FIX-P0-03 10 + 本轮残留探针 10），**63 MATCH / 3 DIFF / 0 ERROR**。3 处 DIFF 均为 FIX-P0-03 报告 §7 已披露的残留，复核员逐项独立复现如下（全部在干净克隆中实测）：

### 2.1 X-empty-1：单个裸空键（事件键）

输入（`on:` 下只有一个裸 `:` 键）：

```yaml
name: probe
on:
  :
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
```

| 字段 | TS | Oracle |
|---|---|---|
| status | UNKNOWN | **INVALID** |
| errors | `[]` | **`["yaml_parse_error"]`** |
| events | `[{name: "", ...}]` | **`[]`** |
| on_key_is_string | true | **false** |
| evaluation.reason | `unknown` | `invalid` |
| unsupported | `["unsupported_event:"]` | `[]` |

根因：TS 的 `yaml` 解析器接受裸 `:` 为 null 键 → 渲染 `""` → 未知事件 UNKNOWN；PyYAML 解析器在 Oracle 代码运行前就报错（`expected <block end>, but found ':'`），Oracle 只能返回 INVALID。FIX-P0-03 报告 §7-1 如实披露，未修。

### 2.2 X-filter-empty：裸空键（filter 键）

输入：`on: {push: {: [main]}}`（push 的 config 映射中一个裸 `:` 键）：

| 字段 | TS | Oracle |
|---|---|---|
| status | UNKNOWN | **INVALID** |
| errors | `[]` | **`["yaml_parse_error"]`** |
| events | `[{name: "push", ...}]` | **`[]`** |
| unsupported | `["unsupported_filter:"]` | `[]` |

与 2.1 同根（PyYAML 解析器层拒绝），FIX-P0-03 报告 §7-1（K5）如实披露，未修。

### 2.3 J20：标量 job 定义的 `unsupported_job` 字段

输入：`jobs: {test: True}`（job 定义为标量而非映射）：

| 侧 | 输出 |
|---|---|
| TS (`extractJobs`) | `[{"id": "test", "if": "__unsupported_if__", "name": null, "needs": []}]` |
| Oracle (`extract_jobs`) | `[{"id": "test", "if": "__unsupported_if__", "name": null, "needs": [], "unsupported_job": null}]` |

除 `unsupported_job` 字段有无外全部一致（同为不支持的 job）。根因已定位到行：TS `src/core/e2e.ts` 的非 dict 分支（L276–285）push 的对象**不含** `unsupported_job` 字段（该字段只在 dict 分支 L294 `unsupported_job: extractUnsupportedJob(def)` 中加入）；Oracle `oracle/checkpath_oracle/parser.py` L861–865 的非 dict 分支显式写出 `"unsupported_job": None`。FIX-P0-03 报告 §7-3 如实披露，未修（称需动 TS 产品代码或改 Oracle 输出形状）。

**修复方向（供 parent 决策，不由复核员实施）：**
- 裸空键：TS 侧为事件名/ filter 键为空串时判 INVALID（空事件名不是合法事件，GitHub 也会拒绝此类 workflow；属小而明确的产品规则），或 Oracle 侧等价对齐；不得对输入文本做手术式预处理（违反 §7.3“分别读取原始 workflow YAML”）。
- J20：Oracle 侧在非 dict 分支省略 `unsupported_job`（与 TS 对齐；不动产品代码），或 TS 侧在非 dict 分支补 `unsupported_job: null`。一处改动即可。

### 2.4 已排除的相邻变体（均 MATCH，证明分歧面很窄）

- X-empty-2（两个裸 `:` 键）：双边 INVALID（TS 判重复键，Oracle 解析报错）→ MATCH。
- X-empty-3（裸 `:` + `null:`）、X-empty-4（裸 `:` + `~:`）：双边 INVALID → MATCH。
- X-empty-5（两个引号空键 `''`）、X-empty-6（引号空键 + `null:`）：MATCH。
- X-huge-1（`9007199254740993:`）、X-huge-2（400 位整数键）：双边渲染一致（double 精度丢失 / `Infinity`，与 TS 的 `Number()` 行为一致）→ MATCH。
- X-nan-dup（`.nan:`+`.nan:`）、X-inf-dup（`.inf:`+`.inf:`）、X-neg0-dup（`-0:`+`0:`）：MATCH。
- 结论：裸空键分歧仅在**恰好出现一次**时存在（单个事件键、或单个 filter 键）；一旦文件另有 INVALID 成因，双边即一致。

## §3 定级：P0（分组计 1 项）的依据与权衡

定级 **P0（1 项，分组计，含 §2 的 3 例）**，依据：

- PROJECT_BOOK §7.3：“Oracle 与实现**任何字段不一致都判失败；不得通过忽略字段、容差或人工解释来放行**。”
- PROJECT_BOOK §8.2：Oracle parity 100%，“**所有受支持输入完全一致**”。
- IMPLEMENTATION_PLAN §8.1：“Oracle 输出规范化 JSON；差分脚本逐字段比较。**任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。**”
- IMPLEMENTATION_PLAN §10：P0 阻断明确包含 “**Oracle mismatch**”。
- **终审 R2 的裁决先例**：R3 把同类分歧（`True:`/`true:`，双边 fail-closed、无 false PASS 风险、已披露）降为 P2 的理由被终审明确驳回，重新定级为 P0——硬约束不允许以人工解释降级。本轮 3 例与 R2 P0 是同一模式（解析器层分歧、双边 fail-closed、无 false PASS 风险、已披露）：裸空键 TS UNKNOWN vs Oracle INVALID；J20 仅一字段有无。把它们降为 P2 将重复 R3 被驳回的错误。终审 R3 若复现任一例，将得到与 R2 P0 相同的裁决模式，必为 FAIL。

**已权衡的反方考虑（记录在案，不改变定级）：**
- (a) §7.3 要求 Oracle 使用 `yaml.BaseLoader`，而 bare `:` 恰是 BaseLoader 解析器无法解析的输入——分歧源于规格指定的组件本身。但修复不必在 Oracle 侧：TS 侧拒空键（§2 修复方向）即可对齐，且不违反任何规格条款。
- (b) 3 例输入均为退化输入（真实 workflow 几乎不会出现裸空键或标量 job 定义）。但“真实 workflow 几乎不会出现”正是 §7.3 明文禁止的“人工解释”放行理由；且 R2 P0 的输入（重复键）同样是无效 workflow，仍被定为 P0。
- (c) J20 的分歧只有一个 null 值字段，语义内容完全一致。但 §7.3 的“任何字段”不分语义轻重；且 R4 的 P0-1 教训正是 `unsupported_job` 字段的有无（`evaluateJobsKeyed` 丢字段）曾构成 P0。
- 因此：按本项目自身的规则与先例，3 例合为 1 个 grouped P0；修复方向明确且工作量小（§2），不是死胡同。

## §4 违规捷径检查：无

在工作树上对修复区间 `53fa36a..2388be1`（201 文件，+6720/−91）核查：

- **测试被删：无。** `git diff --diff-filter=D --name-only 53fa36a..2388be1` 为空。
- **TS 产品代码未动：无 `src/` 改动。**（与 FIX-P0-03 报告一致。）
- **Oracle 比较范围被缩小：无。** `scripts/oracle-diff*.mjs` 的 diff 共 11 行，全部是计数/注释（trigger 45→66、golden 84→105）；比较函数 `deepDiff` 未动（diff 中 0 命中）；各脚本头注仍写明 “with no ignore list”。
- **mismatch 忽略名单：无。** `git diff -- scripts/` 中 `^\+.*(ignore|allowlist|whitelist|skip)` 除 “no ignore list” 陈述外 0 命中。
- **P0 被改回 P2：无。** 终审 R2 的 P0 在代码与测试中仍按阻断处理；测试 diff 均为计数上调（trigger 45→66、golden 84→105）与两个新测试文件（`scalar-rendering-yaml.test.ts` 22、job-dag `scalar-rendering-jobs.test.ts` 16）。
- **夹具真实：** trigger suite 66 条（`source: fix-p0-03` 21 条，T6-21..T6-41）；golden suite 105 条（G-85..G-105）；`parser-divergence/scalar-rendering/` 21 yml + expected.json + README；`scalar-rendering-jobs/` 15 yml。`build-golden.py --check-only` exit 0（105 cases），既有 84 夹具未被改写（生成器逻辑与 R4 同法核查）。

## §5 全量重跑（干净克隆 `/tmp/r5clone`，HEAD 2388be1，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm test` | **982/982 通过**（34 test files；链中一条 “scenario file failed validation” 为负例测试的预期输出，非失败） |
| `npm run test:oracle` | 105/105，0 偏差，0 false PASS；`ORACLE_PARITY_REPORT.json`: fixture_count 105, passed 105, failed 0, oracle_mismatch_count 0；unsupported 32/32 UNKNOWN |
| `npm run oracle:diff:trigger` | 66 夹具，0 mismatch |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch |
| `npm run s0:oracle` | 0 false PASS；unsupported 2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；determinism 100 次运行 1 个唯一哈希；network matches 0（gate hash 见 §6） |
| `npm run release:verify` | **PASS**；离线静态扫描 34 文件 0 远程引用；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `python3 scripts/build-golden.py --check-only` | golden cases 105，exit 0 |
| `npm run typecheck` | exit 0 |

（以上电池在干净克隆内一次链式跑完，`proc_f6e6f39675cc`，exit 0；输出存 `/tmp/r5probe/battery.log`。克隆内 `evidence/` 再生文件未带回工作树。）

## §6 试冻三哈希（干净克隆，`--trial`，两次）

两次 `npm run release:freeze -- --trial`（HEAD 2388be1）哈希完全一致，确定性成立：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `c6554c0751e79789bc324dab67c69d91f4e640095b1858125479f58b31ab7118`（1,428 文件） | 相对 R2 的 1,209 文件 +219（FIX-P0-02/03 新增夹具/测试/交接报告）；含 `scripts/deterministic-zip.py`（zip 内 1,789 条目） |
| dist.zip | `da130ad2747a810c0f62488245fe7902298199faa6e8372f3975d58b573911e6`（114 文件） | **与 R2 冻结的 dist.zip 哈希逐字节一致**（修复未动产品代码） |
| RELEASE_MANIFEST.json | `abb4125c5ef45290a70506ab2edb96df9f7b10f9cecad0d2fb1b89b5b2667005` | 新 manifest（2388be1 树） |

注：2388be1 尚无正式冻结（T014 未做），故此处是“同一树两次试冻哈希一致”的确定性验证，而非与已冻结包比对。仓库内 `release/` 仍为 R2 冻结物，三哈希与 `SHA256SUMS.txt` 一致（source `3a778b93…`、dist `da130ad2…`、manifest `04a07733…`，磁盘重算吻合）。

**S0 gate hash 说明：** 干净克隆的 `S0_GATE.json` status 为 PASS，但 `gate_report_sha256` 为 `0fdf620b…`，与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是 `environment_fingerprint`**（克隆路径不同导致；自哈希按文件内注明的公式重算与记录值一致，`match: True`）；其余全部字段一致（`input_fixture_sha256`、`conditions` 全 true、determinism 1 哈希、unsupported 2/2、network 0）。这不是回归（与 R4 的 `4617899b…` 为同一现象，不同克隆路径不同指纹）。

## §7 终审 R2 的 6 个 P2：全部仍成立；新增 P2 1 项

| P2 | 复核（2388be1） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。冻结脚本未动（`git diff 53fa36a..2388be1 -- scripts/deterministic-zip.py` 为空），仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§6） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。README 仍为 “P95 768.3 ms, peak RSS 98.3 MiB”，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 明确写 “Windows PowerShell: NOT_TESTED”，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；全仓库 grep `USER_VALUE` 无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准，见 §6 末） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。`release/RELEASE_MANIFEST.json` 内仍为 “PENDING — …；see evidence/release/T014_FREEZE_REPORT.md”，source_commit `538c669`；T014 报告 §9 已补实际 freeze commit `03c2f16` 及父子关系 |

**新增 P2-R5-1：复核探针证据未入仓库。** R4 的 `/tmp/r4probe/` 已不在（VM /tmp 已清），FIX-P0-03 的 `/tmp/p0probe-residual/` 与本轮 `/tmp/r5probe/` 同样是临时目录；探针矩阵全文只存在于 R4/R5 报告中，脚本不可从仓库重跑。缓解：本报告 §1–§2 列出全部 66 例输入与结果，可按文重建；建议后续把探针 case 文件纳入仓库（或随复核报告归档 Drive）。非阻断。

另：许可证仍为 PENDING_SAM_DECISION（`release:verify` license guard 通过，无 LICENSE 文件）。

## §8 未审查事项

- T014 正式冻结未做（不在本任务内）；终审 R3 未发；Drive 未动。
- R4 报告 §10 的流程教训本轮已遵守：修复与复核未在同一工作树并行；全部验证在干净克隆中完成，未受污染。

## §9 亲自跑过的命令与结果（摘要）

- `git log` / `git status`（审查开始）：HEAD `2388be1`，工作树仅有未跟踪的 R4 报告与 `reports/`。
- 干净克隆：`git clone ~/workspace/p020-checkpath /tmp/r5clone`，HEAD `2388be185787b324e147918fb3ed3d6482601bd7`；parser.py md5 `2329d662…` 与 `git show HEAD:` 一致；`npm ci` 181 包。
- 探针：自建 TS esbuild bundle（`/tmp/r5probe/ts-probe.cjs`，从克隆源码重建）+ `scripts/oracle-parse-probe.py` / `oracle-jobs-probe.py`；66 例矩阵（`/tmp/r5probe/run_matrix.py`），63 MATCH / 3 DIFF / 0 ERROR（§1–§2 全表）；B 组顺序敏感 6 例各 3 次重跑均稳定；smoke 输入双边全 JSON 一致。
- `git diff 53fa36a..2388be1` 全量核查（§4）：无删除文件；无 `src/` 改动；oracle-diff diff 仅计数注释；grep ignore/allowlist 除陈述外 0 命中；suite 计数 trigger 66 / golden 105。
- 全量电池（§5）+ 试冻两次（§6）+ S0_GATE.json 逐字段 diff 与自哈希重算（§6 末）。
- 规格原文核对：`~/workspace/P020_PROJECT_BOOK.md` §7.3、§8.2；`~/workspace/P020_IMPLEMENTATION_PLAN.md` §8.1、§10。
- J20 根因定位：`src/core/e2e.ts` L276–285（非 dict 分支无 `unsupported_job` 字段）vs `oracle/checkpath_oracle/parser.py` L861–865（非 dict 分支显式写出 `"unsupported_job": None`）。

## §10 给 parent 的下一步

1. **不要**就 2388be1 发终审 R3（必 FAIL：终审若复现 §2 任一例，将得到与 R2 P0 相同的裁决模式）。
2. 定点修复 §2 的 3 例残留（修复方向见 §2 末；工作量小；J20 一处改动、裸空键一条规则），然后派**新的独立复核 R6**（审查对象为修复后 HEAD；复核员一律在干净克隆里验证，不得与修复并行同一工作树）。
3. R6 PASS 后：T014 正式重新冻结 → Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3（同一立项对话，GPT-6 + Extra High + 完整结尾句）。
4. R6 若 NOT PASS：按其报告修残留分歧，再开 R7 复核；PASS 前绝不标记 ACCEPTED、绝不启动 P021。
5. 建议：把探针 case 文件纳入仓库或随复核报告归档（P2-R5-1），避免 /tmp 清失后只能按报告文本重建。
