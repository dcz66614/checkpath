# T008 — Required Check Context Resolver 任务报告

- **项目：** P020 CheckPath
- **任务：** T008（实施计划 §6，S2 第二项）
- **Base commit：** `c529d9d`（T007 PASS，工作树 clean）
- **日期：** 2026-11-08（UTC）
- **结论：PASS — 正式 check resolver 完成；两项验收命令全部 exit 0；Checks Oracle 差分 46/46、0 mismatch；全量回归 484/484（T007 的 398/398 全部保持 + 新增 86）；S0 Oracle 24/24，S0_GATE 仍为 PASS（gate_report_sha256 不变）。**

## 1. 交付内容

| 文件 | 说明 |
|---|---|
| `src/core/check-resolver.ts` | 正式 resolver：优先级表与 reason 字符串自 PoC 逐字迁移；`CheckStatus` 改为直接 `from "./types.js"` import（T005 U-02 的 CheckStatus 侧关闭，见 §2）；新增 keyed API `resolveRequiredChecksKeyed` / `resolveRequiredChecksKeyedForWorkflow` / `toBaseCheckResult`（S0 遗留项 ② 的 resolver 侧，见 §2）；`resolveRequiredChecksPerProvider` / `resolveRequiredChecks` / `JobWithTrigger` / `ProviderTriggerState` 签名与形状不变，`e2e.ts` 未动 |
| `src/core/job-dag.ts` | 仅删 `CheckStatus` re-export（现为 `export type { JobStatus }`），并更新两处头注释指向 T008 的 keyed resolver；DAG 算法、键 API、求值逻辑一行未动 |
| `package.json` | 新增脚本 `oracle:diff:checks`（§7 允许新增脚本；既有脚本名全部保留） |
| `scripts/oracle-diff-checks.mjs` | `npm run oracle:diff:checks`：TS 侧跑 vitest dump 测试、Oracle 侧跑 `oracle-checks-dump.py`，逐字段深比较 46 例，写 `evidence/tests/T008_ORACLE_CHECKS_REPORT.json`；任一 mismatch 即失败，无忽略白名单 |
| `scripts/oracle-checks-dump.py` | Oracle 侧 dump 驱动：只调用 Oracle 现有 `evaluate_e2e_fixture` / `evaluate_case`，不含任何求值算法 |
| `tests/fixtures/checks/suite.json` | Checks 套件：34 个 YAML case（24 个 S0 E2E 夹具引用 + 10 个新增 T8 case）+ 引用 12 个 S0 job-check case；schema `checkpath.checks-suite/v1`，seed 20261108 |
| `tests/fixtures/checks/T8-01…T8-10/` | 10 个新增 checks 夹具（见 §3；T8-02/T8-03 为 T7-09 类键案例的 resolver 侧覆盖） |
| `tests/unit/check-resolver/check-resolver.test.ts` | 36 个测试：六类状态正例、优先级逐级对子、name 优先/job_id fallback、source 边界、manifest 边界、keyed 身份 |
| `tests/unit/check-resolver/checks-oracle-dump.test.ts` | 50 个测试：34 例“正式 checks == 冻结预期”+ 12 例 job-check 状态断言 + 2 例 suite 元断言 + 2 例 keyed 身份断言；设 `CHECKPATH_CHECKS_DUMP_DIR` 时写 TS 侧 dump |
| `tests/unit/check-resolver/checks-suite.ts` | 测试共享加载器（非测试文件）：YAML case 走正式流水线（buildWorkflowIR + 触发求值 + evaluateJobsForTrigger + resolveRequiredChecksKeyed，投影为 Oracle 形状）；job-check case 走 evaluateJobs + resolveRequiredChecks |
| `evidence/tests/T008_ORACLE_CHECKS_REPORT.json` | Checks Oracle 差分报告：46/46，mismatch 0 |
| `evidence/tests/T008_REPORT.md` | 本报告 |

未修改：Event evaluator、Job DAG 算法、if-subset、e2e.ts、CLI/UI（`src/core/event-evaluator.ts`、`job-dag.ts` 的算法部分、`if-subset.ts`、`e2e.ts`、`src/cli/`、`src/ui/` 均未动）；全部 S0 fixtures；全部已提交 S0 证据文件（回归前后 SHA-256 对比：仅 3 个 gitignored 的 vitest 计时日志变化，见 §6）；规格文件（SHA-256 见 §6）；Python Oracle 核心算法（未动 `oracle/` 下任何文件）；LICENSE（仍为 `PENDING_SAM_DECISION`，未写任何许可证名称）。

## 2. 契约决策（写在代码头注释与测试中）

**正式化 = 迁移，不重写算法。** 优先级表（§4.5，10 级）与 10 个 reason 字符串（`external_source` / `no_provider` / `duplicate_context` / `provider_invalid` / `trigger_invalid` / `trigger_unknown` / `workflow_not_triggered` / `provider_skipped` / `provider_unknown` / `provider_reportable`）自 T003/T004 PoC 逐字迁移。证据：正式化后、写任何新测试之前先跑 `npm run test:check-resolver` 之外的既有全量测试——S0 job-check 套件（12 例，仍走 `resolveRequiredChecks`）与 S0 e2e 套件（24 例，仍走 `resolveRequiredChecksPerProvider`）在新 resolver 下一次通过，零行为变化；随后新增的 86 个测试与 46 例 Oracle 差分共同锁定迁移无漂移。

**单一事实来源（T005 未决项 U-02，CheckStatus 侧关闭）。** `CheckStatus` 的定义只在 `src/core/types.ts`；`check-resolver.ts` 改为 `import type { CheckStatus } from "./types.js"`，`job-dag.ts` 删除 `CheckStatus` re-export（保留 `JobStatus` re-export，因 job-dag 是该类型的生产者之一）。`JobStatus` 侧已由 T007 关闭；至此 U-02 全部关闭。

**`(workflow, job_id)` 键（S0 遗留项 ②，resolver 侧落地点：`src/core/check-resolver.ts` 的 `resolveRequiredChecksKeyed` / `KeyedRequiredCheckResult`）。**
- Provider 输入为 T007 的 `KeyedJobEvaluation`（每项自带 `workflow_path` + `jobKey()` 生成的 `key`，JSON 编码 `[workflow_path, job_id]`）；单 provider 的 verdict 额外携带 `provider_workflow_path`、`provider_key` 与 `provider_keys: [key]`。
- AMBIGUOUS 时 `provider_job_id` / `provider_workflow_path` / `provider_key` 均为 null，但 `provider_keys` 列出全部匹配 provider 的 key（输入顺序），`provider_count` 为总数——键用于报告“谁冲突”，绝不用于暗中挑一个。
- T7-09 类案例的 resolver 侧覆盖：T8-03（workflow-a/test ELIGIBLE 与 workflow-b/test SKIPPED，同 context `tests`）→ AMBIGUOUS，`provider_keys` 为 `["workflow-a.yml","test"]` 与 `["workflow-b.yml","test"]`（dump 测试逐项断言）；T8-02（同 job_id `test`，不同 name → 不同 context `alpha`/`beta`）→ 各自解析到正确的 workflow，`provider_key` 互不相同（dump 测试逐项断言）。
- `toBaseCheckResult()` 把 keyed 结果投影回冻结的 Oracle 形状（去掉三个 key 字段），`resolveRequiredChecksKeyed` 投影后与 `resolveRequiredChecksPerProvider` 在同一输入上逐字段相等（单元测试锁定）；Oracle 差分比较的就是投影后的形状，因此 keyed 扩展不改变任何已冻结的对照字段。`e2e.ts` 继续用未 keyed 的 `resolveRequiredChecksPerProvider`（其 `E2EJobReport` 仍用 `workflow` 字段承载 workflow 身份），keyed API 供 T009/T010 的报告构建选用。

**优先级细节（测试锁定）：**
- 外部 source（第 1 级）先于一切：有 provider 时仍 UNKNOWN / `external_source`，无 provider 时同样 UNKNOWN（不是 `no_provider`）；`source` 缺失/null/`"github-actions"` 均按 github-actions 处理，空字符串 `""` 按外部 source 处理（与 Oracle 的 `.get("source")` 语义一致）。
- duplicate（第 3 级）先于 provider INVALID：两个同 context provider 中一个 INVALID 仍为 AMBIGUOUS（T8-08）。
- provider INVALID（第 4 级）先于 trigger INVALID（第 5 级）：经 `evaluateJobsForTrigger` 产生的 trigger-invalid workflow，其 jobs 本身已是 INVALID / `trigger_invalid`，因此 resolver 在该路径上报告 `provider_invalid`（T8-06 的 bad-trigger 预期即为此；初版夹具曾误写 `trigger_invalid`，见 §8）。`trigger_invalid` 这一 reason 只在调用方直接提供非 INVALID 的 job 评估配 invalid trigger 时可达——单元测试覆盖该分支（provider SKIPPED + trigger invalid → INVALID / `trigger_invalid`）。
- workflow 未触发（第 7 级）先于 provider SKIPPED：job 的 `workflow_not_triggered` SKIPPED 状态本身不决定 check 状态，决定它的是 trigger。
- `CONDITIONAL_AFTER_NEEDS` 与 ELIGIBLE 同为 REPORTABLE_PENDING：真实上游结果不可知，但 check 会被报告；绝不把 REPORTABLE_PENDING 解释为 Job 已通过。

**Context 匹配。** 精确匹配、区分大小写、不 trim、不模糊：job 有 `name` 时 context 即 `name`，`job_id` 被遮蔽（T8-01：required `build` 无 provider，尽管存在 job_id `build`）；无 `name` 时 context 为 `job_id`（fallback）。Manifest 顺序决定结果顺序；重复 manifest 条目各自独立解析（T8-10，三行完全相同的 REPORTABLE_PENDING）。

## 3. 新增 checks 夹具（`tests/fixtures/checks/`，与 T011 协调口径见 §7）

全部场景除注明外均为同一 PR（pull_request / synchronize / base main / head feature/x / ref `refs/pull/42/merge` / changed `src/app.ts`）。无过滤器的 workflow 用 `pull_request: {}`（空映射）写法——见 §8 第 2 项：空值 `pull_request:`（无子键）在 TS 与 Oracle 间存在已发现的分歧，属未决项 T008-U01，不由本任务改口径。

| Case | 场景 | 预期 |
|---|---|---|
| T8-01 | job build 名 unit-tests、lint 无名、deploy 名 deploy-job needs lint；required 含 unit-tests/lint/build/deploy-job/Unit-Tests/missing | unit-tests→REPORTABLE_PENDING（build）；lint→REPORTABLE_PENDING；build→PENDING_NOT_REPORTED（name 遮蔽 job_id）；deploy-job→REPORTABLE_PENDING（CONDITIONAL）；Unit-Tests/missing→PENDING_NOT_REPORTED（大小写敏感/无 provider） |
| T8-02 | 两 workflow 同 job_id test，名 alpha（paths src/** 触发）/ beta（paths docs/** 未触发） | alpha→REPORTABLE_PENDING（key workflow-a）；beta→PENDING_NOT_REPORTED（key workflow-b） |
| T8-03 | T7-09 镜像：两 workflow 同 job_id test、同名 tests，a 触发、b 未触发 | tests→AMBIGUOUS，count 2，keys 列出两个 workflow |
| T8-04 | workflow-a paths src/**（仅改 README，未触发）job ci；workflow-b 无过滤 job unit `if: false` | ci→PENDING_NOT_REPORTED（workflow_not_triggered）；unit→SKIPPED_SUCCESS |
| T8-05 | 单 job unit-tests；required 含 github-actions/外部 App/无 provider 外部源/缺省 source/空字符串 source | github-actions→REPORTABLE_PENDING；外部源（有/无 provider）→UNKNOWN；缺省 source→按 github-actions（lint 无 provider→PENDING）；空字符串 source→UNKNOWN |
| T8-06 | 三 workflow：paths+paths-ignore（trigger INVALID）job bad-trigger；branches main 但 base_branch 缺失（trigger UNKNOWN）job branch-check；job deploy needs ghost（provider INVALID） | bad-trigger→INVALID / provider_invalid（见 §2）；branch-check→UNKNOWN / trigger_unknown；broken-deploy→INVALID / provider_invalid |
| T8-07 | u1 `if: success()`、base、down needs base、solo `if: false` | unsup→UNKNOWN；downstream→REPORTABLE_PENDING（CONDITIONAL）；skipped-one→SKIPPED_SUCCESS |
| T8-08 | 同 workflow 两 job 同名 shared（一个 ELIGIBLE，一个 needs ghost → INVALID）+ solo | shared→AMBIGUOUS（duplicate 先于 invalid）；solo→REPORTABLE_PENDING |
| T8-09 | workflow 仅 pull_request，场景 merge_group/checks_requested | unit-tests→PENDING_NOT_REPORTED（workflow_not_triggered） |
| T8-10 | manifest 三条 unit-tests（含重复条目与显式 github-actions） | 三行完全相同的 REPORTABLE_PENDING |

Suite 另含 24 个 S0 E2E 夹具（引用，未复制）与 12 个 S0 job-check case（引用，未复制）；Oracle 差分共 46 例。六类状态的覆盖：REPORTABLE_PENDING（T8-01/02/05/07/08/10 + S0）、SKIPPED_SUCCESS（T8-04/07 + S0 jc04–06）、PENDING_NOT_REPORTED（T8-01/02/04/05/09 + S0）、AMBIGUOUS（T8-03/08 + S0 E2E-19/21、jc08）、UNKNOWN（T8-05/06/07 + S0 E2E-24、jc09）、INVALID（T8-06 + S0 E2E-24、jc10/11）——每类均有正例、负例（优先级对子）与边界例（空 manifest、重复条目、空字符串 source、大小写、name 遮蔽）。

## 4. 验收命令（真实运行）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run test:check-resolver` | 0 | 2 个文件，86/86 通过（resolver 单元 36 + dump 50） |
| `npm run oracle:diff:checks` | 0 | 46/46 checks case，TS 与 Oracle 逐字段一致，mismatch 0（报告 `evidence/tests/T008_ORACLE_CHECKS_REPORT.json`，suite_sha256 `24931fbd…`） |
| `npm run typecheck`（回归） | 0 | `tsc --noEmit` 通过 |
| `npm run lint`（回归） | 0 | `eslint src tests scripts` 通过 |
| `npm test`（回归） | 0 | 19 个文件，484/484 通过（T007 的 398/398 全部保持 + 新增 86） |
| `npm run oracle:diff:trigger`（回归） | 0 | 40/40 trigger case，mismatch 0 |
| `npm run oracle:diff:jobs`（回归） | 0 | 48/48 jobs case，mismatch 0 |
| `npm run s0:oracle`（回归） | 0 | 24/24 fixtures，mismatch 0，false PASS 0，unsupported→UNKNOWN 2/2 |
| `npm run s0:gate`（回归） | 0 | `evidence/S0_GATE.json` status 仍为 `PASS`，`gate_report_sha256` 仍为 `f511a847…`，100 次确定性 1 个哈希 |

日志：`handoff/P020-T008/test_logs/`（各命令完整输出）。

## 5. 通过标准逐项核对

- 六类结果全部有正/负/边界测试：是，见 §3 末段统计；单元测试另有 8 组优先级对子与 4 组边界（空 manifest、空 provider、重复条目、空字符串 source）。
- Job name 优先、job_id fallback：是，T8-01 + `jobContext` 单元测试。
- 同名 context 多 provider 必须 AMBIGUOUS：是，T8-03（跨 workflow）与 T8-08（同 workflow），provider_count 分别为 2。
- workflow 未触发导致 required check 不报告必须 PENDING_NOT_REPORTED：是，T8-02（beta）、T8-04（ci）、T8-09（merge_group 缺失）。
- 任何实际 Job 成功/失败都不由模拟器伪造：是，ELIGIBLE/CONDITIONAL 均只给 REPORTABLE_PENDING，报告与代码头注释均写明不预测真实结果。
- Oracle mismatch = 0：是，46/46。

## 6. S0 证据完整性

回归前对 `evidence/` 全部 41 个文件取 SHA-256 快照（`/tmp/t008-evidence-before.txt`）；回归后复核：

- `npm run s0:oracle` 与 `npm run s0:gate` 重新生成了 `evidence/s0/S0_ORACLE_REPORT.json`、`S0_DETERMINISM_REPORT.json`、`evidence/S0_GATE.json`——复核结果为字节一致（确定性报告无时间戳），`S0_GATE.json` status 仍为 `PASS`，`gate_report_sha256` 仍为 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`。
- 唯一变化的是 3 个 gitignored 的 vitest 日志（`evidence/s0/logs/s0-oracle-ts.log`、`s0-parse-t004.log`、`s0-semantics-t004.log`，含耗时）——与 T005/T006/T007 相同情况，不属于已提交的 S0 证据；已提交的 S0 证据文件无任何字节变化。
- `T006_ORACLE_TRIGGER_REPORT.json` 与 `T007_ORACLE_JOBS_REPORT.json` 回归复跑后字节一致。
- S0 fixtures 未动；规格文件未动：`P020_PROJECT_BOOK.md` SHA-256 `028c2472…`，`P020_IMPLEMENTATION_PLAN.md` SHA-256 `bb645205…`（与立项记录一致）。
- 新增证据文件仅 `evidence/tests/T008_ORACLE_CHECKS_REPORT.json`（本任务产出）与本报告。

## 7. 未决项（见 `handoff/P020-T008/unresolved_items.md`）

1. **T008-U01（新，TS↔Oracle 分歧，需 ADR）：** 空值事件 `on: { pull_request: }`（无子键）——TS `yaml` 解析为空值 null → 无过滤器 → VALID；Python Oracle `yaml.BaseLoader` 解析为空字符串 `''` → `event_config_not_mapping` → INVALID。本任务的 T8 夹具改用等价的 `pull_request: {}` 写法（两边均为 VALID），分歧本身未改、未绕过后藏：复现命令与判定写在 unresolved_items.md，归属 T011/ADR（Oracle parser 侧把 `''` 视同无配置，或冻结口径判 INVALID，需同步改 TS 与 Oracle 并补 trigger 夹具）。
2. **T011 协调口径（checks 套件复用）：** T8-01…T8-10（`tests/fixtures/checks/`，suite `checkpath.checks-suite/v1`）已登记预期 checks 行；T011（Golden 回归）扩充 golden 套件时应复用/引用这些 case id 与预期语义，不要另造口径不一致的 resolver 夹具；若 T011 把 checks 套件整体并入 golden，应保持 case id（T8-01…T8-10）与预期语义不变。Keyed 结果的 `provider_workflow_path` / `provider_key` / `provider_keys` 是 T008 新增的报告层字段，不在 Oracle 对照形状内；T010 报告构建时如需采用，以 `KeyedRequiredCheckResult` 为准。
3. **T006 未决项结转（不由本任务解决）：** U-02（Oracle `diff_boundary` 报 null 与正式层 `first_3000_truncated` 的取值差异，待 T010）、U-03（`complete: false` 不参与判定，改语义需走 ADR）仍 OPEN，本任务未动相关文件。
4. **T005 未决项结转：** U-03（`e2e.ts` 内联 canonical/sha256 副本，归属 T010）、U-04（`report_sha256` 不重算验证，归属 T010/T014）仍 OPEN；U-02 已由 T007（JobStatus 侧）与本任务（CheckStatus 侧）全部关闭；U-01 已由 T006 关闭。
5. **规范层面无未决项：** 本次未发现规格错误，因此未按“发现规范错误先停下”的规则停下；以上均为工程归属/口径事项与一项新发现的实现分歧（T008-U01）。

## 8. 修复记录（诚实说明）

1. 首轮 `test:check-resolver` 1 失败（86 中 1）：T8-06 的 bad-trigger 预期 reason 写错——手写预期为 `trigger_invalid`，实际按冻结优先级第 4 级（provider INVALID 先于 trigger INVALID）应为 `provider_invalid`（该 workflow 的 jobs 经 `evaluateJobsForTrigger` 已是 INVALID）。修复：夹具预期改为 `provider_invalid`，实现未改；同时在单元测试中补了一组直接覆盖 `trigger_invalid` 可达分支的用例（非 INVALID provider + invalid trigger）。复跑后 86/86。
2. 首轮 `oracle:diff:checks` 7 个 mismatch（46 中 7）：7 个 T8 夹具的 workflow 用了空值 `pull_request:`（无子键）写法，Oracle 判 trigger INVALID 而 TS 判 VALID——见 §7 第 1 项（T008-U01）。处理：夹具改用两边一致的 `pull_request: {}` 等价写法（8 处），实现与 Oracle 均未动；分歧记为未决项，不擅自改 Oracle 核心算法。复跑后 46/46、0 mismatch。
3. 其余验收命令（typecheck、lint、npm test 484/484、trigger 40/40、jobs 48/48、s0:oracle、s0:gate）均一次通过，无实现修复。
