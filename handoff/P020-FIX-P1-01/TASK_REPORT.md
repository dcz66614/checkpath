# P020 FIX-P1-01 — 任务报告：duplicate-context 契约对齐

- **任务：** FIX-P1-01（T013 NOT PASS 的 P1-1 修复；另含相关的 P2-8 余部与 P2-9 余部）
- **执行者：** 修复执行者，全新独立会话，与 T013 审查者及 FIX-P0-01 执行者隔离
- **基线：** commit `d961135`（FIX-P0-01 PASS，工作树 clean，仅 `reports/` 未跟踪目录为任务开始前已存在）
- **日期：** 2026-11-08
- **结论：PASS — P1-1 已修复，全部验收命令通过**

## 1. 缺陷与根因（与审查者一致，已亲自复现）

`src/core/validate.ts:621` 的 `validateRequiredChecks()` 拒绝任何重复
`context`（`duplicate_value`）；CLI `analyze` 经 `loadRequiredChecks()`
遇 T8-05 的 manifest（同一 context `unit-tests` ×3，来源
`github-actions` / `external-app` / `""`，另加 `ghost` 与 `lint`）→
校验错误、exit 3、无报告。但 T008 的 resolver 按逐条解析锁定 duplicate
context（T8-05、T8-10），Oracle 也接受；golden G-57 就是 T8-05 的副本——
CLI 无法端到端分析项目自己的 golden 夹具。T005 的 duplicate 拒绝契约
与 T008 的 resolver 语义从未对齐。

**复现证明（修复前，`npm run build` 后 shipped `dist/` CLI）：**
T8-05 manifest（JSON→YAML 逐字转换，见 REVIEW_PACK_01 §2，`source: ""`
保留为空字符串）→
`error: required-checks file failed validation … $.required_checks[1].context: duplicate_value … [4] …`，
**exit 3**，无报告（`test_logs/probe-before-cli.log`）。同期 U-07/U-08
probe 仍为 P0 修复后的正确结果（job UNKNOWN、check UNKNOWN、exit 2，
哈希与 FIX-P0-01 报告一致，见 §3）。

## 2. 修复（只改 P1-1 及上述相关项）

### 2.1 核心修复 — `src/core/validate.ts` + `src/core/types.ts`（ADR FIX-P1-01/01，选 (a)）

`validateRequiredChecks()` 删除 duplicate-context 拒绝（`seen` 集与
`duplicate_value` issue）；`validate.ts` 头注释的 `duplicate_value`
清单与 `types.ts` 的 `RequiredCheckEntry` 契约注释同步更新。
`duplicate_value` 仍适用于 job id、`on` 事件名、`needs` 条目——只放行
required-check context。

### 2.2 契约测试 — `tests/unit/validation/required-checks.test.ts`

T005 的“duplicate context → duplicate_value”测试改为：重复 context
被接受、按顺序原样保留（3 条，含不同 source）；新增 T8-05/G-57
manifest 逐字接受测试（5 条；无 source 的 `lint` 默认
`github-actions`；空字符串 source 原样保留 `""`）。

### 2.3 FIX-P0-01/04 绕过重审与移除 — `tests/unit/cli/formal-pipeline-unsupported.test.ts`（ADR FIX-P1-01/02）

`loadFixture()` 现把 required-checks 也走 `validateRequiredChecks()`
（与 CLI 的 `loadRequiredChecks()` 相同路径，与 scenario 的
`validateScenario()` 对称），FIX-P0-01/04 的绕过**已移除，无残留**：
测试不再“传原始条目绕过校验器”，G-57 走完整 CLI 验证路径。
另新增 G-57 单点 probe 测试：5 行逐条结果 ≡ frozen Oracle expected，
exit 2（§4.7 UNKNOWN 档）。

### 2.4 发布门禁 smoke — `scripts/release-verify.mjs`（P2-9 余部）

新增 `stageChecksFixture()`（与 `stageUnsupportedFixture()` 的区别：
`source` 字段只要在 fixture JSON 中出现就写入，含空字符串 `""`——
丢掉它会把该条目静默默认为 github-actions，使其 verdict 由 UNKNOWN
变为 REPORTABLE_PENDING）与 smoke 用例 `analyze T8-05 duplicate-context manifest`：
须 exit 2，job `test` ELIGIBLE/`eligible`，5 行 check 逐条等于 G-57
预期（顺序、status、reason 全比对）。

### 2.5 README — `README.md`（P2-8 余部）

§"Supported semantics" 的 `duplicate context → AMBIGUOUS` 一句改为：
duplicate manifest entries（同一 context 多次出现，可能不同 source）
按条目逐条解析、一行一个结果（manifest 顺序）；两个 PROVIDER 共享
同一 context（两个同名 job）→ `AMBIGUOUS`（`duplicate_context`）。
原句把“manifest 条目重复”与“provider 重复”混为一谈，正是 P1-1 的
文档侧根源。matrix/`uses:` 一句未动（FIX-P0-01 后已为真）。

## 3. Probe 前后对比（shipped `dist/` CLI，`npm run build` 后实测）

输入：`tests/fixtures/checks/T8-05-external-source/`（G-57 副本）与
`tests/fixtures/unsupported/U-07/U-08/`，workflow 拷为
`repo/.github/workflows/ci.yml`，scenario 与 required-checks 原样
（required-checks JSON→YAML 同条目，`source: ""` 保留）。完整日志：
`test_logs/probe-before-cli.log` / `test_logs/probe-after-cli.log`。

| | 修复前（基线 d961135） | 修复后（本次 commit） |
|---|---|---|
| T8-05 exit | 3（`duplicate_value`，无报告） | **2**（§4.7 UNKNOWN 档） |
| T8-05 job `test` | —（无报告） | **ELIGIBLE / `eligible`** |
| T8-05 checks（5 行） | — | **与 G-57 frozen expected 逐字段一致**：`unit-tests` REPORTABLE_PENDING/`provider_reportable`；`unit-tests` UNKNOWN/`external_source`；`ghost` UNKNOWN/`external_source`；`lint` PENDING_NOT_REPORTED/`no_provider`；`unit-tests` UNKNOWN/`external_source`（已用 python3 独立核对 `got == expected.required_checks`，True） |
| T8-05 `report_sha256` | — | `781098456ca6399183a89def05646893cd085165405219b7a26e3031f9674fbb` |
| U-07 job `test` / check | UNKNOWN/`unsupported_matrix` / UNKNOWN/`provider_unknown` | **不变** |
| U-07 exit / `report_sha256` | 2 / `59fb7bf4ddea3b5391ccc46a81e2a5c29e08469cef1271c0ab31ffc7386f5016` | **2 / 同哈希**（与 FIX-P0-01 报告一致，P0 未退化） |
| U-08 job `call-reusable` / check | UNKNOWN/`unsupported_reusable_workflow` / UNKNOWN/`provider_unknown` | **不变** |
| U-08 exit / `report_sha256` | 2 / `4b9d167b806d0d73868d3f509c808da325776229ebb2f2947bc4d2279324ec46` | **2 / 同哈希**（与 FIX-P0-01 报告一致，P0 未退化） |

## 4. 验收（全部亲自跑，逐项结果；日志在 `test_logs/`）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | clean |
| `npm test` | 0 | 30 个文件，**837/837**（基线 835 + 本次新增 2：G-57 probe 1、validation 新增净 1） |
| `npm run test:oracle` | 0 | 80/80，0 mismatches，false PASS 0，**TS formal-pipeline false PASS 0**，unsupported UNKNOWN 19/19 |
| `npm run test:property -- --seed 20261108 --count 1000` | 0 | 1000 cases，0 mismatches，false PASS 0 |
| `npm run test:mutation` | 0 | 13/13 |
| `npm run test:e2e` | 0 | 8/8 |
| `npm run test:offline` | 0 | offline PASS；strace 0 network syscalls；静态扫描 31 文件 0 远程引用 |
| `npm run test:performance` | 0 | performance PASS；P95 595.6 ms（≤1000），peak RSS 99.9 MiB（≤256） |
| `npm run build` | 0 | clean |
| `npm run release:verify` | 0 | PASS；含新增 T8-05 smoke（exit 2，五条逐条结果与 G-57 一致），U-07/U-08 smoke 仍 PASS，2-build determinism（dist tree sha256 `4e97973920ed5cb5…`，29 文件，两构建一致）、hash 重算、离线扫描 34 文件、license guard 均 PASS |
| `npm run oracle:diff:trigger` | 0 | 41/41，0 mismatches |
| `npm run oracle:diff:jobs` | 0 | 48/48，0 mismatches |
| `npm run oracle:diff:checks` | 0 | 46/46，0 mismatches |
| `npm run oracle:diff:witness` | 0 | 44/44，0 mismatches |
| `npm run s0:oracle` | 0 | 24/24，false PASS 0，**TS formal false PASS 0**，unsupported UNKNOWN 2/2 |
| `npm run s0:gate` | 0 | **S0_GATE PASS**；100 runs，1 hash，`gate_report_sha256 f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386` **不变**；8 个条件全 true |

另：正式管线差分测试单跑 163/163（含新增 G-57 probe），validation
测试单跑 11/11（两文件共 174 通过，日志
`test_logs/formal-and-validation-single-run.log`）。

注：`release:verify` 的 dist tree sha256 由 T012 的 `f4464038…` 变为
`4e979739…`——源文件改动所致，属预期；两构建一致性（确定性）仍成立。

## 5. 契约决策（ADR 形式）

### ADR FIX-P1-01/01 — Validator 放行 duplicate context（选 (a)，状态 CLOSED）

**决策：** `validateRequiredChecks()` 接受重复 context；每条 manifest
条目独立解析、一行一个结果。T005 的拒绝决策被本 ADR 取代。

**理由（选 (a) 不选 (b)）：**
1. 冻结语义已三方锁定接受方：T008 resolver 逐条解析（T8-05、T8-10
   测试锁定）、Python Oracle 接受、golden G-57 frozen expected 有 5 行
   （3×`unit-tests`）。选 (b) 须同步改 resolver、Oracle 求值、G-57 与
   T8-05/T8-10 夹具及预期、checks 差分 46 例——改写已冻结的 Oracle
   parity，blast radius 远大于改一行校验器。
2. 重复条目有语义区别：同一 context 可来自不同 source
   （`github-actions` vs 外部 App vs `""`），三者 verdict 不同
   （REPORTABLE_PENDING vs UNKNOWN）；拒绝会丢掉这种合法区分。GitHub
   侧同一 context 也可由不同 App 报告，manifest 逐条列出是合理输入。
3. 真正的歧义仍在 resolver 层处理：两个 PROVIDER 共享同一 context →
   `AMBIGUOUS` / `duplicate_context`（T8-03/T8-08 锁定），本次未动。
4. 风险最小：只删校验器的一条拒绝规则；其余 `duplicate_value`
   （job id / `on` 事件名 / `needs`）与全部求值语义一行未动；80
   golden + 1000 property + 46 checks 差分全部保持 0 mismatch。

### ADR FIX-P1-01/02 — FIX-P0-01/04 的绕过已移除（状态 CLOSED）

正式管线差分测试的 required-checks 现走 `validateRequiredChecks()`，
与 CLI 的 `loadRequiredChecks()` 同路。理由：绕过存在的前提（校验器
拒绝 duplicate context）已由 ADR FIX-P1-01/01 消除；继续绕过会使
测试与 shipped CLI 路径再次脱节（正是 P0-1/P1-1 两次漏网的模式）。
G-57 在该测试中走完整验证路径通过，是绕过已无的活证据。

## 6. 未改动项（核查）

- P0 修复未碰：`unsupported_job` 贯通逻辑（`job-dag.ts`）、正式管线
  差分测试的核心断言（G-79/G-80 probe 原样保留并通过）未动；U-07/U-08
  probe 哈希与 FIX-P0-01 报告逐字节一致（§3）。
- P2-1/P2-3/P2-4/P2-5/P2-6/P2-7 未碰（README 只改了 duplicate context
  一句；perf 数字未动）；P2-2/P2-10 未碰。
- 未改 S0 fixtures、S0 证据文件、规格文件：
  `P020_PROJECT_BOOK.md` SHA-256 `028c24720e0780542217719f6e9b14c0fe22b31b79c662520441c2116262b8de`、
  `P020_IMPLEMENTATION_PLAN.md` SHA-256 `bb645205174eca1d111687928c41505407392d0eefd1281455a776273aaa1e0e`，均不变。
- Python Oracle 核心算法未动；无阈值放宽、无夹具删除、无 Oracle 预期
  修改、无 golden 预期修改（G-57 预期原样核对通过）。
- 零真人参与；无具体许可证名称写入任何文件；`LICENSE_STATUS.md` 仍为
  `PENDING_SAM_DECISION`（`release:verify` license guard PASS）。
- 无网络访问、无 GitHub API、无 Token；全部合成数据。
- 测试运行改写的生成物（`evidence/tests/PERFORMANCE_REPORT.*`、
  `evidence/tests/RELEASE_VERIFY_REPORT.json`、
  `evidence/tests/ORACLE_PARITY_REPORT.json`、
  `evidence/s0/S0_ORACLE_REPORT.json`、e2e `trace.zip`）已用
  `git checkout -- evidence/` 还原，**未纳入本次 commit**；任务开始前已存在
  的未跟踪 `reports/` 目录未纳入提交、未动。
- 工作中一次编辑失误：G-57 probe 插入时破坏了 `formal-pipeline-unsupported.test.ts`
  的文件结构（G-80 probe 头被顶掉、describe 提前闭合）；已当场以
  `muse.edit` 修复结构，`vitest` 单跑 163/163 与全量 837/837 通过为证。
  该失误未进入任何提交。

## 7. 证据路径

- 本报告：`handoff/P020-FIX-P1-01/TASK_REPORT.md`
- 变更文件：`handoff/P020-FIX-P1-01/changed_files.txt`
- 测试命令：`handoff/P020-FIX-P1-01/test_commands.txt`
- 测试日志：`handoff/P020-FIX-P1-01/test_logs/`（probe 前后、全部验收命令）
- 文件哈希：`handoff/P020-FIX-P1-01/sha256.txt`
- 未决项：`handoff/P020-FIX-P1-01/unresolved_items.md`
- 审查依据：`evidence/review/INDEPENDENT_REVIEW.md` §P1-1/§P2-8/§P2-9、
  `evidence/review/REVIEW_PACK_01.md` §2、T005/T008 报告、FIX-P0-01 报告 §5 ADR FIX-P0-01/04

## 8. 改动文件

- `src/core/validate.ts` — 核心修复：`validateRequiredChecks` 放行 duplicate context；头注释同步
- `src/core/types.ts` — 契约注释：`RequiredCheckEntry` 写明 duplicate context 被接受、逐条解析
- `tests/unit/validation/required-checks.test.ts` — T005 拒绝测试改为接受测试 + T8-05/G-57 逐字接受测试
- `tests/unit/cli/formal-pipeline-unsupported.test.ts` — 移除 FIX-P0-01/04 绕过（required-checks 走 validator）+ 新增 G-57 probe 测试
- `scripts/release-verify.mjs` — 新增 T8-05 duplicate-manifest smoke 用例（P2-9 余部）
- `README.md` — §"Supported semantics" duplicate context 表述修正（P2-8 余部）
- `handoff/P020-FIX-P1-01/` — 本 handoff 包
