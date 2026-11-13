# T009 — 最小失败见证与修复建议规则 任务报告

- **项目：** P020 CheckPath
- **任务：** T009（实施计划 §6，S3 第一项）
- **Base commit：** `c37c7e0`（T008 PASS，工作树 clean）
- **日期：** 2026-11-08（UTC）
- **结论：PASS — 最小失败见证缩减器与建议规则完成；三项验收命令全部 exit 0；Witness Oracle 差分 44/44、0 mismatch；全量回归 543/543（T008 的 484/484 全部保持 + 新增 59）；100 次运行 witness SHA-256 唯一；S0_GATE 仍为 PASS（gate_report_sha256 不变，仍为 `f511a847…`）。**

## 1. 交付内容

| 文件 | 说明 |
|---|---|
| `src/core/witness-reducer.ts` | 正式 witness reducer（原为 T001 空骨架）：对每个失败的 required check（PENDING_NOT_REPORTED / AMBIGUOUS / UNKNOWN / INVALID）生成一个确定性最小失败见证（`ReportWitness` 冻结形状）+ 一条建议；只读正式流水线（buildWorkflowIR + 触发求值 + evaluateJobsForTrigger + resolveRequiredChecksKeyed），判定逻辑一行未动 |
| `src/core/recommendations.ts` | 新增建议规则模块：8 条规则（R-MG-01 / R-PATH-01 / R-BRANCH-01 / R-SKIP-01 / R-CTX-01 / R-DUP-01 / R-UNSUP-01 / R-INV-01），每条只引用真实命中的规则与具体值，无空泛兜底；另含 note 与建议共用的 `triggerUnknownCause` / `triggerInvalidFixes` / 格式化 helper |
| `oracle/checkpath_oracle/witness.py` | 新增 Oracle 侧最小对照接口：只调用 Oracle 现有 `evaluate_e2e_fixture`（另用现有 `extract_jobs` 取 job `if`/`needs`、现有 `COMMIT_SKIP_TOKENS` 取 skip token），不动 Oracle 核心算法；与 TS 侧逐字段一致 |
| `scripts/oracle-witness-dump.py` | Oracle 侧 dump 驱动：读 witness suite，逐 case 调 `witness.build_witnesses` 写 `{witnesses, recommendations}` |
| `scripts/oracle-diff-witness.mjs` | `npm run oracle:diff:witness`：TS 侧跑 vitest dump 测试、Oracle 侧跑 dump 驱动，逐字段深比较 44 例，写 `evidence/tests/T009_ORACLE_WITNESS_REPORT.json`；任一 mismatch 即失败，无忽略白名单 |
| `package.json` | 新增脚本 `oracle:diff:witness`（§7 允许新增脚本；既有脚本名全部保留）；`test:witness:determinism` 的命令由 `vitest run tests/unit/witness --repeat=100` 改为 `vitest run tests/unit/witness/witness-determinism.test.ts`——vitest 5.1 没有 `--repeat` 选项（实测 `CACError: Unknown option '--repeat'`），100 次重复改由测试文件内循环执行，脚本名与 PASS 语义（100 次、1 个哈希）不变，见 §7 第 2 项 |
| `tests/fixtures/witness/suite.json` | Witness 套件：20 个新增 T9 case + 24 个 S0 E2E 夹具引用（未复制、未修改）；schema `checkpath.witness-suite/v1`，seed 20261108 |
| `tests/fixtures/witness/T9-01…T9-20/` | 20 个新增 witness 夹具（workflow YAML + scenario.json + required-checks.json + 冻结 expected.json），见 §3 |
| `tests/fixtures/witness/expected-s0/` | 24 个 S0 E2E case 的冻结 expected witness 输出（S0 的 expected.json 本身无 witness 字段且未动，冻结输出另存于此） |
| `tests/unit/witness/witness-suite.ts` | 测试共享加载器（非测试文件）：读 suite、校验 scenario、调 `buildWitnesses`、读冻结 expected |
| `tests/unit/witness/witness-oracle-dump.test.ts` | 47 个测试：44 例“正式 witness == 冻结预期”+ 套件元断言 + kind 覆盖 + id 唯一/顺序 + 报告/跳过无 witness + 缩减抽查 + T9-13/T9-18/T9-19 专项；设 `CHECKPATH_WITNESS_DUMP_DIR` 时写 TS 侧 dump |
| `tests/unit/witness/witness.test.ts` | 6 个属性测试：每 T9 case 至少 1 个 witness、缩减后 witness 输入重跑复现同一 witness（幂等）、每 witness 恰 1 条建议且 rule_id 与 kind 对应、note/建议无空泛短语、每条建议引用本 witness 的具体值、note 按 kind 命名具体阻断值 |
| `tests/unit/witness/witness-determinism.test.ts` | 1 个测试：全套件 44 例 × 100 次运行，canonical SHA-256 唯一 |
| `evidence/tests/T009_ORACLE_WITNESS_REPORT.json` | Witness Oracle 差分报告：44/44，mismatch 0 |
| `evidence/tests/T009_REPORT.md` | 本报告 |

未修改：event-evaluator、job-dag、if-subset、check-resolver 的判定逻辑；e2e.ts；CLI/UI；全部 S0 fixtures；全部已提交 S0 证据文件（回归前后 SHA-256 对比见 §6）；规格文件（SHA-256 见 §6）；Python Oracle 核心算法（未动 `oracle/` 下原有任何文件，只新增 `witness.py`）；LICENSE（仍为 `PENDING_SAM_DECISION`，未写任何许可证名称）。

## 2. 契约决策（写在代码头注释与测试中）

**见证范围：只对不报告的失败结果生成 witness。** `REPORTABLE_PENDING`（会报告）与 `SKIPPED_SUCCESS`（Job 被跳过但 check 以 skipped/success 报告，属警告而非失败）不生成 witness——8 个冻结 `WitnessKind` 中也没有覆盖 job-skip 的 kind。T9-09（integration 失败、unit-tests 报告）恰好只产 1 个 witness；S0 的 E2E-17/18/22（job skip）产 0 个 witness。T010 报告构建时，SKIPPED_SUCCESS 仍按项目书 §4.7 以警告呈现，不由本任务补 witness。

**Kind 判定（固定优先级，resolver reason 优先，再看 provider 的 trigger/job reason）：** `duplicate_context` → duplicate_context；`no_provider` → missing_context；`external_source` → unsupported_feature；`provider_invalid`/`trigger_invalid` → invalid_input；`trigger_unknown`/`provider_unknown` → unsupported_feature；`workflow_not_triggered` 按 trigger reason 分流：`event_mismatch`/`activity_type_mismatch` → merge_group_missing，`branch_mismatch` → branch_filter，`path_mismatch` → path_filter，`commit_skip` → commit_skip。`first_blocking_condition` 即底层原因码原文（trigger reason 或 resolver reason），不做意译。

**缩减顺序固定（每步重跑正式流水线验证复现才保留）：** ① manifest 只留失败 check；② 按文件顺序逐个删非 provider workflow（missing_context 跳过此步：note 里的 scanned job-context 清单是全量输入的证据；duplicate_context 的 provider 因删后 verdict 改变而自动保留）；③ changed_files：path_filter 保留第一个 path_file_result 为 false 的文件（空列表也能复现但看不到失败文件，故不用），其余 greedy 单文件删除至不动点；④ commit_message：commit_skip 只留命中 token，其余试空消息。边界元数据（changed_files_total、first_3000_confirmed、diff_timed_out、push_commit_count 等）作为事实原样保留，只缩文件列表与消息。最终整体再验证一次，失败则回退到未缩减 scenario（实际未触发）。

**复现谓词（§8 修复记录第 1 项）：** 候选输入必须复现同一 (status, reason) **且** 同一 kind 与 first_blocking_condition。只比 (status, reason) 太弱：删掉唯一命中的 path 文件会把 commit_skip 阻断变成 path_mismatch 阻断，而 check 的 (PENDING_NOT_REPORTED, workflow_not_triggered) 不变，缩减会错误放行。

**建议规则：每个 witness 恰好一条建议，rule_id 与 kind 一一对应（R-MG-01…R-INV-01），文本按 kind 内具体原因再分 variant**（如 trigger_unknown 按第一个 unsupported 条目分流：`diff_first_3000_unconfirmed` / `unsupported_glob:` / `unsupported_event:` / `unsupported_filter:` / 缺 action / 缺 branch 各有不同文本；invalid 按 `missing_need:` / `needs_cycle` / `duplicate_job_id` / `invalid_need:` / trigger_invalid 分流）。建议只引用证据里的真实值（workflow 路径、job id、context、branch、pattern、token、unsupported 原因、invalid 原因）；模块内不存在空泛兜底文本，属性测试另行断言禁用的空泛短语（"please check your configuration" / "check the configuration" / "something went wrong" / "请检查配置" 等）永不出现，且每条建议必须包含本 witness 的至少一个具体值。

**Oracle 对照接口的范围：** `oracle/checkpath_oracle/witness.py` 只新增 witness 推导逻辑（kind 分类、note/建议模板、固定顺序缩减），求值全部委托给现有 `evaluate_e2e_fixture`；场景归一化（缺失字段补 null、`commit_message` 缺省 `""`、`algorithm` 缺省 `"three-dot"`）逐项对齐 `validate.ts` 的 `validateScenario` 缺省值，否则 TS 侧 witness scenario（已校验的完整形状）与 Oracle 侧无法逐字段对齐。`normalize_scenario` 是本模块内唯一的“校验对齐”代码，不含求值算法。

## 3. 新增 witness 夹具（`tests/fixtures/witness/T9-01…T9-20/`，每个 kind 至少 2 个合成 witness）

除注明外场景均为同一 PR（pull_request / synchronize / base main / head feature/x / changed `src/app.ts`）。

| Case | 失败类别 | 场景 | 预期 witness（缩减后 scenario 要点） |
|---|---|---|---|
| T9-01 | merge_group_missing | workflow 只有 pull_request，场景 merge_group/checks_requested | fbc event_mismatch；files [] |
| T9-02 | merge_group_missing | workflow merge_group 但 types [opened]，场景 checks_requested | fbc activity_type_mismatch；files [] |
| T9-03 | path_filter | paths src/**，改 README.md + docs/guide.md | 保留首个不匹配文件 [README.md] |
| T9-04 | path_filter | paths-ignore docs/**，改 docs/a.md + docs/b.md | 保留首个被排除文件 [docs/a.md] |
| T9-05 | branch_filter | branches [main, release/**]，base develop | files []，branch 值是证据 |
| T9-06 | branch_filter | branches-ignore [main]，base main | files [] |
| T9-07 | commit_skip | 无 path filter，消息含 `[skip ci]` | 消息缩为 `[skip ci]`，files [] |
| T9-08 | commit_skip | paths src/**，改 src/app.ts + README.md，消息含 `[ci skip]` | 保留唯一命中文件 [src/app.ts]，消息缩为 `[ci skip]`（§8 第 1 项的回归锚点） |
| T9-09 | missing_context | job 只有 unit-tests，required 含 integration + unit-tests | 只产 integration 的 witness；scanned ["unit-tests"] |
| T9-10 | missing_context | 两 workflow 的 job 分别为 alpha / beta，required gamma | scanned ["alpha", "beta"]，两 workflow 均保留 |
| T9-11 | duplicate_context | 两 workflow 同 job 名 tests | providers 列出两个 workflow |
| T9-12 | duplicate_context | 同 workflow 两 job 同名 shared | providers 列出两个 job |
| T9-13 | unsupported_feature | required 含外部源 external-app（有 provider）与 other-app（无 provider） | 2 个 witness，均为 external_source |
| T9-14 | unsupported_feature | diff total 3500、first_3000 未确认 | trigger_unknown / diff_first_3000_unconfirmed |
| T9-15 | unsupported_feature | job `if: success()` | provider_unknown / unsupported_if |
| T9-16 | invalid_input | job deploy needs ghost | provider_invalid / missing_need:ghost |
| T9-17 | invalid_input | 同一 event 同时有 paths 与 paths-ignore | provider_invalid，trigger 错误 paths_and_paths_ignore_both_present |
| T9-18 | merge_group_missing（T009-U01 桶） | workflow pull_request types [opened]，场景 synchronize | fbc activity_type_mismatch，kind 为 merge_group_missing（见 §7 第 1 项） |
| T9-19 | merge_group_missing（T009-U01 桶） | workflow 只有 push，场景 pull_request | fbc event_mismatch，kind 为 merge_group_missing（见 §7 第 1 项） |
| T9-20 | unsupported_feature | paths 用不支持的 glob `src/**/{a,b}` | trigger_unknown / unsupported_glob:src/**/{a,b} |

全套件 44 例共产 **38 个 witness / 38 条建议**（T9 21 个 + S0 17 个；S0 侧 E2E-24 单 case 产 4 个：provider_unknown、provider_invalid ×2、external_source）。按 kind 统计（全套件）：merge_group_missing 7、path_filter 5、branch_filter 4、commit_skip 3、missing_context 3、duplicate_context 4、unsupported_feature 8、invalid_input 4——每类均 ≥2。

## 4. 验收命令（真实运行）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run test:witness` | 0 | 3 个文件，59/59 通过（dump 测试 52：44 例 frozen + 8 组结构/覆盖/抽查断言；属性测试 6；确定性测试 1） |
| `npm run test:witness:determinism` | 0 | 44 例 × 100 次运行，canonical SHA-256 唯一（约 4 秒） |
| `npm run oracle:diff:witness` | 0 | 44/44 witness case，TS 与 Oracle 逐字段一致，mismatch 0（报告 `evidence/tests/T009_ORACLE_WITNESS_REPORT.json`，suite_sha256 见该报告） |
| `npm run typecheck`（回归） | 0 | `tsc --noEmit` 通过 |
| `npm run lint`（回归） | 0 | `eslint src tests scripts` 通过 |
| `npm test`（回归） | 0 | 22 个文件，543/543 通过（T008 的 484/484 全部保持 + 新增 59） |
| `npm run oracle:diff:trigger`（回归） | 0 | 40/40 trigger case，mismatch 0 |
| `npm run oracle:diff:jobs`（回归） | 0 | 48/48 jobs case，mismatch 0 |
| `npm run oracle:diff:checks`（回归） | 0 | 46/46 checks case，mismatch 0 |
| `npm run s0:oracle`（回归） | 0 | 24/24 fixtures，mismatch 0，false PASS 0，unsupported→UNKNOWN 2/2 |
| `npm run s0:gate`（回归） | 0 | `evidence/S0_GATE.json` status 仍为 `PASS`，`gate_report_sha256` 仍为 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`，100 次确定性 1 个哈希 |

日志：`handoff/P020-T009/test_logs/`（各命令完整输出）。

## 5. 通过标准逐项核对

- 每个失败类别至少 2 个合成 witness：是，见 §3 末段统计（T9 侧每类 ≥2，全套件每类 ≥3）。
- 缩减顺序固定：是，§2 固定四步顺序 + greedy 到不动点；100 次运行哈希唯一。
- witness 输入可独立重新运行并复现同一状态：是，属性测试对全部 38 个 witness 做重跑：以 witness.scenario 为输入重调 `buildWitnesses`，同一 (check_context, kind) 的 witness 除 id 外逐字段相等；且缩减每步都以强复现谓词验证。
- 建议只引用真实命中的规则，不自动改文件：是，每 witness 恰 1 条建议，rule_id 与 kind 一一对应，文本只含证据值；无任何写文件/改配置逻辑（reducer 与 recommendations 均为纯函数）。
- 100 次运行 witness SHA-256 稳定：是，`test:witness:determinism` 44 例 × 100 次 = 1 个哈希。
- 无空泛“请检查配置”替代具体原因：是，属性测试断言禁用短语表永不出现；人工逐条核对 38 条建议（§3 抽查 + 全量 expected 审阅），每条均命名 workflow/job/context/branch/pattern/token/原因中的至少一个具体值。

## 6. S0 证据完整性

回归前对 `evidence/` 全部 44 个文件取 SHA-256 快照（`/tmp/t009-evidence-before.txt`）；回归后复核：

- `npm run s0:oracle` 与 `npm run s0:gate` 重新生成了 `evidence/s0/S0_ORACLE_REPORT.json`、`S0_DETERMINISM_REPORT.json`、`evidence/S0_GATE.json`——复核结果为字节一致（确定性报告无时间戳），`S0_GATE.json` status 仍为 `PASS`，`gate_report_sha256` 仍为 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`。
- 唯一变化的是若干 gitignored 的 vitest 计时日志（`evidence/s0/logs/` 下，与 T005–T008 相同情况，不属于已提交的 S0 证据）；已提交的 S0 证据文件无任何字节变化。
- `T006_ORACLE_TRIGGER_REPORT.json`、`T007_ORACLE_JOBS_REPORT.json`、`T008_ORACLE_CHECKS_REPORT.json` 回归复跑后字节一致。
- S0 fixtures 未动；规格文件未动：`P020_PROJECT_BOOK.md` SHA-256 `028c2472…`，`P020_IMPLEMENTATION_PLAN.md` SHA-256 `bb645205…`（与立项记录一致）。
- 新增证据文件仅 `evidence/tests/T009_ORACLE_WITNESS_REPORT.json`（本任务产出）与本报告。
- 中途插曲（§8 第 4 项）：一次 `s0:gate` 复跑曾因测试文件的 TS 错误使 gate 内嵌 typecheck exit 2，导致 `S0_GATE.json` 的 `typecheck_exit_code` 与哈希临时改变；修复 TS 错误后重跑 gate，文件恢复到与 T009 前字节一致（哈希仍为 `f511a847…`），最终提交的 gate 文件即该恢复后的版本。

## 7. 未决项（见 `handoff/P020-T009/unresolved_items.md`）

1. **T009-U01（新，冻结枚举缺口，需 ADR）：** 冻结的 `WITNESS_KINDS` 没有通用的“事件触发缺失” kind，只有 `merge_group_missing`。非 merge_group 的 `event_mismatch` / `activity_type_mismatch`（如 pull_request types 不匹配，T9-18/T9-19、S0 E2E-05）目前归入 `merge_group_missing` 桶，`first_blocking_condition` / note / 建议中均如实写明真实事件与 action，只有 kind 标签本身不精确。ADR 应增加专用 kind（如 `event_trigger_missing`）；在 ADR 落地前不得自行改 `types.ts` 枚举。复现：任一 T9-18/T9-19 witness 的 kind 字段。
2. **计划 §7 脚本偏差（已处理，留档供 T011 核对）：** `test:witness:determinism` 在计划中写为 `vitest run tests/unit/witness --repeat=100`，但 vitest 5.1 不存在 `--repeat` 选项（实测 `CACError: Unknown option '--repeat'`）。已改为跑 `tests/unit/witness/witness-determinism.test.ts`，100 次重复在测试内执行；脚本名与 PASS 语义不变。T011 若发现计划其他脚本存在同类问题，按同一方式处理并留档。
3. **T010 协调口径（witness 形状复用）：** `ReportWitness`（types.ts 冻结形状）未变——witness 输出为 `{id, kind, check_context, first_blocking_condition, scenario, note}`；建议以平行列表 `{witness_id, rule_id, kind, check_context, recommendation}` 输出，不并入 witness 对象。T010 报告构建时以 `witness_id` 关联两者；如需把建议并入报告 JSON，字段名以 `WitnessRecommendation` 为准。`witness-001…` 的编号只在单 case 内按 manifest 顺序从 001 起编，跨 case 不保证全局唯一。
4. **已知未决项结转（不由本任务解决）：** T008-U01（空值事件 `on: { pull_request: }` 的 TS↔Oracle 分歧，待 T011/ADR）；T006 U-02（diff_boundary 取值差异，待 T010）、U-03（complete: false 不参与判定，需 ADR）；T005 U-03（e2e.ts 内联 canonical 副本，归属 T010）、U-04（report_sha256 重算，归属 T010/T014）仍 OPEN，本任务未动相关文件。
5. **规范层面无未决项：** 本次未发现规格错误，因此未按“发现规范错误先停下”的规则停下；以上均为工程归属/口径事项与一项冻结枚举缺口（T009-U01）。

## 8. 修复记录（诚实说明）

1. **复现谓词太弱（实现缺陷，首轮 expected 生成后人工审阅发现）：** 首版 `reproduces` 只比 (status, reason)，导致 T9-08 与 S0 E2E-12 的缩减把 changed_files 减到 `[]`——删掉唯一命中 path 的文件后阻断原因从 commit_skip 变成了 path_mismatch，而 check 的 verdict 不变，谓词放行。修复：谓词改为同时比 kind 与 first_blocking_condition（TS 与 Oracle 两侧同步改）；重生成 expected 后 T9-08 与 E2E-12 均保留 `["src/app.ts"]`。属性测试的重跑断言（幂等）也会独立捕获此类错误。
2. **Oracle 侧 KeyError（首轮 `oracle:diff:witness` Oracle exit 1）：** `witness.py` 的 `_build_evidence` 把 provider 的 workflow 路径误写为 `single["job"]["workflow_path"]`（Oracle job 行只有 `workflow` 字段，路径在 provider 包装层）。修复：两处均改为 `single["workflow_path"]` / `p["workflow_path"]`；实现未动。复跑后 44/44、0 mismatch。
3. **属性测试断言太窄（首轮 `test:witness` 1 失败，59 中 1）：** “建议引用具体值”测试只从 note 里提取大写 `Workflow "..."` 与 context，而 T9-15 的建议引用的是 job 的 `if` 表达式 `"success()"`（note 里是小写 `workflow "..."`）。建议本身具体无误；修复测试：候选值改为 note 中全部引号值 + context + 消息 + 文件。复跑后 59/59。
4. **测试修 lint 引入 TS 错误并短暂改写 gate 文件（回归中发现）：** 为修 lint 的未使用变量把 `stripId` 改为 `delete copy.id`，但 `id` 是 ReportWitness 必填属性，`delete` 触发 TS2790；且该次修改后只跑了 lint 与测试、未重跑 typecheck，致使随后 `s0:gate` 内嵌的 typecheck exit 2，`S0_GATE.json` 的 `typecheck_exit_code` 与哈希临时改变（gate status 本身仍为 PASS，因其条件不含 typecheck 字段）。修复：`stripId` 改为显式构造对象（不 delete、不解构）；重跑 typecheck、lint、`test:witness` 全过后重跑 `s0:gate`，gate 文件恢复到与 T009 前字节一致（`f511a847…`）。教训：任何测试文件改动后也必须重跑 typecheck，不得只跑 lint/测试。
5. 其余验收命令（test:witness:determinism、oracle:diff:witness、npm test 543/543、trigger 40/40、jobs 48/48、checks 46/46、s0:oracle）均一次通过，无实现修复。
