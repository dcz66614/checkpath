# T002 — YAML 解析与事件过滤 PoC 报告

- **项目：** P020 CheckPath（`checkpath.trigger-ir/v1`）
- **任务：** T002（实施计划 §6），S0 门 T002
- **Base commit：** `e9e59f6cdae945c3052a1981e2761e94a2a4446e`（T001）；提交时父 commit 为 T003 已合并的 `b4a9169`（见“并行工作说明”）
- **日期：** 2026-11-08（UTC）
- **结论：PASS — 8/8 fixtures 符合固定预期；TS 与 Python 规范化 trigger IR 8/8 逐字段完全一致**

## 1. 交付内容

| 文件 | 说明 |
|---|---|
| `src/core/workflow-parser.ts` | PoC：解析 workflow YAML，输出规范化 trigger IR；按 §4.2 计算 `event AND activity AND branch AND path AND NOT commit_skip` |
| `src/core/glob-subset.ts` | PoC：有序 Glob 匹配，保留 `!` 负模式顺序语义；支持 `*`、`**`、`**/`、`?`、`[...]`，其余语法返回 UNKNOWN |
| `oracle/checkpath_oracle/parser.py` | Python 独立实现：`yaml.BaseLoader` 保留 `on` 字符串键；不导入/调用任何 TypeScript 代码；两边分别读原始 YAML |
| `oracle/checkpath_oracle/glob_subset.py` | Python 独立实现的有序 Glob 匹配 |
| `oracle/checkpath_oracle/cli.py` | 补齐到可运行：按 suite `schema` 分发，`checkpath.s0-parser-suite/v1` 走 T002 解析器套件，`checkpath.job-check-suite/v1` 走 T003 job-check 套件（行为保留，见 §5） |
| `tests/fixtures/s0/parser-trigger/` | 8 个固定 fixture + `suite.json` 清单（workflow.yml / scenario.json / expected.json 各 8 个） |
| `tests/unit/s0-parser/parser-trigger.test.ts` | 最小测试胶水：vitest 逐 fixture 比对 TS IR 与固定 expected；`CHECKPATH_IR_DUMP_DIR` 设置时导出 TS IR 供比对 |
| `evidence/s0/T002_REPORT.md` | 本报告 |

未修改：Job DAG、required-check resolver、UI、release、规格文件、`package.json` 脚本名。未写任何许可证名称；`LICENSE_STATUS.md` 保持 `PENDING_SAM_DECISION`。

## 2. 规范化 trigger IR（`checkpath.trigger-ir/v1`）

每个 fixture 的 IR 字段：`schema`、`fixture_id`、`on_key_is_string`、`status`
（`VALID` / `INVALID` / `UNKNOWN`）、`events[]`（`name`、`types`、`branches`、
`branches_ignore`、`paths`、`paths_ignore`）、`evaluation`（`event_match`、
`activity_type_match`、`branch_match`、`branch_value`、`path_match`、
`path_file_results[]`、`commit_skip`、`triggered`、`unsupported`、`reason`）、
`errors[]`。`INVALID` / `UNKNOWN` 时 evaluation 字段为 null、`triggered` 为 null，
不猜测。判定顺序固定：结构/互斥问题 → `INVALID`；未知事件/过滤键/不支持的
Glob → `UNKNOWN`。分支取值按 §4.2：`pull_request` 用 base branch，`push` 用
被 push 的 branch，`merge_group` 用 target branch；branch 与 path 同时存在时按
AND 计算。

## 3. Fixture 结果（8/8）

| ID | 覆盖点 | 关键预期 | 结果 |
|---|---|---|---|
| PT-01 | `on` 键为字符串键（映射式 `on: push` + `branches: [main]`） | `on_key_is_string=true`，push/main 触发 | PASS |
| PT-02 | 列表式 `on: [push, pull_request]`，pull_request 事件匹配 | `event_match=true`，触发 | PASS |
| PT-03 | `merge_group` + `types: [checks_requested]` 独立事件 | 事件/活动类型均匹配，触发 | PASS |
| PT-04 | `pull_request` 显式 `types: [opened, synchronize]` + base branch 过滤 | action `synchronize`、base `main` 匹配，触发 | PASS |
| PT-05 | branch + path 的 AND 关系 | branch 通过、path（`src/**` vs `docs/guide.md`）不通过 → `triggered=false`，`reason=path_mismatch` | PASS |
| PT-06 | 有序 `!` 负模式排除/重新包含 | `src/**` → `!src/generated/**` → `src/generated/keep.ts`：keep.ts 重新包含（matched），a.ts 排除（not matched）；`path_match=true` | PASS |
| PT-07 | `paths` 与 `paths-ignore` 同时出现 | `status=INVALID`，`errors=[paths_and_paths_ignore_both_present]`，`triggered=null` | PASS |
| PT-08 | 不支持的 Glob 语法 `src/{a,b}/**`（花括号展开） | `status=UNKNOWN`，`unsupported=[unsupported_glob:src/{a,b}/**]`，`triggered=null` | PASS |

`expected.json` 均为按规格手写、测试首次运行前冻结；运行中未修改任何
expected。Fixture SHA-256 见 §6。

`on` 键对照实测：同一 YAML 文本，`yaml.BaseLoader` 解析为 `{'on': {...}}`
（字符串键），而 `yaml.SafeLoader`（YAML 1.1）解析为 `{True: {...}}`（布尔键
误读）。TS 侧用 `yaml` 2.x 的 `parseDocument` 检查文档节点键为字符串 `"on"`。

## 4. 验收命令（真实运行）

| 命令 | 退出码 | 日志 |
|---|---|---|
| `npm run s0:parse`（vitest，9 个测试：1 个 suite 检查 + 8 个 fixture） | **0** | `/tmp/p020-t002/logs/s0-parse.log`（9 passed） |
| `python3 -m oracle.checkpath_oracle.cli --suite tests/fixtures/s0/parser-trigger/suite.json` | **0** | `/tmp/p020-t002/logs/oracle-cli.log`（8/8 fixtures PASS） |
| `npm run typecheck` | **0** | `/tmp/p020-t002/logs/typecheck.log` |
| `npm run lint` | **0** | `/tmp/p020-t002/logs/lint.log` |

> 说明：任务卡写的是 `python -m …`，但本机只有 `python3`（无 `python` 别名，
> T001 已记录的偏差），故用 `python3` 运行。原命令未用固定 exit 0 冒充：
> T001 的占位 CLI 会抛 `NotImplementedError`，本次由 T002 补齐为真实实现。

### 4.1 `npm run s0:parse` 日志（摘录）

```text
Test Files  1 passed (1)
     Tests  9 passed (9)
  Start at  13:20:14
  Duration  275ms
```

### 4.2 Oracle CLI 日志（全文）

```text
PT-01: PASS
PT-02: PASS
PT-03: PASS
PT-04: PASS
PT-05: PASS
PT-06: PASS
PT-07: PASS
PT-08: PASS
8/8 fixtures PASS
```

## 5. TS ↔ Python IR 逐字段比对（parity）

TS 侧测试在 `CHECKPATH_IR_DUMP_DIR=/tmp/p020-t002/ir-ts` 下导出 8 份 IR，
Oracle CLI 以 `--ir-out /tmp/p020-t002/ir-py` 导出 8 份 IR，逐文件解析为
JSON 后逐字段比较：

```text
PT-01 IDENTICAL
PT-02 IDENTICAL
PT-03 IDENTICAL
PT-04 IDENTICAL
PT-05 IDENTICAL
PT-06 IDENTICAL
PT-07 IDENTICAL
PT-08 IDENTICAL
PARITY: ALL IDENTICAL (8/8)
```

### 并行工作说明

执行期间 T003 任务在同一工作树并行工作，并于 13:20:08 提交了
`b4a9169`（其间覆盖了本任务先写的 `oracle/checkpath_oracle/cli.py` 占位
实现）。本任务将 `cli.py` 合并为按 suite `schema` 分发的版本：T002 解析器
套件与 T003 job-check 套件共用入口，T003 行为原样保留。合并后验证：

```text
python3 -m oracle.checkpath_oracle.cli --suite tests/fixtures/s0/job-check/suite.json
JOBCHECK_EXIT=0，summary: {'total': 12, 'passed': 12, 'failed': 0}
```

T003 的 `evaluator.py`、`job-dag.ts`、`check-resolver.ts` 及 job-check
fixture 均未动。本任务只提交 §1 所列的 T002 文件。

## 6. Fixture SHA-256（`tests/fixtures/s0/parser-trigger/`）

```text
d5e0a62b8549f859a38a3d1818c7ec9c7d0bdd556d36730b710ba18d217bb26b  ./PT-01-on-string-key/expected.json
88af9d980c8949b0e4bf77468f31fc5f3a3d85638cc9feafdeecca2f62cd0f81  ./PT-01-on-string-key/scenario.json
f1b46c1449382bb7544d520773d6e684572c3f55fc54d7d01b56d85cfc3d67c9  ./PT-01-on-string-key/workflow.yml
30a7c129f5061e112881d02cac2f63ef04f442b4fc183f35b514286986807673  ./PT-02-push-pull-request-list/expected.json
bd25e7b310821027bf4aaa9c8be2773662c97c0899cfc730917bdf30a6526e2c  ./PT-02-push-pull-request-list/scenario.json
a2cd108cea348bfbcc8acac932edc391fdacfa0d6422d9c89ffd19edcbb3cf68  ./PT-02-push-pull-request-list/workflow.yml
c856b93fe473f58fd33beb1040ed391907ac7153cf72b3501e0c58778037e554  ./PT-03-merge-group/expected.json
626a5256f3793279f7c98f32f49cef743aae0998e718ae98bcb92005234698dc  ./PT-03-merge-group/scenario.json
9438c70e90bd01e26a9f40b4b8560faf31b35b27ca7f5a7ea651109fe706c8e8  ./PT-03-merge-group/workflow.yml
88f0db219a7ade2443865c78317d6e67f55de5cf46f912f0ac7cf0cbd930808e  ./PT-04-pull-request-types-base/expected.json
92c7a4fe5a2339790d5266b97f859e8ea06a0f8fbde48795048594a73bc217ab  ./PT-04-pull-request-types-base/scenario.json
d4f0b7dce170479d2056bc5c78b24d2d86b67e15e2b7a5440300bcafc4ec5430  ./PT-04-pull-request-types-base/workflow.yml
0b382c8ce677772b8799214c1196c7fa3cf00a9cbc7caf3cb18c70fcb2975216  ./PT-05-branch-path-and/expected.json
d983bb5188e1e63927fdad711aa0b02a2d9635089b9985c48177455dc39648b0  ./PT-05-branch-path-and/scenario.json
aad4aa7b67e60980d18a67e90811a5b06eb65da12ea75cce106e08ee84a7aab1  ./PT-05-branch-path-and/workflow.yml
f5000d8610e21513181689a91f3f4e624d71ba7e754cf0a98eb9aec12cbb02bf  ./PT-06-ordered-negation/expected.json
5380da16d4f30cb0bf2569ccdd5b9ec95e8b96b4ff47d3e5d6e9d4bc04e745ae  ./PT-06-ordered-negation/scenario.json
fe894eb51eabd4d61558c34b265a2872704ecabb1772a167c7818c099b34c052  ./PT-06-ordered-negation/workflow.yml
700bb39a327922340cb5faf7f3ba587032c956bcbb95ae5f6e27d416ee9c86fc  ./PT-07-paths-and-paths-ignore/expected.json
57caf12ccbc0906b1175c595256e59f6c6d1f9fc4cf97d66414a726f182b3bd9  ./PT-07-paths-and-paths-ignore/scenario.json
1c6d2b45fe6d423b811c41a0b58efd54e601fe1dc3eb265d30f1c6e7792c957b  ./PT-07-paths-and-paths-ignore/workflow.yml
35a727db517019aed4708dddb324d2166c8e9737d8349499c9365f7b18424995  ./PT-08-unsupported-glob/expected.json
b3a4e1cdde0cc5298532d030b1757c553ac79542276695e495396e3cc2468537  ./PT-08-unsupported-glob/scenario.json
ff9c1ff17a0bf8d35398429f02884ba1d26597e2e062bec445f4a04a960c59d0  ./PT-08-unsupported-glob/workflow.yml
d8707270073f0d8a1091bee561bd382ca335867027402f09a71791a82bcf3f5f  ./suite.json
```

## 7. 环境偏差（T001 已记录，T002 同样适用）

- 系统只有 `python3`（Python 3.12.3），无 `python` 别名；验收命令用 `python3`。
- 系统 PyYAML 为 **6.0.1**，锁定文件要求 6.0.3 未安装（PEP 668 阻止 pip
  安装）；T002 的 Python 部分用系统 PyYAML 6.0.1 运行，未使用
  `--break-system-packages`。BaseLoader 语义在 6.0.1 下已验证与规格一致。
- 零真人参与：全部 fixture 为合成数据；无网络调用、无 Token、无真实仓库依赖。
- 规格文件未修改：`P020_PROJECT_BOOK.md` SHA-256
  `028c24720e0780542217719f6e9b14c0fe22b31b79c662520441c2116262b8de`，
  `P020_IMPLEMENTATION_PLAN.md` SHA-256
  `bb645205174eca1d111687928c41505407392d0eefd1281455a776273aaa1e0e`，与任务
  卡一致。

## 8. 未解决项

- 无未解决的 T002 阻塞项。通过标准 8 项全部满足。
- 已知边界（留待后续任务，非 T002 缺陷）：
  - Oracle CLI 目前只支持 T002 解析器套件与 T003 job-check 套件两种
    `schema`；完整 CLI（diff/gate 模式）是 T004 的工作。
  - Glob 子集冻结为 `*`、`**`、`**/`、`?`、`[...]`；花括号展开、extglob、
    转义、POSIX 类一律 UNKNOWN，未扩大支持范围。
  - `cli.py` 为 T002/T003 共享入口文件；后续任务修改它时需保持两种
    `schema` 的分发行为（T002 与 T003 的验收命令均依赖它）。
