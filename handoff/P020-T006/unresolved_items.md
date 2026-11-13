# T006 未决项（unresolved items）

共 5 项，均为工程归属 / 口径协调事项，无规格错误，未阻塞验收。

## U-01：T011 协调口径 — first_3000_confirmed=true 的截断分支夹具

- 内容：S0 遗留项 ① 要求补的截断分支夹具已补：`tests/fixtures/trigger/T6-05-first3000-confirmed-no-match/`（3,000 个 docs 文件，总数 3,500，已确认 → 不触发）与 `T6-06-first3000-confirmed-match-inside/`（第 3,000 个文件命中 → 触发），登记于 `tests/fixtures/trigger/suite.json`（case id T6-05/T6-06）。
- 归属：T011（Golden 回归）扩充 golden 套件时复用/引用这两例，不要另造口径不一致的截断夹具；若 T011 把 trigger 套件整体并入 golden，应保持 case id 与预期语义不变。
- 状态：OPEN（待 T011 认领）。

## U-02：Oracle `diff_boundary` 与正式层 `annotateDiffBoundary` 的取值差异

- 内容：Python Oracle 的 `diff_boundary` 只报告 timeout / push>1,000 / 未确认 first-3000 三种，确认截断时返回 null；正式层 `annotateDiffBoundary` 另增 `"first_3000_truncated"` 以便命名该分支。`e2e.ts` 保持 Oracle 兼容的三值标注，未改。
- 归属：T010 报告构建时如需在 ReportV1 中呈现截断标注，需先定口径（ADR 或 T010 任务内决定）。
- 状态：OPEN。

## U-03：`complete: false` 不参与判定的语义

- 内容：`complete` 与 `returned_files` 不参与触发判定（见 `src/core/skip-annotation.ts` 头注释与 `evidence/tests/T006_REPORT.md` §2，T6-14/T6-15 锁定）。这是两实现当前一致的行为，不是本任务新发明的规则。
- 归属：若未来 GitHub 语义要求 `complete: false` 本身触发 always-run/UNKNOWN，需走 ADR 并同步改 TS 与 Oracle。
- 状态：OPEN（观察项，非阻塞）。

## U-04：T005 未决项结转

- U-02：`JobStatus` / `CheckStatus` 在 `types.ts` 与 PoC `job-dag.ts` 中双份定义，归属 T007/T008 正式化时消除。
- U-03：`canonicalJson` / `sha256Hex` 在 `e2e.ts` 仍有内联副本，归属 T010 报告构建时 re-base。
- U-04：`ReportV1.report_sha256` 不重算验证，归属 T010/T014。
- 状态：OPEN（本任务未动相关文件）。

## U-05：规范层面无未决项

- 本次未发现规格错误，因此未按“发现规范错误先停下”的规则停下；以上 U-01–U-04 均不是规格问题。
- 状态：CLOSED（无规格问题）。
