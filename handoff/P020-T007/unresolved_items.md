# T007 未决项（unresolved items）

共 5 项，均为工程归属 / 口径协调事项，无规格错误，未阻塞验收。

## U-01：T008 承接 — CheckStatus re-export 与 resolver 侧键

- 内容：`JobStatus` / `CheckStatus` 在 `types.ts` 与 PoC `job-dag.ts` 的双份定义（T005 U-02），本任务关闭了 JobStatus 侧：`job-dag.ts` 不再定义这两个 union，改为自 `types.ts` 的纯 re-export。`CheckStatus` 的 re-export 只是过渡——T008 正式化 resolver 时把 `check-resolver.ts` 改为直接 `from "./types.js"` import，并删掉 `job-dag.ts` 的 `CheckStatus` re-export。
- 内容（键）：S0 遗留项 ② 的 DAG 侧已落地（`src/core/job-dag.ts`：`JobKey` / `jobKey` / `parseJobKey` / `evaluateJobsKeyed` / `evaluateJobsForTrigger`，见 `evidence/tests/T007_REPORT.md` §2）；resolver 侧（keyed provider 的 context 匹配）归属 T008，本任务未动 `check-resolver.ts`。
- 状态：OPEN（待 T008 认领）。

## U-02：T011 协调口径 — jobs 套件复用

- 内容：T7-01…T7-12（`tests/fixtures/jobs/`，suite `checkpath.jobs-suite/v1`）已登记预期 jobs 行；T011（Golden 回归）扩充 golden 套件时应复用/引用这些 case id 与预期语义，不要另造口径不一致的 DAG/`if` 夹具；若 T011 把 jobs 套件整体并入 golden，应保持 case id（T7-01…T7-12）与预期语义不变。
- 状态：OPEN（待 T011 认领）。

## U-03：T006 未决项结转 — Oracle `diff_boundary` 取值差异

- 内容：Python Oracle 的 `diff_boundary` 只报告 timeout / push>1,000 / 未确认 first-3000 三种，确认截断时返回 null；正式层 `annotateDiffBoundary` 另增 `"first_3000_truncated"`。`e2e.ts` 保持 Oracle 兼容的三值标注，未改。
- 归属：T010 报告构建时如需在 ReportV1 中呈现截断标注，需先定口径（ADR 或 T010 任务内决定）。
- 状态：OPEN。

## U-04：T006 未决项结转 — `complete: false` 不参与判定

- 内容：`complete` 与 `returned_files` 不参与触发判定（见 `src/core/skip-annotation.ts` 头注释与 `evidence/tests/T006_REPORT.md` §2，T6-14/T6-15 锁定）。这是两实现当前一致的行为，不是本任务新发明的规则。
- 归属：若未来 GitHub 语义要求 `complete: false` 本身触发 always-run/UNKNOWN，需走 ADR 并同步改 TS 与 Oracle。
- 状态：OPEN（观察项，非阻塞）。

## U-05：T005 未决项结转

- U-01：已由 T006 关闭（workflow-ir 构建器）。
- U-02：JobStatus 侧由本任务关闭，CheckStatus 侧归属 T008（见本文件 U-01）。
- U-03：`canonicalJson` / `sha256Hex` 在 `e2e.ts` 仍有一份 S0 已验证的内联副本，归属 T010 报告构建时 re-base。
- U-04：`ReportV1.report_sha256` 的重算验证不在 schema 验证范围内，归属 T010/T014。
- 状态：OPEN（U-03、U-04 待认领；U-01、U-02-JobStatus 已关闭）。

## U-06：规范层面无未决项

- 本次未发现规格错误，因此未按“发现规范错误先停下”的规则停下；以上 U-01–U-05 均不是规格问题。
- 状态：CLOSED（无规格问题）。
