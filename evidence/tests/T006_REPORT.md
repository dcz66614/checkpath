# T006 — Event/Branch/Path/Commit Skip Evaluator 任务报告

- **项目：** P020 CheckPath
- **任务：** T006（实施计划 §6，S1 第二项）
- **Base commit：** `b8012fa`（T005 PASS，工作树 clean）
- **日期：** 2026-11-08（UTC）
- **结论：PASS — 正式求值器完成；四项验收命令全部 exit 0；Trigger Oracle 差分 40/40、0 mismatch；全量回归 235/235（T005 的 124/124 全部保持 + 新增 111）；S0 Oracle 24/24，S0_GATE 仍为 PASS（gate_report_sha256 不变）。**

## 1. 交付内容

| 文件 | 说明 |
|---|---|
| `src/core/event-evaluator.ts` | 正式触发求值器：三类事件、activity type、按事件取 branch 值（PR→base、push→branch、merge_group→target）、branch+path AND、有序负模式、commit skip、diff 边界。算法自 PoC（workflow-parser.ts）逐字迁移，现为唯一事实来源 |
| `src/core/skip-annotation.ts` | 正式 commit-skip token 表（7 个）与 diff 边界标注：`annotateCommitSkip` / `hasCommitSkip`、`annotateDiffBoundary` / `isDiffAlwaysRun` / `diffChangedFilesTotal`；并写明 `diff.complete` / `returned_files` / `algorithm` 三字段语义（见 §2，S0 遗留项 ③） |
| `src/core/glob-subset.ts` | 正式化：算法与 S0 已验证的 PoC 逐字一致（不动匹配逻辑），头注释冻结契约并锁定边界行为（`/**` 匹配目录自身、`**/` 匹配零目录、仅含不支持模式时报告 unsupported 且不匹配） |
| `src/core/workflow-ir.ts` | 补齐 YAML→WorkflowIR 构建器（T005 未决项 U-01 关闭）：组合 `parseWorkflowYaml` + `extractJobs` + `validateWorkflowIR`，不复制解析逻辑；返回构建结果（含 trigger IR、status、errors、unsupported、validationIssues）；返回验证器归一化后的 IR |
| `src/core/workflow-parser.ts` | PoC 求值部分改为薄适配器：`evaluateTrigger` / `branchValueForEvent` / `hasCommitSkip` 委托正式模块；解析一半与公共 API 不变，S0 行为逐字节保持 |
| `package.json` | 新增脚本 `oracle:diff:trigger`（§7 允许新增脚本；既有脚本名全部保留） |
| `scripts/oracle-diff-trigger.mjs` | `npm run oracle:diff:trigger`：TS 侧跑 vitest dump 测试、Oracle 侧跑 `oracle-trigger-dump.py`，逐字段深比较 40 例，写 `evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`；任一 mismatch 即失败，无忽略白名单 |
| `scripts/oracle-trigger-dump.py` | Oracle 侧 dump 驱动：只调用 Oracle 现有 `build_trigger_ir`，不含任何求值算法（scenario 适配与 evaluator `_trigger_scenario` 逐字段对应） |
| `tests/fixtures/trigger/suite.json` | Trigger 套件：40 例（25 个 S0 E2E trigger case——E2E-19 按两个 workflow 文件拆为 19a/19b——+ 15 个新增 T6 case）；schema `checkpath.trigger-suite/v1`，seed 20261108 |
| `tests/fixtures/trigger/T6-01…T6-15/` | 15 个新增 trigger fixture（见 §3；T6-05/T6-06 为 3,000 文件列表，S0 遗留项 ① 的截断分支夹具） |
| `tests/unit/event/event.test.ts` | 20 个测试：三类事件、activity type、按事件取 branch、缺失 branch/action → UNKNOWN、commit skip 顺序 |
| `tests/unit/event/workflow-ir.test.ts` | 15 个测试：构建器 happy path（string/list `on`、单字符串过滤器归一化、`if: false` 字符串化、context 推导）、INVALID/UNKNOWN、job 层验证问题 |
| `tests/unit/event/trigger-oracle-dump.test.ts` | 41 个测试：suite 元数据 + 40 例“正式求值 == PoC 求值”逐例断言；设 `CHECKPATH_TRIGGER_DUMP_DIR` 时写 TS 侧 dump |
| `tests/unit/event/trigger-suite.ts`、`test-helpers.ts` | 测试共享加载器/构造器（非测试文件） |
| `tests/unit/filters/filters.test.ts` | 17 个测试：Glob 冻结子集、有序负模式与重新包含、branch+path AND、ignore 列表反转、互斥、unsupported → UNKNOWN |
| `tests/unit/diff-boundaries/diff-boundaries.test.ts` | 18 个测试：push 1,000/1,001 边界、diff timeout、first-3000 确认截断/未确认 UNKNOWN/恰好 3,000、`complete`/`returned_files`/`algorithm` 语义、7 个 skip token |
| `evidence/tests/T006_ORACLE_TRIGGER_REPORT.json` | Trigger Oracle 差分报告：40/40，mismatch 0 |
| `evidence/tests/T006_REPORT.md` | 本报告 |

未修改：Job DAG、check resolver、UI、CLI（`src/core/job-dag.ts`、`check-resolver.ts`、`e2e.ts`、`if-subset.ts`、`witness-reducer.ts`、CLI/UI 均未动）；全部 S0 fixtures；全部已提交 S0 证据文件（回归前后 SHA-256 对比：仅 3 个 gitignored 的 vitest 计时日志变化，见 §6）；规格文件（SHA-256 见 §6）；Python Oracle 核心算法（未动 `oracle/` 下任何文件）；LICENSE（仍为 `PENDING_SAM_DECISION`，未写任何许可证名称）。

## 2. 契约决策（写在代码头注释与测试中）

**求值器单一事实来源。** `evaluateTriggerEvents(events, status, unsupported, scenario)` 是唯一算法实现；`evaluateWorkflowTrigger(workflowIR, scenario)` 是正式入口（VALID IR）；`workflow-parser.ts` 的 `evaluateTrigger` 是适配器（PoC 宽松 scenario → 正式 ScenarioV1）。三处 40 例逐例“正式 == PoC”断言 + 40 例 TS↔Oracle 差分共同锁定：迁移零行为变化。

**判定式与优先级（§4.2）。** `triggered = event AND activity_type AND branch AND path AND NOT commit_skip`；首个失败决定 `reason`，后阶段不运行：event → activity type → branch → path/diff → commit skip。`path_match` 初值 `true`（branch 失败时保持该初值，与 PoC 一致，filters 测试锁定）。

**Branch 取值（§4.2）。** `pull_request` 用 `base_branch`（不是 head）、`push` 用 `branch`、`merge_group` 用 `target_branch`。T6-10（head 命中、base 未命中 → 不触发）与 T6-09（merge_group target 命中、head 不同 → 触发）分别锁定。

**Activity type。** `types` 为 null 时任何 action（含 null）都匹配；声明了 `types` 但 action 缺失（null）时 `activity_type_match: null`、`triggered: null`、`reason: "unknown"`；push 场景无 action，声明了 `types` 的 push workflow 同样 UNKNOWN（fail-closed，event 测试锁定）。

**Branch+path 为 AND；ignore 列表反转有序匹配结果。** `branches`/`branches-ignore` 与 `paths`/`paths-ignore` 各自互斥（解析期 INVALID）；有序 `!` 模式保留顺序，后续正模式可重新包含（CP-G，filters 测试）。

**Commit skip（§3.3）。** 7 个 token（`[skip ci]`、`[ci skip]`、`[no ci]`、`[skip actions]`、`[actions skip]`、`skip-checks:true`、`skip-checks: true`），全消息小写子串匹配，返回命中 token；无括号的 `skip ci`、不存在的 `skip-checks:false` 不跳过。检查在 path 之后：path/branch 失败优先于 commit skip。

**Diff 边界（§4.3，优先级 timeout > push>1,000 > 未确认 first-3000 > 确认截断）。**
- `diff_timed_out: true` 或 push 且 `push_commit_count > 1000` → always-run：path filter 视为触发，全部已列文件报告 matched（与无 path filter 相同）。恰好 1,000 不触发（T6-01）；`push_commit_count` 对 pull_request 无效。
- 总数 >3,000 且 `first_3000_confirmed !== true` → `path_match: null`、`triggered: null`、`reason: "unknown"`、`unsupported += "diff_first_3000_unconfirmed"`（E2E-16/CP-L）。
- 总数 >3,000 且 `first_3000_confirmed === true` → 只评估前 3,000 个已列文件（T6-05：3,000 个 docs 文件无匹配 → 不触发，`path_file_results` 长 3000；T6-06：第 3,000 个为 `src/app.ts` → 触发）。恰好 3,000 时正常评估（T6-13，未确认也不 UNKNOWN——边界是严格大于）。
- `changed_files_total` 缺失时回退到 `changed_files.length`。

**S0 遗留项 ③ — `diff.complete` / `returned_files` / `algorithm` 语义（记录在 `skip-annotation.ts` 头注释与本节，diff-boundaries 测试锁定）：**
- `complete`：diff 列表是否完成。两实现均**不**据此判定：超时由 `diff_timed_out: true` 表示，未确认首 3,000 由 `first_3000_confirmed: false` 表示；`complete: false` 单独出现（无 timeout）既不强制 always-run 也不强制 UNKNOWN（T6-14：`complete: false`、`diff_timed_out: false` → 正常触发）。真实场景中 `complete: false` 当且仅当 diff 未完成，但求值器不从它推断超时。
- `returned_files`：本次 diff 响应返回的文件数。**不要求等于 `changed_files.length`**——场景可只列返回文件的一个子集（S0 CP-L/E2E-16 列 2 个而 `returned_files=3000`；T005 已定，schema 只要求 `returned_files <= changed_files_total`）。求值器不查 `returned_files`，只用 `changed_files_total` + `first_3000_confirmed`（T6-15：列 2 个、`returned_files=3000`、总数 3500、已确认 → 正常触发）。
- `algorithm`：push→`two-dot`，pull_request/merge_group→`three-dot`；schema 层校验与事件一致（`validateScenario`，`inconsistent_value`），求值器对已提供的 `changed_files` 做模式匹配，与算法无关——CheckPath 不重建服务端 diff，算法不能改变哪些已列文件命中。

**Oracle `diff_boundary` 报告字段说明（避免混淆）。** Python Oracle 的 `diff_boundary` 只报告 timeout / push>1,000 / 未确认 first-3000 三种，确认截断时返回 null（截断仍在各 trigger 求值内生效，只是不作为场景级标注）。正式层 `annotateDiffBoundary` 另增 `"first_3000_truncated"` 以便命名该分支；**不得**把它抄入 e2e 报告的 `diff_boundary` 字段（`e2e.ts` 保持 Oracle 兼容的三值标注，待 T010 报告构建时再议）。

**WorkflowIR 构建器（T005 U-01）。** 只组合已有件：`parseWorkflowYaml`（`on:`、状态、unsupported）、`extractJobs`（jobs，文件顺序，S0 标量归一化）、`validateWorkflowIR`（schema  verdict）；唯一直接读取的是展示用 `name:`（字符串或 null）。`ok: true` 仅当解析 VALID 且 schema 校验干净；解析 INVALID/UNKNOWN 时 `workflow: null` 并原样携带 trigger IR；解析 VALID 但 job 层校验有问题（如 `needs` 引用未声明 job）时 `ok: false` 但仍返回 IR 供触发求值使用（job 层有效性是 T007 的 DAG 职责）。返回的是验证器归一化后的 IR（空 `if`→null 等）。YAML 解析器对重复映射键直接抛错 → `yaml_parse_error`（workflow-ir 测试锁定，实测确认）。

**Glob 正式化。** 算法逐字保留 PoC（S0 已验证），不重写匹配器；正式化 = 冻结契约 + 锁定边界（`src/**` 匹配 `src` 自身、`**/a.ts` 匹配零目录、`src/*` 不跨 `/`、仅含不支持模式时 `matched: false` + 上报 unsupported）。

## 3. 新增 trigger 夹具（`tests/fixtures/trigger/`，与 T011 协调口径见 §7）

| Case | 场景 | 预期 |
|---|---|---|
| T6-01 | push，1,000 commits，paths `src/**`，仅 README | 不触发（恰好 1,000 不 always-run） |
| T6-02 | push，1,001 commits，同上 | 触发（always-run） |
| T6-03 | PR，diff timeout，paths `src/**`，仅 README | 触发（always-run） |
| T6-04 | PR，diff timeout，paths-ignore `src/**`，`src/app.ts` | 触发（always-run，全 matched） |
| T6-05 | PR，总数 3,500，已确认，3,000 个 docs 文件 | 不触发（只评前 3,000，结果 3,000 条） |
| T6-06 | PR，总数 3,500，已确认，前 2,999 docs + 第 3,000 个 `src/app.ts` | 触发 |
| T6-07 | PR，commit `[skip actions]` | commit_skip，不触发 |
| T6-08 | push，commit `skip-checks: true`（带空格） | commit_skip，不触发 |
| T6-09 | merge_group，branches `main`，target main / head feature/x | 触发（用 target） |
| T6-10 | PR，branches `feature/x`，base main / head feature/x | 不触发（用 base） |
| T6-11 | PR，types `[opened]`，action 缺失 | UNKNOWN |
| T6-12 | PR，branches `main`，base_branch 缺失 | UNKNOWN |
| T6-13 | PR，总数恰好 3,000，未确认，docs 文件 | 不触发（正常评估，非 UNKNOWN） |
| T6-14 | PR，`complete: false`，无 timeout，`src/app.ts` | 触发（complete 不参与判定） |
| T6-15 | PR，总数 3,500，已确认，列 2 个文件，`returned_files=3000` | 触发（returned_files ≠ 列表长度无碍） |

Suite 另含 25 个 S0 E2E trigger case（24 个 E2E 夹具按 workflow 文件引用；E2E-19 含两个 workflow 文件，拆为 E2E-19a/19b）。S0 夹具文件本身未动，仅被引用。

## 4. 验收命令（真实运行）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run test:event` | 0 | 3 个文件，76/76 通过（event 20 + workflow-ir 15 + trigger dump 41） |
| `npm run test:filters` | 0 | 1 个文件，17/17 通过 |
| `npm run test:diff-boundaries` | 0 | 1 个文件，18/18 通过 |
| `npm run oracle:diff:trigger` | 0 | 40/40 trigger case，TS 与 Oracle 逐字段一致，mismatch 0（报告 `evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`，suite_sha256 `27ceb796…`） |
| `npm run typecheck`（回归） | 0 | `tsc --noEmit` 通过 |
| `npm run lint`（附加） | 0 | `eslint src tests scripts` 通过（初版 2 个未使用变量已修） |
| `npm test`（回归） | 0 | 14 个文件，235/235 通过（T005 的 124/124 全部保持 + 新增 111） |
| `npm run s0:oracle`（回归） | 0 | 24/24 fixtures，mismatch 0，false PASS 0，unsupported→UNKNOWN 2/2 |
| `npm run s0:gate`（回归） | 0 | `evidence/S0_GATE.json` status 仍为 `PASS`，`gate_report_sha256` 仍为 `f511a847…`，100 次确定性 1 个哈希 |

日志：`handoff/P020-T006/test_logs/`（各命令完整输出；`s0-gate.log` 为 `evidence/s0/logs/s0-gate.log` 的副本）。

## 5. 通过标准逐项核对

- 三类事件（pull_request / push / merge_group）与 activity type 匹配正确：是，event 测试 + T6-09 + S0 E2E-02/03/05/06/07。
- pull_request branch 用 base branch；merge_group branch 用 target branch：是，T6-09/T6-10 + event 测试。
- branch + path 为 AND；paths / paths-ignore、有序负模式正确：是，filters 测试（CP-F 双向 + CP-G 重新包含 + ignore 反转）。
- commit skip token 正确：是，7 个 token 全覆盖 + T6-07/T6-08。
- push >1,000 commits / diff timeout 的 always-run 边界正确：是，T6-01（恰好 1,000 否）/T6-02/T6-03/T6-04。
- >3,000 files 且缺少可信 first-3000 元数据时 UNKNOWN：是，E2E-16/CP-L；已确认时截断评估：T6-05/T6-06。
- TypeScript 与 Oracle trigger 输出 100% 一致（0 mismatch）：是，`oracle:diff:trigger` 40/40。

## 6. S0 证据完整性

回归前对 `evidence/` 全部 37 个文件取 SHA-256 快照（`/tmp/t006-evidence-before.txt`）；回归后复核：

- `npm run s0:oracle` 与 `npm run s0:gate` 重新生成了 `evidence/s0/S0_ORACLE_REPORT.json`、`S0_DETERMINISM_REPORT.json`、`evidence/S0_GATE.json`——复核结果为字节一致（确定性报告无时间戳），`S0_GATE.json` status 仍为 `PASS`，`gate_report_sha256` 仍为 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`。
- 唯一变化的是 3 个 gitignored 的 vitest 日志（`evidence/s0/logs/s0-oracle-ts.log`、`s0-parse-t004.log`、`s0-semantics-t004.log`，含耗时）——与 T005 相同情况，不属于已提交的 S0 证据；已提交的 S0 证据文件无任何字节变化。
- S0 fixtures 未动；规格文件未动：`P020_PROJECT_BOOK.md` SHA-256 `028c2472…`，`P020_IMPLEMENTATION_PLAN.md` SHA-256 `bb645205…`（与立项记录一致）。
- 新增证据文件仅 `evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`（本任务产出）。

## 7. 未决项（见 `handoff/P020-T006/unresolved_items.md`）

1. **T011 协调口径（S0 遗留项 ① 收尾）：** T6-05/T6-06（first_3000_confirmed=true 的截断分支夹具）已补在 `tests/fixtures/trigger/` 下并登记于 `tests/fixtures/trigger/suite.json`。T011（Golden 回归）扩充 golden 套件时应复用/引用这两例，不要另造口径不一致的截断夹具；若 T011 把 trigger 套件整体并入 golden，应保持 case id（T6-05/T6-06）与预期语义不变。
2. **Oracle `diff_boundary` 与正式层 `annotateDiffBoundary` 的取值差异：** 见 §2——Oracle 确认截断时报告 null，正式层报告 `"first_3000_truncated"`；`e2e.ts` 保持 Oracle 兼容。T010 报告构建时如需在 ReportV1 中呈现截断标注，需先定口径（ADR 或 T010 任务内决定），本任务未擅自改 e2e 报告字段。
3. **`complete: false` 不参与判定的语义：** 见 §2——这是两实现当前一致的行为（有测试锁定），不是本任务新发明的规则；若未来 GitHub 语义要求 `complete: false` 本身触发 always-run/UNKNOWN，需走 ADR 并同步改 TS 与 Oracle。
4. **T005 未决项结转：** U-02（`JobStatus`/`CheckStatus` 双份定义，归属 T007/T008）、U-03（`e2e.ts` 内联 canonical/sha256 副本，归属 T010）、U-04（`report_sha256` 不重算验证，归属 T010/T014）仍 OPEN，本任务未动相关文件。
5. **规范层面无未决项：** 本次未发现规格错误，因此未按“发现规范错误先停下”的规则停下；以上均为工程归属/口径事项。
