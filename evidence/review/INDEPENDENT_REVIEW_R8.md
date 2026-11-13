# P020 CheckPath — T013 第八轮独立复核（R8）

**Verdict: NOT PASS — P0 1 / P1 0 / P2 8**

| 项 | 内容 |
|---|---|
| 审查对象（任务指定） | 代码提交 `c157f41`（FIX-P0-08：Oracle 拒收未缩进的多行引用标量续行，修 R7 的 RESID P0；终报在 `handoff/P020-FIX-P0-08/TASK_REPORT.md`，提交 `eedb937` 只加了终报 .md，未动代码） |
| 审查开始时 HEAD | `c157f41`（`git log` 核对一致，见 §0） |
| 审查窗口 | 2026-11-09 ~05:53 GMT → ~06:06 GMT |
| 复核员 | 独立会话，与 T001–T012 施工者、FIX-P0-02/03/04/05/06/07/08 修复执行员、前七轮 T013 复核员完全隔离；只审查，不改代码 |
| 结论 | R7 的 RESID P0 全部关闭；全量电池在干净克隆中通过；试冻两次三哈希一致。但独立探针发现**新的同根分歧：反向 flow 键（R3）**——`yaml` 包接受多行引用标量作 flow 映射的键，PyYAML 全部拒绝；作额外键时 TS 判 VALID、Oracle 判 INVALID，作 `on:` 值时双边 INVALID 但错误码与 jobs 不同，按 §7.3 定 P0，故 NOT PASS |

## §0 审查对象与无污染声明（先读）

1. **审查对象确为 `c157f41`**：审查开始时工作树 `git log --oneline -1` = `eedb937`（FIX-P0-08 终报提交），其父为 `c157f41`，再上为 `a479b87`。干净克隆 `/tmp/r8clone` 的 HEAD 为 `c157f41666f65045573bc52d83223c10cebc7601`，`oracle/checkpath_oracle/parser.py` md5 `086f292afc37087e0ce20e6b1703f8c0`，与 `git show c157f41:...` 逐字节一致；`npm ci` 完成。审查期间工作树 HEAD 未移动（结束时仍为 `eedb937`）。
2. **全部验证均在干净克隆 `/tmp/r8clone` 中完成**。探针、电池、试冻一律在克隆内跑，**从未在共享工作树上运行任何探针或测试**。工作树上的操作仅为只读（`git log/diff/show`、`grep`、`read`）+ 最后写入本报告与 SUMMARY 两个交付文件。R4 的修复并行污染本轮未复现：审查开始时 FIX-P0-08 已提交，修复协调员的工作已完成。
3. **比较标准**：全 JSON 深相等（trigger 模式的整个 TriggerIR，jobs 模式的整个 job 列表），无容差、无忽略字段——R5 的标准。
4. **探针方法**：TS 侧为 `src/core/workflow-parser.ts` 的 `parseWorkflowYaml` 与 `src/core/e2e.ts` 的 `extractJobs`，经克隆内 esbuild 打包为 CJS bundle（从克隆源码重建）；Oracle 侧为仓库自带 `scripts/oracle-parse-probe.py` / `scripts/oracle-jobs-probe.py`（cwd=`/tmp/r8clone`，`--yaml` + `--fixture-id` 参数形式，与修复方矩阵一致）。修复方五矩阵直接用仓库内 `evidence/probes/fix-p0-0{4,5,6,7,8}/run-matrix.py` 在克隆内重跑；R8 独立探针（`/tmp/r8probe/r8-spot.py`，24 例 ×2 模式，用例按 R7 报告 §2 与 FIX-P0-08 终报 §7 文字自写，未抄修复方 cases.json）用同一方法跑。
5. **环境**：Node 24.22.1、Python 3.12.3、PyYAML 6.0.1——与冻结环境一致（不是 GPT 容器的 Node 22 / Python 3.13）。

## §1 R7 的 RESID P0 — 全部关闭（已验证）

R7 的 6 形状在 fix-p0-08 矩阵中全部 MATCH（trigger + jobs），R8 自写探针独立复现亦全部 MATCH（双边 INVALID / yaml_parse_error / events `[]`，jobs 双边 `[]`；IND9 双边 VALID）：

| 例 | R8 独立探针 | fix-p0-08 矩阵 |
|---|---|---|
| RESID-DQ `run: "a` / `b<TAB>c"`（缩进 0） | MATCH | MATCH |
| RESID-SQ `run: 'a` / `b<TAB>c'`（缩进 0） | MATCH | MATCH |
| RESID-DQ-NOTAB `run: "a` / `b c"`（缩进 0，无 tab） | MATCH | MATCH |
| RESID-DQ-IND2（缩进 2） | MATCH | MATCH |
| RESID-DQ-IND8（缩进 8 = `run` 键缩进） | MATCH | MATCH |
| RESID-DQ-IND9（缩进 9） | MATCH（双边 VALID） | MATCH |

fix-p0-07 矩阵的 4 个已标记 RESID 检查现已 MATCH（矩阵 86/86，见 §5）。修复方终报所述的两处过程问题均已修正、无反向分歧残留：f20/f21 标量行确为缩进 10（f20 续行缩进 0 双边拒，f21 续行缩进 9 双边接受 VALID）；`tests/fixtures/trigger/suite.json` 的 diff 仅 +96 行（12 条新增，无重排）。

## §2 新发现：Grouped P0 — 反向 flow 键分歧（R3）

### 2.1 现象

`yaml` npm 包**接受**多行引用标量作 flow 映射的键，而 PyYAML 拒绝所有多行引用键（"mapping values are not allowed here"）。两面，同一根因：

- **作额外键**（`m: {"a\n b": 1}`，续行缩进 > 块上下文）：TS **VALID**，Oracle **INVALID / yaml_parse_error**——正式管线会接受 Oracle 判为无效的文档。
- **作 `on:` 值**（`on: {"a\n b": push}`）：双边 INVALID，但错误码不同（TS `event_config_not_mapping` vs Oracle `yaml_parse_error`）、`on_key_is_string` 不同（true vs false）、jobs 不同（`[test]` vs `[]`）。

R8 自写探针（10 例 × trigger+jobs = 20 检查，全部在干净克隆中实测）：

| 例 | 输入（续行缩进） | TS | Oracle |
|---|---|---|---|
| R3-EXTRA-IND1 | `m: {"a\n b": 1}`（缩进 1） | **VALID**，events `[push]`，jobs `[test]` | **INVALID / yaml_parse_error**，events `[]`，jobs `[]` |
| R3-ON-IND1 | `on: {"a\n b": push}`（缩进 1） | **INVALID / event_config_not_mapping**，jobs `[test]` | **INVALID / yaml_parse_error**，jobs `[]` |
| R3-EXTRA-IND0 | `m: {"a\nb": 1}`（缩进 0） | INVALID | INVALID（MATCH） |
| R3-ON-IND0 | `on: {"a\nb": push}`（缩进 0） | INVALID | INVALID（MATCH） |
| R3-EXTRA-SQ | `m: {'a\n b': 1}`（缩进 1，单引号） | **VALID** | **INVALID** |
| R3-ON-SQ | `on: {'a\n b': push}`（缩进 1，单引号） | **INVALID / event_config_not_mapping** | **INVALID / yaml_parse_error** |
| R3-EXTRA-IND2 | `m: {"a\n  b": 1}`（缩进 2） | **VALID** | **INVALID** |
| R3-NESTED | `m: {n: {"a\n b": 1}}`（缩进 1，嵌套） | **VALID** | **INVALID** |
| R3-BLOCKKEY | 块映射键 `"a\n  b": push` | INVALID | INVALID（MATCH） |
| R3-ON-IND9 | `on: {"a\n         b": push}`（缩进 9） | **INVALID / event_config_not_mapping** | **INVALID / yaml_parse_error** |

合计 **14 处 DIFF / 20 检查**。修复方矩阵的 6 个已标记 R3 行（12 检查，8 处 DIFF）与本轮探针一致；本轮新增的单引号形状（EXTRA-SQ、ON-SQ）与深缩进形状（ON-IND9）同样分歧，证明 R3 的分歧面比修复方 6 行更宽：**单引号亦然、任意续行缩进 > 0 均分歧、嵌套亦然**——但仍是同一根因，不另计 P0。

### 2.2 两侧输出原文（R3-EXTRA-IND1，trigger 模式）

输入 YAML：

```yaml
m: {"a
 b": 1}
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
{"errors": [], "evaluation": {"reason": "triggered", "triggered": null, "unsupported": []}, "events": [{"branches": null, "branches_ignore": null, "name": "push", "paths": null, "paths_ignore": null, "types": null}], "fixture_id": "probe", "on_key_is_string": true, "schema": "checkpath.trigger-ir/v1", "status": "VALID"}
```

Oracle（`scripts/oracle-parse-probe.py`）：

```json
{"errors": ["yaml_parse_error"], "evaluation": {"reason": "invalid", "triggered": null, "unsupported": []}, "events": [], "fixture_id": "probe", "on_key_is_string": false, "schema": "checkpath.trigger-ir/v1", "status": "INVALID"}
```

jobs 模式：TS 返回 `[{"id": "test", "if": null, "name": null, "needs": [], "unsupported_job": null}]`，Oracle 返回 `[]`。

### 2.3 两侧输出原文（R3-ON-IND1，trigger 模式）

输入 YAML：

```yaml
name: probe
on: {"a
 b": push}
jobs:
  test:
    runs-on: ubuntu-latest
```

TS：`status INVALID`，`errors ["event_config_not_mapping"]`，`on_key_is_string true`，`events []`；Oracle：`status INVALID`，`errors ["yaml_parse_error"]`，`on_key_is_string false`，`events []`。其余 evaluation 字段逐字相同。jobs 模式：TS 返回 `[test]`，Oracle 返回 `[]`。

### 2.4 与探针驱动无关的最小复现

直接对解析器本身验证（克隆内，不经任何探针驱动）：

- PyYAML `yaml.safe_load('m: {"a\n b": 1}')`：报错 ParserError（"while parsing a flow mapping … expected ',' or '}', but got ':'"）；`yaml.safe_load('{"a\n b": 1}')` 同理报错；续行缩进 0 的 `m: {"a\nb": 1}` 亦报错。
- `yaml` npm 包 `YAML.parse` 对两全文均解析成功，键为 `"a b"`。

分歧在解析器层，与探针脚手架无关。Oracle 侧的 `_reject_underindented_multiline_quoted_scalar` 对此形状不触发是正确的——该函数只拒收多行引用**标量值**的未缩进续行；多行引用**键**在 PyYAML token 流里根本到不了标量值检查（解析器先报错）。反向亦然：TS 侧 `parse()` 接受后无规则可加之外，Oracle 无法让 PyYAML 接受——**只能 TS 侧修**（`parse()` 接受后做 AST 检查，拒收 flow 映射中的多行引用键，类似 `hasUnrepresentableKey` 的机制）。

### 2.5 已排除的相邻变体（均 MATCH，证明分歧面有明确边界）

| 例 | 结果 | 说明 |
|---|---|---|
| R3-EXTRA-IND0 / R3-ON-IND0（续行缩进 0） | MATCH（双边拒绝） | flow 集合无法跨到未缩进的行 |
| R3-BLOCKKEY（块映射键多行引用） | MATCH（双边拒绝） | 块键不受影响 |
| V3/V4（引用标量作整个值，tab 在内） | MATCH（双边接受） | 真正的引用标量值 |
| V6（tab 在引号外）/ V7（引号粘贴普通文本） | MATCH（双边拒绝） | R6 §2.5 边界仍成立 |
| V8（引用键内 tab `"a<TAB>b": 1`） | MATCH（双边 UNKNOWN） | 单行引用键 |
| X-empty-2/3/4（两个裸 `:` 键、裸 `:` + `null:`、裸 `:` + `~:`） | MATCH（双边 INVALID） | R5 §2.4 余下三例，R8 全部独立复现 |

结论：分歧仅发生在“**多行引用标量作 flow 映射的键，且续行缩进 > 块上下文缩进**”时；续行缩进为 0 或块映射键时双边均拒绝。

**修复方向（供 parent 决策，不由复核员实施）：** TS 侧 AST 规则——`parse()` 接受后检查 flow 映射的键是否为跨行引用标量，是则拒收，走既有 `yaml_parse_error` 路径（与 `hasUnrepresentableKey` 同一机制家族）；Oracle 侧无法修。不可换解析器（高风险），不可对输入文本做手术（§7.3 禁止）。

## §3 定级：P0（分组计 1 项）的依据与权衡

定级 **P0（1 项，分组计，含 §2 的 10 例 / 14 处 DIFF）**，依据：

- PROJECT_BOOK §7.3（L520）：“Oracle 与实现**任何字段不一致都判失败；不得通过忽略字段、容差或人工解释来放行**。”
- PROJECT_BOOK §8.2（L548）：“Oracle parity | 100% | 所有受支持输入完全一致。”
- IMPLEMENTATION_PLAN §8.1（L779）：“Oracle 输出规范化 JSON；差分脚本逐字段比较。**任何 mismatch 都是失败，不得增加忽略字段白名单规避问题。**”
- IMPLEMENTATION_PLAN §10（L827）：P0 阻断明确包含 “**Oracle mismatch**”。
- **终审 R2 的裁决先例**：R3 把同类分歧（`True:`/`true:`，双边 fail-closed、无 false PASS 风险、已披露）降为 P2 的理由被终审明确驳回。R3 的 `on:` 面正是同一模式（双边 INVALID），且 R3 的额外键面比 R2 P0 更严重——**Oracle 一侧为 INVALID 而 TS 一侧为 VALID**（正式管线会接受 Oracle 判为无效的文档，是 RESID 的镜像）。降为 P2 将重复 R3 被驳回的错误。

**已权衡的反方考虑（记录在案，不改变定级）：**
- (a) 该输入形状退化（真实 workflow 里几乎不会出现多行引用标量作 flow 键）。但“真实 workflow 几乎不会出现”正是 §7.3 明文禁止的“人工解释”放行理由；R2 P0 的输入（重复键）同样是无效 workflow，仍被定为 P0。且 `on:` 面处于核心输入位置（flow 式 `on:` 本身是正常 workflow 写法），不能以“键的形状退化”为由豁免整个 `on:` 槽位。
- (b) 从 YAML 规范看，PyYAML 拒绝多行引用键比 `yaml` 包的接受更接近规范字面，Oracle 一侧反而是严格方。但本项目的验收标尺不是 YAML 规范，而是 §7.3 的“Oracle 与实现完全一致”——谁更合规范不改变定级。
- (c) 修复难度（只能 TS 侧修）不影响定级：定级只看是否存在 mismatch，不看修起来难不难。
- (d) 分歧面窄（§2.5 的边界表），修复方向明确（§2 末），不是死胡同。分歧面虽比修复方 6 行更宽（单引号亦然、任意续行缩进 > 0 均分歧、嵌套亦然），仍是同一根因，分组计 1 项。

## §4 违规捷径检查：无

在工作树上对修复区间 `a479b87..c157f41`（126 文件，+6089/−154）核查：

- **测试被删：无。** `git diff --diff-filter=D --name-only a479b87..c157f41` 为空。
- **TS 产品代码改动：无。** `git diff --name-only a479b87..c157f41 -- src/` 为空；Oracle 仅 `oracle/checkpath_oracle/parser.py` 一文件（+102/−0）。
- **Oracle 比较范围被缩小：无。** `scripts/` 的 diff 只有 `build-golden.py` 的 FIX-P0-08 golden 生成块（仅新增 G-132..G-143）+ 计数注释（trigger 92→104、golden 131→143）+ `oracle-diff-trigger.mjs` / `oracle-diff.mjs` 的计数；比较函数 `deepDiff` 在 diff 中 0 命中。
- **mismatch 忽略名单：无。** `git diff` 新增行中含 ignore/allowlist/whitelist 的仅为终报文字（"no ignore list"），无任何忽略逻辑。
- **P0 被改回 P2：无。** 终审 R2 的 P0 在代码与测试中仍按阻断处理；测试 diff 均为新增（parser-divergence 21 例 + trigger 12 + golden 12 + 单元测试 22 + 计数测试）。
- **夹具真实：** trigger suite 104 条（T6-68..T6-79，source `fix-p0-08`；`suite.json` diff 仅 +96 行，无重排——修复方终报所述 indent=1 重排事故确已恢复）；golden suite 143 条（仅新增 G-132..G-143；`suite.json` diff 仅 +180 行，0 删除）；`parser-divergence/multiline-quoted-unindented/` 21 例（f01–f21）+ `expected.json`（13 INVALID / 8 VALID）+ README + 锁测试；`build-golden.py --check-only` exit 0（143 cases）。既有 131 夹具未被改写（生成逻辑与 R4/R5/R6/R7 同法核查：`build-golden.py` 的 FIX-P0-08 块只新增 G-132..G-143）。

## §5 全量重跑（干净克隆 `/tmp/r8clone`，HEAD c157f41，全部亲自跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，无输出错误） |
| `npm test` | **1285/1285 通过**（41 test files） |
| `npm run test:oracle` | 143/143，0 偏差，0 false PASS；`ORACLE_PARITY_REPORT.json`: fixture_count 143, passed 143, failed 0, oracle_mismatch_count 0；unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 104 夹具，0 mismatch |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch |
| `npm run s0:oracle` | 0 false PASS；unsupported 2/2 UNKNOWN |
| `npm run s0:gate` | **PASS**；determinism 100 次运行 1 个唯一哈希；network matches 0；gate hash 见下 |
| `npm run release:verify` | **PASS**；离线静态扫描 34 文件 0 远程引用；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `python3 scripts/build-golden.py --check-only` | golden cases 143，exit 0 |

（以上电池在干净克隆内一次链式跑完，输出存 `/tmp/r8probe/battery.log`。）

**S0 gate hash 说明：** 干净克隆的 `S0_GATE.json` status 为 PASS，但 `gate_report_sha256` 为 `365ce033a3c785f8a00a1b30f11e91bdf084dfc5d81d6b385fac28e8be43fc3f`，与提交版 `f511a847…` 不同。逐字段 diff 证明**唯一差异是 `environment_fingerprint`**（克隆路径不同导致；其余字段全部一致，含 `input_fixture_sha256`、`conditions` 全 true、determinism 100/1、unsupported 2/2）；按文件内注明的公式（去掉 `gate_report_sha256` 字段后 canonical JSON 的 SHA-256）重算，HEAD 与克隆的自哈希均与记录值逐字节一致。这不是回归（与 R4 的 `4617899b…`、R5 的 `0fdf620b…`、R6 的 `0c4703b0…`、R7 的 `b5ce164c…` 为同一现象，不同克隆路径不同指纹）。

**探针矩阵重跑（干净克隆，仓库内 runner，全 JSON 深相等）：**

| 矩阵 | 结果 |
|---|---|
| fix-p0-04 | **100/100 MATCH**（前 66 行 R5 子集 **66/66 MATCH**；已标记 D2 的 2 检查现也 MATCH） |
| fix-p0-05 | **76/76 MATCH** |
| fix-p0-06 | **134/134 MATCH**（0 flagged） |
| fix-p0-07 | **86/86 MATCH**（4 个已标记 RESID 检查现已 MATCH） |
| fix-p0-08 | **156/164 MATCH**（仅 8 个已标记 R3 检查不同：flowkey-ind1/ind2 × on/nested × trigger/jobs；未标记 152/152 MATCH） |

**R8 独立探针（自写，`/tmp/r8probe/r8-spot.py`，24 例 ×2 模式 = 48 检查）：**

| 组 | 结果 |
|---|---|
| RESID 6 形状（§2 前表） | 6 例 ×2 模式 **12/12 MATCH** |
| R3 10 形状（§2） | 10 例 ×2 模式 **6/20 MATCH**（14 处 DIFF） |
| R6 边界（V3/V4/V6/V7/V8、X-empty-2/3/4） | 8 例 ×2 模式 **16/16 MATCH** |

探针合计 608 检查（五矩阵 560 + R8 独立探针 48），DIFF 22 处（fix-p0-08 矩阵 8 处 R3 + R8 独立探针 14 处 R3，同一根因两次独立复现；其中 6 处为本轮新增形状：单引号键 ×2 模式 ×2 面 + ON-IND9 ×2 模式）。

## §6 试冻三哈希（干净克隆，`--trial`，两次）

两次 `npm run release:freeze -- --trial`（HEAD c157f41）哈希完全一致，确定性成立：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `64e950c3c14db028cac49b16723dd20c55baf137503117f1bf56c1acb8c82dea`（1,896 文件） | 与修复方试冻逐字节一致 |
| dist.zip | `c391ad648d56db7c91e5a49fdae0fb2cae1972c2a771f1d2f83ba643249cf024`（114 文件） | 与 FIX-P0-07 试冻**逐字节一致**——Oracle-only 改动，TS 未动，属预期 |
| RELEASE_MANIFEST.json | `5d2c158c999fbe0ca32b2e306acf753a614113901c5b5cde654fbadbbdec60db` | source_commit `c157f41`，freeze_status TRIAL；与修复方值一致 |

`sha256sum -c` 3/3 OK。source.zip 含冻结脚本（zip 内 1 条目；脚本 SHA `5c3142ec…`，与工作树文件及 R2 记录的三方一致，冻结脚本未动）。注：c157f41 尚无正式冻结（T014 未做），故此处是“同一树两次试冻哈希一致”的确定性验证，而非与已冻结包比对。

## §7 终审 R2 的 6 个 P2 + R6 新增的 2 个 P2：全部仍成立

| P2 | 复核（c157f41） |
|---|---|
| P2-R3-3：无 `.git` 裸解压目录下 `release:freeze` 失败 | 仍成立。`git diff a479b87..c157f41 -- scripts/deterministic-zip.py` 为空，冻结脚本未动，仍从 HEAD 读树，属设计限制；新鲜克隆试冻已通过（§6） |
| P2-R2-3：README 性能数为单次快照 | 仍成立。`git diff a479b87..c157f41 -- README.md` 为空，仍为 “P95 768.3 ms, peak RSS 98.3 MiB”，远低于阈值（P95 ≤1000 ms） |
| Windows PowerShell Quick Start NOT_TESTED | 仍成立。README 仍有 `NOT_TESTED`，未伪称通过 |
| USER_VALUE 无真人实验数据 | 仍成立。零真人约束下无人类数据；全仓库 grep `USER_VALUE` 仅复核报告与终报提及，无任何相反声称 |
| source.zip 含上一代冻结产物及旧版 Release Notes（一代滞后） | 仍成立（指 R2 冻结包内含物；以 01_release_R2 的正式哈希为准） |
| manifest 的 freeze_commit 字段仍为 PENDING | 仍成立（设计使然）。试冻 manifest 的 freeze_commit 字段为 TRIAL 说明；正式冻结时 T014 报告 §9 补实际 commit（同 R2 模式） |
| **P2-R6-1：manifest 的 `inputs` 只记录 t013 复核到 R3** | 仍成立。试冻 manifest 的 `inputs` 键为 golden_suite_sha256、oracle_parity_report、s0_gate、s0_input_fixture_sha256、t013_review_r1/r2/r3——R4/R5/R6/R7/R8 五轮复核均未记录。与 P2-R3-2 同类问题；T014 重冻时须把 R4、R5、R6、R7、R8 一并记入，非阻断 |
| **P2-R6-2：复核探针证据未入仓库** | 仍成立。R7 自写探针只在 `/tmp/r7probe/` 与 R7 报告中（VM 重启即清）；本轮 R8 自写探针亦只在 `/tmp/r8probe/`（`r8-spot.py`、`r8-spot-results.json`、`r8-spot.log`、本报告 §2/§5 的全文表格）与本报告中，VM 重启即清。修复方五矩阵的证据已入仓库（P2-R6-2 对修复矩阵仍为已关闭）。缓解：本报告给出全部 24 例输入原文与结果，可按文重建；建议后续把复核探针 case 文件纳入仓库（或随复核报告归档 Drive）。非阻断 |

另：许可证仍为 PENDING_SAM_DECISION（`release:verify` license guard 通过，无 LICENSE 文件）。

## §8 未审查事项与报告瑕疵记录

- T014 正式冻结未做（不在本任务内）；终审 R3 未发；Drive 未动。
- R7 报告时间记录出入：R7 §0 称审查窗口为 ~04:43 → ~05:20 GMT，但其协调员完成交接时间为 2026-11-09T04:56:28Z——结束时间晚于实际完成交接，属报告瑕疵，不影响定级（R7 的矩阵与电池均在干净克隆中独立重跑验证，本轮亦复核了其结论）。
- R5 报告计数出入（R6 §1.2、R7 §8 已记）：R5 §2 称“残留探针 10”，但 §2.1–2.3 的 3 例 + §2.4 的 10 例合计 13 例。R8 独立复现了 §2.4 的 X-empty-2/3/4 三例（见 §2.5 表），**全部 MATCH**：该计数出入确为报告瑕疵，不影响定级。
- 本轮 R8 探针中 R8-V8 的构造与 R6 的 V8 文字描述（“引用键内 tab”）一致但输入细节为 R8 自写（`"a<TAB>b": 1` 作顶层键），不等同于 R6 的原始用例原文；结论（双边 UNKNOWN、MATCH）仅针对该自写形状。

## §9 亲自跑过的命令与结果（摘要）

- `git log` / `git status`（审查开始）：工作树 HEAD `eedb937`，其父 `c157f41`；工作树仅有未跟踪的 `reports/`（预先存在）。
- 干净克隆：`git clone ~/workspace/p020-checkpath /tmp/r8clone`，checkout `c157f41`；parser.py md5 `086f292a…` 与 `git show c157f41:` 一致；`npm ci`（Node 24.22.1 / Python 3.12.3 / PyYAML 6.0.1）。
- 全量电池（§5）+ 试冻两次（§6）+ S0_GATE.json 逐字段 diff 与自哈希重算（§5 末）。
- 五矩阵重跑（§5 末）+ R8 独立探针（`/tmp/r8probe/r8-spot.py`，48 检查；结果存 `/tmp/r8probe/r8-spot-results.json`）。
- 最小复现：PyYAML `safe_load` 对三 flow 键形状均报 ParserError；`yaml` npm 包对续行缩进 > 0 的两形状解析成功、对缩进 0 形状报错 `Missing closing "quote`。
- `git diff a479b87..c157f41` 全量核查（§4）：无删除文件；`src/` 0 改动；`oracle/` 仅 parser.py（+102/−0）；`deepDiff` 0 命中；ignore/allowlist 除终报文字外 0 命中；suite 计数 trigger 104 / golden 143。
- 规格原文核对：`~/workspace/P020_PROJECT_BOOK.md` §7.3（L520）、§8.2（L548）；`~/workspace/P020_IMPLEMENTATION_PLAN.md` §8.1（L779）、§10（L827）。

## §10 给 parent 的下一步

1. **不要**就 c157f41 发终审 R3（必 FAIL：终审若复现 §2 任一例，将得到与 R2 P0 相同的裁决模式，且本例额外键面 Oracle 一侧为 INVALID 而 TS 接受——正式管线会接受 Oracle 判为无效的 workflow）。
2. 定点修复 §2 的 R3（修复方向见 §2 末；TS 侧 AST 规则，拒收 flow 映射中的多行引用键，与 `hasUnrepresentableKey` 同一机制家族；Oracle 侧无法修；不可换解析器，不可输入手术），然后派**新的独立复核 R9**（审查对象为修复后 HEAD；复核员一律在干净克隆里验证，不得与修复并行同一工作树；R9 须重跑本报告 §2 的 R3 10 形状 + 五矩阵 + R5 66 例）。
3. R9 PASS 后：T014 正式重新冻结（manifest `inputs` 须记入 R4/R5/R6/R7/R8/R9，见 P2-R6-1）→ Drive 重新归档（新 01_release_R3 文件夹，保留 R2）→ 终审 R3（同一立项对话，GPT-6 + Extra High + 完整结尾句）。
4. R9 若 NOT PASS：按其报告修残留分歧，再开 R10 复核；PASS 前绝不标记 ACCEPTED、绝不启动 P021。
5. 建议：把复核探针 case 文件纳入仓库或随复核报告归档（P2-R6-2），避免 /tmp 清失后只能按报告文本重建。
