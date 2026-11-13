# T004 — 独立 Python Oracle 差分与 S0 Gate 报告

- **项目：** P020 CheckPath
- **任务：** T004（实施计划 §6），S0 硬门最后一项
- **Base commit：** `78946a0`（T002；其父 `b4a9169` T003，其父 `e9e59f6` T001）
- **日期：** 2026-11-08（UTC）
- **结论：PASS — 24/24 端到端 fixtures 与 Python Reference Oracle 逐字段完全一致；100 次运行唯一 SHA-256；false PASS = 0；unsupported 全部 UNKNOWN；无网络调用。S0_GATE.json status = "PASS"，8 条 §0.1 条件全部 true。**

## 1. 交付内容

| 文件 | 说明 |
|---|---|
| `tests/fixtures/s0/all.json` | S0 端到端套件清单：`checkpath.s0-e2e-suite/v1`，seed `20261108`，24 fixtures（event 8 / filter 8 / job 8），CP-A–CP-L 全覆盖 |
| `tests/fixtures/s0/E2E-*/` | 24 个 fixture 目录：workflow YAML（E2E-19 为双 workflow）+ `scenario.json`（§6.1 形状）+ `required-checks.json` + 冻结的 `expected.json`（规范化 e2e 报告） |
| `src/core/e2e.ts` | TS 端到端流水线（新）：YAML → trigger IR → 从 YAML 提取 jobs → Job DAG/if → per-provider check 解析 → 规范化报告 `checkpath.e2e-report/v1`；含 canonical JSON + SHA-256 |
| `src/core/workflow-parser.ts` | 最小胶水：`TriggerScenario` 增加可选 `diff` 元数据字段；`evaluateTrigger` 实现 §4.3 diff 边界（push >1000 / diff 超时旁路 path filter；>3000 未确认 → UNKNOWN；>3000 已确认仅评估前 3000）。无 diff 元数据时行为与 T002 完全相同 |
| `src/core/check-resolver.ts` | 最小胶水：新增 `resolveRequiredChecksPerProvider`（每 provider 一个 trigger 状态）；T003 的 `resolveRequiredChecks` 原样委托（单 workflow 布尔值），T003 行为不变 |
| `oracle/checkpath_oracle/parser.py` | 与 TS 镜像的 diff 边界实现；新增 `extract_jobs`（从同一 YAML 提取 jobs；BaseLoader 下 `if: false` 为字符串 `"false"`） |
| `oracle/checkpath_oracle/evaluator.py` | `_resolve_checks` 改为委托 `resolver.py`（单一真源）；新增 `evaluate_e2e_fixture` / `diff_boundary`（与 `src/core/e2e.ts` 逐项镜像） |
| `oracle/checkpath_oracle/resolver.py` | 补全（原 T001 占位）：per-provider required-check 解析器；T003 单布尔入口委托于它 |
| `oracle/checkpath_oracle/canonical.py` | 补全（原 T001 占位）：canonical JSON（键排序、分隔符 `,`/`:`、UTF-8）+ SHA-256，与 TS 侧逐字节一致（由 `input_sha256` 在 24/24 fixture 上验证） |
| `oracle/checkpath_oracle/cli.py` | 新增 `checkpath.s0-e2e-suite/v1` 分发 + `--report-out`；T002/T003 两种 schema 分发行为原样保留 |
| `scripts/oracle-diff.mjs` | 新增：`--suite`（TS↔Oracle 逐字段差分，无忽略白名单）、`--repeat 100`（进程级重复 100 次哈希）、`--gate`（全量回归 + 门禁组装） |
| `tests/unit/s0-e2e/e2e.test.ts` | vitest 胶水：24 fixtures TS 报告与冻结 expected 比对；`CHECKPATH_E2E_DUMP_DIR` 导出 TS 报告供差分 |
| `evidence/s0/S0_ORACLE_REPORT.json` | Oracle 差分报告（§4） |
| `evidence/s0/S0_DETERMINISM_REPORT.json` | 确定性报告（§5） |
| `evidence/S0_GATE.json` | S0 门禁（§0.1 全部字段，`gate_report_sha256` 可复算，§7） |
| `evidence/s0/T004_REPORT.md` | 本报告 |

未修改：T002/T003 的 fixture expected、规格文件（SHA-256 见 §8）、`package.json` 脚本名、LICENSE（仍为 `PENDING_SAM_DECISION`，未写任何许可证名称）。

## 2. 端到端流水线与接口一致性确认

T003 的接口假设已消除，不再有占位字段：

- **Trigger 输入：** T003 fixture 的 `workflow_triggered: boolean` + `trigger_reason` 占位字段已被真实 T002 trigger IR 取代。`src/core/e2e.ts` / Oracle `evaluate_e2e_fixture` 对每个 workflow 文件调用 `buildTriggerIR`，把 `evaluation.triggered`（boolean 或 null）传给 Job 层；`trigger_reason` 取自 `evaluation.reason`。
- **Jobs 来源：** jobs 从 workflow YAML 的 `jobs:` 段提取（TS `extractJobs` / Python `extract_jobs`），不再由 fixture JSON 单独提供。`name` 缺失时 context 取 `job_id`；`needs` 支持字符串或列表；YAML 的 `if: false` 在 TS 侧解析为布尔值 `false`，胶水层规范化为字符串 `"false"`，与 Python BaseLoader 的字符串 `"false"` 一致（E2E-17/E2E-18/E2E-22 验证）。
- **`if` 上下文：** 场景的 `event_name` / `action` / `ref` / `base_ref` / `head_ref` 由 §6.1 scenario 的 event 字段机械复制进 T003 `ScenarioContext`（E2E-18 的 `always() && github.event_name == 'pull_request'` 与 E2E-23 的 `github.event_name == 'pull_request'` 验证）。
- **Check 解析：** T003 解析器的单 workflow 布尔值无法表达多 workflow（CP-I）与 broken-trigger（CP-L）的 per-provider 触发状态。T004 在两边各加了一个严格泛化：同一优先级表（§4.5），但每个 provider 带自己的 trigger 状态（`triggered` / `not_triggered` / `unknown` / `invalid`）。单 workflow 时与 T003 解析器逐项相同（`s0:semantics` 12/12 仍通过即为证据）。新增的两个 reason 只出现在 trigger 本身无法判定时：`trigger_unknown`（UNKNOWN）、`trigger_invalid`（INVALID）。
- **Trigger 为 INVALID/UNKNOWN/null 时：** 该 workflow 的 Jobs 直接判 INVALID / `trigger_invalid` 或 UNKNOWN / `trigger_unknown`，不进入 Job DAG；checks 按同一规则出 INVALID / UNKNOWN（E2E-16 验证），不静默降级为 PENDING。
- **Diff 边界（§4.3，T002 未实现，T004 补齐）：** 判定顺序固定为 event → activity type → branch → path/diff → commit skip。push commits > 1,000 或 diff 超时 → path filter 视为触发（`path_file_results` 全部 `matched: true`，与 T002 “无 path filter” 的约定一致；旁路事实记在报告顶层 `diff_boundary` 字段）。变更总数 > 3,000 且 `first_3000_confirmed` 不为 true → path 无法评估 → `triggered: null`、`unsupported: ["diff_first_3000_unconfirmed"]`。> 3,000 且已确认 → 仅评估前 3,000 个文件（S0 无 fixture 覆盖此分支，见 §9 未解决项）。无 `diff` 元数据时规则完全不起作用，T002 8/8 不受影响（已验证）。
- **规范化报告（`checkpath.e2e-report/v1`）：** `schema` / `fixture_id` / `scenario_id` / `input_sha256`（canonical 输入 `{required_checks, scenario, workflows:[{path, yaml}]}` 的 SHA-256）/ `diff_boundary` / `workflows[]`（每文件完整 TriggerIR）/ `jobs[]`（带 `workflow` 来源）/ `required_checks[]` / `unsupported_features[]`（顺序固定：trigger 条目 → `unsupported_if:<job>` → `external_source:<context>`）/ `summary`（workflow 计数 + 5 类 job 状态计数 + 6 类 check 状态计数）。报告不含时间、绝对路径、Token。Canonical JSON 两边逐字节一致：TS `canonicalJson` 与 Python `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)` 在 24/24 fixture 的 `input_sha256` 上互相验证。

## 3. Fixture 结果（24/24，TS 与 Oracle 各自与冻结 expected 一致，且二者逐字段相同）

分布：event/活动类型 8（E2E-01–08）、branch/path/commit-skip 8（E2E-09–16）、Job/required-check 8（E2E-17–24）。CP-A–CP-L 全覆盖：A=E2E-01，B=E2E-02，C=E2E-03，D=E2E-17，E=E2E-18，F=E2E-09（+E2E-10 补集），G=E2E-11，H=E2E-12，I=E2E-19（+E2E-21 同 workflow 补集），J=E2E-20，K=E2E-15，L=E2E-16。对抗性 fixture 14 个（expected 含 PENDING_NOT_REPORTED / AMBIGUOUS / UNKNOWN / INVALID 的 check）。

| ID | 覆盖点 | Trigger | Jobs | Required checks |
|---|---|---|---|---|
| E2E-01 | CP-A：PR 仅改 README，paths `src/**` | `path_mismatch` → false | test SKIPPED | unit-tests PENDING_NOT_REPORTED |
| E2E-02 | CP-B：workflow 显式含 `merge_group` | triggered | test ELIGIBLE | unit-tests REPORTABLE_PENDING |
| E2E-03 | CP-C：只有 `pull_request`，场景 `merge_group` | `event_mismatch` → false | test SKIPPED | unit-tests PENDING_NOT_REPORTED |
| E2E-04 | push 基线：`push` + branches `main` | triggered | test ELIGIBLE | unit-tests REPORTABLE_PENDING |
| E2E-05 | `pull_request` types `[opened]`，action `synchronize` | `activity_type_mismatch` → false | test SKIPPED | unit-tests PENDING_NOT_REPORTED |
| E2E-06 | types `[opened, synchronize]`，action `opened` | triggered | test ELIGIBLE | unit-tests REPORTABLE_PENDING |
| E2E-07 | `merge_group` types `[checks_requested]`，action `synchronize` | `activity_type_mismatch` → false | test SKIPPED | unit-tests PENDING_NOT_REPORTED |
| E2E-08 | 列表式 `on: [push, pull_request]`，场景 PR | triggered | test ELIGIBLE | unit-tests REPORTABLE_PENDING |
| E2E-09 | CP-F：branch+path 仅 branch 匹配 | `path_mismatch` → false | test SKIPPED | unit-tests PENDING_NOT_REPORTED |
| E2E-10 | CP-F 补集：仅 path 匹配（base `release/2.x`） | `branch_mismatch` → false | test SKIPPED | unit-tests PENDING_NOT_REPORTED |
| E2E-11 | CP-G：有序负 Glob 排除后重新包含 | triggered | test ELIGIBLE | unit-tests REPORTABLE_PENDING |
| E2E-12 | CP-H：commit 含 `[skip ci]` | `commit_skip` → false | test SKIPPED | unit-tests PENDING_NOT_REPORTED |
| E2E-13 | `branches-ignore: [main]`，base 为 main | `branch_mismatch` → false | test SKIPPED | unit-tests PENDING_NOT_REPORTED |
| E2E-14 | `paths-ignore: [docs/**]`，仅改 docs | `path_mismatch` → false | test SKIPPED | unit-tests PENDING_NOT_REPORTED |
| E2E-15 | CP-K：push 1500 commits > 1000，path 旁路 | triggered（`diff_boundary=push_over_1000_commits`） | test ELIGIBLE | unit-tests REPORTABLE_PENDING |
| E2E-16 | CP-L：diff 3500 文件，前 3000 未确认 | `unknown`（triggered null） | test UNKNOWN | unit-tests UNKNOWN |
| E2E-17 | CP-D：workflow 触发，Job `if: false` | triggered | test SKIPPED | unit-tests SKIPPED_SUCCESS |
| E2E-18 | CP-E：`if: always()` 聚合，上游被跳过 | triggered | build SKIPPED，aggregate ELIGIBLE | build SKIPPED_SUCCESS，ci-ok REPORTABLE_PENDING |
| E2E-19 | CP-I：双 workflow 同 context `tests` | 双 workflow 均 triggered | test-a/b ELIGIBLE | tests AMBIGUOUS |
| E2E-20 | CP-J：required check 无 provider | triggered | test ELIGIBLE | integration PENDING_NOT_REPORTED，unit-tests REPORTABLE_PENDING |
| E2E-21 | CP-I 补集：同 workflow 双 job 同 context | triggered | test-a/b ELIGIBLE | tests AMBIGUOUS |
| E2E-22 | 上游 `if: false` 被跳过，下游无 `if` 继承默认 success 门 | triggered | build SKIPPED，deploy SKIPPED | build/deploy SKIPPED_SUCCESS |
| E2E-23 | 下游 `needs` ELIGIBLE 上游，`if` 为 context 比较 | triggered | build ELIGIBLE，test CONDITIONAL_AFTER_NEEDS | integration-tests REPORTABLE_PENDING |
| E2E-24 | Fail-closed 包：`contains()` → UNKNOWN；`needs` 缺失 → INVALID；`needs` 环 → INVALID；外部 source → UNKNOWN；健康 job 仍可报告 | triggered | test UNKNOWN，deploy INVALID，cyc-a/b INVALID，ok ELIGIBLE | unit-tests UNKNOWN，deploy INVALID，job-a INVALID，ok-check REPORTABLE_PENDING，external-check UNKNOWN |

Workflow-skip 与 job-skip 对照全部正确：workflow skip（E2E-01/03/05/07/09/10/12/13/14）→ PENDING_NOT_REPORTED；job skip（E2E-17/18/22）→ SKIPPED_SUCCESS。`merge_group` 缺失（E2E-03）被识别为 `event_mismatch`。

### Expected 冻结方法（诚实说明）

`expected.json` 在任何实现运行前冻结，生成后 98 个输入文件未再改动（`sha256sum -c` 校验通过，见 §6）。其中 trigger IR 部分取自已验证的 T002 Python parser（8/8）对适配后场景的输出——T004 不重新证明 trigger 语义，只证明组合；jobs/checks/summary/`diff_boundary`/`unsupported_features` 按规格原文手写；CP-K/CP-L 的 trigger IR 按 §4.3 手写（T002 parser 不实现边界规则）。生成器为 `/tmp/p020-t004/gen_fixtures.py`（仅转录工具，不在仓库内）。冻结后未修改任何 expected；实现首次运行即 24/24 通过，无需修正 expected。

## 4. Oracle 差分与 fail-closed 统计（`npm run s0:oracle`）

- **退出码：0**（`node scripts/oracle-diff.mjs --suite tests/fixtures/s0/all.json`）
- **24/24 fixtures**：TS 报告与冻结 expected 一致（vitest 25 个测试：1 个 suite 检查 + 24 个 fixture），Oracle 报告与冻结 expected 一致（`24/24 fixtures PASS`），且 TS 与 Oracle 报告逐字段完全一致。
- **`oracle_mismatch_count = 0`**：逐字段差分无任何差异；差分脚本无忽略字段白名单（`deepDiff` 递归比较全部字段）。
- **`false_pass_count = 0`**：14 个对抗性 fixture 中没有任何 required check 被误报为 REPORTABLE_PENDING（定义：实际 REPORTABLE_PENDING 但 expected 为其他状态；共 0 项）。
- **`unsupported_as_unknown_count = 2` / 预期 2**：E2E-16（diff >3000 未确认 → trigger/jobs/checks 全部 UNKNOWN）与 E2E-24（不支持的 `if` → UNKNOWN；外部 source → UNKNOWN）均正确输出 UNKNOWN。
- **`input_fixture_sha256 = afce74c909298f4537e9e86d95c8521476e2efca9cfbd0f417229321df2279d2`**（98 个输入文件，复算见 §7）。
- 报告：`evidence/s0/S0_ORACLE_REPORT.json`（`suite_sha256 = 446e675a7e259c312256f66be48401d44174ad0a94869981192e587fa870516f`，即 `tests/fixtures/s0/all.json`）。

## 5. 确定性（`npm run s0:determinism`）

- **退出码：0**（`node scripts/oracle-diff.mjs --repeat 100`；进程级重复：每次迭代重新 spawn vitest 与 python3 进程）。
- **100 次运行，唯一 SHA-256：`b39c0de1471856c4db4f2e3c8b8de3654031030586247ac04683012b183550e2`**（`determinism_unique_hash_count = 1`）。每次迭代的哈希是对 24 份 TS 报告 + 24 份 Oracle 报告的 canonical 拼接计算，fixture id 排序后连接。
- **100 次迭代全部 `ts_exit=0`、`oracle_exit=0`、`mismatches=0`**（`typescript_failures = 0`、`oracle_failures = 0`）。
- 用时约 2m12s（100 次迭代）。报告：`evidence/s0/S0_DETERMINISM_REPORT.json`；逐次记录：`evidence/s0/logs/s0-determinism.log`（100 行）。

## 6. 验收命令（真实运行）

| 命令 | 退出码 | 日志 / 证据 |
|---|---|---|
| `npm run s0:oracle` | 0 | `evidence/s0/logs/s0-oracle-ts.log`、`s0-oracle-py.log`、`s0-oracle-diff.log`；`evidence/s0/S0_ORACLE_REPORT.json` |
| `npm run s0:determinism` | 0 | `evidence/s0/logs/s0-determinism.log`（100 行）；`evidence/s0/S0_DETERMINISM_REPORT.json` |
| `npm run s0:gate` | 0 | `evidence/s0/logs/s0-gate.log`；`evidence/S0_GATE.json`（status PASS，8 条件全 true） |
| `npm run s0:parse`（回归） | 0 | `evidence/s0/logs/s0-parse-t004.log`（vitest 9 passed：1 个 suite 检查 + 8 个 fixture） |
| `npm run s0:semantics`（回归） | 0 | `evidence/s0/logs/s0-semantics-t004.log`（vitest 13 passed：1 个 suite 检查 + 12 个 case） |
| `npm run typecheck`（回归） | 0 | `evidence/s0/logs/typecheck-t004.log` |
| `npm run lint`（附加） | 0 | （见 §9：初版 3 个 lint 错误已修复后重跑为 0） |
| `python3 -m oracle.checkpath_oracle.cli --suite tests/fixtures/s0/parser-trigger/suite.json`（回归） | 0 | `evidence/s0/logs/oracle-parser-t004.log`（8/8 PASS） |
| `python3 -m oracle.checkpath_oracle.cli --suite tests/fixtures/s0/job-check/suite.json`（回归） | 0 | `evidence/s0/logs/oracle-job-check-t004.log`（12/12，failed 0） |

注：`s0:gate` 内部重跑了上表全部回归命令（`env:check`、`s0:parse`、`s0:semantics`、`typecheck`、两个 Oracle 套件）并记录退出码与日志于 `S0_GATE.json.task_results`；上表所列回归日志即 gate 运行写入的 `*-t004.log` 文件。

## 7. S0_GATE.json 与哈希复算

`evidence/S0_GATE.json` 全文（status PASS）：

```json
{
  "project_id": "P020",
  "spec_version": "1.0.0",
  "status": "PASS",
  "task_results": {
    "T001": {
      "exit_code": 0,
      "log": "evidence/s0/logs/env-check-t004.log",
      "commands": [
        {
          "command": "node scripts/env-check.mjs",
          "exit_code": 0,
          "log": "evidence/s0/logs/env-check-t004.log"
        }
      ]
    },
    "T002": {
      "exit_code": 0,
      "log": "evidence/s0/logs/s0-parse-t004.log",
      "commands": [
        {
          "command": "npm run s0:parse",
          "exit_code": 0,
          "log": "evidence/s0/logs/s0-parse-t004.log"
        },
        {
          "command": "python3 -m oracle.checkpath_oracle.cli --suite tests/fixtures/s0/parser-trigger/suite.json",
          "exit_code": 0,
          "log": "evidence/s0/logs/oracle-parser-t004.log"
        }
      ]
    },
    "T003": {
      "exit_code": 0,
      "log": "evidence/s0/logs/s0-semantics-t004.log",
      "commands": [
        {
          "command": "npm run s0:semantics",
          "exit_code": 0,
          "log": "evidence/s0/logs/s0-semantics-t004.log"
        },
        {
          "command": "python3 -m oracle.checkpath_oracle.cli --suite tests/fixtures/s0/job-check/suite.json",
          "exit_code": 0,
          "log": "evidence/s0/logs/oracle-job-check-t004.log"
        }
      ]
    },
    "T004": {
      "exit_code": 0,
      "log": "evidence/s0/logs/s0-oracle-diff.log",
      "commands": [
        {
          "command": "node scripts/oracle-diff.mjs --suite tests/fixtures/s0/all.json",
          "exit_code": 0,
          "log": "evidence/s0/logs/s0-oracle-diff.log"
        },
        {
          "command": "node scripts/oracle-diff.mjs --repeat 100",
          "exit_code": 0,
          "log": "evidence/s0/logs/s0-determinism.log"
        }
      ]
    }
  },
  "oracle_fixture_count": 24,
  "oracle_mismatch_count": 0,
  "false_pass_count": 0,
  "determinism_repeat_count": 100,
  "determinism_unique_hash_count": 1,
  "unsupported_as_unknown_count": 2,
  "runtime_network_call_count": 0,
  "environment_fingerprint": "e1cfe76c50cb7383d15f11d1e43e804207ec5ce1c8922da86d97b5499627378e",
  "input_fixture_sha256": "afce74c909298f4537e9e86d95c8521476e2efca9cfbd0f417229321df2279d2",
  "conditions": {
    "c1_t001_environment_available": true,
    "c2_t002_parser_trigger_8_8": true,
    "c3_t003_job_check_12_12": true,
    "c4_t004_e2e_24_24_oracle_parity": true,
    "c5_determinism_100_runs_one_hash": true,
    "c6_false_pass_zero": true,
    "c7_unsupported_all_unknown": true,
    "c8_no_network_calls": true
  },
  "typecheck_exit_code": 0,
  "typecheck_log": "evidence/s0/logs/typecheck-t004.log",
  "network_check": {
    "command": "grep -rnE 'fetch\\s*\\(|https?\\.request\\s*\\(|https?\\.get\\s*\\(|WebSocket\\s*\\(|XMLHttpRequest|axios|urllib|requests\\.|http\\.client|socket\\.|net\\.connect|from\\s+http|import\\s+http|from\\s+socket|import\\s+socket|\\bcurl\\b' src/core/e2e.ts src/core/workflow-parser.ts src/core/glob-subset.ts src/core/job-dag.ts src/core/check-resolver.ts oracle/checkpath_oracle/parser.py oracle/checkpath_oracle/evaluator.py oracle/checkpath_oracle/glob_subset.py oracle/checkpath_oracle/resolver.py oracle/checkpath_oracle/canonical.py oracle/checkpath_oracle/cli.py",
    "match_count": 0,
    "matches": []
  },
  "notes": [
    "gate_report_sha256 is the SHA-256 of the canonical JSON of this file with the gate_report_sha256 field removed. Recompute with: python3 -c \"import json,hashlib; d=json.load(open('evidence/S0_GATE.json')); h=d.pop('gate_report_sha256'); print(hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()); print('recorded:',h)\"",
    "input_fixture_sha256 covers tests/fixtures/s0/all.json plus every fixture workflow/scenario/required-checks/expected file, sorted by path; see evidence/s0/T004_REPORT.md for the recompute command.",
    "Runtime network calls are 0 by construction (local processes only) and by static check over the executed implementation files; the runner itself (scripts/oracle-diff.mjs) is excluded from the grep because it contains the pattern table as string literals, and it only spawns local vitest/python3/npm/node/grep processes.",
    "PyYAML actually used by the Oracle is 6.0.1 (system); lockfile pins 6.0.3, pip install blocked by PEP 668 (T001 D2)."
  ],
  "gate_report_sha256": "f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386"
}
```

（上为 `evidence/S0_GATE.json` 全文原样。）

`gate_report_sha256` 定义：对 `S0_GATE.json` 去掉 `gate_report_sha256` 字段后的 canonical JSON（键排序、分隔符 `,`/`:`、UTF-8）计算 SHA-256。复算命令：

```sh
python3 -c "import json,hashlib; d=json.load(open('evidence/S0_GATE.json')); h=d.pop('gate_report_sha256'); print(hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()); print('recorded:',h)"
```

`input_fixture_sha256` 定义：98 个输入文件（`tests/fixtures/s0/all.json` + 每个 fixture 的 workflow/scenario/required-checks/expected）按仓库相对路径排序，每文件一行 `"<path>:<sha256-of-file>\n"`，拼接后 SHA-256。复算命令：

```sh
python3 -c "
import hashlib, json
from pathlib import Path
suite = json.load(open('tests/fixtures/s0/all.json'))
files = ['tests/fixtures/s0/all.json']
for e in suite['fixtures']:
    for p in e['workflows']: files.append('tests/fixtures/s0/' + e['dir'] + '/' + p)
    for k in ('scenario','required_checks','expected'): files.append('tests/fixtures/s0/' + e['dir'] + '/' + e[k])
lines = ''.join(f\"{f}:{hashlib.sha256(Path(f).read_bytes()).hexdigest()}\n\" for f in sorted(set(files)))
print(hashlib.sha256(lines.encode()).hexdigest())
"
```

已验证：复算值 `afce74c909298f4537e9e86d95c8521476e2efca9cfbd0f417229321df2279d2` 与 `S0_ORACLE_REPORT.json` / `S0_DETERMINISM_REPORT.json` 记录值一致。

## 8. 环境偏差与规格校验

- 系统只有 `python3`（Python 3.12.3），无 `python` 别名；Oracle 验收命令用 `python3`（T001 已记录）。
- 系统 PyYAML 为 **6.0.1**，锁定文件要求 6.0.3 未安装（PEP 668 阻止 pip 安装）；T004 的 Python 部分用系统 PyYAML 6.0.1 运行，未使用 `--break-system-packages`。Oracle 实际使用的 PyYAML 版本记录在 `S0_ORACLE_REPORT.json` / `S0_DETERMINISM_REPORT.json` 的 `environment.pyyaml` 字段（`6.0.1`）。
- Node.js `v24.22.1`、Python `3.12.3`（见报告 `environment` 字段）。
- 零真人参与：全部 fixture 为合成数据；无网络调用、无 Token、无真实仓库依赖。网络调用数为 0 的确认：(a) 所有验收命令均为本地进程（vitest / python3 / npm / node）；(b) 静态检查 `grep -rnE '<pattern>' <11 个实现文件>`（fetch / http.request / WebSocket / axios / urllib / socket / curl 等调用模式）0 命中，grep exit 1；命令与结果记在 `S0_GATE.json` 的 `network_check` 字段。`scripts/oracle-diff.mjs` 本身被排除在 grep 之外，因为它内含 pattern 表字符串字面量（会自匹配）；它只 spawn 本地进程。
- 规格文件未修改：`P020_PROJECT_BOOK.md` SHA-256 `028c24720e0780542217719f6e9b14c0fe22b31b79c662520441c2116262b8de`，`P020_IMPLEMENTATION_PLAN.md` SHA-256 `bb645205174eca1d111687928c41505407392d0eefd1281455a776273aaa1e0e`，与任务卡一致。

## 9. 未解决项

- **>3,000 文件已确认分支无 S0 fixture：** `first_3000_confirmed=true` 且总数 > 3,000 时“仅评估前 3,000 个文件”的截断行为已在两边实现（`changed_files.slice(0, 3000)` / `[:3000]`），但 S0 的 24 个 fixture 未覆盖（§8.3 CP-L 只要求未确认 → UNKNOWN）。留待 T006（diff 边界正式任务）补 fixture；不影响 S0 门槛。
- **多 workflow 同 job_id 的 trigger 区分：** per-provider 解析按 Job 评估对象配对 trigger 状态，不依赖 job_id；但 T008 正式解析器应以 `(workflow, job_id)` 为键固化。S0 fixture 已用不同 job_id（E2E-19：test-a/test-b）规避。
- **场景 `diff.complete` / `returned_files` / `algorithm` 字段：** S0 只记录、不解释其语义（规格未定义 `complete=false` 的判定）；T006 正式化。
- **第一次 gate 运行报 FAIL（已修复，非产品问题）：** 首次 `npm run s0:gate` 的 status 为 FAIL，唯一失败条件是 c1——`environment_fingerprint` 为空。根因是 gate 代码用 `JSON.parse(env.stdout)` 解析 `env-check.mjs` 的输出，但该脚本在 JSON 后还打印一行 `env:check OK`，导致解析抛错、指纹被置空（环境本身正常：env:check exit 0，指纹在输出中存在）。修复为正则提取 `"environmentFingerprint"` 字段后重跑 gate，status PASS。修复后又因 lint 清理改动了 `oracle-diff.mjs` 两处无关行（删未用导入、删 catch 内多余赋值），为使门禁证据与提交代码完全对应，又重跑了一次 gate，仍为 PASS，`gate_report_sha256` 与修复后第一次 PASS 运行一致（`f511a847…`）。
- **Lint：** 独立 `npm run lint` 初版 exit 1，3 个错误全在 `scripts/oracle-diff.mjs`（`existsSync` / `readdirSync` 未用；catch 内 `oracleJcFailed = null` 多余赋值）。修复后 exit 0，typecheck 同样 0。
