# T013 独立复核 R13 — FIX-P0-13（R12 P0-C1/C2/C3）复核报告

- **审查对象**：代码提交 `01509e0c245b28c241b6e38d20782ee479e56fc6`（FIX-P0-13：关闭 R12 P0-C1 `,`-suffix、P0-C2 `[`/`]`-suffix、P0-C3 anchored empty key；相对 `7cca1b9`，74 文件，+6310/−975）。终报提交 `87e5c4d` 只含终报文本，不在代码审查范围内。
- **复核员**：T013 独立复核员（全新会话，与 FIX-P0-13 修复方、R12 复核员均隔离；未共享上下文）。
- **复核环境**：干净克隆 `~/workspace/p020-review-r13/`（`git clone ~/workspace/p020-checkpath` 后 `git checkout 01509e0`），`git status` 干净（仅复核探针 `evidence/probes/r13/` 未跟踪），`git log --oneline -2` 顶为 `01509e0`。全部命令均在该克隆内亲自跑；未与任何修复并行同一工作树（R4 污染教训）。本轮复核中无 VM 重启；一次 `npm run s0:gate` 因 120 s 前台时限转入后台，后经 `process.poll` 取回完整结果（PASS，见 §8）。
- **结论：NOT PASS — P0 1 / P1 0 / P2 9。**

## §0 审查对象与无污染声明（先读）

- 本轮只审查 `01509e0` 的代码。`87e5c4d` 的终报文本仅作背景阅读；报告中所有数字均由本轮亲自重跑得出，未采信终报数字。
- 复核探针全部在干净克隆内运行；探针证据（`evidence/probes/r13/`：`cases.json` 49 行、`gen-cases.py`、`r13-probe.py`、`results.json`、README）随本报告一并提交入仓库，不只留 `/tmp`（P2-R6-2 的教训）。
- 终报 §7 披露的 2 个残留检查本轮**全部独立重建并逐一定级**，见 §2；另加引号空 key 对照探针（见 §3）；定级不采信修复方"超出本轮范围"/"无法关闭"/"产品域之外"的表述——定级只看是否存在 mismatch。

## §1 R12 的 P0-C1、P0-C2、P0-C3 — 全部关闭（已验证）

R12 定级的三项 P0 均已关闭。本轮从 R12 报告 §2/§3/§4 原文独立重建
8 + 3 + 1 形状（未复制修复方 `cases.json`），在干净克隆内 trigger + jobs
双模式重跑，**24/24 MATCH**（含于本轮自写探针 98 检查之中，见 §8）；
修复方 R12 探针重跑 **118/118 MATCH**；修复方新矩阵 **194/196 MATCH**，
其余 2 检查均为 §2 的 lone-doc 残留行。

| 检查 | 结果 |
|---|---|
| P0-C1 8 形状（A60、X04、Y03、Y05、Y08、Y09、Y10 + X11 block 变体） | **16/16 MATCH**（双边 INVALID / `yaml_parse_error`，含反向行 X11） |
| P0-C1 both-accept 形状 `m: {a: !foo, 1}` / `m: {a: !foo, [1, 2]}` | **4/4 MATCH**（双边接受，verdict 对齐——两条规则同时拒收的形状外，接受形状未误拒） |
| P0-C1 对照 4 形状（X02 中部逗号、Y01 flow 序列内 pair、X13 空格、X05 序列逗号） | **8/8 MATCH** |
| P0-C1 flow-KIND 判别式 5 形状（见 §4） | **10/10 MATCH** |
| P0-C2 3 形状（A70、X08、X09） | **6/6 MATCH**（双边 INVALID / `yaml_parse_error`） |
| P0-C2 对照 5 形状（%5B 转义、verbatim、左括号中部、右括号独占、key 位置） | **10/10 MATCH** |
| P0-C3 A45 | **2/2 MATCH**（双边 INVALID / `yaml_parse_error`） |
| P0-C3 豁免边 8 形状（见 §4） | **16/16 MATCH** |
| R6 核心 5 形状（R10 §2.1 重建） | **10/10 MATCH** |
| R12 探针重跑（59 行） | **118/118 MATCH** |
| fix-p0-13 新矩阵（98 行 × 2） | **194/196 MATCH**（2 检查 DIFF，全部为 §2 的 lone-doc 行） |

## §2 新发现 P0 — lone 文档 anchored empty key（2 检查，trigger 模式）

修复方终报 §7.1 披露的残留。本轮独立重建并加对照，**2/2 检查 DIFF**。

### 2.1 现象

| 例 | 输入 | TS | Oracle |
|---|---|---|---|
| R13-L1（lone-scalar） | `&x: 1` 单独成文档 | **INVALID / workflow_root_not_mapping** | **INVALID / missing_on_key** |
| R13-L2（lone-null） | `&x:` 单独成文档 | **INVALID / workflow_root_not_mapping** | **INVALID / missing_on_key** |

合计 **2 处 DIFF / 98 检查**（2 形状 × trigger 模式；jobs 模式 MATCH——
两边都返回 `[]`）。对照组全部 MATCH：lone 纯量 `1`、lone 字符串 `hello`、
lone 序列 `- a/- b`、lone anchored scalar `&x hello`、lone tagged scalar
`!foo 1`——双边均为 `workflow_root_not_mapping`。分歧**只**落在
anchored empty key 形状上。

### 2.2 根因（解析器层最小复现，见 §3）

两个解析器对 `&x: 1` 这一文档的**结构**本身看法不同：

- PyYAML `_StrictBaseLoader` 把它渲染为 1 对映射 `{'' : '1'}`（空字符串
  key）——Oracle 的根检查见 dict，通过 `workflow_root_not_mapping` 分支，
  落到 `missing_on_key`。
- `yaml` npm 包把它解析为纯量 `1`——TS 的根检查见非映射，返回
  `workflow_root_not_mapping`。

错误码差异是该结构分歧的下游后果，与此前各 P0 同构（均为解析器层对
tag/anchor 扫描边界的分歧）。

### 2.3 修复方"无法关闭"说法的核查

修复方称"无法用拒收规则关闭"，该说法**在其字面范围内成立**，但不等于
分歧不可关闭：

- 拒收规则确实关不上：Oracle 侧拒收得到 `yaml_parse_error`，仍与 TS 侧的
  `workflow_root_not_mapping` 不同（终报 §7 的论证正确）。
- 但**分类对齐**原则上可以关闭：Oracle 的根检查可以在已加载文档恰为
  "全部由 anchored empty key 构成的退化映射"时返回
  `workflow_root_not_mapping`；或 TS 侧对 anchored 纯量根特殊处理。
  判定必须用 token 模式（KeyToken + AnchorToken + ValueToken 且无真实
  key——C3 规则已在扫描同一模式），不能只看"dict 含空字符串 key"：
  本轮对照证明，引号空 key 文档 `"": 1`（lone）双边均为
  `missing_on_key`、MATCH，`"": 1` + 完整 workflow 双边均为 VALID、MATCH
  ——粗糙的"空 key 即非映射"分类会破坏这两处 MATCH。修复机制的选择权在
  修复方；机制新颖性（分类规则而非拒收规则）是修复设计问题，不是定级
  问题（见 §2.4 权衡 (c)）。

### 2.4 定级：P0（1 项）的依据与权衡

定级 **P0（1 项：lone 文档 anchored empty key）**，依据：

- PROJECT_BOOK §7.3（L513）："Oracle 与实现**任何字段不一致都判失败；
  不得通过忽略字段、容差或人工解释来放行**。"——错误码是输出字段之一。
- PROJECT_BOOK §8.2（L548）："Oracle parity | 100% | 所有受支持输入完全一致。"
- IMPLEMENTATION_PLAN §8.1（L779）："**任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。**"
- IMPLEMENTATION_PLAN §10（L827）：P0 阻断明确包含 "**Oracle mismatch**"。
- **R3-ON 裁决先例**：双边 INVALID、错误码不同**不自动通过**，定为 P0——
  本项与之同形态（双边 INVALID，仅错误码不同）。
- **终审 R2 的裁决先例**：把同类分歧降为 P2 的理由被终审明确驳回。
- **计数原则（R11 先例）**：按根因计数。两形状同根因（anchored empty key
  在 lone 文档中的结构渲染分歧），计为一项 P0；规模与 P0-C3 相同（2 检查）。

**已权衡的反方考虑（记录在案，不改变定级）：**
- (a) 双边都判 INVALID，只差错误码。但 R3-ON 正是此形态且定为 P0；
  "都 INVALID"不是 §7.3 的放行条件，字段级比较包含错误码。
- (b) 输入在产品域之外（真实 workflow 恒有 `on:` 与 `jobs:`）。
  R12 §5(a) 已驳回同一理由（"真实 workflow 几乎不会出现"正是 §7.3
  明文禁止的"人工解释"放行理由）；R2 P0（重复键）、R6 P0（flow 映射内
  缩进 0 注释行）同样退化，仍被定为 P0。探针脚手架接受任意 YAML 文档
  作为输入并分类，本项目历轮的"受支持输入"边界一贯是"解析器接受并分类
  的输入"，不是"现实 workflow"。
- (c) 修复需要新机制（分类对齐而非拒收规则），且修复方称拒收规则关不上。
  R12 §5(c)：修复难度与修复位置不影响定级；定级只看是否存在 mismatch。
  §2.3 已证分类对齐原则上可行，机制细节留待 FIX-P0-14。
- (d) 修复方已如实披露 2 行残留、未 silent 扩大范围。披露诚实不改变定级：
  定级只看提交代码是否存在 mismatch（与 R8 对 R3 的权衡 (c) 同理）。
- (e) 规模小（2 检查，仅 trigger 模式；jobs 模式 MATCH）。规模不改变定级：
  §7.3 无 de minimis 条款；P0-C3 同为 2 检查且定为 P0。
- (f) 与既往 P0 的一个真实区别：本项关不上靠的是既有拒收规则家族，需
  要分类对齐。记录为修复方向注记（见 §11），不构成降级理由——定级看
  mismatch 是否存在，不看关闭它的机制是否已有先例。

## §3 解析器层最小复现（与探针驱动无关）

干净克隆内直接对解析器本身验证：

| 形状 | PyYAML `_StrictBaseLoader` | `yaml` npm 包 | 端到端（探针） |
|---|---|---|---|
| `&x: 1` lone | dict `{'' : '1'}`（1 对映射） | number `1`（纯量） | TS `workflow_root_not_mapping` vs Oracle `missing_on_key` |
| `&x:` lone | dict `{'' : ''}` | `null`（纯量） | 同上 |
| `1` lone | scalar `'1'` | number `1` | MATCH（双边 `workflow_root_not_mapping`） |
| `hello` lone | scalar `'hello'` | string `"hello"` | MATCH |
| `- a/- b` lone | list | array | MATCH |
| `&x hello` lone | scalar `'hello'` | string `"hello"` | MATCH |
| `!foo 1` lone | str `'1'` | string `"1"` | MATCH |
| `"": 1` lone（引号空 key 对照） | dict `{'' : 1}` | dict `{'' : 1}` | MATCH（双边 `missing_on_key`） |
| `"": 1` + 完整 workflow（对照） | dict（含 `on`） | dict（含 `on`） | MATCH（双边 VALID） |

分歧在解析器层，与探针脚手架无关；引号空 key 对照证明分歧只在
anchored 形态，不在"空 key"本身——分类修复必须以 token 模式为判据
（见 §2.3）。

## §4 边界验证：flow-KIND 判别式与 P0-C3 豁免边

### 4.1 P0-C1 flow-KIND 栈（本轮自写边界，10/10 MATCH）

| 形状 | 预期 | 结果 |
|---|---|---|
| `m: {a: [!foo, b: 1]}`（flow map 嵌于 flow seq，最内层 kind 为 map） | 双边拒 | MATCH（双边 INVALID） |
| `m: [!foo, b]`（纯 flow seq） | 双边接受 | MATCH |
| `m: {a: [!foo, 1]}`（flow seq 嵌于 flow map，最内层 kind 为 seq） | 双边接受 | MATCH |
| `m: {a: !<foo,bar> 1, b: 2}`（逗号在 verbatim `<>` 内，是内容） | 双边接受 | MATCH |
| `m: {a: !foo%2Cbar 1, b: 2}`（%2C 转义，只有字面尾逗号触发） | 双边接受 | MATCH |

flow-KIND 栈判别式成立：触发与否只看 tag 所在最内层 flow kind，
与嵌套深度无关；Oracle 侧 `_reject_tag_suffix_comma` 的"最内层 flow
kind 不是 seq"条件与 TS 侧 `hasRejectedTagComma` 的"最内层 kind 为 map"
条件在全部边界上一致。

### 4.2 P0-C3 豁免边（本轮自写边界，16/16 MATCH）

| 形状 | 预期 | 结果 |
|---|---|---|
| `m: {&x: 1}`（flow 豁免） | 双边接受 | MATCH |
| `m: {&x: 1, b: 2}`（flow 豁免，2 对） | 双边接受 | MATCH |
| `m:\n  &x: 1`（单对豁免，嵌套 block 映射） | 双边接受 | MATCH |
| `&x:` + 后续 pairs（首对 null 值、anchor 胶合 `:`） | 双边接受 | MATCH |
| `&x :` + 后续 pairs（anchor 与 `:` 间有空格） | 双边拒 | MATCH |
| `name: probe\n&x:\non: push…`（null 值在非首位） | 双边拒 | MATCH |
| `&x: [1]` + 后续 pairs（首对有集合值） | 双边拒 | MATCH |
| `!foo &x: 1` + 后续 pairs（双属性） | 双边拒 | MATCH |
| `m:\n  - &x: 1`（block-seq item 内单对） | 双边接受 | MATCH |

三条豁免（flow / 单对 / 首对 null 值且胶合）均未过宽或过窄。
`hasRejectedTagComma` 接线两处 gate 均已核对
（`parseWorkflowYaml` workflow-parser.ts L1812；`extractJobs`
e2e.ts L284，import L79）；Oracle 三条规则在
`parse_workflow_yaml`（parser.py L1423–1425）与 `extract_jobs`
（L1737–1739）均已接线。

## §5 P2 清单：终审 R2 的 6 个 + R6 的 2 个 + 本轮新增 1 个 = 9 个，全部非阻断

| P2 | 复核（01509e0） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。冻结脚本未动（`git diff 309b2ee..01509e0 -- scripts/deterministic-zip.py` 为空），仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§9） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。README 仍为 "P95 768.3 ms, peak RSS 98.3 MiB"，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 仍有 `NOT_TESTED` 标记，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。试冻 manifest 的 freeze_commit 字段为 TRIAL 说明；正式冻结时 T014 报告 §9 补实际 commit（同 R2 模式） |
| **P2-R6-1：manifest 的 `inputs` 只记录 t013 复核到 R3** | 仍成立，且范围扩大到 R13。本轮试冻 manifest 的 `inputs` 键仍为 golden_suite_sha256、oracle_parity_report、s0_gate、s0_input_fixture_sha256、t013_review_r1/r2/r3——R4–R13 十轮复核均未记录。T014 重冻时须把 R4–R13 一并记入，非阻断 |
| **P2-R6-2：复核探针证据未入仓库** | 部分缓解，仍成立。R7/R8 自写探针只在 `/tmp` 与报告中；R9/R10/R11/R12/R13 自写探针已随报告提交入仓库（`evidence/probes/r9/`、`r10/`、`r11/`、`r12/`、`r13/`），故"后续复核探针入仓"的要求自 R9 起已满足。非阻断 |
| **P2-R13-1（本轮新增）：fix-p0-12 矩阵的 12 个 `known_divergence` 标志过期未清** | `evidence/probes/fix-p0-12/cases.json` 中 12 行（`A45-anchor-then-colon-block`、`A60-tag-then-comma`、`A70-tag-brackets`、`X04-comma-then-close-pair`、`X08-rbrack-seq`、`X09-rbrack-seq2`、`X11-comma-block2`、`Y03-map-tagcomma-quoted`、`Y05-map-tagcomma-nl`、`Y08-map-tagcomma-anchor`、`Y09-map-tagcomma-num`、`Y10-map-tagcomma-null`）仍标 `known_divergence: true`，但重跑后 `results.json` 显示 486/486 全 MATCH、0 非 MATCH 行——与 P2-R12-1 同类问题（该 P2 修复的是 fix-p0-11 矩阵标志，本轮是 fix-p0-12 矩阵的同类遗留）。标志本身不影响判定（runner 按实际结果计分），属证据卫生问题，非阻断。修复方应在下一轮清零（`cases.json` 逐个置 `false` + 同步 README 注记）。 |

**P2-R12-1（已解决，不再列入未决清单）：** fix-p0-11 `cases.json` 的 8 个
过期标志本轮复核全部为 `false`（124 行中 0 flagged），对应矩阵重跑
248/248 MATCH、0 flagged。已清除，状态不变。

**P2-R10-1 / P2-R10-2（已解决，不再列入未决清单）：** 14 个旧矩阵标志仍为
`false`，对应矩阵重跑 0 flagged；T006 报告 `suite_sha256` 为
`36c3853d…`，与同一提交的 `tests/fixtures/trigger/suite.json` 实测哈希
逐字节一致，fixture_count 128 / passed 128 / 0 mismatch。已修复，状态不变。

## §6 Manifest 哈希核查（终报文案订正，不计入定级）

- 本轮实测 manifest 哈希 **`9e68492a…`**，与终报 §4 的 `677e5e82…`
  **不一致**。source.zip（`95908685…`，2315 文件）与 dist.zip
  （`f2bcd53f…`，114 文件）两次试冻均与终报逐字节一致，故冻结树本身
  无问题；仅 manifest 哈希数字存疑。
- 历史 discrepancy 的复核（终报 §4 的结论"R12 的 `933f7e8b…` 可信"成立）：
  本轮另开干净克隆在 `309b2ee` 上两次试冻，manifest 哈希均为
  **`933f7e8b…`**，与 R12 的两次实测完全一致（source `267ba902…`、
  dist `16af8080…` 亦一致）。故 R12 的值是 `309b2ee` 树的可信值，
  FIX-P0-12 报告的 `5e44f660…` 确为错误值（不同树状态下测得或转录错误）。
- 同理，本轮在 `01509e0` 树上两次一致的 `9e68492a…` 是本轮的可信值；
  终报的 `677e5e82…` 无法复现。冻结脚本自 `538c669` 后未动，且全部
  manifest 输入均经 `git cat-file` 读 HEAD（`scripts/deterministic-zip.py`
  L238、L275、L485、L519），无时间戳、无绝对路径、无环境指纹——同一
  HEAD 下 manifest 应跨环境一致。修复方报告的 manifest 哈希已连续两轮
  无法复现（FIX-P0-12 的 `5e44f660…`、FIX-P0-13 的 `677e5e82…`），而
  source/dist 每次都逐字节一致；终报 §4"此后各轮一律以自己实测的两次
  一致值为准，不得从既往报告抄哈希"的规则正确，且应先用于终报自身的数字。
- 此为试冻产物的**报告数字订正**，不是产品缺陷：manifest 是试冻产物，
  T014 正式重冻时会重新生成；不计入 P0/P1/P2（与 R12 §12 订正 1 同类）。

## §7 违规捷径检查：无

- `src/` diff（`7cca1b9..01509e0`）= 仅 `src/core/workflow-parser.ts`
  （+408，`hasRejectedTagComma`）与 `src/core/e2e.ts`（+6，gate 接线）；
  `oracle/` diff = 仅 `oracle/checkpath_oracle/parser.py`（+277，三条新规则
  + 共用 `_raw_tag_suffix`）。
- 删测试 0（`git diff --diff-filter=D` 为空）；测试/夹具 diff 中无 `skip`/
  `only` 弱化（`grep -c` 为 0）。
- 无 mismatch 忽略名单（`deepDiff` 未动）；无输入文本手术；无解析器更换。
- 修复方终报数字除 manifest 哈希外全部复核一致（§8、§9）；终报文案订正见 §6。
- 试冻 manifest 的 `inputs` 仍只记录到 R3，见 P2-R6-1（T014 重冻时处理）。
- 新增测试 47 个（44 形状 + 3 schema 断言），与终报口径一致；新增夹具
  44 件（tag-suffix-comma 16 + tag-suffix-brackets 12 +
  anchored-empty-key 16）与终报一致；新增测试文件 3 个。

## §8 全量重跑（干净克隆 `~/workspace/p020-review-r13`，HEAD `01509e0`，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，exit 0） |
| `npm test` | **1554/1554 通过**（48 test files；基线 1507 + 新增 47） |
| `npm run test:oracle` | 167/167，0 偏差，0 false PASS；unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 128 夹具，0 mismatch（报告 128/128 passed） |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch（报告 48/48 passed） |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch（报告 46/46 passed） |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch（报告 44/44 passed） |
| `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；oracle 24/24，100 次运行 1 个唯一哈希；gate hash 见下 |
| `npm run release:verify` | **PASS**；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `python3 scripts/build-golden.py --check-only` | golden cases 167，exit 0 |

**S0 gate hash 说明：** 干净克隆的 `evidence/S0_GATE.json` status 为 PASS，但
`gate_report_sha256` 为 `31aa6988d12cf4d18f2d3887a668f73ad73c79eaf7202faa9832460dd5033f36`，
与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是
`environment_fingerprint`**（克隆路径不同导致；其余字段全部一致，含
`input_fixture_sha256`、`conditions` 全 true、determinism 100/1、unsupported
2/2）。这不是回归（与 R4–R12 同一现象，不同克隆路径不同指纹）。重跑后已
`git checkout -- evidence/S0_GATE.json` 恢复。

**探针矩阵重跑（干净克隆，仓库内 runner，全 JSON 深相等；重跑后
`results.json` 与提交版逐字节一致——`git status` 除自写探针与试冻产物外干净）：**

| 矩阵 | 结果 |
|---|---|
| fix-p0-04 | **100/100 MATCH**（前 66 行 R5 子集 **66/66 MATCH**，单模式 66 检查） |
| fix-p0-05 | **76/76 MATCH** |
| fix-p0-06 | **134/134 MATCH** |
| fix-p0-07 | **86/86 MATCH** |
| fix-p0-08 | **164/164 MATCH** |
| fix-p0-09 | **98/98 MATCH** |
| fix-p0-10 | **314/314 MATCH** |
| fix-p0-11 | **248/248 MATCH**（0 flagged——P2-R12-1 的 8 个标志已清，见 §5） |
| fix-p0-12 | **486/486 MATCH**（24 检查仍标注 `known_divergence`，但行已全部 MATCH——标志过期，见 P2-R13-1） |
| fix-p0-13 | **194/196 MATCH**（2 检查 DIFF，全部为 §2 的 lone-doc 行，flagged） |
| R10 探针 | **88/88 MATCH** |
| R11 探针 | **74/74 MATCH** |
| R12 探针 | **118/118 MATCH** |

**R13 独立探针（自写，`evidence/probes/r13/r13-probe.py`，49 例 ×2 模式 =
98 检查；P0-C1/C2/C3 形状自 R12 报告 §2/§3/§4 原文重建，边界变体自写，
未复制修复方 `cases.json`）：**

| 组 | 结果 |
|---|---|
| P0-C1 8 形状（§1） | 8 例 ×2 模式 **16/16 MATCH** |
| P0-C1 both-accept 2 形状 | 2 例 ×2 模式 **4/4 MATCH** |
| P0-C1 对照 4 形状 | 4 例 ×2 模式 **8/8 MATCH** |
| P0-C1 flow-KIND 判别式 5 形状（§4.1） | 5 例 ×2 模式 **10/10 MATCH** |
| P0-C2 3 形状（§1） | 3 例 ×2 模式 **6/6 MATCH** |
| P0-C2 对照 5 形状 | 5 例 ×2 模式 **10/10 MATCH** |
| P0-C3 A45（§1） | 1 例 ×2 模式 **2/2 MATCH** |
| P0-C3 豁免边 8 形状（§4.2） | 8 例 ×2 模式 **16/16 MATCH** |
| lone-doc 2 形状（§2） | 2 例 ×2 模式 **2/4 MATCH**（trigger 模式 2 处 DIFF） |
| lone-doc 对照 5 形状 | 5 例 ×2 模式 **10/10 MATCH** |
| R6 5 形状（§1） | 5 例 ×2 模式 **10/10 MATCH** |

探针合计 2,280 检查（十矩阵 1,902 + R10 探针 88 + R11 探针 74 +
R12 探针 118 + R13 独立探针 98；十矩阵 = fix-p0-04 100 + fix-p0-05 76 +
fix-p0-06 134 + fix-p0-07 86 + fix-p0-08 164 + fix-p0-09 98 + fix-p0-10 314 +
fix-p0-11 248 + fix-p0-12 486 + fix-p0-13 196；注：各矩阵与探针有形状重叠，
合计为检查次数非去重形状数），DIFF 4 处（fix-p0-13 矩阵 2 + R13 独立探针
2，全部为 §2 同一 lone-doc 根因；两处 2 为同形重叠）。

## §9 试冻三哈希（干净克隆，`--trial`，两次）

两次 `npm run release:freeze -- --trial`（HEAD `01509e0`）哈希完全一致，
确定性成立；source/dist 与修复方试冻值逐字节一致，**manifest 与修复方
值不一致（见 §6）**：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `9590868588ebb6ead114d52baa77f21a523dd2686bcf75ff1d5a7af931020b1c`（2,315 文件） | 与修复方值一致；与 R2 的 `3a778b93…` 相比已变（`src/` + `oracle/` 改动，属预期） |
| dist.zip | `f2bcd53f360ada37da25d3d650009b4c10274594a8faf4ed1c4d7591680e8f7f`（114 文件） | 与修复方值一致；与 FIX-P0-12 时的 `16af8080…` 相比已变（`src/` 改动，属预期——dist 为纯 TS 发行物） |
| RELEASE_MANIFEST.json | `9e68492a2eff64d5d786d4324e7fe7c8e37ea409dc3147215f5dcd87600e271c` | **与修复方报告值 `677e5e82…` 不一致**，见 §6 |

`sha256sum -c` 3/3 OK。试冻后已 `git checkout release/`，克隆内 `release/`
恢复为 HEAD 正式件（source.zip `3a778b93…`、dist.zip `da130ad2…`，已核对）。

**历史对照（`309b2ee`，另开干净克隆 `/tmp/r13-check-309b2ee`，两次试冻）：**
manifest 哈希两次均为 `933f7e8b8f9a9a6b601f5c8a649b894f59e4391b7d1ad515f8a8692489916bb1`，
与 R12 的两次实测完全一致（source `267ba902…`、dist `16af8080…` 亦一致）；
该克隆已删除。见 §6。

## §10 亲自跑过的命令与结果（摘要）

全部在干净克隆 `~/workspace/p020-review-r13`（HEAD `01509e0`）内运行；`npm ci` 后执行。

| # | 命令 | 结果 |
|---|---|---|
| 1 | `git clone ~/workspace/p020-checkpath ~/workspace/p020-review-r13 && git checkout 01509e0` | 顶为 `01509e0`，工作树干净（仅 r13/ 未跟踪） |
| 2 | `npm ci --no-audit --no-fund` | 181 packages，exit 0 |
| 3 | `npm test` | 1554/1554（48 files） |
| 4 | `npm run test:oracle` | 167 夹具，0 mismatch，0 false PASS，34/34 UNKNOWN |
| 5 | `npm run oracle:diff:trigger` / `jobs` / `checks` / `witness` | 128 / 48 / 46 / 44，全部 0 mismatch |
| 6 | `npm run typecheck` | PASS，exit 0 |
| 7 | `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| 8 | `python3 scripts/build-golden.py --check-only` | 167 cases，exit 0 |
| 9 | `npm run s0:gate` | PASS；24/24；唯一差异 environment_fingerprint（§8） |
| 10 | `npm run release:verify` | PASS |
| 11 | `python3 evidence/probes/r13/gen-cases.py && python3 evidence/probes/r13/r13-probe.py` | 96/98 MATCH（2 处 DIFF，§2） |
| 12 | `python3 evidence/probes/r12/r12-probe.py` | 118/118 MATCH |
| 13 | `python3 evidence/probes/r10/r10-probe.py` | 88/88 MATCH |
| 14 | `python3 evidence/probes/r11/r11-probe.py` | 74/74 MATCH |
| 15 | `python3 evidence/probes/fix-p0-XX/run-matrix.py` × 10 | 100/76/134/86/164/98/314/248/486/194（§8） |
| 16 | `node YAML.parse` × 6 形状 + PyYAML `_StrictBaseLoader` × 6 形状 + 引号空 key 对照 × 2 | 见 §3 |
| 17 | `npm run release:freeze -- --trial` × 2（`01509e0`）+ × 2（`309b2ee` 另开克隆） | 三哈希两次一致；`sha256sum -c` 3/3 OK；manifest 与终报值不一致（§6、§9） |
| 18 | `git diff 7cca1b9..01509e0 --stat` / `-- src/ oracle/` / `--diff-filter=D` / tests `skip`/`only` | 74 文件 +6310/−975；src/oracle 仅 3 文件；删文件 0；skip/only 0 |
| 19 | fix-p0-11 `cases.json` 8 标志核对 + fix-p0-12 `cases.json` 12 标志核对 + T006 报告哈希核对 | P2-R12-1 已清（0 flagged）；P2-R13-1 新增（12 flagged）；T006 哈希一致（§5） |
| 20 | `hasRejectedTagComma` / 三条 Oracle 规则接线核对 | 两处 gate 均已接线（§4.2） |

## §11 未审查事项与报告瑕疵记录

- 未审查：`87e5c4d` 终报提交本身（只含终报文本，无代码）；终报 §2 过程记录中的六轮测绘细节未逐项复跑——本轮以端到端探针（§8）与解析器层测绘（§3）独立验证结论。
- 未审查：Drive 归档状态与终审对话（不在 T013 复核范围内）。
- **终报文案订正 1（数字无法复现，不计入定级）：** 终报 §4 的试冻 manifest
  哈希 `677e5e82…` 本轮两次试冻均为 `9e68492a…`（调查见 §6、§9）。
  source.zip 与 dist.zip 的试冻值均与终报逐字节一致，故冻结树本身无问题；
  仅 manifest 哈希数字存疑。建议 FIX-P0-14 在终报中以本轮实测值
  `9e68492a…` 为准（并以自己实测的两次一致值为准，不得从既往报告抄哈希）。
- **本轮新增 P2（见 P2-R13-1）：** fix-p0-12 矩阵的 12 个 `known_divergence`
  标志在残留行变为 MATCH 后未清零（与 P2-R12-1 同类）。
- 本报告瑕疵：R13 自写探针的 R6 形状系按 R10 报告文字经 R12 重建，未逐字复核
  R10 原始用例原文；结论（全部 MATCH）仅针对重建形状。`r13-r6-on-unsupported`
  使用了不支持事件 `pull`，Oracle 侧为 UNKNOWN 而非 VALID——该形状的 MATCH 仍
  成立（双边 INVALID，错误码一致），且另有 `pull_request` 的干净形状
  `r13-r6-on` 佐证同一结论。

## §12 给 parent 的下一步

1. **定点修复 §2 的 lone-doc P0（FIX-P0-14）**：
   - 方向：分类对齐，不是拒收规则。建议 Oracle 侧：在 `parse_workflow_yaml`
     的根检查处，当已加载文档恰为"全部由 anchored empty key 构成的退化映射"
     时返回 `workflow_root_not_mapping`（判据须用 token 模式——KeyToken +
     AnchorToken + ValueToken 且无真实 key，C3 规则已在扫描同一模式；不可
     只看"dict 含空字符串 key"，否则会破坏引号空 key 文档 `"": 1` 的 MATCH，
     见 §3）。jobs 模式目前 MATCH（双边 `[]`），改动须保持 jobs 不变。
   - 另清 P2-R13-1：fix-p0-12 `cases.json` 的 12 个过期标志置 `false`。
   - 然后派**新的独立复核 R14**（审查对象为修复后 HEAD；复核员一律在干净克隆里验证，
     不得与修复并行同一工作树；R14 须重跑本报告 §2 的 lone-doc 2 形状 +
     引号空 key 对照 + 十矩阵 + R5 66 例 + 本轮 49 行矩阵 + 终报 manifest 哈希复核）。
2. R14 PASS 后：T014 正式重新冻结（manifest `inputs` 须记入 R4–R13，见 P2-R6-1）
   → Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3
   （同一立项对话，GPT-6 + Extra High + 完整结尾句）。
3. 终审轮次已用 2/5；R14 仍在同一立项对话内复核，不占用终审轮次。
