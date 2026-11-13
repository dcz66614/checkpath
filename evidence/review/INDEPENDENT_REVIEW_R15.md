# T013 独立复核 R15 — FIX-P0-15（R14 的 5 个 P0 家族）复核报告

- **审查对象**：代码提交 `5e3cda7`（FIX-P0-15：关闭 R14 的 5 个 P0 家族；相对 `0bd363a`，42 文件，+7594/−594）。终报提交 `eee2dc4` 只含终报文本，不在代码审查范围内。
- **复核员**：T013 独立复核员（全新会话，与 FIX-P0-15 修复方、R14 复核员均隔离；未共享上下文）。
- **复核环境**：干净克隆 `~/workspace/p020-review-r15/`（`git clone ~/workspace/p020-checkpath` 后 `git checkout 5e3cda7`），`git status` 干净（仅复核探针 `evidence/probes/r15/` 未跟踪），`git log --oneline -2` 顶为 `5e3cda7`。全部命令均在该克隆内亲自跑；未与任何修复并行同一工作树（R4 污染教训）。本轮复核中无 VM 重启；一次 `npm run s0:oracle` + `build-golden` + `s0:gate` 因 120 s 前台时限转入后台，后经 `process.log` 取回完整结果（§8）。
- **结论：NOT PASS — P0 3 / P1 0 / P2 9。**

## §0 审查对象与无污染声明（先读）

- 本轮只审查 `5e3cda7` 的代码。`eee2dc4` 的终报文本仅作背景阅读；报告中所有数字均由本轮亲自重跑得出，未采信终报数字。
- 复核探针全部在干净克隆内运行；探针证据（`evidence/probes/r15/`：`cases.json` 61 行、`gen-cases.py`、`r15-probe.py`、`parser-probe.py`、`parser-probe.mjs`、`parser-probe-py.json`、`parser-probe-npm.json`、`results.json`、README）随本报告一并提交入仓库，不只留 `/tmp`（P2-R6-2 的教训）。
- 终报 §7 披露的 6 个残留行本轮**全部独立重建并逐一定级**（见 §2），另发现终报**漏披露 7 行 / 13 检查**（见 §2.1、§2.3 的 NEW 标记）与终报的两处错误对照声称（见 §11）；定级不采信修复方"留给后续轮次"/"不同机制类别"/"既有健壮性缺口"的表述——定级只看是否存在 mismatch。
- **本轮第二轮**：修复方报告的试冻 manifest 哈希（`5801092c…`）本轮两次试冻全部逐字节复现（见 §6、§9）——R14 首次复现后，manifest 数字连续第二轮可信。

## §1 R14 的 5 个 P0 家族 — 已关闭（已验证）

R14 定级的 5 个 P0 家族（11 检查）已关闭。本轮从 R14 报告 §2 与终报 §2 原文独立重建（锚名/值/事件均不同：`&b`/`&c`/`&z`、值 2/9、事件 `pull_request`），在干净克隆内 trigger + jobs 双模式重跑，**全部 MATCH**（含于本轮自写探针 122 检查之中，见 §8）；修复方 R14 探针重跑 **78/78 MATCH**（原 67/78；另有 2 行 FLAG STALE，见下）；修复方新矩阵 **249/260 MATCH**，其余 11 检查均为 §2 的残留行。

| 家族（R14 §2.5 方向） | 本轮重建形状 | 结果 |
|---|---|---|
| (a) unwrap：值是映射的 lone-doc，文档即该映射 | `&b: {on: pull_request}`、`&b:\n  on: pull_request`、`&b: !bar {on: pull_request}`、全工作流流/块变体、`&b: {jobs: {...}}`（jobs-only）、`&b: !!str {on: pull_request}`、`&b: !!str\n  on: pull_request`、自别名 `&b: {on: *b}`、内层遮蔽 `&b: {a: &c 1, on: *c}`、对照 `&b: {name: probe}`、`&b: {True: pull_request}` | **24/24 MATCH**（12 形 ×2 模式；jobs-only 与全工作流 jobs 模式均 MATCH——unwrap 双接线成立） |
| (b) 值节点第二 anchor | `&b: &c 2`、`&b: &c [2]`、`&b: &c`、`&b: &c {a: 1}`、已定义别名值 `q: &z 9\n&b: *z`、未定义别名 `&b: *z`、对照 `&b k: &c 2`、unglued 双 anchor `&b : &c 2`、workflow 内 `m: &b &c 2` | **18/18 MATCH**（9 形 ×2 模式；`&b: *z` 已定义别名值一案：终报称 R14“`&x *y` 合法”是错的，本轮重建证实——`&b: *z`（`&z` 已定义）双边 `yaml_parse_error`，已闭合） |
| (c) 键带 tag（E05 镜像） | `!bar &b: 2`、`!!str &b: 2`、`---\n!bar &b: 2`、嵌套单对、流映射、块序列项、对照 `!bar &b : 2`（unglued）、显式键 `? !bar &b: 2` | **16/16 MATCH**（8 形 ×2 模式；终报称 R14“工作流内变体已被 R13 §4.2 覆盖”是错的，本轮重建证实——嵌套单对/流映射/块序列项三处原先同样分歧，现已闭合） |
| (d) unglued anchor-colon | `&b : 2`、`&b :`、嵌套、流映射、tag 嵌套首对 `m:\n  !bar &b : 2`、tag 序列项 | **12/12 MATCH**（6 形 ×2 模式；根首对 `!bar &b : 2` 另计入 §2 P0-1，tag 护栏边界见 §4） |
| (e) 嵌套块映射值带 anchored key | `&b:\n  &c: 2`、`&b:\n  &c:`、`&b:\n  !bar &c: 2`、更深嵌套、流孪生 `&b: {&c: 2}`、两对变体、非空键对照 | **14/14 MATCH**（7 形 ×2 模式；流孪生保持 MATCH） |
| R13 lone-doc P0 对照 | `&b: 7`、`&b:`、`"": 9`、`&b: {c: 3}`、`&b:\n  c: 3` | **10/10 MATCH**（5 形 ×2 模式；R13 探针重跑 98/98，未回归） |

另：R14 探针重跑时 `r14-r-on-flow` 与 `r14-r-on-block` 两行报 FLAG STALE（原先预期 DIFF 的 (a) 族行现已 MATCH）——属预期，见 R14 探针"残留行 MATCH 即过期"的约定；其余 76 检查 MATCH。

## §2 新发现 P0 — 13 行残留，3 个家族（24 检查）

终报 §7 披露 6 行 / 11 检查；本轮独立重建并逐一端到端确认，**24/24 检查 DIFF**（见 §8 自写探针；其中 13 检查为终报漏披露——§2.1 根首对 2 检查 + §2.3 `on:` 值位置 11 检查）。

### 2.1 现象总表

| 家族 | 例（本轮重建） | TS | Oracle | 检查 |
|---|---|---|---|---|
| P0-1 C3 越界：tag + unglued anchored 空键 | 根首对 `!bar &b : 2\non: push\njobs: …`（**NEW**）、根第 2 对 `a: 1\n!bar &b : 2\n…`、嵌套第 2 对 `m:\n  a: 1\n  !bar &b : 2\n…` | **VALID / [1 job]** | **INVALID / `yaml_parse_error` / []** | 6（3 行 ×2 模式） |
| P0-2 扫描器层：无空格 `&x:!!str` | `&b:!!str {on: pull_request}`（流）、`&b:!!str\n  on: pull_request\n  jobs: …`（块） | **VALID / [1 job]** | 流：INVALID / `missing_on_key`（jobs MATCH）；块：INVALID / `yaml_parse_error` / [] | 3（流 1 + 块 2） |
| P0-3 loader 边界：标量 tag 在集合值上 | `&b: !!int {on: pull_request}`、`&b: !!bool {on: pull_request}`、`m: !!int {a: 1}`、`m: !!float {a: 1}`、`on: !!int {push: {}}`（**NEW**，终报 §7.3 误称对照）、`on: !!bool {push: {}}`（**NEW**）、`on: !!float {push: {}}`（**NEW**）、`on: !!str {push: {}}`（**NEW**，trigger DIFF / jobs MATCH） | **VALID / [1 job]** | int/bool/float：**崩溃**（原生 `TypeError`/`AttributeError`，探针驱动 exit 1）；`!!str`：trigger **UNKNOWN**，jobs [] | 15（7 行 ×2 + `!!str` 行 1） |

### 2.2 根因（解析器层最小复现，见 §3）

- **P0-1**：双边解析器均接受这三个形状（PyYAML 渲染 `{'': '2', 'on': 'push', …}`，npm 渲染 `{"":2,"on":"push",…}`，见 §3）——分歧纯在 Oracle 侧：C3（`_reject_anchored_empty_key`）从 anchor 往回走过 TagToken 后即触发，不区分 tag + unglued + 位置。TS 侧三处均不触发（E05 不触发因 anchor 后是空格而非 `:`；`hasUnrepresentableKey` 不触发因键节点带 tag 且渲染为 `""`——终报 §7.1 的 ast-dump 结论，本轮复核：C3 拒收、(d)/(c) 均不拒收，见 §3 末的规则归因实测）。
- **P0-2**：冒号后无空格时，PyYAML 根本不把 `:` 认作值指示符（流变体读成普通标量键 `':!!str {on'`；块变体扫描器直接抛 `ScannerError: mapping values are not allowed here`）——token walk 永远看不到 lone-doc 模式。npm 正常解析为映射。有空格的对应变体（`&b: !!str …`）已闭合（span 重解析，见 §1(a)）。
- **P0-3**：`_StrictBaseLoader` 对错配的标量 tag 抛非 `yaml.YAMLError` 异常（`!!int` → `TypeError: int() can't convert non-string with explicit base`；`!!bool` → `TypeError: unhashable type: 'list'`；`!!float` → `AttributeError: 'list' object has no attribute 'lower'`），而 `parse_workflow_yaml` 与 `extract_jobs` 只捕获 `yaml.YAMLError`，异常直接上抛，探针驱动 exit 1（见 §3）。npm 侧只报 `YAMLWarning: Unresolved tag`，仍把集合解析为映射并接受为 VALID。`!!str` 不崩溃（loader 构造节点 repr 字符串，`on` 值变为字符串 → Oracle trigger UNKNOWN；jobs 模式仍 MATCH，因 jobs 提取不依赖 `on` 为映射）。

### 2.3 终报漏披露的两处（NEW）

- **P0-1 根首对**：终报 §2.4 称"根首对 `!foo &x : 1`……均为控制（TS 接受，(d) 不得触发）"——关于 (d) 的说法成立，但作为 MATCH 声称是**错的**：本轮规则归因实测（§3）证明 C3 在该形状上触发（`(d)`、`(c)` 均不触发），Oracle 拒收而 TS 接受。修复方矩阵中没有根首对 tag+unglued 的行（只有嵌套首对 `d-nested-single-tag-unglued`，该处双边均拒故 MATCH），故漏披露。根因与已披露的第 2 对行相同——C3 不区分位置。
- **P0-3 `on:` 值位置**：终报 §7.3 称"`on: !!int {push: {}}` 双边均为 `yaml_parse_error`（MATCH）"——**错的**：本轮实测 TS VALID / [1 job]，Oracle 探针驱动 exit 1（`TypeError`，见 §3）。`!!bool`/`!!float` 在 `on:` 值上同样崩溃（exit 1）；`!!str` 在 `on:` 值上 trigger UNKNOWN vs TS VALID。终报 §7.3 的"与位置无关"只写了 `m:` 位置，未测 `on:` 位置。

### 2.4 定级：P0（3 项）的依据与权衡

定级 **P0（3 项）**，依据：

- PROJECT_BOOK §7.3（L513）："Oracle 与实现**任何字段不一致都判失败；不得通过忽略字段、容差或人工解释来放行**。"——错误码、VALID/INVALID verdict、崩溃/UNKNOWN 均是输出字段。
- PROJECT_BOOK §8.2（L548）："Oracle parity | 100% | 所有受支持输入完全一致。"
- IMPLEMENTATION_PLAN §8.1（L779）："**任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。**"
- IMPLEMENTATION_PLAN §10（L827）：P0 阻断明确包含 "**Oracle mismatch**"。
- **R3-ON 裁决先例**：双边 INVALID、错误码不同**不自动通过**，定为 P0——家族 P0-1 与 P0-2 的块变体同形态；P0-1 更是 verdict 级分歧（VALID vs INVALID），比 R3-ON 更强。
- **R10 方向先例**：分歧方向不改变定级。P0-3 的崩溃是 Oracle 侧单边失败，方向不影响定级。
- **终审 R2 的裁决先例**：把同类分歧降为 P2 的理由被终审明确驳回。
- **计数原则（R11/R13/R14 先例）**：按根因/修复机制计数。三个家族需要三种不同的修复机制（见 §2.5），计为 3 项；同家族内多形状同机制，计 1 项（P0-1 3 行 6 检查 1 项、P0-2 2 行 3 检查 1 项、P0-3 8 行 15 检查 1 项——崩溃与 `!!str` 的 UNKNOWN 同源于 loader 对集合上标量 tag 的处理，见 §2.5）。

**已权衡的反方考虑（记录在案，不改变定级）：**
- (a) "收窄 C3 是对已验证规则的改动，留给后续轮次"（终报 §7.1）。修复排期不是定级理由（R13 §2.4(c) 先例：定级只看是否存在 mismatch）；且 §4 已证收窄可行而不破坏 MATCH。
- (b) "扫描器镜像是不同的机制类别"（终报 §7.2）。机制类别不同不等于 mismatch 不存在；§7.3 无"机制类别"豁免。
- (c) "既有的 Oracle 健壮性缺口，不是 5 个家族之一"（终报 §7.3）。"既有"不等于"可接受"：§8.2 要求 100% parity；且崩溃（exit 1）比分类分歧更严重——调用方直接崩溃，不是返回一个错误码。
- (d) "仅把异常 catch 成 `yaml_parse_error` 仍与 TS VALID 不符"（终报 §7.3）。成立，但那只是说"只 catch 不够"，不是说"不可修复"——正确修复是让 loader 忽略集合上的标量 tag（见 §2.5），与 npm 行为一致。
- (e) 输入在产品域之外（真实 workflow 恒有 `on:` 与 `jobs:`）。R12 §5(a) 与 R13 §2.4(b) 已驳回同一理由；P0-1 与 P0-3 的 `on:` 值形状本身就是**真实有效 workflow**（TS VALID，含 `on` 与 `jobs`）。
- (f) 规模小（24 检查；P0-2 仅 3 检查）。规模不改变定级：§7.3 无 de minimis 条款；R13 的 lone-doc P0 同为 2 检查且定为 P0。
- (g) 修复方已如实披露 6 行残留、未 silent 扩大范围。披露诚实不改变定级（R8 对 R3 的权衡 (c) 同理）；且本轮另发现 7 行漏披露，披露并不完整。
- (h) P0-3 的崩溃与 `!!str` 的 UNKNOWN 是否应分计 2 项？已权衡：两者同源（loader 对集合节点应用标量 tag 构造器），同一修复（loader 忽略集合上的标量 tag）同时关闭；按根因计数为 1 项。若采更严的"崩溃与 UNKNOWN 分计"口径，则为 P0 4 项；**verdict 不变（NOT PASS）**，FIX-P0-16 须覆盖两个表现。

### 2.5 各家族的正确修复方向（供 FIX-P0-16，非定级依据）

- **P0-1 收窄 C3**：C3 在 tag + unglued 的 anchored 空键上不得触发（不限位置：根首对、根第 2 对、嵌套第 2 对均须放行）。可行性已验证：TS 侧仅在"作为对值的块映射的首对"位置拒收 tag+unglued（`hasUnrepresentableKey`），而该位置已有 (d) 规则覆盖（本轮 `r15-d-tag-nested-first` MATCH，双边 `yaml_parse_error`）；其余位置 (d) 与 C3 均须放行。收窄时须守住 R13 §4.2 的 16 形 + 本轮新增的 tag/unglued 位置矩阵（终报 §7.1 的要求，本轮同意——须另做专门边界重验，不得只改一行就宣称完成）。
- **P0-2 文本层扫描器镜像**：在 token walk 之前，对 `&x:!!tag` 无空格形态做扫描器层镜像（PyYAML 不认 `:` 为值指示符是扫描器行为，token 规则够不着）。须区分流变体（读成标量键）与块变体（ScannerError）的不同表现。
- **P0-3 loader 边界映射**：让 loader 忽略集合节点（映射/序列）上的标量 tag（`!!int`/`!!bool`/`!!float`/`!!str` 等），与 npm `yaml` 包行为一致（仅警告 "Unresolved tag"，仍解析集合）。仅把异常 catch 成 `yaml_parse_error` 不够——TS 说 VALID。须映射 `!!<类型>` 在集合节点上的完整边界（终报 §7.3 的要求，本轮同意），并确认 `!!str` 的 UNKNOWN 同样消失（`on` 值恢复为映射）。

## §3 解析器层最小复现（与探针驱动无关）

干净克隆内直接对解析器本身验证（`evidence/probes/r15/parser-probe.py` + `parser-probe.mjs`，输出已提交）：

| 形状 | PyYAML `_StrictBaseLoader` | `yaml` npm 包 | 端到端（探针） |
|---|---|---|---|
| C3 根首对 `!bar &b : 2` + WF | dict `{'': '2', 'on': 'push', …}` | dict `{"":2,"on":"push",…}` | TS VALID vs Oracle `yaml_parse_error` |
| C3 根第 2 对 / 嵌套第 2 对 | 同上（双边解析一致） | 同上 | TS VALID vs Oracle `yaml_parse_error` |
| C3 嵌套首对 `m:\n  !bar &b : 2` | dict `{'m': {'': '2'}, …}` | dict `{"m":{"":2},…}` | MATCH（双边 `yaml_parse_error`——TS 侧 `hasUnrepresentableKey`） |
| C3 lone `!bar &b : 2` | dict `{'': '2'}` | dict `{"":2}` | MATCH（双边 `missing_on_key`） |
| `&b:!!str {on: pull_request}`（流） | dict `{':!!str {on': 'pull_request}'}`（`:` 不是值指示符） | dict `{"on":"pull_request"}` | TS VALID vs Oracle `missing_on_key` |
| `&b:!!str\n  on: pull_request`（块） | THROW `ScannerError: mapping values are not allowed here` | dict `{"on":"pull_request"}` | TS VALID vs Oracle `yaml_parse_error` |
| `&b: !!str {on: pull_request}`（有空格，对照） | 字符串 repr（span 重解析已处理） | dict `{"on":"pull_request"}` | MATCH |
| `&b: !!int {on: pull_request}` | THROW `TypeError: int() can't convert non-string with explicit base` | dict `{"on":"pull_request"}` | TS VALID vs Oracle **崩溃 exit 1** |
| `&b: !!bool {on: pull_request}` | THROW `TypeError: unhashable type: 'list'` | dict `{"on":"pull_request"}` | TS VALID vs Oracle **崩溃 exit 1** |
| `&b: !!float {on: pull_request}` | THROW `AttributeError: 'list' object has no attribute 'lower'` | dict `{"on":"pull_request"}` | TS VALID vs Oracle **崩溃 exit 1** |
| `on: !!int {push: {}}` | THROW `TypeError: int() can't convert non-string with explicit base` | dict `{"on":{"push":{}}}` | TS VALID vs Oracle **崩溃 exit 1** |
| `on: !!bool {push: {}}` | THROW `TypeError: unhashable type: 'list'` | dict `{"on":{"push":{}}}` | TS VALID vs Oracle **崩溃 exit 1** |
| `on: !!float {push: {}}` | THROW `AttributeError: 'list' object has no attribute 'lower'` | dict `{"on":{"push":{}}}` | TS VALID vs Oracle **崩溃 exit 1** |
| `on: !!str {push: {}}` | `on` 值为字符串 repr | dict `{"on":{"push":{}}}` | TS VALID vs Oracle **UNKNOWN**（trigger；jobs MATCH） |
| `a: !!int 1`（标量对照） | dict `{'a': '1'}` | dict `{"a":1}` | MATCH（双边 VALID） |

**规则归因实测**（根首对 `!bar &b : 2\non: push\njobs: …`，直接调用三条 Oracle 拒收规则）：C3（`_reject_anchored_empty_key`）→ **REJECTS**（"anchored empty key in a block mapping"）；(d)（`_reject_unglued_anchored_empty_key`）→ 不触发；(c)（`_reject_tagged_anchored_empty_key`）→ 不触发。根首对的拒收确系 C3 越界，非 (d) 误触发。

分歧在解析器/loader 层，与探针脚手架无关。崩溃形状的探针驱动 exit 1（`oracle-parse-probe.py` 与 `oracle-jobs-probe.py` 均抛 traceback 后退出），非驱动 bug——崩溃发生在 `parse_workflow_yaml`/`extract_jobs` 内部（`parser.py` L204 `_parse_int_spelling`）。

## §4 边界验证：(d) tag 护栏与 C3 收窄可行性

本轮自写探针验证 (d) 的 tag 护栏边界（全部含于本轮 122 检查，见 §8）：

| 形状 | 预期 | 结果 |
|---|---|---|
| 无 tag unglued：lone `&b : 2`、嵌套、流映射 | (d) 触发，双边 `yaml_parse_error` | MATCH（3 形 ×2 模式） |
| 有 tag + 嵌套首对（对值块映射）：`m:\n  !bar &b : 2` | (d) 触发，双边 `yaml_parse_error` | MATCH |
| 有 tag + 根首对：`!bar &b : 2\non: push\njobs: …` | (d) 不触发；但 C3 触发 → DIFF | **DIFF（§2 P0-1，NEW）** |
| 有 tag + 根第 2 对 / 嵌套第 2 对 | (d) 不触发；C3 触发 → DIFF | **DIFF（§2 P0-1）** |
| 有 tag + 流映射 / 块序列项 | (d) 不触发；双边接受 | MATCH（`m: {&b : 2}` 另有流变体对照；`m:\n  - !bar &b : 2`） |
| 无 tag + tag 组合对照：`!bar &b : 2` lone-doc | 双边 `missing_on_key`（C3 单对豁免） | MATCH |

结论：(d) 的 tag 护栏本身正确（只认"对值块映射的首对"）；缺口在 C3——C3 对 tag+unglued 不设限。收窄 C3（跳过 tag+unglued 对）不会破坏上述任一 MATCH：唯一 TS 拒收 tag+unglued 的位置（嵌套首对）已有 (d) 覆盖；其余位置双边接受。

另：R13 五条件判别式的控制（`"": 9` 引号空 key、映射值 `&b: {c: 3}`/`&b:\n  c: 3`、lone 纯量）全部保持 MATCH（§1，10/10）；`_is_lone_anchored_empty_key_doc` 本身 0 改动（终报 §6，本轮 `git diff` 核对：`oracle/` diff 仅 `parser.py` +570 行新规则）。

## §5 P2 清单：终审 R2 的 6 个 + R6 的 2 个 + 本轮新增 1 个 = 9 个，全部非阻断

R14 的 8 个 P2 全部仍成立，另新增 **P2-R15-1**（见下）：

| P2 | 复核（5e3cda7） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。冻结脚本未动（`git diff 0bd363a..5e3cda7 -- scripts/ release/ src/` 为空），仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§9） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。README 仍为 "P95 768.3 ms, peak RSS 98.3 MiB"，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 仍有 `NOT_TESTED` 标记，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。试冻 manifest 的 freeze_commit 字段为 TRIAL 说明；正式冻结时 T014 报告 §9 补实际 commit（同 R2 模式） |
| **P2-R6-1：manifest 的 `inputs` 只记录 t013 复核到 R3** | 仍成立，且范围扩大到 R15。本轮试冻 manifest 的 `inputs` 键仍为 golden_suite_sha256、oracle_parity_report、s0_gate、s0_input_fixture_sha256、t013_review_r1/r2/r3——R4–R15 十二轮复核均未记录。T014 重冻时须把 R4–R15 一并记入，非阻断 |
| **P2-R6-2：复核探针证据未入仓库** | 部分缓解，仍成立。R7/R8 自写探针只在 `/tmp` 与报告中；R9–R15 自写探针已随报告提交入仓库（`evidence/probes/r9/`–`r15/`），故"后续复核探针入仓"的要求自 R9 起已满足。非阻断 |
| **P2-R15-1（新增）：fix-p0-14 `cases.json` 的 11 个过期 `known_divergence` 标志未清** | fix-p0-14 矩阵重跑 114/114 MATCH，但 `cases.json` 的 11 行（`a-flowmap-on`、`a-blockmap-on`、`a-anchor-val`、`a-tag-key`、`a-handle-key`、`a-unglued`、`x-nested-block`、`x-anchor-seq`、`x-anchor-null`、`x-tag-map-on`、`x-docmark-tagkey`）仍标 `known_divergence`。终报 §6 自认"其标志已过期"却未清除（`git diff 0bd363a..5e3cda7 -- evidence/probes/fix-p0-14/` 仅改 `results.json`）。同类问题的前例 P2-R13-1（fix-p0-12 的 12 标志）已由 FIX-P0-14 清除；本轮的 11 个标志须由 FIX-P0-16 清除（逐行核对确为 MATCH 后翻转）。非阻断 |

**已解决，不再列入未决清单：** P2-R13-1（fix-p0-12 12 标志）、P2-R12-1、P2-R10-1、P2-R10-2（状态不变；本轮矩阵重跑 fix-p0-12 486/486、fix-p0-13 196/196，0 flagged；T006 报告 `suite_sha256` 为 `36c3853d…`，与同一提交的 `tests/fixtures/trigger/suite.json` 实测哈希逐字节一致）。

## §6 Manifest 哈希核查（修复方数字第二轮可信，不计入定级）

- 本轮实测 manifest 哈希 **`5801092c…`**，与终报 §4 的 `5801092c…` **完全一致**（两次试冻均为同一值，见 §9）。source.zip（`3d3136f7…`，2,396 文件）与 dist.zip（`f2bcd53f…`，114 文件，未变）两次试冻均与终报逐字节一致。
- **历史链确认**：R14 在 `45487eb` 上三次试冻为 `5a89a52e…`，与终报一致（R14 §6 已证）；本轮在 `5e3cda7` 上两次一致的 `5801092c…` 是本轮的可信值。修复方报告的 manifest 哈希连续两轮可复现——"以自己实测的两次一致值为准，不得从既往报告抄哈希"的规则继续有效，R16 须对本轮的 `5801092c…` 做同样的试冻复核。
- 此为试冻产物的报告数字核查，不是产品缺陷：manifest 是试冻产物，T014 正式重冻时会重新生成；不计入 P0/P1/P2。

## §7 违规捷径检查：无

- `src/` diff（`0bd363a..5e3cda7`）= 空；`oracle/` diff = 仅 `oracle/checkpath_oracle/parser.py`（+570 行：unwrap helper + 4 条 `_reject_*` 规则）；`scripts/`、`release/` diff = 空。
- 删测试 0（`git diff --diff-filter=D` 为空）；测试/夹具 diff 中无 `skip`/`only` 弱化（`grep -c` 为 0）。
- 无 mismatch 忽略名单（`deepDiff` 未动）；无输入文本手术；无解析器更换。
- 修复方终报数字除 §11 的两处对照声称外全部复核一致（§8、§9）；终报 §4 的 manifest 哈希本轮**复现**，见 §6。
- 试冻 manifest 的 `inputs` 仍只记录到 R3，见 P2-R6-1（T014 重冻时处理）。
- 新增测试 21 个（20 fixture + 1 schema 断言），与终报口径一致；新增夹具 20 件（`tests/fixtures/parser-divergence/lone-anchored-empty-key-p0-15/` p01–p20 + `expected.json`）与终报一致；新增测试文件 1 个（`lone-anchored-empty-key-p0-15.test.ts`）。

## §8 全量重跑（干净克隆 `~/workspace/p020-review-r15`，HEAD `5e3cda7`，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，exit 0） |
| `npm test` | **1590/1590 通过**（50 test files；基线 1569 + 新增 21） |
| `npm run test:oracle` | 167/167，0 偏差，0 false PASS；unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 128 夹具，0 mismatch（报告 128/128 passed） |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch（报告 48/48 passed） |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch（报告 46/46 passed） |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch（报告 44/44 passed） |
| `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；oracle 24/24；100 次运行 1 个唯一哈希；gate hash 见下 |
| `npm run release:verify` | **PASS**；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `python3 scripts/build-golden.py --check-only` | golden cases 167，exit 0 |

**S0 gate hash 说明：** 干净克隆的 `evidence/S0_GATE.json` status 为 PASS，但 `gate_report_sha256` 为 `4c8f3ff4222b12a9ff36f4569317bdc3a48dc5ecb7cab4b333001c67038fede5`，与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是 `environment_fingerprint`**（克隆路径不同导致；其余字段全部一致，含 `input_fixture_sha256`、`conditions` 全 true、determinism 100/1、unsupported 2/2）。这不是回归（与 R4–R14 同一现象，不同克隆路径不同指纹）。重跑后已 `git checkout -- evidence/S0_GATE.json` 恢复。

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
| fix-p0-12 | **486/486 MATCH**（0 flagged——P2-R13-1 的 12 个标志已清，见 §5） |
| fix-p0-13 | **196/196 MATCH**（0 flagged——2 个 lone-doc 标志已清，见 §5） |
| fix-p0-14 | **114/114 MATCH**（11 行现已 MATCH，但 11 个 `known_divergence` 标志未清——新 P2-R15-1，见 §5） |
| fix-p0-15 | **249/260 MATCH**（11 检查 DIFF，全部为 §2 的 6 个已标注残留行） |
| R10 探针 | **88/88 MATCH** |
| R11 探针 | **74/74 MATCH** |
| R12 探针 | **118/118 MATCH** |
| R13 探针 | **98/98 MATCH** |
| R14 探针 | **78/78 MATCH**（2 行 FLAG STALE：`r14-r-on-flow`、`r14-r-on-block`，(a) 族已闭合，属预期） |

注：fix-p0-15 `results.json` 重跑后有 38 行 diff——仅为 traceback 内嵌的绝对路径由 `p020-checkpath` 变为 `p020-review-r15`（崩溃形状的 traceback 含绝对路径），match 计数与行完全一致；已 `git checkout` 恢复。其余矩阵 `results.json` 重跑后逐字节一致。

**R15 独立探针（自写，`evidence/probes/r15/r15-probe.py`，61 例 ×2 模式 = 122 检查；R14 5 家族与 R13 对照自 R14 报告 §2 与终报 §2 原文重建，锚名/值/事件均不同，未复制修复方 `cases.json`）：**

| 组 | 结果 |
|---|---|
| (a) unwrap 12 形状（§1） | 12 例 ×2 模式 **24/24 MATCH** |
| (b) 第二 anchor 9 形状（§1） | 9 例 ×2 模式 **18/18 MATCH** |
| (c) 键带 tag 8 形状（§1） | 8 例 ×2 模式 **16/16 MATCH** |
| (d) unglued 6 形状（§1、§4） | 6 例 ×2 模式 **12/12 MATCH**（根首对 1 形另计入残留组，见下） |
| (e) 嵌套块映射 7 形状（§1） | 7 例 ×2 模式 **14/14 MATCH** |
| R13 lone-doc 对照 5 形状（§1） | 5 例 ×2 模式 **10/10 MATCH** |
| 残留 14 形状（§2） | 14 例，28 检查：**24 预期 DIFF**（P0-1 6 检查、P0-2 3 检查、P0-3 15 检查）+ 4 MATCH（`r15-r2-str-flow-nospace` jobs、`r15-r3-on-str` jobs、`r15-r3-scalar-ok` 对照 ×2） |

探针合计 2,854 检查（十二矩阵 2,276 + R10 探针 88 + R11 探针 74 + R12 探针 118 + R13 探针 98 + R14 探针 78 + R15 独立探针 122；注：各矩阵与探针有形状重叠，合计为检查次数非去重形状数），DIFF 35 处（fix-p0-15 矩阵 11 + R15 独立探针 24，全部为 §2 同一 13 行残留；两处数字为同形重叠——fix-p0-15 矩阵的 11 检查是终报披露的 6 行，R15 探针的 24 检查含漏披露的 7 行）。

## §9 试冻三哈希（干净克隆，`--trial`，两次）

两次 `npm run release:freeze -- --trial`（HEAD `5e3cda7`）哈希完全一致，确定性成立；source/dist/manifest 与修复方试冻值逐字节一致（manifest 第二轮复现，见 §6）：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `3d3136f7cb73cd763106bb00cd63d72d68b01e008f6901635566ee3d489a60b9`（2,396 文件） | 与修复方值一致；与 R14 的 `f8621677…`（2,348 文件）相比已变（`oracle/` 改动 + 新 evidence/fixtures，属预期） |
| dist.zip | `f2bcd53f360ada37da25d3d650009b4c10274594a8faf4ed1c4d7591680e8f7f`（114 文件） | 与修复方值一致；与 FIX-P0-13/14 时完全相同——dist 是纯 TS 发行物，`src/` 0 改动 |
| RELEASE_MANIFEST.json | `5801092c6eef15e2a870062e8601465ed767935022436f74a37d0ddbefe39379` | **与修复方报告值一致**（两次试冻均为同一值），见 §6 |

`sha256sum -c SHA256SUMS.txt` 3/3 OK。试冻后已 `git checkout release/`，克隆内 `release/` 恢复为 HEAD 正式件（source.zip `3a778b93…`、dist.zip `da130ad2…`，已核对）。

## §10 亲自跑过的命令与结果（摘要）

全部在干净克隆 `~/workspace/p020-review-r15`（HEAD `5e3cda7`）内运行；`npm ci` 后执行。

| # | 命令 | 结果 |
|---|---|---|
| 1 | `git clone ~/workspace/p020-checkpath ~/workspace/p020-review-r15 && git checkout 5e3cda7` | 顶为 `5e3cda7`，工作树干净（仅 r15/ 未跟踪） |
| 2 | `npm ci --no-audit --no-fund` | 181 packages，exit 0 |
| 3 | `npm test` | 1590/1590（50 files） |
| 4 | `npm run test:oracle` | 167 夹具，0 mismatch，0 false PASS，34/34 UNKNOWN |
| 5 | `npm run oracle:diff:trigger` / `jobs` / `checks` / `witness` | 128 / 48 / 46 / 44，全部 0 mismatch |
| 6 | `npm run typecheck` | PASS，exit 0 |
| 7 | `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| 8 | `python3 scripts/build-golden.py --check-only` | 167 cases，exit 0 |
| 9 | `npm run s0:gate` | PASS；24/24；唯一差异 environment_fingerprint（§8） |
| 10 | `npm run release:verify` | PASS |
| 11 | `python3 evidence/probes/r15/gen-cases.py && python3 evidence/probes/r15/r15-probe.py` | 98/122 MATCH（24 处 DIFF，§2）；重跑 md5 一致 |
| 12 | `python3 evidence/probes/r10/r10-probe.py` … `r14/r14-probe.py` | 88/88、74/74、118/118、98/98、78/78（2 FLAG STALE，§8） |
| 13 | `python3 evidence/probes/fix-p0-XX/run-matrix.py` × 12 | 100/76/134/86/164/98/314/248/486/196/114/249（§8） |
| 14 | `python3 evidence/probes/r15/parser-probe.py` + `node evidence/probes/r15/parser-probe.mjs` | 见 §3 |
| 15 | 规则归因实测（直接调用 C3/(d)/(c) 三条拒收规则） | C3 触发，(d)/(c) 不触发（§3） |
| 16 | 崩溃形状直接驱动（`oracle-parse-probe.py` / `oracle-jobs-probe.py`，exit 码实测） | exit 1，TypeError/AttributeError（§3） |
| 17 | `npm run release:freeze -- --trial` × 2（`5e3cda7`） | 三哈希两次一致；`sha256sum -c` 3/3 OK；manifest 与终报值一致（§6、§9） |
| 18 | `git diff 0bd363a..5e3cda7 --stat` / `-- src/ oracle/ scripts/ release/` / `--diff-filter=D` / tests `skip`/`only` | 42 文件 +7594/−594；src/ 空；scripts/release 空；删文件 0；skip/only 0 |
| 19 | fix-p0-14 `cases.json` 11 标志核对 + fix-p0-15 `cases.json` 6 标志核对 + T006 报告哈希核对 | P2-R15-1 新增（11 标志过期）；fix-p0-15 6 标志均仍 DIFF；T006 哈希逐字节一致（§5） |
| 20 | `_is_lone_anchored_empty_key_doc` 未动核对 + `extract_jobs` 双接线核对 | 分类规则 0 改动；unwrap 双接线（§1(a) jobs 模式可证） |

## §11 未审查事项与报告瑕疵记录

- 未审查：`eee2dc4` 终报提交本身（只含终报文本，无代码）；终报 §2 过程记录中的六轮测绘细节未逐项复跑——本轮以端到端探针（§8）与解析器层测绘（§3）独立验证结论。
- 未审查：Drive 归档状态与终审对话（不在 T013 复核范围内）。
- **终报文案订正 1（§2.4 的控制声称错）：** 终报 §2.4 称根首对 `!foo &x : 1` 为控制（TS 接受，(d) 不得触发）——关于 (d) 成立，但该形状整体并不 MATCH：C3 在其上触发，Oracle 拒收。终报因此漏披露 P0-1 的第 3 行（根首对，2 检查）。
- **终报文案订正 2（§7.3 的对照声称错）：** 终报 §7.3 称 `on: !!int {push: {}}` 双边均为 `yaml_parse_error`（MATCH）——实测 TS VALID / [1 job]，Oracle 崩溃 exit 1（`TypeError`）。终报因此漏披露 P0-3 的 `on:` 值位置（`!!int`/`!!bool`/`!!float` 3 行 6 检查 + `!!str` 1 行 1 检查）。
- **终报文案订正 3（§6 的标志状态）：** 终报 §6 称 fix-p0-14 矩阵"其标志已过期"——属实，但标志并未清除（见 §5 P2-R15-1）。
- **本轮新增 P0（见 §2）：** 13 行残留，3 个家族，24 检查，全部独立重建并定级。
- **本轮 P2 变化（见 §5）：** P2-R15-1 新增；P2-R6-1 范围扩大到 R15。
- 本报告瑕疵：R15 自写探针的 R6 形状未单列——R6 5 形状已由 R14 探针重跑覆盖（78/78 含 10/10，见 §8），未在本轮探针中重复。`r15-r2-str-flow-nospace` 的 jobs 模式 MATCH（双边 jobs 均为空）与 trigger 模式 DIFF 并存，已在 `diff_modes` 中逐模式标注。

## §12 给 parent 的下一步

1. **定点修复 §2 的 3 个 P0 家族（FIX-P0-16）**：
   - P0-1 收窄 C3：tag + unglued 的 anchored 空键上 C3 不得触发（不限位置）；须做 R13 §4.2 的 16 形 + 本轮 tag/unglued 位置矩阵的专门边界重验，并清除 P2-R15-1 的 11 个过期标志（逐行核对确为 MATCH 后翻转）。
   - P0-2 文本层扫描器镜像：`&x:!!tag` 无空格形态（流/块两种表现分别处理）。
   - P0-3 loader 边界映射：忽略集合节点上的标量 tag（`!!int`/`!!bool`/`!!float`/`!!str`），须映射完整边界并确认 `!!str` 的 UNKNOWN 同样消失；仅 catch 异常不够。
   - 然后派**新的独立复核 R16**（审查对象为修复后 HEAD；复核员一律在干净克隆里验证，不得与修复并行同一工作树；R16 须重跑本报告 §2 的 13 行残留 + §4 的 (d)/C3 边界探针 + 十二矩阵 + R5 66 例 + 本轮 61 行矩阵 + 终报 manifest 哈希复核）。
2. R16 PASS 后：T014 正式重新冻结（manifest `inputs` 须记入 R4–R15，见 P2-R6-1）→ Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3（同一立项对话，GPT-6 + Extra High + 完整结尾句）。
3. 终审轮次已用 2/5；R16 仍在同一立项对话内复核，不占用终审轮次。
