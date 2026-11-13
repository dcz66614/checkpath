# T008 未决项（unresolved items）

共 5 项：1 项新发现的 TS↔Oracle 实现分歧（需 ADR），其余为工程归属 / 口径协调事项与结转项。无规格错误，未阻塞验收。

## U-01（新）：空值事件 `on: { pull_request: }` 的 TS↔Oracle 分歧 — 需 ADR

- 内容：workflow 写 `on:` 下 `pull_request:` 且无任何子键（空值）时，两实现判定不同：
  - TypeScript（`yaml` 包）：空值解析为 null → 该事件无过滤器 → trigger VALID。
  - Python Oracle（`yaml.BaseLoader`）：空值解析为空字符串 `''` → `parser.py` 的 `event_config_not_mapping` → trigger INVALID，jobs 随之 INVALID / `trigger_invalid`，checks 随之 INVALID / `provider_invalid`。
  - 复现：`python3 -c` 对 `tests/fixtures/checks/T8-10-…/workflow.yml` 的旧版（空值写法）调 `evaluate_e2e_fixture`，jobs 行 status 为 INVALID / trigger_invalid；同输入的 TS 侧为 REPORTABLE_PENDING。首轮 `oracle:diff:checks` 因此出现 7 个 mismatch。
- 处理：本任务未改 Oracle 核心算法、未改 TS 解析器。10 个 T8 夹具改用语义等价且两边一致的 `pull_request: {}`（空映射）写法；复跑后 46/46、0 mismatch。分歧本身如实记录在此，不藏匿。
- 判定建议（待 ADR）：按 GitHub 语义，空值事件是合法写法（表示“该事件无过滤器”），Oracle 侧应把 `''` 视同无配置（与 `None` 同等处理），而不是判 INVALID；若 ADR 反而冻结口径为 INVALID，则需同步改 TS 解析器。无论哪边改，都须同步补一个 trigger 层夹具（空值事件正例）并重跑 trigger/jobs/checks 三路差分。
- 归属：T011（或 ADR 流程）认领；本任务不解决。
- 状态：OPEN。

## U-02：T011 协调口径 — checks 套件复用

- 内容：T8-01…T8-10（`tests/fixtures/checks/`，suite `checkpath.checks-suite/v1`）已登记预期 checks 行；T011（Golden 回归）扩充 golden 套件时应复用/引用这些 case id 与预期语义，不要另造口径不一致的 resolver 夹具；若 T011 把 checks 套件整体并入 golden，应保持 case id（T8-01…T8-10）与预期语义不变。
- 内容（keyed 字段）：`KeyedRequiredCheckResult` 的 `provider_workflow_path` / `provider_key` / `provider_keys` 是 T008 新增的报告层字段，不在 Oracle 对照形状内（差分时经 `toBaseCheckResult` 投影去掉）；T010 报告构建时如需采用，以 `KeyedRequiredCheckResult` 为准，不要把这三个字段抄进 Oracle 对照。
- 状态：OPEN（待 T011 认领）。

## U-03：T006 未决项结转 — Oracle `diff_boundary` 取值差异

- 内容：Python Oracle 的 `diff_boundary` 只报告 timeout / push>1,000 / 未确认 first-3000 三种，确认截断时返回 null；正式层 `annotateDiffBoundary` 另增 `"first_3000_truncated"`。`e2e.ts` 保持 Oracle 兼容的三值标注，未改。
- 归属：T010 报告构建时如需在 ReportV1 中呈现截断标注，需先定口径（ADR 或 T010 任务内决定）。
- 状态：OPEN。

## U-04：T006 未决项结转 — `complete: false` 不参与判定

- 内容：两实现当前一致的行为（有测试锁定），不是本任务新发明的规则；若未来 GitHub 语义要求 `complete: false` 本身触发 always-run/UNKNOWN，需走 ADR 并同步改 TS 与 Oracle。
- 状态：OPEN。

## U-05：T005 未决项结转

- U-02（`JobStatus` / `CheckStatus` 双份定义）：已全部关闭——JobStatus 侧由 T007 关闭，CheckStatus 侧由本任务关闭（`check-resolver.ts` 直接 import types.ts；`job-dag.ts` 的 `CheckStatus` re-export 已删除）。CLOSED。
- U-03（`e2e.ts` 内联 canonical/sha256 副本，归属 T010）、U-04（`report_sha256` 不重算验证，归属 T010/T014）仍 OPEN；U-01 已由 T006 关闭。
- 状态：U-02 CLOSED；U-03、U-04 OPEN。
