# FIX-P0-15 任务报告（T013 R14 的 5 个 P0 家族）

- **结论**：R14 的 5 个 P0 家族（11 检查）已全部关闭。R14 探针重跑 **78/78 MATCH**（原 67/78）；R13 探针 **98/98 MATCH**（R13 的 lone-doc P0 未回归）；全部验收在代码提交 HEAD 上亲自重跑通过；`src/` 0 改动；S0 门哈希未变；trial freeze 两次三哈希一致；`release/` 已恢复为 R2 正式件。可派遣 R15（新会话、clean-clone only、代码提交 `5e3cda7`）。
- 代码提交：`5e3cda7`（2026-11-09 ~15:34 GMT，42 文件，+7594/−594 行；其中 `oracle/checkpath_oracle/parser.py` +570 行，1993 → 2563 行）。
- 本报告提交：见 `handoff/P020-FIX-P0-15/TASK_REPORT.md`（本文件）。

## 1. 改了什么

全部改动都在 Oracle 侧（`oracle/checkpath_oracle/parser.py`），`src/` 0 改动（dist.zip 未变可证）。新增 1 个 unwrap helper + 4 条 `_reject_*` 规则，接线进 `parse_workflow_yaml` 与 `extract_jobs` 的同一 try 块（与既有 7 条规则同列，同为 `yaml.YAMLError` → `yaml_parse_error` / `[]`）：

| 家族 | 函数 | 方向 |
|---|---|---|
| (a) P0-1 映射值含 `on` | `_unwrap_lone_anchored_empty_key_doc` | unwrap 语义：lone-doc 的值是映射时，文档即该映射；`parse_workflow_yaml` 与 `extract_jobs` 双接线 |
| (b) P0-2 值节点第二 anchor | `_reject_second_anchor_on_value` | 镜像 yaml 包的 "at most one anchor" 拒收 |
| (c) P0-3 键带 tag | `_reject_tagged_anchored_empty_key` | 镜像 E05（`hasRejectedAnchorOrTag`） |
| (d) P0-4 unglued anchor-colon | `_reject_unglued_anchored_empty_key` | 镜像 `hasUnrepresentableKey` |
| (e) P0-5 嵌套块映射值带 anchored 键 | `_reject_anchored_nested_block_mapping` | 镜像嵌套块映射中的 "at most one anchor" 拒收（块上下文限定） |

另新增：20 个 vitest fixtures（`tests/fixtures/parser-divergence/lone-anchored-empty-key-p0-15/` + `expected.json`，生成器 `evidence/probes/fix-p0-15/gen-fixtures.py`，写盘前先验双边一致）+ 测试文件 `tests/unit/diff-boundaries/lone-anchored-empty-key-p0-15.test.ts`（21 测试：1 schema + 20 形状，含显式双边一致断言）。

## 2. 每家族的判别式推导（附控制形状）

推导方法：先做解析器层并行映射（npm `yaml` vs PyYAML `_StrictBaseLoader` + token dump），再用端到端探针（TS bundle + Oracle 驱动，全 JSON 比对）逐形确认——解析器层映射会误导（FIX-P0-11 教训），端到端为准。映射轮次：`map-p0-15.py`（96 形）→ `map2-p0-15.py`（端到端全组）→ `map3-p0-15.py`（22 形补充：别名、(e)/(b) 边界、unwrap 边、(c)/(d) 流位置）→ `map4-p0-15.py`（18 形补充端到端）→ `map5-p0-15.py`（12 形最终边界：(c) 流位置、(d) tag 条件、C3 越界）→ `map6-p0-15.py`（10 形：`!!str`/已知 tag）。

### 2.1 (a) unwrap：值是映射的 lone-doc，文档即该映射

机制（FIX-P0-14 T1/T3 已确立、本轮再确认）：yaml 包把 lone-doc 的 anchored 空键的 anchor 归属到**值节点**（`&x: 1` 渲染为标量 `1`，`&x: {on: push}` 渲染为映射 `{on: push}`），而 PyYAML 渲染为 1 对映射 `{'': <值>}`。这一个归属差异解释了 (a)、(b)、(e) 三个家族。

判别式：与 `_is_lone_anchored_empty_key_doc` 条件 1–4 相同的 token walk（文档恰为一个单对块映射：StreamStart、[DocumentStart]、BlockMappingStart、KeyToken、AnchorToken、ValueToken、〈映射值〉、BlockEnd、[DocumentEnd]、StreamEnd；键与 anchor 间无 TagToken；anchor 与 `:` glued），条件 5 取反——跳过值上的 TagToken 后首 token 是 BlockMappingStart / FlowMappingStart。关键边界（均已端到端确认）：

- 范围**不止 trigger**：`&x: {jobs: {...}}`（无 `on`）trigger 已 MATCH（双边 `missing_on_key`），但 jobs 模式 DIFF（TS [1 job] / Oracle [0 jobs]）——所以 unwrap 必须同时接线进 `extract_jobs`；`&x: {on: push, jobs: {...}}` 全工作流在值内时双边 VALID / [1 job]。
- 多对根映射时**不 unwrap**：`&x: {on: push}` 后再接任意根对，yaml 包报 "Unexpected scalar at node end"，C3 也触发——双边已拒收，unwrap 永不与 C3 竞争（lone-doc 只有 1 对，C3 从不触发）。
- 已知 tag 在值映射上：未知 tag（`!foo`）按节点种类构造为 dict，直接用 loaded 值；`!!str` 等已知标量 tag 使 loader 构造出字符串（节点 repr），此时重解析值映射自身的 token span（块映射从行首切片以保留缩进，流映射从 token 起点切片，到配对的结束 token），重解析结果为 dict 即用。`&x: !!str {on: push}` 与 `&x: !!str\n  on: push`（有空格）均已闭合。
- 自别名：值 span 内指向外层 anchor 的别名（`&x: {on: *x}`）→ 抛 `yaml.YAMLError`（yaml 包拒收）；仅当同名 anchor 在 span 内**先于**别名定义时才安全（内层遮蔽：`&x: {a: &y 1, b: *y}`、`&x: {a: &x 1, on: *x}` 保持 MATCH）。别名先于定义（`&x: {on: *y, a: &y 1}`）由 loader 自身拒收，无需处理。
- 控制（保持 MATCH）：`{name: probe}`（无 on/jobs）、`{True: push}`（双边 `missing_on_key`）、`{on: push, &y: 1}` 块变体（双边 `yaml_parse_error`，C3）。

### 2.2 (b) 第二 anchor：token 模式，不按位置限定

判别式：KeyToken、AnchorToken、ValueToken（首 anchor 紧跟值冒号）+ anchor **glued**（`anchor.end == value.start`）+ 跳过值上的 TagToken 后首 token 是 AnchorToken（第二 anchor）或 AliasToken。推导要点：

- ValueToken 分隔的变体全 DIFF（标量、流序列、null、流映射、块映射、块序列值；第二 anchor 后带 tag `&y!foo 1`；两 anchor 间带 tag `!foo &y`）。
- 别名扩展：`&x: *y`（anchor 在空键上 + 别名值，别名已定义）DIFF——R14 §2.5(b) 称 `&x *y` 合法是**错的**，仅限空键位置（`m: &x *y` 与 `b: &x *y` 双边都拒——PyYAML 解析器拒收相邻 anchor+别名），所以 (b) 规则必须覆盖 AliasToken。
- Glued 要求：`&x : &y 1`（外层 unglued）不由 (b) 触发——它是 (d) 形状（`hasUnrepresentableKey`）；(b) 只认 glued。
- 首 anchor 紧跟 ValueToken 的要求排除了 `&x k: &y 1`（非空键，控制，保持 `missing_on_key`）。
- 相邻 anchor（`&x &y 1`，无 ValueToken 间隔）双边已拒，无需规则；块序列项（`m:\n - &x: &y 1`）同样触发（trigger + jobs 均 DIFF→MATCH）。

### 2.3 (c) 键带 tag：E05 在任何位置都触发

判别式：KeyToken、TagToken+、AnchorToken、ValueToken，anchor **glued**。要点：

- 范围比 R14 §2.5(c) 所称更广：R14 称工作流内变体已被 R13 §4.2 覆盖（双边拒）、缺口仅 lone-doc——**对单对位置是错的**：`m:\n!foo &x: 1`（嵌套单对）、`m: {!foo &x: 1}`（流映射）、`m: {!foo &x:}`（流映射 null）、`m:\n -!foo &x: 1`（块序列项）均 DIFF（trigger + jobs），因 E05 在流映射中同样触发（属性处理后 `prevSig` 是属性末字符，永不是 `{`/`,`/`[`，故 keyPos 为假）。(c) 规则因此不限位置；多对块映射已被 C3 覆盖（同错码，重叠无害）。
- Glued 要求是关键护栏：`!foo &x : 1`（tag + unglued）双边 MATCH（`missing_on_key`）——`hasUnrepresentableKey` 不触发（键带 tag，非 PLAIN），E05 不触发（anchor 后是空格而非 `:`）。(c) 若不要求 glued 会破坏该 MATCH。
- 控制：嵌套 2 对、根第 2 对、显式键 `?!foo &x: 1`（双边 `yaml_parse_error`）保持 MATCH。

### 2.4 (d) unglued：tag 护栏只认“对值块映射的首对”

判别式：KeyToken、[TagToken]*、AnchorToken、ValueToken，anchor **unglued**。要点：

- 无 tag 时任何位置都触发（lone-doc、嵌套单对/多对、流映射任意对数、块序列项）。
- 有 tag 时**仅**当该对是“作为对值的块映射的首对”才触发（`m:\n  !foo &x : 1`）。机制经规则探针（`rule-probe.ts`，逐条跑五条 TS 规则）与 AST dump（`ast-dump.ts`）钉死：yaml 包把该位置的空键解析为 value=null、无 tag、无 anchor 的 PLAIN 标量（零宽 range），故 `hasUnrepresentableKey` 触发；而在根映射（首对或第 2 对）、流映射、块序列项映射中，同一文本的键节点是 value=`""` 且带 tag 与 anchor，`hasUnrepresentableKey`（要求 null 值）不触发。根首对 `!foo &x : 1`、根第 2 对 `a: 1\n!foo &x : 2`、流映射 `m: {!foo &x : 1}`、序列项 `m:\n  - !foo &x : 1` 均为控制（TS 接受，(d) 不得触发）。
- (d) 与 (e) 的分工：`&x:\n  !foo &y : 1`（e 位置 + tag + unglued 嵌套键）由 (d) 的 tag 条件覆盖（C3 在外层 `&x:` 对上也触发，因 WF 后缀使根映射 ≥2 对）；`&x:\n  &y : 1`（无 tag unglued 嵌套键）由 (d) 的无 tag 分支覆盖。

### 2.5 (e) 嵌套块映射：带 anchor 的块映射 + 首对为 glued anchored 空键

判别式（块上下文限定，与深度无关）：块映射节点 M 冲突当且仅当 (1) M 带 anchor——M 是 glued anchored-empty-key 对的值（KeyToken、AnchorToken、ValueToken、[TagTokens]、BlockMappingStart，anchor glued），或一个 AnchorToken 紧贴在 M 之前（跳过 TagToken：`m: &x\n  &y: 1`、`m: &x !foo\n  &y: 1`）；且 (2) M 的**首对**是 anchored 空键（KeyToken、[TagTokens]、AnchorToken、ValueToken），嵌套 anchor **glued**。要点：

- 嵌套键带 tag 仍冲突（`&x:\n!foo &y: 1`）；外层 anchor 与 M 间带 tag 仍冲突（`&x:!foo\n &y: 1`）。
- 外层 anchor unglued 不冲突（`&x :\n  &y: 1` 渲染为 `{"": 1}`——那是 (d) 形状）；非空键上的 anchor 不冲突（`&x:\n &y k: 1`、`&x k:\n &y: 1` 保持 MATCH）；流孪生 `&x: {&y: 1}` 保持 MATCH（双边 `missing_on_key`，规则只认 BlockMappingStart）；2 对嵌套变体保持 MATCH（双边拒——npm 解析器与 C3 均触发），故规则只查首对；更深嵌套同样冲突（`a:\n &x:\n &y: 1`，逐帧检查）。

## 3. 验收（全部在代码提交 `5e3cda7` HEAD 上亲自重跑）

| 检查 | 结果 |
|---|---|
| `npm test` | **1590/1590，50 文件**（基线 1569/1569，49 文件；+21 测试来自新文件） |
| `npm run test:oracle` | 167 夹具，**0 mismatch，0 false PASS** |
| `npm run typecheck` | 通过（`tsc --noEmit` 无输出） |
| `npm run s0:oracle` | **0 mismatch，0 false PASS**；unsupported as UNKNOWN 2/2 |
| `build-golden.py --check-only` | 通过（golden cases: 167） |
| `npm run s0:gate` | **PASS**；oracle 24/24；determinism 100 runs 1 unique hash；gate_report_sha256 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`（**未变**） |
| `npm run release:verify` | **PASS**；license guard：无 LICENSE，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `npm run oracle:diff:trigger` | 128 夹具，0 mismatch |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch |
| R14 探针重跑（39 行） | **78/78 MATCH**（原 67/78，11 处 DIFF 全变 MATCH；`results.json` 独立核对：checks 78 / match 78 / diff 0；原先标注的残留行现报 FLAG STALE，属预期） |
| R13 探针重跑（49 行） | **98/98 MATCH**（R13 的 lone-doc P0 未回归） |
| R10 探针重跑（44 行） | **88/88 MATCH** |
| R11 探针重跑（37 行） | **74/74 MATCH** |
| R12 探针重跑（59 行） | **118/118 MATCH** |
| R6 5 形状（R10 §2.1，含于 R13 探针） | **10/10 MATCH** |
| fix-p0-15 新矩阵（130 行 × 2） | **249/260 MATCH**，其余 11 检查为 6 个已标注 `known_divergence` 的残留行（§7），runner exit 0 |
| 十一矩阵重跑（全部 exit 0） | fix-p0-04 **100/100**（其中 R5 66-case 子集 **66/66**）、fix-p0-05 **76/76**、fix-p0-06 **134/134**、fix-p0-07 **86/86**、fix-p0-08 **164/164**、fix-p0-09 **98/98**、fix-p0-10 **314/314**、fix-p0-11 **248/248**、fix-p0-12 **486/486**、fix-p0-13 **196/196**、fix-p0-14 **114/114**（11 个残留行现已 MATCH，标志已过期） |
| T006 报告哈希核对 | `suite_sha256` `36c3853d…` 与同一提交的 `tests/fixtures/trigger/suite.json` 实测哈希逐字节一致 |

## 4. Trial freeze（代码提交后，两次；manifest 哈希实测方法见下）

两次 `npm run release:freeze -- --trial`（HEAD `5e3cda7`，2026-11-09 ~15:34–15:35 GMT）三哈希完全一致，确定性成立：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `3d3136f7cb73cd763106bb00cd63d72d68b01e008f6901635566ee3d489a60b9`（2396 文件） | 与 R14 的 `f8621677…`（2,348 文件）相比已变（`oracle/` 改动 + 新 evidence/fixtures，属预期） |
| dist.zip | `f2bcd53f360ada37da25d3d650009b4c10274594a8faf4ed1c4d7591680e8f7f`（114 文件） | **未变**，与 FIX-P0-13/14 时完全相同——dist 是纯 TS 发行物，`src/` 0 改动 |
| RELEASE_MANIFEST.json | `5801092c6eef15e2a870062e8601465ed767935022436f74a37d0ddbefe39379` | 见下——**本次实测值，两次一致** |

试冻后已 `git checkout release/`，`release/` 恢复为 R2 正式产物（source.zip `3a778b93…`、dist.zip `da130ad2…`，已用 sha256sum 核对）。

### Manifest 哈希核查（R13 §6 的规则，本轮先用于自己的数字）

- **本轮 manifest 哈希 `5801092c…` 的测量方法**：在主仓库、代码提交 `5e3cda7` 上，于 2026-11-09 ~15:34–15:35 GMT 两次运行 `npm run release:freeze -- --trial`，每次从命令 stdout 打印的 `RELEASE_MANIFEST.json:` 一行直接读取哈希；两次均为同一值 `5801092c…`。**该值未从任何既往报告抄录**；与 FIX-P0-14 实测的 `5a89a52e…`（`45487eb`）不同是预期的——树已变（`oracle/` + 新 evidence/fixtures），而 source/dist 哈希的逐项对照见上表。
- 试冻 manifest 的 `inputs` 仍只记录到 R3（P2-R6-1，范围扩大到 R14；T014 重冻时须把 R4–R14 一并记入，非阻断）。

## 5. R14 报告对照

- R14 §2.5(a) unwrap：已按方向实现并双接线（trigger + jobs）；R14 注明的 jobs 模式 `jobs:` 分歧已验证并闭合（`a-jobs-only` jobs [1]/[1]）。11 残留行中 (a) 的 3 行（`a-flowmap-on`、`a-blockmap-on`、`x-tag-map-on`）全部 MATCH。
- R14 §2.5(b) 第二 anchor：已按方向实现；但 R14 称 `&x *y` 合法是错的——仅限空键位置（`m: &x *y` 与 `b: &x *y` 双边都拒），故 (b) 规则覆盖 AliasToken；`&x k: &y 1` 控制保持 MATCH。
- R14 §2.5(c) 键带 tag：已按方向实现；但 R14 称工作流内变体已被 R13 §4.2 覆盖是错的——单对位置（嵌套单对、流映射、块序列项）同样分歧，(c) 规则不限位置；glued 要求已按 E05 落实（`!foo &x : 1` 控制保持 MATCH）。
- R14 §2.5(d) unglued：已按方向实现（镜像 `hasUnrepresentableKey`）；tag 护栏经规则探针 + AST dump 钉死（§2.4）。
- R14 §2.5(e) 嵌套块映射：已按方向实现（块上下文限定、绕过 P0-C3 单对豁免）；流孪生 `x-nested-flow` 保持 MATCH。
- R14 §2 的“分类对齐是错误代码”异议：本轮未用分类对齐——全部 5 家族均按 R14 建议的机制方向修复（unwrap / 镜像拒收），无一处返回 `workflow_root_not_mapping`。
- R14 §6/§11：本轮 manifest 哈希 `5801092c…` 为自己两次试冻实测（见 §4），未抄既往报告；R15 须对本轮的 `5801092c…` 做同样的两次试冻复核。

## 6. R13 报告对照

- R13 的 lone-doc P0（`&x: 1` / `&x:` 单独，2 检查）未回归：R13 探针 98/98；五条件判别式的控制（`"": 1` 等）全部保持 MATCH；`_is_lone_anchored_empty_key_doc` 本身 0 改动（unwrap 是独立 helper，条件 5 取反）。
- R13 §4.2（流 KIND + P0-C3 豁免边）：本轮未动 C3；C3 域内形状（`f-c3-reject`、`f-c3-exempt`、`f-nested-single` 等）全部保持 MATCH，十矩阵重跑可证。
- P2-R13-1（fix-p0-12 `cases.json` 的 12 个过期标志）仍为已修复状态；fix-p0-14 矩阵 114/114（其标志已过期，见 §3）。

## 7. 诚实披露：本轮新发现的分歧（未修复）

本轮映射中新发现 3 组分歧，均不在 R14 的 5 个家族内，均已在 fix-p0-15 矩阵中标注 `known_divergence`（6 行，11 检查），未强行修复：

### 7.1 C3 对 tag + unglued anchored 空键在第 2 对及以后位置的越界触发（2 行，4 检查）

- 形状：`a: 1\n!foo &x : 2\non: push\njobs: {...}`（根第 2 对）与 `m:\n  a: 1\n  !foo &x : 2\n...`（嵌套第 2 对）：TS VALID / [1 job]，Oracle `yaml_parse_error` / []。
- 机制：yaml 包接受该形状（带 tag 的空键是显式键而非隐式键；E05 不触发因 anchor 后不是 `:`；`hasUnrepresentableKey` 不触发因键节点带 tag 且渲染为 `""`——经 `ast-dump.ts` 确认键节点 value=`""`、tag=`!foo`、anchor=`x`）；但 C3（`_reject_anchored_empty_key`）从 anchor 往回走过 TagToken 后即触发，不区分 tag + unglued + 非首对。反之，tag + unglued 作为**首对**时双边一致（lone-doc 接受；嵌套首对双边拒——`hasUnrepresentableKey` 触发，见 §2.4）。
- 未修复原因：收窄 C3 是对 FIX-P0-13/R13 已验证规则的改动，须另起一轮做专门的边界重验（R13 §4.2 的 16 形 + 本轮新增的 tag/unglued 位置矩阵），本轮不擅自改动。

### 7.2 无空格 `&x:!!str` 的扫描器层分歧（2 行，3 检查）

- 形状：`&x:!!str {on: push}`（trigger DIFF：TS VALID / Oracle `missing_on_key`；jobs MATCH）与 `&x:!!str\n  on: push\n  jobs: {...}`（trigger + jobs DIFF：TS VALID / [1 job]，Oracle `yaml_parse_error` / []，PyYAML ScannerError "mapping values are not allowed here"）。
- 机制：冒号后无空格时，PyYAML 根本不把 `:` 认作值指示符（流变体读成普通标量键 `':!!str {on'`；块变体扫描器直接抛错）——token walk 永远看不到 lone-doc 模式。闭合它们需要文本层的扫描器镜像，与本轮 token 规则是不同的机制类别。有空格的对应变体（`&x: !!str …`）已闭合（span 重解析，见 §2.1）。

### 7.3 `!!int` / `!!bool`（及 `!!float`）在映射/序列值上使 Oracle 崩溃（2 行，4 检查；探针脚本本身抛错）

- 形状：`&x: !!int {on: push}` 与 `&x: !!bool {on: push}`：TS VALID，Oracle 抛原生 `TypeError`（`int() can't convert non-string with explicit base` / `unhashable type: 'list'`）——`_StrictBaseLoader` 的构造器对错配的标量 tag 抛非 `yaml.YAMLError` 异常，`parse_workflow_yaml` 与 `extract_jobs` 只捕获 `yaml.YAMLError`，异常直接上抛，调用方崩溃。
- 范围（已验证，与位置无关）：`m: !!int {a: 1}`、`m: !!int [1, 2]` 同样崩溃（TS VALID）；`m: !!float {a: 1}` 抛 `AttributeError`。`!!str` 不崩溃（它构造节点 repr 字符串）——这正是 (a) 的 span 重解析能处理 `!!str` 的原因。`on: !!int {push: {}}` 双边均为 `yaml_parse_error`（MATCH）；标量上的 tag（`a: !!int 1`）双边 VALID。
- 未修复原因：这是既有的 Oracle 健壮性缺口（非分类分歧），不是 5 个家族之一；正确修复须先映射 `!!<类型>` 在集合节点上的完整边界并决定错误映射（仅把异常 catch 成 `yaml_parse_error` 仍与 TS VALID 不符——还须让 loader 忽略集合上的标量 tag，那是 loader 层面的改动）。留给后续轮次。

### 7.4 映射中排除的无效测试形状（非分歧）

- map5 的 `d-rootseq-item` 与 `d-rootseq-item-untagged`（根块序列后接 WF 后缀）是无效测试形状：根序列后的 `on:`/`jobs:` 行使文档本身在结构上非法，双边拒收的原因平凡，不携带关于 (d) 规则的信号——已从矩阵中排除（`gen-cases.py` 的 EXCLUDED，附注说明），不计入 §7 的分歧。

## 8. 后续

- 派遣 T013 R15（新会话、clean-clone only、代码提交 `5e3cda7`）；R15 通过后 T014 R3 正式重冻（manifest `inputs` 须记入 R4–R14，P2-R6-1）；再走终审 R3（同一立项对话，GPT-6 + 极高，Drive 插件尾）。
- R15 须重点复核：§7 的 3 组披露（C3 越界、扫描器层 `!!str`、loader 崩溃）是否构成新的 P0；以及本轮 manifest 哈希 `5801092c…` 的两次试冻复核。
- 站立 P2（8 项）不变：R2 的 6 项 + P2-R6-1（manifest `inputs` 只记到 R3，已扩大到 R14）+ P2-R6-2。
