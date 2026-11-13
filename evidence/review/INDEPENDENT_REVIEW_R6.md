# P020 CheckPath — T013 第六轮独立复核（R6）

**Verdict: NOT PASS — P0 1 / P1 0 / P2 8**

| 项 | 内容 |
|---|---|
| 审查对象（任务指定） | commit `baf881f`（FIX-P0-06：`f29faec` 代码 + `baf881f` 交接报告，修 N5 集合别名键与 H6 tab 分歧） |
| 审查开始时 HEAD | `baf881f`（`git log` 核对一致，见 §0） |
| 审查窗口 | 2026-11-09 ~03:10 GMT → ~03:40 GMT |
| 复核员 | 独立会话，与 T001–T012 施工者、FIX-P0-02/03/04/05/06 修复执行员、前五轮 T013 复核员完全隔离；只审查，不改代码 |
| 结论 | R2 的 P0、R5 的 grouped P0（裸空键 ×2、J20）、D2、N5、H6 全部关闭；全量电池在干净克隆中通过；试冻两次三哈希一致。但独立探针发现**新的同族分歧：tab 在“行内普通标量进行中出现的引号”内**（4 种形状 × trigger+jobs = 8 处 DIFF），TS 判 VALID、Oracle 判 INVALID，按 §7.3 定 P0，故 NOT PASS |

## §0 审查对象与无污染声明（先读）

1. **审查对象确为 `baf881f`**：审查开始时 `git log --oneline -1` = `baf881f FIX-P0-06: handoff report TASK_REPORT.md`，其父为 `f29faec`，再上为 `5133396`。审查期间 HEAD 未移动（结束时仍为 `baf881f`）。
2. **全部验证均在干净克隆 `/tmp/r6clone` 中完成**（`git clone ~/workspace/p020-checkpath`，`git rev-parse HEAD` = `baf881fd7695d068bff7166aa73835721b35c7b1`；`oracle/checkpath_oracle/parser.py` md5 `d5123e0058569116729db82e171c33a0`，与 `git show HEAD:...` 逐字节一致；`npm ci` 完成）。探针、电池、试冻一律在克隆内跑，**从未在共享工作树上运行任何探针或测试**。工作树上的操作仅为只读（`git log/diff/show`、`grep`、`read`）+ 最后写入本报告与 SUMMARY 两个交付文件。R4 的修复并行污染本轮未复现：审查开始时 FIX-P0-06 已提交，修复协调员的工作已完成。
3. **比较标准**：全 JSON 深相等（trigger 模式的整个 TriggerIR，jobs 模式的整个 job 列表），无容差、无忽略字段——R5 的标准。
4. **探针方法**：TS 侧为 `src/core/workflow-parser.ts` 的 `parseWorkflowYaml` 与 `src/core/e2e.ts` 的 `extractJobs`，经克隆内 esbuild 打包为 CJS bundle（从克隆源码重建）；Oracle 侧为仓库自带 `scripts/oracle-parse-probe.py` / `scripts/oracle-jobs-probe.py`（cwd=`/tmp/r6clone`）。修复方三矩阵直接用仓库内 `evidence/probes/fix-p0-0{4,5,6}/run-matrix.py` 在克隆内重跑；R6 独立探针（`/tmp/r6probe/r6-spot.py`、`r6-spot2.py`，用例按 R5 报告文字与任务简报自写，未抄修复方 cases.json）用同一方法跑。
5. **环境**：Node 24.22.1、Python 3.12.3、PyYAML 6.0.1——与冻结环境一致（不是 GPT 容器的 Node 22 / Python 3.13）。

## §1 既往 P0 全部关闭（已验证）

### 1.1 R2 的 P0（True:/true:）— 关闭

R2 原输入（`on:` 下 `True: branches:[main]` + `true: branches:[dev]`）在 fix-p0-04 矩阵首 66 行（R5 子集）中为 R2 行，双边 INVALID / yaml_parse_error / events `[]`，MATCH。

### 1.2 R5 的 grouped P0（3 例）— 全部关闭

fix-p0-04 矩阵前 66 行（R5 子集）**66/66 MATCH**（见 §5 末）。其中 R5 的 3 处 DIFF 现为：

| 例 | 现结果 |
|---|---|
| X-empty-1（单个裸空键，事件键） | MATCH（双边 INVALID / yaml_parse_error / events `[]`） |
| X-filter-empty（裸空键，filter 键） | MATCH（双边 INVALID / yaml_parse_error / events `[]`） |
| J20（`jobs: {test: True}`） | MATCH（双边 job 对象逐字段一致，`unsupported_job` 字段均无） |

另：R5 §2.4 的 X-empty-2/3/4（两个裸 `:` 键、裸 `:` + `null:`、裸 `:` + `~:`）**不在** fix-p0-04 矩阵的行里（其残留 10 行只含 X-empty-5/6 等 7 例 + 3 例 DIFF；R5 报告自身计数亦有出入：§2 称“残留探针 10”，但 §2.1–2.3 的 3 例 + §2.4 的 10 例合计 13 例）。R6 用自写探针独立补测了这 3 例（见 §2.5）：**全部 MATCH**（双边 INVALID）。该计数出入记为报告瑕疵，不影响定级。

### 1.3 D2（流式别名键）— 关闭

fix-p0-04 矩阵 D2-alias-flow-key 行（flagged 历史标注）现 trigger+jobs 均 MATCH；fix-p0-05 矩阵 76/76。

### 1.4 N5（块式别名键 + 映射锚点）与 H6（tab 族）— 关闭

fix-p0-05 矩阵 **76/76 MATCH**（其 2 个 flagged 行 N5-block-alias-key-map-anchor、H6-flow-alias-tab-before-colon 现均 MATCH）；fix-p0-06 矩阵 **134/134 MATCH，0 非 MATCH**。

### 1.5 R4 的 46 例矩阵 — 仍关闭

包含在 fix-p0-04 矩阵前 66 行内（R4 46 + FIX-P0-03 R1–R10 + R5 残留 10），66/66 MATCH。

## §2 新发现：Grouped P0 — 行内普通标量进行中的引号内 tab（4 种形状，8 处 DIFF）

### 2.1 现象

修复方 FIX-P0-06 报告 §7 称“残留分歧清单：无”。R6 独立探针发现其 `hasRejectedTab` 状态机的一个已记录近似存在未被锁定的缺口：引号起始仅按 token 边界识别（行首、或空格/`[`/`{`/`,` 之后），**但 YAML 中引号只有在行内尚未开始普通标量时才真正开启引用标量**。`run: echo "a<TAB>b"` 里 `"` 前虽为空格，前面已有普通标量 `echo` 在进行中，该 `"` 只是普通标量内的字面字符，tab 仍属普通标量内 tab——PyYAML 拒绝，TS 却放行。

4 种形状（每种 trigger+jobs 各 1 处 DIFF，共 8 处；全部在干净克隆中实测）：

| 例 | 输入 | TS | Oracle |
|---|---|---|---|
| V1（= R6-TAB-QUOTE） | `steps: - run: echo "a<TAB>b"` | **VALID**，events `[push]`，errors `[]` | **INVALID / yaml_parse_error**，events `[]` |
| V2 | `steps: - run: echo 'a<TAB>b'` | **VALID** | **INVALID / yaml_parse_error** |
| V5 | `name: some long` 续行 `  "a<TAB>b" tail`（引号在普通标量续行行首，tab 在引号内） | **VALID** | **INVALID / yaml_parse_error** |
| V9 | `steps: - run: echo "a<TAB>b" # c`（V1 加行尾注释） | **VALID** | **INVALID / yaml_parse_error** |

jobs 模式同 pattern：TS 返回 `[{"id": "test", "if": null, "name": null, "needs": [], "unsupported_job": null}]`，Oracle 返回 `[]`。

### 2.2 两侧输出原文（V1，trigger 模式）

输入 YAML（`\t` 为字面 tab）：

```yaml
name: probe
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo "a	b"
```

TS（`parseWorkflowYaml`）：

```json
{"errors": [], "evaluation": {"reason": "triggered", "triggered": null, "unsupported": []}, "events": [{"branches": null, "branches_ignore": null, "name": "push", "paths": null, "paths_ignore": null, "types": null}], "fixture_id": "probe", "on_key_is_string": true, "schema": "checkpath.trigger-ir/v1", "status": "VALID"}
```

Oracle（`scripts/oracle-parse-probe.py`）：

```json
{"errors": ["yaml_parse_error"], "evaluation": {"reason": "invalid", "triggered": null, "unsupported": []}, "events": [], "fixture_id": "probe", "on_key_is_string": false, "schema": "checkpath.trigger-ir/v1", "status": "INVALID"}
```

### 2.3 与探针驱动无关的最小复现

直接对解析器本身验证（克隆内，不经任何探针驱动）：

- PyYAML `yaml.safe_load('a: "x\\ty"')`（真正的引用标量）：**解析成功** `{'a': 'x\ty'}`；单引号与引用键同理——真正的引用标量内 tab 是合法的。
- PyYAML 对 V1 全文：`ScannerError while scanning for the next token`——拒绝。
- `yaml` npm 包对 V1 全文：解析成功，`steps` 为 `[{"run": "echo \"a\\tb\""}]`——接受。

分歧在解析器层，与探针脚手架无关。

### 2.4 根因（定位到行）

`src/core/workflow-parser.ts` 的 `hasRejectedTab` + `isQuoteStart`（L295 起、L372 起）：`"`/`'` 只要前一字符为空格/`[`/`{`/`,` 即被当作引号起始，进入 quote 状态后其内的 tab 不再拒绝。但 YAML 的引用标量只有在**标量值起始位置**才开始——`run: echo "a…"` 中值起始于 `echo`（普通标量已在进行中），`"` 为字面字符；多行普通标量的续行（V5）同理，`"` 在续行行首也不是引用起始。修复方终报 §3.1 与 `hasRejectedTab` docstring 把此点记为“已记录的近似”（“引号起始仅在 token 边界识别”），并用 Q1 行锁定——但 Q1 的 tab 在引号**外**（`"quoted" tail<TAB>with tab`，tab 在闭合引号之后），两侧同拒，故 MATCH，未能捕获本缺口。Q1 的锁定是真的，但锁定的不是这个形状。

对照：真正的引用标量（V3 `run: "a<TAB>b"`、V4 `name: "a<TAB>b"`、H6-quoted-string-tab `on: {push: "a<TAB>b"}`、T21 引用键）两侧均接受，MATCH——修复方的“引用标量内 tab 合法”结论本身没错，错在**何为引用起始**的判定。

### 2.5 已排除的相邻变体（均 MATCH，证明分歧面有明确边界）

| 例 | 结果 | 说明 |
|---|---|---|
| X-empty-2/3/4（R5 §2.4，未入 fix-p0-04 矩阵） | MATCH（双边 INVALID） | R6 自写探针补测，见 §1.2 |
| Q3-bare-seq-item（FIX-P0-06 §4.1 的自伤事故形状） | MATCH（双边 VALID，tab 在 `- \|` 块标量内容内） | v1 的误拒确已修复 |
| `? {a: b} : 1` / `? [a, b] : 1`（显式集合键） | MATCH | Oracle-stringify 方案被拒的理由仍成立 |
| V3/V4（引用标量作整个值） | MATCH（双边接受） | 真正的引用标量 |
| V6（tab 在引号外：`echo "a" b<TAB>c`） | MATCH（双边拒绝） | tab 在普通标量内 |
| V7（引号贴着普通标量文本：`a"b<TAB>c"d`） | MATCH（双边拒绝） | `"` 前非 token 边界，状态机不误判 |
| V8（引用键内 tab） | MATCH（双边接受） | 真正的引用键 |
| TAB-COMMENT（注释内 tab）、TAB-BLOCK（块标量内容内 tab） | MATCH（双边接受） | 修复方规则正确覆盖 |

结论：分歧仅发生在“**引号出现在行内普通标量进行中、且 tab 落在其引号对之内**”时；其余 tab 形状两侧均已一致。

**修复方向（供 parent 决策，不由复核员实施）：** TS 侧扩展 `hasRejectedTab`：跟踪“行内普通标量进行中”状态，仅当行内尚未开始普通标量时才把 `"`/`'` 当作引号起始（值起始位置：`:` 后、`[`/`{`/`,` 后、`-` 后、行首；多行普通标量的续行不重置该状态）。与 FIX-P0-06 同一机制家族，Oracle 不动，不得对输入文本做手术式预处理（§7.3）。另须加 fixture（trigger + golden）与探针证据，把 V1/V2/V5/V9 四形状锁进仓库。

## §3 定级：P0（分组计 1 项）的依据与权衡

定级 **P0（1 项，分组计，含 §2 的 4 例 / 8 处 DIFF）**，依据：

- PROJECT_BOOK §7.3：“Oracle 与实现**任何字段不一致都判失败；不得通过忽略字段、容差或人工解释来放行**。”
- PROJECT_BOOK §8.2：Oracle parity 100%，“**所有受支持输入完全一致**”。
- IMPLEMENTATION_PLAN §8.1：“Oracle 输出规范化 JSON；差分脚本逐字段比较。**任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。**”
- IMPLEMENTATION_PLAN §10：P0 阻断明确包含 “**Oracle mismatch**”。
- **终审 R2 的裁决先例**：R3 把同类分歧（`True:`/`true:`，双边 fail-closed、无 false PASS 风险、已披露）降为 P2 的理由被终审明确驳回。本轮 4 例与 R2 P0 是同一模式（解析器层分歧、已披露为近似、修复方称无残留），且其中 TS 一侧为 **VALID**（不是双边 fail-closed）：正式管线会对 Oracle 判为不可解析的文档报出 triggered/有效的 verdict——比 R2 P0 更严重，不是更轻。降为 P2 将重复 R3 被驳回的错误。

**已权衡的反方考虑（记录在案，不改变定级）：**
- (a) 4 例输入均为退化输入（真实 workflow 里 `run:` 值中带引号内 tab 并不常见）。但“真实 workflow 几乎不会出现”正是 §7.3 明文禁止的“人工解释”放行理由；R2 P0 的输入（重复键）同样是无效 workflow，仍被定为 P0。
- (b) 修复方在 docstring 中诚实记录了该近似，且 Q1 行确实锁定了近似的一个侧面。但诚实记录 ≠ 关闭：近似的另一侧面（tab 在引号内）未被任何 fixture 或探针行锁定，矩阵 134/134 未覆盖它；“0 已知分歧残留”的结论因此不成立。
- (c) 分歧面很窄（§2.5 的边界表），修复方向明确且工作量小（§2 末），不是死胡同。

## §4 违规捷径检查：无

在工作树上对修复区间 `5133396..f29faec`（137 文件，+6017/−146）核查：

- **测试被删：无。** `git diff --diff-filter=D --name-only 5133396..f29faec` 为空。
- **TS 产品代码改动范围与终报一致：仅 `src/core/e2e.ts`（5 行）与 `src/core/workflow-parser.ts`（176 行）。** Oracle 未动：`git diff --name-only 5133396..f29faec -- oracle/` 为空。
- **Oracle 比较范围被缩小：无。** `scripts/` 的 diff 只有 `build-golden.py` 的 FIX-P0-06 golden 生成块 + 三个文件的计数注释（trigger 80→86、golden 119→125）；比较函数 `deepDiff` 在 diff 中 0 命中。
- **mismatch 忽略名单：无。** `git diff` 中 `^\+.*(ignore|allowlist|whitelist|skip)` 除证据 JSON 内的状态字段名（`SKIPPED_SUCCESS`、`commit_skip`）外 0 命中。
- **P0 被改回 P2：无。** 终审 R2 的 P0 在代码与测试中仍按阻断处理；测试 diff 均为新增（18 集合别名键 + 49 tab + trigger 6 + golden 6 + 计数测试）。
- **夹具真实：** trigger suite 86 条（T6-56..T6-61，source `fix-p0-06`）；golden suite 125 条（G-120..G-125）；`parser-divergence/collection-alias-key/` 18 例 + `tab-rejected/` 49 例，各带 expected.json 与 lock 测试；`build-golden.py --check-only` exit 0（125 cases）。既有 119 夹具未被改写（生成逻辑与 R4/R5 同法核查：`build-golden.py` 的 FIX-P0-06 块只新增 G-120..G-125）。

## §5 全量重跑（干净克隆 `/tmp/r6clone`，HEAD baf881f，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，无输出错误） |
| `npm test` | **1178/1178 通过**（39 test files；链中一条 “scenario file failed validation” 为负例测试的预期输出，非失败） |
| `npm run test:oracle` | 125/125，0 偏差，0 false PASS；`ORACLE_PARITY_REPORT.json`: fixture_count 125, passed 125, failed 0, oracle_mismatch_count 0；unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 86 夹具，0 mismatch |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch |
| `npm run s0:oracle` | 0 false PASS；unsupported 2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；determinism 100 次运行 1 个唯一哈希；network matches 0；gate hash 见下 |
| `npm run release:verify` | **PASS**；离线静态扫描 34 文件 0 远程引用；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `python3 scripts/build-golden.py --check-only` | golden cases 125，exit 0 |

（以上电池在干净克隆内一次链式跑完，`proc_28d1ed9dc338`，exit 0；输出存 `/tmp/r6probe/battery.log`。）

**S0 gate hash 说明：** 干净克隆的 `S0_GATE.json` status 为 PASS，但 `gate_report_sha256` 为 `0c4703b0b59ba60aa0e4b165cbce0cd308249a6b62c2b2ed7efccb8706ceae26`，与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是 `environment_fingerprint`**（克隆路径不同导致；其余 37 个字段全部一致，含 `input_fixture_sha256`、`conditions` 全 true、determinism 100/1、unsupported 2/2）；按文件内注明的公式重算自哈希与记录值一致（computed = recorded = `0c4703b0…`）。这不是回归（与 R4 的 `4617899b…`、R5 的 `0fdf620b…` 为同一现象，不同克隆路径不同指纹）。

**探针矩阵重跑（干净克隆，仓库内 runner，全 JSON 深相等）：**

| 矩阵 | 结果 |
|---|---|
| fix-p0-04 | **100/100 MATCH**（其中 2 检查为 flagged 历史标注 D2 行，现均 MATCH）；前 66 行（R5 子集）**66/66 MATCH** |
| fix-p0-05 | **76/76 MATCH**（其中 4 检查为 flagged 历史标注 N5/H6 行，现均 MATCH） |
| fix-p0-06 | **134/134 MATCH**（0 flagged） |
| R6 独立探针 round 1（`/tmp/r6probe/r6-spot.py`，11 例 ×2 模式） | **20/22 MATCH**；DIFF 仅 R6-TAB-QUOTE（= V1）trigger+jobs |
| R6 独立探针 round 2（`/tmp/r6probe/r6-spot2.py`，9 例 ×2 模式） | **10/18 MATCH**；DIFF 为 V1、V2、V5、V9 各 trigger+jobs（8 处） |

探针合计 350 检查，DIFF 10 处（5 例：TAB-QUOTE/V1、V2、V5、V9，其中 TAB-QUOTE 与 V1 为同一形状两次独立复现）。

## §6 试冻三哈希（干净克隆，`--trial`，两次）

两次 `npm run release:freeze -- --trial`（HEAD baf881f）哈希完全一致，确定性成立：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `4c4d0a01f7397535ca2b1ff4dd5017ac637445d53e0a9ad5c2c49fa34cb33a18`（1,712 文件） | 相对 R2 的 1,209 文件 +503（FIX-P0-02/03/04/05/06 新增夹具/测试/交接报告/探针证据）；含 `scripts/deterministic-zip.py`（zip 内 2,125 条目；脚本 SHA `5c3142ec…`，与 R2 记录的三方一致，冻结脚本未动） |
| dist.zip | `8194b1241e5639d092b280ab4ad91cf8eb3def5e7f6b5f0ee7fd7bf350f59bfc`（114 文件） | **与 R2 冻结的 dist.zip（`da130ad2…`）不同，属预期**：FIX-P0-04/06 改了 TS 产品代码（dist tree sha 已变），不是回归 |
| RELEASE_MANIFEST.json | `69eb124b665ba1d0…`（文件 SHA-256 前 16 位） | source_commit `baf881f`，freeze_status TRIAL |

注：baf881f 尚无正式冻结（T014 未做），故此处是“同一树两次试冻哈希一致”的确定性验证，而非与已冻结包比对。仓库内 `release/` 仍为 R2 冻结物，三哈希与 `SHA256SUMS.txt` 一致（source `3a778b93…`、dist `da130ad2…`，磁盘重算吻合）。

## §7 终审 R2 的 6 个 P2：全部仍成立；新增 P2 2 项

| P2 | 复核（baf881f） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。冻结脚本未动（`git diff 5133396..f29faec -- scripts/deterministic-zip.py` 为空），仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§6） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。README 未动，仍为 “P95 768.3 ms, peak RSS 98.3 MiB”，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 仍写 “Windows PowerShell: NOT_TESTED”，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；全仓库 grep `USER_VALUE` 无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准，见 §6 末） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。试冻 manifest 的 freeze_commit 字段为 TRIAL 说明；正式冻结时 T014 报告 §9 补实际 commit（同 R2 模式） |

**新增 P2-R6-1：manifest 的 `inputs` 只记录 t013 复核到 R3。** 试冻 manifest 的 `inputs` 键为 golden_suite_sha256、oracle_parity_report、s0_gate、s0_input_fixture_sha256、t013_review_r1/r2/r3——R4/R5/R6 三轮复核均未记录。与 P2-R3-2 同类问题（当时只记到 R2，修复方在重冻前补记 R3）；T014 重冻时须把 R4、R5、R6 一并记入，非阻断。

**新增 P2-R6-2：R6 独立探针证据未入仓库。** R6 自写探针（X-empty-2/3/4、V1–V9）只存在于 `/tmp/r6probe/`（VM 重启即清）与本报告 §2/§5 的全文表格中；修复方三矩阵的证据已入仓库（P2-R5-1 对修复矩阵仍为已关闭）。缓解：本报告给出全部 11+9 例输入原文与结果，可按文重建；建议后续把复核探针 case 文件纳入仓库（或随复核报告归档 Drive）。非阻断。

另：许可证仍为 PENDING_SAM_DECISION（`release:verify` license guard 通过，无 LICENSE 文件）。

## §8 未审查事项

- T014 正式冻结未做（不在本任务内）；终审 R3 未发；Drive 未动。
- R5 报告 §1 MATCH 组文字清单与 fix-p0-04 矩阵实际行数有出入（报告列 21 例、称 24 例；矩阵含 Q4/E1/E2 三行，报告未列出——见 §1.2）：报告瑕疵，矩阵本身以 cases.json 为准且 66/66 已验证，不影响定级。

## §9 亲自跑过的命令与结果（摘要）

- `git log` / `git status`（审查开始）：HEAD `baf881f`，工作树仅有未跟踪的 R4/R5 报告与 `reports/`（预先存在）。
- 干净克隆：`git clone ~/workspace/p020-checkpath /tmp/r6clone`，HEAD `baf881fd7695d068bff7166aa73835721b35c7b1`；parser.py md5 `d5123e00…` 与 `git show HEAD:` 一致；`npm ci`。
- 全量电池（§5）+ 试冻两次（§6）+ S0_GATE.json 逐字段 diff 与自哈希重算（§5 末）。
- 三矩阵重跑（§5 末）+ R6 独立探针两轮（`/tmp/r6probe/r6-spot.py` 20/22、`/tmp/r6probe/r6-spot2.py` 10/18；结果存 `/tmp/r6probe/spot-results.json`、`spot2-results.json`）。
- 最小复现：PyYAML `safe_load` 对 V1 全文 ScannerError、对 V3 全文成功；`yaml` npm 包对 V1 全文解析成功。
- `git diff 5133396..f29faec` 全量核查（§4）：无删除文件；`src/` 仅 2 文件；`oracle/` 0 改动；`deepDiff` 0 命中；ignore/allowlist 除证据 JSON 状态字段名外 0 命中；suite 计数 trigger 86 / golden 125。
- 规格原文核对：`~/workspace/P020_PROJECT_BOOK.md` §7.3、§8.2；`~/workspace/P020_IMPLEMENTATION_PLAN.md` §8.1、§10。
- 根因定位：`src/core/workflow-parser.ts` `hasRejectedTab`（L295 起）+ `isQuoteStart`（L372 起）——引号起始判定未跟踪“行内普通标量进行中”状态。

## §10 给 parent 的下一步

1. **不要**就 baf881f 发终审 R3（必 FAIL：终审若复现 §2 任一例，将得到与 R2 P0 相同的裁决模式，且本例 TS 一侧为 VALID，比 R2 更严重）。
2. 定点修复 §2 的 4 例（修复方向见 §2 末；TS 侧 `hasRejectedTab` 增加“普通标量进行中”跟踪，Oracle 不动；加 trigger/golden fixture + 探针证据入仓库），然后派**新的独立复核 R7**（审查对象为修复后 HEAD；复核员一律在干净克隆里验证，不得与修复并行同一工作树；R7 须重跑本报告 §2 的 V1/V2/V5/V9 四形状 + 三矩阵 + R5 66 例）。
3. R7 PASS 后：T014 正式重新冻结（manifest `inputs` 须记入 R4/R5/R6/R7，见 P2-R6-1）→ Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3（同一立项对话，GPT-6 + Extra High + 完整结尾句）。
4. R7 若 NOT PASS：按其报告修残留分歧，再开 R8 复核；PASS 前绝不标记 ACCEPTED、绝不启动 P021。
5. 建议：把复核探针 case 文件纳入仓库或随复核报告归档（P2-R6-2），避免 /tmp 清失后只能按报告文本重建。
