# FIX-P0-17 任务报告 — 关闭 T013 R16 的 2 个 P0 家族 + 清除 P2-R16-1

- 代码提交：`50788a7`（2026-11-09 20:02 GMT，HEAD `cc901b8` 之上）
- 报告提交：本文件（单独提交）
- 工作目录：`~/workspace/p020-checkpath/`；`src/` **0 改动**（dist.zip 未变，见 §4）
- R16 评审证据：`evidence/review/INDEPENDENT_REVIEW_R16.md`（NOT PASS，P0 2 / P1 0 / P2 9）

## 1. 结论

R16 的 2 个新 P0 家族**全部关闭**，P2-R16-1 的 6 个过期标志**全部清除**，无回归、无新残差：

| 项目 | 结果 |
|---|---|
| R16 181 形探针 | **362/362 MATCH，0 DIFF**（原 331/362，31 DIFF） |
| fix-p0-17 网格（108 形，216 检查） | **216/216 MATCH，0 DIFF**（105 形基线 112/210；后补 3 个非粘连变体至 108 形；2 形为我写错用例后修正，见 §2.5） |
| R15 / R14 / R13 / R12 / R11 / R10 探针 | **122/122、78/78、98/98、118/118、74/74、88/88**，与 R16 评审员的重跑逐字节一致 |
| 十二矩阵 | fix-p0-04 **100/100**（其中 R5 66-case 子集 66/66）、05 **76/76**、06 **134/134**、07 **86/86**、08 **164/164**、09 **98/98**、10 **314/314**、11 **248/248**、12 **486/486**、13 **196/196**、14 **114/114**、15 **260/260（0 flagged）**；与 R16 评审员的重跑逐字节一致 |
| fix-p0-16 网格 | **238/238**（p1 54、p2 46、p3 82、p4 56），与提交结果逐形一致 |
| 新测试 | `absorbed-anchor-colon-p0-17.test.ts` **38/38**（37 形 + schema） |
| 验收电池 | 见 §3（npm test 1661/1661；s0:gate 哈希 `f511a847…` 未变） |
| Trial freeze | 两次三哈希一致，manifest `8a5a5aa1…`（见 §4） |

两族的修复方向均按 R16 §2.5，但 §2.2 的 `!` 守卫经实测**修正**了 R16 方向的一个错误（见下）：R16 说“`:` 后为非空白、非 `!` 时吸收”，实测证明 `:` 后接 `!` 时也应吸收——只要其后的 tag 被空白/EOL 正常终结；不吸收会保留一个 P0-2 mirror 的过触发分歧（`&x:!!tag` 根块映射，TS VALID / Oracle INVALID）。

## 2. 判别式推导（附控制形状，全部以运行结果为准）

### 2.1 P0-A：mirror 别名键豁免过度（7 形，13 检查 → 0 DIFF）

- **机制**：`&q:!!str *w: 2` 时，`_nospace_anchor_colon_is_key` 把别名键当作纯量键而返回 True，mirror 不触发，`:` 被当作标量的一部分；PyYAML 把 `:!!str *w` 读成普通标量键而接受。`yaml` 包则拒收（"An alias node must not specify any properties"）→ TS INVALID/yaml_parse_error。
- **修复**：`_nospace_anchor_colon_is_key` 的别名分支（`ch == "*"`）改为直接返回 False。别名键不再豁免 mirror；`check_value` 把 `:` 当作值指示符，扫描器拒收（与 TS 同码 yaml_parse_error）。纯量/引号标量分支不动。
- **关闭行**：R16 P0-A 全部 7 形（`a-alias-key`、`a-alias-key-push`、`a-alias-key-lone`、`a-alias-key-int`、`a-alias-key-custom`、`a-alias-seq-key`、`a-alias-undef-key`），trigger + jobs 共 13 检查（lone 形仅 trigger）。
- **控制形状**（必须不变，均已跑通）：
  - 纯量键 `a-ctrl-scalar-key`（`&q:!!str hello: 2`）、双引号 `a-ctrl-quoted-dq`、单引号 `a-ctrl-quoted-sq`、`?` 显式键 `a-ctrl-qmark`、带空格同形 `a-ctrl-spaced`（`&q: !!str *w: 2`）——双边同拒，mirror 的纯量/引号分支未动。
  - 值位置 `a-ctrl-value-pos`（`m: &q:!!str *w: 2`）、`on:` 值 `a-ctrl-on-value`——双边 INVALID，未变。
  - D 组边界：`d-alias-key-bool-tag`（`!!bool`）、`d-alias-key-nested`、`d-alias-key-second`、`d-alias-key-anchor-then`、`d-alias-key-two-props`、`d-alias-key-seq-item`——全部由别名分支关闭；flow 内别名键 `d-alias-key-flow`（`m: {&q:!!str *s: 5}`）与 `d-alias-key-flow-val` 不走 mirror（flow 内 `:` 已是值指示符），双边 INVALID 未变；tab 变体 `d-alias-key-tab` 与 `d-ctrl-plain-key-tab` 不走别名分支，未变。

### 2.2 P0-B：anchor 吸入 `:`（9 形，18 检查 → 0 DIFF）

- **机制**：`&q:2` / `&q:foo` 后接映射时，`yaml` 包把整个 `q:2` 吸进 anchor 名并接受；PyYAML 的锚名字符集不含 `:` 而 ScannerError。并行映射（`evidence/probes/fix-p0-17/anchor-chars.mjs`，逐字符实测）确认 npm 的 anchor 运行吸入除空白与流指示符 `,[]{}` 外的一切字符（含 `:` `.` `/` `;` `?` `=` `+` `$` `@` 反引号 `%` `#` `!` `&` `*` `|` `>` 引号 `(` `)` 反斜杠；多 `:` 如 `q:2:3`、`q::2` 均吸入）。
- **修复（i）**：`_StrictBaseLoader.scan_anchor` 覆盖（`fetch_anchor` 与 `fetch_alias` 均调用它，故 anchor 与 alias 同覆盖）：基底扫描后若下一字符为 `:`，按以下守卫决定是否吸收 `:` 及后续 anchor 字符（停于空白 / 流指示符 / `\0`）：
  - `:` 后为空白 / EOL / 输入末尾 → **不吸收**（C3 域 `&x: 1` 与 `&x:` null 豁免；`:` 仍为值指示符）。
  - `:` 后为流指示符（`,[]{}`）→ **不吸收**（`&x:,` 双边已拒收，控制形 `c-comma-colon`）。
  - `:` 后为 `!`（tag）→ **仅当 tag 被空白 / EOL / 输入末尾正常终结时吸收**；tag 与下个节点粘连（`&b:!!str{on: …}`）时不吸收，留给 P0-2 mirror / `scan_tag` 拒收（控制形 `c-tag-nobrace`，双边 INVALID 未变）。
  - 其余非空白、非 `!`、非流指示符字符 → **吸收**（含 `?`，控制形 `c-qmark-colon` `&x:?` 由 DIFF 转 MATCH；运行中后段的 `!` 如 `&q:2!zap` 随运行吸入，控制形 `c-tag-after`）。
  - 直接跟在 anchor 名后的非字母数字字符（无 `:`，如 `&q.5`、`&q!2`、`&q/2`）**不吸收**——PyYAML 基底扫描即 ScannerError，TS 经 `hasRejectedAnchorOrTag` 同拒，双边已 MATCH，锁为控制形（`c-dot-direct`、`c-bang-direct`、`c-slash-direct`）。
- **对 R16 §2.5 方向的修正（`!` 守卫）**：R16 说 `:` 后为非 `!` 时才吸收，是基于 P0-2 mirror 域的假设。实测反证：
  - `&x:!!tag` + 块映射（`c-tag-root-block`）：TS **VALID**（anchor `x:!!tag` 落在根映射上，`hasRejectedAnchorOrTag` 的 `keyPos` 在根位置为真，不触发），Oracle 经 P0-2 mirror **INVALID**——mirror 在此过触发。吸收后 Oracle VALID，MATCH。
  - `&x:!tag`（`c-tag-root-block-1`）同理。
  - `&b:!!str{on: …}`（`c-tag-nobrace`）：TS **INVALID**（tag 与 `{` 粘连，`hasRejectedAnchorOrTag` 的 tag 检查触发），吸收会把 tag 吞进 anchor 名而抹掉拒收 → 必须不吸收。两形的判别式正是 tag 是否被空白/EOL 终结（`_skip_tag` 前瞻判定，复用既有纯前瞻函数）。
  - 结论：吸收 `:` 后接 `!` 时以 tag 终结方式为判别式，而非一律不吸收。吸收后 P0-2 mirror 对 `:`-after-anchor 的情形不再可达（`:` 已被消费），成为死代码——保留在原位作安全网，不删除（见 §7）。
- **关闭行**：R16 P0-B 全部 9 形（`b-absorb-2`、`b-absorb-2-push`、`b-absorb-foo`、`b-absorb-hyphen`、`b-absorb-num`、`b-absorb-2x`、`b-absorb-value-pos`、`b-absorb-flow`、`b-absorb-lone`），trigger + jobs 共 18 检查。
- **控制形状**（必须不变，均已跑通）：`b-absorb-lone`（lone `&q:2`，同码 `workflow_root_not_mapping`）；`c-anchor-only-colon`（`&r:`，EOL 不吸收）；`c-space-after-colon`（`&r: 5`，C3 域）；`c-tag-colon`（`&r:!zap {on: schedule}` + WF，双边 INVALID）与 `c-tag-colon-lone`（lone，双边 UNKNOWN——mirror 触发后经 lone-doc unwrap 救回，吸收后同样 UNKNOWN）；`c-scalar-val`（`&r:5 1`，双边 INVALID）；`c-docmark`、`c-flow-seq`（`m: [&r:5]`，双边 UNKNOWN）、`c-two-anchors`（双边 INVALID）。

### 2.3 新拒收规则 (ii)：吸入冒号 anchor 不在隐式键位置

- **机制**：仅吸收（i）不足——`m: &q:2` 吸收后 Oracle 读成 `{'m': None}` 而 VALID，但 TS 经 `hasRejectedAnchorOrTag` 拒收（值位置，`:` 不在隐式键位置）；`m: {a: &q:2}` 同理（吸收后 VALID，TS INVALID）。吸收改变了 token 流，必须补一条位置镜像规则。
- **修复**：`_reject_absorbed_anchor_colon_value_position`——token 流 walk，凡 name 含 `:` 的 AnchorToken，用 `_absorbed_anchor_is_key_position`（`hasRejectedAnchorOrTag` 的 `keyPos` 镜像）判定键位置：flow 内仅当前一 token 为 `{` / `,` / `[` 或与 anchor 同起点的隐式 KeyToken 时为键位置；block 内除非同行 Value/Scalar 前置、显式 `?` KeyToken 前置、或另一属性（anchor/tag/alias）前置，否则为键位置（上一行 `:` / Scalar 打开嵌套映射即键位置）。不在键位置即抛 `yaml.YAMLError` → `yaml_parse_error`。
- **关闭行**：`b-absorb-value-pos`、`c-nested-map-val`（`m: &r:5` + 嵌套映射，规则 (ii) 触发才保住 MATCH）、`c-flow-val`（`m: {a: &r:5}`）、`p2-value-pos` / `p2-on-value` / `p4-flow-valpos-map` / `p4-flow-valpos-scalar`（fix-p0-16 网格重跑，见 §3）。
- **控制形状**：`c-seq-item`（`m: - &r:5` + `a: 1`，BlockEntry 前置 → 键位置，不触发，TS VALID）、`c-nested-value`（`m:` 下一行 `&r:5`，上一行 ValueToken → 键位置，不触发，TS VALID）、`c-nested-flow-key`、`c-flow-second` 由规则 (iii) 覆盖（见 §2.4）。

### 2.4 新拒收规则 (iii)：flow 映射中吸入冒号 anchor 作空键

- **机制**：flow 映射中 `yaml` 包把 anchor 后的节点读作该对的键；键为 null 或不可表示时 `hasUnrepresentableKey` 拒收。PyYAML 把 `:` 读作值指示符而接受该对（`""` 键）。
- **修复**：`_reject_flow_absorbed_anchor_null_key`——仅最内层帧为 flow 映射时触发；anchor 须在键位置（同 §2.3 的判定）：
  - anchor 后无 ValueToken、下一 token 为 flow 映射结束 / entry → 空键 → 拒收（`m: {&q:2}`、`m: {a: 1, &q:2}`、`m: {&r:5}` 嵌套）。
  - anchor 后有 ValueToken：未粘连（`m: {&q:2 : 1}`）→ 键为 null → 拒收；粘连时看其后节点——空值（`m: {&q:2: }`）、别名（`m: {&q:2: *s}`，别名带 anchor 属性）、第二 anchor（`m: {&q:2: &s 1}`）→ 拒收；标量 / tag（`m: {&q:2: 1}`、`m: {&q:2: !zap 1}`，`yaml` 包把该节点读作键）→ 不触发；集合起始 → 不触发（属 `_reject_flow_anchored_empty_key_collection`）。
  - **扩展到非吸入 anchor**：`m: {&r: }`（本轮网格新发现，见 §2.5）值为空时同理拒收；标量 / tag / 别名值时不触发（C3 flow 豁免，`m: {&r: 1}` 双边 VALID；别名值由 `_reject_second_anchor_on_value` 覆盖）。
- **关闭行**：`e-flow-null-key`、`e-flow-null-key-2nd`、`e-flow-colon-scalar`（粘连标量值，不触发，双边 UNKNOWN）、`e-flow-colon-tag`（粘连 tag 值，不触发）、`e-flow-colon-alias`（粘连别名，触发）、`e-flow-colon-anchor`（粘连第二 anchor，触发）、`e-flow-colon-spaced` / `e-flow-colon-tag-spaced` / `e-flow-colon-alias-spaced` / `e-flow-colon-anchor-spaced`（未粘连，触发）、`e-flow-key-scalar`（`m: {&r:5 hello: 1}`，anchor 后为标量键，不触发，双边 UNKNOWN）、`e-flow-key-map`（集合键，ConstructorError，双边 INVALID）。
- **控制形状**：`e-flow-ctrl-anchor-space`（`m: {&r: 1}`，C3 flow 豁免，双边 UNKNOWN）、`e-flow-ctrl-anchor-space-2nd`、`e-flow-val-null`（`m: {a: &r: }`，值位置双边 INVALID，未变）、`e-flow-colon-null` / `e-flow-colon-map`（双边 INVALID 未变）。

### 2.5 本轮网格新发现并关闭的形状（非 R16 原形）

- **`m: {&r: }`（`e-flow-null-spaced`）**：非吸入 anchor 的 flow 空键。TS INVALID（`hasUnrepresentableKey`，空键），Oracle UNKNOWN。同一机制（§2.4），规则 (iii) 扩展覆盖后 MATCH。R16 未测到。
- **`&x:!!tag` / `&x:!tag` 根块映射（`c-tag-root-block` / `c-tag-root-block-1`）**：见 §2.2，P0-2 mirror 过触发，吸收后 MATCH。R16 未测到。
- **`&x:?`（`c-qmark-colon`）**：`?` 在 anchor 运行内被吸入（npm anchor `x:?`），TS VALID，Oracle 原 INVALID；吸收后 MATCH。
- **`&r:5: 1` / `&r:5:` / `&r:5: {on: push}` lone 形（`g-lone-colon-scalar` / `g-lone-colon-eol` / `g-lone-colon-map`）**：吸收后经既有 lone-doc 分类器（`_is_lone_anchored_empty_key_doc` / `_unwrap_lone_anchored_empty_key_doc`）得到与 TS 相同的码（`workflow_root_not_mapping` / VALID），无需新规则。
- **`&r:5: {on: push}` + WF（`g-lone-absorb-map`）**：吸收后经 C3（首对空键 + 映射值，多对）拒收，与 TS INVALID 一致。
- **我写错后修正的 2 个用例**：`c-seq-item` 与 `c-nested-value` 初版把 `on:` / `jobs:` 写进了 `m:` 之下（TS 读作 `missing_on_key`），修正为根级 `on:` / `jobs:` 后 TS VALID、吸收后 Oracle VALID。初版基线 94/184 中的这两处 DIFF 是用例错误，不是代码分歧；修正后网格为 108 形。

### 2.6 P2-R16-1：6 个过期 `known_divergence` 标志

fix-p0-15 矩阵的 6 行（`x-c3-overfire-tag-unglued-2nd`、`x-c3-overfire-tag-unglued-2nd-nested`、`a-str-flow-nospace`、`a-str-block-nospace`、`a-int-flow-space`、`a-bool-flow-space`）先逐行验证 trigger + jobs 全部 MATCH（260/260，其中 12 检查为已标记），再以 `sed` 文本级翻为 `false`（仅改 6 行，格式保留，未用 `json.dumps` 重序列化；翻转前 cases.json 已备份至 `evidence/probes/fix-p0-17/reruns/fix-p0-15-cases-before-flag-clear.json`）。翻转后重跑：**260/260 MATCH，0 flagged**。`note` 字段保留原文作历史记录。

## 3. 验收（全部在代码提交 `50788a7` HEAD 上亲自重跑）

| 检查 | 结果 |
|---|---|
| `npm test` | **1661/1661，52 文件**（基线 1623/1623，51 文件；+38 为新测试文件） |
| `npm run test:oracle` | 167 fixtures，0 mismatch，0 false PASS |
| `npm run typecheck` | 通过（无错误） |
| `npm run s0:oracle` | 24/24，0 mismatch，0 false PASS |
| `build-golden.py --check-only` | golden cases 167，通过 |
| `npm run s0:gate` | **PASS**；oracle 24/24，determinism 100 runs 1 unique hash；`gate_report_sha256=f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`（未变） |
| `npm run release:verify` | **PASS**；license guard 仍 PENDING_SAM_DECISION |
| trigger / jobs / checks / witness | **128 / 48 / 46 / 44**，全部 0 mismatch（基线） |
| R16 181 形探针 | **362/362 MATCH，0 DIFF**（原 331/362） |
| R15 61 行探针 | **122/122 MATCH**（与 R16 评审员重跑逐字节一致） |
| R14 39 行探针 | **78/78 MATCH**（同上） |
| R13 49 行探针 | **98/98 MATCH**（同上） |
| R12 59 行探针 | **118/118 MATCH**（同上） |
| R11 37 行探针 | **74/74 MATCH**（同上） |
| R10 44 行探针 | **88/88 MATCH**（同上） |
| 十二矩阵 | fix-p0-04 **100/100**（其中 R5 66-case 子集 66/66）、fix-p0-05 **76/76**、fix-p0-06 **134/134**、fix-p0-07 **86/86**、fix-p0-08 **164/164**、fix-p0-09 **98/98**、fix-p0-10 **314/314**、fix-p0-11 **248/248**、fix-p0-12 **486/486**、fix-p0-13 **196/196**、fix-p0-14 **114/114**（0 flagged）、fix-p0-15 **260/260**（0 flagged；与 R16 评审员重跑逐字节一致，清标志前为 12 flagged） |
| fix-p0-16 网格 | p1 **54/54**、p2 **46/46**、p3 **82/82**、p4 **56/56**，合计 **238/238**，与提交结果逐形一致 |
| fix-p0-17 网格 | **216/216 MATCH，0 DIFF**（108 形 × trigger+jobs） |
| 新测试 | `absorbed-anchor-colon-p0-17.test.ts` **38/38**（1 schema + 37 形状） |

## 4. Trial freeze（代码提交后，两次；manifest 哈希实测方法见下）

两次 `npm run release:freeze -- --trial`（HEAD `50788a7`，2026-11-09 ~20:03 GMT）三哈希完全一致，确定性成立：

| | 第 1 次 | 第 2 次 |
|---|---|---|
| source.zip | `fc9d951865bcc6f1ff58d622e8decd05ac6df8f4b0b8ef5d4e3838013218ea80`（2573 文件） | 同左 |
| dist.zip | `f2bcd53f360ada37da25d3d650009b4c10274594a8faf4ed1c4d7591680e8f7f`（114 文件） | 同左 |
| RELEASE_MANIFEST.json | `8a5a5aa1a873a431923d1d3feb02580a25383c5678d8af87c2d432bc0be1a2d3` | 同左 |

- **本轮 manifest 哈希 `8a5a5aa1…` 的测量方法**：在主仓库、代码提交 `50788a7` 上，于 2026-11-09 ~20:03 GMT 两次运行 `npm run release:freeze -- --trial`，每次从命令 stdout 打印的 `RELEASE_MANIFEST.json:` 一行直接读取哈希；两次均为同一值 `8a5a5aa1…`。**该值未从任何既往报告抄录**；与 FIX-P0-15 实测的 `5801092c…`、FIX-P0-16 实测的 `17f06f86…` 不同是预期的——树已变（`oracle/` + 新 evidence/fixtures/tests），而 source/dist 哈希的逐项对照见下表。
- source.zip 与 R2 的 `3a778b93…` 不同是预期的（代码已改，2573 文件 vs R2 的 1209 文件——新增 evidence/fixtures/tests 均计入 source）；dist.zip 与 FIX-P0-16 的 `f2bcd53f…` 相同是预期的（`src/` 0 改动）。
- `git checkout release/` 后 R2 正式件已恢复：source.zip `3a778b93…`、dist.zip `da130ad2…`（sha256sum 核对一致）。

## 5. R16 报告对照

| R16 家族 | R16 行数 | 本轮结果 |
|---|---|---|
| P0-A mirror 别名键豁免过度 | 7 行，13 检查 | 全部关闭（R16 探针 362/362） |
| P0-B anchor 吸入 `:` | 9 行，18 检查 | 全部关闭（R16 探针 362/362） |
| P2 共 9 项 | — | P2-R16-1 已清（fix-p0-15 6 标志翻 false，260/260 MATCH，0 flagged）；其余 8 项不变（R2 的 6 项 + P2-R6-1 + P2-R6-2，T014 时处理） |
| R16 报告 §2.5 的修复方向 | — | 两族均按既定方向关闭，但 `!` 守卫经实测修正（§2.2）：`:` 后接 `!` 时以 tag 终结方式为判别式，而非一律不吸收；未改分类对齐；无家族被判定为不可关闭 |

## 6. R15 报告对照

R15 的 3 个 P0 家族未回归：R15 探针 122/122 MATCH；fix-p0-16 网格 238/238 MATCH；R14 探针 78/78 MATCH。P0-2 的 2 行（`&b:!!str {on: pull_request}` flow + `&b:!!str` block）经吸收同样关闭（§2.2 的逐形核对），mirror 的过触发形（`&x:!!tag` 根块映射）是本轮新发现并关闭的，不在 R15 原形内。

## 7. 诚实披露（§7）

- **本轮新发现并关闭的分歧（3 形族，均不在 R16 原形内）**：`m: {&r: }`（非吸入 anchor 的 flow 空键，§2.4 扩展覆盖）；`&x:!!tag` / `&x:!tag` 根块映射（P0-2 mirror 过触发，§2.2）；`&x:?`（`?` 被吸入 anchor 名，§2.2）。三者均已关闭，无残差。
- **P0-2 mirror 现为死代码**：吸收（i）消费了全部 `:`-after-anchor 的 `:`，`check_value` 的 mirror 分支不再可达。保留在原位（不删除）：若未来某路径的 anchor token 未经理吸收扫描（如新的扫描入口），mirror 仍是安全网；其 `_mirror_anchor_end_index` 记录亦不受影响（吸收只移动 token 结束索引，而 mirror 只对未被吸收的 `:` 咨询该索引）。
- **未修复、无残差的边界**：直接跟在 anchor 名后的非字母数字字符（`&q.5`、`&q!2`、`&q/2` 等，无 `:`）——双边已同拒（`hasRejectedAnchorOrTag` / ScannerError），不是分歧，锁为控制形；未将其纳入吸收范围（R16 P0-B 的家族边界是 `:` 触发）。
- **`&x:,`（`:` 后接流指示符）**：双边 INVALID，不吸收，锁为控制形；其机制（block 内 anchor 后接 `,`）未再深挖——双边一致，无需修复。
- **R14 / R15 探针的 stale-flag 行**（R14 22 行、R15 24 行，expected-DIFF 但现 MATCH）：早先修复已关闭的旧标记，非本轮引入；与 R16 评审员的重跑逐字节一致。本轮未动 R14/R15 的 cases.json（P2-R6-1 / P2-R6-2 的清理属 T014 范围）。
- **无其他已知分歧**：本轮探针空间（R16 362 + fix-p0-17 216 + 十二矩阵 2276 + fix-p0-16 网格 238 + R10–R15 578 检查）全部 MATCH；§7 无未修复的分歧待披露。

## 8. P2 状态（更新后）

P2 总数现为 **8** = R2 的 6 项（clean-dir-without-.git 冻结限制；README 性能单快照；Windows PowerShell NOT_TESTED；USER_VALUE_NOT_MEASURED；source.zip 单代滞后；manifest freeze_commit PENDING by design）+ P2-R6-1（manifest `inputs` 仅记录到 R3，T014 时扩展到 R17）+ P2-R6-2（评审探针证据仅在 /tmp + 报告；已部分缓解——R9–R16 探针与本轮 fix-p0-17 探针均在仓库内）。P2-R16-1 已清（§2.6）。
