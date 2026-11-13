# FIX-P0-16 任务报告（T013 R15 的 3 个 P0 家族 + 网格残差 + P2-R15-1）

- **结论**：R15 的 3 个 P0 家族（13 行，24 检查）已全部关闭。R15 探针重跑 **122/122 MATCH**（原 98/122）；R14 探针 **78/78 MATCH**（R14 的 5 个 P0 家族未回归）；R13/R12/R11/R10 探针全部 MATCH；全部验收在代码提交 HEAD 上亲自重跑通过；`src/` 0 改动；S0 门哈希未变；trial freeze 两次三哈希一致；`release/` 已恢复为 R2 正式件。可派遣 R16（新会话、clean-clone only、代码提交 `6821ed0`）。
- 代码提交：`6821ed0`（2026-11-09 ~17:54 GMT，70 文件，+5348/−576 行；其中 `oracle/checkpath_oracle/parser.py` +525/−22 行，2563 → 3066 行）。
- 本报告提交：见 `handoff/P020-FIX-P0-16/TASK_REPORT.md`（本文件）。
- 接手说明：本轮由新协调员（会话 `9f898cef`）接手，前一协调员（~16:14 GMT 派出）因发现树中有另一方（已关闭的 R15 审阅代理）留下的映射脚本而停工，未改任何代码。本轮采用了该代理留下的两脚本（`evidence/probes/fix-p0-16/map-p0-16.py`、`map2-p0-16.py`），但**每个数字都亲自重跑验证**，不盲信其输出；并扩展了 p4 组（从 13 形到 28 形）与全部判别式。

## 1. 改了什么

全部改动都在 Oracle 侧（`oracle/checkpath_oracle/parser.py`），`src/` 0 改动（dist.zip 未变可证）。新增 1 个 loader 分支 + 1 个 scanner mirror + 2 条 `_reject_*` 规则，C3 缩窄 1 处，接线进 `parse_workflow_yaml` 与 `extract_jobs` 的同一 try 块（与既有规则同列）：

| 家族 | 函数 / 位置 | 方向 |
|---|---|---|
| P0-1 C3 越界 | `_reject_anchored_empty_key`（C3）缩窄 | 候选带 `has_tag`（从 anchor 往回走过的 TagToken 数）；触发循环跳过 `has_tag and not glued` 的候选（tag+unglued 在除对值块映射首对外处处被 yaml 包接受） |
| P0-2 扫描器层 | `_StrictBaseLoader` 的 `get_token` / `fetch_anchor` / `check_value`（scanner mirror）+ 全部 13 处 `yaml.scan` 改用 `Loader=_StrictBaseLoader` | 当前字符是 `:`、下一字符是 `!`、上一个取出的 token 是 AnchorToken、指针在记录的 anchor 结束索引处（glued）、anchor 在键位置且 tag 后不是标量/别名键时，把 `:` 当作值指示符 |
| P0-3 loader 边界 | `_StrictBaseLoader._construct_core_scalar` | 节点是 MappingNode / SequenceNode 时按种类构造（`construct_mapping` / `construct_sequence`），忽略标量 tag，与 yaml 包一致（yaml 包只报 `YAMLWarning: Unresolved tag`，仍把集合解析为映射并接受为 VALID） |
| 网格残差：tag 无 anchor 空键 | `_reject_tagged_empty_key`（新规则） | tag+空键、无 anchor，作为对值块映射首对时拒收（规则 (d) 的 tag 护栏，anchor-less 版） |
| 网格残差：flow 锚定集合键 | `_reject_flow_anchored_empty_key_collection`（新规则） | flow 映射中锚定空键的值是集合时拒收；仅当最内层帧是 flow 映射时触发 |

另新增：32 个 vitest fixtures（`tests/fixtures/parser-divergence/anchored-empty-key-p0-16/` + `expected.json`，生成器 `evidence/probes/fix-p0-16/gen-expected-p0-16.ts`，写盘前先验双边一致）+ 测试文件 `tests/unit/diff-boundaries/anchored-empty-key-p0-16.test.ts`（33 测试：1 schema + 32 形状，含显式双边一致断言）。
另：P2-R15-1 已清——`evidence/probes/fix-p0-14/cases.json` 的 11 个过期 `known_divergence` 标志翻为 false（先验每行确为 MATCH，见 §3），`sed` 文本级翻转以保留原文件格式（初版 `json.dumps` 重序列化改了全文件格式，已撤回重做）。

## 2. 每家族的判别式推导（附控制形状）

推导方法：先做解析器层并行映射（npm `yaml` vs PyYAML `_StrictBaseLoader` + token dump），再用端到端探针（TS bundle + Oracle 驱动，全 JSON 比对）逐形确认——解析器层映射会误导（FIX-P0-11 教训），端到端为准。映射轮次：`map-p0-16.py`（p1 27 / p2 23 / p3 41 / p4 28 形）→ `map2-p0-16.py`（端到端全组，119 形 × 2 模式 = 238 检查）→ `ast-dump-p0-16.mjs`（flow 族机制的 npm AST 证实）。基线（HEAD `ba71eed`，本轮亲自重跑）：p1 28/54、p2 32/46、p3 35/82、p4 10/26。

### 2.1 P0-1 C3 越界：tag + unglued 的候选只在对值块映射首对被拒

- **机制**：C3（`_reject_anchored_empty_key`）在 anchor 前走过 TagToken 后触发，不区分 tag+unglued 与位置。yaml 包在除“对值块映射的首对”外的所有位置都接受 tag+unglued 的锚定空键（把它渲染为空字符串 `""` 带 tag+anchor，`hasUnrepresentableKey` 需 null 值故不触发）；只有对值块映射首对才把它渲染为 null 值空范围纯量从而触发 `hasUnrepresentableKey`——而该位置已被规则 (d) 覆盖。
- **修复**：候选携带 `has_tag`；触发循环跳过 `has_tag and not glued` 的候选。Tagged glued 与 untagged 候选不受影响。
- **控制形状（均已跑通）**：
  - 仍拒收：`m:\n  !bar &b : 2`（嵌套首对，(d)）、`a: 1\n!bar &b: 2`（tag+glued，(c)）、`a: 1\n&b : 2`（untagged unglued，(d)）、`a: 1\n&b: 2`（untagged glued，C3）。
  - 仍接受：R13 §4.2 的 9 形豁免边（`&b:` 首对 null glued 等）——本轮在 p1 组内重验，未回归。
  - FIX-P0-15 报告 §2.4 曾称根首对 `!foo &x : 1` 是控制——R15 已证该 claim 错误（C3 在该处触发，是 DIFF）；本轮所有控制 claim 均以运行结果为准，不抄报告。
- **关闭行**：R15 P0-1 的 3 行（根首对 / 根第 2 对 / 嵌套第 2 对），6 检查。

### 2.2 P0-2 扫描器层：`&x:!!tag` 无空格时 `:` 不是值指示符

- **机制**：块上下文中 PyYAML 要求 `:` 后有空白才认作值指示符；`&b:!!str` 无空格时，flow 变体把 `':!!str {on'` 读成纯量键，块变体抛 `ScannerError: mapping values are not allowed here`——token walk 永远看不到 lone-doc 模式。npm `yaml` 把 `:` 吸进 anchor 名（`&b:`），读出后面的 tagged 节点。`&b:2` / `&b:foo` 被整个吸进 anchor 名，文档为 null（与 Oracle 的 `workflow_root_not_mapping` 同码，已 MATCH，端到端确认）。
- **修复**：`_StrictBaseLoader` 覆写 `get_token`（记录 `_last_taken_token`）、`fetch_anchor`（记录 `_mirror_anchor_end_index` 与 `_mirror_anchor_key_position`，复刻 `Scanner.fetch_anchor`）、`check_value`（仅块上下文；当前字符 `:`、下一字符 `!`、指针 == 记录的 anchor 结束索引（glued）、anchor 在键位置、且 tag 后节点不是标量/别名键时返回 True）。辅助：`_skip_tag`（逐字 `!<…>`、处理 `!h!suffix`、简写 `!suffix`、裸 `!`）与 `_nospace_anchor_colon_is_key`（从 `self.pointer` 用 `self.peek()` 做文本前瞻：跳过 tag、仅空格/制表符、最多 4 个 `&name`/`!tag` 属性，再检查其后是否为同行带 `:` 的纯量/引用标量或别名）。全部 13 处 `yaml.scan` 调用点改用 `Loader=_StrictBaseLoader`（拒收规则 + `_unwrap_lone_anchored_empty_key_doc` + `_is_lone_anchored_empty_key_doc），同一 token 流；未镜像的扫描曾对块 lone-doc 抛 stale-simple-key ScannerError（传为 yaml_parse_error）且看不到镜像 ValueToken，致 C3 漏掉 p2-root-second。
- **mirror 触发边界（均已跑通）**：
  - 必须触发：隐式键位置（行首 / `-` 后 / 上一行 `:` 后）与 anchor 跟在另一属性后（prevProp，`!foo &b:!!str {…}`——TS 经 E05 拒收，Oracle 经规则 (c) 镜像，需镜像 ValueToken）。
  - 必须不触发：值位置（`m: &b:!!str {a: 1}`、`on: &b:!!str {push: {}}`——TS 经 hasRejectedAnchorOrTag 拒收，Oracle 无对应拒收规则，触发会把 MATCH 的 yaml_parse_error 变成假 VALID/UNKNOWN）；`?` 之后；tag 后节点是标量/别名键（`&b:!!str hello: 1`——npm 把标量读作该对的键；PyYAML 在 tag 后 `allow_simple_key` 为 False，无法把 tag 后的标量存为可能简单键，触发会抛 `mapping values are not allowed here`）。
  - 不受影响：带空格变体（已关闭）、引号标量/注释/纯量中段的模式（scanner 只对真实 `:` token 到达 `check_value`，永不进入标量内部）。
  - `p2-str-nobrace`（`&b:!!str{on: …}`）经 `scan_tag` 的 tag 后检查自行修复（tag 后跟 `{` → ScannerError → yaml_parse_error，与 TS 一致）。
- **关闭行**：R15 P0-2 的 2 行（flow + block），3 检查。
- **(c) 交互形状**：`!foo &b:!!str {on: x}`——npm 接受为映射，但规则 (c) 的判别式（Key, Tag+, Anchor, Value, glued）会触发；本轮确认端到端 TS 的裁决是 yaml_parse_error（E05），故 mirror 在 prevProp 时触发、(c) 触发，两边一致为 INVALID（p4-tag-anchor-nospace ×2，4 检查，见 §2.4）。

### 2.3 P0-3 loader 边界：标量 tag 在集合值上

- **机制**：`_StrictBaseLoader` 对不匹配的标量 tag 抛非 `yaml.YAMLError` 异常（`!!int` → `TypeError: int() can't convert non-string with explicit base`；`!!bool` → `TypeError: unhashable type: 'list'`；`!!float` → `AttributeError: 'list' object has no attribute 'lower'`），而 `parse_workflow_yaml` 与 `extract_jobs` 只捕 `yaml.YAMLError`——探针驱动 exit 1。`!!str` 把集合渲染为节点 repr 字符串，致 `on` 值 UNKNOWN。npm 只报 `YAMLWarning: Unresolved tag`，仍把集合解析为映射并接受为 VALID。
- **修复**：`_construct_core_scalar` 中节点非 ScalarNode（MappingNode/SequenceNode）时按种类构造（`construct_mapping` / `construct_sequence`），忽略标量 tag——与 npm 一致，也与 PyYAML 自身的未知 tag 回退一致。集合用作映射键时仍从 `construct_mapping` 抛 `ConstructorError`（`yaml.YAMLError`，“found unhashable key”），与 TS 的 yaml_parse_error 一致（p3-map-key 自行修复）。
- **控制形状**：`a: !!int 1`（标量值，正常）等标量 tag 形状未变；`!!null` / `!foo` / `!!timestamp` / `!!set` 在集合值上的边界均在 p3 组内跑通。
- **关闭行**：R15 P0-3 的 8 行（lone-doc 4 行 + `on:` 值位置 4 行，含 NEW 的 `on: !!int/!!bool/!!float/!!str {push: {}}`），15 检查。FIX-P0-15 报告 §7.3 曾称 `on: !!int {push: {}}` 双边 yaml_parse_error——R15 已证该 claim 错误（TS VALID，Oracle 崩溃 exit 1）。

### 2.4 网格残差：本轮探针发现并关闭的 3 个形状族

- **tag 无 anchor 空键**（`_reject_tagged_empty_key`，3 形 6 检查：p1-tag-no-anchor、p4-tag-noanchor-null、p4-tag-noanchor-deep）：TS 经 `hasUnrepresentableKey` 拒收裸 tag 空键（null 值纯量、空范围），但**仅**作为对值块映射的首对；其余位置（lone doc、根映射首/次对、对值映射第 2 对、flow 映射、块序列项映射、引号空键、tag 标量键）yaml 包渲染为空字符串 `""` 带 tag，`hasUnrepresentableKey` 不触发，双边 VALID。判别式与规则 (d) 的 tag 护栏完全一致，只是 anchor-less——(d) 要求有 anchor，故单独立规则。17 形并行映射定界。
- **flow 锚定集合键**（`_reject_flow_anchored_empty_key_collection`，6 形 12 检查：p2-flow-map + p4-flow-notag/seq/second/spaced/blockseq）：flow 映射中 `:` 已是值指示符，PyYAML 建对（`""` 键、集合值），而 npm 把集合读作键（AST 证实：键节点为 YAMLMap/YAMLSeq，anchor `b:!!str`，值为 null）→ `hasUnrepresentableKey` → yaml_parse_error；标量值则读作标量键，双边 VALID。判别式：Key, [Tag]*, Anchor, Value, [Tag]*, 集合起始 token，**仅当最内层帧是 flow 映射**。边界均已跑通：块对带集合值（`m:\n  &b: {a: 1}`）双边 VALID（yaml 包读作空字符串键，非集合键）；flow 序列项对（`m: [&b: {a: 1}]`）双边 VALID；flow 标量值双边 VALID；空格变体与无空格同 token 流（无 glued 条件）；flow 值位置（`m: {a: &b: {c: 1}}`）双边已拒收，无需覆盖；tag+glued 集合情形与规则 (c) 重叠且一致（同拒收）。
- **(c) 交互**（p4-tag-anchor-nospace ×2，4 检查）：见 §2.2 末段。mirror 的 prevProp 扩展（`_mirror_may_fire`：前一 token 为 Anchor/Tag/Alias 时返回 True；仅 KeyToken（`?`）与同行 Value/Scalar token 阻断触发）使 (c) 得以触发；扩展后重跑 p1/p2/p3/p4 无回归。

## 3. 验收（全部在代码提交 `6821ed0` HEAD 上亲自重跑）

| 检查 | 结果 |
|---|---|
| `npm test` | **1623/1623，51 文件**（基线 1590/1590，50 文件；+33 为新测试文件） |
| `npm run test:oracle` | 167 fixtures，0 mismatch，0 false PASS |
| `npm run typecheck` | 通过（无错误） |
| `npm run s0:oracle` | 24/24，0 mismatch，0 false PASS |
| `build-golden.py --check-only` | golden cases 167，通过 |
| `npm run s0:gate` | **PASS**；oracle 24/24，determinism 100 runs 1 unique hash；`gate_report_sha256=f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`（未变） |
| `npm run release:verify` | **PASS**；license guard 仍 PENDING_SAM_DECISION |
| trigger / jobs / checks / witness | **128 / 48 / 46 / 44**，全部 0 mismatch（基线） |
| R15 61 行探针 | **122/122 MATCH，0 DIFF**（原 98/122；FLAG STALE 行为预期 DIFF 的残差行现 MATCH） |
| R14 39 行探针 | **78/78 MATCH** |
| R13 49 行探针 | **98/98 MATCH**（含 R6 5 形状 10/10） |
| R12 59 行探针 | **118/118 MATCH** |
| R11 37 行探针 | **74/74 MATCH** |
| R10 44 行探针 | **88/88 MATCH** |
| fix-p0-16 网格 | p1 **54/54**、p2 **46/46**、p3 **82/82**、p4 **56/56**，合计 **238/238**（119 形；基线 p1 28/54、p2 32/46、p3 35/82、p4 10/26） |
| 十二矩阵 | fix-p0-04 **100/100**（其中 R5 66-case 子集 66/66）、fix-p0-05 **76/76**、fix-p0-06 **134/134**、fix-p0-07 **86/86**、fix-p0-08 **164/164**、fix-p0-09 **98/98**、fix-p0-10 **314/314**、fix-p0-11 **248/248**、fix-p0-12 **486/486**、fix-p0-13 **196/196**、fix-p0-14 **114/114**（0 flagged，已清 P2-R15-1）、fix-p0-15 **260/260**（12 检查的 known-divergence 标志现为 stale，见 §7） |
| 新测试 | `anchored-empty-key-p0-16.test.ts` **33/33**（1 schema + 32 形状） |

## 4. Trial freeze（代码提交后，两次；manifest 哈希实测方法见下）

两次 `npm run release:freeze -- --trial`（HEAD `6821ed0`，2026-11-09 ~17:54–17:55 GMT）三哈希完全一致，确定性成立：

| | 第 1 次 | 第 2 次 |
|---|---|---|
| source.zip | `3ede7ad7c546d278f3a4d79e552e952a2529818698db13eab8b350e9abb815c6`（2473 文件） | 同左 |
| dist.zip | `f2bcd53f360ada37da25d3d650009b4c10274594a8faf4ed1c4d7591680e8f7f`（114 文件） | 同左 |
| RELEASE_MANIFEST.json | `17f06f8628b4e6006e19e9354c2b07935cc0723878e147ea134339ccad422a18` | 同左 |

- **本轮 manifest 哈希 `17f06f86…` 的测量方法**：在主仓库、代码提交 `6821ed0` 上，于 2026-11-09 ~17:54–17:55 GMT 两次运行 `npm run release:freeze -- --trial`，每次从命令 stdout 打印的 `RELEASE_MANIFEST.json:` 一行直接读取哈希；两次均为同一值 `17f06f86…`。**该值未从任何既往报告抄录**；与 FIX-P0-15 实测的 `5801092c…`（`5e3cda7`）不同是预期的——树已变（`oracle/` + 新 evidence/fixtures/tests），而 source/dist 哈希的逐项对照见下表。
- source.zip 与 R2 的 `3a778b93…` 不同是预期的（代码已改）；dist.zip 与 R15 的 `f2bcd53f…` 相同是预期的（`src/` 0 改动）。
- `git checkout release/` 后 R2 正式件已恢复：source.zip `3a778b93…`、dist.zip `da130ad2…`（sha256sum 核对一致）。

## 5. R15 报告对照

| R15 家族 | R15 行数 | 本轮结果 |
|---|---|---|
| P0-1 C3 越界 | 3 行，6 检查 | 全部关闭（R15 探针 122/122） |
| P0-2 扫描器层 | 2 行，3 检查 | 全部关闭 |
| P0-3 loader 边界 | 8 行，15 检查 | 全部关闭 |
| P2 共 9 项 | — | P2-R15-1 已清（fix-p0-14 11 标志翻 false，114/114 MATCH，0 flagged）；其余 8 项不变（R2 的 6 项 + P2-R6-1 + P2-R6-2，T014 时处理） |
| R15 报告 §2.5 的“原则上可行”方向 | — | 三族均按既定方向关闭，未改分类对齐；无家族被判定为不可关闭 |

## 6. R14 报告对照

R14 的 5 个 P0 家族未回归：R14 探针 78/78 MATCH；fix-p0-15 矩阵 260/260 MATCH；R13 探针 98/98 MATCH。

## 7. 诚实披露：本轮新发现的分歧（未修复）

**本轮未发现新的分歧。** 探针网格（p1–p4，119 形 238 检查）、十二矩阵、全部既往探针（R10–R15）均已全 MATCH；除下述两项“标志过期”（非分歧）外，无任何行/检查处于 DIFF：

- **fix-p0-15 矩阵的 12 个 known-divergence 标志现为 stale**：6 行（`x-c3-overfire-tag-unglued-2nd`、`x-c3-overfire-tag-unglued-2nd-nested`、`a-str-flow-nospace`、`a-str-block-nospace`、`a-int-flow-space`、`a-bool-flow-space`）在 FIX-P0-15 §7 中被披露为残差（预期 DIFF），本轮关闭后现为 MATCH（260/260），标志过期。本轮**未**翻动 `fix-p0-15/cases.json`（那是 FIX-P0-15 的证据原文；R16 审阅时将看到 260/260 与 stale 标志并自行判断）。与之对比，P2-R15-1 的 fix-p0-14 11 标志是本轮任务明令清除的，已翻为 false。
- **R15 探针的 FLAG STALE 行**：同理，R15 探针中预期 DIFF 的残差行现 MATCH（探针输出 `FLAG STALE … expected DIFF, got MATCH`），计入 122/122 MATCH；`evidence/probes/r15/results.json` 已按重跑结果更新（98/24 → 122/0），未改 `cases.json`（审阅证据原文不动）。

边界探针中曾考察但**未**改动的形状（均已跑通为 MATCH，非分歧）：`p2-plain-key`（`&b:!!str hello: 1`，mirror 不触发，标量键）；`p2-value-pos` / `p2-on-value`（值位置，mirror 不触发，双边 yaml_parse_error）；`p4-flow-valpos-*`（flow 值位置，双边已拒收）；`p4-block-coll-*`（块对带集合值，双边 VALID）；`p4-flow-seqitem-*`（flow 序列项对，双边 VALID）；`p3-map-key`（tag 映射作键，`ConstructorError` 与 TS 一致）。

## 8. 后续

- 派遣 T013 R16（新会话、clean-clone only、代码提交 `6821ed0`）；R16 应重跑 13 个 R15 残差行 + §4 边界探针 + 十二矩阵 + R5 66-case 子集 + fix-p0-16 网格 + manifest 哈希核验，并探查 (c) 与 `!foo &b:!!str` 的交互边。
- 若 R16 PASS → T014 R3 正式重冻（manifest `inputs` 须记入 R4–R15，P2-R6-1；清除 fix-p0-15 的 6 行 stale `known_divergence` 标志）→ Drive 重归档进**新文件夹 01_release_R3**（勿覆盖 R1/R2）→ 终审 R3（同一立项对话，GPT-6 + 极高，Drive 插件尾）→ PASS 后验收闭环（verdict + 完成通知进 Drive，FACTORY_INDEX P020 = ACCEPTED，先拉 Drive 最新 + diff）→ 向 Sam 汇报 → **立即开始 P021 立项**（GitHub-trending 规则，高星/收购潜力，零真人）。
- 若 R16 再发现 P0 → 下一 FIX 轮，同模式。
- 站立 P2（8 项）不变：R2 的 6 项 + P2-R6-1（manifest `inputs` 只记到 R3，已扩大到 R15；T014 重冻时须把 R4–R15 一并记入，非阻断）+ P2-R6-2。
- 桥 token 说明（供主控参考，非本轮工作）：桥 token 在 17:41–17:46 GMT 自行续期（新 exp 19:07:35Z），16:53 的未自动续期为一次性现象，非续期机制损坏；每时边界仍需观察。
