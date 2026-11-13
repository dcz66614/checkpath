# FIX-P0-11 任务终报 — R10 R6（flow 映射内 indent-0 独立注释行）已关闭

## 1. 根因

R10 发现的新分歧 R6：flow 映射内、一个完整 `key: value` 对之后（行尾无逗号）、
indent 为 0 的独立注释行，TypeScript `yaml` 包拒绝
（"Comments must be separated from other tokens by white space characters"），
Oracle（PyYAML）接受。5 形状 × 2 模式 = 10 检查 DIFF，触及核心 `on:` 槽位。

机制（`node_modules/yaml` 源码）：flow 集合内 `resolveProps` 以
`startOnNewline: false` 调用，`hasSpace` 初始为 false；完整标量值之后的换行
被当作该值的 `<end>` 消耗掉，于是 column 0 的注释行成为下一项 `start`
props 的第一个 token，`resolveProps` 报错。而在 flow 序列内，注释附到值的
`<end>` 上（`resolveEnd`，非严格模式不报错），故接受。行内注释（`, # c`，
逗号后有空格）同样接受——空格 token 先把 `hasSpace` 置真。

PyYAML 的 token 流完全丢弃注释，所以既有 `_reject_*` 家族的 token 扫描
看不到注释行——必须新增 raw-line 扫描（扫描 flow 映射行跨度内的源码行）。

## 2. 阈值推导过程（先测绘，后写规则）

六轮平行测绘（parser 层 `node YAML.parse` vs PyYAML `safe_load`，共
56+30+16+18+10+10 形状），每个活分歧随后都用真实入口（TS bundle +
Oracle drivers，全 JSON 对比）逐一确认——因为 parser 层测绘会误导：
裸 `YAML.parse` 不是产品入口（`parseWorkflowYaml` 另有 FIX-P0-04/06/09
规则）。两处 parser 层"分歧"经端到端验证实为 MATCH，不是残留：
tab 缩进注释（TS 侧 FIX-P0-06 tab 规则 + PyYAML tab 扫描错误，双方都拒），
以及 flow 序列内 `,#c` 后跟逗号行（双方都拒，错误不同）。

### T1（R6）：独立注释行

- **注释缩进是唯一决定维度**：indent 0 拒，≥1 接受，与包围 block 的缩进无关
（顶层 `m:`、嵌套 `m:` key 缩进 2、`jobs: env:` 4、深层 `with:` 10、
block-sequence 项 dash 6、文档根 flow 映射，全部如此）。
FIX-P0-10 的"必须超过 block 缩进"阈值在此不适用。
- **上一行决定**：完整对拒（plain / 双引号 / 单引号 / 多行引号 / anchor /
tag / alias 值、嵌套 flow 在该行闭合、flow 序列在该行闭合）；逗号后、
bare key 后、`:` 后值在下一行、flow 开始（`{` / 嵌套 `{`）后、
anchor/tag 待值时、单独 `?` 后、flow 首项——全部接受。
- **flow 序列内接受**（注释附到值 `<end>`）；flow 序列内的 flow 映射拒，
flow 映射内的 flow 序列接受。
- **空行断链**：对与注释之间的空行使接受（空行的换行先进入下一项
`start`，`hasSpace` 已真）；在注释行回扫中任何位置遇到空行同样断链。
对后的行尾空格救不了注释（空格进值的 `<end>`）。CRLF 与 LF 行为一致。
- 上一行是多行 plain 标量（`foo` / `bar`）时拒；`?` 单独成行后接受；
alias 作值时拒（已定义 alias）；`&x` / `!!str` 待值时接受。

### T2（行内无空格注释族——测绘 R6 时发现）

注释紧跟 `,` `{` `}` `[` `]` 之一（同行、无空格）即拒
（`m: {a: 1,#c\n b: 2}`、`m: {a: 1,#c\n}`、`m: [a,#c\n]`、
`m: {#c\n a: 1}`、`m: {a: 1}#c`——同一错误、同一 `hasSpace=false` 机制）。
token 后有空格即接受；`:` / `?` 后无空格接受（`a:#c` 根本不是注释，
它是 plain 标量 key `a:#c 1` 的一部分；`?#c` 接受）。引号/ plain 标量
内的 `#`（`"x,#y"`、`x#y`）是标量内容，永不触发；block 层的 `,` / `{`
（`a: b,#c`——逗号在 plain 标量内）永不触发。

### 闭合行收窄（测绘 R6 时发现，FIX-P0-10 豁免过宽）

FIX-P0-10 的豁免（"只有关闭 flow 集合的行豁免，任何缩进"）过宽。
`yaml` 包 lexer 的 `atFlowEndMarker` 豁免是：indent == indentNext - 1
（== block 缩进）**且** flowLevel == 1（仅最外层 flow）。于是内层闭合
在 indent ≤ block 缩进时（`m: {n: {a: 1\n}\n, b: 2}`，flowLevel 2），
或外层闭合低于 block 缩进时（`x:\n m: {a: 1\n}`，闭合 0 < block 2），
`yaml` 包都报错而 PyYAML 接受。端到端确认 4 形状 × 2 模式 = 8 检查活分歧。
（`}, b: 2` 同行外层内容在 indent 0 时仍由 FIX-P0-10 的逗号检查拒，
双方已 MATCH，不受影响。）

## 3. 改动（Oracle 侧，`src/` 0 改动）

文件：`oracle/checkpath_oracle/parser.py`，两个改动，均在
`parse_workflow_yaml` 与 `extract_jobs` 的既有 `_reject_*` 调用链内
（`yaml.YAMLError` → 既有 `yaml_parse_error` 路径）。

1. **新规则 `_reject_unseparated_comment_in_flow`**（parser.py 新增）：
- T1：独立注释行 indent 0 + 在 flow 映射内 + 回扫上一有效行（跳过注释行，
空行断链）后上一 token 是完整对（值标量 / flow-end / alias），则拒。
标量是值还是 key 由其前一个 token 决定（走过 anchor/tag 属性后：
`ValueToken` → 值，`KeyToken` → bare key）。
- T2：`#` 紧跟 `,{}[]` 之一（同行相邻、无空格）且该字符不在任何标量
token 跨度内，则拒。`#` 是否注释起由 token 跨度决定：不在任何 token
跨度内的 `#` 即注释起（PyYAML 扫描器跳过注释）；在标量跨度内的是标量内容。
- 注释行内 `#` 之后同一行的 `#` 不再判断（在前一注释内）。
2. **`_reject_underindented_flow_continuation` 的 FlowEndToken 豁免收窄**：
flow-end token 仅当同时满足三条才豁免——关闭最外层 flow
（`len(flow_stack) == 1`）、是该行第一个 token、行缩进 == 最内层
block 缩进；否则按普通续行 token 检查。docstring 同步修正
（原"任何缩进豁免"已不准确）。

## 4. 验收（全部亲自重跑，代码提交 HEAD `479810e`）

- `npm test`：**1469/1469**（43 文件）
- `npm run test:oracle`：167 fixtures，**0 mismatch，0 false PASS**，
formal TS 0 false PASS，34/34 UNKNOWN
- `npm run s0:gate`：**PASS**，oracle 24/24，0 mismatch，0 false PASS，
100 次 hash 稳定（1 unique），
gate_report_sha256 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`
（**未变**）
- `npm run release:verify`：**PASS**（license guard 仍 PENDING_SAM_DECISION）
- trigger/jobs/checks/witness：**128/48/46/44，全部 0 mismatch**
（T006 报告已重跑，见 §5）
- R10 44 行 probe 重跑：**88/88 MATCH，0 DIFF**（原 78/88，10 DIFF 全变 MATCH）
- 新矩阵 `evidence/probes/fix-p0-11/`：124 形状 × 2 模式 = 248 检查，
**232/248 MATCH**，其余 16 检查均为 8 个已标注 `known_divergence`
的残留行（§7），runner exit 0。R6 核心 5 形状（10 检查）全 MATCH。
- 七矩阵重跑（全部 exit 0，0 flagged）：
  - fix-p0-04：**100/100**（其中 R5 66-case 子集：66/66——66 个单模式
    R5 行，见该矩阵 README）
  - fix-p0-05：**76/76**
  - fix-p0-06：**134/134**
  - fix-p0-07：**86/86**
  - fix-p0-08：**164/164**
  - fix-p0-09：**98/98**
  - fix-p0-10：**314/314**
- Trial freeze 两次（代码提交 `479810e` 后，冻结器 HEAD 门要求先提交）：
  三哈希两次完全一致。
  - source.zip（2188 文件）：`08b8c360fcd7efa2b7be98a3e1ca34eb0fac32d755668c18b5253451d7ebf3b1`
  - dist.zip（114 文件）：`57dc0f8d2cbbad9fdb6b9fd45b5cc30bf19ddd587ac16147ad980a7c8b46e7b9`（**未变**，与 FIX-P0-10 时完全相同——dist 是纯 TS 发行物，不含 Oracle）
  - RELEASE_MANIFEST.json：`19b26ec154c067378588dfd217803c80d29f930638c61e2387c35323bbe33f6c`
  - source.zip 从 FIX-P0-10 时的 2176 文件变为 2188 文件（本轮新增：fix-p0-11 证据 5 件 + R10 结果 + T006 报告 + 旧矩阵 README 更新等）。
  之后 `git checkout release/` 恢复 R2 正式产物（source.zip `3a778b93…`、dist.zip `da130ad2…`，已核对）。

## 5. R10 报告对照

- R6 全部 5 形状已关闭：R6-EXTRA（`m: {a: 1\n# note\n, b: 2}`）、
R6-ON（`on: {push: {types: [opened]}\n# note\n, pull_request}`）、
R6-ON-UNSUPPORTED（同上，`pull`）、R6-CLOSE
（`m: {a: 1, b: 2\n# note\n}`）、R6-NESTEDBLOCK（`x:` 下 `m:` 缩进 2，
注释 0，逗号 3）。R10 probe 88/88。
- R10 的 `r10-thr-comment-ok` 行（注称"注释行跳过，逗号缩进 1 接受"）
实为 R6-EXTRA——注释行本身即拒因，注记有误；本轮矩阵以 `r6-extra`
为准。
- P2-R9-1（FIX-P0-09 报告 `expected.json` 计数 25/13，实测 27/11）：
R10 已确认 RESOLVED，本轮未动。
- **P2-R10-1 已修复**：旧矩阵 `results.json` / `cases.json` 中 14 个
`known_divergence` 标志过期（行已 MATCH 但标志未清）——fix-p0-04
`D2-alias-flow-key`（1，FIX-P0-05 已闭）、fix-p0-05
`H6-flow-alias-tab-before-colon`、`N5-block-alias-key-map-anchor`
（2，FIX-P0-06 已闭）、fix-p0-07
`RESID-MULTILINE-QUOTED-UNINDENTED-DQ/SQ`（2，FIX-P0-08 已闭）、
fix-p0-08 `flowkey-ind0/nested-ind0/ind1/nested-ind1/ind2/nested-ind2`
（6，FIX-P0-09 已闭）、fix-p0-09 `r4-comma-ind0`、
`r5-explicit-plain-ind0`、`r5-explicit-quoted-ind0`（3，FIX-P0-10
已闭）。14 个标志已在 `cases.json` 中置 `false`，七矩阵重跑后
`results.json` 同步刷新（见 §4）；五份旧矩阵 README 中对应的过期
"known divergence" 描述亦同步更新（各加 FIX-P0-11 清除注记）。
- **P2-R10-2 已修复**：提交版 T006 报告 `suite_sha256` 过期
（记录 `6952ae86…`，同一提交的 suite.json 实测 `36c3853d…`）。
已重跑 `npm run oracle:diff:trigger`：
`evidence/tests/T006_ORACLE_TRIGGER_REPORT.json` 现记录
`36c3853d8a803ccbfe04ce1be7b85ba1eeab5bec9b88b91c970f3d06cbf62574`，
128 fixtures / 128 passed / 0 mismatch。T007/T008/T009 三份报告的
suite 哈希本轮重跑亦一致（jobs 48、checks 46、witness 44，0 mismatch）。

## 6. 未动事项

- `src/` 0 改动；`release/` 正式产物除 trial freeze 流程外未动，
freeze 后已 `git checkout release/` 恢复。
- P020 license 仍 PENDING_SAM_DECISION（Sam 待定）。
- 未动测试；未删测试。

## 7. 残留分歧清单

本轮矩阵中 8 行（16 检查）标注 `known_divergence`，均为已确认、
未修复的残留。它们**不在** R10 的发现范围内，是本轮测绘时新发现的；
按 brief 要求如实披露，不 silent 扩大修复范围。

1. **反向分歧 `&x#c` / `!!str#c`**（`res-anchor-nospace`、
`res-tag-nospace`；2 形状 × 2 模式 = 4 检查）：
`m: {a: &x#c\n 1}`、`m: {a:!!str#c\n 1}`——TS 接受，
PyYAML 拒（anchor/tag 扫描器错误），Oracle INVALID 而 TS VALID。
Oracle 侧无法修复（PyYAML 扫描器拒；禁 input surgery、禁换 parser）。
只能用 TS 侧规则修（FIX-P0-06 风格：拒掉 PyYAML 拒的东西）——
需 `src/` 改动，超出本轮 Oracle-only 范围。
2. **TS 侧 FIX-P0-09 S1 过度拒（null 值多行 key）**
（`res-null-ml-plain`、`res-null-ml-quoted`、`res-null-ml-hash`、
`res-null-ml-plain-comma`、`res-null-ml-plain-nested`、
`inl-key-comma-nospace`；6 形状 × 2 模式 = 12 检查）：
flow 映射内 null 值多行 key（`m: {a\n b}`、`m: {"a\n b"}`、
`m: {a:#c\n 1}`、`m: {a\n b, c: 1}`、`m: {n: {a\n b}}`、
`m: {a: 1, b:#c\n 2}`）——PyYAML 接受，`yaml` 包也接受，但 TS 侧
`hasMultilineFlowKey` S1 规则对任何跨行 key 都触发（其实证基础
只是带 `:` 分隔符和值的 key），故 TS INVALID 而 Oracle VALID。
注意 `a:#c` / `b:#c` 中的 `#` 在 plain 标量 key（`a:#c 1` /
`b:#c 2`）内，根本不是注释。修复只能收窄 S1 至带 `:` 分隔符/值的
key——需 `src/` 改动，超出本轮范围。**有意不用 Oracle 侧拒来掩盖**：
Oracle 不应为迎合一个本身过宽的 TS 侧规则，去拒绝 PyYAML
接受的有效 YAML。

另：文档根 block 序列变体（`- {a: 1\n# note\n, b: 2}`）仅 parser 层
测绘（注释 0 拒、1 接受），因根 block 序列不能是 workflow，未进矩阵；
dash-6 block-sequence 行已覆盖同一规则。

## 8. 文件与提交

- 代码提交：`479810e` "FIX-P0-11: Oracle rejects indent-0
standalone comment lines in flow mappings (R10 R6)"
—— `oracle/checkpath_oracle/parser.py`（新规则
`_reject_unseparated_comment_in_flow` 约 250 行、FlowEndToken 豁免收窄、
两入口接线），`evidence/probes/fix-p0-11/`（cases.json 124 形状、
run-matrix.py、results.json、README.md、ts-probe-entry.ts），
`evidence/probes/r10/results.json`（88/88），
`evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`（P2-R10-2），
旧矩阵 `cases.json` + `results.json`（P2-R10-1，14 标志清零）+
README 清除注记（fix-p0-04/05/07/08/09）；T007/T008/T009 报告重跑
确认一致（48/46/44，0 mismatch），文件与已提交版逐字节相同，故未改动。
- 报告提交：`handoff/P020-FIX-P0-11/TASK_REPORT.md`
（本文件）。
- Trial freeze：两次，三哈希一致——source.zip
`08b8c360fcd7efa2b7be98a3e1ca34eb0fac32d755668c18b5253451d7ebf3b1`
（2188 文件）、dist.zip
`57dc0f8d2cbbad9fdb6b9fd45b5cc30bf19ddd587ac16147ad980a7c8b46e7b9`
（114 文件，未变）、RELEASE_MANIFEST.json
`19b26ec154c067378588dfd217803c80d29f930638c61e2387c35323bbe33f6c`；
之后已 `git checkout release/` 恢复 R2 正式产物。
