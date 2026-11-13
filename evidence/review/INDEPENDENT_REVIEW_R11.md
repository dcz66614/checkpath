# T013 独立复核 R11 — FIX-P0-11（R10 R6）复核报告

- **审查对象**：代码提交 `479810e`（FIX-P0-11：Oracle 拒 flow 映射内缩进 0 的独立注释行；相对 `cf58f62`，23 文件，+4333/−140）。终报提交 `a104fe0` 只含终报文本，不在代码审查范围内。
- **复核员**：T013 独立复核员（全新会话，与 FIX-P0-11 修复方、R10 复核员均隔离；未共享上下文）。
- **复核环境**：干净克隆 `~/workspace/p020-review-r11/`（`git clone ~/workspace/p020-checkpath` 后 `git checkout 479810e`），`git status` 干净（仅复核探针 `evidence/probes/r11/` 未跟踪），`git log --oneline -2` 顶为 `479810e`。全部命令均在该克隆内亲自跑；未与任何修复并行同一工作树（R4 污染教训）。本轮复核中 VM 重启一次（#44，~10:38 GMT），一次 `npm run s0:gate` 中途被打断后按原命令完整重跑；其余结果均在重启后重新验证。
- **结论：NOT PASS — P0 2 / P1 0 / P2 8。**

## §0 审查对象与无污染声明（先读）

- 本轮只审查 `479810e` 的代码。`a104fe0` 的终报文本仅作背景阅读；报告中所有数字均由本轮亲自重跑得出，未采信终报数字。
- 复核探针全部在干净克隆内运行；探针证据（`evidence/probes/r11/`：`cases.json` 37 行、`r11-probe.py`、`results.json`、README）随本报告一并提交入仓库，不只留 `/tmp`（P2-R6-2 的教训）。
- 终报 §7 披露的 8 行残留（16 检查）本轮**全部独立重建并逐一定级**，见 §2、§3、§4；另各加边界变体探针（共 24 检查 DIFF），定级不采信修复方"超出本轮范围"的表述——定级只看是否存在 mismatch。

## §1 R10 的 R6 P0 — 全部关闭（已验证）

R10 定级的 P0（R6：flow 映射内缩进 0 的独立注释行）已关闭。本轮从 R10 报告 §2.1 原文独立重建 5 形状（未复制修复方 `cases.json`），在干净克隆内 trigger + jobs 双模式重跑，**10/10 MATCH**（含于本轮自写探针 74 检查之中，见 §6）；修复方 R10 探针重跑 **88/88 MATCH**（修复前 78/88）；修复方新矩阵 **232/248 MATCH**，其余 16 检查均为已标注 `known_divergence` 的残留行（见 §2、§3）。

| 检查 | 结果 |
|---|---|
| R10 的 5 形状 × trigger+jobs | **10/10 MATCH**（双边 INVALID / `yaml_parse_error`） |
| R10 探针重跑（44 行） | **88/88 MATCH** |
| fix-p0-11 新矩阵（124 行 × 2） | **232/248 MATCH**（16 检查 DIFF，全部为 §2/§3 的 8 个残留行） |
| R6 边界 10 形状（§6 边界组） | **20/20 MATCH**（注释缩进 ≥1、逗号后、裸键后、flow 序列内、行内注释、空行断链、嵌套 flow 映射、flow 序列嵌套、双注释行、`on:` 逗号 0） |
| FlowEndToken 豁免收窄 6 形状 | **12/12 MATCH**（见 §5） |

## §2 新发现 P0-A — 锚点/标签后无空格注释（`&x#c` / `!!str#c`，Oracle 更严）

修复方终报 §7 第 1 项披露的残留。本轮独立重建并加边界变体，**8/8 检查 DIFF**。

### 2.1 现象

`yaml` npm 包接受锚点/标签后紧跟 `#`（无空格）的写法，PyYAML 的扫描器拒绝。方向与 R4/R5/R6/R7 **相反**——Oracle 侧更严；TS 侧 `parse()` 本身接受，AST 规则到不了门，故只能 TS 侧修（FIX-P0-06 风格：拒掉 PyYAML 拒的东西）。

| 例 | 输入 | TS | Oracle |
|---|---|---|---|
| R11-A1（本轮新增） | `m: {a: &x#c\n 1}` | **VALID**，events `[push]`，jobs `[test]` | **INVALID / yaml_parse_error**，events `[]`，jobs `[]` |
| R11-A2（本轮新增） | `m: {a: !!str#c\n 1}` | **VALID** | **INVALID / yaml_parse_error** |
| R11-A3（本轮新增） | `on: {push: &x#c\n pull_request}` | **INVALID / event_config_not_mapping**（YAML 解析通过，事件配置失败） | **INVALID / yaml_parse_error** |
| R11-A4（本轮新增） | `m: [&x#c\n 1]`（flow 序列内） | **VALID** | **INVALID / yaml_parse_error** |

合计 **8 处 DIFF / 74 检查**（4 形状 × trigger+jobs）。R11-A3 是双边 INVALID 但错误码与 jobs 不同——按 R3-ON 裁决先例仍属 P0（见 §4）。对照组全部 MATCH：`&x #c` / `!!str #c`（空格后注释）双边接受。

### 2.2 解析器层最小复现（与探针驱动无关）

干净克隆内直接对解析器本身验证：

- `yaml` npm 包 `YAML.parse`：**接受** `m: {a: &x#c\n 1}`、`m: {a: !!str#c\n 1}`、`m: [&x#c\n 1}`（`!!str#c` 伴随 `TAG_RESOLVE_FAILED` 警告：未解析标签 `tag:yaml.org,2002:str#c`，但仍接受）；接受空格对照 `m: {a: &x #c\n 1}`。
- PyYAML `yaml.safe_load`：**拒绝**上述 3 形状（`while scanning an anchor` / `while scanning a tag`）；接受空格对照。

分歧在解析器层，与探针脚手架无关。族不限于 flow 映射（flow 序列内同样分歧）。

### 2.3 修复方向与约束（供 FIX-P0-12）

- 只能 TS 侧修：`parse()` 本身接受，Oracle 侧无法"接受"一个 PyYAML 扫描器拒绝的输入（禁 input surgery、禁换 parser）。
- 修复样式：FIX-P0-06 的 `hasUnrepresentableKey` / `hasRejectedTab` 同款——TS 侧 AST/文本规则，拒掉 PyYAML 拒的形状，报错 `yaml_parse_error`。
- 须小心不误拒：锚点/标签后有空格的注释（`&x #c`）、引号/plain 标量内的 `#`（`"x#y"`、`x#y` 是标量内容）、`:` / `?` 后无空格的 `#`（`a:#c` 根本不是注释，是 plain 标量 key 的一部分——见 §3 的 `res-null-ml-hash`）。

## §3 新发现 P0-B — FIX-P0-09 S1 过度拒（null 值多行 key，TS 侧规则本身偏离）

修复方终报 §7 第 2 项披露的残留。本轮独立重建并加边界变体，**16/16 检查 DIFF**。

### 3.1 现象

flow 映射内 null 值多行 key（key 跨行、无 `:` 分隔符、无值）：**两个底层解析器都接受**，但 TS 侧 `hasMultilineFlowKey` S1 规则拒绝。TS INVALID vs Oracle VALID，方向与 R7 RESID 相同（TS 更严）。

| 例 | 输入 | TS | Oracle |
|---|---|---|---|
| R11-B1 | `m: {a\n b}` | **INVALID / yaml_parse_error**，events `[]`，jobs `[]` | **VALID**，events `[push]`，jobs `[test]` |
| R11-B2 | `m: {"a\n b"}` | **INVALID** | **VALID** |
| R11-B3 | `m: {a:#c\n 1}`（`#` 在 plain 标量 key 内，不是注释） | **INVALID** | **VALID** |
| R11-B4 | `m: {a\n b, c: 1}` | **INVALID** | **VALID** |
| R11-B5 | `m: {n: {a\n b}}` | **INVALID** | **VALID** |
| R11-B6 | `m: {a: 1, b:#c\n 2}` | **INVALID** | **VALID** |
| R11-B7（本轮新增） | `m: {a: 1, b\n c}`（完整对之后的 null 值多行 key） | **INVALID** | **VALID** |
| R11-B8（本轮新增） | `m: {'a\n b'}`（单引号） | **INVALID** | **VALID** |

合计 **16 处 DIFF / 74 检查**（8 形状 × trigger+jobs）。对照组全部 MATCH：带值的多行 key（`m: {a\n b: 1}`、`m: {a: 1, b\n c: 2}`）双边 INVALID——S1 的原定目标本身无分歧（见 §3.3）。

### 3.2 解析器层最小复现与根因定位

干净克隆内直接对解析器本身验证：

- `yaml` npm 包 `YAML.parse`：**接受全部 10 形状**（6 个 null 值形状 + 2 个带值形状 + 2 个边界变体）。
- PyYAML `yaml.safe_load`：**接受全部 6 个 null 值形状**；**拒绝 2 个带值形状**（`m: {a\n b: 1}`、`m: {a: 1, b\n c: 2}`，均为 `while parsing a flow mapping`）。

根因在 TS 侧规则本身（`src/core/workflow-parser.ts` `hasMultilineFlowKey`，FIX-P0-09 引入），不是解析器分歧：

- S1 的触发条件（`walk`，约 L423–442）：flow 映射内 key 标量（PLAIN/QUOTE_DOUBLE/QUOTE_SINGLE）**源码跨越换行**，或 `:` 分隔符在更后行——即对**任何**跨行 key 都触发。
- 但 S1 文档注释（约 L260–280）记载的实证基础只有**带 `:` 与值的 key**：`{"a\n b": 1}`、`{'a\n b': 1}`、`{a\n b: 1}`——"PyYAML rejects a multi-line key in a flow mapping"。该陈述作为全称是假的：PyYAML 只拒绝带分隔符/值的多行 key，接受 null 值多行 key。本轮解析器层测绘证明了这一点。
- 因此 S1 的触发面宽于其实证基础：null 值 key（无 `:`、无值）被误拒。修复方向是收窄 S1 至带 `:` 分隔符/值的 key——需 `src/` 改动（修复方终报 §7 的判断正确）。
- 修复方"有意不用 Oracle 侧拒来掩盖"的决定**正确**：Oracle 不应为迎合一个本身过宽的 TS 侧规则，去拒绝 PyYAML 接受的有效 YAML。那会把一个 TS 侧规则 bug 伪装成 Oracle 侧行为，违反 §7.3 的 Oracle 独立性。

### 3.3 边界已钉牢：S1 原定目标无分歧

带值的多行 key 双边 INVALID（`m: {a\n b: 1}`：TS 由 S1 拒、Oracle 由 PyYAML 扫描器拒，错误码同为 `yaml_parse_error`，jobs 同为空），故收窄 S1 时必须保留对带值多行 key 的拒绝，否则会把已关闭的 R3 重新打开。收窄的判定条件只能是"key 有 `:` 分隔符（及值）"，不能是"key 跨行"本身。

## §4 定级：P0（2 项）的依据与权衡

定级 **P0（2 项：P0-A 与 P0-B；R6 已关闭，不计入）**，依据：

- PROJECT_BOOK §7.3（L513）："Oracle 与实现**任何字段不一致都判失败；不得通过忽略字段、容差或人工解释来放行**。"
- PROJECT_BOOK §8.2（L548）："Oracle parity | 100% | 所有受支持输入完全一致。"
- IMPLEMENTATION_PLAN §8.1（L779）："Oracle 输出规范化 JSON；差分脚本逐字段比较。**任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。**"
- IMPLEMENTATION_PLAN §10（L827）：P0 阻断明确包含 "**Oracle mismatch**"。
- **R7 裁决先例**：R7 的 RESID（TS INVALID vs Oracle VALID，TS 更严，同一方向）定为 P0——P0-B 与之同方向、同形态。
- **R3-ON 裁决先例**：双边 INVALID 但错误码与 jobs 不同已定 P0——P0-A 的 `on:` 槽位变体（R11-A3）即属此类。
- **R10 裁决先例**："方向不改变定级"——P0-A 的方向与 R4/R5/R6/R7 相反（Oracle 更严），不改变定级。
- **终审 R2 的裁决先例**：把同类分歧降为 P2 的理由被终审明确驳回（R3 的教训）。
- **两项分开计数**：P0-A 与 P0-B 根因不同（解析器层接受/拒绝方向相反；修复位置不同：P0-A 需新增 TS 侧锚点/标签规则，P0-B 需收窄 TS 侧 S1），不是同一规则族，故计为 2 项 P0，而非 R9 的 R4/R5 式分组 P0。

**已权衡的反方考虑（记录在案，不改变定级）：**
- (a) 输入形状退化（真实 workflow 里几乎不会写 `&x#c` 或跨行 null 值 key）。但"真实 workflow 几乎不会出现"正是 §7.3 明文禁止的"人工解释"放行理由；R2 P0 的输入（重复键）与 R6 P0 的输入（flow 映射内缩进 0 注释行）同样退化，仍被定为 P0。且 P0-A3 证明分歧触及核心输入槽位（`on:`）。
- (b) 从 YAML 规范看，PyYAML 对 `&x#c` 的拒绝与 `yaml` 包的接受孰更合规范、以及 null 值多行 key 的语义，都不改变定级：本项目的验收标尺不是 YAML 规范，而是 §7.3 的"Oracle 与实现完全一致"（与 R8 对 R3、R9 对 R4/R5、R10 对 R6 的权衡 (b) 同理）。
- (c) P0-B 的偏离方是 TS 侧规则而非 Oracle——"Oracle mismatch"是否还成立？成立。§7.3 比较的是"Oracle 与实现"两边的输出，实现包含 `hasMultilineFlowKey` 在内的全部 TS 侧规则；R7 RESID 同为 TS 更严且定为 P0。偏离发生在哪个组件不改变"输出不一致"这一事实，也不改变 §10 的 P0 定性。
- (d) 修复方已如实披露两处残留、未 silent 扩大范围，且 P0-B 不用 Oracle 掩盖的决定正确。披露诚实不改变定级：定级只看提交代码是否存在 mismatch（与 R8 对 R3 的权衡 (c) 同理）。
- (e) 两处残留的修复都在 TS 侧（`src/` 改动），与 FIX-P0-11 的 Oracle-only 范围不同。修复位置与修复难度不影响定级；定级只看是否存在 mismatch。
- (f) 分歧面窄（P0-A：锚点/标签后无空格紧跟 `#`；P0-B：仅 null 值多行 key，带值者已一致），修复方向明确（P0-A 新增 TS 侧规则；P0-B 收窄 S1 至带 `:` 的 key），不是死胡同。

## §5 FlowEndToken 豁免收窄验证（FIX-P0-10 豁免过宽的修复）

修复方收窄后的豁免条件（flow-end token 仅当同时满足：关闭最外层 flow、是该行第一个 token、行缩进 == 最内层 block 缩进）本轮用 6 个独立形状逐项验证，**12/12 MATCH**，无过度拒、无漏拒：

| 形状 | 预期 | 结果 |
|---|---|---|
| 内层闭合缩进 0（`m: {n: {a: 1\n}\n, b: 2}`，flowLevel 2） | 双边拒 | MATCH（双边 INVALID） |
| 外层闭合低于 block 缩进（`x:\n m: {a: 1\n}`，闭合 0 < block 2） | 双边拒 | MATCH（双边 INVALID） |
| 外层闭合 == block 缩进（`x:\n m: {a: 1\n  }`，闭合 2 == block 2，行首 token） | 豁免，双边接受 | MATCH（双边 VALID） |
| 闭合行内后跟内容（`m: {a: 1\n}, b: 2}`） | FIX-P0-10 逗号检查拒 | MATCH（双边 INVALID） |
| 内层闭合缩进 1（`m: {n: {a: 1\n }\n, b: 2}`） | 双边拒 | MATCH（双边 INVALID） |
| 闭合行首 token 后跟内容（`m: {a: 1\n  } , b: 2}`） | 双边拒 | MATCH（双边 INVALID） |

## §6 全量重跑（干净克隆 `~/workspace/p020-review-r11`，HEAD `479810e`，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，exit 0） |
| `npm test` | **1469/1469 通过**（43 test files） |
| `npm run test:oracle` | 167/167，0 偏差，0 false PASS；unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 128 夹具，0 mismatch |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch |
| `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；oracle 24/24，100 次运行 1 个唯一哈希；gate hash 见下 |
| `npm run release:verify` | **PASS**；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `python3 scripts/build-golden.py --check-only` | golden cases 167，exit 0 |

**S0 gate hash 说明：** 干净克隆的 `evidence/S0_GATE.json` status 为 PASS，但 `gate_report_sha256` 为 `89d50905bbaca7f9a7a08d9a30fbeee3e64f9b5706fd299f96f5febc8327ee0a`，与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是 `environment_fingerprint`**（克隆路径不同导致；其余字段全部一致，含 `input_fixture_sha256`、`conditions` 全 true、determinism 100/1、unsupported 2/2）。这不是回归（与 R4–R10 同一现象，不同克隆路径不同指纹）。重跑后已 `git checkout -- evidence/S0_GATE.json` 恢复。

**探针矩阵重跑（干净克隆，仓库内 runner，全 JSON 深相等；重跑后 `results.json` 与提交版逐字节一致——`git status` 除自写探针外干净）：**

| 矩阵 | 结果 |
|---|---|
| fix-p0-04 | **100/100 MATCH**（前 66 行 R5 子集 **66/66 MATCH**，单模式 66 检查） |
| fix-p0-05 | **76/76 MATCH** |
| fix-p0-06 | **134/134 MATCH** |
| fix-p0-07 | **86/86 MATCH** |
| fix-p0-08 | **164/164 MATCH** |
| fix-p0-09 | **98/98 MATCH** |
| fix-p0-10 | **314/314 MATCH** |
| fix-p0-11 | **232/248 MATCH**（16 检查 DIFF，全部为 §2/§3 的 8 个已标注 `known_divergence` 残留行；runner exit 1 系有 flagged 行，属预期） |
| R10 探针 | **88/88 MATCH** |

**R11 独立探针（自写，`evidence/probes/r11/r11-probe.py`，37 例 ×2 模式 = 74 检查；R6 形状自 R10 报告原文重建，残留形状自 FIX-P0-11 报告 §7 原文重建，未复制修复方 `cases.json`）：**

| 组 | 结果 |
|---|---|
| R6 5 形状（§1） | 5 例 ×2 模式 **10/10 MATCH** |
| R6 边界 10 形状 | 10 例 ×2 模式 **20/20 MATCH** |
| FlowEndToken 收窄 6 形状（§5） | 6 例 ×2 模式 **12/12 MATCH** |
| P0-A 4 形状（§2） | 4 例 ×2 模式 **0/8 MATCH**（8 处 DIFF） |
| P0-B 8 形状（§3） | 8 例 ×2 模式 **0/16 MATCH**（16 处 DIFF） |
| 对照 4 形状（空格锚点/标签、带值多行 key ×2） | 4 例 ×2 模式 **8/8 MATCH** |

探针合计 1,314 检查（八矩阵 1,220 + R10 探针 88 + R11 独立探针 74；八矩阵 = fix-p0-04 100 + fix-p0-05 76 + fix-p0-06 134 + fix-p0-07 86 + fix-p0-08 164 + fix-p0-09 98 + fix-p0-10 314 + fix-p0-11 248；注：各矩阵与探针有形状重叠，合计为检查次数非去重形状数），DIFF 40 处（fix-p0-11 矩阵 16 + R11 独立探针 24，全部为 P0-A/P0-B 同一两族根因；R11 探针的 24 处中有 16 处与矩阵 16 处同形重叠）。

## §7 试冻三哈希（干净克隆，`--trial`，两次）

两次 `npm run release:freeze -- --trial`（HEAD `479810e`）哈希完全一致，确定性成立，且与修复方试冻值逐字节一致：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `08b8c360fcd7efa2b7be98a3e1ca34eb0fac32d755668c18b5253451d7ebf3b1`（2,188 文件） | 与修复方值一致；与 R2 的 `3a778b93…` 相比已变（Oracle 代码改动，属预期） |
| dist.zip | `57dc0f8d2cbbad9fdb6b9fd45b5cc30bf19ddd587ac16147ad980a7c8b46e7b9`（114 文件） | 与 FIX-P0-10 时完全相同——dist 为纯 TS 发行物，不含 Oracle |
| RELEASE_MANIFEST.json | `19b26ec154c067378588dfd217803c80d29f930638c61e2387c35323bbe33f6c` | source_commit `479810e`，freeze_status TRIAL |

`sha256sum -c` 3/3 OK。试冻后已 `git checkout release/`，克隆内 `release/` 恢复为 HEAD 正式件（source.zip `3a778b93…`、dist.zip `da130ad2…`，已核对）。

## §8 P2 清单：终审 R2 的 6 个 + R6 的 2 个 = 8 个，全部非阻断

| P2 | 复核（479810e） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。`git diff cf58f62..479810e -- scripts/deterministic-zip.py` 为空，冻结脚本未动，仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§7） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。README 仍为 "P95 768.3 ms, peak RSS 98.3 MiB"，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 仍有 `NOT_TESTED`，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。试冻 manifest 的 freeze_commit 字段为 TRIAL 说明；正式冻结时 T014 报告 §9 补实际 commit（同 R2 模式） |
| **P2-R6-1：manifest 的 `inputs` 只记录 t013 复核到 R3** | 仍成立，且范围扩大到 R11。试冻 manifest 的 `inputs` 键为 golden_suite_sha256、oracle_parity_report、s0_gate、s0_input_fixture_sha256、t013_review_r1/r2/r3——R4–R11 八轮复核均未记录。T014 重冻时须把 R4–R11 一并记入，非阻断 |
| **P2-R6-2：复核探针证据未入仓库** | 部分缓解，仍成立。R7/R8 自写探针只在 `/tmp` 与报告中（VM 重启 #42 已清空 `/tmp`，只能按报告文本重建）；R9/R10/R11 自写探针已随报告提交入仓库（`evidence/probes/r9/`、`evidence/probes/r10/`、`evidence/probes/r11/`），故"后续复核探针入仓"的要求自 R9 起已满足。非阻断 |

**P2-R10-1（已解决，不再列入未决清单）：** 14 个过期 `known_divergence` 标志本轮逐项核实：fix-p0-04 `D2-alias-flow-key`（1）、fix-p0-05 `H6-flow-alias-tab-before-colon`、`N5-block-alias-key-map-anchor`（2）、fix-p0-07 `RESID-MULTILINE-QUOTED-UNINDENTED-DQ/SQ`（2）、fix-p0-08 `flowkey-ind0/nested-ind0/ind1/nested-ind1/ind2/nested-ind2`（6）、fix-p0-09 `r4-comma-ind0`、`r5-explicit-plain-ind0`、`r5-explicit-quoted-ind0`（3）——`cases.json` 中 14 个标志均为 `false`，七矩阵重跑后对应行全部 MATCH、0 flagged。已清除。

**P2-R10-2（已解决，不再列入未决清单）：** `evidence/tests/T006_ORACLE_TRIGGER_REPORT.json` 记录的 `suite_sha256` 为 `36c3853d8a803ccbfe04ce1be7b85ba1eeab5bec9b88b91c970f3d06cbf62574`，与同一提交的 `tests/fixtures/trigger/suite.json` 实测哈希逐字节一致，fixture_count 128 / passed 128 / 0 mismatch。已修复。

## §9 违规捷径检查：无

- `oracle/` diff（`cf58f62..479810e`）= 仅 `parser.py`（+326/−10，新规则 `_reject_unseparated_comment_in_flow` + FlowEndToken 豁免收窄）；`src/` diff = 0。
- 删测试 0（`git diff --diff-filter=D` 为空）；测试/夹具 diff 中无 `skip`/`only` 弱化。
- 无 mismatch 忽略名单（`deepDiff` 未动）；无输入文本手术；无解析器更换。
- 修复方终报数字全部复核一致（§6、§7）；终报文案无新订正。
- 试冻 manifest 的 `inputs` 仍只记录到 R3，见 P2-R6-1（T014 重冻时处理）。

## §10 未审查事项与报告瑕疵记录

- 未审查：`a104fe0` 终报提交本身（只含终报文本，无代码）；终报 §3 过程记录中的六轮测绘细节未逐项复跑——本轮以端到端探针（§6）与解析器层测绘（§2.2、§3.2）独立验证结论。
- 未审查：Drive 归档状态与终审对话（不在 T013 复核范围内）。
- 本报告瑕疵：R11 自写探针的 R6 形状系按 R10 报告文字重建，未逐字复核 R10 原始用例原文；结论（全部 MATCH）仅针对重建形状。`r11-r6-on-unsupported` 使用了不支持事件 `pull`，Oracle 侧为 UNKNOWN 而非 VALID——该形状的 MATCH 仍成立（双边 INVALID，错误码一致），且另有 `pull_request` 的干净形状 `r11-r6-on` 佐证同一结论。
- 本轮未发现 P0-A/P0-B 之外的其他分歧：测绘范围外的形状（如锚点/标签后无空格位于 block 层、或 `?` 显式 key 后的 `#`）未穷尽，留待后续轮次；但 §2.2/§3.2 的解析器层测绘已覆盖两族触发条件的各维度。

## §11 亲自跑过的命令与结果（摘要）

全部在干净克隆 `~/workspace/p020-review-r11`（HEAD `479810e`）内运行；`npm ci` 后执行。

| # | 命令 | 结果 |
|---|---|---|
| 1 | `git clone ~/workspace/p020-checkpath ~/workspace/p020-review-r11 && git checkout 479810e` | 顶为 `479810e`，工作树干净（仅 r11/ 未跟踪） |
| 2 | `npm ci --no-audit --no-fund` | 181 packages，exit 0 |
| 3 | `npm test` | 1469/1469（43 files） |
| 4 | `npm run test:oracle` | 167 夹具，0 mismatch，0 false PASS，34/34 UNKNOWN |
| 5 | `npm run oracle:diff:trigger` / `jobs` / `checks` / `witness` | 128 / 48 / 46 / 44，全部 0 mismatch |
| 6 | `npm run typecheck` | PASS，exit 0 |
| 7 | `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| 8 | `python3 scripts/build-golden.py --check-only` | 167 cases，exit 0 |
| 9 | `npm run s0:gate` | PASS；24/24；唯一差异 environment_fingerprint（§6） |
| 10 | `npm run release:verify` | PASS |
| 11 | `python3 evidence/probes/r10/r10-probe.py` | 88/88 MATCH |
| 12 | `python3 evidence/probes/fix-p0-11/run-matrix.py` | 232/248 MATCH（16 DIFF 全 flagged，exit 1 属预期） |
| 13 | `python3 evidence/probes/fix-p0-04/run-matrix.py` | 100/100 MATCH（R5 子集 66/66） |
| 14 | `python3 evidence/probes/fix-p0-05/run-matrix.py` | 76/76 MATCH |
| 15 | `python3 evidence/probes/fix-p0-06/run-matrix.py` | 134/134 MATCH |
| 16 | `python3 evidence/probes/fix-p0-07/run-matrix.py` | 86/86 MATCH |
| 17 | `python3 evidence/probes/fix-p0-08/run-matrix.py` | 164/164 MATCH |
| 18 | `python3 evidence/probes/fix-p0-09/run-matrix.py` | 98/98 MATCH |
| 19 | `python3 evidence/probes/fix-p0-10/run-matrix.py` | 314/314 MATCH |
| 20 | `python3 evidence/probes/r11/r11-probe.py` | 50/74 MATCH（24 处 DIFF，全部 P0-A/P0-B） |
| 21 | `node YAML.parse` × 10 形状 + PyYAML `safe_load` × 10 形状 | 见 §2.2、§3.2 |
| 22 | `npm run release:freeze -- --trial` × 2 | 三哈希两次一致；`sha256sum -c` 3/3 OK |
| 23 | `git diff cf58f62..479810e --stat` / `-- oracle/` / `-- src/` / `--diff-filter=D` | 23 文件 +4333/−140；oracle/ 仅 parser.py；src/ 0；删文件 0 |
| 24 | 14 个 P2-R10-1 标志逐项核对 + T006 报告哈希核对 | 全部 false / 哈希一致（§8） |

## §12 给 parent 的下一步

1. **定点修复 §2 的 P0-A 与 §3 的 P0-B（均在 TS 侧，需 `src/` 改动）**：
   - P0-A：新增 TS 侧规则（FIX-P0-06 风格），拒掉 PyYAML 拒的锚点/标签后无空格注释（`&x#c`、`!!str#c`，含 flow 序列内与 `on:` 槽位）；不误拒空格对照与标量内 `#`。
   - P0-B：收窄 `hasMultilineFlowKey` S1 至带 `:` 分隔符/值的多行 key（null 值 key 不再触发）；收窄后必须保留对带值多行 key 的拒绝（§3.3 对照组），否则 R3 重开。**不得**用 Oracle 侧拒来掩盖 P0-B。
   然后派**新的独立复核 R12**（审查对象为修复后 HEAD；复核员一律在干净克隆里验证，不得与修复并行同一工作树；R12 须重跑本报告 §2 的 P0-A 4 形状 + §3 的 P0-B 8 形状 + 八矩阵 + R5 66 例 + 本轮 37 行矩阵）。
2. R12 PASS 后：T014 正式重新冻结（manifest `inputs` 须记入 R4–R11，见 P2-R6-1）→ Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3（同一立项对话，GPT-6 + Extra High + 完整结尾句）。
3. 终审轮次已用 2/5；R12 仍在同一立项对话内复核，不占用终审轮次。
