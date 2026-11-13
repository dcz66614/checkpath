# FIX-P0-13 任务终报 — R12 P0-C1（`,`-suffix）、P0-C2（`[`/`]`-suffix）、P0-C3（anchored empty key）已关闭

## 1. 根因

R12（`evidence/review/INDEPENDENT_REVIEW_R12.md`，59 形状 × 2 = 118
检查，94/118 MATCH）的 24 个 DIFF 全部落在 FIX-P0-12 报告 §7
已披露的 12 个残留行上，独立复核将其定为 3 个新 P0：

- **P0-C1 — `,`-suffix 族**（A60、X04、Y03、Y05、Y08、Y09、Y10 +
  X11 block 变体；16 检查）。PyYAML 的 `scan_tag_uri` 把 flow
  `,` 吃进 tag 后缀（URI 字符集含 `,`），随后解析器在 flow
  mapping 内失败（TS VALID vs Oracle INVALID，共 7 行）；block
  语境下方向相反（X11：TS 拒绝，Oracle 接受）。
- **P0-C2 — tag 后缀 `[`/`]` 字符集**（A70、X08、X09；6 检查）。
  PyYAML 的 URI 字符集含 `[`/`]`，npm 在此处截断 tag（TS
  INVALID vs Oracle VALID）。
- **P0-C3 — anchored empty key**（A45；2 检查）。`yaml` 包的
  implicit-key 单行规则（MULTILINE_IMPLICIT_KEY）在 block
  mapping 中拒绝 `&x: 1`，PyYAML 接受（TS INVALID vs Oracle
  VALID）。

三者都是同一类问题：两个 YAML 解析器对 tag/anchor 扫描的边界
不一致，且在 FIX-P0-12 轮已被识别为“需要 parser 层规则或
Oracle 侧拒收”的残留——本轮按 R12 的定级逐一关闭。

## 2. 阈值推导过程（先测绘，后写规则）

### T1：Oracle 用 `_StrictBaseLoader`，不是 safe_load

`yaml.safe_load` 对未知 tag 在构造层拒绝（`!foo` 本身就
INVALID），而 Oracle 的 `_StrictBaseLoader` 接受未知 tag——R12
§6 已注明。用 safe_load 当参照会误判：map 轮中有 4 处
parser 层“分歧”端到端实测为 MATCH，全是 safe_load 构造层
拒绝或裸片段假象（见 T2 末）。

### T2：PyYAML scanner 规则（从已安装 PyYAML 6.0.1 源码钉死）

- `scan_tag_uri`：后缀字符集为 URI 字符（含 `,`、`[`、`]`、
  `%XX` 转义后解码）。`scan_tag` 在 `%` 处解码转义，所以
  `!foo%5Bbar` 的 token value 是 `foo[bar`——**所有 Oracle
  tag 规则必须用原始源码切片（raw suffix），不能用解码后的
  token value**，否则 `%5B`/`%5D`/`%2C` 会误触发。
- `scan_anchor`：anchor 名在 `#` 处截断（`&x#c` → anchor
  `x`，随后 `#c` 被当作注释）——这是 R11 P0-A 已确认的机制。
- npm 侧（`node_modules/yaml` 源码）：`resolveBlockMap` 的
  MULTILINE_IMPLICIT_KEY 在 implicit key 的 props 含换行或
  key 节点含换行时触发；`hasUnrepresentableKey` 拒绝零宽空
  PLAIN key（`&x: 1` 在完整文档中被它拒绝，裸片段却解析为
  scalar `1`——裸片段测绘会误导）。

### T3：P0-C1 测绘结论（端到端）

- 5 轮测绘：`map-p0-13.py`（parser 层 38 + 18 + 18 形状）、
  `map2-p0-13.py`（端到端 56 形状：C1 23 + C2 15 + C3 14 +
  ESC 4）、`map3/map4/map5-p0-13.py`（边缘 12 + 13 + 12 形状）。
  map2 全 56 形状 MATCH，0 DIFF；map3/4/5 除 3 处 lone-doc
  残留外全部 MATCH。
- **单侧修不全 8 行**：TS 侧规则只覆盖 flow mapping（`m: {a:
  !foo, b: 1}` 等 7 行）；Oracle 侧规则只覆盖 block 与
  “后继节点不是 pair key”的形状（X11 `a: !foo,` + 下一 pair；
  `m: {a: !foo, 1}`、`m: {a: !foo, [1, 2]}`——两边都接受但解析
  出不同结构，探针只比 TriggerIR/jobs 时 `m:` 槽位值不可见，
  只有同时拒收才能对齐 verdict）。两条规则缺一不可。
- **flow-kind 栈，不是深度计数**：flow seq 内嵌 flow map 会
  触发（`m: {a: [!foo, b: 1]}` 的内层是 map——TS 侧拒绝，
  Oracle 侧拒绝）；纯 flow seq 永不触发（Y01/Y02 接受对照）。
- 不触发的对照（均已锁定）：`!foo,bar`（逗号在后缀中部）、
  `!foo ,`（逗号前有空格）、verbatim tag（`,` 在 `>` 后已被
  `hasRejectedAnchorOrTag` 拒绝；`<>` 内是内容）、`%2C`
  转义（只有字面尾逗号才触发）。

### T4：P0-C2 测绘结论

- Oracle 侧唯一：`yaml` 包无法接受这些形状，TS 侧无规则可
  写。`[`/`]` 出现在后缀任意位置都触发（中部、尾部、空
  `[]`、嵌套 `[[x]]`、key 位置、block 语境）；verbatim tag
  排除（handle 为 None 时 `!<foo[bar]>` 两边都接受）；
  `%5B`/`%5D` 转义不触发（raw suffix 判定，见 T2）。

### T5：P0-C3 测绘结论

- Oracle 侧唯一：同上，TS 侧无规则可写。触发条件三条，逐
  形状测得：
  1. **flow 豁免**：`m: {&x: 1}` 两边都接受；
  2. **单 pair 豁免**：嵌套、block-seq item、lone 文档中只有
     一个 pair 时不触发；
  3. **首 pair null 值豁免**：`&x:`（null 值）+ 后续 pairs 时
     不触发——`yaml` 包输出中该 pair 消失，两边对齐。豁免很
     窄：首 pair 有 scalar/collection/anchor 值时触发；null
     值在非首位时触发；anchor 与 `:` 之间有空格时触发
     （anchor 必须 glue 在 `:` 上，即
     `AnchorToken.end == ValueToken.start`）。
- “值是否为 null”从 `:` 后一个 token 读（KeyToken /
  BlockEndToken / StreamEndToken 即 null）；双属性
  `!foo &x: 1` 通过回扫 TagToken 覆盖；`? &x: 1` 不需特判
  （内层 mapping 只有单 pair，且 Oracle 构造时已拒绝）。

### 测绘中发现的 4 处“假分歧”（parser 层分歧，端到端 MATCH，非残留）

1. `safe_load` 对未知 tag 的构造层拒绝（Oracle 接受）——
   参照系错误，不是产品分歧。
2. 裸片段 `&x: 1` 在 npm 中解析为 scalar 而接受——完整文档
   中 `yaml` 包拒绝，不是产品分歧。
3. `&x : 1`（空格）裸片段接受——完整文档中多 pair 时拒绝。
4. `m:` 槽位值的差异（如 `m: {a: !foo, 1}` 两边结构不同）——
   探针只比 TriggerIR/jobs，`m:` 值不可见；但 C1 的两条规则
   仍同时拒收该形状（两边 verdict 对齐，不留“都接受但结构
   不同”的暗分歧）。

## 3. 改动

### 3.1 TS 侧新规则 `hasRejectedTagComma`（P0-C1）

`src/core/workflow-parser.ts`（新函数，镜像
`hasRejectedAnchorOrTag` 的状态机，另加 flow-KIND 栈）：flow
MAPPING（最内层 kind 为 map）中 tag 的 raw suffix 以 `,`
结尾即拒绝。扫描与 `hasRejectedAnchorOrTag` 同源（URI 字符
+ `%XX` 转义、handle 形式、verbatim `!<...>`）；flow
SEQUENCE 永不触发；block 语境永不触发（Oracle 规则负责那
一半）。接线两处 gate：`parseWorkflowYaml`（workflow-parser.ts）
与 `extractJobs`（`src/core/e2e.ts`）。

### 3.2 Oracle 侧三条新规则（P0-C1/C2/C3）

`oracle/checkpath_oracle/parser.py`（与 FIX-P0-05 的
`_reject_adjacent_alias_colon`、FIX-P0-11 的
`_reject_unseparated_comment_in_flow` 同一机制家族——token
扫描 + 拒收，不是输入手术）：

- `_raw_tag_suffix(yaml_text, token)`：从源码切片取 raw
  suffix（`text[start.index:end.index]` 减去 handle 长度），
  供三条 tag 规则共用。
- `_reject_tag_suffix_comma`：TagToken 的 raw suffix 以 `,`
  结尾且最内层 flow kind 不是 seq（block 或 map）时拒收。
  覆盖 X11 block 半边与两边都接受的形状。
- `_reject_tag_suffix_brackets`：TagToken 的 raw suffix 含
  `[` 或 `]` 时拒收，全部语境。Verbatim tag 排除（handle 为
  None）。
- `_reject_anchored_empty_key`：token 模式 KeyToken + 可选
  TagToken + AnchorToken + ValueToken，位于 ≥2 pairs 的 block
  mapping 中时拒收；flow、单 pair、首 pair null 值（且 anchor
  glue 在 `:` 上）三条豁免。

接线：`parse_workflow_yaml` 与 `extract_jobs` 均调用三条
规则（与已有拒收规则同一位置）。

### 3.3 新增探针矩阵与 fixtures

- `evidence/probes/fix-p0-13/`：98 形状 × 2 模式 = 196 检查
  （C1 40 + C2 17 + C3 35 + 转义 4 + lone-doc 2），含
  `gen-cases.py`、`run-matrix.py`、`ts-probe-entry.ts`、
  `results.json`、README（§7 残留）及 5 个测绘脚本
  （`map-p0-13.py`、`map2/map3/map4/map5-p0-13.py`）。
- `tests/fixtures/parser-divergence/` 新增 3 目录（44 形状，
  每个含 .yml + expected.json + README）与 3 个新测试文件
  （`tests/unit/diff-boundaries/tag-suffix-comma.test.ts`、
  `tag-suffix-brackets.test.ts`、`anchored-empty-key.test.ts`，
  锁定 TS 与 Oracle 的 status/errors/events 全字段一致）。

### 3.4 P2-R12-1 已修复

`evidence/probes/fix-p0-11/cases.json` 的 8 个过期
`known_divergence` 标志全部清除（`res-anchor-nospace`、
`res-tag-nospace`、`res-null-ml-plain/quoted/hash/
plain-comma/plain-nested`、`inl-key-comma-nospace`）。清除前
在 FIX-P0-13 代码提交 HEAD 重跑 fix-p0-11 矩阵确认 8 行
全部 MATCH（248/248，0 flagged）；`results.json` 已刷新，
README §6/§7 已更新为“FIX-P0-12 关闭、FIX-P0-13 清除标志”。

## 4. 验收（全部亲自重跑，代码提交 HEAD `01509e0`）

- `npm test`：**1554/1554（48 文件）**——基线 1507 + 新增 47
  （44 形状 + 3 schema 断言）。
- `npm run test:oracle`：167 fixtures，**0 mismatch，0 false
  PASS**；`unsupported surfaced as UNKNOWN: 34/34`。
- `npm run s0:gate`：**PASS**；oracle 24/24，0 mismatch，
  0 false PASS，TS formal false PASS 0；determinism 100 runs，
  1 unique hash；gate_report_sha256
  `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`
  **未变**。
- `npm run release:verify`：**PASS**。
- `npm run typecheck`：clean。
- Oracle diff：trigger **128 fixtures，0 mismatch**；jobs
  **48，0**；checks **46，0**；witness **44，0**。
- R12 59 行 probe 重跑：**118/118 MATCH，0 DIFF**。
- 新矩阵 fix-p0-13：**194/196 MATCH**，仅 2 个 DIFF 为已标注
  的 lone-doc 行（§7），runner exit 0。
- 九矩阵重跑（全部 exit 0）：
  - fix-p0-04：**100/100**（其中 R5 66-case 子集：66/66——66
    个单模式 R5 行）
  - fix-p0-05：**76/76**
  - fix-p0-06：**134/134**
  - fix-p0-07：**86/86**
  - fix-p0-08：**164/164**
  - fix-p0-09：**98/98**
  - fix-p0-10：**314/314**
  - fix-p0-11：**248/248**（其中 16 检查为已清除的 8 个
    P2-R12-1 标志行，全部 MATCH）
  - fix-p0-12：**486/486**（其中 24 检查为 12 个既往残留行，
    **全部 MATCH**——R12 的 3 个 P0 在此矩阵层面已无残留）
- R6 核心 5 形状（10 检查）：R10 probe 与 fix-p0-11 内全
  MATCH。
- R10 44 行 probe 重跑：**88/88 MATCH，0 DIFF**。
- R11 37 行 probe 重跑：**74/74 MATCH，0 DIFF**。
- Trial freeze 两次（代码提交 `01509e0` 后，冻结器 HEAD 门
  要求先提交）：三哈希两次完全一致。
  - source.zip（2315 文件）：
    `9590868588ebb6ead114d52baa77f21a523dd2686bcf75ff1d5a7af931020b1c`
  - dist.zip（114 文件）：
    `f2bcd53f360ada37da25d3d650009b4c10274594a8faf4ed1c4d7591680e8f7f`
  - RELEASE_MANIFEST.json：
    `677e5e82682d0e05be7802986db016c2d89405c5c2bdacacf1f259c238bbbb47`
  - source.zip 从 FIX-P0-12 时的 2242 文件变为 2315 文件
    （本轮新增：fix-p0-13 证据 12 件 + 新 fixtures 47 件 +
    新测试 3 件 + 旧矩阵结果刷新等）。
  - **dist.zip 说明**：本轮改了 `src/core/workflow-parser.ts`
    与 `e2e.ts`，dist 是纯 TS 发行物（114 文件，文件数未
    变），重建后哈希必然变化（`16af8080…` → `f2bcd53f…`）。
    两次 freeze 的 dist 哈希一致，确定性已验证。
  之后 `git checkout release/` 恢复 R2 正式产物
  （source.zip `3a778b93…`、dist.zip `da130ad2…`，已核对）。

### Manifest 哈希核查（R12 提出的 discrepancy）

- 本轮实测 manifest 哈希 `677e5e82…`，与 FIX-P0-12 报告的
  `5e44f660…` 和 R12 实测的 `933f7e8b…` 都不同——**这是预期
  的**：manifest 内嵌 `source_commit`（本轮 `01509e0`，前轮
  `309b2ee`）与 inputs 文件哈希，代码提交一变 manifest 必然
  变。本轮两次 freeze 的 manifest 哈希一致，确定性成立。
- 历史 discrepancy（同一代码提交 `309b2ee` 下 FIX-P0-12
  报告 `5e44f660…` vs R12 两次实测 `933f7e8b…`）已核查：
  `evidence/S0_GATE.json` 在 `309b2ee` 与 `01509e0` 之间字节
  完全相同（sha `e651ce73…`），R12 干净克隆内的同一文件也是
  字节相同（environment_fingerprint `e1cfe76c…`、
  gate_report_sha256 `f511a847…` 均一致），所以 S0 输入差异
  不是原因。最可能的原因是 FIX-P0-12 报告的 `5e44f660…` 在
  与最终代码提交 `309b2ee` 不同的树状态下测得，或转录错误。
  R12 的 `933f7e8b…` 在干净克隆中两次一致，是 `309b2ee` 树
  的可信值。本轮的 `677e5e82…` 在 `01509e0` 树上两次一致，
  是本轮的可信值。**此后各轮一律以自己实测的两次一致值为
  准，不得从既往报告抄哈希。**

## 5. R12 报告对照

- P0-C1 全部 16 检查已关闭：R12 的 8 行（A60、X04、Y03、
  Y05、Y08、Y09、Y10 + X11）及边界变体（flow seq 接受对照、
  中部逗号、空格、verbatim、转义、嵌套 map）——R12 probe
  118/118。
- P0-C2 全部 6 检查已关闭：R12 的 3 行（A70、X08、X09）及
  边界变体（中部/尾部/空/嵌套括号、key 位置、block 语境、
  verbatim 对照）——R12 probe 118/118。
- P0-C3 全部 2 检查已关闭：R12 的 A45 及边界变体（嵌套、
  block-seq item、flow 豁免、单 pair 豁免、首 pair null 豁免、
  双属性）——R12 probe 118/118。
- P2-R12-1 已修复（见 §3.4）。R12 的其余 P2（R2 的 6 项 +
  P2-R6-1 + P2-R6-2）未动，仍为 standing P2。

## 6. 未动事项

- `evidence/review/`、`handoff/P020-T013-R12/`、`release/`
  正式产物（除 trial freeze + 恢复流程外）未动；
  `reports/` 目录为 2026-11-08 遗留的未跟踪 demo/merge-queue
  报告（非本轮生成），未提交、未改动。
- 许可证仍 `PENDING_SAM_DECISION`（Sam 待定）。
- R12 的 P2 除 P2-R12-1 外未动（本轮只处理指定的 P2）。

## 7. 残留分歧清单

### 7.1 Lone 文档（`&x: 1` / `&x:` 单独成文档）——2 检查，trigger 模式

- `lone-scalar`（`&x: 1` 单独成文档）与 `lone-null`（`&x:`
  单独成文档）：TS INVALID `workflow_root_not_mapping` vs
  Oracle INVALID `missing_on_key`。两边都 INVALID，但错误码
  不同。
- **既有分歧，非本轮引入**：在 FIX-P0-13 之前两边已不一致
  （同一对错误码）；本轮的 C3 规则刻意不对 lone 文档触发
  （单 pair 豁免），所以分歧原样保留。
- **无法用拒收规则关闭**：Oracle 侧拒收会得到
  `yaml_parse_error`，仍与 TS 侧的
  `workflow_root_not_mapping` 不同；且 `yaml` 包把 lone
  文档解析为 scalar 而非 mapping，Oracle 没有能返回的与 TS
  相同的 verdict。输入本身在产品域之外（workflow 文档恒有
  `on:` 与 `jobs:`）。若未来产品需要对 lone 非 mapping 文档
  逐字段定级，再议。
- 矩阵中 2 行已标注 `known_divergence`（jobs 模式 MATCH——
  两边都返回 `[]`）；fix-p0-13 矩阵 194/196，DIFF 仅此 2
  检查（trigger 模式）。

### 7.2 本轮无其他新分歧

全部 9 个既往矩阵、R10/R11/R12 probe、R5 66-case 子集、
R6 5 形状均 100% MATCH；`npm test` 1554/1554；S0 gate
PASS，哈希未变。除 §7.1 外无新增分歧、无 widen scope。

---

代码提交：`01509e0`（FIX-P0-13: close R12 P0-C1/C2/C3）。
本报告提交后请派 **T013 R13**（新会话、干净克隆、代码提交
`01509e0`），随后 R13 PASS → T014 R3 正式 re-freeze（manifest
`inputs` 须记录 R4–R12，P2-R6-1）→ Drive 新文件夹
`01_release_R3`（不覆盖 R1/R2）→ 同一立项对话内终审 R3。
