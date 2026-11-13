# T013 独立复核 R12 — FIX-P0-12（R11 P0-A/P0-B）复核报告

- **审查对象**：代码提交 `309b2ee8f5a92eb1b1f85850bed93cedd6832e1b`（FIX-P0-12：TS 侧拒 anchor/tag 无空格 + S1 收窄至带 `:` 的 key；相对 `e0d7a01`，52 文件，+9237/−707）。终报提交 `0b05173` 只含终报文本，不在代码审查范围内。
- **复核员**：T013 独立复核员（全新会话，与 FIX-P0-12 修复方、R11 复核员均隔离；未共享上下文）。
- **复核环境**：干净克隆 `~/workspace/p020-review-r12/`（`git clone ~/workspace/p020-checkpath` 后 `git checkout 309b2ee`），`git status` 干净（仅复核探针 `evidence/probes/r12/` 未跟踪），`git log --oneline -2` 顶为 `309b2ee`。全部命令均在该克隆内亲自跑；未与任何修复并行同一工作树（R4 污染教训）。本轮复核中无 VM 重启；一次 `npm run s0:gate` 因 120 s 前台时限转入后台，后经 `process.log` 取回完整结果（PASS，见 §8）。
- **结论：NOT PASS — P0 3 / P1 0 / P2 9。**

## §0 审查对象与无污染声明（先读）

- 本轮只审查 `309b2ee` 的代码。`0b05173` 的终报文本仅作背景阅读；报告中所有数字均由本轮亲自重跑得出，未采信终报数字。
- 复核探针全部在干净克隆内运行；探针证据（`evidence/probes/r12/`：`cases.json` 59 行、`gen-cases.py`、`r12-probe.py`、`results.json`、README）随本报告一并提交入仓库，不只留 `/tmp`（P2-R6-2 的教训）。
- 终报 §7 披露的 12 行残留（24 检查）本轮**全部独立重建并逐一定级**，见 §2、§3、§4、§5；另各加边界变体探针（共 24 检查 DIFF，见 §6）；定级不采信修复方"超出本轮范围"/"parser 层"的表述——定级只看是否存在 mismatch。

## §1 R11 的 P0-A 与 P0-B — 全部关闭（已验证）

R11 定级的两项 P0 均已关闭。本轮从 R11 报告 §2.1/§3.1 原文独立重建
4 + 8 形状（未复制修复方 `cases.json`），在干净克隆内 trigger + jobs
双模式重跑，**24/24 MATCH**（含于本轮自写探针 118 检查之中，见 §8）；
修复方 R11 探针重跑 **74/74 MATCH**（修复前 50/74）；修复方新矩阵
**462/486 MATCH**，其余 24 检查均为已标注 `known_divergence` 的残留行
（见 §2、§3、§4）。

| 检查 | 结果 |
|---|---|
| R11 的 P0-A 4 形状 × trigger+jobs | **8/8 MATCH**（双边 INVALID / `yaml_parse_error`，含 `on:` 槽位变体） |
| P0-A 边界 17 形状 | **34/34 MATCH**（空格注释对照、引用/纯量内 `#`、隐式 key 位置锚点冒号、未知 tag、锚点后逗号/结尾、值位置锚点冒号、双属性链、未知 tag 无空格 `#`） |
| R11 的 P0-B 8 形状 × trigger+jobs | **16/16 MATCH**（双边 VALID，null 值多行 key 现已接受） |
| S1 目标与判别式边界 9 形状 | **18/18 MATCH**（带值多行 key 仍双边拒；冒号判别式边界全一致，见 §7） |
| R11 探针重跑（37 行） | **74/74 MATCH** |
| fix-p0-12 新矩阵（243 行 × 2） | **462/486 MATCH**（24 检查 DIFF，全部为 §2/§3/§4 的 12 个残留行） |
| fix-p0-11 矩阵重跑 | **248/248 MATCH**（16 检查仍标注 `known_divergence`，但行已全部 MATCH——标志过期，见 P2-R12-1） |
| R6 核心 5 形状（R10 §2.1 重建） | **10/10 MATCH** |
| `,`-suffix 对照 4 形状 | **8/8 MATCH**（X02、Y01、X13、X05） |

## §2 新发现 P0-C1 — `,`-suffix 族（tag 后缀吞掉 flow 逗号，Oracle 更严为主）

修复方终报 §7.3/§7.5 披露的残留。本轮独立重建并加对照，**16/16 检查 DIFF**。

### 2.1 现象

PyYAML 的 `scan_tag_uri` 把 `,` 当 URI 字符消耗进 tag 后缀，
随后 parser 在应有分隔符处遇到 `:` 而失败；`yaml` npm 包在 `,`
处停止 tag，照常解析。7 行 TS VALID vs Oracle INVALID，1 行反向。

| 例 | 输入 | TS | Oracle |
|---|---|---|---|
| R12-C1a（A60） | `m: {a: !foo, b: 1}` | **VALID** | **INVALID / yaml_parse_error** |
| R12-C1b（X04） | `m: {a: !foo, b: 1, c: 2}` | **VALID** | **INVALID** |
| R12-C1c（Y03） | `m: {a: !foo, "b": 1}` | **VALID** | **INVALID** |
| R12-C1d（Y05） | `m: {a: !foo,\n b: 1}` | **VALID** | **INVALID** |
| R12-C1e（Y08） | `m: {a: !foo, &x 1: 2}` | **VALID** | **INVALID** |
| R12-C1f（Y09） | `m: {a: !foo, 1: 2}` | **VALID** | **INVALID** |
| R12-C1g（Y10） | `m: {a: !foo, b:}` | **VALID** | **INVALID** |
| R12-C1h（X11，反向） | `a: !foo,\n  b: 1` | **INVALID / yaml_parse_error** | **VALID** |

合计 **16 处 DIFF / 118 检查**（8 形状 × trigger+jobs）。对照组全部
MATCH：X02（`,` 在后缀中部）、Y01（flow 序列内带 pair，PyYAML 接受）、
X13（`,` 前有空格，tag 先结束）、X05（flow 序列内吞掉的 `,` 无害）。

### 2.2 根因与修复方向（供 FIX-P0-13）

- 同一根因：tag 后缀扫描对 `,` 的处理不同（PyYAML 消耗，npm 停止）。
  Y03/Y05/Y08/Y09/Y10 只是被吞 `,` 之后节点的形态不同（引用、换行、
  anchor 前缀、数值、null 值），不是不同根因；X11 是同一机制的 block
  变体（后缀以 `,` 结尾，tag 带 null 节点，`b: 1` 成为下一 pair）。
- 修复方向：终报称"parser 层，需要 flow-kind 栈 + 多行 lookahead"。
  该判断关于修复难度可能是对的，但不改变定级（见 §5）。另一修复
  方向是 Oracle 侧拒以 `,` 结尾/含 `,` 的 tag 后缀（终报 §7.5 对 X11
  即如此表述）——修复位置由修复方选，定级只看 mismatch 是否存在。

## §3 新发现 P0-C2 — tag 后缀 `[`/`]` 字符集分歧（TS 更严）

修复方终报 §7.2/§7.4 披露的残留。本轮独立重建，**6/6 检查 DIFF**。

### 3.1 现象

PyYAML 的 URI 字符集含 `[`/`]`，后缀扫描消耗它们；`yaml` npm 包在
`[`/`]` 处停止 tag，随后有多余 token 而拒绝。

| 例 | 输入 | TS | Oracle |
|---|---|---|---|
| R12-C2a（A70） | `m: {a: !foo[bar] 1}` | **INVALID / yaml_parse_error** | **VALID** |
| R12-C2b（X08） | `m: [!foo] 1]` | **INVALID** | **VALID** |
| R12-C2c（X09） | `m: [!foo], 1]` | **INVALID** | **VALID** |

合计 **6 处 DIFF / 118 检查**（3 形状 × trigger+jobs）。

### 3.2 根因与修复方向（供 FIX-P0-13）

- 同一根因：tag 后缀 URI 字符集对 `[`/`]` 的处理不同。终报自述 X08/X09
  的修复与 A70 "同一修复"（Oracle 侧拒 tag 后缀含 `[`/`]`）。
- TS 侧经 npm 无法接受此类形状（npm 在 `]` 处停止 tag 后必然多余
  token），故只能 Oracle 侧修——与 P0-A 相反方向的同一类问题
  （R10 裁决先例：方向不改变定级）。

## §4 新发现 P0-C3 — A45 anchored empty key（文档根部，TS 更严）

修复方终报 §7.1 披露的残留。本轮独立重建，**2/2 检查 DIFF**。

### 4.1 现象

| 例 | 输入 | TS | Oracle |
|---|---|---|---|
| R12-C3（A45） | `&x: 1\nname: probe\non: push\njobs: …` | **INVALID / yaml_parse_error** | **VALID** |

### 4.2 解析器层最小复现（与探针驱动无关）

干净克隆内直接对解析器本身验证（完整 workflow 文档，非 bare 片段）：

- `yaml` npm 包 `YAML.parse`：**拒绝**（`Implicit keys need to be on a
  single line at line 1, column 5`）。注：bare 片段 `&x: 1` 单独解析时
  npm 接受（返回 `1`，伴随 `BAD_ALIAS` 警告）——分歧只在完整文档
  形态下出现，终报 §3.3 的说法针对完整文档是正确的。
- PyYAML `yaml.safe_load`：**接受**，给出 `{None: 1, 'name': 'probe',
  True: 'push', 'jobs': …}`（anchored empty key 被接受；`on` 在 safe_load
  下是布尔 `True`，Oracle 侧用 `_StrictBaseLoader` 保留字符串 `on`，
  但 key 的接受与否与 loader 无关）。

### 4.3 根因与修复方向（供 FIX-P0-13）

- 根因与 P0-C2 不同：不是 tag 后缀字符集，而是 npm 的隐式 key 单行
  规则 vs PyYAML 接受 anchored empty key。裸空 key `: 1` 不同——PyYAML
  的 parser 亦拒绝它，故 Oracle 拒它；只有 anchored 形式漏网。
- 修复方向：Oracle 侧拒 anchored empty key（终报 §7.1 的判断正确）。
  注意与 flow 内 `{&x: 1}` 的区别：本轮边界探针 r12-a9/r12-a10
  （`m: {&x: 1}`、`m: {&x: 1, b: 2}`）双边一致 MATCH——分歧只在
  文档根部形态，不在 flow 映射内。

## §5 定级：P0（3 项）的依据与权衡

定级 **P0（3 项：P0-C1 `,`-suffix 族、P0-C2 `[`/`]`-suffix 族、P0-C3
anchored empty key；P0-A/P0-B 已关闭，不计入）**，依据：

- PROJECT_BOOK §7.3（L513）："Oracle 与实现**任何字段不一致都判失败；
  不得通过忽略字段、容差或人工解释来放行**。"
- PROJECT_BOOK §8.2（L548）："Oracle parity | 100% | 所有受支持输入完全一致。"
- IMPLEMENTATION_PLAN §8.1（L779）："Oracle 输出规范化 JSON；差分脚本逐字段比较。
  **任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。**"
- IMPLEMENTATION_PLAN §10（L827）：P0 阻断明确包含 "**Oracle mismatch**"。
- **R7 裁决先例**：R7 的 RESID（TS INVALID vs Oracle VALID，TS 更严，同一方向）
  定为 P0——P0-C2、P0-C3 与之同方向、同形态。
- **R10 裁决先例**："方向不改变定级"——P0-C1 主体方向与 R4/R5/R6/R7 相反
  （Oracle 更严），不改变定级；P0-C1 内含一个反向行（X11）不改变族的定级，
  族按根因划分（R9 的 R4/R5 分组 P0 先例）。
- **终审 R2 的裁决先例**：把同类分歧降为 P2 的理由被终审明确驳回（R3 的教训）。
- **计数原则（R11 先例）**：按根因 + 修复位置计数，不是按终报 §7 的小节数。
  终报 §7 列出 4 个家族（(a) A45、(b) A70、(c) `,`-suffix 族、(d) `]`-suffix
  反向 + X11），本轮合并为 3 项 P0：(b) 与 (d) 的 X08/X09 根因相同
  （tag 后缀 URI 字符集 `[`/`]`）、修复相同（Oracle 侧拒 `[`/`]` 后缀），
  计为一项 P0-C2；(d) 的 X11 是 (c) 的 block 变体（终报自述），计入 P0-C1。
  检查总数不变：24 检查全部为 P0；无论按 3 项还是 4 项计，P0 检查数相同，
  合并只影响项数表述，不影响阻断性。

**已权衡的反方考虑（记录在案，不改变定级）：**
- (a) 输入形状退化（真实 workflow 里几乎不会写 `!foo,` 或 `&x: 1`）。
  但"真实 workflow 几乎不会出现"正是 §7.3 明文禁止的"人工解释"放行理由；
  R2 P0 的输入（重复键）与 R6 P0 的输入（flow 映射内缩进 0 注释行）同样退化，
  仍被定为 P0。且 P0-C1 触及核心输入槽位（flow 映射值位置，`m:`/`on:` 均可触发）。
- (b) 从 YAML 规范看，PyYAML 对 `!foo,` 的拒绝与 `yaml` 包的接受孰更合规范，
  以及 anchored empty key 的语义，都不改变定级：本项目的验收标尺不是 YAML
  规范，而是 §7.3 的"Oracle 与实现完全一致"（与 R8 对 R3、R9 对 R4/R5、
  R10 对 R6、R11 对 P0-A/P0-B 的权衡 (b) 同理）。
- (c) P0-C1 的修复需要 parser 层工作（flow-kind 栈 + 多行 lookahead），
  P0-C2/P0-C3 需要 Oracle 侧新规则。修复难度与修复位置不影响定级；
  定级只看是否存在 mismatch（与 R8–R11 的权衡 (e) 同理）。
- (d) 修复方已如实披露 12 行残留、未 silent 扩大范围。披露诚实不改变定级：
  定级只看提交代码是否存在 mismatch（与 R8 对 R3 的权衡 (c) 同理）。
- (e) P0-C1 的 8 行中 7 行与 1 行方向相反（X11）。方向混合不改变族的定级：
  族按根因划分；R10 先例已确立方向不改变定级；X11 的根因与 A60 相同
  （终报 §7.5 自述为"`,`-suffix 族的 block 变体"）。

## §6 解析器层最小复现（与探针驱动无关）

干净克隆内直接对解析器本身验证（完整 workflow 文档形态；bare 片段见注）：

| 形状 | `yaml` npm 包 | PyYAML `safe_load` | 端到端（探针） |
|---|---|---|---|
| A45 完整文档 `&x: 1\nname: probe…` | REJECT（implicit-key-single-line） | ACCEPT `{None: 1, …}` | TS INVALID vs Oracle VALID |
| A70 `m: {a: !foo[bar] 1}` | REJECT（tag/anchor 须空白分隔） | REJECT（无 constructor `!foo[bar]`）* | TS INVALID vs Oracle VALID |
| A60 `m: {a: !foo, b: 1}` | ACCEPT `{m:{a:"",b:1}}` | REJECT（while parsing a flow mapping） | TS VALID vs Oracle INVALID |
| X08 `m: [!foo] 1]` | REJECT（unexpected scalar） | REJECT（无 constructor `!foo]`）* | TS INVALID vs Oracle VALID |
| X11 `a: !foo,\n  b: 1` | REJECT（nested mappings） | REJECT（无 constructor `!foo,`）* | TS INVALID vs Oracle VALID |

\* 注（终报 T1 的要点，本轮已验证）：`safe_load` 对 A70/X08/X09/X11 的
REJECT 是 constructor 层（未知 tag 无 constructor），不是 scanner 层；
Oracle 用 `_StrictBaseLoader`，对未知 tag 回退到 scalar/sequence/mapping
constructor，**接受**这些形状——故端到端 Oracle 为 VALID。`safe_load`
的结果对 constructor 层问题是错的，端到端结果为准。A60 的 `safe_load`
REJECT 是 parser 层（flow mapping），与 Oracle 行为一致。

分歧在解析器层，与探针脚手架无关；三族的触发条件各不相同（逗号消耗、
方括号字符集、隐式 key 单行），故计为 3 项 P0。

## §7 S1 收窄验证（P0-B 修复无回归）

`hasMultilineFlowKey` S1 收窄后的判别式（`colonSeparatorAfter`）本轮用
9 个独立形状逐项验证，**18/18 MATCH**：

| 形状 | 预期 | 结果 |
|---|---|---|
| `m: {a\n b: 1}`（带值） | 双边拒 | MATCH（双边 INVALID） |
| `m: {a: 1, b\n c: 2}`（带值，pair 后） | 双边拒 | MATCH |
| `m: {a\n b:}`（有冒号、null 值） | 双边拒（PyYAML 拒） | MATCH |
| `m: {"a\n b":}`（引用 key、有冒号、null 值） | 双边拒 | MATCH |
| `m: {a\n b:\n}`（冒号后换行） | 双边拒 | MATCH |
| `m: {a\n b # c\n, d: 1}`（B41，注释+逗号） | 双边拒（不同规则） | MATCH |
| `m: {a\n b: 1, c: 2}`（带值+后续 pair） | 双边拒 | MATCH |
| `m: {a\n b # note\n: 1}`（冒号在注释后行） | 双边拒 | MATCH |
| `m: {a\n b, c\n d: 1}`（null + 带值混合） | 双边拒（整体） | MATCH |

S1 的原定目标（带值多行 key）完整保留；null 值 key 不再触发。另：
`hasRejectedAnchorOrTag` 接线两处 gate 均已核对
（`parseWorkflowYaml` workflow-parser.ts L1401–1406；
`extractJobs` e2e.ts L275–280，import L77–79）。

## §8 全量重跑（干净克隆 `~/workspace/p020-review-r12`，HEAD `309b2ee`，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，exit 0） |
| `npm test` | **1507/1507 通过**（45 test files；基线 1469 + 新增 38） |
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
`gate_report_sha256` 为 `1e7f7ffa5798d73e67cd540d75aa0e39c11faef9417e0ec82ec35ca88e6f5c81`，
与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是
`environment_fingerprint`**（克隆路径不同导致；其余字段全部一致，含
`input_fixture_sha256`、`conditions` 全 true、determinism 100/1、unsupported
2/2）。这不是回归（与 R4–R11 同一现象，不同克隆路径不同指纹）。重跑后已
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
| fix-p0-11 | **248/248 MATCH**（16 检查仍标注 `known_divergence`，但行已全部 MATCH——标志过期，见 P2-R12-1） |
| fix-p0-12 | **462/486 MATCH**（24 检查 DIFF，全部为 §2/§3/§4 的 12 个已标注 `known_divergence` 残留行；runner exit 0） |
| R10 探针 | **88/88 MATCH** |
| R11 探针 | **74/74 MATCH** |

**R12 独立探针（自写，`evidence/probes/r12/r12-probe.py`，59 例 ×2 模式 =
118 检查；P0-A 形状自 R11 报告 §2.1 原文重建，P0-B 形状自 R11 报告 §3.1
原文重建，残留形状自 FIX-P0-12 报告 §7 原文重建，未复制修复方
`cases.json`）：**

| 组 | 结果 |
|---|---|
| P0-A 4 形状（§1） | 4 例 ×2 模式 **8/8 MATCH** |
| P0-A 边界 17 形状 | 17 例 ×2 模式 **34/34 MATCH** |
| P0-B 8 形状（§1） | 8 例 ×2 模式 **16/16 MATCH** |
| S1 目标与判别式边界 9 形状（§7） | 9 例 ×2 模式 **18/18 MATCH** |
| 残留 12 形状（§2/§3/§4） | 12 例 ×2 模式 **0/24 MATCH**（24 处 DIFF） |
| `,`-suffix 对照 4 形状 | 4 例 ×2 模式 **8/8 MATCH** |
| R6 5 形状（§1） | 5 例 ×2 模式 **10/10 MATCH** |

探针合计 1,856 检查（九矩阵 1,706 + R10 探针 88 + R11 探针 74 +
R12 独立探针 118；九矩阵 = fix-p0-04 100 + fix-p0-05 76 + fix-p0-06 134
+ fix-p0-07 86 + fix-p0-08 164 + fix-p0-09 98 + fix-p0-10 314 +
fix-p0-11 248 + fix-p0-12 486；注：各矩阵与探针有形状重叠，合计为
检查次数非去重形状数），DIFF 48 处（fix-p0-12 矩阵 24 + R12 独立探针
24，全部为 §2/§3/§4 同一三族根因；两处 24 为同形重叠）。

## §9 试冻三哈希（干净克隆，`--trial`，两次）

两次 `npm run release:freeze -- --trial`（HEAD `309b2ee`）哈希完全一致，
确定性成立；source/dist 与修复方试冻值逐字节一致，**manifest 与修复方
值不一致（见下）**：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `267ba9026d198b07a100173fedc6d613b8d5e677c1a648a51f544f90f6c3ce3a`（2,242 文件） | 与修复方值一致；与 R2 的 `3a778b93…` 相比已变（`src/` 改动，属预期） |
| dist.zip | `16af8080f81bcee4560055fba99801538a0e03329b197323d7e19e8e69ca453f`（114 文件） | 与修复方值一致；与 FIX-P0-11 时的 `57dc0f8d…` 相比已变（`src/` 改动，属预期——dist 为纯 TS 发行物） |
| RELEASE_MANIFEST.json | `933f7e8b8f9a9a6b601f5c8a649b894f59e4391b7d1ad515f8a8692489916bb1` | **与修复方报告值 `5e44f660…` 不一致**，见下 |

`sha256sum -c` 3/3 OK。试冻后已 `git checkout release/`，克隆内 `release/`
恢复为 HEAD 正式件（source.zip `3a778b93…`、dist.zip `da130ad2…`，已核对）。

**Manifest 哈希不一致的调查（终报文案订正，见 §12）：** 本轮两次试冻的
manifest 哈希均为 `933f7e8b…`（确定性成立）。逐项核对 manifest 内容：
`inputs` 全部引用 HEAD 文件且哈希与实测一致（S0_GATE `e651ce73…`、
ORACLE_PARITY_REPORT `db20127f…`、R1/R2/R3 复核报告哈希均与 HEAD 一致）；
`artifacts` 的 source/dist 哈希与修复方一致；`toolchain`
（node v24.22.1、npm 10.9.4、python 3.12.3、pyyaml 6.0.1）与本机环境一致；
`freeze_history`、`known_limitations`、`freezer.sha256` 均为 HEAD 派生；
manifest 内无时间戳、无绝对路径、无环境指纹（冻结脚本自述亦如此）。
冻结脚本的 manifest 输入全部经 `git cat-file` 读 HEAD（`meta =
read_head_files(...)`），故同一 HEAD 下 manifest 应跨环境一致——修复方
报告的 `5e44f660…` 在本轮无法复现，最可能为终报文案转录/状态差
（例如一次试冻在最终提交前、另一次在后，仅 manifest 数被混记）。
此为试冻产物的**报告数字订正**，不是产品缺陷：manifest 是试冻产物，
T014 正式重冻时会重新生成；不计入 P0/P1/P2（见 §12）。

## §10 P2 清单：终审 R2 的 6 个 + R6 的 2 个 + 本轮新增 1 个 = 9 个，全部非阻断

| P2 | 复核（309b2ee） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。`git diff e0d7a01..309b2ee -- scripts/deterministic-zip.py` 为空，冻结脚本未动，仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§9） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。README 仍为 "P95 768.3 ms, peak RSS 98.3 MiB"，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 仍有 `NOT_TESTED` 标记，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。试冻 manifest 的 freeze_commit 字段为 TRIAL 说明；正式冻结时 T014 报告 §9 补实际 commit（同 R2 模式） |
| **P2-R6-1：manifest 的 `inputs` 只记录 t013 复核到 R3** | 仍成立，且范围扩大到 R12。本轮试冻 manifest 的 `inputs` 键仍为 golden_suite_sha256、oracle_parity_report、s0_gate、s0_input_fixture_sha256、t013_review_r1/r2/r3——R4–R12 九轮复核均未记录。T014 重冻时须把 R4–R12 一并记入，非阻断 |
| **P2-R6-2：复核探针证据未入仓库** | 部分缓解，仍成立。R7/R8 自写探针只在 `/tmp` 与报告中（VM 重启 #42 已清空 `/tmp`，只能按报告文本重建）；R9/R10/R11/R12 自写探针已随报告提交入仓库（`evidence/probes/r9/`、`r10/`、`r11/`、`r12/`），故"后续复核探针入仓"的要求自 R9 起已满足。非阻断 |
| **P2-R12-1（本轮新增）：fix-p0-11 矩阵的 8 个 `known_divergence` 标志过期未清** | `evidence/probes/fix-p0-11/cases.json` 中 8 行（`res-anchor-nospace`、`res-tag-nospace`、`res-null-ml-plain/quoted/hash/plain-comma/plain-nested`、`inl-key-comma-nospace`）仍标 `known_divergence: true`，但重跑后 `results.json` 显示 248/248 全 MATCH、0 非 MATCH 行——与 P2-R10-1 同类问题（该 P2 修复的是旧矩阵标志，本轮是 fix-p0-11 矩阵的同类遗留）。标志本身不影响判定（runner 按实际结果计分），属证据卫生问题，非阻断。修复方应在下一轮清零（`cases.json` 逐个置 `false` + 同步 README 注记）。 |

**P2-R10-1（已解决，不再列入未决清单）：** 14 个过期标志本轮复核仍为
`false`（fix-p0-04 至 fix-p0-10 的 `cases.json`），对应矩阵重跑 0 flagged。
已清除，状态不变。

**P2-R10-2（已解决，不再列入未决清单）：** `evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`
记录的 `suite_sha256` 为 `36c3853d8a803ccbfe04ce1be7b85ba1eeab5bec9b88b91c970f3d06cbf62574`，
与同一提交的 `tests/fixtures/trigger/suite.json` 实测哈希逐字节一致，
fixture_count 128 / passed 128 / 0 mismatch。已修复，状态不变。

## §11 违规捷径检查：无

- `oracle/` diff（`e0d7a01..309b2ee`）= 空（0 改动）；`src/` diff = 仅
  `src/core/workflow-parser.ts`（+548/−3，S1 收窄 + `hasRejectedAnchorOrTag`）
  与 `src/core/e2e.ts`（+6，gate 接线）。
- 删测试 0（`git diff --diff-filter=D` 为空）；测试/夹具 diff 中无 `skip`/`only` 弱化。
- 无 mismatch 忽略名单（`deepDiff` 未动）；无输入文本手术；无解析器更换。
- 修复方终报数字除 manifest 哈希外全部复核一致（§8、§9）；终报文案订正见 §12。
- 试冻 manifest 的 `inputs` 仍只记录到 R3，见 P2-R6-1（T014 重冻时处理）。
- 新增测试 38 个（anchor-tag 24 形状 + 1 schema 断言 + null-value 12 形状 +
  1 schema 断言），与终报口径一致；新增夹具 36 件（24 + 12）与终报一致。

## §12 未审查事项与报告瑕疵记录

- 未审查：`0b05173` 终报提交本身（只含终报文本，无代码）；终报 §2 过程记录中的六轮测绘细节未逐项复跑——本轮以端到端探针（§8）与解析器层测绘（§6）独立验证结论。
- 未审查：Drive 归档状态与终审对话（不在 T013 复核范围内）。
- **终报文案订正 1（数字无法复现，不计入定级）：** 终报 §4 的试冻 manifest
  哈希 `5e44f660…` 本轮两次试冻均为 `933f7e8b…`（调查见 §9）。source.zip 与
  dist.zip 的试冻值均与终报逐字节一致，故冻结树本身无问题；仅 manifest
  哈希数字存疑。建议 FIX-P0-13 在终报中以本轮实测值 `933f7e8b…` 为准，
  或说明其试冻环境差异。
- **终报文案订正 2（本轮新增 P2，见 P2-R12-1）：** fix-p0-11 矩阵的 8 个
  `known_divergence` 标志在残留行变为 MATCH 后未清零（终报 §4 称
  "248/248（其中 16 检查为已标注 known-divergence——8 个先前残留行全部
  变为 MATCH）"——表述本身属实，但标志未同步清除，与 P2-R10-1 的修复
  标准不一致）。
- 本报告瑕疵：R12 自写探针的 R6 形状系按 R10 报告文字重建，未逐字复核
  R10 原始用例原文；结论（全部 MATCH）仅针对重建形状。`r12-r6-3` 使用了
  不支持事件 `pull`，Oracle 侧为 UNKNOWN 而非 VALID——该形状的 MATCH 仍
  成立（双边 INVALID，错误码一致），且另有 `pull_request` 的干净形状
  `r12-r6-2` 佐证同一结论。
- 本轮未发现 P0-C1/C2/C3 之外的其他分歧：测绘范围外的形状（如 verbatim tag
  内含 `,`/`]`、anchor 后 `%`/`@` 位于 block 层）未穷尽，留待后续轮次；
  但 §6 的解析器层测绘已覆盖三族触发条件的各维度。

## §13 亲自跑过的命令与结果（摘要）

全部在干净克隆 `~/workspace/p020-review-r12`（HEAD `309b2ee`）内运行；`npm ci` 后执行。

| # | 命令 | 结果 |
|---|---|---|
| 1 | `git clone ~/workspace/p020-checkpath ~/workspace/p020-review-r12 && git checkout 309b2ee` | 顶为 `309b2ee`，工作树干净（仅 r12/ 未跟踪） |
| 2 | `npm ci --no-audit --no-fund` | 181 packages，exit 0 |
| 3 | `npm test` | 1507/1507（45 files） |
| 4 | `npm run test:oracle` | 167 夹具，0 mismatch，0 false PASS，34/34 UNKNOWN |
| 5 | `npm run oracle:diff:trigger` / `jobs` / `checks` / `witness` | 128 / 48 / 46 / 44，全部 0 mismatch |
| 6 | `npm run typecheck` | PASS，exit 0 |
| 7 | `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| 8 | `python3 scripts/build-golden.py --check-only` | 167 cases，exit 0 |
| 9 | `npm run s0:gate` | PASS；24/24；唯一差异 environment_fingerprint（§8） |
| 10 | `npm run release:verify` | PASS |
| 11 | `python3 evidence/probes/r11/r11-probe.py` | 74/74 MATCH |
| 12 | `python3 evidence/probes/fix-p0-12/run-matrix.py` | 462/486 MATCH（24 DIFF 全 flagged，见 §2/§3/§4） |
| 13 | `python3 evidence/probes/fix-p0-04/run-matrix.py` | 100/100 MATCH（R5 子集 66/66） |
| 14 | `python3 evidence/probes/fix-p0-05/run-matrix.py` | 76/76 MATCH |
| 15 | `python3 evidence/probes/fix-p0-06/run-matrix.py` | 134/134 MATCH |
| 16 | `python3 evidence/probes/fix-p0-07/run-matrix.py` | 86/86 MATCH |
| 17 | `python3 evidence/probes/fix-p0-08/run-matrix.py` | 164/164 MATCH |
| 18 | `python3 evidence/probes/fix-p0-09/run-matrix.py` | 98/98 MATCH |
| 19 | `python3 evidence/probes/fix-p0-10/run-matrix.py` | 314/314 MATCH |
| 20 | `python3 evidence/probes/fix-p0-11/run-matrix.py` | 248/248 MATCH（16 检查 flagged，行全 MATCH） |
| 21 | `python3 evidence/probes/r10/r10-probe.py` | 88/88 MATCH |
| 22 | `python3 evidence/probes/r12/r12-probe.py` | 94/118 MATCH（24 处 DIFF，全部 §2/§3/§4 三族） |
| 23 | `node YAML.parse` × 5 形状 + PyYAML `safe_load` × 5 形状 | 见 §6 |
| 24 | `npm run release:freeze -- --trial` × 2 | 三哈希两次一致；`sha256sum -c` 3/3 OK；manifest 与终报值不一致（§9） |
| 25 | `git diff e0d7a01..309b2ee --stat` / `-- oracle/` / `-- src/` / `--diff-filter=D` | 52 文件 +9237/−707；oracle/ 0；src/ 仅 2 文件；删文件 0 |
| 26 | fix-p0-11 `cases.json` 8 标志核对 + T006 报告哈希核对 | 标志仍 true（P2-R12-1）；T006 哈希一致（§10） |

## §14 给 parent 的下一步

1. **定点修复 §2 的 P0-C1、§3 的 P0-C2、§4 的 P0-C3**：
   - P0-C1：tag 后缀 `,` 消耗问题——TS 侧 parser 层规则（flow-kind 栈 +
     多行 lookahead，终报 §7.3 的判断）或 Oracle 侧拒以 `,` 结尾/含 `,`
     的 tag 后缀（终报 §7.5 对 X11 的方向）；X11 的反向行（TS 已拒、
     Oracle 接受）只能 Oracle 侧修。修复后须重跑 Y01/Y02/X02/X05/X06/X13
     对照（不得误拒）与本轮 r12-c1–c4。
   - P0-C2：Oracle 侧拒 tag 后缀含 `[`/`]`（与 A70 同一修复，终报 §7.2/§7.4）。
     TS 侧经 npm 无法接受，无 TS-side 规则能关闭。
   - P0-C3：Oracle 侧拒 anchored empty key（终报 §7.1）。注意与 flow 内
     `{&x: 1}` 的区别（后者双边一致，不得误拒）。
   - 另清 P2-R12-1：fix-p0-11 `cases.json` 的 8 个过期标志置 `false`。
   然后派**新的独立复核 R13**（审查对象为修复后 HEAD；复核员一律在干净克隆里验证，
   不得与修复并行同一工作树；R13 须重跑本报告 §2 的 P0-C1 8 形状 +
   §3 的 P0-C2 3 形状 + §4 的 P0-C3 1 形状 + 九矩阵 + R5 66 例 +
   本轮 59 行矩阵 + 终报 manifest 哈希复核）。
2. R13 PASS 后：T014 正式重新冻结（manifest `inputs` 须记入 R4–R12，见 P2-R6-1）
   → Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3
   （同一立项对话，GPT-6 + Extra High + 完整结尾句）。
3. 终审轮次已用 2/5；R13 仍在同一立项对话内复核，不占用终审轮次。
