# T010 — CLI 与自包含离线 HTML 报告 任务报告

- **项目：** P020 CheckPath
- **任务：** T010（实施计划 §6，S3 第二项）
- **Base commit：** `ea2120b`（T009 PASS，工作树 clean）
- **日期：** 2026-11-08（UTC）
- **结论：PASS — demo / analyze / matrix 三命令与离线 HTML 报告完成；验收命令全部按约定退出码执行；全量回归 570/570（T009 的 543/543 全部保持 + 新增 27）；四路 Oracle 差分 0 mismatch；S0_GATE 仍为 PASS（gate_report_sha256 不变，仍为 `f511a847…`）。前序未决项 T005 U-03、U-04、T006 U-02、T009-U03、T008-U02 全部在本任务内处理/关闭（见 §7）。**

## 1. 交付内容

| 文件 | 说明 |
|---|---|
| `src/cli/index.ts` | CLI 入口 `main(argv): Promise<number>`：demo / analyze / matrix / --help / --version；返回退出码而不直接 `process.exit`，便于测试进程内调用；未知命令与输入错误 exit 3 |
| `src/cli/commands/demo.ts` | `demo`：内置合成示例（workflow YAML、scenario、required-checks 均为嵌入常量，与 `examples/` 下文件逐字节/逐对象一致，测试锁定 demo 报告 == analyze 报告）；无需 Token、Docker、网络、真实仓库；默认写 `reports/demo` |
| `src/cli/commands/analyze.ts` | `analyze --repo --scenario --required-checks [--out] [--strict-skipped]`：读本地 `.github/workflows/*.yml\|*.yaml` + scenario JSON + required-checks YAML，写 `report.json` + `report.html`，默认 `--out reports/<scenario_id>` |
| `src/cli/commands/matrix.ts` | `matrix --repo --suite --required-checks [--out] [--strict-skipped]`：读 `checkpath.suite/v1` 套件（scenario 路径相对于套件文件），每 scenario 写 `<out>/<scenario_id>/report.json\|report.html`，再写聚合 `matrix.json` + `matrix.html`；退出码为各 scenario 最差值 |
| `src/cli/commands/common.ts` | 三命令共享：参数解析、repo 加载、scenario/required-checks 解析+验证（失败 exit 3，不写报告）、报告写盘、终端摘要 |
| `src/report/build.ts` | ReportV1 构建器：复用正式流水线（`runFormalPipeline` + `buildWitnesses`，零求值逻辑复制）投影为冻结 `checkpath.report/v1`；§8 四哈希计算与 `verifyReportHash` / `verifyReportHashes` 重算验证（T005 U-04）；`exitCodeForReport` / `exitCodeForStatus`（§4.7） |
| `src/report/json.ts` | 报告文件信封 `checkpath.report-file/v1`：`{report: ReportV1, recommendations: WitnessRecommendation[], diff_boundary, scenario}`；文件为 canonical JSON + 一个尾换行；`parseReportFileText` 重验证嵌入的 report 与 scenario，并校验每条 recommendation 的 `witness_id` 确实存在 |
| `src/report/html.ts` | 单文件离线 HTML 报告：内联 CSS + 内联 JS + 嵌入 JSON 数据块；零远程资源（测试断言无 `http(s)://`、`<link`、`<img`、`<script src`、`@import`/`url(`）；五大区域齐全；点击 required check 高亮 provider workflow/job；点击 workflow 过滤节点展开 patterns；点击 witness 切换缩减/原始 scenario 对照；UNKNOWN 显示具体不支持原因；全部用户字符串 HTML 转义；无自动修复写回按钮 |
| `src/report/matrix.ts` | `checkpath.matrix/v1` 聚合文档 + 单文件离线矩阵 HTML（required check × scenario 表，相对路径链接到各 scenario 的 report.html） |
| `src/ui/App.tsx`、`EventPath.tsx`、`WorkflowDag.tsx`、`RequiredCheckTable.tsx`、`WitnessPanel.tsx`、`main.tsx` | 离线报告浏览器 UI（React 19）：Summary + Event Path + Workflow/Job DAG + Required Checks + Witness；点击 check 行高亮 provider；witness 可切换缩减/原始对照；无报告时显示空态与生成命令；`main.tsx` 读 `window.__CHECKPATH_REPORT__` |
| `src/worker/protocol.ts`、`analysis.worker.ts` | Dedicated Worker 协议：`analyze-request` → `analyze-response`（ok / error），worker 内跑与 CLI 同一个纯 `buildReport`，无 I/O、无 fetch、无 DOM |
| `src/core/witness-reducer.ts` | 仅导出正式流水线：`runFormalPipeline` 与 `WorkflowEvidence` / `PipelineEvaluation` 类型（原内部 `evaluateAll` 改名导出，调用点同步改名）；求值逻辑一行未动 |
| `src/core/e2e.ts` | T005 U-03：删除内联 `canonicalJson` / `sha256Hex` 副本，改为 import 正式模块并 re-export（见 §2；S0 回归验证零行为变化） |
| `scripts/build-cli.mjs`、`tsconfig.cli.json` | `npm run build` 后半段：tsc（NodeNext）把 CLI 编译进 `dist/`，并写 `dist/checkpath.mjs` 启动器；`vite.config.ts` 补 `base: "./"` 使 dist 资源相对路径可离线打开；新增根 `index.html`（UI 入口） |
| `examples/repo-basic/.github/workflows/ci.yml` | 合成示例仓库：workflow `ci`，pull_request（branches main，paths `src/**`）+ push（branches main）；job `unit-tests` 与 `integration`（needs unit-tests） |
| `examples/required-checks.yml` | 合成清单：`unit-tests`、`integration`（github-actions） |
| `examples/scenarios/pr-docs-only.json` | PROJECT_BOOK §6.1 示例原文：PR-DOCS-ONLY，仅改 README.md + docs/guide.md |
| `examples/scenarios/pr-src-only.json` | PR-SRC-ONLY：仅改 `src/app.ts`（触发对照） |
| `examples/scenarios/merge-group.json` | MERGE-GROUP-01：merge_group/checks_requested，target main（缺失对照） |
| `examples/suites/merge-queue.json` | `checkpath.suite/v1`：merge-queue 套件，含上述三 scenario（相对路径） |
| `tests/unit/cli/report-builder.test.ts` | 8 个测试：demo 构建、schema 自验证、确定性、四哈希重算、§4.7 退出码、src-only 对照、T006 U-02 口径、T005 U-03 重导出一致 |
| `tests/unit/cli/report-html.test.ts` | 8 个测试：信封往返与拒绝、HTML 五区域与零远程资源、HTML 转义防注入、UNKNOWN 原因文本、矩阵聚合与矩阵 HTML |
| `tests/unit/cli/cli-commands.test.ts` | 7 个测试：help/version/未知命令、analyze（exit 2 / exit 0）、demo == analyze、matrix 全套件、输入错误 exit 3 且不写报告、缺失必填 flag |
| `tests/unit/cli/ui-worker.test.tsx` | 4 个测试：App 五区域渲染与空态、worker 协议守卫与 `handleRequest` 回复 == CLI 报告 |
| `evidence/tests/T010_REPORT.md` | 本报告 |

未修改：核心语义契约（types.ts、validate.ts、event-evaluator、job-dag、if-subset、check-resolver 的判定逻辑）、Oracle 算法（`oracle/` 未动）、S0 fixtures、全部已提交 S0 证据文件（见 §6）、规格文件（SHA-256 见 §6）、LICENSE（仍为 `PENDING_SAM_DECISION`，未出现任何许可证名称）。

## 2. 契约决策（写在代码头注释与测试中）

**报告构建 = 投影，不求值。** `buildReport` 只调用 `runFormalPipeline`（witness-reducer.ts 导出的正式流水线）与 `buildWitnesses`，把结果投影为 ReportV1 行与 §8 哈希；模块内无任何触发/Job/check 判定逻辑。`validateReport` 自检 + `verifyReportHash` 自检失败时构建器抛错（这是构建器 bug，不是输入问题）。

**哈希口径（§8，`src/report/build.ts` 头注释）：**
- `workflow_set_sha256` = 按 path 排序的 `[{path, yaml}]` 的 canonical SHA-256；
- `required_checks_sha256` = 已验证 RequiredChecksV1 对象的 canonical SHA-256；
- `input_sha256` = `{required_checks, scenario, workflows: [{path, yaml}]}` 的 canonical SHA-256——与 S0 e2e 管道相同的输入对象形状，但用**已验证**的 scenario / required-checks 对象（而非原始对象），因此哈希是“实际用于构建报告的归一化输入”的函数；复算方法：解析同一批文件 → `validateScenario` / `validateRequiredChecks` → 按上述形状 canonical 哈希（见 §4 第 4 项的独立复算）；
- `report_sha256` = **去掉自身字段后**的 canonical 报告哈希（字段是省略而非置空；置空会哈希成另一份文档）。

**T005 U-04（report_sha256 重算验证，关闭）：** `verifyReportHash(report)` 去掉 `report_sha256` 字段重算并比对；`verifyReportHashes(input, report)` 重算全部四哈希。构建器每次构建后自检；CLI 测试与独立 dist 复算双重锁定（见 §4）。

**T005 U-03（e2e.ts 内联副本，关闭）：** 删除 `e2e.ts` 内 29 行内联 `canonicalJson` / `sha256Hex`，改为 import 正式模块并 re-export（既有导入方不受影响）。验证：`typecheck` 通过、`s0:oracle` 24/24、`npm test` 543/543 在改动后一次通过，零行为变化（改动中途一次编辑失误多写了一行重复声明，见 §8 第 1 项，已修复并重跑全部回归）。

**退出码（§4.7）：** INVALID → 3；PENDING_NOT_REPORTED / AMBIGUOUS / UNKNOWN → 2；SKIPPED_SUCCESS → 0，`--strict-skipped` 时 → 2；REPORTABLE_PENDING → 0；取各 check 最差值。输入/用法错误（缺文件、解析失败、验证失败、未知命令/flag）→ 3 且不写报告。`demo` 同样执行 gate 退出码：内置 docs-only 场景两 check 均为 PENDING_NOT_REPORTED，故 demo 退出 **2**——这是 gate 正常工作，不是 demo 失败；demo 摘要与本报告均明说这一点。`matrix` 退出码为各 scenario 退出码的最差值。

**报告文件是信封，不是裸 ReportV1。** ReportV1 是冻结 schema（`validateReport` 拒绝未知字段），平行建议列表（T009-U03）与展示层 diff-boundary 标注都不能塞进报告对象；CLI 写的文件是 `checkpath.report-file/v1` 信封：`{report, recommendations, diff_boundary, scenario}`，其中 `scenario` 供 HTML witness 视图对照原始输入，无需重读 scenario 文件。

**T006 U-02（截断标注口径，关闭——未改任一实现，故不走 ADR）：** Oracle 的 e2e `diff_boundary` 在确认截断时报 null，正式层 `annotateDiffBoundary` 报 `first_3000_truncated`。决定：ReportV1（§6.3 冻结）**没有** `diff_boundary` 字段，T010 不新增、不把任一取值抄进 JSON——截断效应已编码在各 workflow 的 `event_evaluations`（path_match / reason）中；HTML 报告以展示层标注形式显示正式层取值（`first_3000_truncated`），并明确标注为“报告层标注，非 ReportV1 字段、不参与 Oracle 对照”。Oracle 形状零改动，两处措辞不再可能在 JSON 中混淆。测试锁定：确认截断场景 `diffBoundary === "first_3000_truncated"` 且报告对象无 `diff_boundary` 属性，且 `path_match === false` / `reason === "path_mismatch"`。

**T009-U03（平行建议列表，关闭）：** 建议以 `WitnessRecommendation[]` 平行列表输出，以 `witness_id` 关联；JSON 信封与 HTML 均按此结构；`ReportWitness` 形状未变。`witness-001…` 编号只在单 case 内按 manifest 顺序从 001 起编，跨 case 不保证全局唯一（沿用 T009 口径）。

**T008-U02（keyed 三字段，关闭）：** 报告构建采用 `KeyedRequiredCheckResult`：`provider_workflow_path` / `provider_key` / `provider_keys` 中，ReportV1 的 `required_check_results` 只取 `provider_workflow_path`（该字段本就是 ReportV1 冻结形状的一部分）；`provider_key` / `provider_keys` 不进报告 JSON、不进 Oracle 对照形状；HTML 高亮用 `provider_workflow_path` + `provider_job_id` 定位 provider，不依赖 key 字符串。

**Demo 与示例文件同一性：** `demo.ts` 的嵌入常量与 `examples/` 文件逐字节/逐对象一致（workflow YAML 字符串逐字节一致；scenario 与 required-checks 为同一已验证对象）；测试锁定 demo 报告 == analyze 报告（report 对象、recommendations、report_sha256 全部相等）。

**构建链（计划 §7 脚本说明）：** `npm run build` 仍为 `vite build && node scripts/build-cli.mjs`（脚本名与顺序未变）；新增的 `scripts/build-cli.mjs` 是该脚本原本缺失的后半段实现（此前仓库中不存在此文件，`npm run build` 在 T010 前无法完成），用 tsc（`tsconfig.cli.json`，NodeNext）编译 CLI 并写 `dist/checkpath.mjs` 启动器。`vite.config.ts` 仅补 `base: "./"`；UI 入口 `index.html` 为新增文件。以上均非计划 §7 所列脚本名的改动。

## 3. 示例与矩阵结果

| Scenario | 事件 | workflows 触发 | required checks | 退出码 | report_sha256 |
|---|---|---|---|---|---|
| PR-DOCS-ONLY | pull_request/synchronize，仅改 README.md + docs/guide.md | 0/1（paths `src/**` 未命中） | unit-tests、integration 均为 PENDING_NOT_REPORTED；witness 2 个（path_filter / path_mismatch，R-PATH-01） | 2 | `9dc3af31…` |
| PR-SRC-ONLY | pull_request/synchronize，仅改 `src/app.ts` | 1/1 | 均为 REPORTABLE_PENDING；witness 0 | 0 | `32d20af3…` |
| MERGE-GROUP-01 | merge_group/checks_requested，改 `src/app.ts` | 0/1（workflow 未声明 merge_group） | 均为 PENDING_NOT_REPORTED；witness 2 个 | 2 | `efc6a6d4…` |

矩阵 `merge-queue`：3 scenarios 全覆盖；unit-tests 与 integration 在三场景下的状态分别为 PENDING / REPORTABLE / PENDING；矩阵退出码 2（最差值）。demo 报告与 analyze（pr-docs-only）报告的 `report_sha256` 均为 `9dc3af313677f795b3a836d9074833c9cfd2bf190d5e2201b7a99b08a23375b7`。

## 4. 验收命令（真实运行）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run typecheck` | 0 | `tsc --noEmit` 通过 |
| `npm run build` | 0 | vite build（32 modules）+ `dist/checkpath.mjs` 已写 |
| `node dist/checkpath.mjs demo` | **2（约定）** | PR-DOCS-ONLY，2 checks PENDING_NOT_REPORTED，2 witnesses，`report_sha256 9dc3af31…`；exit 2 为 §4.7 gate 结果，见 §2 |
| `node dist/checkpath.mjs analyze --repo examples/repo-basic --scenario examples/scenarios/pr-docs-only.json --required-checks examples/required-checks.yml --out reports/pr-docs-only` | **2（约定）** | 同 demo 报告（同一 `report_sha256 9dc3af31…`），写 `reports/pr-docs-only/report.json` + `report.html` |
| `node dist/checkpath.mjs matrix --repo examples/repo-basic --suite examples/suites/merge-queue.json --required-checks examples/required-checks.yml --out reports/merge-queue` | **2（约定）** | 3 scenarios 全跑（PR-DOCS-ONLY exit 2、PR-SRC-ONLY exit 0、MERGE-GROUP-01 exit 2），矩阵 exit 2；写每 scenario 报告 + `matrix.json` + `matrix.html` |
| `npm run lint`（回归） | 0 | `eslint src tests scripts` 通过 |
| `npm test`（回归） | 0 | 26 个文件，**570/570 通过**（T009 的 543/543 全部保持 + 新增 27） |
| `npm run oracle:diff:trigger`（回归） | 0 | 40/40，mismatch 0 |
| `npm run oracle:diff:jobs`（回归） | 0 | 48/48，mismatch 0 |
| `npm run oracle:diff:checks`（回归） | 0 | 46/46，mismatch 0 |
| `npm run oracle:diff:witness`（回归） | 0 | 44/44，mismatch 0 |
| `npm run s0:oracle`（回归） | 0 | 24/24 fixtures，mismatch 0，false PASS 0，unsupported→UNKNOWN 2/2 |
| `npm run s0:gate`（回归） | 0 | `evidence/S0_GATE.json` status 仍为 `PASS`，`gate_report_sha256` 仍为 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`，100 次确定性 1 个哈希 |

日志：`handoff/P020-T010/test_logs/`（各命令完整输出）。

**独立复算（不用 vitest，用已构建的 dist 产物重算）：** 解析 `examples/` 三个输入文件 → validate → `buildReport`，重算的 `report_sha256` 为 `9dc3af31…`，与磁盘上的 `reports/pr-docs-only/report.json` 完全一致；`verifyReportHashes` 四项全为 true；canonical JSON 下报告对象与 recommendations 与磁盘文件逐字节等价（`JSON.stringify` 直接比会因键顺序误报不等，必须用 canonical JSON 比——复算时已按此口径）。HTML 内联 `<script>` 另经 `node --check` 语法检查通过。

## 5. 通过标准逐项核对

- Demo 无需 GitHub Token、Docker、网络和真实仓库：是，demo 只读嵌入常量；全程无网络调用、无文件读取（除写出报告外）。
- `analyze` 输出 JSON + 单文件 HTML：是，`report.json`（`checkpath.report-file/v1` 信封）+ `report.html`。
- `matrix` 对 suite 内所有 scenario 输出聚合矩阵：是，3/3 scenarios，`matrix.json` + `matrix.html`（check × scenario 表）。
- 页面包含 Event Path、Workflow/Job DAG、Required Checks、Witness：是，HTML 与 React UI 均含五区（另有 Summary 与 Export）；测试逐项断言。
- 点击 required check 可高亮 provider path：是，HTML（vanilla JS，`data-provider-workflow` / `data-provider-job`）与 React UI（`onSelect` → DAG 高亮）均实现；测试断言行上带有 provider 属性。
- HTML 无 CDN/远程资源：是，测试断言无 `http(s)://`、`<link`、`<img`、`<script src`、`@import`/`url(`；矩阵 HTML 同样断言。
- exit codes 0/2/3 符合项目书：是，§4.7 全表测试锁定；demo/matrix 的 2 均为约定值（见 §2 与 §3）。
- 示例输入与报告 hash 可复算：是，四哈希重算测试 + §4 独立 dist 复算。

## 6. S0 证据完整性

回归前对 `evidence/` 全部 45 个文件取 SHA-256 快照（`/tmp/t010-evidence-before.txt`）；回归后复核：

- `npm run s0:oracle` 与 `npm run s0:gate` 重新生成了 `evidence/s0/S0_ORACLE_REPORT.json`、`S0_DETERMINISM_REPORT.json`、`evidence/S0_GATE.json`——复核结果为字节一致，`S0_GATE.json` status 仍为 `PASS`，`gate_report_sha256` 仍为 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`。
- `T006_ORACLE_TRIGGER_REPORT.json`、`T007_ORACLE_JOBS_REPORT.json`、`T008_ORACLE_CHECKS_REPORT.json`、`T009_ORACLE_WITNESS_REPORT.json` 回归复跑后字节一致。
- 唯一变化的是 3 个 gitignored 的 vitest 计时日志（`evidence/s0/logs/` 下，与 T005–T009 相同情况，不属于已提交的 S0 证据）；已提交的 S0 证据文件无任何字节变化。
- S0 fixtures 未动；规格文件未动：`P020_PROJECT_BOOK.md` SHA-256 `028c2472…`，`P020_IMPLEMENTATION_PLAN.md` SHA-256 `bb645205…`（与立项记录一致）。
- 新增证据文件仅本报告。`reports/`（demo/analyze/matrix 的生成输出）未提交：它是可一键再生成的运行输出，不是源码/证据；验收日志在 `handoff/P020-T010/test_logs/` 中留存。

## 7. 未决项（见 `handoff/P020-T010/unresolved_items.md`）

1. **已关闭（本任务）：** T005 U-03（e2e 内联副本）、T005 U-04（report_sha256 重算）、T006 U-02（截断标注口径）、T009-U03（平行建议列表）、T008-U02（keyed 三字段）——处理方法见 §2。
2. **结转（不由本任务解决）：** T008-U01（空值事件分歧，待 T011/ADR）；T006 U-03（complete: false 不参与判定，改语义需 ADR）；T009-U01（冻结 `WITNESS_KINDS` 缺通用事件触发缺失 kind，需 ADR）。以上三项均未动相关文件。
3. **规范层面无未决项：** 本次未发现规格错误，因此未按“发现规范错误先停下”的规则停下；以上均为工程归属/口径事项与已结转项。

## 8. 修复记录（诚实说明）

1. **e2e.ts 编辑失误（U-03 实施中）：** 删除内联函数的一次编辑误把 `const JOB_STATUSES = [` 写进了替换文本，导致 `typecheck` 报 TS1137，且随后 `s0:oracle` 的 TS 侧 exit 1（Oracle 侧仍 exit 0，mismatch 0——该次运行不等同于回归通过）。修复：恢复被误删的 job-extraction 注释头，删除重复声明行；重跑 typecheck、s0:oracle、`npm test` 543/543 全过。教训：大段删除编辑后立即跑 typecheck 再跑回归，不得先跑重型回归。
2. **UI 测试初版 2 失败（测试写法问题，实现无误）：** `ui-worker.test.tsx` 初版直接调用 `App({data})` 函数，导致 hooks 在 React dispatcher 之外执行（`Cannot read properties of null (reading 'useState')`）。修复：测试改用 JSX `<App data={...} />` 经 `renderToStaticMarkup` 渲染；复跑后 27/27。
3. **Lint 警告 1 项（已修）：** `report-builder.test.ts` 一处无用的 eslint-disable 指令（`no-require-imports` 未触发），删除后 lint 0 错误 0 警告。
4. **HTML 注入测试的 YAML 写法：** 初版用双引号 YAML 字符串含 `"` 导致解析歧义，改为单引号 YAML 字符串后通过；实现（escapeHtml）本身未改。
5. 其余验收命令（typecheck、lint、build、demo、analyze、matrix、npm test、四路 Oracle 差分、s0:oracle、s0:gate）均一次通过，无实现修复。
