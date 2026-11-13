# T011 — 完整 Golden、变异、属性与 Oracle 差分测试 任务报告

- **项目：** P020 CheckPath
- **任务：** T011（实施计划 §6，S4 第一项）
- **Base commit：** `69ce5ca`（T010 PASS，工作树 clean）
- **日期：** 2026-11-08（UTC）
- **结论：PASS — Golden 80/80、属性 1,000 例 0 mismatch、变异 12 例双侧一致、false PASS = 0、四路差分 0 mismatch、S0_GATE 仍为 PASS。** 三项前序 ADR（T008-U01、T009-U01、T006-U03）全部在本任务内决策并落地关闭；另新发现并关闭 ADR-04（matrix/reusable Job false PASS）。

## 1. 交付内容

| 文件 | 说明 |
|---|---|
| `tests/fixtures/golden/`（72 目录 + `suite.json`） | 80 固定 golden cases：S0 24 + T6 16 + T7 12 + T8 10 + T9 10 + unsupported 8；expected.json 由 Oracle 生成后冻结 |
| `tests/fixtures/unsupported/`（U-01–U-08） | 8 手写 unsupported 输入：contains()、hashFiles()、pull_request_target、workflow_run、brace glob、needs.outputs、matrix、reusable；全部 UNKNOWN |
| `tests/fixtures/mutations/`（M-01–M-12） | 12 变异例，每例 base/mutated 两套输入 + hand-derived expected.json；双向翻转均有 |
| `tests/fixtures/trigger/T6-16-empty-event-value/` | ADR T008-U01 正例：`pull_request:` 空值；trigger 套件 40→41 |
| `scripts/build-golden.py` | Golden 生成器（80 例组装 + Oracle expected + 覆盖统计；`--check-only` 可字节复现） |
| `scripts/make-fixtures.mjs` | 属性生成器 + 验证器（xorshift32，种子 20261108；此前 package.json 引用但文件缺失，本次按 §7 保留脚本名实现） |
| `scripts/property-oracle-dump.py` | 属性套件的 Oracle 报告导出（写 expected.json + 逐 case 报告） |
| `scripts/verify-mutations.py` | 变异夹具的 Oracle 交叉验证（24/24 sides 一致） |
| `tests/unit/golden/golden.test.ts` | Golden e2e 测试（80 例 + 全 6 种 check 状态断言；支持 `CHECKPATH_E2E_SUITE` 覆盖，供属性套件复用） |
| `tests/unit/mutations/mutations.test.ts` | 变异测试（13 个断言：12 变异翻转 + 计数） |
| `tests/unit/job-dag/unsupported-job.test.ts` | ADR-04 单元测试（7 例：matrix/uses/优先规则） |
| `scripts/oracle-diff.mjs` | 支持 golden 套件（报告写 `evidence/tests/ORACLE_PARITY_REPORT.json`，新增 `input_file_hashes` 清单）；false-pass 计数改为按 manifest 下标逐行比对（修 T8-05/G-57 误报）；修复 `runRepeat` 未传 `suiteRel` 的回归（首次 s0:gate 因此 exit 1，见 §5） |
| `scripts/oracle-diff-trigger.mjs`、`tests/unit/event/trigger-oracle-dump.test.ts` | 计数 40→41（T6-16） |
| `oracle/checkpath_oracle/parser.py` | ADR T008-U01：空字符串事件配置视同无配置；`extract_jobs` 增 `unsupported_job`（ADR-04） |
| `oracle/checkpath_oracle/evaluator.py` | ADR-04：会运行的 matrix/reusable Job 判 UNKNOWN |
| `oracle/checkpath_oracle/witness.py` | ADR T009-U01：`event_trigger_missing` kind + R-EV-01 建议（与 TS 镜像） |
| `src/core/types.ts` | WITNESS_KINDS 增 `event_trigger_missing`（9 种）；`WorkflowIRJob` 增 `unsupported_job`（ADR-04，可选字段） |
| `src/core/witness-reducer.ts` | ADR T009-U01：event/activity mismatch 按场景事件分流（merge_group 专属）；`irJobsFor` 透传 `unsupported_job` |
| `src/core/recommendations.ts` | R-EV-01（与 R-MG-01 同模板，仅 rule_id 不同） |
| `src/core/job-dag.ts` | ADR-04：`JobInput.unsupported_job` + 四个“会运行”返回点的 UNKNOWN 覆盖（可判定跳过优先） |
| `src/core/e2e.ts`、`src/core/workflow-ir.ts` | ADR-04：`extractUnsupportedJob` + IR 映射 |
| `src/core/validate.ts` | ADR-04：`WORKFLOW_JOB_FIELDS` 增 `unsupported_job` 并校验枚举值 |
| `tests/fixtures/witness/T9-18/expected.json`、`T9-19/expected.json`、`expected-s0/E2E-05.json` | ADR T009-U01：kind 与 rule_id 改为 `event_trigger_missing` / R-EV-01（文本不变） |
| `tests/unit/witness/witness.test.ts`、`witness-oracle-dump.test.ts` | KIND_TO_RULE 增新 kind；T9-18/T9-19 测试改写为锁定新分类 |
| `tests/unit/event/workflow-ir.test.ts` | IR 全等断言补 `unsupported_job: null`（ADR-04 schema 扩展） |
| `evidence/tests/T011_REPORT.md` | 本任务报告（含 4 份 ADR 决策记录） |
| `evidence/tests/ORACLE_PARITY_REPORT.json` | Golden parity 报告（80 例，0 mismatch，false PASS 0，含 329 文件输入哈希清单） |
| `evidence/tests/ORACLE_PARITY_INPUT_HASHES.txt` | 独立输入哈希清单（已独立重算验证） |
| `evidence/tests/PROPERTY_REPORT.json` | 属性报告（1,000 例，0 mismatch，再生一致，含逐 case 输入哈希） |

未修改：S0 fixtures（`tests/fixtures/s0/` 内容零改动）、规格文件（PROJECT_BOOK SHA-256 `028c2472…`、IMPLEMENTATION_PLAN `bb645205…` 已复核不变）、LICENSE_STATUS.md（仍为 `PENDING_SAM_DECISION`，新增文件不含任何许可证名称）。`evidence/s0/S0_ORACLE_REPORT.json` 的唯一变化是新增 `input_file_hashes` 字段（脚本输出增强，S0 数值未变）；S0_GATE.json 内容不变（gate sha 仍为 `f511a847…`）。

## 2. ADR 决策摘要

- **T008-U01（CLOSED）：** 空值事件合法（GitHub 语义：无过滤器），Oracle 侧 `''` 视同无配置；TS 无需改动；补 T6-16 正例；三路差分 0 mismatch。
- **T009-U01（CLOSED）：** 增专用 kind `event_trigger_missing` + 规则 R-EV-01；`merge_group_missing` 仅限 merge_group 场景；三处 witness 预期文件同步更新；witness 差分 44/44。
- **T006-U03（CLOSED）：** `complete: false` 维持现状（不参与判定），理由见 T011 报告 §2；G-38 锁定。
- **ADR-04（新发现，CLOSED）：** `strategy.matrix` 与 reusable-workflow Job 曾被误判 REPORTABLE_PENDING（false PASS，违反 §3.4）；现判 UNKNOWN（原因 `unsupported_matrix` / `unsupported_reusable_workflow`），可判定跳过优先；两侧同步 + 7 个单元测试 + U-07/U-08 夹具。

## 3. 验收结果

- `npm run test`：exit 0，**673/673**（29 文件：T010 的 570 + golden 82 + mutations 13 + trigger T6-16 1 + ADR-04 7，含重叠计数口径见报告 §1 注）。
- `npm run test:property -- --seed 20261108 --count 1000`：exit 0，1,000 例 0 mismatch，false PASS 0，再生一致（suite 哈希 `373c60b1…`）；默认调用同结果。
- `npm run test:oracle`：exit 0，80 例 0 mismatch，false PASS 0，unsupported 19/19。
- `npm run test:mutation`：exit 0，13/13；Oracle 交叉验证 24/24。
- `npm run typecheck` / `npm run lint`：exit 0。
- 四路差分：trigger 41、jobs 48、checks 46、witness 44，全部 0 mismatch。
- `npm run s0:oracle`：24/24，0 mismatch；`npm run s0:gate`：exit 0，**S0_GATE PASS**（gate sha `f511a847…` 不变）。

## 4. 方法说明（expected.json 与计数器）

- Golden expected.json 由 Oracle 一次性生成后冻结（与 T009 先例一致）；同一输入在四路差分中有手写冻结预期且 0 mismatch；6 例关键预期逐项按规范手核（见 T011 报告 §3）。
- false-pass 计数器曾误报 1（T8-05/G-57 同一 context 三次出现致 Map 折叠），已改为下标比对；修正后 golden 与 S0 均为真实 0，非放宽阈值。
- `test:property` 在任务开始时不可执行（package.json 引用 `scripts/make-fixtures.mjs` 但文件不存在）；本次按 §7 保留脚本名新建实现。

## 5. 本任务内发现并修复的回归

首次 `s0:gate` 因 `runRepeat` 未向新签名的 `runTsE2E(tsDir, logPath, suiteRel)` 传 `suiteRel` 而在 determinism 阶段抛 TypeError、exit 1（当时 S0_GATE.json 仍为旧文件，未被覆盖）。已修复调用点并给 `runTsE2E` 加默认参数；重跑后 gate exit 0、PASS。

## 6. 未决项

本次关闭 T008-U01、T009-U01、T006-U03 与新发现 ADR-04；无新增未决项。详见 `unresolved_items.md`。另：`reports/` 为任务开始前已存在的未跟踪目录（非本任务产物），未纳入本次提交。

## 7. 证据路径

- `evidence/tests/T011_REPORT.md`
- `evidence/tests/ORACLE_PARITY_REPORT.json`、`evidence/tests/ORACLE_PARITY_INPUT_HASHES.txt`
- `evidence/tests/PROPERTY_REPORT.json`
- `handoff/P020-T011/test_logs/`（全部验收命令日志；完整 `.log` 文件在工作区可读，按仓库 `.gitignore` 的 `*.log` 规则不入库，退出码汇总见已入库的 `test_logs/commands.exit`）
