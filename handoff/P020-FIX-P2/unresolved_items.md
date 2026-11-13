# P020 FIX-P2 — 未决项

- 无。本次 6 项 P2（P2-1、P2-3、P2-4、P2-5、P2-6、P2-7）全部修复并验收通过；
  回归确认 P2-2（FIX-P0-01 的 e2e.ts 注释）、P2-8 余部（README 语义句）、
  P2-9 余部（release-verify 三个 smoke）仍关闭。
- 已知限制（非未决修复，按 ADR 登记）：
  - ADR FIX-P2/01：duplicate-key YAML 分歧维持现状——TS 侧 INVALID（产品侧
    fail-closed 规则）、Oracle 侧 last-wins（参考行为）；夹具与测试锁定在
    tests/fixtures/parser-divergence/duplicate-key/ 及
    tests/unit/diff-boundaries/duplicate-key-yaml.test.ts。见 TASK_REPORT §5。
  - README 性能数字为单次实测快照（本次两次运行：P95 756.0 ms / 98.4 MiB
    与 794.5 ms / 94.2 MiB，均为 1 warmup + 31 runs；README 取最后一次
    794.5 / 94.2，测量条件已注明）。运行间抖动属机器计时方差，两次均远
    低于阈值（P95 ≤ 1000 ms、RSS ≤ 256 MiB）。
- 沿用 T013 的遗留项（本次不处理）：U-01 Windows PowerShell Quick Start
  NOT_TESTED；U-02 dist.zip node checkpath.mjs demo 未端到端验证。
