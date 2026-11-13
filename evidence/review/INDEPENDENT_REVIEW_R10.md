# T013 独立复核 R10 — FIX-P0-10（R9 R4/R5）复核报告

- **审查对象**：代码提交 `8ef847b`（FIX-P0-10：Oracle 拒收缩进 0 的 flow 续行；相对 `4e6e7f9`，149 文件，+8819/−328）。终报提交 `15e598c` 只含终报文本，不在代码审查范围内。
- **复核员**：T013 独立复核员（全新会话，与 FIX-P0-10 修复方、R9 复核员均隔离；未共享上下文）。
- **复核环境**：干净克隆 `~/workspace/p020-review-r10/`（`git clone ~/workspace/p020-checkpath` 后 `git checkout 8ef847b`），`git status` 干净（仅复核探针 `evidence/probes/r10/` 未跟踪 + 两份由测试重跑再生成的报告文件），`git log --oneline -2` 顶为 `8ef847b`。全部命令均在该克隆内亲自跑；未与任何修复并行同一工作树（R4 污染教训）。
- **结论：NOT PASS — P0 1 / P1 0 / P2 10。**

## §0 审查对象与无污染声明（先读）

- 本轮只审查 `8ef847b` 的代码。`15e598c` 的终报文本仅作背景阅读；报告中所有数字均由本轮亲自重跑得出，未采信终报数字。
- 复核探针全部在干净克隆内运行；探针证据（`evidence/probes/r10/`：`cases.json` 44 行、`r10-probe.py`、`results.json`、README）随本报告一并提交入仓库，不只留 `/tmp`（P2-R6-2 的教训；`/tmp` 在 VM 重启 #42 时已被清空）。
- 终报 §5 对 P2-R9-1 的订正（`expected.json` 27/11）已由本轮独立核实，见 §7。

## §1 R9 的 R4/R5 P0 — 全部关闭（已验证）

R9 定级的 grouped P0（R4/R5：反向 flow 续行分歧）已关闭。本轮从 R9 报告原文（§2.1 表格）独立重建 9 形状（未复制修复方 `cases.json`），在干净克隆内 trigger + jobs 双模式重跑，**18/18 MATCH**（含于本轮自写探针 88 检查之中，见 §5）；修复方新矩阵 **314/314 MATCH**；六旧矩阵全部 100%（fix-p0-04 100/100 含 R5 子集 66/66、fix-p0-05 76/76、fix-p0-06 134/134、fix-p0-07 86/86、fix-p0-08 164/164、fix-p0-09 **98/98**——其 6 处已标记 R4/R5 检查现全部 MATCH）；R9 探针重跑 **52/52 MATCH**（修复前 34/52）。阈值边沿亦全部 MATCH：`jobs env:` 逗号缩进 4 拒 / 5 受、深层 `with:` 逗号缩进 10 拒 / 11 受、块序列破折号缩进 6 时逗号 6 拒 / 7 受；仅闭合行、flow 起始行、空行、行内注释均与 TS 一致。

| 检查 | 结果 |
|---|---|
| R9 的 9 形状 × trigger+jobs | **18/18 MATCH**（双边 INVALID / `yaml_parse_error`，R4-ON 亦同码） |
| fix-p0-10 新矩阵（157 行 × 2） | **314/314 MATCH**（修复前 148 检查 DIFF） |
| 六旧矩阵重跑 | **100/100、76/76、134/134、86/86、164/164、98/98**；重跑后 `results.json` 与提交版逐字节一致 |
| R5 66 例子集 | **66/66 MATCH**（内含于 fix-p0-04） |
| R3 回归形状（多行引用键） | MATCH（双边 INVALID） |

## §2 新发现：R6 — flow 映射内缩进 0 的独立注释行（TS 更严）

修复方终报 §2 称“空行 / 注释行：跳过（无 token；PyYAML 丢弃注释）”。本轮证实该豁免只对**行内注释**成立；**独立注释行**（整行只有 `# ...`）在 flow 映射内缩进 0 时，TS 拒绝而 Oracle 接受。修复方 157 例矩阵中只有 2 例注释形状，且均为行内注释（`m: {a: 1, # c`），从未测过独立注释行。

### 2.1 现象

`yaml` npm 包在 flow 映射内、一个完整 `key: value` 对之后（该行不以逗号结尾）遇到缩进 0 的独立注释行时抛错（"Comments must be separated from other tokens by white space characters"），而 PyYAML 丢弃注释后正常接受。方向与 R4/R5 相同——TS 侧更严；`parse()` 本身拒绝，AST 规则到不了门，故 TS 侧无法修，只能 Oracle 侧修（见 §2.6 的约束）。

| 例 | 输入 | TS | Oracle |
|---|---|---|---|
| R6-EXTRA（本轮新增） | `m: {a: 1\n# note\n , b: 2}` | **INVALID / yaml_parse_error**，events `[]`，jobs `[]` | **VALID**，events `[push]`，jobs `[test]` |
| R6-ON（本轮新增） | `on: {push: {types: [opened]}\n# note\n , pull_request}` | **INVALID / yaml_parse_error**，jobs `[]` | **VALID**，events `[push types [opened], pull_request]`，jobs `[test]` |
| R6-ON-UNSUPPORTED（本轮新增） | `on: {push: {types: [opened]}\n# note\n , pull}` | **INVALID / yaml_parse_error** | **UNKNOWN**（`unsupported_event:pull`），events 仍解析出 `[push, pull]` |
| R6-CLOSE（本轮新增） | `m: {a: 1, b: 2\n# note\n}` | **INVALID** | **VALID** |
| R6-NESTEDBLOCK（本轮新增） | `x:\n  m: {a: 1\n# note\n   , b: 2}`（`m:` 缩进 2，注释 0，逗号 3） | **INVALID** | **VALID** |

合计 **10 处 DIFF / 88 检查**（5 形状 × trigger+jobs；其余 78 检查全部 MATCH）。R6-ON 证明分歧触及核心输入槽位 `on:`；R6-CLOSE 证明续行 token 不必是逗号/冒号——注释行后仅剩闭合 `}` 也分歧。

### 2.2 两侧输出原文（R6-ON，trigger 模式）

输入 YAML：

```yaml
on: {push: {types: [opened]}
# note
 , pull_request}
name: probe
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
```

TS（`parseWorkflowYaml`）：

```json
{"schema":"checkpath.trigger-ir/v1","fixture_id":"probe","on_key_is_string":false,"status":"INVALID","events":[],"evaluation":{"event_match":null,"activity_type_match":null,"branch_match":null,"branch_value":null,"path_match":null,"path_file_results":[],"commit_skip":false,"triggered":null,"unsupported":[],"reason":"invalid"},"errors":["yaml_parse_error"]}
```

Oracle（`scripts/oracle-parse-probe.py`）：

```json
{"errors": [], "evaluation": {"activity_type_match": null, "branch_match": null, "branch_value": null, "commit_skip": false, "event_match": null, "path_file_results": [], "path_match": null, "reason": "triggered", "triggered": null, "unsupported": []}, "events": [{"branches": null, "branches_ignore": null, "name": "push", "paths": null, "paths_ignore": null, "types": ["opened"]}, {"branches": null, "branches_ignore": null, "name": "pull_request", "paths": null, "paths_ignore": null, "types": null}], "fixture_id": "probe", "on_key_is_string": true, "schema": "checkpath.trigger-ir/v1", "status": "VALID"}
```

jobs 模式：TS 返回 `[]`，Oracle 返回 `[{"id": "test", "if": null, "name": null, "needs": [], "unsupported_job": null}]`。

### 2.3 两侧输出原文（R6-EXTRA，trigger 模式）

输入 YAML：

```yaml
m: {a: 1
# note
 , b: 2}
name: probe
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
```

TS：`status INVALID`，`errors ["yaml_parse_error"]`，`events []`，`on_key_is_string false`；Oracle：`status VALID`，`errors []`，`events [{"name": "push", ...}]`，`on_key_is_string true`。jobs 模式：TS `[]` vs Oracle `[test]`。

### 2.4 与探针驱动无关的最小复现（解析器层）

直接对解析器本身验证（干净克隆内，不经任何探针驱动）：

- PyYAML `yaml.safe_load` 对以下 10 形状**全部接受**：`m: {a: 1\n# note\n , b: 2}`、`m: {a: 1\n # note\n , b: 2}`、`m: {a: 1\n# note\n, b: 2}`、`m: {a: 1, # c\n b: 2}`、`m: {a: 1\n\n , b: 2}`、`m: [a\n# note\n , b]`、`m: {n: {a: 1\n# note\n , b: 2}}`、`on: {push\n# note\n , pull}`、`m: {a: 1\n# note\n , b: 2, c: 3}`、`m: {a: 1, b: 2}\n# note\nname: probe`。
- `yaml` npm 包 `YAML.parse`：**拒绝** `m: {a: 1\n# note\n , b: 2}`、`m: {a: 1\n# note\n, b: 2}`、`m: {n: {a: 1\n# note\n , b: 2}}`、`m: {a: 1\n# note\n , b: 2, c: 3}`（均为 "Comments must be separated from other tokens by white space characters at line 2, column 1"）；**接受**其余 6 形状（注释缩进 1、行内注释、空行、flow 序列、`on:` 裸键、闭合后注释）。

分歧在解析器层，与探针脚手架无关。

### 2.5 触发条件的精确钉牢（20 形状解析器层测绘）

| 条件 | TS | 说明 |
|---|---|---|
| 注释行缩进 0 + 之前为完整 `key: value` 对（行尾无逗号） | **REJECT** | R6 本体：`m: {a: 1`、`on: {push: {...}`、嵌套、块嵌套、两行注释、注释后仅闭合行均拒 |
| 注释行缩进 ≥ 1 | OK | 边界精确：缩进 1 即双边一致 |
| 注释行在行尾逗号之后（`m: {a: 1,` 换行 `# note`） | OK | 解析器处于“已见逗号”状态，注释可接受 |
| 注释行在裸键之后（`m: {a` 换行 `# note`） | OK | 解析器仍在等 `:`/`,`/`}`，注释可接受 |
| 注释行在 flow **序列**内（`m: [a\n# note\n , b]`、`m: [{a: 1}\n# note\n , {b: 2}]`） | OK | 仅 flow **映射**触发 |
| 行内注释（`m: {a: 1, # c`） | OK | 修复方矩阵仅有的 2 例注释形状即此类 |
| 注释行在 flow 闭合之后（文档级） | OK | 不在 flow 集合内 |

边界精确：分歧只发生在**独立注释行缩进 0、位于 flow 映射内、且前一行为不以逗号结尾的完整对**时；其余位置双边一致。这与 R4/R5 同族（TS 解析器更严）不同形（另一条解析器规则），故单独立项 R6，不并入 R4/R5。

### 2.6 修复方向与约束（供 FIX-P0-11）

- 只能 Oracle 侧修：TS 侧 `parse()` 本身拒绝，AST 规则到不了门（与 R4/R5 同理）。
- **约束**：PyYAML token 流完全丢弃注释——`_reject_*` 家族的 token 扫描**看不见**注释行。本轮规则不能直接复用 token 扫描；需新增**原文行扫描**：在 flow 映射的行跨度内（由 token 起止行界定），拒绝满足以下全部条件的独立注释行——行首非空字符为 `#`、行缩进 ≤ 最内层 block 集合缩进、且前一有效行不以逗号结尾且不是裸键行。必须小心不误拒 §2.5 的 OK 位置（逗号后、裸键后、flow 序列内、缩进 ≥ 1、行内注释）。
- 修复时须以本轮探针（`evidence/probes/r10/`，44 行）为回归基线，并按 §2.5 的 20 形状解析器层测绘逐项验证。

## §3 定级：P0（1 项：R6）的依据与权衡

定级 **P0（1 项，R6；R4/R5 已关闭，不计入）**，依据：

- PROJECT_BOOK §7.3（L513）：“Oracle 与实现**任何字段不一致都判失败；不得通过忽略字段、容差或人工解释来放行**。”
- PROJECT_BOOK §8.2（L548）：“Oracle parity | 100% | 所有受支持输入完全一致。”
- IMPLEMENTATION_PLAN §8.1（L779）：“Oracle 输出规范化 JSON；差分脚本逐字段比较。**任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。**”
- IMPLEMENTATION_PLAN §10（L827）：P0 阻断明确包含 “**Oracle mismatch**”。
- **R7 裁决先例**：R7 的 RESID（TS INVALID vs Oracle VALID，TS 更严，同一方向）定为 P0。方向不改变定级。
- **R3-ON 裁决先例**：双边 INVALID 但错误码与 jobs 不同已定 P0；R6 的 4 个形状为一侧 VALID 一侧 INVALID 的完全有效性分歧，比 R3-ON 更严重（R6-ON-UNSUPPORTED 一侧为 UNKNOWN，仍为有效性分歧）。
- **终审 R2 的裁决先例**：把同类分歧降为 P2 的理由被终审明确驳回（R3 的教训）。

**已权衡的反方考虑（记录在案，不改变定级）：**
- (a) 输入形状退化（真实 workflow 里几乎不会在 flow 映射内写缩进 0 的独立注释行）。但“真实 workflow 几乎不会出现”正是 §7.3 明文禁止的“人工解释”放行理由；R2 P0 的输入（重复键）同样是无效 workflow，仍被定为 P0。且 R6-ON/R6-ON-UNSUPPORTED 证明分歧触及核心输入槽位（`on:`），不能以“额外键形状退化”为由豁免。
- (b) 从 YAML 规范看，`yaml` 包的注释分隔规则未必比 PyYAML 更合规范。但本项目的验收标尺不是 YAML 规范，而是 §7.3 的“Oracle 与实现完全一致”——谁更合规范不改变定级（与 R8 对 R3 的权衡 (b)、R9 对 R4/R5 的权衡 (b) 同理）。
- (c) 修复只能 Oracle 侧做，且 token 流看不见注释，需新增原文行扫描机制（见 §2.6），比 R4/R5 的修复更复杂。修复难度与修复位置不影响定级：定级只看是否存在 mismatch（与 R8 对 R3 的权衡 (c) 同理）。
- (d) 分歧面窄（§2.5 边界表：仅独立注释行缩进 0 + 完整对之后 + flow 映射内），修复方向明确（Oracle 侧原文行扫描拒收规则），不是死胡同。R6 与 R4/R5 同方向不同根因（另一条解析器规则），故单独立项，不分组并入 R4/R5。

## §4 违规捷径检查：无

- `oracle/` diff（`4e6e7f9..8ef847b`）= 仅 `parser.py`（+147 行，0 删除）；`src/` diff = 0。
- 删测试 0（`git diff --diff-filter=D` 为空）；测试/夹具 diff 中无 `skip`/`only` 弱化。
- 无 mismatch 忽略名单（`deepDiff` 未动）；无输入文本手术；无解析器更换。
- 终报文案数字有一处订正，见 P2-R9-1（已订正，数据本身正确，不属捷径）。
- 试冻 manifest 的 `inputs` 仍只记录到 R3，见 P2-R6-1（T014 重冻时处理）。

## §5 全量重跑（干净克隆 `~/workspace/p020-review-r10`，HEAD `8ef847b`，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，exit 0） |
| `npm test` | **1469/1469 通过**（43 test files） |
| `npm run test:oracle` | 167/167，0 偏差，0 false PASS；`ORACLE_PARITY_REPORT.json`：fixture_count 167, passed 167, failed 0, oracle_mismatch_count 0；unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 128 夹具，0 mismatch（`T006_ORACLE_TRIGGER_REPORT.json`：fixture_count 128, passed 128, failed 0） |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch |
| `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；oracle 24/24，100 次运行 1 个唯一哈希；gate hash 见下 |
| `npm run release:verify` | **PASS**；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `python3 scripts/build-golden.py --check-only` | golden cases 167，exit 0 |

**S0 gate hash 说明：** 干净克隆的 `evidence/S0_GATE.json` status 为 PASS，但 `gate_report_sha256` 为 `5122c3f2c54cbf2bb2bc4d7ee76f38f84c820621dd31e114f5fe24b75992f3a5`，与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是 `environment_fingerprint`**（克隆路径不同导致；其余字段全部一致，含 `input_fixture_sha256`、`conditions` 全 true、determinism 100/1、unsupported 2/2）。这不是回归（与 R4 的 `4617899b…`、R5 的 `0fdf620b…`、R6 的 `0c4703b0…`、R7 的 `b5ce164c…`、R8 的 `365ce033…`、R9 的 `ff0ab054…` 为同一现象，不同克隆路径不同指纹）。

**探针矩阵重跑（干净克隆，仓库内 runner，全 JSON 深相等；重跑后 `results.json` 与提交版逐字节一致）：**

| 矩阵 | 结果 |
|---|---|
| fix-p0-04 | **100/100 MATCH**（前 66 行 R5 子集 **66/66 MATCH**） |
| fix-p0-05 | **76/76 MATCH** |
| fix-p0-06 | **134/134 MATCH** |
| fix-p0-07 | **86/86 MATCH** |
| fix-p0-08 | **164/164 MATCH** |
| fix-p0-09 | **98/98 MATCH**（6 个已标记 R4/R5 行现全部 MATCH） |
| fix-p0-10 | **314/314 MATCH**（修复前 148 检查 DIFF） |
| R9 探针 | **52/52 MATCH**（修复前 34/52） |

**R10 独立探针（自写，`evidence/probes/r10/r10-probe.py`，44 例 ×2 模式 = 88 检查；R4/R5 形状自 R9 报告原文重建，阈值边沿与 R6 形状自写，未复制修复方 `cases.json`）：**

| 组 | 结果 |
|---|---|
| R4/R5 9 形状（§1） | 9 例 ×2 模式 **18/18 MATCH** |
| 缩进 1 边界 3 形状 | 3 例 ×2 模式 **6/6 MATCH** |
| 阈值边沿 16 形状（env/with/序列/起始行/空行/行内注释/锚点/flow 序列/值/键/嵌套起始/R3 回归） | 16 例 ×2 模式 **32/32 MATCH** |
| R6 5 形状（§2） | 5 例 ×2 模式 **0/10 MATCH**（10 处 DIFF） |
| 对照 3 形状（逗号后注释、裸键后注释、flow 序列内注释） | 3 例 ×2 模式 **6/6 MATCH** |

探针合计 1,112 检查（七矩阵 972 + R9 探针 52 + R10 独立探针 88；七矩阵 = fix-p0-04 100 + fix-p0-05 76 + fix-p0-06 134 + fix-p0-07 86 + fix-p0-08 164 + fix-p0-09 98 + fix-p0-10 314；注：各矩阵与探针有形状重叠，合计为检查次数非去重形状数），DIFF 10 处（5 形状 × 2 模式，全部为 R6 同一根因）。

## §6 试冻三哈希（干净克隆，`--trial`，三次）

三次 `npm run release:freeze -- --trial`（HEAD `8ef847b`）哈希完全一致，确定性成立：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `53ac6dae6e94dfc2235117163c6bde2c5ce5edde833499dc819907ced53ecb45`（2,176 文件） | 与修复方试冻逐字节一致 |
| dist.zip | `57dc0f8d2cbbad9fdb6b9fd45b5cc30bf19ddd587ac16147ad980a7c8b46e7b9`（114 文件） | 与 `a8ca5ec` 试冻相同——dist 为纯 TS 发行物，不含 Oracle，故 Oracle 改动不改变 dist；与 R2 的 `da130ad2…` 相比已变（TS 代码改动，属预期） |
| RELEASE_MANIFEST.json | `b0b9da2afd6844aeebb15e47ceb6c07faf5daf645ff11d8d2fa394a2cbb8d7b2` | source_commit `8ef847b`，freeze_status TRIAL；与修复方值一致 |

`sha256sum -c` 3/3 OK。试冻后已 `git checkout release/`，克隆内 `release/` 恢复为 HEAD 正式件。注：`8ef847b` 尚无正式冻结（T014 未做），故此处是“同一树多次试冻哈希一致”的确定性验证，而非与已冻结包比对。

## §7 P2 清单：终审 R2 的 6 个 + R6 的 2 个 + R10 新增 2 个 = 10 个，全部非阻断

| P2 | 复核（8ef847b） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。`git diff 4e6e7f9..8ef847b -- scripts/deterministic-zip.py` 为空，冻结脚本未动，仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§6） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。README 仍为 “P95 768.3 ms, peak RSS 98.3 MiB”，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 仍有 `NOT_TESTED`，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；全仓库 grep `USER_VALUE` 仅复核报告与终报提及，无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。试冻 manifest 的 freeze_commit 字段为 TRIAL 说明；正式冻结时 T014 报告 §9 补实际 commit（同 R2 模式） |
| **P2-R6-1：manifest 的 `inputs` 只记录 t013 复核到 R3** | 仍成立。试冻 manifest 的 `inputs` 键为 golden_suite_sha256、oracle_parity_report、s0_gate、s0_input_fixture_sha256、t013_review_r1/r2/r3——R4/R5/R6/R7/R8/R9/R10 七轮复核均未记录。与 P2-R3-2 同类问题；T014 重冻时须把 R4–R10 一并记入，非阻断 |
| **P2-R6-2：复核探针证据未入仓库** | 部分缓解，仍成立。R7/R8 自写探针只在 `/tmp` 与报告中（VM 重启 #42 已清空 `/tmp`，只能按报告文本重建）；R9/R10 自写探针已随报告提交入仓库（`evidence/probes/r9/`、`evidence/probes/r10/`），故“后续复核探针入仓”的要求自 R9 起已满足。非阻断 |
| **P2-R10-1（新增）：旧矩阵 `results.json` 中 `known_divergence` 旗标未清除** | fix-p0-09 等旧矩阵的 `results.json` 里，被标记 `known_divergence` 的行现已 MATCH，但旗标仍留在文件中（修复方终报 §6 称按先例未改，系历史元数据）。旗标行现为 MATCH，以检查结果为准；T014 或后续修复轮应在重跑时清除已失效的旗标，或在 README 中注明旗标为历史标记。非阻断 |
| **P2-R10-2（新增）：提交版 T006 报告的 `suite_sha256` 过期** | `evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`（提交版 `8ef847b`）记录的 `suite_sha256` 为 `6952ae86…`，与同一提交的 `tests/fixtures/trigger/suite.json` 实测哈希 `36c3853d…` 不符；该哈希与最近 5 版 suite.json 均不匹配，说明报告生成后 suite.json 又被改动，未重跑 diff。数字本身正确（fixture_count 128、passed 128、mismatch 0，本轮重跑证实并已生成正确哈希的报告），仅记录的输入哈希过期。T007/T008/T009 三份报告的 suite 哈希均与提交版一致。非阻断；修复方或 T014 在下一轮重跑 diff 时即自动刷新 |

**P2-R9-1（已解决，不再列入未决清单）：** FIX-P0-09 报告中 `expected.json` 的计数文字“25 INVALID / 13 VALID”确为错误；本轮独立逐项计数证实两侧均为 **27 INVALID / 11 VALID**（f01–f10 10/0、f11–f19 9/0、f20–f28 1/8、f29–f38 7/3；双边 38/38 一致）。FIX-P0-10 终报 §5 与 `evidence/probes/fix-p0-10/README.md` 已按 R9 要求记录订正；fixture 数据本身正确、未动。另：许可证仍为 PENDING_SAM_DECISION（`release:verify` license guard 通过，无 LICENSE 文件）。

## §8 未审查事项与报告瑕疵记录

- 未审查：`15e598c` 终报提交本身（只含终报文本，无代码）；终报 §3 过程记录中的 bug 修正（`check_line` 缺续行守卫）已由本轮重跑验证无残留影响（矩阵与试冻均与终报值逐字节一致）。
- 未审查：Drive 归档状态与终审对话（不在 T013 复核范围内）。
- 本报告瑕疵：R10 自写探针的 R4/R5 形状系按 R9 报告文字重建，未逐字复核 R9 原始用例原文；结论（全部 MATCH）仅针对重建形状。`r10-r6-on-pair` 使用了不支持事件 `pull`，Oracle 侧为 UNKNOWN 而非 VALID——该形状的 DIFF 仍成立（TS 无法解析 vs Oracle 解析后评估），且另有 `pull_request` 的干净形状 `r10-r6-on-pair2`（Oracle VALID）佐证同一结论。
- 本轮未发现 R6 之外的其他分歧：测绘范围外的形状（如 flow 映射内缩进 0 的独立注释行位于 `branches:` 深层、或注释行后紧跟锚点/标签）未穷尽，留待后续轮次；但 §2.5 的 20 形状解析器层测绘已覆盖触发条件的各维度。

## §9 亲自跑过的命令与结果（摘要）

全部在干净克隆 `~/workspace/p020-review-r10`（HEAD `8ef847b`）内运行；`npm ci` 后执行。

| # | 命令 | 结果 |
|---|---|---|
| 1 | `git clone ~/workspace/p020-checkpath ~/workspace/p020-review-r10 && git checkout 8ef847b` | 顶为 `8ef847b`，工作树干净 |
| 2 | `npm ci --no-audit --no-fund` | 181 packages，exit 0 |
| 3 | `npm test` | 1469/1469（43 files） |
| 4 | `npm run test:oracle` | 167 夹具，0 mismatch，0 false PASS，34/34 UNKNOWN |
| 5 | `npm run oracle:diff:trigger` / `jobs` / `checks` / `witness` | 128 / 48 / 46 / 44，全部 0 mismatch |
| 6 | `npm run typecheck` | PASS，exit 0 |
| 7 | `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| 8 | `python3 scripts/build-golden.py --check-only` | 167 cases，exit 0 |
| 9 | `npm run s0:gate` | PASS；24/24；唯一差异 environment_fingerprint |
| 10 | `npm run release:verify` | PASS |
| 11 | `python3 evidence/probes/r9/r9-probe.py` | 52/52 MATCH |
| 12 | `python3 evidence/probes/fix-p0-10/run-matrix.py` | 314/314 MATCH |
| 13 | `python3 evidence/probes/fix-p0-04/run-matrix.py` | 100/100 MATCH（R5 子集 66/66） |
| 14 | `python3 evidence/probes/fix-p0-05/run-matrix.py` | 76/76 MATCH |
| 15 | `python3 evidence/probes/fix-p0-06/run-matrix.py` | 134/134 MATCH |
| 16 | `python3 evidence/probes/fix-p0-07/run-matrix.py` | 86/86 MATCH |
| 17 | `python3 evidence/probes/fix-p0-08/run-matrix.py` | 164/164 MATCH |
| 18 | `python3 evidence/probes/fix-p0-09/run-matrix.py` | 98/98 MATCH |
| 19 | `python3 evidence/probes/r10/r10-probe.py` | 78/88 MATCH（10 处 DIFF，全部 R6） |
| 20 | PyYAML `safe_load` × 10 形状 + `yaml` npm `YAML.parse` × 10 形状 | PyYAML 全接受；`yaml` 包 4 拒 6 受（见 §2.4） |
| 21 | PyYAML × 10 钉牢形状 + `yaml` npm × 10 钉牢形状 | PyYAML 全接受；`yaml` 包 7 拒 3 受（见 §2.5） |
| 22 | `npm run release:freeze -- --trial` × 3 | 三哈希三次一致；`sha256sum -c` 3/3 OK |
| 23 | `git diff 4e6e7f9..8ef847b --stat` / `-- oracle/` / `-- src/` / `--diff-filter=D` | 149 文件 +8819/−328；oracle/ 仅 parser.py；src/ 0；删文件 0 |
| 24 | `expected.json` 逐项计数 | per-side 27 INVALID / 11 VALID（终报称 25/13，见 P2-R9-1 已解决） |
| 25 | T006–T009 报告 suite 哈希核对 | 仅 T006 过期（见 P2-R10-2），其余一致 |

## §10 给 parent 的下一步

1. **定点修复 §2 的 R6**（修复方向：Oracle 侧原文行扫描拒收规则——拒绝 flow 映射内、完整对之后、缩进 ≤ 最内层 block 集合缩进的独立注释行；注意 PyYAML token 流看不见注释，不能复用 token 扫描；须按 §2.5 的边界表逐项验证 OK 位置不被误拒：逗号后、裸键后、flow 序列内、缩进 ≥ 1、行内注释），然后派**新的独立复核 R11**（审查对象为修复后 HEAD；复核员一律在干净克隆里验证，不得与修复并行同一工作树；R11 须重跑本报告 §2 的 R6 5 形状 + 七矩阵 + R5 66 例 + 本轮 44 行矩阵）。
2. R11 PASS 后：T014 正式重新冻结（manifest `inputs` 须记入 R4–R10，见 P2-R6-1；并清除已失效的 `known_divergence` 旗标，见 P2-R10-1；重跑 diff 刷新 T006 报告哈希，见 P2-R10-2）→ Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3（同一立项对话，GPT-6 + Extra High + 完整结尾句）。
3. 修复方终报的 `expected.json` 计数错误（P2-R9-1）已在本轮终报与探针 README 中订正，无需再追。
