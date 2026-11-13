# FIX-P0-14 任务终报 — R13 lone-doc P0（anchored empty key 单独成文档）已关闭

- **代码提交**：`45487eb` "FIX-P0-14: Oracle classifies lone-doc anchored empty key as workflow_root_not_mapping (R13 P0)"（相对 `a8c120b`，33 文件，+3250/−134）。
- **结论**：R13 的 P0（lone 文档 anchored empty key，2 检查）已关闭。R13 探针重跑 **98/98 MATCH**（原 96/98）；全部验收在代码提交 HEAD 上亲自重跑通过；`src/` 0 改动；S0 门哈希未变；trial freeze 两次三哈希一致；`release/` 已恢复为 R2 正式件。可派遣 R14（新会话、clean-clone only、代码提交 `45487eb`）。

## 1. 根因

两个解析器对 `&x: 1` 这一文档的**结构**本身看法不同（R13 §2.2/§3 已钉死，本轮独立复现确认）：

- PyYAML `_StrictBaseLoader` 把它渲染为 1 对映射 `{'' : '1'}`（空字符串 key）——Oracle 的根检查见 dict，通过 `workflow_root_not_mapping` 分支，落到 `missing_on_key`。
- `yaml` npm 包把它解析为纯量 `1`——TS 的根检查见非映射，返回 `workflow_root_not_mapping`。

错误码差异是该结构分歧的下游后果，与此前各 P0 同构。拒收规则关不上它（Oracle 侧拒收得到 `yaml_parse_error`，仍与 TS 的 `workflow_root_not_mapping` 不同——FIX-P0-13 报告 §7 的论证正确），所以本轮按 R13 §12 方向做**分类对齐**：Oracle 的根检查在已加载文档恰为"全部由 anchored empty key 构成的退化映射"时返回 `workflow_root_not_mapping`。

## 2. 阈值推导过程（先测绘，后写规则）

### T1：解析器层平行测绘（`map-p0-14.py`：30 + 15 形状）

`node YAML.parse` vs PyYAML `_StrictBaseLoader` + token dump。结论：

- npm 对 `&x:` 的处理是 anchor 挂在值节点上（`&x:` 被读作 anchor `x:`，见 BAD_ALIAS 警告 "Anchor ending in : is ambiguous"）：`&x: 1` → `1`、`&x:` → `null`、`&x: [1]` → `[1]`、`&x:\n  - a` → `["a"]`、`&x: !foo 1` → `"1"`——值节点为纯量/序列/null 时 npm 恒渲染为**非映射**。
- 值节点为映射时 npm 渲染为**映射**：`&x: {a: 1}` → `{"a": 1}`、`&x:\n  a: 1` → `{"a": 1}`；含 `on` 时更渲染为含 `on` 的映射：`&x: {on: push}` → `{"on": "push"}`、`&x:\n  on: push` → `{"on": "push"}`。
- `&x : 1`（anchor 与 `:` 间有空格）npm 渲染为映射 `{"": 1}`——与 `&x: 1` 的 token 序列完全相同（Key Anchor Value Scalar），**只有 mark 位置不同**，所以判别式必须含 glued 检查。
- `&x: &y 1` npm 报错（"A node can have at most one anchor"），PyYAML 接受——第二 anchor 是独立分歧。
- `!foo &x: 1` / `!!str &x: 1` npm 渲染为 `"1"`（解析器层接受），但端到端 TS 拒收（见 T3）——解析器层测绘会误导，必须端到端确认。

### T2：端到端测绘（`map2-p0-14.py`：同一 45 形状；`map3-p0-14.py`：12 个额外边界形状）

TS bundle + Oracle drivers 全 JSON 比较。45 形状中：

- **可关闭（16 形状）**：TS `workflow_root_not_mapping` vs Oracle `missing_on_key`，jobs 全 MATCH——纯量/引用/布尔/浮点/流序列/块序列/带 tag 值/注释/文档标记/含 `on` 的流序列值。
- **对照全部 MATCH**：引号空 key `"": 1` / `'': 1`（双边 `missing_on_key`）、流/块映射值（双边 `missing_on_key`）、C3 域（双边拒）、首对 null 豁免（双边 VALID）、lone 纯量/序列/anchored 纯量/tagged 纯量（双边 `workflow_root_not_mapping`）、双文档（双边 `yaml_parse_error`）。
- **2 处"假分歧"（解析器层分歧，端到端 MATCH，非残留）**：`? : 1` 与 `: 1`——PyYAML scanner 拒收，但 TS 侧 `hasUnrepresentableKey` 同样拒收，双边 `yaml_parse_error`。
- **新发现残留（见 §7）**：映射值含 `on`（TS VALID）、值节点第二 anchor（TS `yaml_parse_error`）、key 上带 tag（TS `yaml_parse_error`）、unglued（TS `yaml_parse_error`）、嵌套块映射值带 anchored key（TS `yaml_parse_error`）。

### T3：TS 侧拒收机制的逐规则核查（`rule-probe`：五条规则逐个跑）

- `!foo &x: 1` / `!!str &x: 1` → 仅 `hasRejectedAnchorOrTag` = true（E05：anchor 跟在另一 property 之后时 `:` 处于值位置）。故判别式必须**禁止 KeyToken 与 AnchorToken 之间出现 TagToken**。
- `&x : 1` → 仅 `hasUnrepresentableKey` = true。故判别式必须含 **glued**（AnchorToken.end == ValueToken.start）。
- `&x: 1` / `&x:` → 五条规则全 false，落到 yaml 解析 → 纯量 → `workflow_root_not_mapping`。
- `&x: &y 1` → 五条规则全 false，但 `YAML.parse` 本身抛错（"at most one anchor"）→ TS `yaml_parse_error`。故判别式必须**禁止 ValueToken 之后紧跟 AnchorToken**。

### 判别式（五条，缺一不可；每条都有对照形状钉死）

新规则 `_is_lone_anchored_empty_key_doc`（`parser.py` L1402）当且仅当以下全成立时返回 true：

1. 已加载文档是恰含一个 key（空字符串 `''`）的 dict。双对 anchored-empty-key 文档到不了这里（`_StrictBaseLoader` 拒收重复 `''` key，`_reject_anchored_empty_key` 先拒收）；首对 null anchored key 后跟真实 pair 的文档（`&x:\nname: probe`）含真实 key，同样排除。
2. 根 token 流恰为单对块映射：StreamStart、[DocumentStart]、BlockMappingStart、KeyToken、AnchorToken、ValueToken、\<value\>、BlockEnd、[DocumentEnd]、StreamEnd。这条排除引号空 key `"": 1`（其 key token 是 ScalarToken 而非 AnchorToken），保住其 MATCH。
3. KeyToken 与 AnchorToken 之间**无 TagToken**（T3：key 上带 tag 的形状 TS 拒收）。
4. anchor **glued** 到冒号（AnchorToken.end == ValueToken.start；T1：`&x : 1` 与 `&x: 1` token 序列相同，只有 mark 不同）。
5. 值在 token 层 manifestly 是**非映射节点**：跳过值上的 TagToken 后，首 token 是 ScalarToken、Block/FlowSequenceStartToken，或无（null 值，下一个即 BlockEnd）。映射值（Block/FlowMappingStart）不触发——npm 把它渲染为映射，双边已有共识。值首 token 是 AnchorToken 也不触发（T3：npm 拒收第二 anchor）。

序列值的深度扫描用栈计数处理嵌套集合（含映射项的流序列 `&x: [{on: push}]` 仍触发——文档本身是序列，TS `workflow_root_not_mapping`）。

## 3. 改动

### 3.1 Oracle 侧分类对齐（P0 关闭；`src/` 0 改动）

`oracle/checkpath_oracle/parser.py`（+168 行）：

- 新函数 `_is_lone_anchored_empty_key_doc(yaml_text, doc)`（L1402）：按 §2 判别式扫描 token，返回是否 lone anchored-empty-key 文档。含完整 docstring（机制 + 五条条件 + 每条的对照依据）。
- `parse_workflow_yaml` 根检查处接线（L1606）：`doc` 是 dict 且无 `on` 时，先判该函数——true 则返回 `workflow_root_not_mapping`，否则仍返回 `missing_on_key`。
- `extract_jobs` **未动**：它对这些文档双边都返回 `[]`，jobs 模式本来就 MATCH。

### 3.2 新增探针矩阵与 fixtures

- `evidence/probes/fix-p0-14/`：`map-p0-14.py`、`map2-p0-14.py`、`map3-p0-14.py`（三轮测绘）、`gen-cases.py`、`cases.json`（57 行，11 行 flagged）、`run-matrix.py`、`results.json`（103/114 MATCH）、`ts-probe-entry.ts`、`README.md`（§7 残留清单）。
- `tests/fixtures/parser-divergence/lone-anchored-empty-key/`：14 个 fixture + `expected.json`；`tests/unit/diff-boundaries/lone-anchored-empty-key.test.ts`（14 个 parity 断言 + 1 个 schema 断言）。

### 3.3 P2-R13-1 已修复 + fix-p0-13 的 2 个过期标志已清

- **P2-R13-1**：`evidence/probes/fix-p0-12/cases.json` 的 12 个过期 `known_divergence` 标志逐个置 `false`（原地翻转，`git diff` 仅 12 行，无重排版）；矩阵重跑 **486/486 MATCH、0 flagged**；README §7 加 FIX-P0-14 清除注记。
- 同类清理（任务未明文要求，但属同一证据卫生问题，此处明示不 silent）：`evidence/probes/fix-p0-13/cases.json` 的 2 个 lone-doc 标志（`lone-scalar`、`lone-null`）——本轮修复使这两行变为 MATCH，矩阵重跑 **196/196 MATCH、0 flagged**；README 加 FIX-P0-14 清除注记。若 R14 认为此清理越权，可在复核中指出，不影响定级（标志本身不影响判定）。

## 4. 验收（全部亲自重跑，代码提交 HEAD `45487eb`）

| 命令 | 结果 |
|---|---|
| `npm test` | **1569/1569**（49 test files；基线 1554 + 新增 15：14 fixture + 1 schema 断言） |
| `npm run test:oracle` | 167/167，0 偏差，0 false PASS；unsupported 34/34 UNKNOWN |
| `npm run typecheck` | **PASS**（`tsc --noEmit`，exit 0） |
| `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| `python3 scripts/build-golden.py --check-only` | golden cases 167，exit 0 |
| `npm run oracle:diff:trigger` | 128 夹具，0 mismatch（报告 128/128 passed） |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch（报告 48/48 passed） |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch（报告 46/46 passed） |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch（报告 44/44 passed） |
| `npm run s0:gate` | **PASS**；oracle 24/24，0 mismatch，0 false PASS；gate_report_sha256 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`（**未变**） |
| `npm run release:verify` | **PASS**；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| R13 探针重跑（49 行） | **98/98 MATCH**（原 96/98，2 处 DIFF 全变 MATCH；`results.json` 独立核对：checks 98 / match 98 / diff 0） |
| R10 探针重跑（44 行） | **88/88 MATCH** |
| R11 探针重跑（37 行） | **74/74 MATCH** |
| R12 探针重跑（59 行） | **118/118 MATCH** |
| R6 5 形状（R10 §2.1，含于 R13 探针） | **10/10 MATCH** |
| fix-p0-14 新矩阵（57 行 × 2） | **103/114 MATCH**，其余 11 检查为 11 个已标注 `known_divergence` 的残留行（§7），runner exit 0 |
| 十矩阵重跑（全部 exit 0，0 flagged） | fix-p0-04 **100/100**（其中 R5 66-case 子集 **66/66**）、fix-p0-05 **76/76**、fix-p0-06 **134/134**、fix-p0-07 **86/86**、fix-p0-08 **164/164**、fix-p0-09 **98/98**、fix-p0-10 **314/314**、fix-p0-11 **248/248**、fix-p0-12 **486/486**、fix-p0-13 **196/196** |
| T006 报告哈希核对（P2-R10-2 仍修复） | `suite_sha256` `36c3853d…` 与同一提交的 `tests/fixtures/trigger/suite.json` 实测哈希逐字节一致 |

### Trial freeze（代码提交后，两次；manifest 哈希实测方法见下）

两次 `npm run release:freeze -- --trial`（HEAD `45487eb`）三哈希完全一致，确定性成立：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `f8621677458a3e90bcdb841172efed37ad108f91eeb3e2b561be0328580ff4d0`（2,348 文件） | 与 R13 的 `95908685…`（2,315 文件）相比已变（`oracle/` 改动 + 新 evidence/fixtures，属预期） |
| dist.zip | `f2bcd53f360ada37da25d3d650009b4c10274594a8faf4ed1c4d7591680e8f7f`（114 文件） | **未变**，与 FIX-P0-13 时完全相同——dist 是纯 TS 发行物，`src/` 0 改动 |
| RELEASE_MANIFEST.json | `5a89a52eb09ef3e346fc60fd03f0dc22dcd545ad8b830220d436285faacab555` | 见下——**本次实测值，两次一致** |

试冻后已 `git checkout release/`，`release/` 恢复为 R2 正式产物（source.zip `3a778b93…`、dist.zip `da130ad2…`，已核对）。

### Manifest 哈希核查（R13 §6 的规则，本轮先用于自己的数字）

- **本轮 manifest 哈希 `5a89a52e…` 的测量方法**：在主仓库、代码提交 `45487eb` 上，于 2026-11-09 ~13:46–13:47 GMT 两次运行 `npm run release:freeze -- --trial`，每次从命令 stdout 打印的 `RELEASE_MANIFEST.json:` 一行直接读取哈希；两次均为同一值 `5a89a52e…`。**该值未从任何既往报告抄录**；与 R13 实测的 `9e68492a…`（`01509e0`）不同是预期的——树已变（`oracle/` + 新 evidence/fixtures），而 source/dist 哈希的逐项对照见上表。
- **R13 §6/§11 的订正接受**：FIX-P0-13 报告的 `677e5e82…` 无法复现是对的——R13 在 `01509e0` 上两次试冻均为 `9e68492a…`，且 `309b2ee` 重冻为 `933f7e8b…`（= R12 的值），故 FIX-P0-12 报告的 `5e44f660…` 确为错误值。R13 提出的规则"此后各轮一律以自己实测的两次一致值为准，不得从既往报告抄哈希"正确，本轮已遵守；R14 须对本轮的 `5a89a52e…` 做同样的两次试冻复核。
- 试冻 manifest 的 `inputs` 仍只记录到 R3（P2-R6-1，范围扩大到 R13；T014 重冻时须把 R4–R13 一并记入，非阻断）。

## 5. R13 报告对照

- R13 §1：P0-C1/C2/C3 全部关闭——本轮未动相关代码，十矩阵 + R12 探针 118/118 全部重跑通过，状态不变。
- R13 §2：lone-doc P0（2 检查）——本轮关闭：R13 探针 98/98；fix-p0-13 矩阵 196/196（2 行 lone-doc 标志已清，见 §3.3）。
- R13 §4：flow-KIND 判别式 + P0-C3 豁免边——本轮未动相关代码，R13 探针内含形状全部 MATCH，状态不变。
- R13 §5：P2-R12-1 / P2-R10-1 / P2-R10-2 已解决——状态不变（T006 哈希本轮再核对一致，见 §4）；**P2-R13-1 已修复**（见 §3.3）。
- R13 §6：manifest 哈希订正——接受并执行，见 §4。
- R13 §12：修复方向（分类对齐 + token 判别式 + jobs 不变）——已按方向执行；P2-R13-1 已清；R14 审查对象为 `45487eb`。

## 6. 未动事项

- `src/` 0 改动（`git diff a8c120b..45487eb -- src/` 为空）；`extract_jobs` 未动；`release/` 正式产物未动（仅试冻 + 恢复循环）。
- 删测试 0；测试/夹具 diff 中无 `skip`/`only` 弱化。
- 无 mismatch 忽略名单（`deepDiff` 未动）；无输入文本手术；无解析器更换。
- 终审轮次已用 2/5；R14 不占用终审轮次。

## 7. 残留分歧清单（11 行 / 11 检查，trigger 模式 only，jobs 全 MATCH）

全部 11 行均为 lone-doc anchored-empty-key 形状，其中分类对齐到 `workflow_root_not_mapping` 会是**错误码**（TS 侧说 VALID 或 `yaml_parse_error`，不是 `workflow_root_not_mapping`），故没有任何分类规则能关闭它们。已如实披露；R14 独立定级。

### 7.1 映射值含 `on`——TS VALID vs Oracle `missing_on_key`（3 检查）

- `a-flowmap-on`（`&x: {on: push}`）、`a-blockmap-on`（`&x:\n  on: push`）、`x-tag-map-on`（`&x: !foo {on: push}`）。
- `yaml` 包把值映射渲染为文档本身，TS 侧看到真实 workflow trigger。关闭它们需要 Oracle 把 anchored-empty-key 对"解包"、以其值为文档（且须同时改 `parse_workflow_yaml` 与 `extract_jobs`——含 `jobs:` 的值在 jobs 模式也会分歧）——那是新的 "unwrap" 语义，不是分类对齐，超出 R13 §12 方向。未修复。

### 7.2 值节点第二 anchor——TS `yaml_parse_error` vs Oracle `missing_on_key`（3 检查）

- `a-anchor-val`（`&x: &y 1`）、`x-anchor-seq`（`&x: &y [1]`）、`x-anchor-null`（`&x: &y`）。
- `yaml` 包拒收（"A node can have at most one anchor"）。关闭它们需要 Oracle 侧镜像该错误的拒收规则（新的 `_reject_*` 规则），不是分类对齐。未修复。

### 7.3 key 上带 tag——TS `yaml_parse_error` vs Oracle `missing_on_key`（3 检查）

- `a-tag-key`（`!foo &x: 1`）、`a-handle-key`（`!!str &x: 1`）、`x-docmark-tagkey`（`---\n!foo &x: 1`）。
- TS 侧经 `hasRejectedAnchorOrTag`（E05）拒收。关闭它们需要 Oracle 侧镜像 E05 在 lone-doc 位置的拒收规则。未修复。

### 7.4 Unglued anchor-colon——TS `yaml_parse_error` vs Oracle `missing_on_key`（1 检查）

- `a-unglued`（`&x : 1`）。TS 侧经 `hasUnrepresentableKey` 拒收。关闭它需要 Oracle 侧镜像该拒收规则。未修复。

### 7.5 嵌套块映射值带 anchored key——TS `yaml_parse_error` vs Oracle `missing_on_key`（1 检查）

- `x-nested-block`（`&x:\n  &y: 1`）。`yaml` 包拒收（line 2 的 "at most one anchor"）。流映射双生形状 `x-nested-flow`（`&x: {&y: 1}`）MATCH（双边 `missing_on_key`），不是残留。未修复。

### 7.6 本轮无其他新分歧

全部 10 个既往矩阵、R10/R11/R12/R13 probe、R5 66-case 子集、R6 5 形状均 100% MATCH；`npm test` 1569/1569；S0 gate 哈希未变。§7.1–7.5 之外无新增 DIFF。
