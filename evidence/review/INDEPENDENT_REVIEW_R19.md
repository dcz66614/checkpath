# T013 独立复核 R19 — FIX-P0-19（R18 的 1 个 P0 家族）复核报告

- **审查对象**：代码提交 `9dac3e1`（FIX-P0-19：TS 侧新增 `hasDuplicateAliasKey`，拒绝流式映射中解析为重复标量的空值别名键；相对 `e2c418f`，56 文件，+9438/−2；其中 `src/core/workflow-parser.ts` +127/−1、`src/core/e2e.ts` +7/−2，新增 35 夹具 + 1 测试文件）。报告提交 `3991856` 只含报告文本，不在代码审查范围内。
- **复核员**：T013 独立复核员（全新会话，与 FIX-P0-19 修复方、R18 复核员均隔离；未共享上下文）。
- **复核环境**：干净克隆 `~/workspace/p020-r19-review`（`git clone ~/workspace/p020-checkpath` 后 `git checkout 9dac3e1`），`git status` 干净（仅复核探针 `evidence/probes/r19/` 未跟踪），`git log --oneline -2` 顶为 `9dac3e1`。全部命令均在该克隆内亲自跑；未与任何修复并行同一工作树（R4 污染教训）。本轮复核中无 VM 重启。
- **结论：PASS — P0 0 / P1 0 / P2 8。**

## §0 审查对象与无污染声明（先读）

- 本轮只审查 `9dac3e1` 的代码。`3991856` 的报告文本仅作背景阅读；报告中所有数字均由本轮亲自重跑得出，未采信报告数字。
- 复核探针全部在干净克隆内运行；探针证据（`evidence/probes/r19/`：`cases.json`、`gen-cases.py`、`r19-probe.py` 复用 `r18-probe.py` 驱动、`results.json`、`parser-probe-p19-r19.txt` / `parser-probe-p19b-r19.txt`、重跑副本 `reruns/`、README）随本报告一并提交入仓库，不只留 `/tmp`（P2-R6-2 的教训）。本报告与探针在克隆内写就，交由主控归档；本轮未向主仓库 commit 或 push。
- R18 的 1 个 P0 家族本轮**全部独立重建并逐一确认关闭**（见 §1）；本轮自写狩猎探针 60 检查**无新分歧**（见 §2）。
- **修复方报告数字复核**：报告 §5 的验收数字本轮全部复核一致（§8）；报告 §6 的 trial manifest 哈希本轮**复现三次**（见 §6、§9）。

## §1 R18 的 1 个 P0 家族 — 已关闭（已验证）

R18 定级的 1 个 P0 家族（8 形，16 检查；各套探针合计 20 处 DIFF）已关闭。本轮重跑：

| 探针 | 结果 |
|---|---|
| R18 狩猎探针（`evidence/probes/r18/`，50 检查） | **50/50 MATCH**（原 44/50；6 处 DIFF 现为 0） |
| R18 裁决探针（22 检查） | **22/22 MATCH**（原 12/22；10 处 DIFF 现为 0） |
| R18 裁决 2 探针（10 检查） | **10/10 MATCH**（原 8/10；2 处 DIFF 现为 0） |
| fix-p0-18 网格（79 检查） | **79/79 MATCH**（原 77/79；唯二 DIFF `c-flow-key-null-2nd` ×2 现为 0） |
| fix-p0-19 网格（35 形，70 检查） | **70/70 MATCH**（A 组 16/16、B 组 18/18、C 组 36/36） |

8 个家族形逐一核对（R18 §2.1 现象总表）：`{a: 1, *w:2}`、`{a: 1, *w}`、`{*w, a: 1}`、`{*w, *w}`、嵌套流 `{x: {a: 1, *w:2}}`、`{*w:2, a: 1}`、`{a: 1, *w:2:3}`、`{a: 1, *w:2} # c`——本轮在狩猎、裁决、fix-p0-19 网格 A 组三处独立重建，全部双边 INVALID / `yaml_parse_error`，与 R18 报告一致。另：R17 的 9 形家族未回归（R17 探针 141/141，见 §8）。

## §2 本轮狩猎探针：无新分歧（60 检查，0 DIFF）

本轮自写狩猎探针 30 形 60 检查（`evidence/probes/r19/r19-probe.py` 复用 R18 驱动：esbuild 打包 TS 探针 + Oracle 双驱动，全 JSON 深比较；trigger 模式比较完整 TriggerIR，jobs 模式比较完整 job list），**60/60 MATCH**。探针聚焦修复方未曾端到端探查的形状组合：

| 组 | 形状 | 结果 |
|---|---|---|
| 显式 `?` 键（H1–H4） | 流式 `{? *w, a: 1}`、`{? *w: 1, a: 1}`；块式 `? *w` + `a: 1`（空值 / `: 1` 有值） | **8/8 MATCH**（全部双边 INVALID；块式显式键同样被拒收，未出现解析器层漏网） |
| 跨映射不重复（H5、H19、H24） | 别名键单独在内层映射、同一别名键在两个映射、重复候选只在外层映射 | **6/6 MATCH**（全部双边 VALID；`hasDuplicateAliasKey` 的逐映射 `seen` 列表无跨映射误伤） |
| 序列内双流映射（H6） | `[{a: 1, *w}, {a: 1, *w}]` | **2/2 MATCH**（双边 INVALID；每映射独立判重） |
| 三冒号（H7–H8） | `{a: 1, *w:2:3:4}`、`{*w:2:3:4, a: 1}` | **4/4 MATCH**（双边 INVALID） |
| 规范折叠（H9–H12、H16、H22、H26–H29） | `.inf` 重复 / `.inf` vs `-.inf`、`0` vs `false` / `false` vs `0`、quoted `'a'`、`'1'` vs `1` / `1` vs `'1'`、`True` vs `1`、`~` vs `null`、`.nan` | **20/20 MATCH**（重复形双边 INVALID；非重复形双边 VALID；与修复方 §3 的解析器层结论逐一一致） |
| `on:` / `jobs:` 内重复（H13–H15、H25） | `on: {push: {}, *w}`、`on: {*w, pull_request: {}}`、`jobs: {check: {...}, *w}`、`on: {push: {branches: [main]}, *w}` | **8/8 MATCH**（重复形双边 INVALID；H15 覆盖 `extractJobs` 链的接线，jobs 模式 job list 双边一致为空） |
| 锚后定义（H17） | 同一流映射内 `m: {*w, &w a: 1}` | **2/2 MATCH**（双边 INVALID；机制不同但结论一致——Oracle 报未定义别名，TS 由新规则拒收） |
| 双锚同值（H18） | `m: {*w, *v, b: 1}`（`&w a`、`&v a`） | **2/2 MATCH**（双边 INVALID；别名-别名碰撞同样被拒） |
| 嵌套值 / 深嵌套（H20、H21、H30） | `{a: {x: 1}, *w}`、`{n: [{a: 1, *w}]}`、step 的 `env: {a: 1, *w}` | **6/6 MATCH**（全部双边 INVALID；递归遍历到位） |
| 流内注释（H23） | `{a: 1, *w # c\n}` | **2/2 MATCH**（双边 INVALID） |

结论：新规则只在“至少一方为别名键的有效键碰撞”时触发，负向控制形（H5、H10、H11、H12、H14、H19、H22、H24、H26–H28）全部双边 VALID，无误伤；`!` 守卫修正未回归（R17 探针 H1 组 18/18 MATCH 的一部分，见 §8）。

## §3 解析器层复现（修复方探针重跑，与报告 §3 逐一一致）

本轮重跑修复方解析器层探针（输出存 `evidence/probes/r19/parser-probe-p19-r19.txt` / `parser-probe-p19b-r19.txt`）：

| 形状组 | PyYAML `_StrictBaseLoader` | `yaml` 2.9.1 | 端到端（本轮 §1、§2） |
|---|---|---|---|
| F1–F8（8 家族形） | 全部 LOAD-ERROR `duplicate mapping key: 'a'` | 全部 0 错误，接受（新规则未启用时） | 全部双边 INVALID |
| B1–B2 有值别名键 | LOAD-ERROR duplicate | parse() THROW（冒号歧义） | 双边 INVALID，未变 |
| B3 块映射别名键 | LOAD-ERROR / SCAN-ERROR | parse() THROW | 双边 INVALID，未变 |
| B4–B6（不同标量 / 单独 / 作值） | LOAD-OK | 0 错误 | 双边 VALID，未变 |
| B7 纯标量重复键 | LOAD-ERROR duplicate | parse() THROW `Map keys must be unique` | 双边 INVALID，未变 |
| B8/B10 块空值别名键 | SCAN-ERROR `while scanning a simple key` | parse() THROW | 双边 INVALID，未变 |
| B11–B18 规范折叠 | B11/B13/B15/B16 duplicate；B12/B14/B17/B18 LOAD-OK | Alias resolve 到对应 Scalar；`1` vs `'1'`、`True` vs `1`、`!!str 1` vs `1`、`NaN` 均 `!==` | 与 §2 的 H9–H12、H16、H22、H26–H29 端到端一致 |
| B19–B22（隔对 / 流内序列 / `on:` / 同流定义锚） | LOAD-ERROR duplicate（B21 为 `'push'`） | 对应 Alias resolve | 双边 INVALID，未变 |

注：`.nan` 形在 `.mjs` 打印中显示为 `Scalar(null)`——那是 `JSON.stringify(NaN) === "null"` 的假象；修复方报告已另行实测确认两边的值都是 number NaN，本轮端到端 H22 双边 VALID 与之印证。`parser-probe-p19.mjs` 初版的 B11–B18/B21/B25 设计缺陷（锚定义写在裸行首）修复方已在报告 §3 注中披露并以修正版 `p19b` 为准，本轮重跑的即修正版。

## §4 边界验证：修复方 §3/§4 控制形（本轮重验）

| 形状族 | 预期 | 结果 |
|---|---|---|
| 有值别名键 `{*w: 1, a: 1}`、`{*w: 1, *w: 2}` | MATCH（双边 INVALID，未变） | **MATCH**（fix-p0-19 网格 B 组 + R18 裁决对照） |
| 块映射别名键（有值/空值，`*w` / `*w:2`） | MATCH（双边 INVALID，未变） | **MATCH**（网格 B 组；本轮 H3–H4 显式键补充） |
| D2 `on: {*a: 1}`（有值流式别名键） | MATCH（已关闭，未变） | **MATCH**（fix-p0-04 矩阵 100/100、0 flagged） |
| 纯标量重复键 `{a: 1, a: 2}` | MATCH（双边 INVALID，未变） | **MATCH**（网格 B 组；`parse()` 的 `uniqueKeys` 拥有） |
| 别名键后接不同标量 `{b: 2, *w}`、别名单独 `{*w}`、别名作值 `b: *w` | MATCH（双边 VALID，未变） | **MATCH**（网格 B 组；本轮 H5、H19、H24 补充跨映射负向控制） |
| 规范折叠 8 形（int/bool/null/quoted/tagged/NaN） | MATCH | **MATCH**（网格 C 组 + 本轮 H9–H12、H16、H22、H26–H29） |
| 别名键两次隔对、流内序列、流式 `on:`、同流定义锚、深嵌套、两锚同值、流式 `jobs:`、前向引用、别名指向集合、链式别名 | MATCH | **MATCH**（网格 C 组；本轮 H6、H13、H15、H18、H21、H30 补充） |
| 非重复的别名键、不同锚的别名键、嵌套/显式键形（本轮新增） | MATCH | **MATCH**（§2 各组） |

结论：新规则的触发边界与 Oracle 的 `_duplicate_key_canonical` 折叠一致；未发现误伤或漏判。

## §5 P2 清单：终审 R2 的 6 个 + R6 的 2 个 = 8 个，全部非阻断

R18 的 8 个 P2 全部仍成立，无新增、无清除：

| P2 | 复核（9dac3e1） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。冻结脚本未动（`git diff e2c418f..9dac3e1 -- scripts/ release/` 为空），仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§9） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。README 仍为 "P95 768.3 ms, peak RSS 98.3 MiB"，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 仍有 `NOT_TESTED` 标记，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。试冻 manifest 的 freeze_commit 字段为 TRIAL 说明；正式冻结时 T014 报告 §9 补实际 commit（同 R2 模式） |
| **P2-R6-1：manifest 的 `inputs` 只记录 t013 复核到 R3** | 仍成立，且范围扩大到 R19。本轮试冻 manifest 的 `inputs` 键仍为 golden_suite_sha256、oracle_parity_report、s0_gate、s0_input_fixture_sha256、t013_review_r1/r2/r3——R4–R19 十六轮复核均未记录。T014 重冻时须把 R4–R19 一并记入，非阻断 |
| **P2-R6-2：复核探针证据未入仓库** | 部分缓解，仍成立。R7/R8 自写探针只在 `/tmp` 与报告中；R9–R18 自写探针已随报告提交入仓库（`evidence/probes/r9/`–`r18/`），本轮 R19 探针亦在克隆内（`evidence/probes/r19/`，待主控归档）。非阻断 |

**已解决，不再列入未决清单：** P2-R16-1（fix-p0-15 6 标志已清；本轮矩阵重跑 fix-p0-15 260/260，0 flagged）；P2-R15-1、P2-R13-1、P2-R12-1、P2-R10-1、P2-R10-2（状态不变；本轮矩阵重跑 fix-p0-12 486/486、fix-p0-13 196/196，0 flagged）。

## §6 Manifest 哈希核查（修复方数字可信，不计入定级）

- 本轮实测 trial 模式 manifest 哈希 **`89ff8504cc24aeb467bc2a4a714cd5b46a39311d68f90feb2c9079e3bcffecf6`**，与修复方报告 §6 的 `89ff8504…` **完全一致**（三次试冻均为同一值，见 §9）。source.zip（`3c059bc3…`，2,693 文件）与 dist.zip（`b8e2aa77…`，114 文件，已变）三次试冻均与修复方值逐字节一致。
- **修复方本次方法标注正确**：三次均为 `npm run release:freeze -- --trial`，manifest 的 `freeze_commit` / `freeze_status` 为 TRIAL 文案；FIX-P0-18 的 formal/trial 混淆未重现。R18 §6 的复现方法（trial 值 `5479dc8f…` 与 formal 值 `288d6156…` 仅模式文案不同）本轮同样适用，T014 正式重冻时会重新生成。
- **dist.zip 变化是预期的**：`src/` 改动（`workflow-parser.ts` +127/−1、`e2e.ts` +7/−2）后重新打包，dist 由 `f2bcd53f…` 变为 `b8e2aa77…`；`release:verify` 的 build determinism 步骤重建 dist 并比对通过（见 §8），dist 是 `src/` 的确定性产物，不是回归。
- **2693 vs 2597 文件数的说明**：修复方在代码提交 `9dac3e1` 上冻结得 2,693 文件；与 R18 的 2,597 文件相比 +96（`src/` 改动 + 新 evidence/fixtures/测试，属预期）。不是确定性问题；本轮在 `9dac3e1` 的干净克隆上三次复现了 `89ff8504…`，manifest 链可信。
- 此为试冻产物的报告数字核查，不是产品缺陷：manifest 是试冻产物，T014 正式重冻时会重新生成；不计入 P0/P1/P2。

## §7 违规捷径检查：无

- `src/` diff（`e2c418f..9dac3e1`）= 仅 `src/core/workflow-parser.ts`（+127/−1）与 `src/core/e2e.ts`（+7/−2）；`oracle/`、`scripts/`、`release/` diff = 空。
- 删测试 0（`git diff --diff-filter=D` 为空）；测试 diff 中无新增 `skip`/`only` 弱化——唯一命中 `tests/unit/cli/formal-pipeline-unsupported.test.ts:238` 的 `it.skip` 为既有代码（`git blame` 属 FIX-P0-09 时代提交 `d9611356`，夹具门控三元式，非本轮引入）；`npm test` 1697 通过，0 跳过。
- 无 mismatch 忽略名单（`deepDiff` 未动——`git diff` 中 0 命中）；无输入文本手术；无解析器更换（Oracle 侧 0 改动）。
- 修复方报告数字除 §7 的“无新分歧”声称外全部复核一致（§8、§9）；本轮狩猎探针 60/60 证实该声称在本轮探针空间内成立。
- 试冻 manifest 的 `inputs` 仍只记录到 R3，见 P2-R6-1（T014 重冻时处理）。
- 新增测试 36 个（35 夹具 + 1 schema 断言），与报告口径一致；新增夹具 35 件（`tests/fixtures/parser-divergence/duplicate-alias-key-p0-19/` + `expected.json`，`{schema, cases: 35}`）与报告一致；新增测试文件 1 个（`duplicate-alias-key-p0-19.test.ts`）。

## §8 全量重跑（干净克隆 `~/workspace/p020-r19-review`，HEAD `9dac3e1`，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，exit 0） |
| `npm test` | **1697/1697 通过**（53 test files；基线 1661 + 新增 36） |
| `npm run test:oracle` | 167/167，0 偏差，0 false PASS；unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 128 夹具，0 mismatch |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch |
| `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；oracle 24/24；100 次运行 1 个唯一哈希；gate hash 见下 |
| `npm run release:verify` | **PASS**；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `npx eslint src/core/workflow-parser.ts src/core/e2e.ts tests/unit/diff-boundaries/duplicate-alias-key-p0-19.test.ts` | exit 0，无告警 |
| `python3 scripts/build-golden.py --check-only` | golden cases 167，exit 0 |

**S0 gate hash 说明：** 干净克隆的 `evidence/S0_GATE.json` status 为 PASS，但 `gate_report_sha256` 为 `2f3e74d5…`，与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是 `environment_fingerprint`**（克隆路径不同导致；其余字段全部一致，含 `input_fixture_sha256`、`conditions` 全 true、determinism 100/1、unsupported 2/2）。这不是回归（与 R4–R18 同一现象，不同克隆路径不同指纹）。重跑后已 `git checkout -- evidence/S0_GATE.json` 等生成文件恢复，克隆工作树干净（仅 `evidence/probes/r19/` 未跟踪）。

**探针矩阵重跑（干净克隆，仓库内 runner，全 JSON 深相等）：**

| 矩阵 | 结果 |
|---|---|
| fix-p0-04 | **100/100 MATCH**（前 66 行 R5 子集 **66/66 MATCH**） |
| fix-p0-05 | **76/76 MATCH** |
| fix-p0-06 | **134/134 MATCH** |
| fix-p0-07 | **86/86 MATCH** |
| fix-p0-08 | **164/164 MATCH** |
| fix-p0-09 | **98/98 MATCH** |
| fix-p0-10 | **314/314 MATCH** |
| fix-p0-11 | **248/248 MATCH**（0 flagged） |
| fix-p0-12 | **486/486 MATCH**（0 flagged） |
| fix-p0-13 | **196/196 MATCH**（0 flagged） |
| fix-p0-14 | **114/114 MATCH**（0 flagged） |
| fix-p0-15 | **260/260 MATCH**（0 flagged） |
| R10 探针 | **88/88 MATCH** |
| R11 探针 | **74/74 MATCH** |
| R12 探针 | **118/118 MATCH** |
| R13 探针 | **98/98 MATCH** |
| R14 探针 | **78/78 MATCH**（22 处 FLAG STALE 检查 = 11 行，属预期） |
| R15 探针 | **122/122 MATCH**（24 处 FLAG STALE，属预期） |
| R16 探针 | **362/362 MATCH** |
| R17 探针 | **141/141 MATCH** |
| R18 狩猎探针 | **50/50 MATCH**（原 44/50；6 处 DIFF 现为 0） |
| R18 裁决探针 | **22/22 MATCH**（原 12/22；10 处 DIFF 现为 0） |
| R18 裁决 2 探针 | **10/10 MATCH**（原 8/10；2 处 DIFF 现为 0） |
| fix-p0-16 网格 | **238/238 MATCH**（119 形） |
| fix-p0-17 网格 | **216/216 MATCH**（108 形） |
| fix-p0-18 网格 | **79/79 MATCH**（原 77/79；唯二 DIFF 现为 0） |
| fix-p0-19 网格 | **70/70 MATCH**（35 形；A 组 16/16、B 组 18/18、C 组 36/36） |
| R19 独立狩猎探针（自写，`evidence/probes/r19/r19-probe.py` 复用 R18 驱动，30 例，60 检查） | **60/60 MATCH**（0 DIFF，见 §2） |

探针合计 4,102 检查（十二矩阵 2,276 + R10–R17 探针 1,081 + fix-p0-16/17 网格 454 + fix-p0-18/19 网格 149 + R18 三套探针 82 + R19 狩猎探针 60；注：各矩阵与探针有形状重叠，合计为检查次数非去重形状数），DIFF 0 处。

## §9 试冻三哈希（干净克隆，`--trial`，三次）

三次 `npm run release:freeze -- --trial`（HEAD `9dac3e1`）哈希完全一致，确定性成立；source/dist/manifest 与修复方试冻值逐字节一致：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `3c059bc351b5204f90ae6ea521a4941c2a0d02c2a140b612304912af8731be91`（2,693 文件） | 与修复方值一致；与 R18 的 `1b527601…`（2,597 文件）相比已变（`src/` 改动 + 新 evidence/fixtures，属预期） |
| dist.zip | `b8e2aa77074cd2f62a518c1c7969cfdaa7cff202c6d87239080c3dfe2c6d335c`（114 文件） | 与修复方值一致；与 FIX-P0-18 时的 `f2bcd53f…` 相比已变——`src/` 改动后重新打包，属预期（见 §6） |
| RELEASE_MANIFEST.json | `89ff8504cc24aeb467bc2a4a714cd5b46a39311d68f90feb2c9079e3bcffecf6` | **与修复方报告值一致**（三次试冻均为同一值），见 §6 |

`sha256sum -c SHA256SUMS.txt` 3/3 OK（第三次试冻产物上验证；前两次的 `sha256sum -c` 在错误的工作目录运行，未计入——本轮在 `release/` 内重跑确认）。试冻后已 `git checkout release/`，克隆内 `release/` 恢复为 HEAD 正式件（source.zip `3a778b93…`、dist.zip `da130ad2…`，已核对）。

## §10 亲自跑过的命令与结果（摘要）

全部在干净克隆 `~/workspace/p020-r19-review`（HEAD `9dac3e1`）内运行；`npm ci` 后执行。

| # | 命令 | 结果 |
|---|---|---|
| 1 | `git clone ~/workspace/p020-checkpath ~/workspace/p020-r19-review && git checkout 9dac3e1` | 顶为 `9dac3e1`，工作树干净（仅 r19/ 未跟踪） |
| 2 | `npm ci --no-audit --no-fund` | 181 packages，exit 0 |
| 3 | `npm test` | 1697/1697（53 files） |
| 4 | `npm run test:oracle` | 167 夹具，0 mismatch，0 false PASS，34/34 UNKNOWN |
| 5 | `npm run oracle:diff:trigger` / `jobs` / `checks` / `witness` | 128 / 48 / 46 / 44，全部 0 mismatch |
| 6 | `npm run typecheck` | PASS，exit 0 |
| 7 | `npx eslint src/core/workflow-parser.ts src/core/e2e.ts tests/unit/diff-boundaries/duplicate-alias-key-p0-19.test.ts` | exit 0，无告警 |
| 8 | `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| 9 | `python3 scripts/build-golden.py --check-only` | 167 cases，exit 0 |
| 10 | `npm run s0:gate` | PASS；24/24；gate hash 差异仅 environment_fingerprint（§8） |
| 11 | `npm run release:verify` | PASS |
| 12 | `python3 evidence/probes/r18/r18-probe.py evidence/probes/r18/cases.json /tmp/.../r18-hunt-r19.json` | 50/50 MATCH |
| 13 | `python3 evidence/probes/r18/r18-probe.py evidence/probes/r18/adjudication-cases.json ...` / `adjudication2-cases.json ...` | 22/22、10/10 MATCH |
| 14 | `python3 evidence/probes/fix-p0-18/p18-probe.py` | 79/79 MATCH（后恢复原 results.json） |
| 15 | `python3 evidence/probes/fix-p0-19/p19-probe.py` | 70/70 MATCH（后恢复原 results.json） |
| 16 | `python3 evidence/probes/r10/r10-probe.py` … `r17/r17-probe.py` | 88/88、74/74、118/118、98/98、78/78（22 FLAG STALE）、122/122（24 FLAG STALE）、362/362、141/141（后恢复 r17 results.json 原值） |
| 17 | `python3 evidence/probes/fix-p0-XX/run-matrix.py` × 12 | 100/76/134/86/164/98/314/248/486/196/114/260（§8） |
| 18 | `python3 evidence/probes/fix-p0-16/map2-p0-16.py all --results ...` | 238/238 MATCH（119 形） |
| 19 | `python3 evidence/probes/fix-p0-17/p17-probe.py` | 216/216 MATCH（108 形） |
| 20 | `python3 evidence/probes/r19/gen-cases.py && python3 evidence/probes/r18/r18-probe.py evidence/probes/r19/cases.json evidence/probes/r19/results.json` | 60/60 MATCH（§2） |
| 21 | `node evidence/probes/fix-p0-19/parser-probe-p19b.mjs` + `python3 evidence/probes/fix-p0-19/parser-probe-p19.py` | 见 §3（与报告 §3 逐一一致） |
| 22 | `npm run release:freeze -- --trial` × 3（`9dac3e1`） | 三哈希三次一致；`sha256sum -c` 3/3 OK；manifest 与报告值一致（§6、§9） |
| 23 | `git diff e2c418f..9dac3e1 --stat` / `-- src/ oracle/ scripts/ release/` / `--diff-filter=D` / tests `skip`/`only` / `deepDiff` | src 两文件；oracle/scripts/release 空；删文件 0；新增 skip/only 0（唯一命中为 FIX-P0-09 时代既有行）；deepDiff 0 |
| 24 | `git checkout -- evidence/S0_GATE.json evidence/tests/RELEASE_VERIFY_REPORT.json evidence/probes/r17/results.json` + `git checkout release/` | 生成文件恢复；克隆工作树干净（仅 r19/ 未跟踪） |

## §11 未审查事项与报告瑕疵记录

- 未审查：`3991856` 报告提交本身（只含报告文本，无代码）；报告 §2 过程记录中的逐字符测绘细节未逐项复跑——本轮以端到端探针（§8）与解析器层测绘（§3）独立验证结论。
- 未审查：Drive 归档状态与终审对话（不在 T013 复核范围内）。
- **修复方报告无文案订正**：§7 的“本轮探针空间内无新发现的分歧”经本轮独立狩猎探针（60 检查）证实成立；§6 的 trial 模式标注正确（三次均为 `--trial`，FIX-P0-18 的 formal/trial 混淆未重现）；§5 的验收数字本轮全部复核一致。
- **本轮新增 P0：无。** 本轮狩猎探针 60 检查 0 DIFF；全部历史矩阵与探针重跑 0 DIFF。
- **本轮 P2 变化：无。** 8 项全部仍成立，P2-R6-1 范围扩大到 R19（见 §5）。
- 本报告瑕疵：十二矩阵与 R10–R17 探针的批量重跑以单条后台命令顺序执行，中途 r14/r15 以 exit 1 退出（stale-flag 行的预期行为，与 R17/R18 一致）——数字均以结果文件为准，无遗漏；前两次试冻后的 `sha256sum -c` 在错误的工作目录运行（见 §9），第三次试冻时在 `release/` 内重跑并确认 3/3 OK。

## §12 给 parent 的下一步

1. **T013 R19 = PASS**（P0 0 / P1 0 / P2 8）：R18 的 1 个 P0 家族已关闭，本轮狩猎探针无新分歧，全量验收通过，manifest 链可信。按流程进入 **T014 R3 正式重新冻结**（manifest `inputs` 须记入 R4–R19，见 P2-R6-1；R14/R15 探针的 stale-flag 行清理属 T014 范围）→ Drive 重新归档（新 **01_release_R3** 文件夹，保留 R2）→ **终审 R3**（同一立项对话，GPT-6 + Extra High + 完整结尾句）。
2. 终审轮次已用 2/5；R19 仍在同一立项对话内复核，不占用终审轮次。
