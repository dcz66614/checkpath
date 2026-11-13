# T005 — Canonical IR、Schema 与输入验证 任务报告

- **项目：** P020 CheckPath
- **任务：** T005（实施计划 §6，S1 第一项）
- **Base commit：** `2124367`（T004；S0 PASS）
- **日期：** 2026-11-08（UTC）
- **结论：PASS — 四个 schema 正式化完成；验收命令全部 exit 0；S0 回归 47/47 保持通过，Oracle 24/24 一致，S0_GATE 仍为 PASS。**

## 1. 交付内容

| 文件 | 说明 |
|---|---|
| `src/core/types.ts` | 四个 schema 的正式 TypeScript 契约：`WorkflowIR`（`checkpath.workflow-ir/v1`）、`ScenarioV1`（`checkpath.scenario/v1`）、`RequiredChecksV1`（`checkpath.required-checks/v1`）、`ReportV1`（`checkpath.report/v1`），以及 `JobStatus` / `CheckStatus` / `TriggerStatus` / `WitnessKind` / `ValidationIssue` / `ValidationResult` |
| `src/core/validate.ts` | 四个验证器 `validateWorkflowIR` / `validateScenario` / `validateRequiredChecks` / `validateReport`，另加 `validateJsonText`（`invalid_json`）与 `formatIssues`；9 个稳定错误码；未知字段严格拒绝 |
| `src/core/canonical-json.ts` | 正式的 canonical JSON 实现（§8 哈希合同；算法与 S0 已验证的 `e2e.ts` 内联实现逐字节一致） |
| `src/core/sha256.ts` | `sha256Hex` / `sha256Canonical`（同上） |
| `tests/unit/schema/schema.test.ts` | 26 个测试：四个冻结版本号、WorkflowIR 契约与全部失败类、验证器永不抛异常、issue 顺序确定性 |
| `tests/unit/schema/canonical-json.test.ts` | 7 个测试：canonical 向量、SHA-256 已知向量、复算冻结的 E2E-01 `input_sha256` |
| `tests/unit/validation/scenario.test.ts` | 15 个测试：§6.1 示例、push（two-dot）形态、全部 24 个 S0 scenario 接受性回归 |
| `tests/unit/validation/required-checks.test.ts` | 10 个测试：§6.2 示例、`source` 默认值、外部 source 结构有效、全部 24 个 S0 manifest 接受性回归 |
| `tests/unit/validation/workflow-ir.test.ts` | 7 个测试：归一化（`needs` 默认为 `[]`、空 `if` 为 null、merge_group 形态） |
| `tests/unit/validation/report.test.ts` | 12 个测试：最小/完整 ReportV1、哈希格式、provider_count 一致性、witness 嵌套 scenario 路径重定位 |
| `tests/unit/t005-fixtures.ts` | 测试共享的合法输入（非测试文件，vitest 不收集） |
| `evidence/tests/T005_REPORT.md` | 本报告 |

未修改：`src/core/workflow-parser.ts`、`job-dag.ts`、`check-resolver.ts`、`e2e.ts`（PoC 行为原样保留，归属 T006–T008/T010）、全部 S0 fixtures、全部 S0 证据文件（见 §6）、规格文件（SHA-256 见 §6）、Oracle（未动）、CLI/UI、`package.json` 脚本名、LICENSE（仍为 `PENDING_SAM_DECISION`，未写任何许可证名称）。

## 2. 契约决策（写在 `types.ts` / `validate.ts` 头注释中，测试锁定）

**四个 schema 版本固定**（T005 通过标准）：`checkpath.workflow-ir/v1`、`checkpath.scenario/v1`、`checkpath.required-checks/v1`、`checkpath.report/v1`；错误的 `schema` 值产生 `invalid_schema_version`，缺失产生 `missing_field`。

**稳定错误码（9 个）**：`missing_field`、`wrong_type`、`invalid_schema_version`、`invalid_value`、`unknown_field`、`duplicate_value`、`unknown_reference`、`inconsistent_value`、`invalid_json`。验证器一次收集全部 issue，按 schema 声明顺序 + 数组下标顺序确定性排列；对畸形输入永不抛异常（`null` / 数字 / 字符串 / 数组均返回 issue）。

**未知字段严格拒绝**：四个 schema 的每一层（顶层、event、diff、job、on 条目、report 各条目、witness）出现契约外字段即 `unknown_field`。理由：本契约中每个字段都可能影响触发/Job/check 判定，不存在可安全静默丢弃的字段；不存在忽略白名单。

**WorkflowIR（JSON IR，非 YAML）**：事件过滤字段用下划线命名（`branches_ignore` / `paths_ignore`），与 S0 PoC 的 `TriggerEventConfig` 一致；YAML 的连字符形式（`branches-ignore`）是解析器（T006）的翻译职责，不属于 IR 契约。Job 的 `context` 为 IR 必需字段，且必须等于 `name ?? id`（§4.5 推导规则），否则 `inconsistent_value`；`needs` 引用未声明的 job id 产生 `unknown_reference`；重复 job id / 重复 `on` 事件名 / 重复 `needs` 条目产生 `duplicate_value`；`branches` 与 `branches_ignore`（`paths` 与 `paths_ignore`）同时出现产生 `inconsistent_value`（§1 决策 6）；`source_path` 必须为工作区相对路径（拒绝绝对路径、反斜杠、`..` 段，§6.3）。

**ScenarioV1**：必需字段仅为 `schema` / `scenario_id` / `event` / `event.name` / `diff` / `diff.algorithm` / `diff.changed_files`；其余 event/diff 字段缺失时归一化为 `null`（`commit_message` 缺失归一化为 `""`）。事件名非法（非 push/pull_request/merge_group）为 `invalid_value`。按事件类型区分的分支字段（PR→`base_branch`、push→`branch`、merge_group→`target_branch`）在 schema 层不做必填要求——缺失的分支/action 在求值层按 PoC 行为输出 UNKNOWN（`triggered: null`），而不是 schema 层的 INVALID；这是有意的分层：schema 管结构，求值管“能否判定”。diff 算法与事件必须一致（push→`two-dot`，其余→`three-dot`，§4.3），否则 `inconsistent_value`；`changed_files_total` 不得小于已列文件数，`returned_files` 不得超过 `changed_files_total`，否则 `inconsistent_value`；计数为负或非整数为 `invalid_value`。注意：`returned_files` 不要求等于 `changed_files.length`——S0 的 CP-L fixture（E2E-16）只列 2 个文件而 `returned_files=3000`，强制相等会错误拒绝合法 fixture。

**RequiredChecksV1**：`context` 必需非空；`source` 缺失时默认为 `"github-actions"`；重复 context 为 `duplicate_value`；空数组结构有效。外部 source（如 `third-party-app`）结构有效——解析器按 §4.5 将其映射为 UNKNOWN，不是 schema 错误。

**ReportV1（§6.3）**：必需字段为 `schema` / `tool_version` / `scenario_id` / 四个哈希 / 六个数组 / `unsupported_features`；四个哈希只做格式检查（小写 64 位十六进制），不重算 `report_sha256`（重算属于报告构建器 T010 与冻结 T014）。`required_check_results` 的 `provider_count` 与 provider 身份必须一致：0 → 无 provider 身份；1 → 必须有 `provider_job_id` 与 `provider_workflow_path`；≥2（AMBIGUOUS）→ 不得指定单一 provider，否则 `inconsistent_value`。witness 的嵌套 `scenario` 用 `validateScenario` 递归验证，issue 路径重定位到 `$.witnesses[i].scenario.…` 之下。

**归一化**：单字符串过滤值归一化为单元素列表（与 S0 parser 的 `stringOrList` 一致）；job 的空/空白 `if` 归一化为 `null`（与 S0 job 求值器一致）；`types` / `branches` 等缺失归一化为 `null`，`needs` 缺失归一化为 `[]`。

**canonical JSON / SHA-256**：`canonical-json.ts` 与 `sha256.ts` 是 §8 哈希合同的正式归宿，算法从 S0 已验证的 `e2e.ts` 内联实现逐字迁移（键递归排序、分隔符 `,`/`:`、UTF-8、非 ASCII 不转义、无尾换行）；`e2e.ts` 的内联副本未动，S0 行为不受影响。最强验证：用 fixture 文件重建 E2E-01 的输入对象并哈希，复算出冻结的 `input_sha256`（`0cf82e76…`，与 Python Oracle 在 T004 独立算出的一致）。

## 3. 验收命令（真实运行）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run typecheck` | 0 | `tsc --noEmit` 通过 |
| `npm run test:schemas` | 0 | 2 个文件，33/33 通过 |
| `npm run test:validation` | 0 | 4 个文件，44/44 通过 |
| `npm run test`（回归） | 0 | 9 个文件，124/124 通过（S0 的 47/47 全部保持通过 + 新增 77） |
| `npm run lint`（附加） | 0 | `eslint src tests scripts` 通过（初版 4 个 lint 错误已修复：1 个 prefer-const + 3 个未使用解构变量） |
| `npm run s0:oracle`（回归） | 0 | 24/24 fixtures，TS 与 Oracle 逐字段一致，mismatch 0，false PASS 0，unsupported→UNKNOWN 2/2 |
| `npm run s0:gate`（回归） | 0 | `evidence/S0_GATE.json` status 仍为 `PASS`（见 §6） |

日志：`handoff/P020-T005/test_logs/`（各命令完整输出）。

## 4. 通过标准逐项核对

- 四个 schema 版本固定为 `checkpath.workflow-ir/v1`、`checkpath.scenario/v1`、`checkpath.required-checks/v1`、`checkpath.report/v1`：是，`types.ts` 常量 + `schema.test.ts` 冻结测试。
- 缺失必需字段、错误类型、非法事件、重复 Job id、未知引用均产生稳定错误码：是，`missing_field` / `wrong_type` / `invalid_value` / `duplicate_value` / `unknown_reference`，各有测试锁定 code 与 path。
- 未知字段按契约明确拒绝或保留，不得静默丢弃影响判定的字段：是，全部层级严格拒绝（`unknown_field`），契约头注释写明理由；无忽略白名单。
- 所有 schema tests 通过：是，33 + 44，退出码 0。

## 5. 修复记录（诚实说明）

1. 首轮 `test:schemas` 7 失败 + `test:validation` 1 失败：`validateWorkflowIR` 的允许字段表误用 YAML 连字符键（`branches-ignore`），而 IR 契约本身用下划线（`branches_ignore`，与 PoC `TriggerEventConfig` 一致）。修复：验证器改用下划线键；测试未改。复跑后 33/33、44/44。
2. 首轮 `typecheck` 2 处失败：`validate.ts` 交叉检查块编辑后少一个闭合括号；测试中对字面量类型 fixture 的赋值。修复后通过。
3. 首轮 `lint` 4 错误（见 §3），已修复，复跑为 0。

## 6. S0 证据完整性

回归前对 `evidence/` 全部 36 个文件取 SHA-256 快照；回归后复核：

- `npm run s0:oracle` 与 `npm run s0:gate` 重新生成了 `evidence/s0/S0_ORACLE_REPORT.json`、`S0_DETERMINISM_REPORT.json`、`evidence/S0_GATE.json`——复核结果为字节一致（确定性报告无时间戳，T004 已声明），`S0_GATE.json` status 仍为 `PASS`，`gate_report_sha256` 仍为 `f511a847…`（可复算，见下）。
- 唯一变化的是 gitignored 的 `*.log`（vitest 日志含耗时），不属于已提交的 S0 证据；已提交的 S0 证据文件无任何字节变化。
- S0 fixtures 未动；规格文件未动：`P020_PROJECT_BOOK.md` SHA-256 `028c2472…`，`P020_IMPLEMENTATION_PLAN.md` SHA-256 `bb645205…`（与立项记录一致）。
- S0_GATE 复算命令：`python3 -c "import json,hashlib; d=json.load(open('evidence/S0_GATE.json')); h=d.pop('gate_report_sha256'); print(hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()); print('recorded:',h)"` → 两者均为 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`。

## 7. 未决项（见 `handoff/P020-T005/unresolved_items.md`）

1. `src/core/workflow-ir.ts` 仍为 T001 空骨架：YAML→WorkflowIR 的构建器（组合 `parseWorkflowYaml` + job 提取）未在本任务实现。WorkflowIR 契约（`types.ts`）与验证器（`validate.ts`）已交付；构建器归属 T006（触发求值器正式化，拥有 `workflow-parser.ts`），避免在本任务复制解析逻辑造成第二事实来源。
2. `JobStatus` / `CheckStatus` 在 `types.ts` 与 PoC 的 `job-dag.ts` 中各有一份相同定义：T007/T008 正式化时把 PoC 模块 re-base 到 `types.ts`，消除重复（本任务未动 PoC 文件）。
3. `canonicalJson` / `sha256Hex` 在 `e2e.ts` 仍有一份 S0 已验证的内联副本：T010 报告构建时可改为引用 `canonical-json.ts` / `sha256.ts`，须以 S0 回归（47/47 + Oracle）验证行为一致；本任务未动 `e2e.ts`。
4. `ReportV1.report_sha256` 的重算验证（canonical report 去掉自身哈希字段后哈希）不在 schema 验证范围内，归属 T010/T014。
5. 规范层面无未决项：本次未发现规格错误，因此未停下；以上 4 项均为工程归属/去重事项，不是规格问题。
