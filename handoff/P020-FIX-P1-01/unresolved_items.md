# P020 FIX-P1-01 — 未决项

1. **无新增未决项。** ADR FIX-P1-01/01（validator 放行 duplicate context，选 (a)）与
   ADR FIX-P1-01/02（FIX-P0-01/04 绕过已移除）状态均为 CLOSED，见 TASK_REPORT.md §5。
2. **结转（不属本次范围）：** T013 其余 P2（P2-1/P2-3/P2-4/P2-5/P2-6/P2-7）仍待
   后续独立任务处理；本次未碰。P2-8 余部（duplicate context 表述）与 P2-9 余部
   （duplicate-manifest smoke）已由本次关闭；P2-8 的 matrix/`uses:` 部分与 P2-9 的
   U-07/U-08 部分已由 FIX-P0-01 关闭。
3. **历史记录说明：** `evidence/tests/T005_REPORT.md` 仍记载 T005 当时的 duplicate
   拒绝决策（历史报告，未改写）；现行契约以本任务的 ADR FIX-P1-01/01 为准，
   代码头注释（`validate.ts`、`types.ts`）、测试与 README 均已同步。
4. **U-01/U-02/U-03（T013/T012 结转）：** 未变，仍 OPEN，归属后续任务。
