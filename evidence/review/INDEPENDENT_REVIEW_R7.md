# P020 CheckPath — T013 第七轮独立复核（R7）

**Verdict: NOT PASS — P0 1 / P1 0 / P2 8**

| 项 | 内容 |
|---|---|
| 审查对象（任务指定） | commit `b6e2f2b`（FIX-P0-07：`ca7a584` 代码 + `b6e2f2b` 交接报告，修 R6 的 P0——行内普通标量进行中的引号内 tab，V1/V2/V5/V9） |
| 审查开始时 HEAD | `b6e2f2b`（`git log` 核对一致，见 §0） |
| 审查窗口 | 2026-11-09 ~04:43 GMT → ~05:20 GMT |
| 复核员 | 独立会话，与 T001–T012 施工者、FIX-P0-02/03/04/05/06/07 修复执行员、前六轮 T013 复核员完全隔离；只审查，不改代码 |
| 结论 | R6 的 grouped P0（V1/V2/V5/V9）全部关闭；全量电池在干净克隆中通过；试冻两次三哈希一致。但独立探针发现**新的同族分歧：未缩进的多行引用标量续行**（双引号与单引号、带 tab 与不带 tab 均分歧，TS 判 INVALID、Oracle 判 VALID），按 §7.3 定 P0，故 NOT PASS |

## §0 审查对象与无污染声明（先读）

1. **审查对象确为 `b6e2f2b`**：审查开始时 `git log --oneline -1` = `b6e2f2b FIX-P0-07: handoff report (R6 P0 closed, RESID disclosed)`，其父为 `ca7a584`，再上为 `402a3b0`。审查期间 HEAD 未移动（结束时仍为 `b6e2f2b`）。
2. **全部验证均在干净克隆 `/tmp/r7clone` 中完成**（`git clone ~/workspace/p020-checkpath`，`git rev-parse HEAD` = `b6e2f2b6b5c1018597a227fd2154aa6c21535c93`；`oracle/checkpath_oracle/parser.py` md5 `d5123e0058569116729db82e171c33a0`，与 `git show HEAD:...` 逐字节一致；`npm ci` 完成）。探针、电池、试冻一律在克隆内跑，**从未在共享工作树上运行任何探针或测试**。工作树上的操作仅为只读（`git log/diff/show`、`grep`、`read`）+ 最后写入本报告与 SUMMARY 两个交付文件。R4 的修复并行污染本轮未复现：审查开始时 FIX-P0-07 已提交，修复协调员的工作已完成。
3. **比较标准**：全 JSON 深相等（trigger 模式的整个 TriggerIR，jobs 模式的整个 job 列表），无容差、无忽略字段——R5 的标准。
4. **探针方法**：TS 侧为 `src/core/workflow-parser.ts` 的 `parseWorkflowYaml` 与 `src/core/e2e.ts` 的 `extractJobs`，经克隆内 esbuild 打包为 CJS bundle（从克隆源码重建）；Oracle 侧为仓库自带 `scripts/oracle-parse-probe.py` / `scripts/oracle-jobs-probe.py`（cwd=`/tmp/r7clone`，`--yaml` + `--fixture-id` 参数形式，与修复方矩阵一致）。修复方四矩阵直接用仓库内 `evidence/probes/fix-p0-0{4,5,6,7}/run-matrix.py` 在克隆内重跑；R7 独立探针（`/tmp/r7probe/r7-spot.py` 20 例 ×2 模式 + `/tmp/r7probe/r7-spot3.py` 2 例 ×2 模式，用例按 R6 报告文字与 FIX-P0-07 终报 §7.1 自写，未抄修复方 cases.json）用同一方法跑。
5. **环境**：Node 24.22.1、Python 3.12.3、PyYAML 6.0.1——与冻结环境一致（不是 GPT 容器的 Node 22 / Python 3.13）。

## §1 R6 的 grouped P0（V1/V2/V5/V9）— 全部关闭（已验证）

R6 的 4 形状在 fix-p0-07 矩阵中全部 MATCH（trigger + jobs），R7 自写探针独立复现亦全部 MATCH（双边 INVALID / yaml_parse_error / events `[]`，jobs 双边 `[]`）：

| 例 | R7 独立探针 | fix-p0-07 矩阵 |
|---|---|---|
| V1 `run: echo "a<TAB>b"` | MATCH | V1-tab-quote-double-run MATCH |
| V2 `run: echo 'a<TAB>b'` | MATCH | V2-tab-quote-single-run MATCH |
| V5 `name: some long` 续行 `"a<TAB>b" tail` | MATCH | V5-tab-quote-continuation MATCH |
| V9 V1 + 行尾注释 `# c` | MATCH | V9-tab-quote-trailing-comment MATCH |
| V1e（裸键下一行写值再续行，FIX-P0-07 自伤事故形状） | MATCH（R7-V1e） | V1e-value-next-line-quote-cont MATCH |

第一版 `startPlain()` 调用顺序 bug（裸键规则失效，矩阵 80/86）确已修复，无反向分歧残留：V1e 两模式均 MATCH，且 fix-p0-07 矩阵 82/86 中除 4 个已标记 RESID 检查外无其他 DIFF。

## §2 新发现：Grouped P0 — 未缩进的多行引用标量续行（RESID，§7.1 定级对象）

### 2.1 现象

`yaml` npm 包拒绝多行引用标量续行缩进 ≤ 块上下文缩进的形状，而 PyYAML 接受任意缩进。**且不带 tab 也分歧**——这不是 tab 规则的残留，而是解析器层宽容度分歧。R7 自写探针（6 形状 × trigger+jobs = 12 检查，全部在干净克隆中实测）：

| 例 | 输入（续行缩进） | TS | Oracle |
|---|---|---|---|
| RESID-DQ | `run: "a` / `b<TAB>c"`（缩进 0） | **INVALID / yaml_parse_error**，events `[]`，jobs `[]` | **VALID**，events `[push]`，jobs `[test]` |
| RESID-SQ | `run: 'a` / `b<TAB>c'`（缩进 0） | **INVALID** | **VALID** |
| RESID-DQ-NOTAB | `run: "a` / `b c"`（缩进 0，无 tab） | **INVALID** | **VALID** |
| RESID-DQ-IND2 | `run: "a` / `  b<TAB>c"`（缩进 2） | **INVALID** | **VALID** |
| RESID-DQ-IND8 | `run: "a` / `        b<TAB>c"`（缩进 8 = `run` 键缩进） | **INVALID** | **VALID** |
| RESID-DQ-IND9 | `run: "a` / `         b<TAB>c"`（缩进 9） | **VALID** | **VALID**（MATCH） |

阈值与修复方终报 §7.1 的实测一致：续行缩进 9+ 时 `yaml` 包解析通过，8− 失败；PyYAML 全接受。分歧面有明确边界：仅发生在续行缩进 ≤ 块上下文缩进（此处为 `run` 键缩进 8）时；缩进 9 的同形状两侧均接受。

### 2.2 两侧输出原文（RESID-DQ，trigger 模式）

输入 YAML（`\t` 为字面 tab，续行 `b\tc` 缩进 0）：

```yaml
name: probe
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: "a
b	c"
```

TS（`parseWorkflowYaml`）：

```json
{"errors": ["yaml_parse_error"], "evaluation": {"reason": "invalid", "triggered": null, "unsupported": []}, "events": [], "fixture_id": "probe", "on_key_is_string": false, "schema": "checkpath.trigger-ir/v1", "status": "INVALID"}
```

Oracle（`scripts/oracle-parse-probe.py`）：

```json
{"errors": [], "evaluation": {"reason": "triggered", "triggered": null, "unsupported": []}, "events": [{"branches": null, "branches_ignore": null, "name": "push", "paths": null, "paths_ignore": null, "types": null}], "fixture_id": "probe", "on_key_is_string": true, "schema": "checkpath.trigger-ir/v1", "status": "VALID"}
```

jobs 模式：TS 返回 `[]`，Oracle 返回 `[{"id": "test", "if": null, "name": null, "needs": [], "unsupported_job": null}]`。

### 2.3 与探针驱动无关的最小复现

直接对解析器本身验证（克隆内，不经任何探针驱动）：

- PyYAML `yaml.safe_load` 对 RESID-DQ 全文：解析成功，`steps` 为 `[{'run': 'a b\tc'}]`；RESID-DQ-NOTAB 同理成功。
- `yaml` npm 包 `YAML.parse` 对两全文均报错：`Missing closing "quote at line 7, column 16`。

分歧在解析器层，与探针脚手架无关。`hasRejectedTab` 对这些形状正确返回 false（分歧出在 `parse()` 本身，与修复方终报 §7.1 的定位一致）。

### 2.4 已排除的相邻变体（均 MATCH，证明分歧面有明确边界）

| 例 | 结果 | 说明 |
|---|---|---|
| V3/V4（引用标量作整个值，tab 在内） | MATCH（双边接受） | 真正的引用标量 |
| V6（tab 在引号外）/ V7（引号粘贴普通文本） | MATCH（双边拒绝） | R6 §2.5 边界仍成立 |
| V8（引用事件键内 tab `"pu<TAB>sh":`） | MATCH（双边 UNKNOWN） | 真正的引用键 |
| TAB-COMMENT（注释内 tab）、TAB-BLOCK / Q3（块标量内容内 tab） | MATCH | 修复方规则正确覆盖 |
| X-empty-2/3/4（R5 §2.4：两个裸 `:` 键、裸 `:` + `null:`、裸 `:` + `~:`） | MATCH（双边 INVALID） | R6 补测过的 3 例，R7 全部独立复现（X-empty-2 在主探针，3/4 在 spot3） |
| RESID-DQ-IND9（续行缩进 9） | MATCH（双边接受） | 阈值上侧 |

结论：分歧仅发生在“**多行引用标量的续行缩进 ≤ 块上下文缩进**”时；其余 tab/引用形状两侧均已一致。

**修复方向（供 parent 决策，不由复核员实施）：** 首选方向是 Oracle 侧拒收规则，与 FIX-P0-05 的 `_reject_adjacent_alias_colon()` 同一机制家族：Oracle 在 `yaml.load` 前后拒收续行缩进 ≤ 块上下文缩进的多行引用标量，走既有 `yaml_parse_error` 路径；这不是 §7.3 禁止的输入文本手术（不改写输入，只拒收 TS 同样拒收的形状），但须从 `yaml` 包的行为精确推导阈值规则（续行缩进 vs 各层块上下文缩进），不可拍脑袋。备选是换解析器——高风险，可能动摇 1215 测试基线，不建议盲目尝试。TS 侧无法修（`parse()` 本身拒绝，无规则可加）。

## §3 定级：P0（分组计 1 项）的依据与权衡

定级 **P0（1 项，分组计，含 §2 的 6 例 / 10 处 DIFF）**，依据：

- PROJECT_BOOK §7.3（L520）：“Oracle 与实现**任何字段不一致都判失败；不得通过忽略字段、容差或人工解释来放行**。”
- PROJECT_BOOK §8.2：Oracle parity 100%，“**所有受支持输入完全一致**”。
- IMPLEMENTATION_PLAN §8.1（L779）：“Oracle 输出规范化 JSON；差分脚本逐字段比较。**任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。**”
- IMPLEMENTATION_PLAN §10（L827）：P0 阻断明确包含 “**Oracle mismatch**”。
- **终审 R2 的裁决先例**：R3 把同类分歧（`True:`/`true:`，双边 fail-closed、无 false PASS 风险、已披露）降为 P2 的理由被终审明确驳回。本轮 RESID 与 R2 P0 是同一模式（解析器层分歧、已披露为近似、修复方称其余无残留），且 Oracle 一侧为 **VALID**（正式管线会对 Oracle 判为有效的文档报出不可解析——误拒，比 R2 更严重，不是更轻）。降为 P2 将重复 R3 被驳回的错误。

**已权衡的反方考虑（记录在案，不改变定级）：**
- (a) 该输入形状退化（真实 workflow 里多行引用标量续行不缩进并不常见）。但“真实 workflow 几乎不会出现”正是 §7.3 明文禁止的“人工解释”放行理由；R2 P0 的输入（重复键）同样是无效 workflow，仍被定为 P0。
- (b) 从 YAML 规范看，`yaml` 包的严格（续行须比块上下文更缩进）比 PyYAML 的宽容更接近规范字面，Oracle 一侧反而是宽容方。但本项目的验收标尺不是 YAML 规范，而是 §7.3 的“Oracle 与实现完全一致”——Oracle 接受即属受支持输入，TS 拒收即 mismatch；谁更合规范不改变定级。
- (c) 修复难度（解析器层）不影响定级：定级只看是否存在 mismatch，不看修起来难不难。修复方终报 §7.1 建议“由 R7 定级”，R7 的定级即 P0。
- (d) 分歧面很窄（§2.4 的边界表），修复方向明确（§2 末），不是死胡同。

## §4 违规捷径检查：无

在工作树上对修复区间 `402a3b0..ca7a584`（76 文件，+3448/−42）核查：

- **测试被删：无。** `git diff --diff-filter=D --name-only 402a3b0..ca7a584` 为空。
- **TS 产品代码改动范围与终报一致：仅 `src/core/workflow-parser.ts` 一文件（+209/−15）。** Oracle 未动：`git diff --name-only 402a3b0..ca7a584 -- oracle/` 为空。
- **Oracle 比较范围被缩小：无。** `scripts/` 的 diff 只有 `build-golden.py` 的 FIX-P0-07 golden 生成块（仅新增 G-126..G-131）+ 两个文件的计数注释（trigger 86→92、golden 125→131）；比较函数 `deepDiff` 在 diff 中 0 命中。
- **mismatch 忽略名单：无。** `git diff` 中 `^\+.*(ignore|allowlist|whitelist)` 除证据 JSON 内的状态字段名（`branches_ignore`、`paths_ignore`）外 0 命中。
- **P0 被改回 P2：无。** 终审 R2 的 P0 在代码与测试中仍按阻断处理；测试 diff 均为新增（parser-divergence 12 例 + trigger 6 + golden 6 + 单元测试 13 + 计数测试）。
- **夹具真实：** trigger suite 92 条（T6-62..T6-67，source `fix-p0-07`）；golden suite 131 条（仅新增 G-126..G-131，无其他 id 行改动）；`parser-divergence/quoted-mid-plain-scalar/` 12 例（f01–f12）+ `expected.json` + README + 锁测试；`build-golden.py --check-only` exit 0（131 cases）。既有 125 夹具未被改写（生成逻辑与 R4/R5/R6 同法核查：`build-golden.py` 的 FIX-P0-07 块只新增 G-126..G-131）。

## §5 全量重跑（干净克隆 `/tmp/r7clone`，HEAD b6e2f2b，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，无输出错误） |
| `npm test` | **1215/1215 通过**（40 test files） |
| `npm run test:oracle` | 131/131，0 偏差，0 false PASS；`ORACLE_PARITY_REPORT.json`: fixture_count 131, passed 131, failed 0, oracle_mismatch_count 0；unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 92 夹具，0 mismatch |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch |
| `npm run s0:oracle` | 0 false PASS；unsupported 2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；determinism 100 次运行 1 个唯一哈希；network matches 0；gate hash 见下 |
| `npm run release:verify` | **PASS**；离线静态扫描 34 文件 0 远程引用；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `python3 scripts/build-golden.py --check-only` | golden cases 131，exit 0 |

（以上电池在干净克隆内一次链式跑完，输出存 `/tmp/r7probe/battery.log`。）

**S0 gate hash 说明：** 干净克隆的 `S0_GATE.json` status 为 PASS，但 `gate_report_sha256` 为 `b5ce164c8efcca2489a2862a0b4fd75a71ec08e9fc7b856d51bfab13b6e2f594`，与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是 `environment_fingerprint`**（克隆路径不同导致；其余字段全部一致，含 `input_fixture_sha256`、`conditions` 全 true、determinism 100/1、unsupported 2/2）；按文件内注明的公式（去掉 `gate_report_sha256` 字段后 canonical JSON 的 SHA-256）重算，HEAD 与克隆的自哈希均与记录值逐字节一致。这不是回归（与 R4 的 `4617899b…`、R5 的 `0fdf620b…`、R6 的 `0c4703b0…` 为同一现象，不同克隆路径不同指纹）。

**探针矩阵重跑（干净克隆，仓库内 runner，全 JSON 深相等）：**

| 矩阵 | 结果 |
|---|---|
| fix-p0-04 | **100/100 MATCH**（前 66 行 R5 子集 **66/66 MATCH**） |
| fix-p0-05 | **76/76 MATCH** |
| fix-p0-06 | **134/134 MATCH**（0 flagged） |
| fix-p0-07 | **82/86 MATCH**（仅 4 个已标记 RESID 检查不同：RESID-MULTILINE-QUOTED-UNINDENTED-DQ/SQ × trigger+jobs） |

**R7 独立探针（自写，`/tmp/r7probe/r7-spot.py` 20 例 ×2 模式 + `r7-spot3.py` 2 例 ×2 模式）：**

| 组 | 结果 |
|---|---|
| R6 P0 形状 V1/V2/V5/V9 + V1e | 5 例 ×2 模式 **10/10 MATCH** |
| R6 §2.5 边界（V3/V4/V6/V7/V8、TAB-COMMENT、TAB-BLOCK、Q3、X-empty-2） | 9 例 ×2 模式 **18/18 MATCH** |
| X-empty-3/4（R5 §2.4 余下两例） | 2 例 ×2 模式 **4/4 MATCH** |
| RESID（§2） | 6 例 ×2 模式 **2/12 MATCH**（仅 IND9 两模式 MATCH；其余 10 处 DIFF） |

探针合计 440 检查（四矩阵 396 + R7 独立探针 44），DIFF 14 处（fix-p0-07 矩阵 4 处 RESID + R7 独立探针 10 处 RESID，同一根因两次独立复现）。

## §6 试冻三哈希（干净克隆，`--trial`，两次）

两次 `npm run release:freeze -- --trial`（HEAD b6e2f2b）哈希完全一致，确定性成立：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `c1e2d4aa1202e8945c5051c63912f83dcf3244577c2350a80524645d6e96418b`（1,781 文件） | 相对修复方试冻（`0f89fce9…`，1,780 文件）+1 文件：R7 审查对象是 `b6e2f2b`（含终报提交），修复方试冻时 HEAD 为 `ca7a584`；两次自洽即确定性成立 |
| dist.zip | `c391ad648d56db7c91e5a49fdae0fb2cae1972c2a771f1d2f83ba643249cf024`（114 文件） | 与修复方试冻**逐字节一致**；与 R2 冻结的 dist.zip（`da130ad2…`）不同，属预期：FIX-P0-04/06/07 改了 TS 产品代码（dist tree sha 已变），不是回归 |
| RELEASE_MANIFEST.json | `92219650cce232caa3ac2622e696aa3385144908c44c5c28ea2d7bfa60ed296f` | source_commit `b6e2f2b`，freeze_status TRIAL；与修复方值不同只因 source.zip 不同（同上） |

注：b6e2f2b 尚无正式冻结（T014 未做），故此处是“同一树两次试冻哈希一致”的确定性验证，而非与已冻结包比对。仓库内 `release/` 仍为 R2 冻结物，试冻后已用 `git checkout -- release/` 恢复（source `3a778b93…`、dist `da130ad2…`，磁盘重算吻合）。source.zip 含冻结脚本（zip 内 1 条目；脚本 SHA `5c3142ec…`，与工作树文件及 R2 记录的三方一致，冻结脚本未动）。

## §7 终审 R2 的 6 个 P2 + R6 新增的 2 个 P2：全部仍成立

| P2 | 复核（b6e2f2b） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。`git diff 402a3b0..b6e2f2b -- scripts/deterministic-zip.py` 为空，冻结脚本未动，仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§6） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。`git diff 402a3b0..b6e2f2b -- README.md` 为空，仍为 “P95 768.3 ms, peak RSS 98.3 MiB”，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 仍有 `NOT_TESTED`，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；全仓库 grep `USER_VALUE` 仅复核报告提及，无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准，见 §6 末） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。试冻 manifest 的 freeze_commit 字段为 TRIAL 说明；正式冻结时 T014 报告 §9 补实际 commit（同 R2 模式） |
| **P2-R6-1：manifest 的 `inputs` 只记录 t013 复核到 R3** | 仍成立。试冻 manifest 的 `inputs` 键为 golden_suite_sha256、oracle_parity_report、s0_gate、s0_input_fixture_sha256、t013_review_r1/r2/r3——R4/R5/R6/R7 四轮复核均未记录。与 P2-R3-2 同类问题；T014 重冻时须把 R4、R5、R6、R7 一并记入，非阻断 |
| **P2-R6-2：复核探针证据未入仓库** | 仍成立。R6 自写探针仍只在 `/tmp/r6probe/`（已随 VM 重启清除）与 R6 报告中；本轮 R7 自写探针亦只在 `/tmp/r7probe/`（`r7-spot.py`、`r7-spot3.py`、`r7-probe-entry.ts`、`r7-spot-results.json`、本报告 §2/§5 的全文表格）与本报告中，VM 重启即清。修复方四矩阵的证据已入仓库（P2-R6-2 对修复矩阵仍为已关闭）。缓解：本报告给出全部 22 例输入原文与结果，可按文重建；建议后续把复核探针 case 文件纳入仓库（或随复核报告归档 Drive）。非阻断 |

另：许可证仍为 PENDING_SAM_DECISION（`release:verify` license guard 通过，无 LICENSE 文件）。

## §8 未审查事项与报告瑕疵记录

- T014 正式冻结未做（不在本任务内）；终审 R3 未发；Drive 未动。
- R5 报告计数出入（R6 §1.2 已记）：R5 §2 称“残留探针 10”，但 §2.1–2.3 的 3 例 + §2.4 的 10 例合计 13 例。R7 独立复现了 §2.4 的全部 3 例（X-empty-2/3/4，见 §2.4 表），**全部 MATCH**：该计数出入确为报告瑕疵，不影响定级。
- R5 报告 §1 MATCH 组文字清单与 fix-p0-04 矩阵实际行数有出入（R6 §8 已记：报告列 21 例、称 24 例；矩阵含 Q4/E1/E2 三行，报告未列出）：报告瑕疵，矩阵本身以 cases.json 为准且前 66 行 66/66 已验证，不影响定级。
- 本轮 R7 探针中 R7-V8 的构造与 R6 的 V8 文字描述（“引用键内 tab”）一致但输入细节为 R7 自写（`"pu<TAB>sh":` 事件键），不等同于 R6 的原始用例原文；结论（双边 UNKNOWN、MATCH）仅针对该自写形状。

## §9 亲自跑过的命令与结果（摘要）

- `git log` / `git status`（审查开始）：HEAD `b6e2f2b`，工作树仅有未跟踪的 `reports/`（预先存在）。
- 干净克隆：`git clone ~/workspace/p020-checkpath /tmp/r7clone`，HEAD `b6e2f2b6b5c1018597a227fd2154aa6c21535c93`；parser.py md5 `d5123e00…` 与 `git show HEAD:` 一致；`npm ci`。
- 全量电池（§5）+ 试冻两次（§6）+ S0_GATE.json 逐字段 diff 与自哈希重算（§5 末）。
- 四矩阵重跑（§5 末）+ R7 独立探针两轮（`/tmp/r7probe/r7-spot.py` 30/40、`/tmp/r7probe/r7-spot3.py` 4/4；结果存 `/tmp/r7probe/r7-spot-results.json`）。
- 最小复现：PyYAML `safe_load` 对 RESID-DQ / RESID-DQ-NOTAB 全文成功；`yaml` npm 包对两全文均报错 `Missing closing "quote at line 7, column 16`。
- `git diff 402a3b0..ca7a584` 全量核查（§4）：无删除文件；`src/` 仅 1 文件（+209/−15）；`oracle/` 0 改动；`deepDiff` 0 命中；ignore/allowlist 除证据 JSON 状态字段名外 0 命中；suite 计数 trigger 92 / golden 131。
- 规格原文核对：`~/workspace/P020_PROJECT_BOOK.md` §7.3（L520）、§8.2；`~/workspace/P020_IMPLEMENTATION_PLAN.md` §8.1（L779）、§10（L827）。
- 根因定位：`yaml` npm 包的解析器宽容度（多行引用标量续行缩进 ≤ 块上下文缩进时报错）vs PyYAML 接受任意缩进；`hasRejectedTab` 对此形状正确返回 false，分歧出在 `parse()` 本身。

## §10 给 parent 的下一步

1. **不要**就 b6e2f2b 发终审 R3（必 FAIL：终审若复现 §2 任一例，将得到与 R2 P0 相同的裁决模式，且本例 Oracle 一侧为 VALID——正式管线会误拒 Oracle 判为有效的 workflow）。
2. 定点修复 §2 的 RESID（修复方向见 §2 末；首选 Oracle 侧拒收规则，与 FIX-P0-05 的 `_reject_adjacent_alias_colon()` 同一机制家族；备选换解析器，高风险，勿盲目尝试），然后派**新的独立复核 R8**（审查对象为修复后 HEAD；复核员一律在干净克隆里验证，不得与修复并行同一工作树；R8 须重跑本报告 §2 的 RESID 6 形状 + 四矩阵 + R5 66 例）。
3. R8 PASS 后：T014 正式重新冻结（manifest `inputs` 须记入 R4/R5/R6/R7/R8，见 P2-R6-1）→ Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3（同一立项对话，GPT-6 + Extra High + 完整结尾句）。
4. R8 若 NOT PASS：按其报告修残留分歧，再开 R9 复核；PASS 前绝不标记 ACCEPTED、绝不启动 P021。
5. 建议：把复核探针 case 文件纳入仓库或随复核报告归档（P2-R6-2），避免 /tmp 清失后只能按报告文本重建。
