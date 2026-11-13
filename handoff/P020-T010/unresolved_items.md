# T010 未决项（unresolved items）

共 5 项：本任务关闭 5 项前序未决项（§1），结转 3 项不由本任务解决的已知项。无规格错误，未阻塞验收。

## U-01（已关闭，本任务）：T005 U-03 — e2e.ts 内联 canonical/sha256 副本

- 处理：删除 `src/core/e2e.ts` 内 29 行内联 `canonicalJson` / `sha256Hex`，改为 import `canonical-json.ts` / `sha256.ts` 并 re-export；`typecheck`、`s0:oracle` 24/24、`npm test` 543/543 一次通过，零行为变化。
- 状态：CLOSED。

## U-02（已关闭，本任务）：T005 U-04 — report_sha256 重算验证

- 处理：`src/report/build.ts` 的 `verifyReportHash` / `verifyReportHashes` 去掉自身字段重算并比对；构建器每次构建后自检；测试 + 独立 dist 复算锁定（demo/analyze 报告 `9dc3af31…` 与磁盘文件一致，四项全 true）。
- 状态：CLOSED。

## U-03（已关闭，本任务）：T006 U-02 — 截断标注口径

- 决定：Oracle e2e `diff_boundary` 确认截断报 null，正式层 `annotateDiffBoundary` 报 `first_3000_truncated`。ReportV1 无 `diff_boundary` 字段，T010 不新增、不抄任一取值进 JSON；HTML 以展示层标注形式显示正式层取值并注明“报告层标注，非 ReportV1 字段”。未改任一实现，故不走 ADR；决定记录在 `src/report/build.ts` 头注释与 `evidence/tests/T010_REPORT.md` §2，测试锁定。
- 状态：CLOSED。

## U-04（已关闭，本任务）：T009-U03 — 平行建议列表

- 处理：建议以平行 `WitnessRecommendation[]`（以 `witness_id` 关联）输出，不并入 `ReportWitness`；JSON 信封与 HTML 均按此结构；`ReportWitness` 形状未变。
- 状态：CLOSED。

## U-05（已关闭，本任务）：T008-U02 — KeyedRequiredCheckResult 三字段

- 处理：报告构建采用 `KeyedRequiredCheckResult`；ReportV1 只取其中本就属于冻结形状的 `provider_workflow_path`；`provider_key` / `provider_keys` 不进报告 JSON、不进 Oracle 对照；HTML 高亮用 `provider_workflow_path` + `provider_job_id`。
- 状态：CLOSED。

## U-06（结转）：T008-U01 — 空值事件分歧，待 T011/ADR

- 内容：空值事件 `on: { pull_request: }`（无子键）——TS `yaml` 解析为空值 null → VALID；Python Oracle `yaml.BaseLoader` 解析为空字符串 `''` → INVALID。本任务未动相关文件。
- 状态：OPEN（归属 T011/ADR）。

## U-07（结转）：T006 U-03 — complete: false 不参与判定，改语义需 ADR

- 内容：`complete: false` 单独出现既不强制 always-run 也不强制 UNKNOWN（两实现一致，有测试锁定）。若未来 GitHub 语义要求其本身触发 always-run/UNKNOWN，需走 ADR 并同步改 TS 与 Oracle。
- 状态：OPEN（归属 ADR）。

## U-08（结转）：T009-U01 — 冻结 WITNESS_KINDS 缺通用事件触发缺失 kind，需 ADR

- 内容：冻结枚举只有 `merge_group_missing`，非 merge_group 的 `event_mismatch` / `activity_type_mismatch` 目前归入该桶（`first_blocking_condition` / note / 建议中如实写明真实事件与 action，只有 kind 标签本身不精确）。ADR 应增加专用 kind（如 `event_trigger_missing`）；落地前不得自行改 `types.ts` 枚举。
- 状态：OPEN（归属 T011 或 ADR）。

## U-09：规范层面无未决项

- 本次未发现规格错误，因此未按“发现规范错误先停下”的规则停下；以上均为工程归属/口径事项与已结转项。
