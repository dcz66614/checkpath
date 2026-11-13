# P020 FIX-P0-01 — 任务报告：unsupported_job 打通正式管线

- **任务：** FIX-P0-01（T013 NOT PASS 的 P0-1 修复；另含根因相关的 P2-9 部分与 P2-10，以及 P2-2 的根因背景处理）
- **执行者：** 修复执行者，全新独立会话，与 T013 审查者隔离
- **基线：** commit `dcd80d7`（T013 NOT PASS，工作树 clean，仅 `reports/` 未跟踪目录为任务开始前已存在）
- **日期：** 2026-11-08
- **结论：PASS — P0-1 已修复，全部验收命令通过**

## 1. 缺陷与根因（与审查者一致，已亲自复现）

`src/core/job-dag.ts` 的 `evaluateJobsKeyed`（原 :455-472）在重建 job 时只保留
`{id, name, needs, if}`，丢弃 `unsupported_job`。`evaluateJobs()` 在正式报告路径
（`buildReport` → `runFormalPipeline` → `evaluateJobsForTrigger` →
`evaluateJobsKeyed`）上因此永远看不到该字段，尽管 `evaluateJobs()` 本身在
:319（reusable_workflow）与 :327（matrix）能正确处理；`workflow-ir.ts:117`
也正确地把该字段带入 IR。UI worker（`src/worker/analysis.worker.ts`）同样走
`buildReport`，同样受影响。

根因之二：全部差分测试只跑 `evaluateE2E()`（其 `extractJobs` 保留
`unsupported_job`），且 `scripts/oracle-diff.mjs` 的 `falsePassCount` 只按
Oracle 报告算、不按 TS 报告算，所以绿灯套件看不见产品路径的 false PASS。

## 2. 修复（只改 P0-1 及上述根因项）

### 2.1 核心修复 — `src/core/job-dag.ts`（9 行）

`evaluateJobsKeyed` 的 job 重建中增加一行：

```ts
unsupported_job: job.unsupported_job ?? null,
```

`evaluateJobs()` 本身未动，不改变任何其他判定语义：`unsupported_job` 的
UNKNOWN 判定（含“可判定跳过优先”——`if: false`、无 `always()` 的 skipped
need 仍为 SKIPPED）沿用 ADR-04 已有的 `evaluateJobs()` 逻辑；普通 job
（`unsupported_job: null`）行为不变。

### 2.2 正式管线差分测试 — `tests/unit/cli/formal-pipeline-unsupported.test.ts`（新增，162 个测试）

对套件内**每一个** fixture（默认 golden 80，含 G-79/U-07 与 G-80/U-08）跑
`buildReport()`（CLI 与 UI worker 共用的正式入口），并逐字段比对：

- job_evaluations（`workflow_path`/`job_id`/`context`/`status`/`reason`）≡
  frozen Oracle `expected.json` 的 jobs；
- required_check_results（共享子集 `context`/`provider_count`/
  `provider_job_id`/`reason`/`status`）≡ expected 的 required_checks；
- `exitCodeForReport()` ≡ 按 §4.7 由 expected check 状态推导的退出码；
- 两路一致锁（P2-2）：同一 fixture 的正式管线 job/check 行 ≡
  `evaluateE2E()` 的对应行；
- 另有 G-79/G-80 两个单点 probe 测试（含 witness 为 `unsupported_feature` /
  `provider_unknown` 的断言）。

scenario 经 `validateScenario()`（与 CLI 相同；它把 push 场景缺失的可选字段
归一为 null，否则 `buildReport` 的 canonical-JSON 哈希会在 `undefined` 上抛
错）；required-check 条目直接以 fixture 原值传入（见 §5 ADR-03：不经过 CLI
的 duplicate-context 校验器，那是 P1-1 的范围）。

`CHECKPATH_FORMAL_DUMP_DIR` 置位时，每个 fixture 的正式管线 job/check 行以
`<id>.json` 写出，供 `oracle-diff.mjs` 计算 TS 侧 false-pass 数（§2.4）。
`CHECKPATH_E2E_SUITE` 可覆盖套件（与 golden 测试相同约定）；G-79/G-80
单点测试在无此二 fixture 的套件（如 S0 套件）下自动 skip。

**复现证明（先失败、再通过）：** 修复前状态（`git stash` 仅 `job-dag.ts`）
跑该文件：G-79 的 3 个测试失败（`formal-test-prefixed.log`，3 failed /
159 skipped）；修复后 162/162 通过。另见 §3 的 probe 前后对比。

### 2.3 发布门禁 smoke — `scripts/release-verify.mjs`（P2-9 的一部分）

`cliSmoke()` 新增两个用例（`stageUnsupportedFixture()` 把 frozen fixture
搭成临时 repo + scenario + required-checks.yml）：

- `analyze U-07 matrix job`：须 exit 2，job `test` UNKNOWN /
  `unsupported_matrix`，check UNKNOWN / `provider_unknown`；
- `analyze U-08 reusable-workflow job`：须 exit 2，job `call-reusable`
  UNKNOWN / `unsupported_reusable_workflow`，check UNKNOWN /
  `provider_unknown`。

**复现证明：** 修复前状态跑 `npm run release:verify` → exit 1，
`FAIL analyze U-07 matrix job: exit 0 … job test ELIGIBLE/eligible, check
REPORTABLE_PENDING/provider_reportable`，U-08 同理
（`release-verify-prefixed.log`）。修复后 `release:verify PASS`，两用例均
PASS（§4）。

### 2.4 TS 侧 false-pass 检测 — `scripts/oracle-diff.mjs`（P2-10）

- 新增 `formalFalsePassCount(formalReports, expected)`：与既有
  `falsePassCount` 完全相同的定义（required check 被报为
  `REPORTABLE_PENDING` 而 frozen expected 为其他状态，按 manifest
  index 逐行比对），但**按正式管线（buildReport）的 TS 报告算**，不是按
  Oracle 报告算。
- `runSuite()` 增加 `runFormalTs()`：跑上述正式管线差分测试并以
  `CHECKPATH_FORMAL_DUMP_DIR` 收 dump；报告新增字段
  `ts_formal_false_pass_count`、`ts_formal_false_pass_details`、
  `formal_pipeline_fixtures_checked`、`formal_typescript_exit_code`，
  控制台新增 `TS formal-pipeline false PASS: N` 一行；`--suite` 的
  ok 条件增加 `formal.exit === 0 && formalFalsePass.count === 0`。
  正式 vitest 失败时仍读取已写出的 dump（测试先写 dump 再断言），使
  count 能报出真实数字而不是 -1。
- S0 门禁条件 c6 扩展为 Oracle 侧与 TS 正式侧 count **均为 0**。修复后两者
  均为 0，c6 取值不变，因此 `gate_report_sha256` 不变（§4 验证：
  仍为 `f511a847…`）。

**复现证明：** 修复前状态跑 `npm run test:oracle` → exit 1，
`false PASS: 0`（Oracle 侧）但 `TS formal-pipeline false PASS: 2`
（G-79、G-80，均为 expected UNKNOWN / got REPORTABLE_PENDING /
`provider_reportable`）（`test-oracle-prefixed.log`）。修复后 exit 0，
两数均为 0（80 个 fixture 全查）。

### 2.5 两路关系 — `src/core/e2e.ts` 注释改写（P2-2，不留一句“已知”）

未做统一重构（见 §5 ADR-02），改为**明确分工 + 测试锁定**：

- `e2e.ts` 是 S0 / Oracle-parity 管线：走未 key 化的单 workflow 核心
  `evaluateJobs` + 按 evaluation 对象做 per-provider 解析，因为 Reference
  Oracle 对照的正是该报告形态（`checkpath.e2e-report/v1`，含 trigger IR）。
  其固有限制仍在：同一 `job_id` 出现在两个 workflow 且触发结果不同时无法
  区分（S0 fixture 以不同 job id 规避，如 E2E-19 的 test-a / test-b）。
- 正式产品管线是 `buildReport()` → `runFormalPipeline()` →
  `evaluateJobsForTrigger()` / `evaluateJobsKeyed()`，按
  `(workflow_path, job_id)` key 化，能区分上述情况；CLI 与 UI worker 均走
  此路。
- 两路不得漂移：§2.2 的差分测试对全部 80 个 golden fixture 锁定“正式管线
  job/check 行 ≡ Oracle expected ≡ `evaluateE2E()` 行”，含
  `unsupported_job` 在内。P0-1 正是两路曾经不一致的实例，本次以该测试锁死。

## 3. Probe 前后对比（shipped `dist/` CLI，`npm run build` 后实测）

输入：`tests/fixtures/unsupported/U-07-matrix-job/`（G-79）与
`U-08-reusable-workflow-job/`（G-80），workflow 拷为
`repo/.github/workflows/ci.yml`，scenario 与 required-checks 原样
（required-checks JSON→YAML 同条目）。完整日志：
`test_logs/probe-before-U-0{7,8}-cli.log` /
`test_logs/probe-after-U-0{7,8}-cli.log`。

| | 修复前（基线 dcd80d7） | 修复后（本次 commit） |
|---|---|---|
| U-07 job `test` | ELIGIBLE / `eligible` | **UNKNOWN / `unsupported_matrix`** |
| U-07 check `unit-tests` | REPORTABLE_PENDING / `provider_reportable` | **UNKNOWN / `provider_unknown`** |
| U-07 exit | 0（false PASS） | **2**（§4.7 UNKNOWN 档） |
| U-07 `report_sha256` | `11f5523cb5e2164651da5289ee7a6e34074a451aa7d10c2589e47fad05a18cbd`（与 T013 审查一致；已独立重算吻合） | `59fb7bf4ddea3b5391ccc46a81e2a5c29e08469cef1271c0ab31ffc7386f5016`（已独立重算吻合） |
| U-07 witnesses | 0 | 1（`unsupported_feature` / `provider_unknown`，note 点名 `unsupported_matrix`） |
| U-08 job `call-reusable` | ELIGIBLE / `eligible` | **UNKNOWN / `unsupported_reusable_workflow`** |
| U-08 check `unit-tests` | REPORTABLE_PENDING / `provider_reportable` | **UNKNOWN / `provider_unknown`** |
| U-08 exit | 0（false PASS） | **2**（§4.7 UNKNOWN 档） |
| U-08 `report_sha256` | `d4b4cad7339a929b625395220c2e37176cd5a6077e7d12fdbd3ca4c183983a33`（与 T013 审查一致；已独立重算吻合） | `4b9d167b806d0d73868d3f509c808da325776229ebb2f2947bc4d2279324ec46`（已独立重算吻合） |
| U-08 witnesses | 0 | 1（`unsupported_feature` / `provider_unknown`，note 点名 `unsupported_reusable_workflow`） |

退出码说明（PROJECT_BOOK §4.7）：修复后两 probe 的 check 均为 UNKNOWN，
UNKNOWN 档退出码为 **2**（PENDING_NOT_REPORTED / AMBIGUOUS / UNKNOWN → 2；
REPORTABLE_PENDING → 0；INVALID → 3）。修复前 exit 0 是 false PASS 本身；
修复后 exit 2 是正确的门禁拦截信号。

注：`unsupported_features: []` 修复前后未变——Oracle 的 frozen expected
同样为 `[]`；不支持的语义由 job reason（`unsupported_matrix` /
`unsupported_reusable_workflow`）与 witness note 点名，不是该数组的职责。
README“matrix/`uses:` → UNKNOWN”一句修复后已为真，无需改动（P2-8 的该部分
随本次修复解决；duplicate context → AMBIGUOUS 一句仍属 P1-1 范围，未动）。

## 4. 验收（全部亲自跑，逐项结果；日志在 `test_logs/`）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm test` | 0 | 30 个文件，**835/835**（基线 673 + 本次新增 162） |
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | clean（见注：验收 battery 中首次 lint 报 1 个 `no-useless-assignment`，系本次新增的 `catch { formalReports = {}; }`；已改为保留初值并加注释，当场重跑 lint exit 0，日志为 `lint-final.log`，失败版保留为 `lint-before-fix.log`） |
| `npm run test:oracle` | 0 | 80/80，0 mismatches，false PASS 0，**TS formal-pipeline false PASS 0**（80 个 fixture 全查），unsupported UNKNOWN 19/19 |
| `npm run test:property -- --seed 20261108 --count 1000` | 0 | 1000 cases，0 mismatches，false PASS 0 |
| `npm run test:mutation` | 0 | 13/13 |
| `npm run test:e2e` | 0 | 8/8 |
| `npm run test:offline` | 0 | offline PASS；strace 0 network syscalls；静态扫描 31 文件 0 远程引用 |
| `npm run test:performance` | 0 | performance PASS；P95 679.4 ms（≤1000），peak RSS 101.5 MiB（≤256） |
| `npm run build` | 0 | clean |
| `npm run release:verify` | 0 | PASS；含新增 U-07/U-08 smoke（exit 2，job+check UNKNOWN），2-build determinism、hash 重算、离线扫描 34 文件、license guard 均 PASS |
| `npm run oracle:diff:trigger` | 0 | 41/41，0 mismatches |
| `npm run oracle:diff:jobs` | 0 | 48/48，0 mismatches |
| `npm run oracle:diff:checks` | 0 | 46/46，0 mismatches |
| `npm run oracle:diff:witness` | 0 | 44/44，0 mismatches |
| `npm run s0:oracle` | 0 | 24/24，false PASS 0，**TS formal false PASS 0**（24 个 fixture），unsupported UNKNOWN 2/2 |
| `npm run s0:gate` | 0 | **S0_GATE PASS**；100 runs，1 hash，`gate_report_sha256 f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386` **不变**；8 个条件全 true（含已扩展的 c6） |

另：正式管线差分测试单跑 162/162（`formal-test-final.log`）。

## 5. 契约决策（ADR 形式）

### ADR FIX-P0-01/01 — 只补字段，不改判定语义

`evaluateJobsKeyed` 只补传 `unsupported_job`，`evaluateJobs()` 的
ADR-04 判定逻辑（UNKNOWN 时机、可判定跳过优先）一字不动。理由：判定逻辑
本身在 e2e 路径与 Oracle 上已被 80 golden + 1000 property 锁定为正确，
缺陷只是正式路径丢字段；改判定逻辑只会扩大 blast radius。

### ADR FIX-P0-01/02 — 两路明确分工，不统一重构

`e2e.ts`（S0/Oracle-parity 形态）与正式管线（key 化产品形态）保持两路，
分工写进 `e2e.ts` 注释，以 §2.2 的全量两路一致测试锁定。理由：把
`evaluateE2E` 重构成正式管线会改变 `checkpath.e2e-report/v1` 形态
（trigger IR 等 Oracle 对照字段），风险远大于收益；两路一致有测试锁，
分叉不再是无声漂移。

### ADR FIX-P0-01/03 — TS 侧 false-pass 数与 Oracle 侧同定义、只看 check 层

`formalFalsePassCount` 与 `falsePassCount` 同定义（REPORTABLE_PENDING vs
非 REPORTABLE_PENDING expected，按 manifest index 比对），只看 check 层。
理由：job 层 ELIGIBLE 而 expected UNKNOWN 时，经 resolver 必然对应 check
层 REPORTABLE_PENDING vs UNKNOWN，check 层已能抓住；与既有口径一致，
门禁数字可比。Gate 失败条件为“任一侧 > 0”。

### ADR FIX-P0-01/04 — 正式管线测试不经过 CLI 的 duplicate-context 校验器

测试把 required-check 条目以 fixture 原值直接传给 `buildReport`，不经过
`loadRequiredChecks()` 的 `duplicate_value` 校验。理由：该校验器拒绝
duplicate context 是 T013 P1-1 的独立缺陷（待另任务裁决 T005 校验契约与
T008 解析语义的冲突）；本测试锁定的是正式管线本身，经校验器会把两个
缺陷混为一谈。G-57（duplicate context）在本测试中仍按 T008 语义通过，
与 e2e 路径一致。

### ADR FIX-P0-01/05 — c6 扩展但 gate hash 不变是刻意设计

c6 改为要求 Oracle 侧与 TS 正式侧 false-pass 数均为 0；修复后两者均为 0，
c6 取值与 `S0_GATE.json` 其余内容不变，故 `gate_report_sha256`
`f511a847…` 不变。理由：S0 门禁哈希是冻结证据，修复本身不应改写它；
新检测的效力由 `test:oracle` / `s0:oracle` 的新字段与修复前复现（§2.4）
证明。

## 6. 未改动项（核查）

- P1-1（`validate.ts duplicate_value`）未碰；P2-1/P2-3/P2-4/P2-5/P2-6/
  P2-7/P2-8 其余部分未碰（README 一字未改，见 §3 注）；P2-2 只改了
  `e2e.ts` 的 stale 注释与分工说明（根因背景处理，见 §2.5）。
- 未改 S0 fixtures、S0 证据文件、规格文件：
  `P020_PROJECT_BOOK.md` SHA-256 `028c24720e0780542217719f6e9b14c0fe22b31b79c662520441c2116262b8de`、
  `P020_IMPLEMENTATION_PLAN.md` SHA-256 `bb645205174eca1d111687928c41505407392d0eefd1281455a776273aaa1e0e`，均不变。
- Python Oracle 核心算法未动；无阈值放宽、无夹具删除、无 Oracle 预期修改。
- 零真人参与；无具体许可证名称写入任何文件；`LICENSE_STATUS.md` 仍为
  `PENDING_SAM_DECISION`（`release:verify` license guard PASS）。
- 无网络访问、无 GitHub API、无 Token；全部合成数据。
- 测试运行改写的生成物（`evidence/tests/PERFORMANCE_REPORT.*`、
  `evidence/tests/RELEASE_VERIFY_REPORT.json`、
  `evidence/tests/ORACLE_PARITY_REPORT.json`、
  `evidence/s0/S0_ORACLE_REPORT.json`、8 个 e2e `trace.zip`）已用
  `git checkout -- evidence/` 还原，**未纳入本次 commit**；任务开始前已存在
  的未跟踪 `reports/` 目录未纳入提交、未动。

## 7. 证据路径

- 本报告：`handoff/P020-FIX-P0-01/TASK_REPORT.md`
- 变更文件：`handoff/P020-FIX-P0-01/changed_files.txt`
- 测试命令：`handoff/P020-FIX-P0-01/test_commands.txt`
- 测试日志：`handoff/P020-FIX-P0-01/test_logs/`（probe 前后、修复前后复现、
  全部验收命令）
- 文件哈希：`handoff/P020-FIX-P0-01/sha256.txt`
- 未决项：`handoff/P020-FIX-P0-01/unresolved_items.md`
- 审查依据：`evidence/review/INDEPENDENT_REVIEW.md` §P0-1/§P2-9/§P2-10、
  `evidence/review/REVIEW_PACK_01.md` §1、PROJECT_BOOK §4.7（退出码）与 §3.4
  （unsupported 语义）

## 8. 改动文件

- `src/core/job-dag.ts` — 核心修复：`evaluateJobsKeyed` 补传 `unsupported_job`
- `tests/unit/cli/formal-pipeline-unsupported.test.ts` — 新增：正式管线差分测试（162）
- `scripts/release-verify.mjs` — 新增 U-07/U-08 smoke 用例（P2-9 部分）
- `scripts/oracle-diff.mjs` — 新增 TS 正式侧 false-pass 检测（P2-10），c6 扩展
- `src/core/e2e.ts` — 注释：两路分工说明（P2-2 根因背景处理）
- `handoff/P020-FIX-P0-01/` — 本 handoff 包
