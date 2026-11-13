# FIX-P0-12 任务终报 — R11 P0-A（anchor/tag 无空格）与 P0-B（S1 过拒 null 值多行键）已关闭

代码提交：`309b2ee8f5a92eb1b1f85850bed93cedd6832e1b`
（"FIX-P0-12: TS rejects anchor/tag-nospace + S1 narrowed to ':'-bearing keys (R11 P0-A/P0-B)"）

## 1. 根因

R11（2026-11-09 ~10:53 GMT，NOT PASS，P0 2 / P1 0 / P2 8，证据
`e0d7a01`）的 74 检查 probe（37 形状 × 2）中 24 DIFF，全部
是 FIX-P0-11 报告 §7 披露的 8 个残留行被独立复核升级为 P0：

- **P0-A（8 检查）：anchor/tag 无空格。**`yaml` 包接受
  `&x#c` / `!!str#c`（把 `#` 吞进 anchor/tag 名），PyYAML
  的 scanner 拒绝（"while scanning an anchor/tag"）。TS 侧
  VALID，Oracle 侧 INVALID。`on:` 槽位变体两边都 INVALID
  但错误码不同（R3-ON 先例：both-invalid 不自动通过）。
- **P0-B（16 检查）：FIX-P0-09 S1 过拒。**`m: {a\n b}` 等
  null 值多行键两边 parser 都接受，但 TS 侧
  `hasMultilineFlowKey` S1 拒绝。S1 的 docstring 经验基础
  只有带 `:` + 值的键（那些两边都拒绝——MATCH），无冒号
  的 null 值键不在其经验范围内。

## 2. 阈值推导过程（先测绘，后写规则）

测绘分 parser 层（PyYAML `safe_load` vs `yaml` npm 包，
70 + 74 形状）与端到端层（真实 TS bundle vs 真实 Oracle
驱动，全 JSON 比较，形状包成完整 workflow 文档）六轮。
关键发现决定了规则的写法：

### T1：Oracle 用 `_StrictBaseLoader`，不是 safe_load

`oracle/checkpath_oracle/parser.py` L344–460：Oracle loader
只给核心 scalar tag + mapping tag 注册 constructor，
BaseConstructor 对未知 tag 回退到 construct_scalar /
sequence / mapping——**它接受未知 tag**。因此 parser 层
safe_load 的结果对 constructor 层问题是错的，端到端结果
为准。后果（端到端已验证）：未知 tag（`!foo`、`!foo:bar`、
`!<tag:x>`、`!!timestamp`、`!!binary`、`!!seq/map/set` 等）
两边都接受——**不需要未知 tag 规则**。只有 scanner 层
的 tag 分歧才重要（tag 后跟非空白/EOL）。

### T2：PyYAML scanner 规则（从已安装 PyYAML 6.0.1 源码钉死）

- `scan_anchor`（`&name` / `*name`）：名只含
  `[0-9A-Za-z_-]`；空名报错；名后字符必须在
  `'\0 \t\r\n\x85\u2028\u2029?:,]}%@`'` 内，否则
  "while scanning an anchor/alias"。`%`/`@`/反引号在该集合
  内，但 PyYAML 随后在 next-token 阶段拒绝它们（不能
  开头任何 token）。
- `scan_tag_uri`：URI 字符 = `[0-9A-Za-z]` +
  `-;/?:@&=+$,_.!~*'()[]%`（`#` **不在**内；`[`/`]` 在内）。
  `%` 后须跟 2 位十六进制。
- `scan_tag`：tag 后字符必须为空白/EOL（`\0 space \r\n
  \x85\u2028\u2029`——**无 tab**）；verbatim `!<...>` 要求
  URI 扫描后紧跟 `>`（`#` 在 URI 内会停住扫描 →
  "expected '>'"）；空 suffix → "expected URI"；handle 形
  `!name!suffix`。
- `scan_tag_handle`：`!` + 可选 `[0-9A-Za-z_-]*` + `!`。

### T3：P0-A 测绘结论（端到端）

必须触发（TS 接受、Oracle 拒绝）：`#` 在 anchor/tag 后
的所有位置（flow map/seq、block map/seq、`on:` 槽位、
key 位置、EOF、CRLF、`#` 单独、`##`、`# c`）；anchor 名
字符 `.` `/`（npm 把它们含进名，PyYAML 不含）；`!` `*`
`|` `>` `'` `"` `;` `+` `<` 在 anchor 名后；`%` `@`
反引号在 anchor 名后；`[` `{` `&` 在 anchor 名后（npm
也拒绝——触发无害）；tag 后跟 `,` `}` `]` `[` `{` `|`
`>` `"`（部分 npm 也拒绝——无害）；verbatim tag 的 `>`
后或内部的 `,`/`#`；空 anchor 名 `&#c`；非 key 位置
anchor 后的 `:`/`?`（见下）；tag-then-anchor /
anchor-then-tag 无空格组合（A94/A95、E05）。
- 别名无需单独规则：`*x#c` 端到端两边都拒绝（npm 把
  `x#c` 读成别名名后无法解析）。但 anchor 扫描含 `*`
  且逻辑相同，无害，覆盖传递情形。
- 必须不触发（两边都接受）：`&x #c` / `!!str #c`（空格）；
  `"&x#c"` 引用内；`b&x#c` 纯量中部；`x#y`；`&x: 1`
  在隐式 key 位置（见下）；`&x,` `&x}` `&x]` `&x` EOF；
  `!foo` / `!foo:bar` / `!<tag:x>` / `!!timestamp` 等
  （未知 tag 两边都接受）；`!foo[bar]` 是反向分歧（见 §7）。
- Anchor `:`/`?` 位置规则（第 4–5 轮测绘）：
  `?` 在 anchor 后——**一律触发**（C03、C07、C31、C32、
  D02、D03、D18 全 DIFF）。`:` 在 anchor 后——除隐式 key
  位置外触发。隐式 key 位置 = flow：前一有效字符 ∈
  `{`、`,`、`[`；block：anchor 在行首且前一有效字符不是
  前一行的 `?`，或前面是 `-`（seq 指示符）。已对全部
  探测形状验证：C01 `{&x: 1}`、C21 `{&x: 1, b: 2}`、
  C06 `- &x: 1`、D01 `[&x: 1]`、D04 `{a: 1, &x: 2}`、
  D05 `m:\n &x: 1`、D19 嵌套、A45 `&x: 1`（不触发——
  Oracle 接受）；C02 `a: &x: 1`、C05、C20、C26、D06
  `- a: &x: 1`（触发——值位置）；D07 `?\n &x: 1`
  （触发——前一有效字符是前一行的 `?`）。双属性链：
  `{&x &y: 1}`、`&x &y: 1`、`m: {a: &x &y: 1}` 两边都已
  INVALID（MATCH）——无需链追踪；E05 tag-then-anchor-colon
  DIFF → 用 prevProp 逻辑触发（anchor 前有另一属性即
  值位置）。
- Tag `:`/`?`：无位置微妙处——`:`/`?` 是 URI 字符，
  被 tag suffix 扫描消耗，永不到达 post-tag 检查
  （D11 `{!!str: 1}`、D20 `!!str: 1` 两边都 MATCH/接受）。

### T4：P0-B 测绘结论

- 判别式是 **"有冒号"，不是"值非空"**：`{a\n b:}`、
  `{"a\n b":}`、`{'a\n b':}`、`{a\n b:\n}` 全被 PyYAML
  拒绝（有冒号、null 值）。无冒号的 null 值形状
  （B01–B08、B46、B55）两边都接受 → S1 不得触发。
- 端到端 B 轮：只有 10 个 null 值形状 DIFF；其余全部
  MATCH，包括 B41（`{a\n b # c\n, d: 1}`——Oracle 经
  `_reject_underindented_flow_continuation` 拒绝）和 B51
  （`{? "a\n b"\n: 1}`——Oracle 拒绝 indent-0 的冒号）——
  旧 S1 下 MATCH，新 S1 下 B41 仍 MATCH（见 §4 注），
  无需额外动作。
- 带值多行键必须继续拒绝（B09/B10/B15–B18/B22–B25/
  B43/B44/B45/B48/B50/B53/B54 今天经 S1 全 MATCH）。

## 3. 改动（TS 侧 `src/`，Oracle 0 改动）

### 3.1 S1 收窄（P0-B）——`hasMultilineFlowKey`

`src/core/workflow-parser.ts`：新增 helper
`colonSeparatorAfter(keyEnd)`——从 key 末尾向前扫描，
跳过空格/tab/换行/注释（照抄 `colonOnLaterLine` 的注
释跳过），当且仅当第一个结构字符是 `:` 时返回 true。
walk 条件改为
`(spansNewline || colonOnLaterLine) && colonSeparatorAfter(key.range[1])`。
（S2 不受影响：colonOnLaterLine 为真 ⟹
colonSeparatorAfter 为真。）S1 docstring 的"PyYAML
拒绝多行 key"说法已修正为"PyYAML 拒绝带 `:` 分隔符
的多行 key；无冒号的 null 值多行键被接受"，并附
FIX-P0-12 注记。**Oracle 刻意不用来掩盖**：Oracle
不得为迎合过宽的 TS 规则而拒绝合法 YAML。

### 3.2 新规则 `hasRejectedAnchorOrTag`（P0-A）

`src/core/workflow-parser.ts`，置于 `hasRejectedTab`
之后。照抄 `hasRejectedTab` 的状态机（quote、block
scalar 经 blockIndent/pendingBlock、plain-scalar 追踪
plainIndent/bareKeyIndent、flowDepth、`:` 分隔逻辑、
`-`/`?` 指示符、`|`/`>` 头、`isQuoteStart`、
`blockScalarHeaderIndent`），另追踪 `prevSig`（上一个
有效字符，行外 quote/comment/block-scalar 内容）+
`prevSigLine` 与 `prevProp`（上一有效 token 是否为
anchor/tag/alias 属性）。不在 plain scalar 内遇到
`&`/`!`/`*` 时内联检查整个属性；触发则返回 true，
否则跳过该属性继续扫描。tab 不归本规则（仍是
`hasRejectedTab` 的事；post-property 检查中 tab 视为安全）。

- Anchor/alias（`&`/`*`）：名 = `[0-9A-Za-z_-]*`。
  空名 → 触发。下一字符 `?` → 一律触发。下一字符
  `:` → 除 key 位置外触发：flow → prevSig ∈
  `{`、`,`、`[`；block → 当且仅当（prevProp）或
  （prevSig 是同行的 `:`）或（prevSig 是 `?`，任意行）
  时触发。下一字符在安全集 {EOF、空格、tab、CR、LF、
  NEL `\x85`、LS `\u2028`、PS `\u2029`、`,`、`]`、`}`}
  内 → 不触发。其他字符（`#`、`.`、`/`、`!`、`*`、
  `|`、`>`、`'`、`"`、`[`、`{`、`&`、`%`、`@`、反引号、
  `;`、`+`、`<` 等）→ 触发。
- Tag（`!`）：下一字符 `<` → verbatim：扫描 URI 字符
  至 `>`（`%` 须后跟 2 位十六进制否则触发）；扫描后
  若不是 `>` → 触发；`>` 后字符须为空白/EOL/tab
  否则触发。下一字符为空白/EOL/tab → 裸 `!` → 不触发。
  否则 shorthand：向前看找第二个 `!`（handle 形）；
  handle = `!` + `[0-9A-Za-z_-]*` + `!`；suffix 扫描
  = URI 字符（含 `%XX` 校验）。空 suffix → 触发。
  suffix 后字符须为空白/EOL/tab 否则触发。
- 刻意不拒绝（均已探测，两边已一致）：空格分隔的注释、
  引用/纯量内的 `#`、纯量内的 `&`/`!`、block-scalar
  内容、注释、格式良好的未知 tag、tag suffix 内的 URI
  字符（`:`、`?`、`&`、`*`、`'`、`/`、`;` 等由 suffix
  扫描消耗）。
- 已知局限（已在文档中注明）：显式 key 跨行拆分
  （`?\n  &x: 1`）——anchor 在行首，扫描读作隐式 key；
  该形状在矩阵中为 D07，**已覆盖**：prevSig 是前一行的
  `?` → 触发。`:`/`?` 位置规则无剩余局限。

### 3.3 `hasUnrepresentableKey`：0 改动

原计划的收窄已按证据放弃：A45 的 TS 拒绝来自 npm
`parse()` 抛错（"Implicit keys need to be on a single
line"），在 gate 运行前——空 key 分支根本见不到它。
AST 检查已验证：`&x: 1\nname: probe...` 经 `yaml` 包
解析，key 为折叠后的纯量 `1 name`（range [4,10]），
而 PyYAML safe_load 给出 `{None: 1, 'name': 'probe',
True: 'push', ...}`（anchored empty key 被接受）。

### 3.4 接线（两处 gate）

- `parseWorkflowYaml`（workflow-parser.ts）：gate 改为
  `hasUnrepresentableKey || hasRejectedTab ||
  hasMultilineFlowKey || hasRejectedAnchorOrTag` →
  INVALID `yaml_parse_error`。
- `extractJobs`（`src/core/e2e.ts` L274–276，独立的
  gate 副本；import 在 L77–79 增加新函数）。

## 4. 验收（全部亲自重跑，代码提交 HEAD `309b2ee`）

- `npm test`：**1507/1507**（基线 1469 + 新增 38：
  anchor-tag 24 形状 + 1 schema 断言 +
  null-value 12 形状 + 1 schema 断言；任务书写的
  1469/1469 是加新测试前的基线数）。
- `npm run test:oracle`：167 fixtures，**0 mismatch，
  0 false PASS**。
- `npm run s0:gate`：**PASS**；
  gate_report_sha256
  `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`
  ——**未变**（determinism 100 runs，1 unique hash）。
- `npm run release:verify`：**PASS**（license guard 仍
  PENDING_SAM_DECISION）。
- trigger/jobs/checks/witness：**128/48/46/44，全部
  0 mismatch**（T006–T009 报告已重跑，内容与已提交版
  逐字节相同，未改动）。
- R11 37 行 probe 重跑：**74/74 MATCH，0 DIFF**
  （原 50/74，24 DIFF 全变 MATCH）。
- 新矩阵 `evidence/probes/fix-p0-12/`：243 形状 × 2
  模式 = 486 检查，**462/486 MATCH**，其余 24 检查
  均为 12 个已标注 `known_divergence` 的残留行
  （§7），runner exit 0。
- 八矩阵重跑（全部 exit 0）：
  - fix-p0-04：**100/100**（其中 R5 66-case 子集：
    66/66——66 个单模式 R5 行）
  - fix-p0-05：**76/76**
  - fix-p0-06：**134/134**
  - fix-p0-07：**86/86**
  - fix-p0-08：**164/164**
  - fix-p0-09：**98/98**
  - fix-p0-10：**314/314**
  - fix-p0-11：**248/248**（其中 16 检查为已标注
    known-divergence——**8 个先前残留行全部变为
    MATCH**，含 `inl-key-comma-nospace`）
- R6 核心 5 形状（10 检查）：R10 probe 与 R11 probe
  内全 MATCH。
- R10 44 行 probe 重跑：**88/88 MATCH，0 DIFF**。
- B41 注：新 S1 下 B41（`{a\n b # c\n, d: 1}`）仍
  MATCH——TS 侧经 `yaml` 包自身拒绝（该形状的
  `yaml_parse_error` 与 Oracle 的
  `_reject_underindented_flow_continuation`  verdict
  一致），不是 S1 触发。已在 fix-p0-12 矩阵内验证。
- Trial freeze 两次（代码提交 `309b2ee` 后，冻结器
  HEAD 门要求先提交）：三哈希两次完全一致。
  - source.zip（2242 文件）：
    `267ba9026d198b07a100173fedc6d613b8d5e677c1a648a51f544f90f6c3ce3a`
  - dist.zip（114 文件）：
    `16af8080f81bcee4560055fba99801538a0e03329b197323d7e19e8e69ca453f`
  - RELEASE_MANIFEST.json：
    `5e44f660ffb19ce53f1ef1a08bee2014d9521b9d4dd9f3a0a4cc8ffa005e2f98`
  - source.zip 从 FIX-P0-11 时的 2188 文件变为 2242
    文件（本轮新增：fix-p0-12 证据 5 件 + 新 fixtures
    36 件 + 新测试 2 件 + R11 结果 + 旧矩阵结果等）。
  - **dist.zip 说明**：任务书"dist 应保持 57dc0f8d…"
    的预期不适用于本轮——FIX-P0-11 是 Oracle-only
    修复（`src/` 0 改动），dist 才未变；本轮改了
    `src/core/workflow-parser.ts` 与 `e2e.ts`，dist
    是纯 TS 发行物（114 文件，文件数未变），重建后
    哈希必然变化。两次 freeze 的 dist 哈希一致，
    确定性已验证。
  之后 `git checkout release/` 恢复 R2 正式产物
  （source.zip `3a778b93…`、dist.zip `da130ad2…`，
  已核对）。

## 5. R11 报告对照

- P0-A 全部 8 检查已关闭：R11 的 `&x#c` /
  `!!str#c` 形状（flow map 值、flow seq、block 值、
  `on:` 槽位）及边界变体（空格对照、引用对照、
  纯量中部对照、多行键带值对照、单引 key、
  完整 pair 后的 null 多行键）——R11 probe 74/74。
- P0-B 全部 16 检查已关闭：R11 的 8 个 null 值
  多行键形状（plain / double-quoted / single-quoted、
  嵌套、pair 后、`a:#c` 其中 `#` 在纯量 key 内）
  及边界变体——R11 probe 74/74。
- R11 的 P2 8 项未动（本轮不处理 P2；其中
  P2-R10-1/2 已在 R11 中确认 FIXED）。

## 6. 未动事项

- `src/` 之外：`evidence/review/`、`handoff/P020-T013-R11/`、
  `release/` 正式产物（除 trial freeze + 恢复流程外）
  未动；`oracle/` 0 改动；`reports/` 目录为 2026-11-08
  遗留的未跟踪 demo/merge-queue 报告（非本轮生成），
  未提交、未改动。
- 旧矩阵结果：fix-p0-04 至 fix-p0-10 的 results.json
  重跑后与已提交版逐字节相同，未改动；仅
  fix-p0-11/results.json 因残留行变为 MATCH 而更新
  （已随代码提交）。

## 7. 残留分歧清单

### 7.1 A45 `&x: 1`（anchored empty key，文档根部）

- TS INVALID（`yaml_parse_error`，npm
  implicit-key-single-line）vs Oracle VALID（PyYAML
  接受 anchored empty key）。修复方向：Oracle 侧
  拒绝 anchored empty key——超出本轮 TS-side 范围。
  （裸空 key `: 1` 不同：PyYAML 的 PARSER 拒绝它——
  "while parsing a block mapping, expected <block end>,
  but found ':'"——所以 Oracle 拒绝它；只有 ANCHORED
  形式漏网。）

### 7.2 A70 `!foo[bar] 1`

- TS INVALID（`yaml_parse_error`，npm tag 扫描在 `[`
  处停止）vs Oracle VALID（PyYAML URI 字符集含
  `[`/`]`）。修复方向：Oracle 侧拒绝 tag suffix 含
  `[`/`]`——超出范围。

### 7.3 `,`-suffix 族（A60、X04、Y03、Y05、Y08、Y09、Y10）

- tag suffix 吞掉 flow `,`（`,` 是 URI 字符，PyYAML
  的 suffix 扫描消耗它），parser 随后在应有分隔符处
  遇到 `:` 而失败——TS VALID（npm 在 `,` 处停止 tag）
  vs Oracle INVALID。**Parser 层，不是 scanner 层**：
  关闭它需要 flow-kind 栈（在 `{` map 内触发，在
  `[` seq 内不触发——Y01/Y02 `!foo, a: 1` 两边都接受）
  加跨越多行的 lookahead（越过被 tag 的节点：引用
  节点 Y03、换行 Y05、anchor 前缀节点 Y08、数值 Y09、
  null 值 Y10）。超出本轮范围。矩阵中 X02
  （`!foo,bar 1`——`,` 在 suffix 中部）、X05/X06
  （flow seq——吞掉的 `,` 无害）、X13（`,` 前有空格——
  tag 先结束）、Y01/Y02（flow seq 带 pair——PyYAML
  接受，故未来规则不得在那里触发）为 MATCH 对照。

### 7.4 `]`-suffix 族，反向（X08、X09）

- tag suffix 吞掉 `]`——TS INVALID（npm 在 `]`
  处停止 tag，随后有多余 token）vs Oracle VALID
  （PyYAML 的 suffix 消耗 `]`，seq 仍能闭合）。
  修复方向：Oracle 侧拒绝 tag suffix 含 `]`（与 A70
  同一修复）；TS 侧经 npm 无法接受。

### 7.5 X11 `a: !foo,` + 下一行 `b: 1`（`,`-suffix 族的 block 变体，反向）

- TS INVALID（npm 拒绝）vs Oracle VALID（PyYAML
  的 suffix 消耗 `,`；tag 带 null 节点，`b: 1`
  是下一 pair）。修复方向：Oracle 侧拒绝以 `,`
  结尾的 tag suffix；TS 侧已拒绝，故无 TS-side 规则
  能关闭它。

## 8. 文件与提交

- 代码提交：`309b2ee8f5a92eb1b1f85850bed93cedd6832e1b`
  - `src/core/workflow-parser.ts`（S1 收窄 +
    `hasRejectedAnchorOrTag` + parse gate 接线）
  - `src/core/e2e.ts`（`extractJobs` gate 接线）
  - `evidence/probes/fix-p0-12/`（cases.json 243 形状、
    run-matrix.py、results.json、README.md、
    ts-probe-entry.ts）
  - `evidence/probes/fix-p0-11/results.json`（248/248，
    残留行变为 MATCH）
  - `evidence/probes/r11/results.json`（74/74）
  - `evidence/tests/RELEASE_VERIFY_REPORT.json`
    （dist tree sha256 随 src/ 改动而变）
  - `tests/fixtures/parser-divergence/anchor-tag-nospace/`
    （24 形状 + expected.json + README.md）
  - `tests/fixtures/parser-divergence/multiline-key-null-value/`
    （12 形状 + expected.json + README.md）
  - `tests/unit/diff-boundaries/anchor-tag-nospace.test.ts`
  - `tests/unit/diff-boundaries/multiline-key-null-value.test.ts`
- 报告提交：`handoff/P020-FIX-P0-12/TASK_REPORT.md`
  （本文件）。
- 下一步：T013 R12（新会话，clean-clone only）→ R12
  PASS → T014 R3 正式 re-freeze（manifest `inputs`
  须记录 R4–R11）→ Drive 新文件夹 01_release_R3
  （永不覆盖 R1/R2）→ 同一立项对话最终评审 R3
  （GPT-6 + 极高，Drive 插件尾巴）→ PASS → 验收
  闭环 → **立即开始 P021 立项**。
