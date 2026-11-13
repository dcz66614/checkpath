# T007 — Job DAG 与受限 `if` 求值 任务报告

- **项目：** P020 CheckPath
- **任务：** T007（实施计划 §6，S2 第一项）
- **Base commit：** `46590aa`（T006 PASS，工作树 clean）
- **日期：** 2026-11-08（UTC）
- **结论：PASS — 正式 Job DAG 与 `if` 子集完成；三项验收命令全部 exit 0；Jobs Oracle 差分 48/48、0 mismatch；全量回归 398/398（T006 的 235/235 全部保持 + 新增 163）；S0 Oracle 24/24，S0_GATE 仍为 PASS（gate_report_sha256 不变）。**

## 1. 交付内容

| 文件 | 说明 |
|---|---|
| `src/core/if-subset.ts` | 正式 `if` 子集求值器：tokenizer + 递归下降 parser + Kleene 三值求值，算法自 PoC（job-dag.ts 内联实现）逐字迁移，现为唯一事实来源；导出 `evaluateIfExpression` / `parseIfExpression` / `evaluateIfAst` / `containsAlways` / `ifContextFromScenario` / `UnsupportedIfError` |
| `src/core/job-dag.ts` | 正式 Job DAG：结构 INVALID（缺失依赖/环/重复 id/传递失效）+ Kahn 拓扑排序（输入顺序平局）+ 五状态求值，算法与 PoC 逐字一致；`if` 求值委托 if-subset.ts；`JobStatus`/`CheckStatus` 不再本地定义，改为自 types.ts 的 re-export（T005 U-02 的 JobStatus 侧关闭，见 §2）；新增 `(workflow, job_id)` 键 API（S0 遗留项 ② 的 DAG 侧，见 §2） |
| `package.json` | 新增脚本 `oracle:diff:jobs`（§7 允许新增脚本；既有脚本名全部保留） |
| `scripts/oracle-diff-jobs.mjs` | `npm run oracle:diff:jobs`：TS 侧跑 vitest dump 测试、Oracle 侧跑 `oracle-jobs-dump.py`，逐字段深比较 48 例，写 `evidence/tests/T007_ORACLE_JOBS_REPORT.json`；任一 mismatch 即失败，无忽略白名单 |
| `scripts/oracle-jobs-dump.py` | Oracle 侧 dump 驱动：只调用 Oracle 现有 `evaluate_e2e_fixture` / `evaluate_case`，不含任何求值算法 |
| `tests/fixtures/jobs/suite.json` | Jobs 套件：36 个 YAML case（24 个 S0 E2E 夹具引用 + 12 个新增 T7 case）+ 引用 12 个 S0 job-check case；schema `checkpath.jobs-suite/v1`，seed 20261108 |
| `tests/fixtures/jobs/T7-01…T7-12/` | 12 个新增 jobs 夹具（见 §3；T7-09 为同 job_id 双 workflow 键案例） |
| `tests/unit/if-subset/if-subset.test.ts` | 80 个测试：字面量/空条件、布尔算子与优先级、always()、上下文比较、Kleene 三值逻辑、不支持表达式 fail-closed、ScenarioV1 适配 |
| `tests/unit/job-dag/job-dag.test.ts` | 33 个测试：拓扑顺序稳定性、结构 INVALID（缺失/环/自环/重复 id/传递失效）、workflow 未触发、if/needs 优先级、skipped 传播、always() 例外、UNKNOWN 传播、(workflow, job_id) 键 |
| `tests/unit/job-dag/jobs-oracle-dump.test.ts` | 50 个测试：36 个 YAML case“正式 DAG == 冻结预期”+ 12 个 job-check case 状态断言；设 `CHECKPATH_JOBS_DUMP_DIR` 时写 TS 侧 dump |
| `tests/unit/job-dag/jobs-suite.ts` | 测试共享加载器（非测试文件）：YAML case 走正式流水线（buildWorkflowIR + 触发求值 + evaluateJobsForTrigger），job-check case 走 evaluateJobs |
| `evidence/tests/T007_ORACLE_JOBS_REPORT.json` | Jobs Oracle 差分报告：48/48，mismatch 0 |
| `evidence/tests/T007_REPORT.md` | 本报告 |

未修改：Event evaluator、required-check resolver、CLI/UI（`src/core/event-evaluator.ts`、`check-resolver.ts`、`e2e.ts`、`src/cli/`、`src/ui/` 均未动）；全部 S0 fixtures；全部已提交 S0 证据文件（回归前后 SHA-256 对比：仅 3 个 gitignored 的 vitest 计时日志变化，见 §6）；规格文件（SHA-256 见 §6）；Python Oracle 核心算法（未动 `oracle/` 下任何文件）；LICENSE（仍为 `PENDING_SAM_DECISION`，未写任何许可证名称）。

## 2. 契约决策（写在代码头注释与测试中）

**正式化 = 迁移，不重写算法。** `if-subset.ts` 的 tokenizer/parser/求值器与 `job-dag.ts` 的 DAG 分析/求值 precedence 均自 T003 PoC 逐字迁移。证据：正式化后、写任何新测试之前先跑 `npm test`，235/235 一次通过（零行为变化）；随后新增的 163 个测试与 48 例 Oracle 差分共同锁定迁移无漂移。

**单一事实来源（T005 未决项 U-02，JobStatus 侧关闭）。** `JobStatus` 与 `CheckStatus` 的定义只在 `src/core/types.ts`；`job-dag.ts` 不再定义这两个 union，改为 `export type { CheckStatus, JobStatus } from "./types.js"` 的纯 re-export——`check-resolver.ts` 与 `e2e.ts` 的既有 import（`from "./job-dag"`）无需改动即可继续编译。**CheckStatus 侧分工：** re-export 只是过渡，T008 正式化 resolver 时把 `check-resolver.ts` 改为直接 `from "./types.js"` import，并删掉 `job-dag.ts` 的 `CheckStatus` re-export；`JobStatus` 的 re-export 可保留（job-dag 是该类型的生产者之一），或由 T008 一并收敛。本任务未动 `check-resolver.ts`（禁改清单）。

**`(workflow, job_id)` 键（S0 遗留项 ②，DAG 侧落地点：`src/core/job-dag.ts`）。** job_id 只在单个 workflow 文件内唯一；两个 workflow 文件可声明同名 job_id 且触发结果不同。落地点：
- `JobKey`（`{ workflow_path, job_id }`）+ `jobKey()`：规范字符串形式为 JSON 编码的 `[workflow_path, job_id]` 二元数组——路径含 `/` 时拼接式 key 会碰撞（如 `("a/b","c")` 与 `("a","b/c")`），JSON 编码无此问题（job-dag 测试锁定）；`parseJobKey()` 为其逆，畸形 key 抛错。
- `evaluateJobsKeyed(JobDagInput)`：正式多 workflow 入口，输入为正式 `WorkflowIRJob[]` + 已验证 `ScenarioV1`（`if` 上下文经 `ifContextFromScenario` 适配），每个结果为 `KeyedJobEvaluation`（`JobEvaluation` + `workflow_path` + `key`）。
- `evaluateJobsForTrigger({ workflow_path, trigger, scenario, jobs })`：触发态到 Job 的映射与 Oracle `evaluate_e2e_fixture` 及 `e2e.ts` 的分支逐字一致——trigger INVALID → 全部 `INVALID` / `trigger_invalid`；UNKNOWN（含 VALID 但 triggered 为 null）→ 全部 `UNKNOWN` / `trigger_unknown`；否则按 triggered 布尔值跑 DAG。
- `evaluateJobs` 仍为单 workflow 核心（S0 流水线 `e2e.ts` 与 S0 job-check 套件继续用它），不感知 workflow 身份；`topologicalJobOrder` 把结构分析（INVALID map + Kahn 顺序）抽为可单独测试的纯函数，与 `evaluateJobs` 共用同一实现，二者不可能漂移。
- **Resolver 侧归属 T008：** resolver 收到 keyed provider 后按 `(workflow, job_id)` 区分同 context 的多 provider——本任务未动 resolver，具体落地点由 T008 定；`e2e.ts` 的 `E2EJobReport` 仍用 `workflow` 字段承载 workflow 身份（与 Oracle 的 jobs 行一致），T008/T010 如需改为 key 形式以该任务的决定为准。

**`if` 冻结子集（§3.3，if-subset.ts 头注释冻结）。** `true` / `false` / `always()` / `!` / `&&` / `||` / `==` / `!=` / 括号 / `github.event_name` / `github.ref` / `github.base_ref` / `github.head_ref` / `github.event.action` / 字符串字面量，可包 `${{ ... }}`。其余一律 `UnsupportedIfError` → `UNKNOWN` / `unsupported_if`，永不静默按 true 处理：`success()` / `failure()` / `cancelled()` / `contains()` / `hashFiles()` / `fromJSON()` / `needs.*` / `steps.*` / `matrix.*` / `env.*` / `vars.*` / `secrets.*` / `github.sha` / `github.repository` 等（if-subset 测试逐项锁定，另有 `1 == 1` 与单 `&` / `|` / `<` 等非法算子）。

**Kleene 三值逻辑。** `false && UNKNOWN = FALSE`，`true || UNKNOWN = TRUE`，其余与 UNKNOWN 的组合仍为 UNKNOWN；裸 context / 裸字符串不是布尔条件 → `if_unknown`；`==` / `!=` 仅当两侧均为已知且同类型时比较，缺失上下文值（null）或类型不匹配（布尔 vs 字符串）→ UNKNOWN；空/空白/缺失 `if` = 无条件 → TRUE（`no_condition`）。

**求值优先级（§4.4，job-dag 测试锁定）。** 结构 INVALID > workflow 未触发（SKIPPED / `workflow_not_triggered`；但结构 INVALID 仍优先于触发结果）> `if` FALSE（SKIPPED / `if_false`）/ 不支持（UNKNOWN）> needs 门：SKIPPED need → SKIPPED（`needs_skipped`），除非 `if` 含 `always()`（任意嵌套位置，`containsAlways` 判定）→ ELIGIBLE（`always_overrides_skipped_needs`）；UNKNOWN need → UNKNOWN（`needs_unknown`）；无 needs → ELIGIBLE；会运行的 needs → `CONDITIONAL_AFTER_NEEDS`（`needs_pending`），`always()` 时为 ELIGIBLE（`always_eligible`）。`if` 的判定先于 needs 门：上游已 skipped 时，不支持的 `if` 仍为 UNKNOWN（不是 SKIPPED），`if: false` 仍为 `if_false`（不是 `needs_skipped`）。

**拓扑顺序稳定性。** Kahn + 输入顺序平局：同层就绪 job 按其在输入文件中的下标排序，与 job 名、哈希顺序无关；同一输入重复求值顺序恒定（job-dag 测试 10 次重复断言 + 钻石依赖两种 sibling 输入顺序各得其序）。

## 3. 新增 jobs 夹具（`tests/fixtures/jobs/`，与 T011 协调口径见 §7）

全部使用同一 PR 场景（pull_request / synchronize / base main / head feature/x / ref `refs/pull/42/merge` / changed `src/app.ts`），`required-checks.json` 为空清单（本套件只差分 jobs 行）。

| Case | 场景 | 预期 |
|---|---|---|
| T7-01 | deploy needs 不存在的 ghost | build ELIGIBLE；deploy INVALID / `missing_need:ghost` |
| T7-02 | a→c→b→a 三环 + 独立 ok | a/b/c INVALID / `needs_cycle`；ok ELIGIBLE（环不污染无关 job） |
| T7-03 | a 自 needs | a INVALID / `needs_cycle`；b ELIGIBLE |
| T7-04 | 菱形 a→{b,c}→d | a ELIGIBLE；b/c/d CONDITIONAL_AFTER_NEEDS / `needs_pending` |
| T7-05 | a `if: false` → b→c 连锁跳过，d `needs: [c]` + `if: always()` | a/b/c SKIPPED；d ELIGIBLE / `always_overrides_skipped_needs` |
| T7-06 | build `if: false`；agg `always() && event_name=='pull_request'`；agg2 `always() \|\| false`；agg3 无 always 的静态真条件 | agg/agg2 ELIGIBLE；agg3 SKIPPED / `needs_skipped` |
| T7-07 | 5 个不支持 `if`：success()、needs.*.outputs、contains()、github.sha、`${{ failure() }}` | 全部 UNKNOWN / `unsupported_if` |
| T7-08 | 上下文比较：ref 命中/未命中、base_ref、action、head_ref | r1/r3/r5 ELIGIBLE；r2/r4 SKIPPED / `if_false` |
| T7-09 | 两个 workflow 同声明 job `test`（context 同为 tests）；workflow-a paths `src/**` 触发，workflow-b paths `docs/**` 不触发 | a/test ELIGIBLE；b/test SKIPPED / `workflow_not_triggered`——键案例 |
| T7-10 | a needs ghost；b needs a；c needs b；d 独立 | a INVALID / `missing_need:ghost`；b INVALID / `invalid_need:a`；c INVALID / `invalid_need:b`；d ELIGIBLE |
| T7-11 | a `if: success()`；b needs a；c needs b；d 独立 | a UNKNOWN / `unsupported_if`；b/c UNKNOWN / `needs_unknown`；d ELIGIBLE |
| T7-12 | a `if: false`；b needs a + 不支持 if；c needs a + `if: false`；d needs a + 事件名不等 | a SKIPPED；b UNKNOWN / `unsupported_if`；c/d SKIPPED / `if_false`（if 先于 needs 门） |

Suite 另含 24 个 S0 E2E 夹具（引用，未复制）与 12 个 S0 job-check case（引用，未复制）；Oracle 差分共 48 例。

## 4. 验收命令（真实运行）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run test:job-dag` | 0 | 3 个文件，83/83 通过（job-dag 33 + dump 50） |
| `npm run test:if-subset` | 0 | 1 个文件，80/80 通过 |
| `npm run oracle:diff:jobs` | 0 | 48/48 jobs case，TS 与 Oracle 逐字段一致，mismatch 0（报告 `evidence/tests/T007_ORACLE_JOBS_REPORT.json`，suite_sha256 `2dadabef…`） |
| `npm run typecheck`（回归） | 0 | `tsc --noEmit` 通过 |
| `npm run lint`（回归） | 0 | `eslint src tests scripts` 通过 |
| `npm test`（回归） | 0 | 17 个文件，398/398 通过（T006 的 235/235 全部保持 + 新增 163） |
| `npm run oracle:diff:trigger`（回归） | 0 | 40/40 trigger case，mismatch 0 |
| `npm run s0:oracle`（回归） | 0 | 24/24 fixtures，mismatch 0，false PASS 0，unsupported→UNKNOWN 2/2 |
| `npm run s0:gate`（回归） | 0 | `evidence/S0_GATE.json` status 仍为 `PASS`，`gate_report_sha256` 仍为 `f511a847…`，100 次确定性 1 个哈希 |

日志：`handoff/P020-T007/test_logs/`（各命令完整输出）。

## 5. 通过标准逐项核对

- DAG 拓扑结果稳定：是，`topologicalJobOrder` 输入顺序平局 + 10 次重复断言 + 钻石两种 sibling 顺序；`evaluateJobs` 结果按输入顺序输出。
- 缺失依赖/环输出 INVALID：是，T7-01/T7-02/T7-03/T7-10 + S0 E2E-24 + job-check jc10/jc11，Oracle 差分 0 mismatch。
- 支持的静态 `if` 结果 TRUE/FALSE/UNKNOWN 与 Oracle 一致：是，if-subset 80 测试 + jobs 差分 48/48（含 T7-06/T7-08/T7-12 的复合与比较语义）。
- 默认成功状态前置条件、`needs` skipped 传播与 `always()` 例外正确：是，T7-05/T7-06 + S0 E2E-17/18/22 + jc05/jc06，`always()` 在 `&&`/`||` 内仍豁免、自身 `if` 为 false 时不豁免。
- 不支持的函数/上下文不允许静默按 true 处理：是，T7-07 五类 + if-subset 20 余项不支持枚举，全部 UNKNOWN / `unsupported_if`。
- Oracle mismatch = 0：是，48/48。

## 6. S0 证据完整性

回归前对 `evidence/` 全部 39 个文件取 SHA-256 快照（`/tmp/t007-evidence-before.txt`）；回归后复核：

- `npm run s0:oracle` 与 `npm run s0:gate` 重新生成了 `evidence/s0/S0_ORACLE_REPORT.json`、`S0_DETERMINISM_REPORT.json`、`evidence/S0_GATE.json`——复核结果为字节一致（确定性报告无时间戳），`S0_GATE.json` status 仍为 `PASS`，`gate_report_sha256` 仍为 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`。
- 唯一变化的是 3 个 gitignored 的 vitest 日志（`evidence/s0/logs/s0-oracle-ts.log`、`s0-parse-t004.log`、`s0-semantics-t004.log`，含耗时）——与 T005/T006 相同情况，不属于已提交的 S0 证据；已提交的 S0 证据文件无任何字节变化。
- S0 fixtures 未动；规格文件未动：`P020_PROJECT_BOOK.md` SHA-256 `028c2472…`，`P020_IMPLEMENTATION_PLAN.md` SHA-256 `bb645205…`（与立项记录一致）。
- 新增证据文件仅 `evidence/tests/T007_ORACLE_JOBS_REPORT.json`（本任务产出）；`T006_ORACLE_TRIGGER_REPORT.json` 回归复跑后字节一致。

## 7. 未决项（见 `handoff/P020-T007/unresolved_items.md`）

1. **T008 承接（CheckStatus re-export 与 resolver 侧键）：** 见 §2——`job-dag.ts` 的 `CheckStatus` re-export 待 T008 删除（resolver 改为直接 import types.ts）；resolver 侧 `(workflow, job_id)` 键（keyed provider 的 context 匹配）归属 T008，本任务只交付了 DAG 侧的键与入口。
2. **T011 协调口径（jobs 套件复用）：** T7-01…T7-12（`tests/fixtures/jobs/`，suite `checkpath.jobs-suite/v1`）已登记预期 jobs 行；T011（Golden 回归）扩充 golden 套件时应复用/引用这些 case id 与预期语义，不要另造口径不一致的 DAG/`if` 夹具；若 T011 把 jobs 套件整体并入 golden，应保持 case id（T7-01…T7-12）与预期语义不变。
3. **T006 未决项结转（不由本任务解决）：** U-02（Oracle `diff_boundary` 报 null 与正式层 `annotateDiffBoundary` 报 `first_3000_truncated` 的取值差异，待 T010 定口径）、U-03（`complete: false` 不参与判定，改语义需走 ADR）仍 OPEN，本任务未动相关文件。
4. **T005 未决项结转：** U-03（`e2e.ts` 内联 canonical/sha256 副本，归属 T010）、U-04（`report_sha256` 不重算验证，归属 T010/T014）仍 OPEN；U-01 已由 T006 关闭；U-02 的 JobStatus 侧由本任务关闭、CheckStatus 侧归属 T008（见本节第 1 项）。
5. **规范层面无未决项：** 本次未发现规格错误，因此未按“发现规范错误先停下”的规则停下；以上均为工程归属/口径事项。

## 8. 修复记录（诚实说明）

1. 首轮 `test:job-dag` 1 失败：钻石依赖测试的预期顺序写错——输入顺序为 d,c,b,a 时 Kahn 同层按输入下标排序应为 a,c,b,d，测试误写为 a,b,c,d。修复：测试改为两例（b,c 输入顺序与 c,b 输入顺序各得其序），实现未改。复跑后 33/33。
2. 其余验收命令（if-subset 80、dump 50、oracle:diff:jobs 48/48、回归 398/398）均一次通过，无实现修复。
