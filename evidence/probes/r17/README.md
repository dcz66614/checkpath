# T013 R17 探针说明

复核员自写探针（全新会话，与修复方、R16 复核员隔离）。驱动模式与
R16 探针相同：esbuild 打包 TS 探针入口（临时目录，不入工作树），
对同一 YAML 分别跑 TS bundle 与 Oracle 探针驱动
（`scripts/oracle-parse-probe.py` / `scripts/oracle-jobs-probe.py`），
深比较完整 JSON（trigger 模式比整个 TriggerIR，jobs 模式比整个
job 列表）。任何 DIFF 均为候选新 P0，不得以"预期"放行。

- `gen-cases.py` / `cases.json` — 76 形，141 检查：
  - H1 `!` 守卫 / tag 终结（R16 §2.5 修正的独立验证）
  - H2 吸入运行字符 / 终结符（修复者网格未覆盖者）
  - H3 别名吸入（已解析的吸入别名、别名键后接 tag）
  - H4 规则 (ii) 键位置边界
  - H5 规则 (iii) flow 空键边界
  - H6 C3 × 吸入交互
  - H7 lone 文档变体
  - H8 **新 P0 家族**：吸入冒号别名在非键位置（9 形，17 检查 DIFF）
- `r17-probe.py` / `results.json` — 124/141 MATCH，17 DIFF（全部为 H8 家族）
- `parser-probe-r17.py` / `parser-probe-r17.mjs` — 解析器层双边对照
  （`_StrictBaseLoader` token 流 + load 结果 vs `yaml` 包
  `parseDocument` anchor/errors），输出 `parser-probe-py.txt` /
  `parser-probe-mjs.txt`
- `alias-key-probe.mjs` — 别名键位置解析器层对照
- `alias-family-e2e.py` / `alias-family-results.txt` — H8 家族边界映射
  （15 形，端到端 trigger 模式）
- `alias-key-e2e.py` — H8 隔离实验（8 形）
- `tag-term-e2e.py` / `tag-term-results.txt` — tag 终结符边界（7 形）
- `rerun-log.txt` / `rerun-log2.txt` — 重跑电池日志（验收 + R16 探针 +
  R10–R15 探针 + 十二矩阵 + 两网格；part 1 在 fix-p0-07 处被运行时
  杀死后由 part 2 续跑完成，数字以结果文件为准）
- `grid-rerun-results.json` — fix-p0-16 网格重跑（238/238）

复现（克隆根目录，`npm ci` 后）：
    python3 evidence/probes/r17/gen-cases.py
    python3 evidence/probes/r17/r17-probe.py
