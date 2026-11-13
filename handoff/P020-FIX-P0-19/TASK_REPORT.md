# FIX-P0-19 任务报告（T013 R18 唯一新 P0 家族）

- **修复对象**：T013 R18 的 1 个新 P0 家族——流式映射中空值别名键解析为重复标量键（8 形，16 检查；各套探针合计 20 处 DIFF）。证据提交 `e2c418f`（`evidence/review/INDEPENDENT_REVIEW_R18.md` + `evidence/probes/r18/`）。
- **代码提交**：`9dac3e1`（`src/` + 测试 + 探针证据；树干净）。
- **结论**：R18 家族已关闭——R18 狩猎探针 50/50、裁决探针 22/22、裁决 2 探针 10/10、fix-p0-18 网格 79/79（原 77/79）、fix-p0-19 网格 70/70；全部验收电池通过；试冻两次 manifest 一致（trial 模式，见 §6）。**本轮探针空间内无新发现的分歧（见 §7）。**

## §0 任务

R18 = NOT PASS（P0 1 / P1 0 / P2 8）。R17 的 1 个新 P0 家族已独立验证关闭（R17 探针 141/141）。唯一新 P0 家族（R18 §2）：流式映射中，空值别名键（`*w` / `*w:2` 后无显式值）解析出的标量与同一映射中另一键重复——Oracle 拒收（`yaml_parse_error`），TS 接受。该家族预先存在（R18 在 `50788a7` 上重跑三套探针，DIFF 集逐字相同），但按 §7.3/§8.2/§10 与 R13 §2.4(c) 先例，预先存在不降级，仍为 P0。修复在 TS 侧（R18 §2.5）；Oracle 侧的拒收符合规范，绝不放宽。

## §1 根因

- **分歧在重复键检查的别名解析时机**。Oracle 的 `_StrictBaseLoader.construct_mapping`（FIX-P0-02）在 compose 阶段把别名解析为所锚定的标量：`m: {a: 1, *w}` 组合后出现两个 `ScalarNode('a')` 键，拒收 `duplicate mapping key: 'a'`（解析器层实测，见 §3）。
- TS 的 `yaml` 2.9.1 包 `uniqueKeys` 检查**不对别名键做解析**：`node_modules/yaml/dist/compose/util-map-includes.js` 的相等判定是 `a === b || (isScalar(a) && isScalar(b) && a.value === b.value)`——Alias 节点永不 `===` 于 Scalar，且 `isScalar(alias)` 为假，所以别名键对它不可见：`m: {a: 1, *w}` 解析 0 错误，静默接受（后出现的空值甚至覆盖前值，解析得 `{"a": null}`）。
- **空值与有值的不对称是判别式**：有值别名键（`m: {*w: 1, a: 1}`）双边 INVALID——TS 侧 `yaml` 包在 `*w: 1` 处直接报解析错误（`Missing , or : between flow map items`，别名后冒号歧义），Oracle 侧同样拒收（compose 后重复键），双方以不同理由同拒。空值别名键则只在 Oracle 侧触发重复键检查，TS 侧畅通。块映射中的别名键双边 INVALID（`parse()` 本身拒收，见 §3），故残留**仅限流式**。
- 与 R17 家族不同机制（R17 是位置规则漏了 `AliasToken`；本家族是重复键检查的别名解析时机），不同修复位置（R17 在 Oracle 解析器；本家族在 TS 侧）。

## §2 修复

本次改动在 TS 侧（`src/core/workflow-parser.ts` + `src/core/e2e.ts`），Oracle 侧 0 改动。

**新检查 `hasDuplicateAliasKey(yamlText)`**（接在 `hasMultilineFlowKey` 之后，按既有形状检查模式）：对文档中每一个映射（流式与块式统一遍历——块式别名键已被 `parse()` 拒收，规则在那里是 no-op），取每对键的**有效键**：标量键即自身；别名键为 `Alias.resolve(doc)` 解析出的 Scalar（解析失败/解析为集合/未定义时忽略，见下）；两有效键按 `yaml` 包自身的相等判定（同一节点，或两 Scalar 且 `value === value`）碰撞、且碰撞双方至少一方的键是别名时，整文档判 `yaml_parse_error`。`NaN !== NaN` 自然成立（与 Oracle 的 `("nan", object())` 新鲜身份一致）。

- **只补别名缺口，不做第二重复键检查**：纯标量键之间的重复仍是 `parse()` 的 `uniqueKeys` 的职责；本规则的契约就是填补别名缺口。
- **相等判定与 Oracle 的 `_duplicate_key_canonical` 折叠一致**（均已逐一探针验证，见 §3）： plain `1` vs `01`、`True` vs `true`、`~` vs `null`、quoted `'a'` vs plain `a` 碰撞；`1` vs `'1'`、`True` vs `1`、`!!str 1` vs `1` 不碰撞；`.nan` vs `.nan` 永不碰撞。
- **接线两处**：`parseWorkflowYaml` 的拒收链（trigger 模式）与 `extractJobs` 的拒收链（jobs 模式，返回 `[]`）——后者是独立的链，漏接会导致 jobs 模式 DIFF，本轮已同步（见 §5：网格两模式 70/70）。

## §3 控制形验证（R18 §2.5 + 规范折叠，逐一亲自运行，全部为控制形）

解析器层探针（`evidence/probes/fix-p0-19/parser-probe-p19.py` / `.mjs` / `parser-probe-p19b.mjs`，输出 `.txt` / 报告内）：

| 形状 | PyYAML `_StrictBaseLoader` | `yaml` 2.9.1 | 修复后端到端 |
|---|---|---|---|
| 8 个家族形（F1–F8） | 全部 LOAD-ERROR `duplicate mapping key: 'a'` | 全部 0 错误，接受 | 全部双边 INVALID |
| 有值别名键 `{*w: 1, a: 1}`、`{*w: 1, *w: 2}` | LOAD-ERROR duplicate | parse() THROW（冒号歧义） | 双边 INVALID，未变 |
| 块映射别名键（有值/空值，`*w` / `*w:2`） | SCAN-ERROR / duplicate | parse() THROW（implicit map keys…） | 双边 INVALID，未变 |
| `{b: 2, *w}`（别名键解析为不同标量） | LOAD-OK | 0 错误 | 双边 VALID，未变 |
| `{*w}`（别名单独作键） | LOAD-OK | 0 错误 | 双边 VALID，未变 |
| `b: *w`（别名作值） | LOAD-OK | 0 错误 | 双边 VALID，未变 |
| `{a: 1, a: 2}`（纯标量重复键） | LOAD-ERROR duplicate | parse() THROW `Map keys must be unique` | 双边 INVALID，未变 |
| int 锚 `&w 1` + `{1: y, *w}` | LOAD-ERROR duplicate `'1'` | Scalar(1) vs Alias→Scalar(1) | 双边 INVALID |
| int 锚 + `{'1': y, *w}` | LOAD-OK（num vs str） | Scalar("1") vs Alias→Scalar(1)，`!==` | 双边 VALID，未变 |
| bool 锚 `&w True` + `{true: y, *w}` | LOAD-ERROR duplicate `'True'` | Scalar(true) vs Alias→Scalar(true) | 双边 INVALID |
| bool 锚 + `{1: y, *w}` | LOAD-OK | Scalar(1) vs Alias→Scalar(true) | 双边 VALID，未变 |
| null 锚 `&w ~` + `{null: y, *w}` | LOAD-ERROR duplicate `'~'` | Scalar(null) vs Alias→Scalar(null) | 双边 INVALID |
| quoted 锚 `&w 'a'` + `{a: y, *w}` | LOAD-ERROR duplicate `'a'` | Scalar("a") vs Alias→Scalar("a") | 双边 INVALID |
| tagged 锚 `&w !!str 1` + `{1: y, *w}` | LOAD-OK（str vs num） | Scalar(1) vs Alias→Scalar("1")，`!==` | 双边 VALID，未变 |
| NaN 锚 `&w .nan` + `{.nan: y, *w}` | LOAD-OK | 两边皆 number NaN，`NaN === NaN` 为 false | 双边 VALID，未变 |
| 前向引用 `m: {*w, a: 1}`（锚在后定义） | LOAD-ERROR `found undefined alias` | parse() THROW `Unresolved alias` | 双边 INVALID，未变（规则不触发：resolve 得 undefined） |
| 别名指向集合 `x: &a {b: c}` + `m: {a: 1, *a}` | LOAD-ERROR（unhashable key） | resolve 得 Map；N5 规则拥有 | 双边 INVALID，未变（规则不触发） |
| 链式别名 `&b *a` + `m: {foo: 1, *b}` | LOAD-ERROR | parse() THROW（alias node must not specify properties） | 双边 INVALID，未变（resolve 得 Alias，非 Scalar） |

注：`.nan` 形在 `.mjs` 探针打印中显示为 `Scalar(null)`——那是 `JSON.stringify(NaN) === "null"` 的假象；已另行实测确认两边的值都是 number NaN（`typeof number`，`Number.isNaN` 为 true），故 `===` 比较为 false，与 Oracle 的 LOAD-OK 一致。另：`parser-probe-p19.mjs` 初版的 B11–B18/B21/B25 形状有设计缺陷（锚定义写在裸行首，被解析器读作多行键）——已用 `parser-probe-p19b.mjs` 的修正形重测，本报告上表用修正版结论；初版缺陷记录在此，不作为依据。

## §4 映射完整性

R18 §2 的 8 形全部在网格 A 组内逐一映射（标量键在前/在后、别名键两次、嵌套流、吸入/三冒号别名、行尾注释）；R18 §2.5 的边界全部在 B 组内（有值别名键、块映射别名键、纯标量重复键、别名单独作键、别名键后接不同标量键、别名作值、块映射残留形）；C 组新探查：规范折叠 8 形（int/bool/null/quoted/tagged/NaN）、别名键两次隔对、流内序列、流式 `on:` 映射（`{*w, push: {}}`）、同一流映射内定义锚、深嵌套、两锚同值、流式 `jobs:` 映射（`{check: {...}, *w}`）、前向引用、别名指向集合、链式别名。网格共 35 形 70 检查，**70/70 MATCH**。

## §5 验收（全部在代码提交 `9dac3e1` 上亲自重跑）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **PASS**（`tsc --noEmit`，exit 0） |
| `npm test` | **1697/1697 通过**（53 test files；基线 1661 + 新增 36：35 夹具 + 1 schema 断言） |
| `npm run test:oracle` | 167/167，0 偏差，0 false PASS；unsupported 34/34 UNKNOWN |
| `npm run oracle:diff:trigger` | 128 夹具，0 mismatch |
| `npm run oracle:diff:jobs` | 48 夹具，0 mismatch |
| `npm run oracle:diff:checks` | 46 夹具，0 mismatch |
| `npm run oracle:diff:witness` | 44 夹具，0 mismatch |
| `npm run s0:oracle` | 0 mismatch，0 false PASS，2/2 UNKNOWN |
| `python3 scripts/build-golden.py --check-only` | golden cases 167，exit 0 |
| `npm run s0:gate` | **PASS**；oracle 24/24；100 次运行 1 个唯一哈希；gate hash `f511a847…` **不变** |
| `npm run release:verify` | **PASS**；license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍 PENDING_SAM_DECISION |
| `npx eslint src/core/workflow-parser.ts src/core/e2e.ts tests/unit/diff-boundaries/duplicate-alias-key-p0-19.test.ts` | exit 0，无告警 |

**探针重跑（代码提交 HEAD，见 `evidence/probes/fix-p0-19/acceptance-log.txt`）：**

| 矩阵 / 探针 | 结果 |
|---|---|
| fix-p0-04 | **100/100 MATCH**（前 66 行 R5 子集 **66/66 MATCH**） |
| fix-p0-05 | **76/76 MATCH** |
| fix-p0-06 | **134/134 MATCH** |
| fix-p0-07 | **86/86 MATCH** |
| fix-p0-08 | **164/164 MATCH** |
| fix-p0-09 | **98/98 MATCH** |
| fix-p0-10 | **314/314 MATCH** |
| fix-p0-11 | **248/248 MATCH**（0 flagged） |
| fix-p0-12 | **486/486 MATCH**（0 flagged） |
| fix-p0-13 | **196/196 MATCH**（0 flagged） |
| fix-p0-14 | **114/114 MATCH**（0 flagged） |
| fix-p0-15 | **260/260 MATCH**（0 flagged） |
| R10 探针 | **88/88 MATCH** |
| R11 探针 | **74/74 MATCH** |
| R12 探针 | **118/118 MATCH** |
| R13 探针 | **98/98 MATCH** |
| R14 探针 | **78/78 MATCH**（11 个 stale 行，属预期；见下注） |
| R15 探针 | **122/122 MATCH**（24 处 FLAG STALE，属预期；见下注） |
| R16 探针 | **362/362 MATCH** |
| R17 探针 | **141/141 MATCH** |
| R18 狩猎探针 | **50/50 MATCH**（原 44/50；6 处 DIFF 现为 0） |
| R18 裁决探针 | **22/22 MATCH**（原 12/22；10 处 DIFF 现为 0） |
| R18 裁决 2 探针 | **10/10 MATCH**（原 8/10；2 处 DIFF 现为 0） |
| fix-p0-16 网格 | **238/238 MATCH**（119 形） |
| fix-p0-17 网格 | **216/216 MATCH**（108 形） |
| fix-p0-18 网格 | **79/79 MATCH**（原 77/79；唯二 DIFF `c-flow-key-null-2nd` ×2 现为 0） |
| fix-p0-19 网格 | **70/70 MATCH**（35 形；A 组 16/16、B 组 18/18、C 组 36/36） |

注：R14/R15 探针脚本在 stale-flag 行存在时以 exit 1 退出（预期行为，与 R17/R18 复核一致：R14 11 个、R15 13 个 stale 行均为已闭合家族的残留预期行；探针本身的 MATCH 计数 78/78 与 122/122 不变）。重跑时 `evidence/probes/r17/`、`r18/`、`fix-p0-18/` 的 `results.json` 被覆写为新值——已按 FIX-P0-18 的先例恢复为提交版原值（R17 124/141、R18 44/50、fix-p0-18 77/79 的历史记录不改写）；重跑后的完整结果副本保存在 `evidence/probes/fix-p0-19/` 内（`r17-results-p19.json`、`r18-results-p19.json`、`r18-adjudication-results-p19.json`、`r18-adjudication2-results-p19.json`、`fix-p0-18-results-p19.json`、`grid-rerun-p0-16.json`）。

**新增测试**：35 个夹具（28 INVALID / 7 VALID，双边逐字段锁定）+ 1 个 test 文件（`tests/unit/diff-boundaries/duplicate-alias-key-p0-19.test.ts`，trigger + jobs 双模式）；`npm test` 1661 → 1697。新增夹具目录 `tests/fixtures/parser-divergence/duplicate-alias-key-p0-19/`（35 `.yml` + `expected.json`）。

## §6 Trial freeze（两次，方法与结果）

两次均为 **`npm run release:freeze -- --trial`**（FIX-P0-18 的教训：修复方未加 `--trial` 却称 trial，得到的是 formal 值；本轮两次均加 `--trial`，并以本人两次冻结的 stdout 为准）。两次结果**完全一致**：

| 产物 | 哈希 | 说明 |
|---|---|---|
| source.zip | `3c059bc351b5204f90ae6ea521a4941c2a0d02c2a140b612304912af8731be91`（2,693 文件） | 与 R18 的 `1b527601…`（2,597 文件）相比已变（`src/` 改动 + 新 evidence/fixtures，属预期） |
| dist.zip | `b8e2aa77074cd2f62a518c1c7969cfdaa7cff202c6d87239080c3dfe2c6d335c`（114 文件） | **已变**（原 `f2bcd53f…`）——预期：`src/` 改动后重新打包，dist 是纯 TS 发行物 |
| RELEASE_MANIFEST.json | `89ff8504cc24aeb467bc2a4a714cd5b46a39311d68f90feb2c9079e3bcffecf6` | **trial 模式**产物：`freeze_status` 为 `TRIAL — FIX-P1-02 trial-freeze validation only`，`freeze_commit` 为 TRIAL 文案；不是 formal 值 |

`sha256sum -c SHA256SUMS.txt` 3/3 OK（试冻产物上验证）。试冻后已 `git checkout release/`，`release/` 恢复为 HEAD 正式件（source.zip `3a778b93…`、dist.zip `da130ad2…`，已核对）。另：`release:verify` 在验证中重建了 `dist/`（build determinism 步骤），`evidence/tests/RELEASE_VERIFY_REPORT.json` 的 dist tree sha 由 `5a4f3337…` 变为 `8f4636de…`——已在提交前 `git checkout` 恢复，改动不入代码提交；新 dist tree sha 记录在此。

**模式说明（供 R19 复核）**：本轮 manifest `89ff8504…` 是 **trial** 值；若跑 formal 冻结会得到另一 manifest 值（仅 `freeze_commit` / `freeze_status` 两字段文案不同，见 R18 §6 的复现方法）。T014 正式重冻时会重新生成；manifest 的 `inputs` 仍只记录到 R3（P2-R6-1，T014 范围）。

## §7 诚实披露：本轮探针空间内无新发现的分歧

- fix-p0-19 网格 70/70、R18 三套探针 50/50 + 22/22 + 10/10、十二矩阵与 R10–R17 探针、fix-p0-16/17/18 网格**全部 MATCH，0 DIFF**——本轮探针空间（35 个新形 + 全部历史矩阵与探针重跑）内**无新发现的分歧**。
- 探针初版缺陷（见 §3 注）：`parser-probe-p19.mjs` 的 B11–B18/B21/B25 形状设计有误（锚定义写在裸行首），已用修正版 `parser-probe-p19b.mjs` 重测并以修正版为准；初版文件保留在证据目录内，缺陷记录在此。
- R14/R15 探针的 stale-flag 行（见 §5 注）是已闭合家族的残留预期行，非新分歧；清理属 T014 范围。
- dist.zip 变化是预期的（`src/` 改动），不是回归；s0 gate 哈希不变，`src/` 改动未触及 S0 语义。

## §8 P2 状态（8 项，与 R18 相同）

R18 的 8 个 P2 全部仍成立，无新增、无清除；P2-R6-1 范围扩大到 R19（manifest `inputs` 仍只记录到 R3，T014 重冻时须把 R4–R19 一并记入）。

## 附录：提交与文件

- 代码提交：`9dac3e1` — `FIX-P0-19: reject flow-mapping alias keys resolving to duplicate scalars (R18 P0 family; R18 probe 50/50, adjudication 22/22 + 10/10)`。改动：`src/core/workflow-parser.ts`（+127/−1：新检查 `hasDuplicateAliasKey` + 拒收链）、`src/core/e2e.ts`（+7/−2：import + jobs 链）；`oracle/` 0 改动；`scripts/`、`release/` 0 改动；删测试 0；无 `skip`/`only`。
- 本报告提交：见 `git log`（报告文本单独提交，不含代码）。
- 证据：`evidence/probes/fix-p0-19/`（解析器层探针 ×3 + 网格 cases/results + acceptance-log + 重跑副本）；夹具：`tests/fixtures/parser-divergence/duplicate-alias-key-p0-19/`（35 `.yml` + `expected.json`）；测试：`tests/unit/diff-boundaries/duplicate-alias-key-p0-19.test.ts`。
