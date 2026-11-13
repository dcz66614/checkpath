# T013 独立复核 R16 — FIX-P0-16（R15 的 3 个 P0 家族）复核报告

- **审查对象**：代码提交 `6821ed0`（FIX-P0-16：关闭 R15 的 3 个 P0 家族；相对 `ba71eed`，70 文件，+5348/−576）。报告提交 `7be361f` 只含报告文本，不在代码审查范围内。
- **复核员**：T013 独立复核员（全新会话，与 FIX-P0-16 修复方、R15 复核员均隔离；未共享上下文）。
- **复核环境**：干净克隆 `/tmp/p020-r16-1794247588`（`git clone ~/workspace/p020-checkpath` 后 `git checkout 6821ed0`），`git status` 干净（仅复核探针 `evidence/probes/r16/` 未跟踪），`git log --oneline -2` 顶为 `6821ed0`。全部命令均在该克隆内亲自跑；未与任何修复并行同一工作树（R4 污染教训）。本轮复核中无 VM 重启。
- **结论：NOT PASS — P0 2 / P1 0 / P2 9。**

## §0 审查对象与无污染声明（先读）

- 本轮只审查 `6821ed0` 的代码。`7be361f` 的报告文本仅作背景阅读；报告中所有数字均由本轮亲自重跑得出，未采信报告数字。
- 复核探针全部在干净克隆内运行；探针证据（`evidence/probes/r16/`：`cases.json` 181 行、`gen-cases.py`、`r16-probe.py`、`parser-probe-r16.py`、`parser-probe-r16.mjs`、`results.json`、网格重跑 `grid-rerun-results.json`、R10–R15 与十二矩阵重跑副本 `reruns/`、README）随本报告一并提交入仓库，不只留 `/tmp`（P2-R6-2 的教训）。本报告与探针在克隆内写就，交由主控归档；本轮未向主仓库 commit 或 push。
- R15 的 3 个 P0 家族本轮**全部独立重建并逐一确认关闭**（见 §1）；另发现修复方报告未披露的 **2 个新 P0 家族**（16 形，31 检查，见 §2）——定级不采信修复方"已披露残差为空"的表述，定级只看是否存在 mismatch。
- **基线对照**：§2 的 2 个新家族已在修复前提交 `ba71eed` 上逐形重跑（独立 worktree `/tmp/p020-r16-ba71eed`，同一驱动）——**在 ba71eed 上同样 DIFF**，故为既有分歧，非 FIX-P0-16 引入的回归；但"既有"不改变定级（见 §2.4 反方 (c)）。
- **修复方报告数字复核**：除 §11 的两处对照声称外，报告 §3 的验收数字本轮全部复核一致（§8、§9）；报告 §4 的 manifest 哈希本轮**复现**（见 §6）。

## §1 R15 的 3 个 P0 家族 — 已关闭（已验证）

R15 定级的 3 个 P0 家族（13 行，24 检查）已关闭。本轮从 R15 报告 §2 原文独立重建（锚名/值/事件均不同：`&q/&w`、值 3、事件 `schedule`），在干净克隆内 trigger + jobs 双模式重跑，**全部 MATCH**（含于本轮自写探针 362 检查之中，见 §8）；修复方 R15 探针重跑 **122/122 MATCH**（原 98/122；24 处 FLAG STALE 属预期，见下）。

| 家族（R15 §2.5 方向） | 本轮重建形状 | 结果 |
|---|---|---|
| P0-1 C3 越界：tag + unglued anchored 空键 | 根首对 `!zap &q : 3`、根第 2 对 `a: 1\n!zap &q : 3`、嵌套第 2 对 `m:\n  a: 1\n  !zap &q : 3`，全工作流变体 | **6/6 MATCH**（3 形 ×2 模式；R15 指出的修复方错误控制 claim——根首对——现已纠正：双边 VALID） |
| P0-2 扫描器层：无空格 `&x:!!str` | `&q:!!str {on: schedule}`（流）、`&q:!!str\n  on: schedule\n  jobs: …`（块） | **4/4 MATCH**（2 形 ×2 模式；其中流形的 jobs 模式在 R15 时已 MATCH，3 处原 DIFF 检查现全闭；`on: !!int {push: {}}` 的错误对照声称现已纠正，见 P0-3） |
| P0-3 loader 边界：标量 tag 在集合值上 | `&q: !!int {on: schedule}`、`&q: !!bool {on: schedule}`、`m: !!int {a: 1}`、`m: !!float {a: 1}`、`on: !!int {schedule: {}}`、`on: !!bool {schedule: {}}`、`on: !!float {schedule: {}}`、`on: !!str {schedule: {}}`，对照 `a: !!int 1` | **16/16 MATCH**（8 形 ×2 模式；其中 15 检查原为 DIFF，`on: !!str` 的 jobs 模式在 R15 时已 MATCH；崩溃与 UNKNOWN 均已消失；标量 tag 对照未变） |

另：修复方 R15 探针重跑时 24 处 FLAG STALE（13 个残差行中原先预期 DIFF 的检查现已 MATCH：`r15-d-tag-root-first` ×2、`r15-r1-c3-root2nd` ×2、`r15-r1-c3-nested2nd` ×2、`r15-r2-str-flow-nospace` trigger、`r15-r2-str-block-nospace` ×2、`r15-r3-int` ×2、`r15-r3-bool` ×2、`r15-r3-int-pos` ×2、`r15-r3-float-pos` ×2、`r15-r3-on-tag` ×2、`r15-r3-on-bool` ×2、`r15-r3-on-float` ×2、`r15-r3-on-str` trigger）——属预期，见 R15 探针"残留行 MATCH 即过期"的约定；其余 98 检查 MATCH。R14 探针重跑 **78/78 MATCH**（11 处 FLAG STALE，(a)–(e) 族已闭合，属预期）。

报告 §2 的判别式/边界控制本轮全部重跑（见 §4）：C3 缩窄的 16 形豁免边（R13 §4.2，H 组 9 形 18/18）+ R15 位置矩阵（B 组 20 形 40/40）；scanner mirror 的触发/不触发边界（C 组除 §2 三形外 46/46：值位置、`?` 之后、标量键、引号标量、注释、纯量中段、tab 分隔、tab 缩进、自别名、双文档）；loader 边界（D 组 24 形 48/48：`!!null`/`!foo`/`!!timestamp`/`!!set`/`!!binary`/`!!omap`/`!!pairs` 在集合值上、标量 tag 对照、映射作键）；网格残差的两条新规则（E 组 25 形 50/50）；(c) 交互（F 组 10 形 20/20，含值位置 `m: !zap &q:!!str {a: 1}`——prevProp 扩展未破坏值位置护栏）。

## §2 新发现 P0 — 16 形，2 个家族（31 检查）

本轮自写探针 362 检查中 **31 处 DIFF**，全部属于以下 2 个新家族；其余 331 检查全部 MATCH。两家族均在 `ba71eed` 上逐形重跑确认同样 DIFF（见 §2.6），为既有分歧，非本轮回归。

### 2.1 现象总表

| 家族 | 例（本轮重建） | TS | Oracle | 检查 |
|---|---|---|---|---|
| P0-A mirror 别名键豁免过度：`&x:!!tag` 后接别名键 | `x: &w 1\n&q:!!str *w: 2\non: schedule\njobs: …`、lone 变体、push 事件变体、`!!int`/`!zap` tag 变体、别名指向序列、未定义别名 | **INVALID / `yaml_parse_error` / []** | WF 形：**UNKNOWN**（`schedule` 不支持）/ [1 job]；push 形：**VALID / [1 job]**；lone 形：INVALID / **`missing_on_key`** | 13（7 形：c15 ×2、n1 trigger、n2 ×2、n3 ×2、n4 ×2、n14 ×2、n15 ×2） |
| P0-B anchor 吸入 `:`：`&x:<非tag内容>` 后接映射 | `&q:2\non: push\njobs: …`、`&q:foo\non: push\njobs: …`、`&q:bar-baz`、`&q:123`、`&q:2x`（根位置）；`m: &q:2`（值位置）；`m: {&q:2}`（流位置） | 根位置：**VALID / [1 job]**（push）或 **UNKNOWN**（schedule）；值/流位置：**INVALID / `yaml_parse_error`** | 根位置：**INVALID / `yaml_parse_error` / []**；值位置：**VALID / [1 job]**；流位置：**UNKNOWN** | 18（9 形 ×2 模式：c16、c17、n7、n8、n10、n11、n12、n13、n17） |

### 2.2 根因（解析器层最小复现，见 §3）

- **P0-A**：分歧在 mirror 的 `_nospace_anchor_colon_is_key` 豁免。`&q:!!str *w: 2` 中，mirror 的前瞻看到 tag 后是别名键（`*w:`），判定"tag 后节点是标量/别名键"而不触发；PyYAML 原生扫描把 `:!!str *w` 读成**普通标量键**（token 流：`AnchorToken('q') ScalarToken(':!!str *w') ValueToken('') ScalarToken('2')`），文档解析为合法映射 `{'x': '1', ':!!str *w': '2', 'on': 'schedule', …}`，Oracle 只报 UNKNOWN（`schedule` 不支持）或 VALID（push）。npm 侧则把 `:` 吸进 anchor 名（`q:`），`!!str` 作用于别名键 `*w`，报错 "An alias node must not specify any properties" + "Implicit map keys need to be followed by map values" → `yaml_parse_error`。豁免的设计依据（报告 §2.2）是"npm 把标量读作该对的键"——对**纯量键**成立（`&q:!!str hello: 1`：npm 读 `hello` 为键，双边接受，键内容差异不可见，本轮 c14 MATCH），但对**别名键不成立**：npm 不接受带属性的别名键，直接拒收。豁免把别名键与纯量键同等对待是错误的。
- **P0-B**：分歧在 anchor 名字符集。YAML 规范的 ns-anchor-char 含 `:`（`:` 不是流指示符），npm 依此把 `&q:2` 的整个 `q:2` 读作 anchor 名，锚定其后的映射（根位置：文档即该映射，VALID/UNKNOWN；lone 形：文档 null）。PyYAML 的 `scan_anchor` 只认 `[A-Za-z0-9_-]`，`:` 不在其中：读出 anchor `q` 后，`:` 既非值指示符（后接非空白）也非合法标量起始，扫描器在下一行的 `on:` 处抛 `ScannerError: mapping values are not allowed here` → `yaml_parse_error`。值位置（`m: &q:2`）方向相反：npm 拒收（锚 `q:2` 的空值与后续对冲突），PyYAML 把 `:2` 读成纯量值而接受。流位置（`m: {&q:2}`）同样方向相反。P0-2 的 mirror 只处理 `:` 后接 `!` 的情形，对 `:` 后接非 tag 内容无镜像。

### 2.3 修复方报告的两处对照声称订正

- **订正 1（报告 §2.2 的 `&b:2`/`&b:foo` 声称）**：报告称"`&b:2` / `&b:foo` 被整个吸进 anchor 名，文档为 null（与 Oracle 的 `workflow_root_not_mapping` 同码，已 MATCH，端到端确认）"——**仅对 lone 形成立**。本轮实测：lone 形 `&q:2` / `&q:foo` 确为 MATCH（npm 文档 null；PyYAML 文档为纯量 `':2'` / `':foo'`，双边同码 `workflow_root_not_mapping`，键/值内容不可见——n9 MATCH）。但后接映射的 WF 形（c16/c17/n7/n8/n10/n11/n12）**全部 DIFF**：npm 把 anchor 挂在映射上而接受，PyYAML 扫描器报错。修复方的"端到端确认"只覆盖了 lone 形，未覆盖后接映射的形态——同一机制在不同上下文表现相反，lone 形的 MATCH 不能外推。
- **订正 2（报告 §2.2 的 mirror 豁免声称）**：报告称 mirror"tag 后不是标量/别名键时"才触发，豁免覆盖"标量/别名键"——**别名一半是错的**。纯量键（c14、`&q:!!str hello: 1`）与引号纯量键（n5/n6，`"hello"`/`'hello'`）确实 MATCH；但别名键（c15/n1–n4/n14/n15）**全部 DIFF**，无论别名已定义（指向纯量或序列）、未定义，也无论 tag 是 `!!str`/`!!int`/自定义 `!zap`。豁免须收窄为纯量键（plain/quoted scalar），别名键不得豁免。

### 2.4 定级：P0（2 项）的依据与权衡

定级 **P0（2 项）**，依据：

- PROJECT_BOOK §7.3（L513）："Oracle 与实现**任何字段不一致都判失败；不得通过忽略字段、容差或人工解释来放行**。"——verdict、错误码、VALID/INVALID/UNKNOWN、jobs 列表均是输出字段；P0-A 的 lone 形（`yaml_parse_error` vs `missing_on_key`）与 P0-B 的值/流位置形均为字段级分歧。
- PROJECT_BOOK §8.2（L548）："Oracle parity | 100% | 所有受支持输入完全一致。"
- IMPLEMENTATION_PLAN §8.1（L779）："**任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。**"
- IMPLEMENTATION_PLAN §10（L827）：P0 阻断明确包含 "**Oracle mismatch**"。
- **R3-ON 裁决先例**：双边 INVALID、错误码不同**不自动通过**，定为 P0——P0-A 的 lone 形（n1）同形态。
- **R10 方向先例**：分歧方向不改变定级。P0-B 在根位置（TS 接受 / Oracle 拒收）与值/流位置（TS 拒收 / Oracle 接受）方向相反，同属一个家族。
- **终审 R2 的裁决先例**：把同类分歧降为 P2 的理由被终审明确驳回。
- **计数原则（R11/R13/R14/R15 先例）**：按根因/修复机制计数。两个家族需要两种不同的修复机制（见 §2.5），计为 2 项；同家族内多形状同机制，计 1 项（P0-A 7 形 13 检查 1 项、P0-B 9 形 18 检查 1 项）。

**已权衡的反方考虑（记录在案，不改变定级）：**
- (a) "既有分歧，不是 FIX-P0-16 引入的回归"（见 §2.6）。"既有"不等于"可接受"：§8.2 要求 100% parity；R15 的 P0-3 崩溃同样是既有的 Oracle 健壮性缺口，仍定 P0。修复排期不是定级理由（R13 §2.4(c) 先例）。
- (b) "修复方已如实披露 §7 为空——本轮未发现新分歧"。披露诚实不改变定级（R8 对 R3 的权衡 (c) 同理）；且本轮的 16 形是修复方未曾探查的形状（`&b:2` 只测了 lone 形，别名键只测了纯量键），披露并不完整。
- (c) "输入在产品域之外（真实 workflow 恒有 `on:` 与 `jobs:`）"。R12 §5(a) 与 R13 §2.4(b) 已驳回同一理由；P0-B 的 push 形（n7/n8/n10/n11/n12）本身就是**真实有效 workflow**（TS VALID，含 `on` 与 `jobs`）；P0-A 的 push 形（n2）同样是真实 workflow（Oracle VALID，TS 拒收）。
- (d) "规模小（31 检查；P0-A 仅 13 检查）"。规模不改变定级：§7.3 无 de minimis 条款；R13 的 lone-doc P0 同为 2 检查且定为 P0。
- (e) "lone 形 MATCH，说明机制大体正确"。lone 形的 MATCH 是两种不同解析结果的同码抵消（npm null 文档 vs PyYAML 纯量文档，同码 `workflow_root_not_mapping`），不是机制一致——后接映射即暴露分歧（见 §2.3 订正 1）。
- (f) "P0-B 的修复须改 anchor 扫描字符集，风险大"。修复难度不是定级理由；且 §2.5 已给出收窄可行的判别式方向（`:` 后接空白时不吸入，守住 C3 域与 `&x:` null 豁免）。

### 2.5 各家族的正确修复方向（供 FIX-P0-17，非定级依据）

- **P0-A 收窄 mirror 豁免**：`_nospace_anchor_colon_is_key` 的豁免须只覆盖**纯量键**（plain/quoted scalar 后接 `:`），**别名键不得豁免**（mirror 须触发）。可行性已验证：带空格的同形 `x: &w 1\n&q: !!str *w: 2\non: schedule…`（n18）双边同为 `yaml_parse_error`（MATCH）——mirror 触发后的 token 流与带空格形等价，Oracle 将同样拒收。收窄时须守住纯量键对照（c14/n5/n6）与 `?` 护栏（n16 MATCH）及值位置护栏（c11/c12/f6 MATCH）。
- **P0-B anchor 字符集镜像**：在 `_StrictBaseLoader` 的 anchor 扫描处镜像 npm 的 ns-anchor-char：`&x` 后接 `:` 且 `:` 后为**非空白、非 `!`** 内容时，把 `:` 及后续 anchor 字符吸入 anchor 名（与 npm 一致）。须区分：`:` 后接空白仍是值指示符（C3 域 `&x: 1`、null 豁免 `&x:` 不受影响）；`:` 后接 `!` 仍走 P0-2 mirror。须映射完整边界并做专门边界重验：根位置（n7/n8/n10/n11/n12）、值位置（n13，方向相反）、流位置（n17，方向相反）、序列项、嵌套、带 tag 的 `&x:2`（`&q:2` 后接 `!tag`？即 `&q:2!foo …`——须实测）、anchor 名含多个 `:`（`&q:2:3`）等。仅把 PyYAML 的 ScannerError catch 成 `yaml_parse_error` 不够——根位置 TS 说 VALID/UNKNOWN。

### 2.6 ba71eed 基线对照（既有分歧的证据）

在修复前提交 `ba71eed` 的独立 worktree（`/tmp/p020-r16-ba71eed`，同一驱动、同一 TS 入口）上逐形重跑：

| 形状 | ba71eed | 6821ed0 | 结论 |
|---|---|---|---|
| c15-alias-key | DIFF（INVALID/yaml_parse_error vs UNKNOWN） | DIFF（同） | 既有 |
| c16-absorb-2 | DIFF（UNKNOWN vs INVALID/yaml_parse_error） | DIFF（同） | 既有 |
| c17-absorb-foo | DIFF（同上） | DIFF（同） | 既有 |
| n1-alias-key-lone | DIFF（yaml_parse_error vs missing_on_key） | DIFF（同） | 既有 |
| n7-absorb-2-push | DIFF（VALID vs INVALID/yaml_parse_error） | DIFF（同） | 既有 |
| n18-alias-key-spaced（对照） | MATCH（双边 yaml_parse_error） | MATCH（同） | 对照成立 |

## §3 解析器层最小复现（与探针驱动无关）

干净克隆内直接对解析器本身验证（`evidence/probes/r16/parser-probe-r16.py` + `parser-probe-r16.mjs`，输出见下；探针驱动的端到端结果与此一致）：

| 形状 | PyYAML `_StrictBaseLoader` | `yaml` npm 包 | 端到端（探针） |
|---|---|---|---|
| P0-A `x: &w 1\n&q:!!str *w: 2` + WF | token：`AnchorToken('q') ScalarToken(':!!str *w') ValueToken('') ScalarToken('2')`；load 得 `{'x': '1', ':!!str *w': '2', 'on': 'schedule', …}` | 报错 "An alias node must not specify any properties" + "Implicit map keys need to be followed by map values"（另警告 "Alias ending in : is ambiguous"） | TS INVALID/yaml_parse_error vs Oracle UNKNOWN（schedule）/ VALID（push） |
| P0-A 对照 `&q:!!str hello: 1` + WF | token 同上模式（纯量键 `:!!str hello`） | 接受：键 `hello`（anchor `q:!!str`），值 1 | MATCH（键内容差异不可见） |
| P0-A 对照 `x: &w 1\n&q: !!str *w: 2`（带空格） | —（与 mirror 触发后的 token 流等价） | — | MATCH（双边 yaml_parse_error） |
| P0-B `&q:2` + WF | THROW `ScannerError: mapping values are not allowed here`（line 2 `on:`） | 接受：anchor `q:2` 挂在整个映射上，`{"on":"schedule","jobs":{…}}`，0 错误 0 警告 | TS UNKNOWN（schedule）/ VALID（push）vs Oracle INVALID/yaml_parse_error |
| P0-B `&q:foo` + WF | 同上（ScannerError） | 接受：anchor `q:foo` 挂在映射上 | 同上 |
| P0-B lone `&q:2` / `&q:foo` | load 得纯量 `':2'` / `':foo'` | 文档 null，anchor `q:2` / `q:foo` | MATCH（双边 `workflow_root_not_mapping`，同码抵消） |

分歧在解析器/扫描器层，与探针脚手架无关。

## §4 边界验证：P0-A/P0-B 的判别式边界（本轮自写探针）

| 形状族 | 预期 | 结果 |
|---|---|---|
| P0-A：别名键 `!!int` / 自定义 `!zap` tag（n3/n4） | DIFF（同 c15） | **DIFF**（各 ×2 检查） |
| P0-A：别名指向序列（n14）、未定义别名（n15） | DIFF（同 c15） | **DIFF**（各 ×2 检查） |
| P0-A：引号纯量键 `"hello"` / `'hello'`（n5/n6） | MATCH（纯量键） | **MATCH** |
| P0-A：`?` 显式键 + 别名键（n16） | MATCH（`?` 护栏） | **MATCH** |
| P0-A：带空格同形（n18） | MATCH（双边 yaml_parse_error） | **MATCH** |
| P0-A：值位置 `m: &q:!!str {a: 1}`（c11）、`on:` 值位置（c12）、tag 前缀值位置 `m: !zap &q:!!str {a: 1}`（f6） | MATCH（mirror 不触发，双边拒收） | **MATCH** |
| P0-B：根位置 `&q:2` / `&q:foo` / `&q:bar-baz` / `&q:123` / `&q:2x`（n7/n8/n10/n11/n12） | DIFF（TS VALID vs Oracle INVALID） | **DIFF**（各 ×2 检查） |
| P0-B：值位置 `m: &q:2`（n13） | DIFF（方向相反：TS 拒收 / Oracle 接受） | **DIFF**（×2 检查） |
| P0-B：流位置 `m: {&q:2}`（n17） | DIFF（TS 拒收 / Oracle UNKNOWN） | **DIFF**（×2 检查） |
| P0-B：lone 形 `&q:2`（n9） | MATCH（双边 workflow_root_not_mapping） | **MATCH** |
| P0-B：流内 `&q:!!str`（c10/g14/g15）与 C3 域（B 组 40/40、H 组 18/18） | MATCH | **MATCH** |

结论：P0-A 的豁免边界在"纯量键 vs 别名键"处；P0-B 的字符集边界在"`:` 后接非空白非 `!` 内容"处。两家族的判别式均已由本轮边界探针精确定界（§2.5）。

## §5 P2 清单：终审 R2 的 6 个 + R6 的 2 个 + 本轮新增 1 个 = 9 个，全部非阻断

R15 的 9 个 P2 中 8 个仍成立，P2-R15-1 已清除（见下），另新增 **P2-R16-1**：

| P2 | 复核（6821ed0） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。冻结脚本未动（`git diff ba71eed..6821ed0 -- scripts/ release/ src/` 为空），仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§9） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。README 仍为 "P95 768.3 ms, peak RSS 98.3 MiB"，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 仍有 `NOT_TESTED` 标记，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。试冻 manifest 的 freeze_commit 字段为 TRIAL 说明；正式冻结时 T014 报告 §9 补实际 commit（同 R2 模式） |
| **P2-R6-1：manifest 的 `inputs` 只记录 t013 复核到 R3** | 仍成立，且范围扩大到 R16。本轮试冻 manifest 的 `inputs` 键仍为 golden_suite_sha256、oracle_parity_report、s0_gate、s0_input_fixture_sha256、t013_review_r1/r2/r3——R4–R16 十三轮复核均未记录。T014 重冻时须把 R4–R16 一并记入，非阻断 |
| **P2-R6-2：复核探针证据未入仓库** | 部分缓解，仍成立。R7/R8 自写探针只在 `/tmp` 与报告中；R9–R16 自写探针已随报告提交入仓库（`evidence/probes/r9/`–`r16/`），故"后续复核探针入仓"的要求自 R9 起已满足。非阻断 |
| **P2-R16-1（新增）：fix-p0-15 `cases.json` 的 6 个过期 `known_divergence` 标志未清** | fix-p0-15 矩阵重跑 260/260 MATCH，但 `cases.json` 的 6 行（`x-c3-overfire-tag-unglued-2nd`、`x-c3-overfire-tag-unglued-2nd-nested`、`a-str-flow-nospace`、`a-str-block-nospace`、`a-int-flow-space`、`a-bool-flow-space`）仍标 `known_divergence`。终报 §7 自认"其标志已过期"却未清除（与 P2-R15-1 同类问题）。本轮的 6 个标志须由 FIX-P0-17 或 T014 清除（逐行核对确为 MATCH 后翻转）。非阻断 |

**已解决，不再列入未决清单：** P2-R15-1（fix-p0-14 11 标志已清：本轮核对 `cases.json` 57 行 0 flagged，diff 显示 11 处 `true`→`false`；矩阵重跑 114/114 MATCH）；P2-R13-1、P2-R12-1、P2-R10-1、P2-R10-2（状态不变；本轮矩阵重跑 fix-p0-12 486/486、fix-p0-13 196/196，0 flagged；T006 报告 `suite_sha256` 为 `36c3853d…`，与同一提交的 `tests/fixtures/trigger/suite.json` 实测哈希逐字节一致）。

## §6 Manifest 哈希核查（修复方数字第三轮可信，不计入定级）

- 本轮实测 manifest 哈希 **`17f06f86…`**，与终报 §4 的 `17f06f86…` **完全一致**（两次试冻均为同一值，见 §9）。source.zip（`3ede7ad7…`，2,473 文件）与 dist.zip（`f2bcd53f…`，114 文件，未变）两次试冻均与终报逐字节一致。
- **历史链确认**：R15 在 `5e3cda7` 上两次试冻为 `5801092c…`，与终报一致（R15 §6 已证）；本轮在 `6821ed0` 上两次一致的 `17f06f86…` 是本轮的可信值。修复方报告的 manifest 哈希连续三轮可复现——"以自己实测的两次一致值为准，不得从既往报告抄哈希"的规则继续有效，R17 须对本轮的 `17f06f86…` 做同样的试冻复核。
- 此为试冻产物的报告数字核查，不是产品缺陷：manifest 是试冻产物，T014 正式重冻时会重新生成；不计入 P0/P1/P2。

## §7 违规捷径检查：无

- `src/` diff（`ba71eed..6821ed0`）= 空；`oracle/` diff = 仅 `oracle/checkpath_oracle/parser.py`（+525/−22 行，2563 → 3066 行：scanner mirror + loader 分支 + 2 条 `_reject_*` 规则 + C3 缩窄）；`scripts/`、`release/` diff = 空。
- 删测试 0（`git diff --diff-filter=D` 为空）；测试/夹具 diff 中无 `skip`/`only` 弱化（`grep -c` 为 0）。
- 无 mismatch 忽略名单（`deepDiff` 未动）；无输入文本手术；无解析器更换。
- 修复方终报数字除 §11 的两处对照声称外全部复核一致（§8、§9）；终报 §4 的 manifest 哈希本轮**复现**，见 §6。
- 试冻 manifest 的 `inputs` 仍只记录到 R3，见 P2-R6-1（T014 重冻时处理）。
- 新增测试 33 个（32 fixture + 1 schema 断言），与终报口径一致；新增夹具 32 件（`tests/fixtures/parser-divergence/anchored-empty-key-p0-16/` p01–p32 + `expected.json`）与终报一致；新增测试文件 1 个（`anchored-empty-key-p0-16.test.ts`）。

## §8 全量重跑（干净克隆 `/tmp/p020-r16-1794247588`，HEAD `6821ed0`，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，exit 0） |
| `npm test` | **1623/1623 通过**（51 test files；基线 1590 + 新增 33） |
| `npm run test:oracle` | 167/167，0 偏差，0 false PASS；unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 128 夹具，0 mismatch（报告 128/128 passed） |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch（报告 48/48 passed） |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch（报告 46/46 passed） |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch（报告 44/44 passed） |
| `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；oracle 24/24；100 次运行 1 个唯一哈希；gate hash 见下 |
| `npm run release:verify` | **PASS**；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `python3 scripts/build-golden.py --check-only` | golden cases 167，exit 0 |

**S0 gate hash 说明：** 干净克隆的 `evidence/S0_GATE.json` status 为 PASS，但 `gate_report_sha256` 为 `9abe6d6f…`，与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是 `environment_fingerprint`**（克隆路径不同导致；其余字段全部一致，含 `input_fixture_sha256`、`conditions` 全 true、determinism 100/1、unsupported 2/2）。这不是回归（与 R4–R15 同一现象，不同克隆路径不同指纹）。重跑后已 `git checkout -- evidence/S0_GATE.json` 恢复。

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
| fix-p0-14 | **114/114 MATCH**（0 flagged——P2-R15-1 的 11 个标志已清，见 §5） |
| fix-p0-15 | **260/260 MATCH**（12 检查 flagged——6 行 stale 标志，见 §5 P2-R16-1） |
| R10 探针 | **88/88 MATCH** |
| R11 探针 | **74/74 MATCH** |
| R12 探针 | **118/118 MATCH** |
| R13 探针 | **98/98 MATCH** |
| R14 探针 | **78/78 MATCH**（11 行 FLAG STALE，(a)–(e) 族已闭合，属预期） |
| R15 探针 | **122/122 MATCH**（24 行 FLAG STALE，§2 的 13 行已闭合，属预期） |
| fix-p0-16 网格 | **238/238 MATCH**（119 形；p1 54/54、p2 46/46、p3 82/82、p4 56/56） |

**R16 独立探针（自写，`evidence/probes/r16/r16-probe.py`，181 例 ×2 模式 = 362 检查；R15 残差行与 R14 家族、R13 §4.2 豁免边均用新标识符重建，未复制修复方 `cases.json` / 网格）：**

| 组 | 结果 |
|---|---|
| A R15 13 残差行重建 | 13 例 ×2 模式 **26/26 MATCH** |
| B §2.1 C3 控制 | 20 例 ×2 模式 **40/40 MATCH** |
| C §2.2 mirror 边界 | 26 例 ×2 模式 **46/52 MATCH**（6 处 DIFF：c15/c16/c17，见 §2） |
| D §2.3 loader 边界 | 24 例 ×2 模式 **48/48 MATCH** |
| E §2.4 网格残差 | 25 例 ×2 模式 **50/50 MATCH** |
| F (c) × nospace 交互 | 10 例 ×2 模式 **20/20 MATCH** |
| G 新狩猎形状 | 30 例 ×2 模式 **60/60 MATCH** |
| H R13 §4.2 豁免边重建 | 9 例 ×2 模式 **18/18 MATCH** |
| I R14 五族抽查重建 | 6 例 ×2 模式 **12/12 MATCH** |
| N 新 P0 两家族边界映射 | 18 例 ×2 模式 **11/36 MATCH**（25 处 DIFF：P0-A 11 检查、P0-B 14 检查） |

探针合计 3,454 检查（十二矩阵 2,276 + R10 探针 88 + R11 探针 74 + R12 探针 118 + R13 探针 98 + R14 探针 78 + R15 探针 122 + fix-p0-16 网格 238 + R16 独立探针 362；注：各矩阵与探针有形状重叠，合计为检查次数非去重形状数），DIFF 31 处（全部为 §2 的 2 个新家族）。

## §9 试冻三哈希（干净克隆，`--trial`，两次）

两次 `npm run release:freeze -- --trial`（HEAD `6821ed0`）哈希完全一致，确定性成立；source/dist/manifest 与修复方试冻值逐字节一致（manifest 第三轮复现，见 §6）：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `3ede7ad7c546d278f3a4d79e552e952a2529818698db13eab8b350e9abb815c6`（2,473 文件） | 与修复方值一致；与 R15 的 `3d3136f7…`（2,396 文件）相比已变（`oracle/` 改动 + 新 evidence/fixtures，属预期） |
| dist.zip | `f2bcd53f360ada37da25d3d650009b4c10274594a8faf4ed1c4d7591680e8f7f`（114 文件） | 与修复方值一致；与 FIX-P0-13/14/15 时完全相同——dist 是纯 TS 发行物，`src/` 0 改动 |
| RELEASE_MANIFEST.json | `17f06f8628b4e6006e19e9354c2b07935cc0723878e147ea134339ccad422a18` | **与修复方报告值一致**（两次试冻均为同一值），见 §6 |

`sha256sum -c SHA256SUMS.txt` 3/3 OK。试冻后已 `git checkout release/`，克隆内 `release/` 恢复为 HEAD 正式件（source.zip `3a778b93…`、dist.zip `da130ad2…`，已核对）。

## §10 亲自跑过的命令与结果（摘要）

全部在干净克隆 `/tmp/p020-r16-1794247588`（HEAD `6821ed0`）内运行；`npm ci` 后执行。

| # | 命令 | 结果 |
|---|---|---|
| 1 | `git clone ~/workspace/p020-checkpath /tmp/p020-r16-1794247588 && git checkout 6821ed0` | 顶为 `6821ed0`，工作树干净（仅 r16/ 未跟踪） |
| 2 | `npm ci --no-audit --no-fund` | 181 packages，exit 0 |
| 3 | `npm test` | 1623/1623（51 files） |
| 4 | `npm run test:oracle` | 167 夹具，0 mismatch，0 false PASS，34/34 UNKNOWN |
| 5 | `npm run oracle:diff:trigger` / `jobs` / `checks` / `witness` | 128 / 48 / 46 / 44，全部 0 mismatch |
| 6 | `npm run typecheck` | PASS，exit 0 |
| 7 | `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| 8 | `python3 scripts/build-golden.py --check-only` | 167 cases，exit 0 |
| 9 | `npm run s0:gate` | PASS；24/24；gate hash 差异仅 environment_fingerprint（§8） |
| 10 | `npm run release:verify` | PASS |
| 11 | `python3 evidence/probes/r16/gen-cases.py && python3 evidence/probes/r16/r16-probe.py` | 331/362 MATCH（31 处 DIFF，§2） |
| 12 | `python3 evidence/probes/r10/r10-probe.py` … `r15/r15-probe.py` | 88/88、74/74、118/118、98/98、78/78（11 FLAG STALE）、122/122（24 FLAG STALE） |
| 13 | `python3 evidence/probes/fix-p0-XX/run-matrix.py` × 12 | 100/76/134/86/164/98/314/248/486/196/114/260（§8） |
| 14 | `python3 evidence/probes/fix-p0-16/map2-p0-16.py all --results evidence/probes/r16/grid-rerun-results.json` | 238/238 MATCH（119 形） |
| 15 | `python3 evidence/probes/r16/parser-probe-r16.py` + `node evidence/probes/r16/parser-probe-r16.mjs` | 见 §3 |
| 16 | `python3 /tmp/r16-baseline-check.py`（ba71eed worktree `/tmp/p020-r16-ba71eed`，同一驱动） | c15/c16/c17/n1/n7 在 ba71eed 上同样 DIFF；n18 对照 MATCH（§2.6） |
| 17 | `npm run release:freeze -- --trial` × 2（`6821ed0`） | 三哈希两次一致；`sha256sum -c` 3/3 OK；manifest 与终报值一致（§6、§9） |
| 18 | `git diff ba71eed..6821ed0 --stat` / `-- src/ oracle/ scripts/ release/` / `--diff-filter=D` / tests `skip`/`only` | 70 文件 +5348/−576；src/ 空；scripts/release 空；删文件 0；skip/only 0 |
| 19 | fix-p0-14 `cases.json` 11 标志核对 + fix-p0-15 `cases.json` 6 标志核对 + T006 报告哈希核对 | P2-R15-1 已清；P2-R16-1 新增（6 标志过期）；T006 哈希逐字节一致（§5） |
| 20 | C3 缩窄 / mirror / loader / 新规则接线核对（`parser.py` 关键行） | C3 `has_tag and not glued` 跳过（L1684）；mirror `check_value`/`_mirror_may_fire`/`_skip_tag`/`_nospace_anchor_colon_is_key`（L476–660）；`_construct_core_scalar` 集合分支（L413）；新规则 `_reject_tagged_empty_key`（L2116）与 `_reject_flow_anchored_empty_key_collection`（L2203），双接线 L2640–2641 与 L2973–2974 |

## §11 未审查事项与报告瑕疵记录

- 未审查：`7be361f` 报告提交本身（只含报告文本，无代码）；报告 §2 过程记录中的三轮测绘细节未逐项复跑——本轮以端到端探针（§8）与解析器层测绘（§3）独立验证结论。
- 未审查：Drive 归档状态与终审对话（不在 T013 复核范围内）。
- **终报文案订正 1（§2.2 的 `&b:2`/`&b:foo` 声称过宽）：** 终报称两者"已 MATCH，端到端确认"——仅 lone 形成立；后接映射的 WF 形全部 DIFF（见 §2.3）。
- **终报文案订正 2（§2.2 的 mirror 豁免声称一半错）：** 终报称 mirror 豁免覆盖"标量/别名键"——纯量键成立，别名键不成立（见 §2.3）。
- **终报文案订正 3（§7 的"未发现新分歧"）：** 终报 §7 称本轮未发现新的分歧——本轮独立探针发现 2 个新 P0 家族（16 形，31 检查），均在 ba71eed 上既有（见 §2、§2.6）。
- **本轮新增 P0（见 §2）：** 2 个家族，16 形，31 检查，全部独立重建并定级。
- **本轮 P2 变化（见 §5）：** P2-R16-1 新增（fix-p0-15 6 标志过期）；P2-R15-1 已清；P2-R6-1 范围扩大到 R16。
- 本报告瑕疵：R16 自写探针的 R6 形状未单列——R6 5 形状已由 R14 探针重跑覆盖（78/78 含 10/10，见 §8），未在本轮探针中重复。注：`r16-c16` 的 jobs 模式同样 DIFF（[1 job] vs []，因 Oracle 在 jobs 模式下同样 ScannerError），与 R15 的 `r15-r2-str-flow-nospace` jobs MATCH（双边均为空）不同——已在 `diff` 字段中逐模式标注。

## §12 给 parent 的下一步

1. **定点修复 §2 的 2 个新 P0 家族（FIX-P0-17）**：
   - P0-A 收窄 mirror 豁免：`_nospace_anchor_colon_is_key` 只豁免纯量键，别名键须触发 mirror（带空格同形 n18 已证双边同拒，方向可行）；须做纯量键对照（c14/n5/n6）+ `?` 护栏（n16）+ 值位置护栏（c11/c12/f6）的专门边界重验，并清除 P2-R16-1 的 6 个过期标志（逐行核对确为 MATCH 后翻转）。
   - P0-B anchor 字符集镜像：`&x` 后接 `:` 且 `:` 后为非空白、非 `!` 内容时，把 `:` 及后续 anchor 字符吸入 anchor 名（与 npm 的 ns-anchor-char 一致）；须映射完整边界（根/值/流位置、序列项、嵌套、多 `:`、后接 tag）并做专门边界重验，守住 C3 域（`&x: 1`）与 `&x:` null 豁免。
   - 然后派**新的独立复核 R17**（审查对象为修复后 HEAD；复核员一律在干净克隆里验证，不得与修复并行同一工作树；R17 须重跑本报告 §2 的 16 形 + §4 的边界探针 + 十二矩阵 + R5 66 例 + 本轮 181 行矩阵 + 终报 manifest 哈希复核）。
2. R17 PASS 后：T014 正式重新冻结（manifest `inputs` 须记入 R4–R16，见 P2-R6-1；清除 fix-p0-15 的 6 行 stale `known_divergence` 标志）→ Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3（同一立项对话，GPT-6 + Extra High + 完整结尾句）。
3. 终审轮次已用 2/5；R17 仍在同一立项对话内复核，不占用终审轮次。
