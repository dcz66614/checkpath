# T013 独立复核 R18 — FIX-P0-18（R17 的 1 个新 P0 家族）复核报告

- **审查对象**：代码提交 `55bd04a`（FIX-P0-18：将位置规则 `_reject_absorbed_anchor_colon_value_position` 从只遍历 `AnchorToken` 扩展为 `(AnchorToken, AliasToken)`，name 含 `:` 的吸入别名用同一 keyPos 镜像判定；`oracle/checkpath_oracle/parser.py` +33/−3 行，`src/` 0 改动）。报告提交 `c25aeb9` 只含报告文本，不在代码审查范围内。
- **复核员**：T013 独立复核员（全新会话，与 FIX-P0-18 修复方、R17 复核员均隔离；未共享上下文）。
- **复核环境**：干净克隆 `~/workspace/p020-r18-review`（`git clone ~/workspace/p020-checkpath` 后 `git checkout 55bd04a`），`git status` 干净（仅复核探针 `evidence/probes/r18/` 未跟踪），`git log --oneline -1` 顶为 `55bd04a`。全部命令均在该克隆内亲自跑；未与任何修复并行同一工作树（R4 污染教训）。本轮复核中无 VM 重启。
- **结论：NOT PASS — P0 1 / P1 0 / P2 8。**

## §0 审查对象与无污染声明（先读）

- 本轮只审查 `55bd04a` 的代码。`c25aeb9` 的报告文本仅作背景阅读；报告中所有数字均由本轮亲自重跑得出，未采信报告数字。
- 复核探针全部在干净克隆内运行；探针证据（`evidence/probes/r18/`：`gen-cases.py`、`r18-probe.py`、`cases.json`、`results.json`、`results-50788a7.json`、裁决探针 `adjudication*-cases.json` / `adjudication*-results-*.json`、解析器层复现 `parser-probe-r18.py` / `.mjs` 及其输出、重跑副本 `reruns/`、日志 `logs/`、README）随本报告一并提交入仓库，不只留 `/tmp`（P2-R6-2 的教训）。本报告与探针在克隆内写就，交由主控归档；本轮未向主仓库 commit 或 push。
- R17 的 1 个新 P0 家族本轮**全部独立重建并逐一确认关闭**（见 §1）；另发现修复方报告 §7 已披露但定性不完整、且范围被窄化的 **1 个新 P0 家族**（8 形，16 检查，见 §2）。
- **修复方报告数字复核**：除 §6 的 manifest 模式差异（见 §6）与 §7 的两处对照声称（见 §2.3）外，报告 §5 的验收数字本轮全部复核一致（§8、§9）；报告 §4 的网格数字本轮全部复核一致（A 组 17/17、B 组 16/16、C 组 44/46）。

## §1 R17 的 1 个新 P0 家族 — 已关闭（已验证）

R17 定级的 1 个新 P0 家族（9 形，17 检查）已关闭。本轮重跑 R17 自写探针 **141/141 MATCH**（原 124/141，17 处 DIFF 现为 0），其中 9 个家族形逐行核对如下（H3/H8 共 42 检查，全部 MATCH）：

| 家族形 | 结果 |
|---|---|
| `r17-h3-alias-resolved-key`（值位置吸入别名，触发形） | **2/2 MATCH**（原 2 处 DIFF，现双边 INVALID/`yaml_parse_error`） |
| H8 8 形（块值、流值、嵌套值、`on:` 值、`jobs:` 值、第 2 对值位置、嵌套流值、两次使用） | **16/16 MATCH**（原 15 处 DIFF，现双边 INVALID；jobs 模式 1 处原已 MATCH） |

另：修复方 fix-p0-18 网格 A 组（R17 的 9 个家族形）本轮重跑 **17/17 MATCH**，B 组（R17 §2.5 的 8 个边界控制形）**16/16 MATCH**（§8）；`!` 守卫修正未回归（R17 探针 H1 组 18/18 MATCH，含 tag 终结形）。

## §2 新发现 P0 — 1 个家族：流式映射中空值别名键解析为重复标量键（8 形，16 检查）

本轮自写狩猎探针 50 检查中 **6 处 DIFF**，裁决探针 32 检查中 **12 处 DIFF**，fix-p0-18 网格 79 检查中 **2 处 DIFF**——全部属于以下 1 个家族；其余检查全部 MATCH。该家族是修复方报告 §7 已披露的 `c-flow-key-null-2nd` 形状，但本轮证明其**范围远大于修复方声称**（见 §2.3 订正 1、2），且按根因/修复机制应计为独立 1 项 P0。

### 2.1 现象总表

流式映射中，**空值别名键**（`*w` / `*w:2` 后无显式值）解析出的标量与同一映射中另一键重复：

| 形状（本轮重建） | TS | Oracle | 检查 |
|---|---|---|---|
| `&w:2 a: 1` + `m: {a: 1, *w:2}`（标量键在前，吸入别名键在后） | **VALID / []** | **INVALID / `yaml_parse_error`** | 2（trigger + jobs；即修复方 `c-flow-key-null-2nd`） |
| `&w a: 1` + `m: {a: 1, *w}`（普通别名，同一形状） | **VALID** | **INVALID** | 2 |
| `&w a: 1` + `m: {*w, a: 1}`（别名键在前，空值） | **VALID** | **INVALID** | 2 |
| `&w a: 1` + `m: {*w, *w}`（别名键两次，空值） | **VALID** | **INVALID** | 2 |
| `&w:2 a: 1` + `m: {x: {a: 1, *w:2}}`（嵌套流映射） | **VALID** | **INVALID** | 2 |
| `&w:2 a: 1` + `m: {*w:2, a: 1}`（吸入别名键在前，空值） | **VALID** | **INVALID** | 2 |
| `&w:2:3 a: 1` + `m: {a: 1, *w:2:3}`（三冒号吸入别名键） | **VALID** | **INVALID** | 2 |
| `&w:2 a: 1` + `m: {a: 1, *w:2} # c`（行尾注释变体） | **VALID** | **INVALID** | 2 |

合计 8 形 16 检查（去重形状；各套探针合计 20 处 DIFF 检查：裁决 12 + 狩猎 6 + fix-p0-18 网格 2；其中狩猎的 `r18-h17` 与裁决的普通别名形为同一形状，在两套探针中各计 2 检查）。全部为同一根因（见 §2.2），计 1 项。

### 2.2 根因（解析器层最小复现，见 §3）

- **分歧在重复键检查的别名解析时机**。Oracle 的 `_StrictBaseLoader.construct_mapping`（FIX-P0-02 的重复键检查）在 compose 阶段把别名解析为所锚定的标量：`m: {a: 1, *w}` 组合后出现两个 `ScalarNode('a')` 键，Oracle 拒收 `duplicate mapping key: 'a'`（解析器层实测，见 §3：5 个分歧形全部 `LOAD-ERROR duplicate mapping key: 'a'`）。而 TS 的 `yaml` 包 `uniqueKeys` 检查**不对别名键做解析**：`m: {a: 1, *w}` 解析 0 错误，静默接受（后出现的空值甚至覆盖前值，解析得 `{"a": null}`）。
- **空值与有值的不对称是判别式**：有值别名键（`m: {*w: 1, a: 1}`、`m: {*w: 1, *w: 2}`）双边 INVALID（MATCH）——TS 侧 `yaml` 包在 `*w: 1` 处直接报解析错误（`Missing , or : between flow map items`，别名后冒号歧义），Oracle 侧同样拒收（compose 后重复键），双方以不同理由同拒。空值别名键（`*w` / `*w:2` 后无值）则只在 Oracle 侧触发重复键检查，TS 侧畅通。块映射中的别名键（`a: 1` 后接 `*w: 1`、`*w: 1` 在前）双边 INVALID（`_reject_adjacent_alias_colon` / `hasRejectedAnchorOrTag` 拥有），故残留**仅限流式**。
- **与 R17 家族的关系**：不同机制（R17 是位置规则漏了 `AliasToken`；本家族是重复键检查的别名解析时机），不同修复位置（R17 在 Oracle 解析器；本家族须动 TS 侧，见 §2.5）。按根因/修复机制计数（R11/R13/R14/R15 先例），计为独立 1 项，而非 R17 家族的延续。
- **与 D2 的关系**：fix-p0-04 矩阵的已知分歧 D2（`on: {*a: 1}`，流式别名键**有值**）已于 FIX-P0-05 关闭、FIX-P0-11 清除标志，本轮矩阵 100/100、0 flagged 证实仍关闭。本家族是**空值**别名键，与 D2 的有值形不同，不在 D2 的覆盖内。

### 2.3 修复方报告的三处订正

- **订正 1（报告 §7 的窄化结论“仅限流式、标量键在前、别名键在后”）**：范围错误。本轮证实别名键在前（`{*w, a: 1}`、`{*w:2, a: 1}`）、别名键两次（`{*w, *w}`）、嵌套流（`{x: {a: 1, *w:2}}`）同样 DIFF。正确范围：**流式映射（含嵌套）中，空值别名键解析出的标量与同一映射中另一键重复，无论别名键在前、在后、一次或两次**。
- **订正 2（报告 §7 的“别名在前、别名两次的流形：双边 INVALID（MATCH）”）**：仅对**有值**别名键成立（`{*w: 1, a: 1}`、`{*w: 1, *w: 2}` 双边 INVALID，本轮复核一致）。对**空值**别名键不成立（`{*w, a: 1}`、`{*w, *w}` 均为 TS VALID vs Oracle INVALID，本轮在两版基线上逐字复现）。修复方很可能只测了有值形（与已关闭的 D2 `{*a: 1}` 同形），未测空值形。
- **订正 3（报告 §6 的试冻方法）**：修复方声称的 manifest `288d6156…` 本轮**复现**，但它是 **formal 模式**产物——修复方运行的是 `npm run release:freeze`（未加 `--trial`），其 manifest 的 `freeze_commit` / `freeze_status` 为 formal 文案（见 §6）。本轮 trial 模式两次冻结均为 `5479dc8f…`。不是确定性问题，也不是数字错误，是方法标注问题：称作“trial freeze”却用了 formal 模式。T014 正式重冻时须注意模式。

### 2.4 定级：P0（1 项）的依据与权衡

定级 **P0（1 项）**，依据：

- PROJECT_BOOK §7.3（L513）："Oracle 与实现**任何字段不一致都判失败；不得通过忽略字段、容差或人工解释来放行**。"——verdict、错误码、VALID/INVALID、jobs 列表均是输出字段；8 形全部为 VALID vs INVALID。
- PROJECT_BOOK §8.2（L548）："Oracle parity | 100% | 所有受支持输入完全一致。"
- IMPLEMENTATION_PLAN §8.1（L779）："**任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。**"
- IMPLEMENTATION_PLAN §10（L827）：P0 阻断明确包含 "**Oracle mismatch**"。
- **R3-ON 裁决先例**：双边 INVALID、错误码不同**不自动通过**——本家族 8 形是 VALID vs INVALID，形态更强。
- **R10 方向先例**：分歧方向不改变定级（此处 TS 接受、Oracle 拒绝，与 R17 家族方向相反，同属 P0）。
- **R13 §2.4(c) 先例**：定级不受"既有/新产生"影响——本家族在 `50788a7` 上逐字相同（见 §2.6），预先存在不降级。R16 的 P0-A/P0-B 同为预先存在，照样定为 P0。
- **R8 对 R3 的权衡 (c) 先例**：披露诚实不改变定级。修复方在 §7 如实披露了 1 个形状，但披露不改变定级；且本轮证实实际范围大于披露（8 形）。
- **计数原则（R11/R13/R14/R15 先例）**：按根因/修复机制计数。8 形同属一个缺失的检查（TS 侧 uniqueKeys 对别名键盲视），计 1 项。

**已权衡的反方考虑（记录在案，不改变定级）：**
- (a) "修复方已在 §7 披露，建议 P2 级待办、另轮处理"。披露诚实不改变定级（R8 先例）；且 §7 的范围结论与对照声称经本轮证实不完整（见 §2.3 订正 1、2），以 P2 记为"已知残留"会把一个范围未探明的家族锁进待办。
- (b) "输入在产品域之外（真实 workflow 恒有 `on:` 与 `jobs:`）"。R12 §5(a) 与 R13 §2.4(b) 已驳回同一理由；且本家族的裁决形本身就是**真实有效 workflow**（含完整 `on: push` 与 `jobs:`，Oracle 判 INVALID 而 TS 判 VALID 并返回 job）。
- (c) "规模小（16 检查）"。规模不改变定级：§7.3 无 de minimis 条款；R13 的 lone-doc P0 同为 2 检查且定为 P0。
- (d) "与本轮修复无关，是另一条机制（FIX-P0-02）"。机制不同不降级：R16 的 P0-A/P0-B 与 R15 的修复机制也不同，照样定为 P0；评审定级针对当前树的 parity，不针对修复方的任务范围。
- (e) "有值别名键已双边同拒，说明机制大体正确"。有值形的同拒是双方以不同理由偶合（见 §3），不是机制完整——空值形即暴露分歧（与 R16 对 P0-B lone 形的权衡 (e) 同理）。
- (f) "嵌套流、三冒号等是边角"。8 形中有 2 形是修复方网格已覆盖的最简形（`{a: 1, *w:2}` 与普通别名 `{a: 1, *w}`），不是边角；其余形只证明家族的完整边界。

### 2.5 正确的修复方向（供 FIX-P0-19，非定级依据）

- **TS 侧补齐别名键的重复检查**：`yaml` 包的 `uniqueKeys` 对别名键盲视是根因。应在 TS 的 workflow-parser 层（或其重复键检查处），在判重前把流式映射中的别名键解析为所锚定的标量（与 Oracle compose 期行为对齐），再判重——空值别名键解析出的标量与同一映射中另一键重复即拒收（`yaml_parse_error`）。Oracle 侧的拒绝是符合规范的行为（重复键本就是错误，FIX-P0-02 的意图），不应为求 MATCH 而放宽 Oracle。
- **注意**：与 FIX-P0-17/18（纯 Oracle 解析器改动）不同，本家族很可能需要改 `src/`（TS 侧），修复方须先对 TS 侧 `uniqueKeys` 与别名的行为做独立探针，再动实现；`dist.zip` 会随 `src/` 改动而变化，T014 重冻时须重新核对。
- **须守住的边界（本轮控制形，修复后须重验）**：有值别名键（`{*w: 1, a: 1}`、`{*w: 1, *w: 2}`，双边 INVALID）；块映射别名键（双边 INVALID）；纯标量重复键（`{a: 1, a: 2}`，双边 INVALID）；别名单独作键（`{*w}`，双边 VALID）；别名键后接不同标量键（`{b: 2, *w}`，双边 VALID）；别名作值（`b: *w`，双边 VALID）；块映射残留形（`m: {a: 1, *w:2}` 的块形式，双边 INVALID）。
- **须映射的完整边界**：标量键在前/在后、别名键一次/两次、嵌套流、吸入/普通/三冒号别名、行尾注释。

### 2.6 本家族在修复前提交上的状态（预先存在，已逐字验证）

本轮在干净克隆中 `git checkout 50788a7`（基线），用同一裁决探针亲自重跑（探针脚本在未跟踪的 `evidence/probes/r18/` 内，切换提交不受影响；跑后已切回 `55bd04a`）：

| 探针 | `55bd04a` | `50788a7` | 结论 |
|---|---|---|---|
| 裁决探针（11 形，22 检查） | 12/22，DIFF 10 处 | 12/22，DIFF 10 处 | **DIFF 集逐字相同** |
| 裁决探针 2（5 形，10 检查） | 8/10，DIFF 2 处 | 8/10，DIFF 2 处 | **DIFF 集逐字相同** |
| 狩猎探针（25 形，50 检查） | 44/50，DIFF 6 处 | 40/50，DIFF 10 处 | 多出的 4 处为 R17 家族（`r18-h08`、`r18-h09`，方向相反：基线 TS INVALID vs Oracle VALID）；重复键家族的 6 处在两版上完全相同 |

基线切换真实生效的证据：狩猎探针在 `50788a7` 上重现了 R17 家族（`r18-h08` 交叉双吸入、`r18-h09` 流内 `on:` 别名值），在 `55bd04a` 上全部 MATCH。重复键家族在两版上的 DIFF 集逐字相同，确为**预先存在**，不是 FIX-P0-18 的回归；但按 R13 §2.4(c) 先例，预先存在不改变定级（见 §2.4）。

## §3 解析器层最小复现（与探针驱动无关）

干净克隆内直接对解析器本身验证（`evidence/probes/r18/parser-probe-r18.py` + `parser-probe-r18.mjs`，输出见下；探针驱动的端到端结果与此一致）：

| 形状 | PyYAML `_StrictBaseLoader` | `yaml` npm 包 | 端到端（探针） |
|---|---|---|---|
| `{a: 1, *w}`（普通别名键在后） | token：`Anchor('w') … Alias('w')`；LOAD-ERROR `duplicate mapping key: 'a'` | 0 错误；解析得 `{"a":null}`（后值覆盖前值） | TS VALID vs Oracle INVALID——**DIFF** |
| `{a: 1, *w:2}`（吸入别名键在后） | token：`Anchor('w:2') … Alias('w:2')`；LOAD-ERROR `duplicate mapping key: 'a'` | 0 错误；解析得 `{"a":null}` | **DIFF** |
| `{*w, a: 1}`（别名键在前） | LOAD-ERROR `duplicate mapping key: 'a'` | 0 错误；解析得 `{"a":1}` | **DIFF** |
| `{*w, *w}`（别名键两次） | LOAD-ERROR `duplicate mapping key: 'a'` | 0 错误；解析得 `{"a":null}` | **DIFF** |
| `{x: {a: 1, *w:2}}`（嵌套流） | LOAD-ERROR `duplicate mapping key: 'a'` | 0 错误；解析得 `{"x":{"a":null}}` | **DIFF** |
| `{*w: 1, a: 1}`（有值别名键在前，对照） | LOAD-ERROR `duplicate mapping key: 'a'` | 1 错误 `Missing , or : between flow map items`（`*w: 1` 冒号歧义） | MATCH（双边 INVALID，理由不同） |
| `{b: 2, *w}`（别名键后接不同标量，对照） | LOAD-OK `{'a': '1', 'm': {'b': '2', 'a': ''}}` | 0 错误 | MATCH（双边 VALID） |
| `{*w}`（别名单独作键，对照） | LOAD-OK | 0 错误 | MATCH（双边 VALID） |

分歧在解析器/产品层，与探针脚手架无关。注：有值别名键在前一形，TS 与 Oracle 以不同理由同拒（TS 为 `yaml` 包解析错误，Oracle 为重复键）——端到端双边 INVALID 即 MATCH，理由差异不计入定级。

## §4 边界验证：R18 狩猎探针（自写，25 形，50 检查）

| 形状族 | 预期 | 结果 |
|---|---|---|
| 吸入别名键：流序列内流映射（`[{*w:2: 1}]`）、嵌套流映射（`{a: {*w:2: 1}}`）、块序列内流映射（`- {*w:2: 1}`） | MATCH（双边 INVALID） | **MATCH** |
| 吸入别名键有值：流内第二对（`{a: 1, *w:2: 2}`）、第一对（`{*w:2: 2, a: 1}`）、两次（`{*w:2: 1, *w:2: 2}`）、流定义后（`{&w:2 a: 1, *w:2: 2}`）、第二锚（`{&v:3 d: 2, *v:3: 1}`） | MATCH（双边 INVALID） | **MATCH** |
| 显式键：流内 `? *w:2: 1`、块 `? *w:2` + `: 1` | MATCH（双边 INVALID） | **MATCH** |
| 交叉双吸入值位置（`{b: *w:2, c: *v:3}`）、流内 `on:` 别名值（`{on: *w:2}`） | MATCH（R17 家族已闭） | **MATCH**（基线对照：两形在 `50788a7` 上 DIFF，见 §2.6） |
| 步骤内别名键（`- {*w:2: 1}`）、tag 后流值（`{b: !zap *w:2}`）、矩阵内别名值、嵌套序列别名值、`on.branches` 别名值、混合值+键（`{b: *w:2, *w:2: 1}`） | MATCH | **MATCH** |
| 块映射别名键：标量键在后（`a: 1` / `*w:2: 2`）、在前（`*w:2: 2` / `a: 1`） | MATCH（双边 INVALID） | **MATCH** |
| 普通别名键后接不同标量（`{b: 2, *w}`） | MATCH（双边 VALID） | **MATCH** |
| 重复键家族：普通别名键在后（h17）、三冒号（h19）、行尾注释（h20） | DIFF（同 §2） | **DIFF**（6 检查） |

结论：除 §2 的重复键家族外，吸入别名 × 流/嵌套/显式键/多重吸入的组合均已 MATCH；唯一缺口是 §2 的空值别名键重复检查。

## §5 P2 清单：终审 R2 的 6 个 + R6 的 2 个 = 8 个，全部非阻断

R17 的 8 个 P2 全部仍成立，无新增、无清除：

| P2 | 复核（55bd04a） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。冻结脚本未动（`git diff 50788a7..55bd04a -- scripts/ release/ src/` 为空），仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§9） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。README 仍为 "P95 768.3 ms, peak RSS 98.3 MiB"，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 仍有 `NOT_TESTED` 标记，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。试冻 manifest 的 `inputs` 仍只记录到 R3，见 P2-R6-1 |
| **P2-R6-1：manifest 的 `inputs` 只记录 t013 复核到 R3** | 仍成立，且范围扩大到 R18。本轮试冻 manifest 的 `inputs` 键仍为 golden_suite_sha256、oracle_parity_report、s0_gate、s0_input_fixture_sha256、t013_review_r1/r2/r3——R4–R18 十五轮复核均未记录。T014 重冻时须把 R4–R18 一并记入，非阻断 |
| **P2-R6-2：复核探针证据未入仓库** | 部分缓解，仍成立。R7/R8 自写探针只在 `/tmp` 与报告中；R9–R17 自写探针已随报告提交入仓库（`evidence/probes/r9/`–`r17/`），本轮 R18 探针亦在克隆内（`evidence/probes/r18/`，待主控归档）。非阻断 |

**已解决，不再列入未决清单：** P2-R16-1（fix-p0-15 6 标志已清，R17 已确认；本轮矩阵重跑 fix-p0-15 260/260，0 flagged，仍清）；P2-R15-1、P2-R13-1、P2-R12-1、P2-R10-1、P2-R10-2（状态不变；本轮矩阵重跑 fix-p0-12 486/486、fix-p0-13 196/196，0 flagged）。

## §6 Manifest 哈希核查（修复方数字可信，模式有别，不计入定级）

- 本轮实测 trial 模式 manifest 哈希 **`5479dc8f90cfe56c454cb21fa7964ebe14e9c04d7c97b519e915874d2fd65cec`**，两次试冻完全一致（见 §9）；source.zip（`1b527601…`，2,597 文件）与 dist.zip（`f2bcd53f…`，114 文件，未变）两次试冻均与修复方声称逐字节一致。
- 修复方声称的 manifest `288d6156…` 本轮**复现**：它是 **formal 模式**产物——把本轮 manifest 的 `freeze_commit` / `freeze_status` 两字段换成 formal 文案（`PENDING — the commit that records these freeze artifacts…` / `FORMAL`）后哈希恰为 `288d6156…`；随后本轮直接运行一次 formal 冻结（不加 `--trial`），stdout 的 manifest 哈希即为 `288d6156…`，逐字确认。修复方 §6 括号里写的是 `python3 scripts/deterministic-zip.py --freeze`（未加 `--trial`），与其声称的"trial freeze"不符——方法标注问题，不是确定性问题。
- **结论**：manifest 链可信——trial 值 `5479dc8f…`（本轮两次一致）与 formal 值 `288d6156…`（修复方值，本轮直接复现）均为同一树 `55bd04a` 的正确产物，仅模式文案不同。T014 正式重冻时会重新生成；不计入 P0/P1/P2。R19 须注意：试冻一律加 `--trial`，并以自己实测的两次一致值为准，不得从既往报告抄哈希。

## §7 违规捷径检查：无

- `src/` diff（`50788a7..55bd04a`）= 空；`oracle/` diff = 仅 `oracle/checkpath_oracle/parser.py`（+33/−3 行）；`scripts/`、`release/` diff = 空。
- 删测试 0（`git diff --diff-filter=D` 为空）；测试/夹具 diff 中无 `skip`/`only` 弱化（`grep -c` 为 0）。
- 无 mismatch 忽略名单（`deepDiff` 未动）；无输入文本手术；无解析器更换。
- 修复方终报数字除 §6 的模式差异与 §7 的两处对照声称外全部复核一致（§8、§9）；终报 §4 的网格数字本轮**复核一致**（A 组 17/17、B 组 16/16、C 组 44/46）。
- 试冻 manifest 的 `inputs` 仍只记录到 R3，见 P2-R6-1（T014 重冻时处理）。
- 新增测试 0 个（本轮为 Oracle 侧规则扩展，无新增夹具；`npm test` 仍为 1661/1661，与 FIX-P0-17 的基线相同）。

## §8 全量重跑（干净克隆 `~/workspace/p020-r18-review`，HEAD `55bd04a`，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，exit 0） |
| `npm test` | **1661/1661 通过**（52 test files） |
| `npm run test:oracle` | 167/167，0 偏差，0 false PASS；unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 128 夹具，0 mismatch（报告 128/128 passed） |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch（报告 48/48 passed） |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch（报告 46/46 passed） |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch（报告 44/44 passed） |
| `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；oracle 24/24；100 次运行 1 个唯一哈希；gate hash 见下 |
| `npm run release:verify` | **PASS**；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `python3 scripts/build-golden.py --check-only` | golden cases 167，exit 0 |

**S0 gate hash 说明：** 干净克隆的 `evidence/S0_GATE.json` status 为 PASS，但 `gate_report_sha256` 为 `90e328d7…`，与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是 `environment_fingerprint`**（克隆路径不同导致；其余字段全部一致，含 `input_fixture_sha256`、`conditions` 全 true、determinism 100/1、unsupported 2/2）。且已验证：取提交版内容、仅替换 fingerprint 后重算 gate hash，恰得 `90e328d7…`——与本轮实测值一致。不是回归（与 R4–R17 同一现象，不同克隆路径不同指纹）。重跑后已 `git checkout -- evidence/S0_GATE.json` 恢复，克隆工作树干净（仅 `evidence/probes/r18/` 未跟踪）。

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
| fix-p0-15 | **260/260 MATCH**（0 flagged——P2-R16-1 的 6 个标志仍清，见 §5） |
| R10 探针 | **88/88 MATCH** |
| R11 探针 | **74/74 MATCH** |
| R12 探针 | **118/118 MATCH** |
| R13 探针 | **98/98 MATCH** |
| R14 探针 | **78/78 MATCH**（11 个 stale 行，trigger 模式 11 行 FLAG STALE，jobs 模式静默 MATCH——驱动设计：残留行 trigger 预期 DIFF、jobs 预期 MATCH；R17 所述"22 处"为两模式检查数，同一事实） |
| R15 探针 | **122/122 MATCH**（13 个 stale 行，24 处 FLAG STALE，与 R17 所述一致） |
| fix-p0-16 网格 | **238/238 MATCH**（119 形） |
| fix-p0-17 网格 | **216/216 MATCH**（108 形） |
| fix-p0-18 网格 | **77/79 MATCH**（40 形；A 组 17/17、B 组 16/16、C 组 44/46；唯二 DIFF 为 §2 的 `c-flow-key-null-2nd` ×2） |
| R16 探针 | **362/362 MATCH** |
| R17 探针 | **141/141 MATCH**（原 124/141；H3/H8 42 检查全部 MATCH，见 §1） |

**R18 独立狩猎探针（自写，`evidence/probes/r18/r18-probe.py`，25 例，50 检查；见 README）：44/50 MATCH，6 处 DIFF（`r18-h17`、`r18-h19`、`r18-h20`，见 §2、§4）。**

**裁决探针（自写，`evidence/probes/r18/adjudication*-cases.json`）：裁决 11 形 22 检查 12/22、裁决 2 5 形 10 检查 8/10；两版基线（`55bd04a` 与 `50788a7`）DIFF 集逐字相同，见 §2.6。**

探针合计 3,972 检查（十二矩阵 2,276 + R10–R17 探针 1,081 + fix-p0-16/17/18 网格 533 + R18 狩猎探针 50 + 裁决探针 32；注：各矩阵与探针有形状重叠，合计为检查次数非去重形状数），DIFF 20 处（全部为 §2 的 1 个新家族：fix-p0-18 网格 2 + 狩猎 6 + 裁决 12）。

## §9 试冻三哈希（干净克隆，`--trial` 两次 + formal 一次）

| 产物 | trial 两次（完全一致） | formal 一次 | 说明 |
|---|---|---|---|
| source.zip | `1b527601616d2b63e0abf6e8b700449b241b5a48a338cd934c8fb157822f6deb`（2,597 文件） | 同左 | 与修复方值一致 |
| dist.zip | `f2bcd53f360ada37da25d3d650009b4c10274594a8faf4ed1c4d7591680e8f7f`（114 文件） | 同左 | 与修复方值一致；与 R2 相同，未变 |
| RELEASE_MANIFEST.json | `5479dc8f90cfe56c454cb21fa7964ebe14e9c04d7c97b519e915874d2fd65cec` | `288d615666d27c340a8766568359526c39c9e802a3486da3043a5cb3005f778e` | trial 值本轮两次一致；formal 值与修复方声称逐字相同（见 §6） |

`sha256sum -c SHA256SUMS.txt` 3/3 OK（trial ×2 + formal ×1）。试冻后已 `git checkout release/`，克隆内 `release/` 恢复为 HEAD 正式件（source.zip `3a778b93…`、dist.zip `da130ad2…`，已核对——恢复后 manifest 哈希 `04a07733…` 与 HEAD 提交版一致）。

## §10 亲自跑过的命令与结果（摘要）

全部在干净克隆 `~/workspace/p020-r18-review`（HEAD `55bd04a`，基线对照时短暂切到 `50788a7`，见 #23）内运行；`npm ci` 后执行。

| # | 命令 | 结果 |
|---|---|---|
| 1 | `git clone ~/workspace/p020-checkpath ~/workspace/p020-r18-review && git checkout 55bd04a` | 顶为 `55bd04a`，工作树干净（仅 r18/ 未跟踪） |
| 2 | `npm ci --no-audit --no-fund` | 181 packages，exit 0 |
| 3 | `npm test` | 1661/1661（52 files） |
| 4 | `npm run test:oracle` | 167 夹具，0 mismatch，0 false PASS，34/34 UNKNOWN |
| 5 | `npm run oracle:diff:trigger` / `jobs` / `checks` / `witness` | 128 / 48 / 46 / 44，全部 0 mismatch |
| 6 | `npm run typecheck` | PASS，exit 0 |
| 7 | `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| 8 | `python3 scripts/build-golden.py --check-only` | 167 cases，exit 0 |
| 9 | `npm run s0:gate` | PASS；24/24；gate hash 差异仅 environment_fingerprint（§8） |
| 10 | `npm run release:verify` | PASS |
| 11 | `python3 evidence/probes/r17/gen-cases.py && python3 evidence/probes/r17/r17-probe.py` | 141/141 MATCH |
| 12 | `python3 evidence/probes/r16/gen-cases.py && python3 evidence/probes/r16/r16-probe.py` | 362/362 MATCH |
| 13 | `python3 evidence/probes/r10/r10-probe.py` … `r15/r15-probe.py` | 88/88、74/74、118/118、98/98、78/78（11 stale 行）、122/122（24 FLAG STALE） |
| 14 | `python3 evidence/probes/fix-p0-XX/run-matrix.py` × 12 | 100/76/134/86/164/98/314/248/486/196/114/260（§8） |
| 15 | `python3 evidence/probes/fix-p0-16/map2-p0-16.py all --results evidence/probes/r18/reruns/fix-p0-16-grid-results.json` | 238/238 MATCH（119 形） |
| 16 | `python3 evidence/probes/fix-p0-17/p17-probe.py` | 216/216 MATCH（108 形） |
| 17 | `python3 evidence/probes/fix-p0-18/gen-cases.py && python3 evidence/probes/fix-p0-18/p18-probe.py` | 77/79 MATCH（唯二 DIFF 为 `c-flow-key-null-2nd`，见 §2） |
| 18 | `python3 evidence/probes/r18/gen-cases.py && python3 evidence/probes/r18/r18-probe.py` | 44/50 MATCH（6 处 DIFF，§2、§4） |
| 19 | `python3 evidence/probes/r18/r18-probe.py evidence/probes/r18/adjudication-cases.json evidence/probes/r18/adjudication-results-55bd04a.json` | 12/22 MATCH（10 处 DIFF，§2） |
| 20 | `python3 evidence/probes/r18/r18-probe.py evidence/probes/r18/adjudication2-cases.json evidence/probes/r18/adjudication2-results-55bd04a.json` | 8/10 MATCH（2 处 DIFF，§2） |
| 21 | `python3 evidence/probes/r18/parser-probe-r18.py` + `node evidence/probes/r18/parser-probe-r18.mjs` | 见 §3 |
| 22 | `npm run release:freeze -- --trial` × 2（`55bd04a`）+ `npm run release:freeze` × 1（formal） | trial manifest `5479dc8f…` 两次一致；formal manifest `288d6156…` 与修复方声称逐字相同（§6、§9） |
| 23 | `git checkout 50788a7`，重跑裁决/裁决 2/狩猎三探针，`git checkout 55bd04a` | 裁决 12/22、裁决 2 8/10、狩猎 40/50——DIFF 集与 `55bd04a` 逐字相同（重复键家族）；狩猎多出的 4 处为 R17 家族（§2.6） |
| 24 | `git diff 50788a7..55bd04a --stat` / `-- src/ oracle/ scripts/ release/` / `--diff-filter=D` / tests `skip`/`only` | src/scripts/release 空；删文件 0；skip/only 0；parser.py 唯一代码改动 |
| 25 | `hasRejectedAnchorOrTag` 关键行核对（`src/core/workflow-parser.ts` L936 起；`indicator === "&" \|\| indicator === "*"` 同一分支、同一 `keyPos` 计算） | 亲自确认：TS 侧 `&` 与 `*` 共用 keyPos 判定，位置规则无问题；缺口在重复键检查的别名解析（§2.2） |

## §11 未审查事项与报告瑕疵记录

- 未审查：`c25aeb9` 报告提交本身（只含报告文本，无代码）；报告 §2 过程记录中的逐字符测绘细节未逐项复跑——本轮以端到端探针（§8）与解析器层测绘（§3）独立验证结论。
- 未审查：Drive 归档状态与终审对话（不在 T013 复核范围内）。
- **终报文案订正 1（§7 的窄化结论）**：见 §2.3 订正 1——残留不限于"标量键在前、别名键在后"，别名键在前/两次/嵌套流同样 DIFF。
- **终报文案订正 2（§7 的"别名在前、别名两次双边 INVALID"）**：见 §2.3 订正 2——仅对有值别名键成立；空值形 DIFF。
- **终报文案订正 3（§6 的试冻模式）**：见 §2.3 订正 3 / §6——修复方称"trial freeze"却未加 `--trial`，其 manifest 是 formal 模式产物；本轮 trial 值 `5479dc8f…` 与 formal 值 `288d6156…` 均已实测。
- **本轮新增 P0（见 §2）：** 1 个家族，8 形，16 检查（去重形状；各套探针合计 20 处 DIFF 检查），预先存在于 `50788a7`，与本轮位置规则无关。
- **本轮 P2 变化（见 §5）：** 无；8 项全部仍成立，P2-R6-1 范围扩大到 R18。
- 本报告瑕疵：裁决探针初版的 `adj-block-alias-value-after-scalar` 一形自带设计缺陷（YAML 第二行 `a: 1` 与锚定义行 `&w a: 1` 构成纯标量重复键，双边 INVALID 的原因不是别名作值）；已发现并改用干净对照 `adj2-block-alias-value-clean`（`&w a: 1` + `b: *w`，双边 VALID），初版该形的结果不作为定级依据，缺陷记录在此。

## §12 给 parent 的下一步

1. **定点修复 §2 的 1 个新 P0 家族（FIX-P0-19）**：
   - TS 侧补齐别名键的重复检查：流式映射中，空值别名键解析出的标量与同一映射中另一键重复即拒收（`yaml_parse_error`），与 Oracle 的 compose 期重复键检查对齐。很可能需要改 `src/`（与 FIX-P0-17/18 的纯 Oracle 改动不同），修复方须先对 TS 侧 `uniqueKeys` 与别名的行为做独立探针；`dist.zip` 会随 `src/` 改动而变化，T014 重冻时须重新核对。
   - 然后派**新的独立复核 R19**（审查对象为修复后 HEAD；复核员一律在干净克隆里验证，不得与修复并行同一工作树；R19 须重跑本报告 §2 的 8 形 + §4 的边界探针 + 十二矩阵 + R5 66 例 + 本轮 25 形矩阵 + 终报 manifest 哈希复核——注意试冻须加 `--trial`，以自己实测的两次一致值为准）。
2. R19 PASS 后：T014 正式重新冻结（manifest `inputs` 须记入 R4–R18，见 P2-R6-1；R14/R15 探针的 stale-flag 行清理属 T014 范围）→ Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3（同一立项对话，GPT-6 + Extra High + 完整结尾句）。
3. 终审轮次已用 2/5；R19 仍在同一立项对话内复核，不占用终审轮次。
