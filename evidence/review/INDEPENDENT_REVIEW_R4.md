# P020 CheckPath — T013 第四轮独立复核（R4）

**Verdict: NOT PASS — P0 1 / P1 0 / P2 6**

| 项 | 内容 |
|---|---|
| 审查对象（任务指定） | commit `53fa36a`（终审 R2 P0 修复 FIX-P0-02，`ba79452` + `53fa36a`） |
| 报告时实际 HEAD | `2388be1`（见 §0：审查进行中 HEAD 移动，审查对象未换） |
| 审查窗口 | 2026-11-08 ~23:29 GMT → 2026-11-09 ~00:10 GMT |
| 复核员 | 独立会话，与 T001–T012 施工者、FIX-P1-01/FIX-P1-02/FIX-P0-02 修复执行员、前三轮 T013 复核员完全隔离；只审查，不改代码 |
| 结论 | 终审 R2 的 P0（`True:` vs `true:`）已修好；但同类同根的分歧仍在：**数字标量拼写分歧 13 例（TS INVALID vs Oracle UNKNOWN）+ 事件名渲染分歧 9 例**，构成新的 grouped P0。全部验收套件在 53fa36a 上通过，但 Oracle parity 对探针输入不成立，故 NOT PASS |

## §0 审查对象与污染声明（先读）

1. **审查开始时 HEAD 确为 `53fa36a`**，工作树干净（仅未跟踪 `reports/`）。审查对象按任务书锁定为 `53fa36a`。
2. **审查进行中工作树被污染。** 约 2026-11-08 23:39 GMT 起，兄弟协调员会话（`3ec7ebab`，终审 R2 修复总协调员，仍在运行）开始在工作树内做未提交的 FIX-P0-03（完整 YAML 1.2 core-schema 标量修复）。`git status` 出现 62 项改动：`oracle/checkpath_oracle/parser.py` 被重写（mtime 23:39:52，md5 与 HEAD 不符，提及 FIX-P0-03）、`scripts/build-golden.py`、`scripts/oracle-diff*.mjs`、两套 `suite.json`、多份 evidence JSON 被改，并新增 trigger T6-21..T6-41、golden G-85..G-105、`scripts/oracle-jobs-probe.py` 等。复核员的探针结果在污染前后出现矛盾（同一 N3 探针循环中报 Oracle UNKNOWN、直接重跑报 INVALID），由此发现污染。
3. **处理：** 复核员杀掉了自己正在被污染树上跑的后台测试电池（`proc_38b60c354a1e`，结果作废），未碰工作树（未 stash、未还原、未动修复方任何文件），全部验证改到**干净克隆 `/tmp/r4clone`**（`git clone` 于 53fa36a，`npm ci` 完成；`git rev-parse HEAD` = `53fa36a59add83f59321ce1797a635740abcae59`，工作树干净，`oracle/checkpath_oracle/parser.py` md5 `595fb301c380811836394b0142436d17` 与 `git show HEAD:...` 一致）。**本报告的全部 verdict 证据均来自该干净克隆，工作树上的任何运行结果一律未采信。**
4. **自我纠正：** 污染前复核员曾记录 K3（`1E2:` vs `100:`）、K4（`.INF:` vs `.inf:`）“两边均为 INVALID，一致”。该记录是**污染产物**（该两例实际跑在已被改的 parser.py 上）。干净克隆重跑证明两者均为 DIFF（TS INVALID vs Oracle UNKNOWN）。本报告以干净克隆结果为准，旧记录作废。
5. **审查进行中 HEAD 移动。** 报告时（2026-11-09 00:08 GMT）主仓库 HEAD 已变为 **`2388be1`**，新增两个 commit：`c24972b` “FIX-P0-03: Oracle scalar rendering per YAML 1.2 core (bool/null/number) — residual R2 P0 divergence closed”与 `2388be1` “FIX-P0-03: handoff report TASK_REPORT.md”。工作树现仅剩未跟踪 `reports/`。**按任务书，审查对象不换，仍为 `53fa36a`；FIX-P0-03 未在本轮审查，需另开独立复核（R5）**，见 §8。

## §1 终审 R2 的 P0：已修好（已验证）

R2 输入（`on:` 下 `True: branches:[main]` 与 `true: branches:[dev]`）在干净克隆中双边一致：

| | TS | Oracle |
|---|---|---|
| status | INVALID | INVALID |
| errors | `["yaml_parse_error"]` | `["yaml_parse_error"]` |
| events | `[]` | `[]` |
| on_key_is_string | false | false |

探针 R2 例 MATCH。新增夹具真实覆盖：`tests/fixtures/trigger/T6-20-dup-bool-true/workflow.yml` 与 R2 输入逐字一致（仅 name 不同，SHA-256 `9dc28ab1…`）；`tests/fixtures/parser-divergence/duplicate-key/dup-bool-true.yml` + expected.json 第 4 个 case 两边均为 INVALID / yaml_parse_error / events `[]`；golden `G-84-fix-p0-02-T6-20-dup-bool-true`（trigger INVALID / yaml_parse_error，required check `test` → PENDING_NOT_REPORTED，`input_sha256 8aac8d63…`）。套件计数 trigger 45、golden 84，见 §4。

修复规则的书面依据：FIX-P0-02 只改 Oracle 侧 `_StrictBaseLoader` 的重复检测——plain 标量 `true/True/TRUE` → 同一 bool true，`false/False/FALSE` → 同一 bool false，`null/Null/NULL/~/空` → 同一 null 键；仅 `style is None` 的 plain 标量折叠，引号键不折叠；`on/On/ON`、`yes/Yes` 不折叠。依据写在 parser.py docstring、parser-divergence README 与 `handoff/P020-FIX-P0-02/TASK_REPORT.md` §1。该规则与 PROJECT_BOOK §7.3、IMPLEMENTATION_PLAN §8.1/§10 不冲突（见 §2.3）；**问题是规则的覆盖面不完整**。

## §2 新发现：Grouped P0 — 标量规范化不完整（22 例探针分歧）

### 2.1 方法

自建探针（`/tmp/r4probe/`，不在仓库内）：TS 侧为 `src/core/workflow-parser.ts` 的 esbuild CJS bundle（从干净克隆源码重建，md5 `82c814f8…`，与污染前从主仓库构建的 bundle 逐字节一致，证明 TS 侧未被改动）；Oracle 侧为仓库自带 `scripts/oracle-parse-probe.py`（cwd=`/tmp/r4clone`）。46 个 YAML 探针输入，逐字段比较 status / errors / events / on_key_is_string（与项目 `deepDiff` 相同的语义：数组按序逐项比，见 §3）。每个输入均为最小 workflow（`name` + `on:` + 一个 `test` job）。

**结果：46 例，MATCH 24，DIFF 22。**

### 2.2 全部 22 例分歧（干净克隆实测）

**A 组 — 有效性分歧（13 例）：TS INVALID / yaml_parse_error / events `[]`，Oracle UNKNOWN / errors `[]` / events 2 个。** 与 R2 P0 同类同根（重复键检测不一致）：

| 例 | 输入（`on:` 下两键） | Oracle events |
|---|---|---|
| E3 | `1:` + `01:` | `["1","01"]` |
| N3 | `1.5:` + `1.50:` | `["1.5","1.50"]` |
| N4 | `1:` + `1.0:` | `["1","1.0"]` |
| N5 | `0x10:` + `16:` | `["0x10","16"]` |
| N6 | `+1:` + `1:` | `["+1","1"]` |
| N7 | `-0:` + `0:` | `["-0","0"]` |
| M1 | `0o17:` + `15:` | `["0o17","15"]` |
| M3 | `1e2:` + `100:` | `["1e2","100"]` |
| M4 | `0.5:` + `.5:` | `["0.5",".5"]` |
| M5 | `5.:` + `5.0:` | `["5.","5.0"]` |
| M6 | `.inf:` + `.Inf:` | `[".inf",".Inf"]` |
| K3 | `1E2:` + `100:` | `["1E2","100"]` |
| K4 | `.INF:` + `.inf:` | `[".INF",".inf"]` |

**B 组 — 事件名渲染分歧（9 例）：status 与 errors 一致（均为 UNKNOWN / `[]`），仅 events 数组不同。** 同根：Oracle 按原始标量文本、按文件顺序输出事件名；TS 按解析后的值渲染并排序：

| 例 | 输入 | TS events | Oracle events |
|---|---|---|---|
| P2c | `True:` + `FALSE:` | `["true","false"]` | `["True","FALSE"]` |
| N2 | 单个 `01:` | `["1"]` | `["01"]` |
| N8 | `1_000:` + `1000:` | `["1000","1_000"]` | `["1_000","1000"]` |
| M2 | `0b101:` + `5:` | `["5","0b101"]` | `["0b101","5"]` |
| M7 | `.nan:` + `.NaN:` | `["NaN"]`（1 个） | `[".nan",".NaN"]`（2 个） |
| M8 | `1_0:` + `10:` | `["10","1_0"]` | `["1_0","10"]` |
| K1 | `0O17:` + `15:` | `["15","0O17"]` | `["0O17","15"]` |
| K2 | `0X10:` + `16:` | `["16","0X10"]` | `["0X10","16"]` |
| K6 | `0b0:` + `0:` | `["0","0b0"]` | `["0b0","0"]` |

N8/M2 各跑 6 次均稳定，非随机。M7 最值得注意：TS 把 `.nan`/`.NaN` 折成**一个**事件，Oracle 保留两个——事件个数都不同。

### 2.3 根因与定级

根因：TS 所用 `yaml` 解析器按 YAML 1.2 core schema 解析标量（`1`/`01` 同为整数 1，`1.5`/`1.50` 同为浮点，`0x10`/`16`、`0o17`/`15`、`1e2`/`100`、`1_000`/`1000` 均同值，`.inf`/`.Inf`/`.INF` 同值，`.nan`/`.NaN` 同值），其 uniqueKeys 检查据此判重复、并按解析值渲染事件名；FIX-P0-02 只给 Oracle 加了 bool/null 拼写折叠，**数字/无穷/NaN 拼写明确未探针、未折叠、未改动**（parser.py 注释原文 “Deliberately NOT in … (not probed, not folded)”；FIX-P0-02 报告 §7-1 亦列为遗留）。于是同一输入在两边走出不同的键集合与事件名。

定级为 **P0（1 项，分组计，含上述 22 例）**，依据：

- PROJECT_BOOK §7.3：“Oracle 与实现任何字段不一致都判失败；不得通过忽略字段、容差或人工解释来放行。”
- PROJECT_BOOK §8.2：Oracle parity 100%，“所有受支持输入完全一致”。
- IMPLEMENTATION_PLAN §8.1：“Oracle 输出规范化 JSON；差分脚本逐字段比较。任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。”
- IMPLEMENTATION_PLAN §10：P0 阻断明确包含 “Oracle mismatch”。
- 终审 R2 的裁决先例：R3 把同类分歧降为 P2 的理由（两边均 fail-closed、无 false PASS 风险）被终审明确驳回——硬约束不允许以人工解释降级。B 组虽两边都判 UNKNOWN、无 false PASS 风险，但 events 字段确实不一致，按同一条规则仍是 mismatch；把它降为 P1/P2 将重复 R3 被驳回的错误。故 A、B 两组合并计为 1 个 P0。

反向核查（MATCH 的 24 例，证明修复的边界是正确的）：R2（True:/true:）、P2a（TRUE:/True:）、P2b（False:/false:）、P4a/b/c（null 三拼写）、P3a（On:/on: 不折叠）、P3b（yes:/Yes: 不折叠）、P5（单个 Push:）、P6（单个 true:）、Q1/Q2（引号 "True"/'True' + true: 不折叠）、Q3（引号 "true" + true:）、Q4（空键 + 空键）、Q5（ON:/on:）、E1/E2（空键 + null:/~:）、E4（`1:`+`1:` 真重复）、E5（jobs 层 True:/true:）、E6（"on": + on:）、E7/E8（正常 push / on 字符串）、N1（单个 `1:`）、K5（单个 `1_000:`）。三重复键旧夹具（dup-branches/dup-event/dup-name）未改动且全过。

### 2.4 影响

- 这不是回归：53fa36a 相对 R2 冻结基线没有丢掉任何已通过的 parity（§4 全部 0 mismatch），而是 FIX-P0-02 的覆盖面止于 bool/null，数字族从一开始就不在修复范围内。
- 终审 R3 若复现任一 A 组输入，将得到与 R2 P0 完全相同的裁决模式（TS INVALID vs Oracle UNKNOWN），必为 FAIL。
- 修复方向（供 parent 决策，不由复核员实施）：Oracle 侧按 YAML 1.2 core schema 完整解析 plain 标量并按 TS 方式渲染事件名（bool/null/number/inf/nan 全族），或等价地使两边键集合与事件名渲染完全一致；并补相应 fixture 与回归测试。注意：不得删测试、缩比较范围、加忽略名单、或把 P0 改回 P2。

## §3 违规捷径检查：无

在干净克隆上对修复区间 `f4bc39c..53fa36a`（24 文件，+731/−47）核查：

- **测试被删：无。** `git diff --diff-filter=D --name-only f4bc39c..53fa36a` 为空。
- **Oracle 比较范围被缩小：无。** `scripts/oracle-diff.mjs` 仅改 1 行（golden 计数注释 83→84）；`scripts/oracle-diff-trigger.mjs` 仅改计数注释（44→45）与说明。比较函数 `deepDiff`（`scripts/oracle-diff.mjs` L116 起）仍逐字段递归比对，数组按序逐项比对，无排序、无容差；各 oracle-diff 脚本头注仍写明 “with no ignore list”。
- **mismatch 忽略名单：无。** 全树 grep `ignore|allowlist|whitelist` 在 `scripts/oracle-diff*.mjs` 与 `scripts/oracle-diff.mjs` 中只命中 “no ignore list / no ignore-field whitelist” 的陈述性注释与文档字符串，无实现代码。
- **P0 被改回 P2：无。** 终审 R2 的 P0 在代码与测试中仍按阻断处理；`tests/unit/diff-boundaries/duplicate-key-yaml.test.ts` 删除的是旧的 “assert they disagree” 锁定描述与 `toHaveLength(3)`，替换为 4 形态一致断言（`toHaveLength(4)`，T6-17..T6-20 / G-81..G-84）；其余测试 diff 均为计数上调（44→45、83→84）。`scripts/oracle-diff*.mjs`、`build-golden.py` 的改动同为计数/注释。

## §4 全量重跑（干净克隆 `/tmp/r4clone`，HEAD 53fa36a，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm test` | **860/860 通过**（32 test files，26.63s；另单独重跑取计数，exit 0） |
| `npm run test:oracle` | 84/84，0 偏差，0 false PASS；`ORACLE_PARITY_REPORT.json`: fixture_count 84, passed 84, failed 0, oracle_mismatch_count 0；unsupported 19/19 UNKNOWN |
| `npm run oracle:diff:trigger` | 45 夹具，0 mismatch |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch |
| `npm run s0:oracle` | 0 false PASS；unsupported 2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；determinism 100 次运行 1 个唯一哈希；network matches 0（gate hash 见 §5） |
| `npm run release:verify` | **PASS**；离线静态扫描 34 文件 0 远程引用；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `python3 scripts/build-golden.py --check-only` | golden cases 84，exit 0，既有 83 夹具字节未变 |
| `npm run typecheck` | exit 0 |

（以上电池在干净克隆内一次链式跑完，`proc_b85b14bff898`，exit 0；npm test 计数单独重跑确认。）

## §5 试冻三哈希（干净克隆，`--trial`，两次）

两次 `npm run release:freeze -- --trial`（HEAD 53fa36a）哈希完全一致，确定性成立：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `3faa60468eaa6ce0eabee34ca0630bec80e8fa7ff8fbde5c4776eaa6180e4e88`（1,239 文件） | 相对 R2 的 1,209 文件 +30（FIX-P0-02 新增夹具/测试/交接报告）；“build inputs clean vs HEAD；freezer script tracked at HEAD” |
| dist.zip | `da130ad2747a810c0f62488245fe7902298199faa6e8372f3975d58b573911e6`（114 文件） | **与 R2 冻结的 dist.zip 哈希逐字节一致**（修复未动产品代码） |
| RELEASE_MANIFEST.json | `df4bd664d44ddf6eeb5ecd1013aae0720b2d51ce62173e224fffc665930f9f69` | 新 manifest（53fa36a 树） |

注：53fa36a 尚无正式冻结（T014 未做），故此处是“同一树两次试冻哈希一致”的确定性验证，而非与已冻结包比对。仓库内 `release/` 仍为 R2 冻结物，三哈希与 `SHA256SUMS.txt` 一致（source `3a778b93…`、dist `da130ad2…`、manifest `04a07733…`，磁盘重算吻合）。

**S0 gate hash 说明：** 干净克隆的 `S0_GATE.json` status 为 PASS，但 `gate_report_sha256` 为 `4617899b…`，与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是 `environment_fingerprint`**（克隆路径不同导致；该指纹取自 `env-check` 输出，`gate_report_sha256` 是本文件去掉自身 hash 字段后的自哈希，故随指纹变）；其余全部字段一致，status PASS；按文件内注明的公式重算自哈希与记录值一致。这不是回归。

## §6 终审 R2 的 6 个 P2：全部仍成立

| P2 | 复核（53fa36a） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。冻结脚本从 HEAD 读树（`git ls-files` / `git cat-file --batch`），依赖 Git 仓库身份，属设计限制；新鲜克隆试冻已通过（§5） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。README 仍为 “P95 768.3 ms, peak RSS 98.3 MiB”，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 明确写 “Windows PowerShell: NOT_TESTED”，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；全仓库 grep `USER_VALUE` 无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准，见 §5 末） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。`release/RELEASE_MANIFEST.json` 内仍为 “PENDING — …；see evidence/release/T014_FREEZE_REPORT.md”，source_commit `538c669`；T014 报告 §9 已补实际 freeze commit `03c2f16` 及父子关系 |

另：许可证仍为 PENDING_SAM_DECISION（`release:verify` license guard 通过，无 LICENSE 文件）。

## §7 规格一致性

- FIX-P0-02 的折叠规则本身与 PROJECT_BOOK §7.3、IMPLEMENTATION_PLAN §8.1/§10 一致（见 §2.3 引文）；缺口在覆盖面，不在规则方向。
- 修复方未动 TS 产品代码（`git diff` 中无 `src/` 改动；TS bundle 从干净克隆重建与污染前 bundle md5 相同 `82c814f8…`）。
- 修复方探针表（FIX-P0-02 报告 §2）中 P1/P2a/P2b/P3a/P3b/P4a-c/P5/P6/Q1–Q4/E1/E2/E5–E8 的结论，干净克隆重跑全部复现；其 “P2c 遗留” 与本报告 B 组一致；其 “数字键未探针” 在本报告中补齐为 A 组 13 例 + B 组数字相关 7 例（N2/N8/M2/M7/M8/K1/K2/K6）。

## §8 未审查：FIX-P0-03（需另开 R5）

审查进行中提交的 `c24972b` + `2388be1`（FIX-P0-03：Oracle 按 YAML 1.2 core schema 渲染标量，bool/null/number；交接报告 508 行）**不在本轮审查范围内**。其提交信息称 “residual R2 P0 divergence closed”，与本报告 §2 的发现同域，但复核员未审查其代码、未跑其测试、未核对其夹具（T6-21..T6-41、G-85..G-105 等均在其提交内）。**在 FIX-P0-03 得到独立复核（R5）PASS 之前，不得做 T014 重新冻结、不得动 Drive、不得发终审 R3、不得标记 ACCEPTED、不得启动 P021。**

## §9 亲自跑过的命令与结果（摘要）

- `git log` / `git status`（审查开始）：HEAD `53fa36a`，工作树干净（仅 `?? reports/`）。
- 探针：自建 TS esbuild bundle + `scripts/oracle-parse-probe.py`；46 例矩阵（`/tmp/r4probe/run-matrix-clone.py`），24 MATCH / 22 DIFF（§2.2 全表）；N8/M2 各 6 次重复均稳定。
- `git diff f4bc39c..53fa36a` 全量核查（§3）：无删除文件；oracle-diff diff 仅计数注释；grep ignore/allowlist 仅命中 “no ignore list” 陈述。
- 夹具核查：T6-20 workflow.yml、parser-divergence expected.json case 4、G-84 expected.json（trigger INVALID / yaml_parse_error / events `[]`，required check PENDING_NOT_REPORTED）、suite 计数 trigger 45 / golden 84。
- 全量电池（§4）+ 试冻两次（§5）+ S0_GATE.json 逐字段 diff 与自哈希重算（§6 前注）。
- 规格原文核对：`~/workspace/P020_PROJECT_BOOK.md`（SHA-256 `028c2472…`）§7.3、§8.2；`~/workspace/P020_IMPLEMENTATION_PLAN.md` §8.1、§10。
- 污染调查：`git status`（62 项）、parser.py mtime/md5、`subagent.list`（兄弟协调员 `3ec7ebab` 仍在运行）、`ps`；杀掉被污染电池 `proc_38b60c354a1e`；干净克隆验证（HEAD/md5/node_modules）。

## §10 给 parent 的下一步

1. **不要**就 53fa36a 发终审 R3（必 FAIL：A 组任一输入都会复现 R2 P0 模式）。
2. 对 FIX-P0-03（HEAD `2388be1`）派**新的独立复核（T013 R5）**：审查对象改为 `2388be1`，用本报告 §2 的 46 例探针矩阵（`/tmp/r4probe/` 下 case 文件与 `run-matrix-clone.py` 可复用，探针脚本在 `/tmp/r4probe/`；注意 `/tmp` 重启会清，重要时先拷到 workspace）逐项复测 A、B 两组，并重跑 §4 全量电池 + 试冻三哈希。
3. R5 PASS 后：T014 正式重新冻结 → Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3（同一立项对话，GPT-6 + Extra High + 完整结尾句）。
4. R5 若 NOT PASS：按其报告修残留分歧，再开 R6 复核；PASS 前绝不标记 ACCEPTED、绝不启动 P021。
5. 流程教训：修复总协调员与独立复核员**不得在同一工作树上并行**——本次 FIX-P0-03 在 R4 审查中途改动工作树，污染了复核员的探针与电池，险些导致 K3/K4 误判。以后复核期间冻结修复写入，或复核员一律在干净克隆里验证。
