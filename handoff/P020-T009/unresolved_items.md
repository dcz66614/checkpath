# T009 未决项（unresolved items）

共 5 项：1 项新发现的冻结枚举缺口（需 ADR），1 项计划脚本偏差（已处理、留档），1 项 T010 协调口径，另结转 T008/T006/T005 的未决项。无规格错误，未阻塞验收。

## U-01（新）：冻结的 `WITNESS_KINDS` 没有通用“事件触发缺失” kind — 需 ADR

- 内容：冻结枚举只有 `merge_group_missing`，没有通用的事件触发缺失 kind。非 merge_group 的 `event_mismatch` / `activity_type_mismatch`（如 pull_request types 不匹配）目前归入 `merge_group_missing` 桶；`first_blocking_condition` / note / 建议中均如实写明真实事件与 action，只有 kind 标签本身不精确。
- 复现：`tests/fixtures/witness/T9-18/expected.json`（fbc activity_type_mismatch，kind merge_group_missing）与 `T9-19/expected.json`（fbc event_mismatch，kind merge_group_missing）；S0 的 E2E-05 亦同。
- 判定建议（待 ADR）：增加专用 kind（如 `event_trigger_missing`）；在 ADR 落地前不得自行改 `types.ts` 枚举。改动后须同步改 TS 与 Oracle 两侧的 kind 映射、补夹具并重跑 witness 差分。
- 归属：T011（或 ADR 流程）认领；本任务不解决。
- 状态：OPEN。

## U-02（计划脚本偏差，已处理，留档）：`test:witness:determinism` 的计划命令不可执行

- 内容：实施计划 §7 把 `test:witness:determinism` 写为 `vitest run tests/unit/witness --repeat=100`，但 vitest 5.1 不存在 `--repeat` 选项（实测 `CACError: Unknown option '--repeat'`）。
- 处理：命令改为 `vitest run tests/unit/witness/witness-determinism.test.ts`，100 次重复在测试文件内循环执行；脚本名与 PASS 语义（100 次、1 个哈希）不变。T011 若发现计划其他脚本存在同类问题，按同一方式处理并留档。
- 状态：CLOSED（已处理；本条留档供 T011 核对）。

## U-03：T010 协调口径 — witness 形状复用

- 内容：`ReportWitness`（types.ts 冻结形状）未变——witness 输出为 `{id, kind, check_context, first_blocking_condition, scenario, note}`；建议以平行列表 `{witness_id, rule_id, kind, check_context, recommendation}` 输出，不并入 witness 对象。T010 报告构建时以 `witness_id` 关联两者；如需把建议并入报告 JSON，字段名以 `WitnessRecommendation` 为准。`witness-001…` 的编号只在单 case 内按 manifest 顺序从 001 起编，跨 case 不保证全局唯一。
- 状态：OPEN（待 T010 认领）。

## U-04：已知未决项结转（不由本任务解决）

- T008-U01（空值事件 `on: { pull_request: }` 的 TS↔Oracle 分歧，待 T011/ADR）。
- T006 U-02（diff_boundary 取值差异，待 T010）、U-03（complete: false 不参与判定，需 ADR）。
- T005 U-03（e2e.ts 内联 canonical 副本，归属 T010）、U-04（report_sha256 重算，归属 T010/T014）。
- 状态：OPEN（按原归属）。

## U-05：规范层面无未决项

- 本次未发现规格错误，因此未按“发现规范错误先停下”的规则停下；以上均为工程归属/口径事项与一项冻结枚举缺口（U-01）。
