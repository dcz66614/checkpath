# T013 独立复核 R14 — FIX-P0-14（R13 lone-doc P0）复核报告

- **审查对象**：代码提交 `45487eb`（FIX-P0-14：关闭 R13 lone-doc P0；相对 `a8c120b`，33 文件，+3250/−134）。终报提交 `df53e88` 只含终报文本，不在代码审查范围内。
- **复核员**：T013 独立复核员（全新会话，与 FIX-P0-14 修复方、R13 复核员均隔离；未共享上下文）。
- **复核环境**：干净克隆 `~/workspace/p020-review-r14/`（`git clone ~/workspace/p020-checkpath` 后 `git checkout 45487eb`），`git status` 干净（仅复核探针 `evidence/probes/r14/` 未跟踪），`git log --oneline -2` 顶为 `45487eb`。全部命令均在该克隆内亲自跑；未与任何修复并行同一工作树（R4 污染教训）。本轮复核中无 VM 重启；一次 `npm run s0:gate` 因 120 s 前台时限转入后台，后经 `process.log` 取回完整结果（PASS，见 §8）。
- **结论：NOT PASS — P0 5 / P1 0 / P2 8。**

## §0 审查对象与无污染声明（先读）

- 本轮只审查 `45487eb` 的代码。`df53e88` 的终报文本仅作背景阅读；报告中所有数字均由本轮亲自重跑得出，未采信终报数字。
- 复核探针全部在干净克隆内运行；探针证据（`evidence/probes/r14/`：`cases.json` 39 行、`gen-cases.py`、`r14-probe.py`、`parser-probe.mjs`、`results.json`、README）随本报告一并提交入仓库，不只留 `/tmp`（P2-R6-2 的教训）。
- 终报 §7 披露的 11 个残留检查本轮**全部独立重建并逐一定级**，见 §2；另加五条件判别式逐条必要性探针（见 §4）与解析器层最小复现（见 §3）；定级不采信修复方"超出本轮范围"/"分类对齐会是错误码"/"需要新语义"的表述——定级只看是否存在 mismatch。
- **本轮首次**：修复方报告的试冻 manifest 哈希（`5a89a52e…`）本轮三次试冻全部逐字节复现（见 §6）——连续两轮无法复现后，manifest 数字首次可信。

## §1 R13 的 lone-doc P0 — 已关闭（已验证）

R13 定级的 lone-doc P0（`&x: 1` / `&x:` 单独成文档，2 检查，trigger 模式）已关闭。本轮从 R13 报告 §2 原文独立重建 2 形状（锚名与值均不同：`&a: 7` / `&a:`），在干净克隆内 trigger + jobs 双模式重跑，**4/4 MATCH**（含于本轮自写探针 78 检查之中，见 §8）；修复方 R13 探针重跑 **98/98 MATCH**（原 96/98）；修复方新矩阵 **103/114 MATCH**，其余 11 检查均为 §2 的残留行。

| 检查 | 结果 |
|---|---|
| lone-doc 2 形状（§2.1 重建，`&a: 7` / `&a:`） | **4/4 MATCH**（双边 INVALID / `workflow_root_not_mapping`，jobs 双边 `[]`） |
| 引号空 key 对照 2 形状（`"": 9` / `'': 9`） | **4/4 MATCH**（双边 INVALID / `missing_on_key`——分类规则未破坏该 MATCH，判别式条件 2 成立） |
| 映射值对照 2 形状（`&a: {b: 3}` / `&a:\n  b: 3`） | **4/4 MATCH**（双边 INVALID / `missing_on_key`——条件 5 成立） |
| lone 纯量/anchored 纯量/tagged 纯量对照 3 形状 | **6/6 MATCH**（双边 `workflow_root_not_mapping`） |
| 引号空 key + 完整 workflow 对照 | **2/2 MATCH**（双边 VALID） |
| R13 探针重跑（49 行） | **98/98 MATCH** |
| fix-p0-14 新矩阵（57 行 × 2） | **103/114 MATCH**（11 检查 DIFF，全部为 §2 的残留行，flagged） |
| R6 5 形状（R10 §2.1 重建，含于本轮探针） | **10/10 MATCH** |
| R10 / R11 / R12 探针重跑 | **88/88 / 74/74 / 118/118 MATCH** |

## §2 新发现 P0 — 11 个残留检查，5 个家族（trigger 模式）

修复方终报 §7 披露的残留。本轮独立重建（锚名、值、事件均不同：`a`/`b`、`7`/`2`、`pull_request`）并逐一端到端确认，**11/11 检查 DIFF**（trigger 模式；jobs 模式 11/11 MATCH—— lone 文档双边 jobs 均为空，见 §2.6 例外）。

### 2.1 现象总表

| 家族 | 例（本轮重建） | TS | Oracle |
|---|---|---|---|
| (a) 映射值含 `on`（3 检查） | `&a: {on: pull_request}`、`&a:\n  on: pull_request`、`&a: !bar {on: pull_request}` | **VALID** | **INVALID / `missing_on_key`** |
| (b) 值节点第二 anchor（3 检查） | `&a: &b 2`、`&a: &b [2]`、`&a: &b` | **INVALID / `yaml_parse_error`** | **INVALID / `missing_on_key`** |
| (c) key 上带 tag（3 检查） | `!bar &a: 2`、`!!str &a: 2`、`---\n!bar &a: 2` | **INVALID / `yaml_parse_error`** | **INVALID / `missing_on_key`** |
| (d) unglued anchor-colon（1 检查） | `&a : 2` | **INVALID / `yaml_parse_error`** | **INVALID / `missing_on_key`** |
| (e) 嵌套块映射值带 anchored key（1 检查） | `&a:\n  &b: 2` | **INVALID / `yaml_parse_error`** | **INVALID / `missing_on_key`** |

合计 **11 处 DIFF / 78 检查**（11 形状 × trigger 模式；jobs 模式 MATCH）。对照组全部 MATCH：流映射双生形状 `&a: {&b: 2}`（双边 `missing_on_key`）、两对嵌套变体、`&a: !bar 2`（值上 tag，规则应触发）、`&a: [{on: pull_request}]`（流序列值含 `on` 项，规则应触发）等，见 §4。

### 2.2 根因（解析器层最小复现，见 §3）

五个家族同源于 `yaml` 包与 PyYAML 对 `&x:` 的结构渲染分歧，但落在五个不同的修复机制上（见 §2.5）：

- (a) `yaml` 包把 `&x:` 的 anchor 挂在值节点上，值映射即文档本身（`&x: {on: push}` → `{"on": "push"}`，真实 workflow）；PyYAML 渲染为 1 对映射 `{'' : {on: push}}`。
- (b) `yaml` 包拒收"一个节点至多一个 anchor"（值节点同时挂 `&x:` 与 `&y`）；PyYAML 静默接受（`&x: &y 1` → `{'' : '1'}`）。
- (c) TS 侧经 `hasRejectedAnchorOrTag`（E05）拒收；PyYAML 接受。
- (d) TS 侧经 `hasUnrepresentableKey` 拒收；PyYAML 接受（`&x : 1` 渲染为映射 `{'' : 1}`，与 `&x: 1` 的 token 序列相同，只有 mark 不同）。
- (e) `yaml` 包在块上下文拒收"至多一个 anchor"（`&x:\n  &y: 1`，line 2），流上下文却接受（`&x: {&y: 1}` → `{"1": null}`，渲染为映射）；PyYAML 两者均渲染为 `{'' : {'': '1'}}`。

### 2.3 修复方"分类对齐会是错误码"说法的核查

修复方称"分类对齐到 `workflow_root_not_mapping` 会是错误码，故没有任何分类规则能关闭它们"，该说法**在其字面范围内成立**，但不等于分歧不可关闭，也不等于不应定级：

- (a) TS 说 VALID，分类对齐给 `workflow_root_not_mapping` 确实是错误码；关闭它需要 **unwrap 语义**（Oracle 把 anchored-empty-key 对的值当作文档，见 §2.5(a)）。
- (b)–(e) TS 说 `yaml_parse_error`，分类对齐确实给不出该码；关闭它们需要 **拒收规则**（镜像 `yaml` 包/E05/hasUnrepresentableKey 的拒收，见 §2.5(b)–(e)）。
- 机制新颖性（unwrap / 新拒收规则）是修复设计问题，不是定级问题（R13 §2.4(c) 先例：定级只看是否存在 mismatch）。

### 2.4 定级：P0（5 项）的依据与权衡

定级 **P0（5 项）**，依据：

- PROJECT_BOOK §7.3（L513）："Oracle 与实现**任何字段不一致都判失败；不得通过忽略字段、容差或人工解释来放行**。"——错误码与 VALID/INVALID  verdict 均是输出字段。
- PROJECT_BOOK §8.2（L548）："Oracle parity | 100% | 所有受支持输入完全一致。"
- IMPLEMENTATION_PLAN §8.1（L779）："**任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。**"
- IMPLEMENTATION_PLAN §10（L827）：P0 阻断明确包含 "**Oracle mismatch**"。
- **R3-ON 裁决先例**：双边 INVALID、错误码不同**不自动通过**，定为 P0——家族 (b)–(e) 与之同形态。
- **R10 方向先例**：分歧方向不改变定级（"TS 更严"与"Oracle 更严"同等对待）。家族 (a) 是反向（TS 接受、Oracle 拒）且 verdict 级分歧（VALID vs INVALID），比 R3-ON 更强。
- **终审 R2 的裁决先例**：把同类分歧降为 P2 的理由被终审明确驳回。
- **计数原则（R11/R13 先例）**：按根因/修复机制计数。五个家族需要五种不同的修复机制（见 §2.5），计为 5 项；同家族内多形状同机制，计 1 项（(a) 3 检查 1 项、(b) 3 检查 1 项、(c) 3 检查 1 项、(d)/(e) 各 1 检查 1 项）。

**已权衡的反方考虑（记录在案，不改变定级）：**
- (a) "分类对齐会是错误码"——成立，但关闭机制是 unwrap 而非分类对齐（见 §2.3）；机制不存在不等于 mismatch 不存在。
- (b) "超出 R13 §12 方向"——R13 §12 是对 lone-doc P0 的修复方向建议，不是对后续复核的定级范围限制；R13 本身就是把 FIX-P0-13 终报 §7 的残留定为 P0 的先例。
- (c) 双边都判 INVALID，只差错误码（家族 (b)–(e)）。但 R3-ON 正是此形态且定为 P0；"都 INVALID"不是 §7.3 的放行条件。
- (d) 输入在产品域之外（真实 workflow 恒有 `on:` 与 `jobs:`）。R12 §5(a) 与 R13 §2.4(b) 已驳回同一理由；家族 (a) 更直接反驳它——TS 侧把该输入当作**真实有效 workflow**（VALID，含 `on` 与 `jobs`），不是退化输入。
- (e) 规模小（11 检查，仅 trigger 模式；jobs 模式 MATCH）。规模不改变定级：§7.3 无 de minimis 条款；R13 的 lone-doc P0 同为 2 检查且定为 P0。
- (f) 修复方已如实披露 11 行残留、未 silent 扩大范围。披露诚实不改变定级：定级只看提交代码是否存在 mismatch（与 R8 对 R3 的权衡 (c) 同理）。
- (g) (b) 与 (e) 共用 `yaml` 包同一报错文案（"at most one anchor"），可否合并为 1 项？已权衡：两者 token 位置不同（值首 token 是 AnchorToken vs 嵌套块映射键），且 (e) 的修复必须绕开 P0-C3 单对豁免（见 §2.5(e)），是不同的设计问题，故分计为 2 项。若采更严的"同一报错文案即同一根因"口径，则为 P0 4 项；** verdict 不变（NOT PASS）**，FIX-P0-15 须覆盖两个位置。
- (h) 修复难度：(a) 的 unwrap 须同时改 `parse_workflow_yaml` 与 `extract_jobs`，且须守住引号空 key 与 C3 豁免的 MATCH；难度不影响定级（R12 §5(c) 先例）。

### 2.5 各家族的正确修复方向（供 FIX-P0-15，非定级依据）

- **(a) unwrap 语义**：Oracle 在 lone-doc anchored-empty-key 位置，当值是映射时以其值为文档（`parse_workflow_yaml` 与 `extract_jobs` 均须改——§2.6 已证值含 `jobs:` 时 jobs 模式亦分歧）。判据须用 token 模式（与本轮分类规则同一判别式，条件 5 取反：值是映射才 unwrap），否则会破坏引号空 key `"": 1` 的 MATCH 与 C3 豁免形状。
- **(b) 镜像"至多一个 anchor"拒收**：新 `_reject_*` 规则，值首 token 为 AnchorToken 时拒收（判别式条件 5 已排除该情形，分类规则不触发，故拒收规则与分类规则不冲突）。须注意：`yaml` 包在 workflow 内任意位置都拒收第二 anchor（已验证 `m: {a: &x &y 1}` 同样抛错），故规则作用域须覆盖 workflow 内位置，不只 lone-doc；同时须区分 `&x *y`（anchor 后跟 alias，合法）与 `&x &y 1`（anchor 后跟 anchor + 纯量）。
- **(c) 镜像 E05**：lone-doc 位置 KeyToken 与 AnchorToken 之间出现 TagToken 时拒收（判别式条件 3 已排除该情形）。workflow 内变体已有 R13 §4.2 边覆盖（双边拒），缺口仅在 lone-doc。
- **(d) 镜像 hasUnrepresentableKey**：lone-doc 位置 anchor 未 glued（AnchorToken.end != ValueToken.start）时拒收（判别式条件 4 已排除该情形）。
- **(e) 镜像嵌套块映射的"至多一个 anchor"拒收**：值是块映射且其首对本身是 anchored empty key 时拒收；须为**块上下文限定**（流双生 `&x: {&y: 1}` 双边 MATCH，不可误拒），且须绕开 P0-C3 单对豁免——豁免针对"对自身所在位置"，而 (e) 是"作为 anchored-empty-key 值的嵌套对"，位置不同。

### 2.6 家族 (a) 的 jobs 模式补充验证

修复方称"含 `jobs:` 的值在 jobs 模式也会分歧"。本轮端到端验证（`&x:\n  on: push\n  jobs:\n    test: …`）：TS trigger **VALID**（事件 push）、TS jobs 提取出 `[{id: test, …}]`；Oracle trigger **INVALID / `missing_on_key`**、Oracle jobs **`[]`**。属实：(a) 在值含 `jobs:` 时双模式分歧，unwrap 必须同时改两处。本轮 11 行残留的 jobs 模式 MATCH 只是因为其值不含 `jobs:`，不是 (a) 本身 jobs 一致。

## §3 解析器层最小复现（与探针驱动无关）

干净克隆内直接对解析器本身验证（`evidence/probes/r14/parser-probe.mjs` + PyYAML `_StrictBaseLoader`）：

| 形状 | PyYAML `_StrictBaseLoader` | `yaml` npm 包 | 端到端（探针） |
|---|---|---|---|
| `&x: {on: push}` (a) | dict `{'' : {on: push}}` | dict `{"on": "push"}`（值即文档） | TS VALID vs Oracle `missing_on_key` |
| `&x: &y 1` (b) | dict `{'' : '1'}`（静默接受） | THROW "A node can have at most one anchor" | TS `yaml_parse_error` vs Oracle `missing_on_key` |
| `&x: &y 1` 在 workflow 内 | 同上 | 同样 THROW（line 1, col 11） | （在 workflow 内由既有规则覆盖，见 §2.5(b)） |
| `!foo &x: 1` (c) | dict `{'' : '1'}` | （解析器层接受；TS 侧 E05 拒收） | TS `yaml_parse_error` vs Oracle `missing_on_key` |
| `&x : 1` (d) | dict `{'' : 1}` | dict `{'' : 1}`（渲染为映射；TS 侧 hasUnrepresentableKey 拒收） | TS `yaml_parse_error` vs Oracle `missing_on_key` |
| `&x:\n  &y: 1` (e) | dict `{'' : {'': '1'}}` | THROW "A node can have at most one anchor"（line 2） | TS `yaml_parse_error` vs Oracle `missing_on_key` |
| `&x: {&y: 1}` (e 流双生) | dict `{'' : {'': '1'}}`（与块式完全相同） | OK → `{"1": null}`（渲染为映射） | MATCH（双边 `missing_on_key`） |
| `&x:\n  &y: 1\n  z: 2`（(e) 两对变体） | dict `{'' : {'': '1', 'z': '2'}}` | THROW "Implicit keys need to be on a single line" | MATCH（双边 `yaml_parse_error`——Oracle 侧既有 C3 规则拒收） |

分歧在解析器层，与探针脚手架无关。(e) 的两对变体 MATCH 说明：Oracle 侧既有 C3 规则能拒收嵌套多对形状，缺口只在**单对嵌套**——P0-C3 单对豁免把它放行了（豁免本为 `m:\n  &x: 1` 这类合法形状而设）。

## §4 边界验证：五条件判别式的逐条必要性

本轮自写探针逐条验证 `_is_lone_anchored_empty_key_doc` 的五条条件，每条都有且仅有一条被违反的形状，确认规则既不过宽也不过窄（全部含于本轮 78 检查，见 §8）：

| 条件 | 违反该条件的形状 | 预期 | 结果 |
|---|---|---|---|
| (1) 文档恰为单 key `{''}` dict | `&a: 7\nname: probe`（文档含真实 key） | 规则不触发；Oracle `missing_on_key` | MATCH（双边 `missing_on_key`） |
| (2) 根 token 流恰为单对块映射（Key 后为 AnchorToken） | `"": 9` / `'': 9`（key token 是 ScalarToken） | 规则不触发 | MATCH（双边 `missing_on_key`） |
| (3) KeyToken 与 AnchorToken 间无 TagToken | `!bar &a: 2`（残留 (c)） | 规则不触发 | DIFF（§2 家族 (c)，规则正确地未触发） |
| (4) anchor glued 到冒号 | `&a : 2`（残留 (d)） | 规则不触发 | DIFF（§2 家族 (d)，规则正确地未触发） |
| (5a) 值 manifestly 非映射 | `&a: {b: 3}` / `&a:\n  b: 3`（映射值） | 规则不触发 | MATCH（双边 `missing_on_key`） |
| (5b) 值首 token 是 AnchorToken 不触发 | `&a: &b 2`（残留 (b)） | 规则不触发 | DIFF（§2 家族 (b)，规则正确地未触发） |
| 规则应触发：值上 tag | `&a: !bar 2` | 规则触发（跳过值上 TagToken） | MATCH（双边 `workflow_root_not_mapping`） |
| 规则应触发：流序列值含 `on` 项 | `&a: [{on: pull_request}]` | 规则触发（文档本身是序列） | MATCH（双边 `workflow_root_not_mapping`） |
| 规则应触发：块序列值 | `&a:\n  - b` | 规则触发 | MATCH |
| 规则应触发：块序列值含 anchored-empty-key 项 | `&a:\n  - &b: 2` | 规则触发 | MATCH |
| 规则应触发：文档标记/结束/注释/尾空格 | `---\n&a: 5`、`&a: 5\n...`、`&a: 5  # note`、`&a: ` | 规则触发 | MATCH（4/4 形状 × 2 模式） |
| 规则应触发：未定义 alias 值 | `&a: *missing` | （两边均拒，见注） | MATCH（双边 `yaml_parse_error`） |

注：`&a: *missing`（未定义 alias）双边均为 `yaml_parse_error`——PyYAML 侧 undefined alias 抛错，TS 侧同理；与分类规则无关，对照成立。

## §5 P2 清单：终审 R2 的 6 个 + R6 的 2 个 = 8 个，全部非阻断

R13 的 9 个 P2 中 **P2-R13-1 已解决**（见下），其余 8 个仍成立：

| P2 | 复核（45487eb） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。冻结脚本未动（`git diff a8c120b..45487eb -- scripts/deterministic-zip.py` 为空），仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§9） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。README 仍为 "P95 768.3 ms, peak RSS 98.3 MiB"，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 仍有 `NOT_TESTED` 标记，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。试冻 manifest 的 freeze_commit 字段为 TRIAL 说明；正式冻结时 T014 报告 §9 补实际 commit（同 R2 模式） |
| **P2-R6-1：manifest 的 `inputs` 只记录 t013 复核到 R3** | 仍成立，且范围扩大到 R14。本轮试冻 manifest 的 `inputs` 键仍为 golden_suite_sha256、oracle_parity_report、s0_gate、s0_input_fixture_sha256、t013_review_r1/r2/r3——R4–R14 十一轮复核均未记录。T014 重冻时须把 R4–R14 一并记入，非阻断 |
| **P2-R6-2：复核探针证据未入仓库** | 部分缓解，仍成立。R7/R8 自写探针只在 `/tmp` 与报告中；R9/R10/R11/R12/R13/R14 自写探针已随报告提交入仓库（`evidence/probes/r9/`–`r14/`），故"后续复核探针入仓"的要求自 R9 起已满足。非阻断 |

**P2-R13-1（已解决，不再列入未决清单）：** fix-p0-12 `cases.json` 的 12 个过期标志本轮复核全部为 `false`，对应矩阵重跑 486/486 MATCH、0 flagged。fix-p0-13 的 2 个 lone-doc 标志（`lone-scalar`、`lone-null`）同样已清，矩阵重跑 196/196 MATCH、0 flagged。

**P2-R12-1 / P2-R10-1 / P2-R10-2（已解决，不再列入未决清单）：** fix-p0-11 `cases.json` 的 8 个标志仍为 `false`（248/248 MATCH、0 flagged）；14 个旧矩阵标志仍为 `false`；T006 报告 `suite_sha256` 为 `36c3853d…`，与同一提交的 `tests/fixtures/trigger/suite.json` 实测哈希逐字节一致，fixture_count 128 / passed 128 / 0 mismatch。已修复，状态不变。

## §6 Manifest 哈希核查（修复方数字首次可信，不计入定级）

- 本轮实测 manifest 哈希 **`5a89a52e…`**，与终报 §4 的 `5a89a52e…` **完全一致**（三次试冻均为同一值，见 §9）。source.zip（`f8621677…`，2,348 文件）与 dist.zip（`f2bcd53f…`，114 文件）三次试冻均与终报逐字节一致。
- **历史链确认**：R13 在 `01509e0` 上两次试冻为 `9e68492a…`，与终报 `677e5e82…` 不一致（R13 §6 已证终报值无法复现）；本轮在 `45487eb` 上三次一致的 `5a89a52e…` 是本轮的可信值。FIX-P0-12 的 `5e44f660…` 确为错误值（R13 已证 `309b2ee` 重冻为 `933f7e8b…`）。修复方报告的 manifest 哈希连续两轮无法复现后，本轮首次可信——"以自己实测的两次一致值为准，不得从既往报告抄哈希"的规则继续有效，R15 须对本轮的 `5a89a52e…` 做同样的试冻复核。
- 此为试冻产物的报告数字核查，不是产品缺陷：manifest 是试冻产物，T014 正式重冻时会重新生成；不计入 P0/P1/P2。

## §7 违规捷径检查：无

- `src/` diff（`a8c120b..45487eb`）= 空；`oracle/` diff = 仅 `oracle/checkpath_oracle/parser.py`（+168 行：新规则 `_is_lone_anchored_empty_key_doc` + 根检查接线）；`extract_jobs` 未动。
- 删测试 0（`git diff --diff-filter=D` 为空）；测试/夹具 diff 中无 `skip`/`only` 弱化（`grep -c` 为 0）。
- 无 mismatch 忽略名单（`deepDiff` 未动）；无输入文本手术；无解析器更换。
- 修复方终报数字除 §6 的 manifest 哈希外全部复核一致（§8、§9）；终报 §4 的 manifest 哈希本轮**首次复现**，见 §6。
- 试冻 manifest 的 `inputs` 仍只记录到 R3，见 P2-R6-1（T014 重冻时处理）。
- 新增测试 15 个（14 fixture + 1 schema 断言），与终报口径一致；新增夹具 14 件（`tests/fixtures/parser-divergence/lone-anchored-empty-key/` l01–l14 + `expected.json`）与终报一致；新增测试文件 1 个（`lone-anchored-empty-key.test.ts`）。

## §8 全量重跑（干净克隆 `~/workspace/p020-review-r14`，HEAD `45487eb`，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，exit 0） |
| `npm test` | **1569/1569 通过**（49 test files；基线 1554 + 新增 15） |
| `npm run test:oracle` | 167/167，0 偏差，0 false PASS；unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 128 夹具，0 mismatch（报告 128/128 passed） |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch（报告 48/48 passed） |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch（报告 46/46 passed） |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch（报告 44/44 passed） |
| `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；oracle 24/24；100 次运行 1 个唯一哈希；gate hash 见下 |
| `npm run release:verify` | **PASS**；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `python3 scripts/build-golden.py --check-only` | golden cases 167，exit 0 |

**S0 gate hash 说明：** 干净克隆的 `evidence/S0_GATE.json` status 为 PASS，但 `gate_report_sha256` 为 `ac1064f3c9da56c56518d80416967fbd4835507217b09cc06d98700f08d77dca`，与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是 `environment_fingerprint`**（克隆路径不同导致；其余字段全部一致，含 `input_fixture_sha256`、`conditions` 全 true、determinism 100/1、unsupported 2/2）。这不是回归（与 R4–R13 同一现象，不同克隆路径不同指纹）。重跑后已 `git checkout -- evidence/S0_GATE.json` 恢复。

**探针矩阵重跑（干净克隆，仓库内 runner，全 JSON 深相等；重跑后 `results.json` 与提交版逐字节一致——`git status` 除自写探针与试冻产物外干净）：**

| 矩阵 | 结果 |
|---|---|
| fix-p0-04 | **100/100 MATCH**（前 66 行 R5 子集 **66/66 MATCH**，单模式 66 检查） |
| fix-p0-05 | **76/76 MATCH** |
| fix-p0-06 | **134/134 MATCH** |
| fix-p0-07 | **86/86 MATCH** |
| fix-p0-08 | **164/164 MATCH** |
| fix-p0-09 | **98/98 MATCH** |
| fix-p0-10 | **314/314 MATCH** |
| fix-p0-11 | **248/248 MATCH**（0 flagged） |
| fix-p0-12 | **486/486 MATCH**（0 flagged——P2-R13-1 的 12 个标志已清，见 §5） |
| fix-p0-13 | **196/196 MATCH**（0 flagged——2 个 lone-doc 标志已清，见 §5） |
| fix-p0-14 | **103/114 MATCH**（11 检查 DIFF，全部为 §2 的残留行，flagged） |
| R10 探针 | **88/88 MATCH** |
| R11 探针 | **74/74 MATCH** |
| R12 探针 | **118/118 MATCH** |
| R13 探针 | **98/98 MATCH** |

**R14 独立探针（自写，`evidence/probes/r14/r14-probe.py`，39 例 ×2 模式 = 78 检查；P0 核心与残留形状自 R13 报告 §2 与终报 §2/§7 原文重建，锚名/值/事件均不同，未复制修复方 `cases.json`）：**

| 组 | 结果 |
|---|---|
| P0 核心 2 形状（§1） | 2 例 ×2 模式 **4/4 MATCH** |
| 对照 10 形状（§1） | 10 例 ×2 模式 **20/20 MATCH** |
| 判别式必要性 10 形状（§4） | 10 例 ×2 模式 **20/20 MATCH** |
| 残留 11 形状（§2） | 11 例 ×2 模式 **11/22 MATCH**（trigger 模式 11 处 DIFF，jobs 模式 11/11 MATCH） |
| 残留流双生对照 1 形状 | 1 例 ×2 模式 **2/2 MATCH** |
| R6 5 形状（§1） | 5 例 ×2 模式 **10/10 MATCH** |

探针合计 2,472 检查（十矩阵 1,902 + fix-p0-14 矩阵 114 + R10 探针 88 + R11 探针 74 + R12 探针 118 + R13 探针 98 + R14 独立探针 78；注：各矩阵与探针有形状重叠，合计为检查次数非去重形状数），DIFF 22 处（fix-p0-14 矩阵 11 + R14 独立探针 11，全部为 §2 同一 11 行残留；两处 11 为同形重叠）。

## §9 试冻三哈希（干净克隆，`--trial`，三次）

三次 `npm run release:freeze -- --trial`（HEAD `45487eb`）哈希完全一致，确定性成立；source/dist/manifest 与修复方试冻值逐字节一致（manifest 首次复现，见 §6）：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `f8621677458a3e90bcdb841172efed37ad108f91eeb3e2b561be0328580ff4d0`（2,348 文件） | 与修复方值一致；与 R13 的 `95908685…`（2,315 文件）相比已变（`oracle/` 改动 + 新 evidence/fixtures，属预期） |
| dist.zip | `f2bcd53f360ada37da25d3d650009b4c10274594a8faf4ed1c4d7591680e8f7f`（114 文件） | 与修复方值一致；与 FIX-P0-13 时完全相同——dist 是纯 TS 发行物，`src/` 0 改动 |
| RELEASE_MANIFEST.json | `5a89a52eb09ef3e346fc60fd03f0dc22dcd545ad8b830220d436285faacab555` | **与修复方报告值一致**（三次试冻均为同一值），见 §6 |

`sha256sum -c` 3/3 OK。试冻后已 `git checkout release/`，克隆内 `release/` 恢复为 HEAD 正式件（source.zip `3a778b93…`、dist.zip `da130ad2…`，已核对）。

## §10 亲自跑过的命令与结果（摘要）

全部在干净克隆 `~/workspace/p020-review-r14`（HEAD `45487eb`）内运行；`npm ci` 后执行。

| # | 命令 | 结果 |
|---|---|---|
| 1 | `git clone ~/workspace/p020-checkpath ~/workspace/p020-review-r14 && git checkout 45487eb` | 顶为 `45487eb`，工作树干净（仅 r14/ 未跟踪） |
| 2 | `npm ci --no-audit --no-fund` | 181 packages，exit 0 |
| 3 | `npm test` | 1569/1569（49 files） |
| 4 | `npm run test:oracle` | 167 夹具，0 mismatch，0 false PASS，34/34 UNKNOWN |
| 5 | `npm run oracle:diff:trigger` / `jobs` / `checks` / `witness` | 128 / 48 / 46 / 44，全部 0 mismatch |
| 6 | `npm run typecheck` | PASS，exit 0 |
| 7 | `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| 8 | `python3 scripts/build-golden.py --check-only` | 167 cases，exit 0 |
| 9 | `npm run s0:gate` | PASS；24/24；唯一差异 environment_fingerprint（§8） |
| 10 | `npm run release:verify` | PASS |
| 11 | `python3 evidence/probes/r14/gen-cases.py && python3 evidence/probes/r14/r14-probe.py` | 67/78 MATCH（11 处 DIFF，§2） |
| 12 | `python3 evidence/probes/r13/r13-probe.py` | 98/98 MATCH |
| 13 | `python3 evidence/probes/r12/r12-probe.py` | 118/118 MATCH |
| 14 | `python3 evidence/probes/r11/r11-probe.py` | 74/74 MATCH |
| 15 | `python3 evidence/probes/r10/r10-probe.py` | 88/88 MATCH |
| 16 | `python3 evidence/probes/fix-p0-XX/run-matrix.py` × 11 | 100/76/134/86/164/98/314/248/486/196/103（§8） |
| 17 | `node evidence/probes/r14/parser-probe.mjs` + PyYAML `_StrictBaseLoader` × 5 形状 | 见 §3 |
| 18 | 端到端 `&x:\n  on: push\n  jobs: …` 双模式验证（§2.6） | TS VALID + jobs 提取 vs Oracle INVALID + jobs `[]` |
| 19 | `npm run release:freeze -- --trial` × 3（`45487eb`） | 三哈希三次一致；`sha256sum -c` 3/3 OK；manifest 与终报值一致（§6、§9） |
| 20 | `git diff a8c120b..45487eb --stat` / `-- src/ oracle/` / `--diff-filter=D` / tests `skip`/`only` | 33 文件 +3250/−134；src/ 空；删文件 0；skip/only 0 |
| 21 | fix-p0-12 `cases.json` 12 标志核对 + fix-p0-13 `cases.json` 2 标志核对 + T006 报告哈希核对 | P2-R13-1 已清（0 flagged）；T006 哈希一致（§5） |
| 22 | `_is_lone_anchored_empty_key_doc` 接线核对（parser.py L1402/L1606）+ `extract_jobs` 未动核对 | 根检查处接线；jobs 未动 |

## §11 未审查事项与报告瑕疵记录

- 未审查：`df53e88` 终报提交本身（只含终报文本，无代码）；终报 §2 过程记录中的三轮测绘细节未逐项复跑——本轮以端到端探针（§8）与解析器层测绘（§3）独立验证结论。
- 未审查：Drive 归档状态与终审对话（不在 T013 复核范围内）。
- **终报文案订正 1（数字首次可信，无订正）：** 终报 §4 的试冻 manifest 哈希 `5a89a52e…` 本轮三次试冻全部复现（§6、§9）。连续两轮无法复现后首次可信；建议 FIX-P0-15 在终报中仍以自己实测的两次一致值为准，不得从既往报告抄哈希。
- **本轮新增 P0（见 §2）：** 11 个残留检查，5 个家族，全部独立重建并定级。
- **本轮 P2 变化（见 §5）：** P2-R13-1 已解决；P2-R6-1 范围扩大到 R14。
- 本报告瑕疵：R14 自写探针的 R6 形状系按 R10 报告文字经 R12/R13 重建，未逐字复核 R10 原始用例原文；结论（全部 MATCH）仅针对重建形状。`r14-g-on-unsupported` 使用了不支持事件 `pull`，Oracle 侧为 UNKNOWN 而非 VALID——该形状的 MATCH 仍成立（双边 INVALID，错误码一致），且另有 `pull_request` 的干净形状 `r14-g-on` 佐证同一结论。

## §12 给 parent 的下一步

1. **定点修复 §2 的 5 个 P0 家族（FIX-P0-15）**：
   - (a) unwrap 语义：lone-doc anchored-empty-key 位置，值是映射时以其值为文档，`parse_workflow_yaml` 与 `extract_jobs` 均须改（§2.6）；判据用 token 模式（条件 5 取反），守住引号空 key 与 C3 豁免的 MATCH。
   - (b) 镜像"至多一个 anchor"拒收：值首 token 为 AnchorToken 时拒收；作用域须覆盖 workflow 内位置（`yaml` 包任意位置都拒收）；区分 `&x *y`（合法）与 `&x &y 1`。
   - (c) 镜像 E05：lone-doc 位置 KeyToken 与 AnchorToken 间出现 TagToken 时拒收。
   - (d) 镜像 hasUnrepresentableKey：lone-doc 位置 anchor 未 glued 时拒收。
   - (e) 镜像嵌套块映射的"至多一个 anchor"拒收：值是块映射且其首对本身是 anchored empty key 时拒收；块上下文限定（流双生 MATCH）；绕开 P0-C3 单对豁免（位置不同）。
   - 然后派**新的独立复核 R15**（审查对象为修复后 HEAD；复核员一律在干净克隆里验证，不得与修复并行同一工作树；R15 须重跑本报告 §2 的 11 行残留 + §4 的判别式探针 + 十一矩阵 + R5 66 例 + 本轮 39 行矩阵 + 终报 manifest 哈希复核）。
2. R15 PASS 后：T014 正式重新冻结（manifest `inputs` 须记入 R4–R14，见 P2-R6-1）→ Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3（同一立项对话，GPT-6 + Extra High + 完整结尾句）。
3. 终审轮次已用 2/5；R15 仍在同一立项对话内复核，不占用终审轮次。
