# T013 独立复核 R9 — FIX-P0-09（R8 R3）复核报告

- **审查对象**：代码提交 `a8ca5ec`（FIX-P0-09：TS 拒收 flow 映射中的多行引用键；相对 `2920cc6`，145 文件，+5998/−273）。终报提交 `b2ab422` 只含终报文本，不在代码审查范围内。
- **复核员**：T013 独立复核员（全新会话，与 FIX-P0-09 修复方、R8 复核员均隔离；未共享上下文）。
- **复核环境**：干净克隆 `~/workspace/p020-review-r9/`（`git clone ~/workspace/p020-checkpath` 后 `git checkout a8ca5ec`），`git status` 干净，`git log --oneline -2` 顶为 `a8ca5ec`。全部命令均在该克隆内亲自跑；未与任何修复并行同一工作树（R4 污染教训）。
- **结论：NOT PASS — P0 1 / P1 0 / P2 9。**

## §0 审查对象与无污染声明（先读）

- 本轮只审查 `a8ca5ec` 的代码。`b2ab422` 的终报文本仅作背景阅读；报告中所有数字均由本轮亲自重跑得出，未采信终报数字。
- 复核探针全部在干净克隆内运行；探针证据（`evidence/probes/r9/`：`cases.json`、`r9-probe.py`、`results.json`、README）随本报告一并提交入仓库，不只留 `/tmp`（P2-R6-2 的教训；`/tmp` 在 VM 重启 #42 时已被清空）。
- 终报中一处数字错误见 P2-R9-1（`expected.json` 计数 25/13，实测 27/11；数据本身正确，仅终报文案错）。

## §1 R8 的 R3 P0 — 全部关闭（已验证）

R8 定级的 grouped P0（R3：反向 flow 键分歧）已关闭。本轮从 R8 报告原文（§2.1 表格）独立重建 10 形状（未复制修复方 `cases.json`），在干净克隆内 trigger + jobs 双模式重跑，**20/20 MATCH**：

| 例 | 输入（续行缩进） | TS | Oracle |
|---|---|---|---|
| R3-EXTRA-IND1 | `m: {"a\n b": 1}`（缩进 1） | INVALID / yaml_parse_error | INVALID / yaml_parse_error（MATCH） |
| R3-ON-IND1 | `on: {"a\n b": push}`（缩进 1） | INVALID / yaml_parse_error | INVALID / yaml_parse_error（MATCH） |
| R3-EXTRA-IND0 | `m: {"a\nb": 1}`（缩进 0） | INVALID | INVALID（MATCH） |
| R3-ON-IND0 | `on: {"a\nb": push}`（缩进 0） | INVALID | INVALID（MATCH） |
| R3-EXTRA-SQ | `m: {'a\n b': 1}`（缩进 1，单引号） | INVALID | INVALID（MATCH） |
| R3-ON-SQ | `on: {'a\n b': push}`（缩进 1，单引号） | INVALID | INVALID（MATCH） |
| R3-EXTRA-IND2 | `m: {"a\n  b": 1}`（缩进 2） | INVALID | INVALID（MATCH） |
| R3-NESTED | `m: {n: {"a\n b": 1}}`（嵌套） | INVALID | INVALID（MATCH） |
| R3-BLOCKKEY | 块映射键 `"a\n  b": push` | INVALID | INVALID（MATCH） |
| R3-ON-IND9 | `on: {"a\n         b": push}`（缩进 9） | INVALID | INVALID（MATCH） |

修复方矩阵重跑亦证实：`fix-p0-09` 矩阵 **92/98 MATCH**（仅 6 处已标记 R4/R5 分歧；见 §2）；`fix-p0-08` 矩阵 **164/164 MATCH**（其 12 处已标记 R3 检查现全部 MATCH——R3 在旧矩阵中亦关闭）；其余四矩阵全部 100%（§5）。R3 的 10 形状在修复后 trigger 与 jobs 均双边 INVALID / `yaml_parse_error`，`on_key_is_string` 双边 false，jobs 双边 `[]`。

## §2 新发现：Grouped P0 — R4/R5 反向分歧（TS 更严）

修复方终报 §7 如实披露了两处新残留分歧（R4、R5），未隐瞒。本轮独立复核确认两者属实，且分歧面比披露的 3 形状 / 6 检查更宽：**9 形状 × trigger+jobs = 18 检查 DIFF**，并触及 `on:` 槽位与 `jobs:` 区域。

### 2.1 现象

`yaml` npm 包在 `parse()` 层拒绝 flow 映射中缩进 0 的续行（"Flow map in block collection must be sufficiently indented"），而 PyYAML 接受。方向与 R3 相反——TS 侧更严。AST 规则到不了门（门在 `parse()` 接受后才可达），故 TS 侧无法修，只能 Oracle 侧加拒收规则。

| 例 | 输入 | TS | Oracle |
|---|---|---|---|
| R4-IND0（已披露） | `m: {a\n, b: 1}`（逗号独占一行，缩进 0） | **INVALID / yaml_parse_error**，events `[]`，jobs `[]` | **VALID**，events `[push]`，jobs `[test]` |
| R4-NESTED（本轮新增） | `m: {n: {a\n, b: 1}}` | **INVALID** | **VALID** |
| R4-ON（本轮新增） | `on: {a\n, b: push}` | **INVALID / yaml_parse_error**，jobs `[]` | **INVALID / event_config_not_mapping**，jobs `[test]` |
| R4-JOBS（本轮新增） | `jobs: test.env: {A: 1\n, B: 2}` | **INVALID / yaml_parse_error**，jobs `[]` | **VALID**，jobs `[test]` |
| R5-PLAIN-IND0（已披露） | `m: {? a\n: 1}`（显式键冒号在下一行，缩进 0） | **INVALID / yaml_parse_error** | **VALID** |
| R5-QUOTED-IND0（已披露） | `m: {? "a"\n: 1}` | **INVALID** | **VALID** |
| R5-SQ-IND0（本轮新增） | `m: {? 'a'\n: 1}`（单引号） | **INVALID** | **VALID** |
| R5-NESTED（本轮新增） | `m: {n: {? a\n: 1}}` | **INVALID** | **VALID** |
| R5-ON（本轮新增） | `on: {? "push"\n: {types: [opened]}}` | **INVALID / yaml_parse_error**，jobs `[]` | **VALID**，events `[push, types [opened]]`，jobs `[test]` |

合计 **18 处 DIFF / 26 检查**（R4 6 形状 12 检查中 8 DIFF；R5 7 形状 14 检查中 10 DIFF；其余为缩进 ≥ 1 边界，见 §2.4）。R4-ON 与 R3-ON 同型（双边 INVALID 但错误码与 jobs 不同）；其余 8 形状为一侧 VALID 一侧 INVALID 的完全有效性分歧，比 R3-ON 更严重。

### 2.2 两侧输出原文（R4-IND0，trigger 模式）

输入 YAML：

```yaml
m: {a
, b: 1}
name: probe
on: push
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
{"errors": [], "evaluation": {"activity_type_match": null, "branch_match": null, "branch_value": null, "commit_skip": false, "event_match": null, "path_file_results": [], "path_match": null, "reason": "triggered", "triggered": null, "unsupported": []}, "events": [{"branches": null, "branches_ignore": null, "name": "push", "paths": null, "paths_ignore": null, "types": null}], "fixture_id": "probe", "on_key_is_string": true, "schema": "checkpath.trigger-ir/v1", "status": "VALID"}
```

jobs 模式：TS 返回 `[]`，Oracle 返回 `[{"id": "test", "if": null, "name": null, "needs": [], "unsupported_job": null}]`。

### 2.3 两侧输出原文（R5-ON，trigger 模式——R5 触及 `on:` 槽位）

输入 YAML：

```yaml
on: {? "push"
: {types: [opened]}}
name: probe
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
```

TS：`status INVALID`，`errors ["yaml_parse_error"]`，`events []`，`on_key_is_string false`；Oracle：`status VALID`，`errors []`，`events [{"name": "push", "types": ["opened"], ...}]`，`on_key_is_string true`。jobs 模式：TS `[]` vs Oracle `[test]`。R5 不是只影响额外键 `m:`——它直接影响核心输入槽位 `on:`。

### 2.4 与探针驱动无关的最小复现

直接对解析器本身验证（干净克隆内，不经任何探针驱动）：

- PyYAML `yaml.safe_load('m: {a\n, b: 1}')`：解析成功 `{'m': {'a': None, 'b': 1}}`；`yaml.safe_load('m: {? a\n: 1}')`：`{'m': {'a': 1}}`；`yaml.safe_load('m: {? "a"\n: 1}')`：`{'m': {'a': 1}}`。
- `yaml` npm 包 `YAML.parse` 对三形状均抛错：`Flow map in block collection must be sufficiently indented and end with a } at line 2, column 1`。

分歧在解析器层，与探针脚手架无关。TS 侧 `parse()` 本身拒绝，故 `hasMultilineFlowKey` 类 AST 规则无法覆盖——门在 `parse()` 接受后才可达，而该形状到不了门。只能 Oracle 侧加拒收规则（`_reject_adjacent_alias_colon` 同一家族）。

### 2.5 已排除的相邻变体（均 MATCH，证明分歧面有明确边界）

| 变体 | 结果 |
|---|---|
| R4 逗号缩进 1（`m: {a\n , b: 1}`） | MATCH（双边 VALID） |
| R4 逗号缩进 2（`m: {a\n  , b: 1}`） | MATCH（双边 VALID） |
| R5 冒号缩进 1（`m: {? a\n : 1}`、`m: {? "a"\n : 1}`） | MATCH（双边 VALID） |
| R3 全部 10 形状（§1） | MATCH（双边 INVALID） |
| 单行引用键内 tab（`m: {"a\tb": 1}`，V8） | MATCH（双边 VALID） |
| 多行引用值（`m: {"a": "x\n y"}`，V3/V4） | MATCH（双边 VALID） |
| 显式块键（`? "a\n  b"\n: 1`） | MATCH（双边 VALID） |

边界精确：分歧只发生在**续行缩进恰为 0** 时；缩进 ≥ 1 双边一致。这与 R7 RESID（未缩进续行）同族不同形。

## §3 定级：P0（分组计 1 项）的依据与权衡

定级 **P0（1 项，分组计，含 §2 的 9 例 / 18 处 DIFF）**，依据：

- PROJECT_BOOK §7.3（L513）：“Oracle 与实现**任何字段不一致都判失败；不得通过忽略字段、容差或人工解释来放行**。”
- PROJECT_BOOK §8.2（L548）：“Oracle parity | 100% | 所有受支持输入完全一致。”
- IMPLEMENTATION_PLAN §8.1（L779）：“Oracle 输出规范化 JSON；差分脚本逐字段比较。**任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。**”
- IMPLEMENTATION_PLAN §10（L827）：P0 阻断明确包含 “**Oracle mismatch**”。
- **R7 裁决先例**：R7 的 RESID（TS INVALID vs Oracle VALID，TS 更严，同一方向）定为 P0。方向不改变定级。
- **终审 R2 的裁决先例**：把同类分歧降为 P2 的理由被终审明确驳回（R3 的教训）。R4/R5 中 8 形状为一侧 VALID 一侧 INVALID，比 R2 P0（双边 fail-closed）更严重；R4-ON 与 R3-ON 同型（双边 INVALID 但错误码与 jobs 不同），R3-ON 已定 P0。

**已权衡的反方考虑（记录在案，不改变定级）：**
- (a) 输入形状退化（真实 workflow 里几乎不会出现缩进 0 的 flow 续行）。但“真实 workflow 几乎不会出现”正是 §7.3 明文禁止的“人工解释”放行理由；R2 P0 的输入（重复键）同样是无效 workflow，仍被定为 P0。且 R5-ON 与 R4-JOBS 证明分歧触及核心输入槽位（`on:` 与 `jobs:`），不能以“额外键形状退化”为由豁免。
- (b) 从 YAML 规范看，PyYAML 接受缩进 0 续行、`yaml` 包拒绝，未必谁更合规范。但本项目的验收标尺不是 YAML 规范，而是 §7.3 的“Oracle 与实现完全一致”——谁更合规范不改变定级（与 R8 对 R3 的权衡 (b) 同理）。
- (c) 修复只能 Oracle 侧做（FIX-P0-10 候选方向），且需新一轮。修复难度与修复位置不影响定级：定级只看是否存在 mismatch（与 R8 对 R3 的权衡 (c) 同理）。
- (d) 分歧面窄（§2.5 边界表：仅缩进 0），修复方向明确（Oracle 侧拒收规则，与 `_reject_adjacent_alias_colon` 同一家族），不是死胡同。R4 与 R5 同一根因（`yaml` 包 flow 解析器拒绝缩进 0 的续行），故分组计 1 项；若 parent 倾向分开计数，则为 P0 2 项，修复轮次仍为同一 FIX-P0-10。

## §4 违规捷径检查：无

- `oracle/` diff = 0（`git diff 2920cc6..a8ca5ec -- oracle/` 为空）。
- 删测试 0（`git diff --diff-filter=D` 为空）；`src/` 只改两文件（`workflow-parser.ts`、`e2e.ts`）；测试/夹具 diff 中无 `skip`/`only` 弱化（唯一命中为 `hasMultilineFlowKey` 内注释 `// Skip the comment to the end of its line.`）。
- 无 mismatch 忽略名单（`deepDiff` 未动）；无输入文本手术；无解析器更换。
- 终报文案数字有一处错误，见 P2-R9-1（数据本身正确，仅终报文案计数错，不属捷径）。

## §5 全量重跑（干净克隆 `~/workspace/p020-review-r9`，HEAD `a8ca5ec`，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，exit 0） |
| `npm test` | **1372/1372 通过**（42 test files） |
| `npm run test:oracle` | 155/155，0 偏差，0 false PASS；`ORACLE_PARITY_REPORT.json`：fixture_count 155, passed 155, failed 0, oracle_mismatch_count 0；unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 116 夹具，0 mismatch |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch |
| `npm run s0:oracle` | 0 false PASS；unsupported 2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；oracle 24/24，100 次运行 1 个唯一哈希，network 0；gate hash 见下 |
| `npm run release:verify` | **PASS**；离线静态扫描 34 文件 0 远程引用；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `python3 scripts/build-golden.py --check-only` | golden cases 155，exit 0 |

**S0 gate hash 说明：** 干净克隆的 `evidence/S0_GATE.json` status 为 PASS，但 `gate_report_sha256` 为 `ff0ab054e9ee250bccf4e6ce3600b246a825281deccf3c0bf79a34c4d076c9cd`，与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是 `environment_fingerprint`**（克隆路径不同导致；其余字段全部一致，含 `input_fixture_sha256`、`conditions` 全 true、determinism 100/1、unsupported 2/2）；按文件内注明的公式重算，克隆的自哈希与记录值逐字节一致。这不是回归（与 R4 的 `4617899b…`、R5 的 `0fdf620b…`、R6 的 `0c4703b0…`、R7 的 `b5ce164c…`、R8 的 `365ce033…` 为同一现象，不同克隆路径不同指纹）。

**探针矩阵重跑（干净克隆，仓库内 runner，全 JSON 深相等；重跑后 `results.json` 与提交版逐字节一致）：**

| 矩阵 | 结果 |
|---|---|
| fix-p0-04 | **100/100 MATCH**（前 66 行 R5 子集 **66/66 MATCH**；已标记 D2 的 2 检查现也 MATCH） |
| fix-p0-05 | **76/76 MATCH** |
| fix-p0-06 | **134/134 MATCH**（0 flagged） |
| fix-p0-07 | **86/86 MATCH**（4 个已标记 RESID 检查现已 MATCH） |
| fix-p0-08 | **164/164 MATCH**（12 个已标记 R3 检查现全部 MATCH） |
| fix-p0-09 | **92/98 MATCH**（仅 6 处已标记 R4/R5 分歧：`r4-comma-ind0`、`r5-explicit-plain-ind0`、`r5-explicit-quoted-ind0` 各 × trigger+jobs） |

**R9 独立探针（自写，`evidence/probes/r9/r9-probe.py`，26 例 ×2 模式 = 52 检查；形状自 R8 报告原文与修复方 §7 文本重建，未复制修复方 `cases.json`）：**

| 组 | 结果 |
|---|---|
| R3 10 形状（§1） | 10 例 ×2 模式 **20/20 MATCH** |
| R4 6 形状（§2） | 6 例 ×2 模式 **4/12 MATCH**（8 处 DIFF） |
| R5 7 形状（§2） | 7 例 ×2 模式 **4/14 MATCH**（10 处 DIFF） |
| 边界 3 形状（§2.5） | 3 例 ×2 模式 **6/6 MATCH** |

探针合计 710 检查（五矩阵 560 + fix-p0-09 矩阵 98 + R9 独立探针 52），DIFF 18 处（9 形状 × 2 模式，全部为 R4/R5 同一根因；其中 6 处为修复方已标记的 3 形状，12 处为本轮新增形状：嵌套 ×2、`on:` 槽位 ×2、`jobs:` `env:` ×1、单引号变体 ×1）。

## §6 试冻三哈希（干净克隆，`--trial`，两次）

两次 `npm run release:freeze -- --trial`（HEAD `a8ca5ec`）哈希完全一致，确定性成立：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `b8a4139f813598789c3211d33b82ff5caad54538b5af970b0926b14a0cff7d81`（2,029 文件） | 与修复方试冻逐字节一致 |
| dist.zip | `57dc0f8d2cbbad9fdb6b9fd45b5cc30bf19ddd587ac16147ad980a7c8b46e7b9`（114 文件） | 已变——本次改了 TS 产品代码，属预期；R2 为 `da130ad2…` |
| RELEASE_MANIFEST.json | `2dd4fe131e9c5986bf2c7918b832ffb3ea052c74c655938acce9960f16366353` | source_commit `a8ca5ec`，freeze_status TRIAL；与修复方值一致 |

`sha256sum -c` 3/3 OK。注：`a8ca5ec` 尚无正式冻结（T014 未做），故此处是“同一树两次试冻哈希一致”的确定性验证，而非与已冻结包比对。

## §7 P2 清单：终审 R2 的 6 个 + R6 的 2 个 + R9 新增 1 个 = 9 个，全部非阻断

| P2 | 复核（a8ca5ec） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。`git diff a479b87..a8ca5ec -- scripts/deterministic-zip.py` 为空，冻结脚本未动，仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§6） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。`git diff a479b87..a8ca5ec -- README.md` 为空，仍为 “P95 768.3 ms, peak RSS 98.3 MiB”，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 仍有 `NOT_TESTED`，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；全仓库 grep `USER_VALUE` 仅复核报告与终报提及，无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。试冻 manifest 的 freeze_commit 字段为 TRIAL 说明；正式冻结时 T014 报告 §9 补实际 commit（同 R2 模式） |
| **P2-R6-1：manifest 的 `inputs` 只记录 t013 复核到 R3** | 仍成立。试冻 manifest 的 `inputs` 键为 golden_suite_sha256、oracle_parity_report、s0_gate、s0_input_fixture_sha256、t013_review_r1/r2/r3——R4/R5/R6/R7/R8/R9 六轮复核均未记录。与 P2-R3-2 同类问题；T014 重冻时须把 R4–R9 一并记入，非阻断 |
| **P2-R6-2：复核探针证据未入仓库** | 部分缓解，仍成立。R7/R8 自写探针只在 `/tmp` 与报告中（VM 重启 #42 已清空 `/tmp`，只能按报告文本重建）；本轮 R9 自写探针已随本报告提交入仓库（`evidence/probes/r9/`），故“后续复核探针入仓”的要求自 R9 起已满足。非阻断 |
| **P2-R9-1（新增）：修复方终报 `expected.json` 计数写错** | 终报 §3 称 flow-quoted-key `expected.json` 为 “25 INVALID / 13 VALID”；实测 per-side 为 **27 INVALID / 11 VALID**（f01–f10 10/0、f11–f19 9/0、f20–f28 1/8、f29–f38 7/3；双边 38/38 一致）。数据本身正确（测试 1372/1372 通过，夹具锁定有效），仅终报文案计数错 2 例。非阻断；请修复方在下一轮终报中更正，或由 T014 在归档说明中注记 |

另：许可证仍为 PENDING_SAM_DECISION（`release:verify` license guard 通过，无 LICENSE 文件）。

## §8 未审查事项与报告瑕疵记录

- 未审查：`b2ab422` 终报提交本身（只含终报文本，无代码）；终报 §3 过程记录中的两处小事（注释扫描回退修正、试冻顺序错误）已由本轮重跑验证无残留影响（矩阵与试冻均与终报值逐字节一致）。
- 未审查：Drive 归档状态与终审对话（不在 T013 复核范围内）。
- 本报告瑕疵：R9 自写探针的 `r9-r3-blockkey` 形状系按 R8 表格文字（“块映射键 `"a\n  b": push`”）重建，未逐字复核 R8 原始用例原文；结论（双边 INVALID，MATCH）仅针对该重建形状。另 `r9-r4-comma-on` 的 `on: {a\n, b: push}` 为本轮自选 widening 形状，非真实事件名组合，仅用于证明分歧可达 `on:` 槽位。
- 本轮未发现其他分歧：测绘范围外的形状（如 flow 序列内缩进 0 续行）未探查，留待后续轮次。

## §9 亲自跑过的命令与结果（摘要）

全部在干净克隆 `~/workspace/p020-review-r9`（HEAD `a8ca5ec`）内运行；`npm ci` 后执行。

| # | 命令 | 结果 |
|---|---|---|
| 1 | `git clone ~/workspace/p020-checkpath ~/workspace/p020-review-r9 && git checkout a8ca5ec` | 顶为 `a8ca5ec`，工作树干净 |
| 2 | `npm run typecheck` | PASS，exit 0 |
| 3 | `npm test` | 1372/1372（42 files） |
| 4 | `npm run test:oracle` | 155 夹具，0 mismatch，0 false PASS，34/34 UNKNOWN |
| 5 | `npm run oracle:diff:trigger` / `jobs` / `checks` / `witness` | 116 / 48 / 46 / 44，全部 0 mismatch |
| 6 | `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| 7 | `npm run s0:gate` | PASS；24/24；100 次运行 1 哈希；唯一差异 environment_fingerprint |
| 8 | `npm run release:verify` | PASS |
| 9 | `python3 scripts/build-golden.py --check-only` | 155 cases，exit 0 |
| 10 | `python3 evidence/probes/fix-p0-04/run-matrix.py` | 100/100 MATCH（R5 子集 66/66） |
| 11 | `python3 evidence/probes/fix-p0-05/run-matrix.py` | 76/76 MATCH |
| 12 | `python3 evidence/probes/fix-p0-06/run-matrix.py` | 134/134 MATCH |
| 13 | `python3 evidence/probes/fix-p0-07/run-matrix.py` | 86/86 MATCH |
| 14 | `python3 evidence/probes/fix-p0-08/run-matrix.py` | 164/164 MATCH |
| 15 | `python3 evidence/probes/fix-p0-09/run-matrix.py` | 92/98 MATCH（仅 6 处已标记 R4/R5） |
| 16 | `python3 evidence/probes/r9/r9-probe.py` | 34/52 MATCH（18 处 DIFF，全部 R4/R5） |
| 17 | PyYAML `safe_load` × 3 形状 + `yaml` npm `YAML.parse` × 3 形状 | PyYAML 全接受；`yaml` 包全拒（“Flow map in block collection must be sufficiently indented”） |
| 18 | `npm run release:freeze -- --trial` × 2 | 三哈希两次一致；`sha256sum -c` 3/3 OK |
| 19 | `git diff 2920cc6..a8ca5ec --stat` / `-- oracle/` / `--diff-filter=D` | 145 文件 +5998/−273；oracle/ 0；删文件 0 |
| 20 | `expected.json` 逐项计数 | per-side 27 INVALID / 11 VALID（终报称 25/13，见 P2-R9-1） |

## §10 给 parent 的下一步

1. **定点修复 §2 的 R4/R5**（修复方向：Oracle 侧拒收规则——拒绝 flow 映射中缩进 0 的续行（逗号独占一行、显式键冒号在下一行），`_reject_adjacent_alias_colon` 同一家族；TS 侧 `parse()` 本身拒绝，AST 规则到不了门；不可换解析器，不可输入手术），然后派**新的独立复核 R10**（审查对象为修复后 HEAD；复核员一律在干净克隆里验证，不得与修复并行同一工作树；R10 须重跑本报告 §2 的 R4/R5 9 形状 + 六矩阵 + R5 66 例）。
2. R10 PASS 后：T014 正式重新冻结（manifest `inputs` 须记入 R4–R9，见 P2-R6-1）→ Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3（同一立项对话，GPT-6 + Extra High + 完整结尾句）。
3. 修复方终报的 `expected.json` 计数错误（P2-R9-1：25/13 应为 27/11）请在下一轮终报中更正。
