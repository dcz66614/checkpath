# T013 独立复核 R17 — FIX-P0-17（R16 的 2 个 P0 家族）复核报告

- **审查对象**：代码提交 `50788a7`（FIX-P0-17：关闭 R16 的 2 个 P0 家族；相对 `cc901b8`，74 文件，+43076/−263；其中 `oracle/checkpath_oracle/parser.py` +320/−12 行，`src/` 0 改动）。报告提交 `43e2ca5` 只含报告文本，不在代码审查范围内。
- **复核员**：T013 独立复核员（全新会话，与 FIX-P0-17 修复方、R16 复核员均隔离；未共享上下文）。
- **复核环境**：干净克隆 `~/workspace/p020-r17-review`（`git clone ~/workspace/p020-checkpath` 后 `git checkout 50788a7`），`git status` 干净（仅复核探针 `evidence/probes/r17/` 未跟踪），`git log --oneline -2` 顶为 `50788a7`。全部命令均在该克隆内亲自跑；未与任何修复并行同一工作树（R4 污染教训）。本轮复核中无 VM 重启。
- **结论：NOT PASS — P0 1 / P1 0 / P2 8。**

## §0 审查对象与无污染声明（先读）

- 本轮只审查 `50788a7` 的代码。`43e2ca5` 的报告文本仅作背景阅读；报告中所有数字均由本轮亲自重跑得出，未采信报告数字。
- 复核探针全部在干净克隆内运行；探针证据（`evidence/probes/r17/`：`cases.json` 76 行、`gen-cases.py`、`r17-probe.py`、`parser-probe-r17.py` / `.mjs`、`alias-key-probe.mjs`、`alias-family-e2e.py`、`alias-key-e2e.py`、`tag-term-e2e.py`、`results.json`、网格重跑 `grid-rerun-results.json`、重跑日志 `rerun-log.txt` / `rerun-log2.txt`、README）随本报告一并提交入仓库，不只留 `/tmp`（P2-R6-2 的教训）。本报告与探针在克隆内写就，交由主控归档；本轮未向主仓库 commit 或 push。
- R16 的 2 个 P0 家族本轮**全部独立重建并逐一确认关闭**（见 §1）；另发现修复方报告未披露的 **1 个新 P0 家族**（9 形，17 检查，见 §2）。
- **修复方报告数字复核**：除 §11 的两处对照声称外，报告 §3 的验收数字本轮全部复核一致（§8、§9）；报告 §4 的 manifest 哈希本轮**复现**（见 §6）。

## §1 R16 的 2 个 P0 家族 — 已关闭（已验证）

R16 定级的 2 个 P0 家族（16 形，31 检查）已关闭。本轮重跑 R16 自写探针 362 检查**全部 MATCH**（原 331/362，31 处 DIFF 现为 0），其中 16 个 P0 残差形逐行核对如下（32 检查——n1 lone 形两模式均 MATCH，比 R16 计数的 31 多 1 处 jobs 模式检查，同样 MATCH）：

| 家族 | 形状 | 结果 |
|---|---|---|
| P0-A mirror 别名键豁免过度 | c15-alias-key、n1-alias-key-lone、n2-alias-key-push、n3-alias-key-int-tag、n4-alias-key-custom-tag、n14-alias-seq-key、n15-alias-undef-key | **14/14 MATCH**（7 形 ×2 模式；原 13 检查中 11 处 DIFF 现全闭；触发模式 INVALID/yaml_parse_error 双边一致） |
| P0-B anchor 吸入 `:` | c16-absorb-2、c17-absorb-foo、n7-absorb-2-push、n8-absorb-foo-push、n10-absorb-hyphen-push、n11-absorb-num-push、n12-absorb-2x-push、n13-absorb-value-pos、n17-absorb-flow | **18/18 MATCH**（9 形 ×2 模式；根位置 push 形双边 VALID，值/流位置双边 INVALID，lone 形同码抵消未变） |

另：修复方 fix-p0-17 网格本轮重跑 **216/216 MATCH**（108 形；报告 §2 的 3 个本轮新发现分歧 `m: {&r: }`、`&x:!!tag` / `&x:!tag` 根块映射、`&x:?` 均已关闭，见 §4）；R15 的 3 个 P0 家族未回归（R15 探针 122/122、fix-p0-16 网格 238/238、R14 探针 78/78，见 §8）。

## §2 新发现 P0 — 1 个家族：吸入冒号别名在非键位置（9 形，17 检查）

本轮自写狩猎探针 141 检查中 **17 处 DIFF**，全部属于以下 1 个新家族；其余 124 检查全部 MATCH。该家族不在 R16 原形内，也不在修复方网格内——修复方 f-alias 组测的是别名**键**（`*s: 5`）与锚定义在值位置的别名使用（双边同拒），未测**键位置吸入锚 + 值位置吸入别名**的组合。

### 2.1 现象总表

锚 `&w:2` 定义在映射键上（键位置，双边接受），别名 `*w:2` 在**非键位置**使用：

| 形状（本轮重建） | TS | Oracle | 检查 |
|---|---|---|---|
| `&w:2 a: 1` + `b: *w:2`（块值位置） | **INVALID / `yaml_parse_error` / []** | **VALID / [1 job]** | 2（trigger + jobs） |
| `&w:2 a: 1` + `m: {b: *w:2}`（流值位置） | **INVALID / `yaml_parse_error`** | **VALID** | 2 |
| `&w:2 a: 1` + `m:` / `n: *w:2`（嵌套块值位置） | **INVALID / `yaml_parse_error`** | **VALID** | 2 |
| `&w:2 a: 1` + `on: *w:2`（on 值位置） | **INVALID / `yaml_parse_error`** | **UNKNOWN**（`on` 读作 `'a'`，不支持事件） | 2 |
| `&w:2 a: 1` + `jobs: *w:2`（jobs 值位置） | **INVALID / `yaml_parse_error`** | **VALID**（trigger）；jobs 模式 MATCH（双边 []） | 1（仅 trigger） |
| `&w:2 a: 1` + `b: 1` / `c: *w:2`（第 2 对值位置） | **INVALID / `yaml_parse_error`** | **VALID** | 2 |
| `&w:2 a: 1` + `m: {b: 1, c: *w:2}`（流第 2 对值位置） | **INVALID / `yaml_parse_error`** | **VALID** | 2 |
| `&w:2 a: 1` + `m: {a: {b: *w:2}}`（嵌套流值位置） | **INVALID / `yaml_parse_error`** | **VALID** | 2 |
| `&w:2 a: 1` + `b: *w:2` / `c: *w:2`（两次使用） | **INVALID / `yaml_parse_error`** | **VALID** | 2 |

合计 17 检查（9 形；8 形 ×2 模式 + jobs-value 形仅 trigger）。全部为同一根因（见 §2.2），计 1 项。

### 2.2 根因（解析器层最小复现，见 §3）

- **分歧在位置镜像规则的覆盖范围**。FIX-P0-17 的 `scan_anchor` 覆盖同时作用于 anchor 与 alias（`fetch_anchor` 与 `fetch_alias` 均调用它——报告 §2.2 明言）：`&w:2` 吸入为锚名 `w:2`，`*w:2` 吸入为别名 `w:2`，且双边在原始解析器层都如此（见 §3：`yaml` 包 0 错误、解析得 `b: "a"`；PyYAML token 流 `Anchor('w:2') … Alias('w:2')`、LOAD-OK）。但**位置拒收规则只镜像了 anchor**：新规则 `_reject_absorbed_anchor_colon_value_position` 只遍历 `AnchorToken`（`isinstance(token, yaml.tokens.AnchorToken) and ":" in token.value`），从不检查 `AliasToken`。值位置的吸入别名因此畅通无阻，Oracle 接受并解析别名。
- **TS 侧对 anchor 与 alias 用同一 keyPos 判定**。`src/core/workflow-parser.ts` 的 `hasRejectedAnchorOrTag` / `checkProperty` 对指示符 `&` 与 `*` 走同一分支：名取 PyYAML 的 `[0-9A-Za-z_-]*`，其后为 `:` 时按 keyPos 决定——块内 keyPos = `!prevProp && prevSig !== "?" && !(prevSig === ":" && 同行)`。`b: *w:2` 中别名前一显著字符是同行 `:`（`b:` 的值指示符）→ keyPos 为假 → 拒收。序列项（`- *w:2`，prevSig `-`）与流起始（`[*w:2]`，prevSig `[`）为 keyPos → 接受，与 Oracle 一致（见 §2.4 边界表）。
- **对照**：锚定义本身在键位置时双边接受（`&w:2 a: 1` 无别名使用：双边 VALID）；普通（非吸入）锚 + 别名（`&w a: 1` / `b: *w`）双边 VALID；吸入锚在序列项（`- &w:2 1`）+ 吸入别名在序列项（`- *w:2`）双边 VALID——吸入别名本身可解析，问题只在**非键位置的吸入别名**无镜像规则。
- **与 P0-B 的关系**：同一机制（吸入 `:` 后的位置镜像），但修复对象不同——P0-B 修的是 anchor，漏了 alias。按根因/修复机制计数（R11/R13/R14/R15 先例），计为独立 1 项，而非 P0-B 的延续。

### 2.3 修复方报告的两处对照声称订正

- **订正 1（报告 §7 的"无其他已知分歧"）**：终报 §7 称"无其他已知分歧"——本轮独立探针发现 1 个新 P0 家族（9 形，17 检查），均在修复方未曾探查的形状组合内（键位置吸入锚定义 + 值位置吸入别名使用）。披露诚实不改变定级（R8 对 R3 的权衡 (c) 同理）。
- **订正 2（报告 §2.2 的" `!` 守卫修正"）**：该修正**经本轮独立验证成立**，不是声称错误。R16 §2.5 说"`:` 后为非空白、非 `!` 时吸收"，修复者改为"以 tag 是否被空白/EOL 正常终结为判别式"——本轮解析器层对照证实：`&x:!!tag` + 块映射时 `yaml` 包锚名确为 `x:!!tag`、0 错误（VALID），而 PyYAML 原生（无吸收）会经 P0-2 mirror 过触发拒收；`&b:!!str{on: pull_request}` 时 tag 与 `{` 粘连、双边同拒（见 §3、§4）。R16 §2.5 的方向在此形上确实是错的，修复者的实测修正正确。
- **订正 3（报告 §7 的"P0-2 mirror 现为死代码"）**：表述过强，未证伪但未证实——本轮探查空间内无任何输入到达 mirror：已终结的 tag 一律被吸收（`:` 被消费），未终结的 tag 由 `scan_tag` 先拒收（nobrace 形报 "while scanning a tag"）。保留 mirror 在原位作安全网是合理的，无行为影响；"死代码"一说应理解为"当前探查空间内不可达"，而非已证明永不可达。

### 2.4 定级：P0（1 项）的依据与权衡

定级 **P0（1 项）**，依据：

- PROJECT_BOOK §7.3（L513）："Oracle 与实现**任何字段不一致都判失败；不得通过忽略字段、容差或人工解释来放行**。"——verdict、错误码、VALID/INVALID/UNKNOWN、jobs 列表均是输出字段；9 形中 8 形为 VALID vs INVALID、1 形（on 值位置）为 UNKNOWN vs INVALID，均为字段级分歧。
- PROJECT_BOOK §8.2（L548）："Oracle parity | 100% | 所有受支持输入完全一致。"
- IMPLEMENTATION_PLAN §8.1（L779）："**任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。**"
- IMPLEMENTATION_PLAN §10（L827）：P0 阻断明确包含 "**Oracle mismatch**"。
- **R3-ON 裁决先例**：双边 INVALID、错误码不同**不自动通过**——本家族 9 形中有 8 形是 VALID/UNKNOWN vs INVALID，形态更强。
- **R10 方向先例**：分歧方向不改变定级。on 值位置形（Oracle UNKNOWN vs TS INVALID）与块值位置形（Oracle VALID vs TS INVALID）方向不同，同属一个家族。
- **终审 R2 的裁决先例**：把同类分歧降为 P2 的理由被终审明确驳回。
- **计数原则（R11/R13/R14/R15 先例）**：按根因/修复机制计数。9 形同属一个缺失的镜像规则（别名位置检查），计 1 项。

**已权衡的反方考虑（记录在案，不改变定级）：**
- (a) "修复方已如实披露 §7 为空——本轮未发现新分歧"。披露诚实不改变定级；且本轮的 9 形是修复方未曾探查的形状组合（见 §2 冒头）。
- (b) "输入在产品域之外（真实 workflow 恒有 `on:` 与 `jobs:`）"。R12 §5(a) 与 R13 §2.4(b) 已驳回同一理由；且本家族的 push 形（`&w:2 a: 1` + `b: *w:2` + 完整 WF）本身就是**真实有效 workflow**（Oracle VALID，含 `on` 与 `jobs`）。
- (c) "规模小（17 检查）"。规模不改变定级：§7.3 无 de minimis 条款；R13 的 lone-doc P0 同为 2 检查且定为 P0。
- (d) "吸入别名在序列项等位置已 MATCH，说明机制大体正确"。序列项的 MATCH 是 keyPos 在两边同为真的结果，不是机制完整——值位置即暴露分歧（与 R16 对 P0-B lone 形的权衡 (e) 同理）。
- (e) "锚定义在值位置时双边同拒（规则 (ii) 已覆盖），别名只是边角"。规则 (ii) 覆盖的是锚 token；别名 token 的同类缺口与锚的缺口同等重要——TS 对 `&` 与 `*` 用同一判定，Oracle 漏了一半。
- (f) "on 值位置形 Oracle 为 UNKNOWN 而非 VALID，危害较小"。UNKNOWN vs INVALID 仍是字段级分歧（§7.3）；且其余 8 形均为 VALID vs INVALID。

### 2.5 各家族的正确修复方向（供 FIX-P0-18，非定级依据）

- **把位置规则扩展到吸入别名**：`_reject_absorbed_anchor_colon_value_position`（或其姊妹规则）须同时检查 `AliasToken`：凡 name 含 `:` 的别名（即被吸入的），用同一 `_absorbed_anchor_is_key_position`（`hasRejectedAnchorOrTag` 的 `keyPos` 镜像）判定键位置——不在键位置即抛 `yaml.YAMLError` → `yaml_parse_error`。可行性已验证：值位置吸入别名在 TS 侧的拒收判定（keyPos 假）与 Oracle 侧规则 (ii) 对锚的判定用同一函数，扩展到别名 token 是同一机制。
- **须守住的边界（本轮控制形，修复后须重验）**：序列项吸入别名（`- *w:2`、流 `[*w:2]`，双边 VALID）；tag 后别名（`m: !zap *w:2`，双边 INVALID，未变）；anchor 后别名（`m: &s *w:2`，双边 INVALID，未变）；显式键别名（`? *w:2`，双边 INVALID，未变）；flow 键别名（`m: {*w:2: 1}`，双边 INVALID，未变——`_reject_adjacent_alias_colon` 拥有）；键位置吸入锚定义本身（`&w:2 a: 1` 无别名使用，双边 VALID，未变）；普通别名（`*w`，无 `:`，规则不触发）。
- **须映射的完整边界**：块/流/嵌套值位置、on/jobs 值位置、第 2 对值位置、多次使用；另须确认新规则不改变 `_reject_adjacent_alias_colon` 已拥有的别名键形（同为 `yaml_parse_error`，码不变，无可见变化）。

### 2.6 本家族在修复前提交上的状态（未做 ba71eed 对照的说明）

本轮未在 `ba71eed` 上重跑本家族——无必要：`ba71eed` 上尚无吸入机制（`scan_anchor` 未覆盖），`&w:2` 在双边均不吸入，形状语义完全不同；本家族是 FIX-P0-17 引入吸入机制时**新产生**的分歧（吸入只镜像了一半），不是既有分歧。定级不受"既有/新产生"影响（R13 §2.4(c) 先例）。

## §3 解析器层最小复现（与探针驱动无关）

干净克隆内直接对解析器本身验证（`evidence/probes/r17/parser-probe-r17.py` + `parser-probe-r17.mjs` + `alias-key-probe.mjs`，输出见下；探针驱动的端到端结果与此一致）：

| 形状 | PyYAML `_StrictBaseLoader` | `yaml` npm 包 | 端到端（探针） |
|---|---|---|---|
| H8 `&w:2 a: 1` + `b: *w:2` + WF | token：`Anchor('w:2') … Alias('w:2')`；load 得 `{'a': 1, 'b': 'a', 'on': 'push', …}` | 0 错误；解析得 `{"a":1,"b":"a","on":"push",…}` | TS INVALID/yaml_parse_error vs Oracle VALID——**DIFF** |
| H8 对照 `&w a: 1` + `b: *w` + WF | token：`Anchor('w') … Alias('w')`；LOAD-OK | 0 错误；解析得 `{"a":1,"b":"a",…}` | MATCH（双边 VALID） |
| H8 对照 `&w:2 a: 1` 无别名使用 + WF | token：`Anchor('w:2')`；LOAD-OK | 0 错误；解析得 `{"a":1,…}` | MATCH（双边 VALID） |
| H8 对照 `- &w:2 1` / `- *w:2`（序列项） | token：`Anchor('w:2') … Alias('w:2')`；LOAD-OK `[1, 1]` | 0 错误；解析得 `{"m":[1,1],…}` | MATCH（双边 VALID） |
| `!` 修正 `&x:!!tag` + 块映射 | token：`Anchor('x:!!tag')`；LOAD-OK | anchor `"x:!!tag"`，0 错误；解析 VALID | MATCH（双边 VALID） |
| `!` 修正 `&b:!!str{on: pull_request}` | SCAN-ERROR "while scanning a tag" | anchor `"b:!!str"`，1 错误 "Tags and anchors must be separated…" | MATCH（双边 INVALID/yaml_parse_error） |
| `&x:!!str\t{on: push}`（tag 后 tab） | SCAN-ERROR "found character '\t' that cannot start any token" | anchor `"x:!!str"`，0 错误；解析 `{on: push}` | MATCH（双边 INVALID/yaml_parse_error——TS workflow-parser 层拒收，见 §4 注） |
| `&q:2#x`（`#` 粘连） | token：`Anchor('q:2#x')`；LOAD-OK | anchor `"q:2#x"`，0 错误 | MATCH（双边 VALID） |
| `&q:2\u00a0`（NBSP） | token：`Anchor('q:2\u00a0')`；LOAD-OK | anchor `"q:2\u00a0"`，0 错误 | MATCH（双边 VALID） |
| `&q:2:3:4`（三冒号） | token：`Anchor('q:2:3:4')`；LOAD-OK | anchor `"q:2:3:4"`，0 错误 | MATCH（双边 VALID） |
| `*w:2` lone（未定义吸入别名） | token：`Alias('w:2')`；LOAD-ERROR "found undefined alias 'w:2'" | 0 错误；toJS THROW "Unresolved alias … w:2" | MATCH（双边 INVALID） |

分歧在解析器/产品层，与探针脚手架无关。注：`&x:!!str\t{on: push}` 一形原始 `yaml` 包解析 0 错误而 TS 产品层仍判 `yaml_parse_error`——端到端深比较以产品层输出为准，双边一致即 MATCH；原始包行为差异不计入定级。

## §4 边界验证：`!` 守卫修正与吸入边界（本轮自写探针）

| 形状族 | 预期 | 结果 |
|---|---|---|
| `!` 守卫：tag 后接 tab / 注释 / EOL / CRLF（h1-tag-tab、h1-tag-comment、h1-tag-crlf、c-tag-root-block） | MATCH（吸收或双边同拒） | **MATCH**（tab+EOL 形双边 INVALID；注释/CRLF/块映射形吸收后双边 VALID） |
| `!` 守卫：裸 `!` / `!!` / `!!str!zap` tag（h1-tag-bare-bang、h1-tag-double-bang、h1-tag-bang-mid） | MATCH（吸收，双边 VALID） | **MATCH** |
| `!` 守卫：tag 终结符 `,` / `]` / `:` / `;` / `.`（tag-term 7 形） | MATCH | **MATCH**（6 形双边 INVALID；`&x:!!str:` + EOL 块映射双边 VALID） |
| `!` 守卫：tag 粘连 `{`（c-tag-nobrace、h1-tag-nobrace-flow-wf） | MATCH（双边 INVALID） | **MATCH** |
| 吸入运行字符 `;` `=` `+` `$` `@` `%` 反引号 `\|` `>` `(` `)` 反斜杠、`#` 粘连、三冒号、`::`、行尾 `!`、NBSP、`:` 后 tab/CRLF、`]`/`}` 终结（H2 20 形） | MATCH | **MATCH**（全部 40 检查；NBSP 双边同吸入锚名） |
| H8 家族边界：序列项 / 流序列项吸入别名（MATCH，双边 VALID）；tag 后 / anchor 后 / 显式键 / flow 键吸入别名（MATCH，双边 INVALID） | MATCH | **MATCH**（见 §2.4 边界表） |
| H8 家族：块/流/嵌套/on/jobs/第 2 对/多次使用值位置吸入别名（9 形） | DIFF（同 §2） | **DIFF**（17 检查） |
| P0-A 变体：别名键后接 tag（`&q:!!str *w:!!int 2`）、别名键后接映射/序列值（h3 3 形） | MATCH | **MATCH**（双边 INVALID） |
| 规则 (ii) 位置边界：嵌套值位置、文档标记后、块序列项映射、流序列、流第 2 对键、嵌套流值、显式键+值（H4 7 形） | MATCH | **MATCH** |
| 规则 (iii) flow 空键边界：嵌套流空键、流序列内流映射、粘连序列值、粘连第二锚（空值）、粘连空值、流序列内键、非吸入锚+第二锚（空值）（H5 7 形） | MATCH | **MATCH** |
| C3 × 吸入：`!zap &q:2 : 1`、`&q:2 : 1`（H6 2 形） | MATCH | **MATCH** |
| Lone 变体：tag 后空格、裸 `!`、`!!`、`#` 粘连、NBSP、`::`、未定义吸入别名、行尾 `!`、tag 后 tab（H7 9 形） | MATCH | **MATCH** |

结论：`!` 守卫修正成立（R16 §2.5 方向确为错误，见 §2.3 订正 2）；吸入运行字符集与 tag 终结判别式均已由本轮边界探针精确定界；唯一缺口是 §2 的吸入别名位置镜像。

## §5 P2 清单：终审 R2 的 6 个 + R6 的 2 个 = 8 个，全部非阻断

R16 的 9 个 P2 中 8 个仍成立，P2-R16-1 已清除（见下）：

| P2 | 复核（50788a7） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。冻结脚本未动（`git diff 6821ed0..50788a7 -- scripts/ release/ src/` 为空），仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§9） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。README 仍为 "P95 768.3 ms, peak RSS 98.3 MiB"，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 仍有 `NOT_TESTED` 标记，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。试冻 manifest 的 freeze_commit 字段为 TRIAL 说明；正式冻结时 T014 报告 §9 补实际 commit（同 R2 模式） |
| **P2-R6-1：manifest 的 `inputs` 只记录 t013 复核到 R3** | 仍成立，且范围扩大到 R17。本轮试冻 manifest 的 `inputs` 键仍为 golden_suite_sha256、oracle_parity_report、s0_gate、s0_input_fixture_sha256、t013_review_r1/r2/r3——R4–R17 十四轮复核均未记录。T014 重冻时须把 R4–R17 一并记入，非阻断 |
| **P2-R6-2：复核探针证据未入仓库** | 部分缓解，仍成立。R7/R8 自写探针只在 `/tmp` 与报告中；R9–R16 自写探针已随报告提交入仓库（`evidence/probes/r9/`–`r16/`），本轮 R17 探针亦在克隆内（`evidence/probes/r17/`，待主控归档）。非阻断 |

**已解决，不再列入未决清单：** P2-R16-1（fix-p0-15 6 标志已清：本轮核对 `cases.json` 130 行 0 flagged，diff 显示恰好 6 处 `true`→`false`；矩阵重跑 260/260 MATCH，0 flagged）；P2-R15-1、P2-R13-1、P2-R12-1、P2-R10-1、P2-R10-2（状态不变；本轮矩阵重跑 fix-p0-12 486/486、fix-p0-13 196/196，0 flagged）。

## §6 Manifest 哈希核查（修复方数字第四轮可信，不计入定级）

- 本轮实测 manifest 哈希 **`8a5a5aa1a873a431923d1d3feb02580a25383c5678d8af87c2d432bc0be1a2d3`**，与终报 §4 的 `8a5a5aa1…` **完全一致**（三次试冻均为同一值，见 §9）。source.zip（`fc9d9518…`，2,573 文件）与 dist.zip（`f2bcd53f…`，114 文件，未变）三次试冻均与终报逐字节一致。
- **2573 vs 2574 文件数的说明**：修复者在代码提交 `50788a7` 上冻结得 2573 文件；主控在报告提交 `43e2ca5` 上独立重冻得 2574 文件、manifest `ee788b9b…`——差 exactly 报告文件本身（`handoff/P020-FIX-P0-17/TASK_REPORT.md`，43e2ca5 唯一新增文件；`git ls-files` 在 43e2ca5 为 2574，在 50788a7 为 2573）。不是确定性问题；本轮在 50788a7 的干净克隆上复现了 `8a5a5aa1…`，manifest 链可信。
- **历史链确认**：R16 在 `6821ed0` 上两次试冻为 `17f06f86…`（R16 §6 已证）；本轮在 `50788a7` 上三次一致的 `8a5a5aa1…` 是本轮的可信值。修复方报告的 manifest 哈希连续四轮可复现——"以自己实测的两次一致值为准，不得从既往报告抄哈希"的规则继续有效，R18 须对本轮的 `8a5a5aa1…` 做同样的试冻复核。
- 此为试冻产物的报告数字核查，不是产品缺陷：manifest 是试冻产物，T014 正式重冻时会重新生成；不计入 P0/P1/P2。

## §7 违规捷径检查：无

- `src/` diff（`6821ed0..50788a7`）= 空；`oracle/` diff = 仅 `oracle/checkpath_oracle/parser.py`（+320/−12 行）；`scripts/`、`release/` diff = 空。
- 删测试 0（`git diff --diff-filter=D` 为空）；测试/夹具 diff 中无 `skip`/`only` 弱化（`grep -c` 为 0）。
- 无 mismatch 忽略名单（`deepDiff` 未动）；无输入文本手术；无解析器更换。
- 修复方终报数字除 §11 的两处对照声称外全部复核一致（§8、§9）；终报 §4 的 manifest 哈希本轮**复现**，见 §6。
- 试冻 manifest 的 `inputs` 仍只记录到 R3，见 P2-R6-1（T014 重冻时处理）。
- 新增测试 38 个（37 fixture + 1 schema 断言），与终报口径一致；新增夹具 37 件（`tests/fixtures/parser-divergence/absorbed-anchor-colon-p0-17/` + `expected.json`）与终报一致；新增测试文件 1 个（`absorbed-anchor-colon-p0-17.test.ts`）。

## §8 全量重跑（干净克隆 `~/workspace/p020-r17-review`，HEAD `50788a7`，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，exit 0） |
| `npm test` | **1661/1661 通过**（52 test files；基线 1623 + 新增 38） |
| `npm run test:oracle` | 167/167，0 偏差，0 false PASS；unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 128 夹具，0 mismatch（报告 128/128 passed） |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch（报告 48/48 passed） |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch（报告 46/46 passed） |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch（报告 44/44 passed） |
| `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；oracle 24/24；100 次运行 1 个唯一哈希；gate hash 见下 |
| `npm run release:verify` | **PASS**；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `python3 scripts/build-golden.py --check-only` | golden cases 167，exit 0 |

**S0 gate hash 说明：** 干净克隆的 `evidence/S0_GATE.json` status 为 PASS，但 `gate_report_sha256` 为 `ad6e4f60…`，与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是 `environment_fingerprint`**（克隆路径不同导致；其余字段全部一致，含 `input_fixture_sha256`、`conditions` 全 true、determinism 100/1、unsupported 2/2）。这不是回归（与 R4–R16 同一现象，不同克隆路径不同指纹）。重跑后已 `git checkout -- evidence/S0_GATE.json` 等生成文件恢复，克隆工作树干净（仅 `evidence/probes/r17/` 未跟踪）。

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
| fix-p0-15 | **260/260 MATCH**（0 flagged——P2-R16-1 的 6 个标志已清，见 §5） |
| R10 探针 | **88/88 MATCH** |
| R11 探针 | **74/74 MATCH** |
| R12 探针 | **118/118 MATCH** |
| R13 探针 | **98/98 MATCH** |
| R14 探针 | **78/78 MATCH**（22 处 FLAG STALE 检查 = 11 行，(a)–(e) 族已闭合，属预期） |
| R15 探针 | **122/122 MATCH**（24 处 FLAG STALE，§2 的 13 行已闭合，属预期） |
| fix-p0-16 网格 | **238/238 MATCH**（119 形；p1 54/54、p2 46/46、p3 82/82、p4 56/56） |
| fix-p0-17 网格 | **216/216 MATCH**（108 形） |
| R16 探针 | **362/362 MATCH**（原 331/362；16 个 P0 残差形 32 检查全部 MATCH，见 §1） |

**R17 独立狩猎探针（自写，`evidence/probes/r17/r17-probe.py`，76 例，141 检查；H1–H8 组，见 README）：**

| 组 | 结果 |
|---|---|
| H1 `!` 守卫 / tag 终结 | 10 例，18 检查，**18/18 MATCH** |
| H2 吸入运行字符 / 终结符 | 20 例，40 检查，**40/40 MATCH** |
| H3 别名吸入 | 7 例，14 检查，**12/14 MATCH**（2 处 DIFF：r17-h3-alias-resolved-key，见 §2） |
| H4 规则 (ii) 键位置边界 | 7 例，14 检查，**14/14 MATCH** |
| H5 规则 (iii) flow 空键边界 | 7 例，14 检查，**14/14 MATCH** |
| H6 C3 × 吸入 | 2 例，4 检查，**4/4 MATCH** |
| H7 lone 变体 | 9 例，9 检查，**9/9 MATCH** |
| H8 新 P0 家族边界映射 | 14 例，28 检查，**13/28 MATCH**（15 处 DIFF：8 形值位置，见 §2；6 个控制形 MATCH） |

探针合计 3,811 检查（十二矩阵 2,276 + R10–R15 探针 578 + fix-p0-16 网格 238 + R16 探针 362 + fix-p0-17 网格 216 + R17 狩猎探针 141；注：各矩阵与探针有形状重叠，合计为检查次数非去重形状数），DIFF 17 处（全部为 §2 的 1 个新家族）。

## §9 试冻三哈希（干净克隆，`--trial`，三次）

三次 `npm run release:freeze -- --trial`（HEAD `50788a7`）哈希完全一致，确定性成立；source/dist/manifest 与修复方试冻值逐字节一致（manifest 第四轮复现，见 §6）：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `fc9d951865bcc6f1ff58d622e8decd05ac6df8f4b0b8ef5d4e3838013218ea80`（2,573 文件） | 与修复方值一致；与 R16 的 `3ede7ad7…`（2,473 文件）相比已变（`oracle/` 改动 + 新 evidence/fixtures，属预期） |
| dist.zip | `f2bcd53f360ada37da25d3d650009b4c10274594a8faf4ed1c4d7591680e8f7f`（114 文件） | 与修复方值一致；与 FIX-P0-13/14/15/16 时完全相同——dist 是纯 TS 发行物，`src/` 0 改动 |
| RELEASE_MANIFEST.json | `8a5a5aa1a873a431923d1d3feb02580a25383c5678d8af87c2d432bc0be1a2d3` | **与修复方报告值一致**（三次试冻均为同一值），见 §6 |

`sha256sum -c SHA256SUMS.txt` 3/3 OK。试冻后已 `git checkout release/`，克隆内 `release/` 恢复为 HEAD 正式件（source.zip `3a778b93…`、dist.zip `da130ad2…`，已核对）。

## §10 亲自跑过的命令与结果（摘要）

全部在干净克隆 `~/workspace/p020-r17-review`（HEAD `50788a7`）内运行；`npm ci` 后执行。

| # | 命令 | 结果 |
|---|---|---|
| 1 | `git clone ~/workspace/p020-checkpath ~/workspace/p020-r17-review && git checkout 50788a7` | 顶为 `50788a7`，工作树干净（仅 r17/ 未跟踪） |
| 2 | `npm ci --no-audit --no-fund` | 181 packages，exit 0 |
| 3 | `npm test` | 1661/1661（52 files） |
| 4 | `npm run test:oracle` | 167 夹具，0 mismatch，0 false PASS，34/34 UNKNOWN |
| 5 | `npm run oracle:diff:trigger` / `jobs` / `checks` / `witness` | 128 / 48 / 46 / 44，全部 0 mismatch |
| 6 | `npm run typecheck` | PASS，exit 0 |
| 7 | `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| 8 | `python3 scripts/build-golden.py --check-only` | 167 cases，exit 0 |
| 9 | `npm run s0:gate` | PASS；24/24；gate hash 差异仅 environment_fingerprint（§8） |
| 10 | `npm run release:verify` | PASS |
| 11 | `python3 evidence/probes/r16/gen-cases.py && python3 evidence/probes/r16/r16-probe.py` | 362/362 MATCH |
| 12 | `python3 evidence/probes/r10/r10-probe.py` … `r15/r15-probe.py` | 88/88、74/74、118/118、98/98、78/78（22 FLAG STALE）、122/122（24 FLAG STALE） |
| 13 | `python3 evidence/probes/fix-p0-XX/run-matrix.py` × 12 | 100/76/134/86/164/98/314/248/486/196/114/260（§8） |
| 14 | `python3 evidence/probes/fix-p0-16/map2-p0-16.py all --results evidence/probes/r17/grid-rerun-results.json` | 238/238 MATCH（119 形） |
| 15 | `python3 evidence/probes/fix-p0-17/p17-probe.py` | 216/216 MATCH（108 形） |
| 16 | `python3 evidence/probes/r17/gen-cases.py && python3 evidence/probes/r17/r17-probe.py` | 124/141 MATCH（17 处 DIFF，§2） |
| 17 | `python3 evidence/probes/r17/parser-probe-r17.py` + `node evidence/probes/r17/parser-probe-r17.mjs` | 见 §3 |
| 18 | `node evidence/probes/r17/alias-key-probe.mjs` + `python3 evidence/probes/r17/alias-family-e2e.py` + `python3 evidence/probes/r17/alias-key-e2e.py` + `python3 evidence/probes/r17/tag-term-e2e.py` | 见 §2、§4 |
| 19 | `npm run release:freeze -- --trial` × 3（`50788a7`） | 三哈希三次一致；`sha256sum -c` 3/3 OK；manifest 与终报值一致（§6、§9） |
| 20 | `git diff 6821ed0..50788a7 --stat` / `-- src/ oracle/ scripts/ release/` / `--diff-filter=D` / tests `skip`/`only` | src/scripts/release 空；删文件 0；skip/only 0；parser.py 唯一代码改动 |
| 21 | fix-p0-15 `cases.json` 6 标志核对 + fix-p0-14 `cases.json` 标志核对 | P2-R16-1 已清（6 处 true→false）；fix-p0-14 0 flagged（§5） |
| 22 | `hasRejectedAnchorOrTag` 关键行核对（`src/core/workflow-parser.ts` L936–1031） | `checkProperty` 对 `&` 与 `*` 同一 keyPos 判定；Oracle 规则 (ii) 只查 AnchorToken（§2.2） |

## §11 未审查事项与报告瑕疵记录

- 未审查：`43e2ca5` 报告提交本身（只含报告文本，无代码）；报告 §2 过程记录中的逐字符测绘细节未逐项复跑——本轮以端到端探针（§8）与解析器层测绘（§3）独立验证结论。
- 未审查：Drive 归档状态与终审对话（不在 T013 复核范围内）。
- **终报文案订正 1（§7 的"无其他已知分歧"）**：终报称本轮未发现新的分歧——本轮独立探针发现 1 个新 P0 家族（9 形，17 检查），均在修复方未曾探查的形状组合内（见 §2、§2.3）。
- **终报文案订正 2（§2.2 的 P0-2 mirror 死代码声称过强）**：见 §2.3 订正 3——"死代码"应理解为当前探查空间内不可达，而非已证明永不可达；保留作安全网合理。
- **本轮新增 P0（见 §2）：** 1 个家族，9 形，17 检查，全部独立重建并定级。
- **本轮 P2 变化（见 §5）：** P2-R16-1 已清；P2-R6-1 范围扩大到 R17；其余 7 项不变。
- 本报告瑕疵：重跑电池 part 1 在 fix-p0-07 处被运行时杀死（输出排空超时），part 2 续跑完成 07–15 与两网格——数字均以结果文件为准，无遗漏；R17 狩猎探针的 H8 组是在首轮 109 检查全 MATCH 后追加的（先发现 h3-alias-resolved-key 一形，再做家族边界映射），两轮结果均已记录在 `results.json`（最终 141 检查）与 `alias-family-results.txt` 中。

## §12 给 parent 的下一步

1. **定点修复 §2 的 1 个新 P0 家族（FIX-P0-18）**：
   - 把位置规则扩展到吸入别名：凡 name 含 `:` 的 `AliasToken`，用同一 keyPos 镜像判定——不在键位置即拒收（`yaml_parse_error`），与 TS 的 `hasRejectedAnchorOrTag` 对 `*` 的判定对齐。须做 §2.5 的边界重验（序列项、花括号内键位置、tag/anchor 后的别名、显式键、flow 键、键位置吸入锚定义、普通别名）。
   - 然后派**新的独立复核 R18**（审查对象为修复后 HEAD；复核员一律在干净克隆里验证，不得与修复并行同一工作树；R18 须重跑本报告 §2 的 9 形 + §4 的边界探针 + 十二矩阵 + R5 66 例 + 本轮 76 形矩阵 + 终报 manifest 哈希复核）。
2. R18 PASS 后：T014 正式重新冻结（manifest `inputs` 须记入 R4–R17，见 P2-R6-1；R14/R15 探针的 stale-flag 行清理属 T014 范围）→ Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3（同一立项对话，GPT-6 + Extra High + 完整结尾句）。
3. 终审轮次已用 2/5；R18 仍在同一立项对话内复核，不占用终审轮次。
