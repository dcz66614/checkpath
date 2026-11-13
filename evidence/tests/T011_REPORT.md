# T011 — Full Golden / Mutation / Property / Oracle Regression Report

**Task:** T011 (S4) — 完整 Golden、变异、属性与 Oracle 差分测试
**Base commit:** `69ce5ca` (T010 PASS, 工作树 clean)
**Date:** 2026-11-08
**Result:** **PASS** — 全部验收命令 exit 0；Golden 80/80，属性 1,000/1,000 零 mismatch，false PASS = 0，S0 Gate 仍为 PASS。
**Zero humans. No network, no GitHub API, no token. Synthetic data only.**
**License:** `PENDING_SAM_DECISION`（LICENSE_STATUS.md 未动；本次新增文件均不含任何许可证名称）。

---

## 1. 验收命令逐项结果（亲自跑，日志见 handoff/P020-T011/test_logs/）

| 命令 | 结果 | 证据 |
|---|---|---|
| `npm run test` | exit 0 — **673/673**（29 文件） | `test_logs/npm-test.log` |
| `npm run test:property -- --seed 20261108 --count 1000` | exit 0 — 1,000 例，0 mismatch，false PASS 0，再生一致 | `test_logs/test-property.log`，`evidence/tests/PROPERTY_REPORT.json` |
| `npm run test:property`（默认参数） | exit 0 — 同上，suite 哈希 `373c60b1…` 与显式参数运行一致 | 同上 |
| `npm run test:oracle` | exit 0 — Golden 80 例，TS==expected，Oracle==expected，**0 mismatch**，false PASS 0，unsupported 19/19 UNKNOWN | `test_logs/test-oracle.log`，`evidence/tests/ORACLE_PARITY_REPORT.json` |
| `npm run test:mutation` | exit 0 — **13/13**（12 变异 + 计数）；Oracle 交叉验证 24/24 sides 一致 | `test_logs/test-mutation.log`，`scripts/verify-mutations.py` |
| `npm run typecheck` | exit 0 | `test_logs/typecheck.log` |
| `npm run lint` | exit 0 | `test_logs/lint.log` |
| `npm run oracle:diff:trigger` | exit 0 — **41 例**，0 mismatch | `test_logs/oracle-diff-trigger.log` |
| `npm run oracle:diff:jobs` | exit 0 — 48 例，0 mismatch | `test_logs/oracle-diff-jobs.log` |
| `npm run oracle:diff:checks` | exit 0 — 46 例，0 mismatch | `test_logs/oracle-diff-checks.log` |
| `npm run oracle:diff:witness` | exit 0 — 44 例，0 mismatch | `test_logs/oracle-diff-witness.log` |
| `npm run s0:oracle` | exit 0 — 24/24，0 mismatch，false PASS 0 | `test_logs/s0-oracle.log` |
| `npm run s0:gate` | exit 0 — **S0_GATE.json status PASS**（见 §7） | `test_logs/s0-gate.log` |

补充验证（非计划命令，但为本次改动所必需）：
- `python3 scripts/build-golden.py --check-only` — exit 0，golden 套件可由生成器字节级复现。
- `python3 scripts/verify-mutations.py` — 24/24 mutation sides 与 expected.json 一致（Oracle 侧）。
- `python3 scripts/build-golden.py` 覆盖统计见 §3。

---

## 2. ADR 决策记录（本次必须解决的三项 + 新发现一项）

### ADR T011/T008-U01 — 空值事件 `on: { pull_request: }`：Oracle 侧修复为 VALID（CLOSED）

- **分歧：** workflow 写 `pull_request:`（空值、无子键）时，TS（`yaml` 包 → null → 无过滤器 → VALID）与 Oracle（BaseLoader → `''` → `event_config_not_mapping` → INVALID）判定不同；首轮 checks 差分曾因此出现 7 个 mismatch。
- **决策：按 GitHub 语义，空值事件是合法写法（表示“该事件无过滤器”），Oracle 侧把 `''` 视同无配置（与 None 同等处理）。** 证据：GitHub workflow 语法允许 `on: { pull_request: }` 这种空映射/空值写法表示无过滤器；TS 侧行为与之一致；`{}` 空映射写法两边早已一致为 VALID，`''` 与 `{}` 不应有不同判定。未采纳反向冻结（判 INVALID）：那会与 GitHub 语义冲突，且需同步改 TS 解析器、改动面更大而无语义收益。
- **落地（`oracle/checkpath_oracle/parser.py` `parse_workflow_yaml`）：** 仅当 config 全等于 `''` 时折叠为 None；其他非映射值（如非空字符串）仍判 `event_config_not_mapping` / INVALID。TS 解析器无需改动（已把空值当 null 处理）。
- **夹具：** 新增 trigger 层正例 `tests/fixtures/trigger/T6-16-empty-event-value/`（`pull_request:` 空值 + PR 场景），trigger 套件 40→**41** 例；并入 golden G-40。重跑 trigger/jobs/checks 三路差分：41/48/46，全部 0 mismatch。
- **验证：** 探针 `parse_workflow_yaml` 对空值 workflow 返回 VALID、errors []；e2e 为 ELIGIBLE / REPORTABLE_PENDING（见 §3 抽查）。
- **状态：CLOSED。** 前序未决项文件（T008-U01、T010-U06）同步关闭，见 handoff 未决项文件。

### ADR T011/T009-U01 — WITNESS_KINDS 增专用 kind `event_trigger_missing`（CLOSED）

- **缺口：** 冻结枚举只有 `merge_group_missing`；非 merge_group 的 `event_mismatch` / `activity_type_mismatch`（如 pull_request types 不匹配）暂归入该桶，标签不精确（`first_blocking_condition` / note / 建议中事件与 action 均如实写明，只有 kind 本身不精确）。
- **决策：增一个专用 kind，命名 `event_trigger_missing`**（与 PROJECT_BOOK §4.6 术语一致：事件触发缺失；`merge_group_missing` 保留为 merge_group 专用的子情形）。不增的替代方案（只修正标签文案）被否决：kind 是机器可读的分类字段，文案修正不能替代分类修正。
- **分类规则（TS 与 Oracle 两侧一致）：** `workflow_not_triggered` + `event_mismatch` / `activity_type_mismatch` 时，场景事件为 `merge_group` → `merge_group_missing`（规则 R-MG-01 不变）；其他事件 → `event_trigger_missing`（新规则 **R-EV-01**，建议文本与 R-MG-01 同模板，仅 rule_id 不同）。
- **落地：**
  - `src/core/types.ts`：WITNESS_KINDS 增 `event_trigger_missing`（9 种）。
  - `src/core/witness-reducer.ts`：两处分支按场景事件分流；头注释更新。
  - `src/core/recommendations.ts`：`merge_group_missing` 与 `event_trigger_missing` 共用分支，按 kind 取 R-MG-01 / R-EV-01；规则表头注释更新。
  - `oracle/checkpath_oracle/witness.py`：`_build_evidence` 与 `_recommendation` 同步镜像。
  - 夹具更新（仅 kind 与 rule_id，note/建议文本不变）：`tests/fixtures/witness/T9-18/expected.json`、`T9-19/expected.json`、`tests/fixtures/witness/expected-s0/E2E-05.json`（pull_request types 不匹配）；T9-01/T9-02/E2E-03/E2E-07（merge_group 情形）保持 `merge_group_missing` / R-MG-01。
  - 测试更新：`tests/unit/witness/witness.test.ts` 的 KIND_TO_RULE 增 `event_trigger_missing: R-EV-01`；`witness-oracle-dump.test.ts` 的 kind 清单增新 kind，并把原锁定旧桶行为的 T9-18/T9-19 测试改写为锁定新分类（含 R-EV-01 与 merge_group 对照仍为 R-MG-01）。
- **验证：** witness 测试 59/59；`oracle:diff:witness` 44/44、0 mismatch。S0 e2e 报告不含 witness 字段，S0 fixtures 未动，S0 gate 不受影响。
- **状态：CLOSED。** 前序未决项文件（T009-U01、T010-U08）同步关闭。

### ADR T011/T006-U03 — `complete: false` 不参与判定：维持现状（CLOSED）

- **现状：** 两实现一致——`complete` 与 `returned_files` 不参与触发判定（`src/core/skip-annotation.ts` 头注释；T6-14/T6-15 锁定；`complete: false` 单独出现既不强制 always-run 也不强制 UNKNOWN）。
- **决策：维持现状，不改语义。** 理由：(1) PROJECT_BOOK §4.3 把 `complete` 列为场景调用方提供的 diff 事实，未赋予它独立的判定语义；GitHub 文档的 always-run 规则只绑定 push >1,000 commits 与 diff timeout 两项，`complete: false` 本身（返回文件不完整）并不等同于 diff 超时；(2) 两实现已一致且有测试锁定，改语义无规范依据，反而会在无官方语义支撑的情况下制造新口径；(3) 若未来 GitHub 语义明确要求，仍可走 ADR 同步改两侧。
- **锁定：** T6-14（`complete: false` + paths 命中 → 触发）复用于 golden G-38；抽查确认 G-38 为 VALID / triggered / REPORTABLE_PENDING。
- **状态：CLOSED。** 前序未决项文件（T006-U03、T007-U04、T008-U04、T010-U07）同步关闭。

### ADR T011/ADR-04 — 新发现：`strategy.matrix` 与 reusable-workflow Job 曾为 false PASS，现判 UNKNOWN（CLOSED）

- **发现（T011 回归中新发现，非前序未决项）：** PROJECT_BOOK §3.4 明确规定 `strategy.matrix` 展开后的 required-check context 与 reusable workflow 的跨文件展开均输出 UNKNOWN，但两实现此前都忽略这两个字段：matrix Job 与 `uses:` Job 均被当作普通 Job 判 ELIGIBLE、check 判 REPORTABLE_PENDING。探针复现：matrix Job（`strategy.matrix.os: [ubuntu-latest, windows-latest]`）与 reusable Job（`uses: ./.github/workflows/reusable.yml`）在修复前均报 REPORTABLE_PENDING——GitHub 实际报告的 context 是 `test (ubuntu-latest)` 等展开名或被调 workflow 的 Job，`test` 本身不会被报告，因此这是 **false PASS**，不是口径偏好问题。
- **决策：Job 带 `strategy.matrix` 或 `uses:` 时，若它本来会运行（ELIGIBLE / CONDITIONAL_AFTER_NEEDS），判 UNKNOWN；** 原因分别为 `unsupported_matrix` / `unsupported_reusable_workflow`；check 随之 UNKNOWN / `provider_unknown`。可判定的跳过仍优先：`if: false`、无 `always()` 的 skipped needs、INVALID needs 等结论不变（Job 不运行就不存在展开问题）。`strategy` 无 `matrix` 键（如仅 `fail-fast`）仍为普通 Job；`uses` 与 `matrix` 同时出现时 `uses` 优先。
- **落地（TS 与 Oracle 同步）：**
  - `src/core/job-dag.ts`：`JobInput` 增可选字段 `unsupported_job?: "reusable_workflow" | "matrix" | null`；`evaluateOne` 在四个“会运行”的返回点（`eligible` / `always_eligible` / `always_overrides_skipped_needs` / `needs_pending`）应用覆盖。
  - `src/core/e2e.ts`：`extractJobs` 增 `extractUnsupportedJob`（`uses` 键存在 → reusable；`strategy` 为映射且含 `matrix` 键 → matrix）。
  - `src/core/types.ts` + `src/core/validate.ts` + `src/core/workflow-ir.ts`：`WorkflowIRJob` 增 `unsupported_job` 字段（validator 归一化为 null/枚举值并校验非法取值；类型侧为可选字段以兼容手写 IR 字面量，validator 与 builder 恒输出它）。WorkflowIR schema 版本字符串不变（加法字段，e2e 报告形状不变）。
  - `oracle/checkpath_oracle/parser.py`：`extract_jobs` 增同名字段；`oracle/checkpath_oracle/evaluator.py`：`_evaluate_jobs` 在 ELIGIBLE / CONDITIONAL_AFTER_NEEDS 时应用同等覆盖。
  - witness/recommendation 两侧无需改动：`provider_unknown` 的通用 fallback（note“job reason is …”与建议 R-UNSUP-01）已覆盖新原因，两侧文本一致。
  - 测试：新增 `tests/unit/job-dag/unsupported-job.test.ts`（7 例：matrix、uses、if:false 优先、skipped needs 优先/ always() 下 UNKNOWN、CONDITIONAL 下 UNKNOWN、普通 Job 不变）；更新 `tests/unit/event/workflow-ir.test.ts` 中一处 IR 全等断言（补 `unsupported_job: null`）。
- **夹具：** unsupported U-07（matrix）、U-08（reusable）进入 `tests/fixtures/unsupported/` 与 golden G-79/G-80；抽查见 §3。
- **验证：** Oracle 探针四边界（matrix→UNKNOWN、uses→UNKNOWN、matrix+if:false→SKIPPED、仅 fail-fast→ELIGIBLE）全部符合设计；全量测试 673/673；四路差分 0 mismatch。
- **状态：CLOSED。**

---

## 3. Golden 套件（80 例，≥64）

- **生成器：** `scripts/build-golden.py`（已提交，可复现；`--check-only` exit 0）。
- **构成：** G-01–G-24 镜像 S0 E2E-01–24（case id 与预期语义不变，scenario_id 改写为 golden id）；G-25–G-40 为 T6-01–T6-16（含 T6-16 空值事件与 T6-05/T6-06 first_3000 截断正/反例）；G-41–G-52 为 T7-01–T7-12；G-53–G-62 为 T8-01–T8-10；G-63–G-72 为 T9-01/03/05/07/09/11/13/16/18/19（覆盖全部 9 种 witness kind 的 e2e 侧）；G-73–G-80 为 U-01–U-08（unsupported，输入见 `tests/fixtures/unsupported/`）。
- **required-checks 口径：** 有源 manifest 的照抄（S0/T8/T9）；T6 无 manifest、T7 manifest 为空时，按 Job context（name ?? id，文件序、去重）派生——派生规则写在生成器内，报告与套件一致。
- **expected.json 方法（与 T009 先例一致）：** 由 Python Reference Oracle 的 `evaluate_e2e_fixture` 一次性生成，生成后冻结；TS 侧由 `tests/unit/golden/golden.test.ts` 锁定同一批 expected，TS↔Oracle 由 `npm run test:oracle` 逐字段对照。层间交叉验证：同一输入在 trigger/jobs/checks/witness 四路差分中已有手写冻结预期且 0 mismatch（41/48/46/44），golden 的 e2e 预期是这些已验证层预期的组合，不是凭空数值。
- **手核抽查（逐项按规范推导，非仅比对实现输出）：**
  - G-40（T6-16 空值事件）：VALID / triggered / ELIGIBLE / REPORTABLE_PENDING ✓
  - G-79（U-07 matrix）：job UNKNOWN / `unsupported_matrix`，check UNKNOWN ✓
  - G-80（U-08 reusable）：job UNKNOWN / `unsupported_reusable_workflow`，check UNKNOWN ✓
  - G-38（T6-14 complete:false）：VALID / triggered / REPORTABLE_PENDING（`complete` 不参与判定）✓
  - G-19（E2E-19 双 workflow 同 context）：AMBIGUOUS / `duplicate_context` ✓
  - G-05（E2E-05 PR types 不匹配）：`activity_type_mismatch` → PENDING_NOT_REPORTED（e2e 层不受 witness kind 改动影响）✓
- **覆盖统计（golden 80 例，Oracle 侧）：** check 状态 6/6（REPORTABLE_PENDING 44、PENDING_NOT_REPORTED 30、SKIPPED_SUCCESS 16、UNKNOWN 29、AMBIGUOUS 6、INVALID 13）；job 状态 5/5（ELIGIBLE 49、SKIPPED 42、CONDITIONAL_AFTER_NEEDS 6、UNKNOWN 23、INVALID 15）；trigger 状态 VALID 84 / UNKNOWN 3 / INVALID 1（按 workflow 计）；trigger 原因 triggered 54、path_mismatch 11、branch_mismatch 4、event_mismatch 4、activity_type_mismatch 3、commit_skip 4、unknown 7、invalid 1；job 原因 17 种（含 `unsupported_matrix` / `unsupported_reusable_workflow` 各 1）。
- **支持语义正/负/边界（每项至少一例，golden case id）：**
  - 事件：pull_request/push/merge_group 触发正例 G-04/G-06/G-02；event_mismatch 负例 G-03/G-61/G-63/G-72。
  - activity type：匹配正例 G-06；不匹配 G-05/G-07/G-71。
  - branches / branches-ignore：匹配正例与不匹配 G-10/G-13/G-34/G-65；`branches` 与 `paths` AND（CP-F）G-09/G-10。
  - paths / paths-ignore：匹配与不匹配 G-01/G-14/G-37 等 11 例 path_mismatch；有序负 Glob 重新包含（CP-G）G-11。
  - commit skip：`[skip ci]` G-12/G-66、`[skip actions]` G-31、`skip-checks: true` G-32；`[ci skip]` / `[no ci]` 由属性生成器覆盖（§4）。
  - diff 边界：push 恰 1,000（G-25，触发）vs 1,001（G-26，always-run）；diff timeout G-27/G-28；first_3000 已确认无命中 G-29 / 第 3,000 个命中 G-30 / 未确认 UNKNOWN G-16；总数恰 3,000（G-37）。
  - `if` 子集：true/false/always()/`&&`/`||`/`==`/`!=`/`!`/括号/上下文比较——T7-06/T7-08/T7-12 镜像为 G-46/G-48/G-52；不支持 `if` → UNKNOWN 12 例。
  - needs：diamond G-44、深跳过链 G-45、缺失引用 G-41、环 G-42、always() 覆盖 G-46、CONDITIONAL G-23。
  - required-check：name 优先 G-53、同 id 不同名 G-54、重复 context G-19/G-21/G-55/G-60/G-62/G-68、外部 source G-57、无 provider G-20/G-67。
  - unsupported 8 例：G-73 contains()、G-74 hashFiles()、G-75 pull_request_target、G-76 workflow_run、G-77 brace glob、G-78 needs.outputs、G-79 matrix、G-80 reusable——**全部 UNKNOWN**（19/19 含 UNKNOWN 的 golden 夹具与预期一致，见 parity 报告）。
- **输入哈希：** `evidence/tests/ORACLE_PARITY_REPORT.json` 内嵌 `input_file_hashes`（329 个文件）与 `input_fixture_sha256 = 7b2fdf4e…`；独立清单 `evidence/tests/ORACLE_PARITY_INPUT_HASHES.txt`（已用 Python 独立重算验证一致）。

---

## 4. 属性测试（1,000 生成场景）

- **实现：** `scripts/make-fixtures.mjs` 为本次新建（package.json 原有 `test:property` 指向它但文件缺失——此前该脚本不存在，`npm run test:property` 不可执行；本次按 §7 保留脚本名实现它）。参数：`--verify`（默认）、`--seed`（默认 20261108）、`--count`（默认 1000）；`npm run test:property -- --seed 20261108 --count 1000` 与默认调用均 exit 0。
- **PRNG：** xorshift32（§8.2 冻结算法），种子 `PROPERTY_TEST_SEED = 20261108`；生成器覆盖三事件、activity types、branch/path（含 ignore 与有序负模式）、commit-skip token、diff 边界（>1,000 commits、timeout、>3,000 已确认/未确认、`complete: false`）、Job DAG、`if` 支持子集与不支持写法、重复/missing/外部 source、matrix/uses、空值事件。
- **可复现性：** 同一命令两次生成字节一致（suite 哈希 `373c60b1a9cf6d68…`；默认调用与显式 `--seed 20261108 --count 1000` 调用哈希相同）；报告内含逐 case 输入哈希（1,000 条）。
- **结果：** 1,000 例 TS vs Oracle **0 mismatch**，false PASS 0；check 状态直方图 6/6（REPORTABLE_PENDING 102、PENDING_NOT_REPORTED 1356、SKIPPED_SUCCESS 50、UNKNOWN 134、AMBIGUOUS 206、INVALID 143），job 状态 5/5。报告：`evidence/tests/PROPERTY_REPORT.json`。
- **方法说明：** 生成的 expected.json 即 Oracle 报告本身（与 build-golden.py 同一方法）；parity 主张是 TS↔Oracle 的逐字段差分（无忽略清单），不是 TS 与自身比较。Oracle 导出 helper：`scripts/property-oracle-dump.py`。

---

## 5. 变异测试（12 例）

- **夹具：** `tests/fixtures/mutations/M-01…M-12`（每例含 base/mutated 两套 workflow+scenario、共用 required-checks、 hand-derived expected.json；变异方向覆盖触发翻转与修复翻转两个方向）。
- **结果：** `npm run test:mutation` 13/13（12 变异 + 计数断言）；`scripts/verify-mutations.py`（Oracle 侧）24/24 sides 与 expected.json 一致。
- **变异表：** M-01 paths 翻转、M-02 branches 翻转、M-03 去 merge_group、M-04 if true→false、M-05 Job 改名、M-06 加 `[skip ci]`、M-07 加 skipped 上游 needs、M-08 加 paths-ignore、M-09 types 翻转、M-10 引入重复 provider、M-11 去 paths 过滤（修复方向）、M-12 去 skip token（修复方向）。

---

## 6. 其他改动与说明

- **false-pass 计数器修正（`scripts/oracle-diff.mjs`）：** 原实现按 context 建 Map；T8-05/G-57 的 manifest 同一 context 出现三次（一次 github-actions、两次外部 source），Map 折叠后把 REPORTABLE_PENDING 行误报为 false PASS（首次 golden 运行报 false PASS 1，实际 TS==Oracle==expected 均为 0 mismatch）。改为按 manifest 下标逐行比对；S0 侧结果不变（仍为 0）。这不是放宽阈值——计数口径修正后 golden 与 S0 的 false PASS 均为真实 0。
- **oracle-diff.mjs golden 支持：** `runTsE2E` 按 suite 选择 `tests/unit/golden` 或 `tests/unit/s0-e2e` 并透传 `CHECKPATH_E2E_SUITE`；golden 报告写 `evidence/tests/ORACLE_PARITY_REPORT.json`（schema `checkpath.oracle-parity-report/v1`），不再覆盖 S0 报告；报告新增 `input_file_hashes` 逐文件哈希清单。S0 gate 路径未变。
- **回归发现并修复（T011 自身引入的回归）：** 首次 `s0:gate` 因 `runRepeat` 未向新签名的 `runTsE2E` 传 `suiteRel` 而在 determinism 阶段抛 TypeError、exit 1（当时 S0_GATE.json 仍为旧文件，未被覆盖）。已修复调用点并给 `runTsE2E` 加默认参数；重跑后 gate exit 0（见 §7）。
- **trigger 套件：** 40→41（T6-16）；`tests/unit/event/trigger-oracle-dump.test.ts` 计数断言与 `scripts/oracle-diff-trigger.mjs` 注释同步更新。
- **未动：** S0 fixtures（`tests/fixtures/s0/` 内容零改动）、规格文件（PROJECT_BOOK SHA-256 `028c2472…`、IMPLEMENTATION_PLAN `bb645205…` 已复核不变）、LICENSE_STATUS.md（PENDING_SAM_DECISION）。
- **新增文件不含许可证名称；无网络调用**（新脚本只派生本地 vitest/python3/node 进程）。

---

## 7. S0 Gate 复核

- `npm run s0:oracle`：24/24，0 mismatch，false PASS 0。
- `npm run s0:gate`：exit 0，`evidence/S0_GATE.json` status **PASS**，gate_report_sha256 `f511a847…`（与 T010 时一致，输入未变）。
- determinism 100 次运行 1 个哈希；static network check 0 匹配。

---

## 8. 交付清单

- Golden：`tests/fixtures/golden/` 72 个 case 目录 + `suite.json`（80 例）；unsupported：`tests/fixtures/unsupported/` U-01–U-08；mutations：`tests/fixtures/mutations/` M-01–M-12。
- 生成器与脚本：`scripts/build-golden.py`、`scripts/make-fixtures.mjs`、`scripts/property-oracle-dump.py`、`scripts/verify-mutations.py`；测试：`tests/unit/golden/golden.test.ts`、`tests/unit/mutations/mutations.test.ts`、`tests/unit/job-dag/unsupported-job.test.ts`。
- 证据：`evidence/tests/T011_REPORT.md`（本文件）、`evidence/tests/ORACLE_PARITY_REPORT.json`、`evidence/tests/ORACLE_PARITY_INPUT_HASHES.txt`、`evidence/tests/PROPERTY_REPORT.json`；四路差分报告已随重跑更新（T006 41 例、T007 48、T008 46、T009 44）。
- Handoff：`handoff/P020-T011/`（TASK_REPORT.md、changed_files.txt、test_commands.txt、test_logs/、sha256.txt、unresolved_items.md）。

---

## 9. 未决项

本次关闭：T008-U01、T009-U01、T006-U03（见 §2 ADR）；新增 ADR-04 已关闭。无新增未决项结转（详见 handoff 未决项文件）。
