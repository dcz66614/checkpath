# T013 R19 独立复核探针（复核员自写）

干净克隆 `~/workspace/p020-r19-review`（HEAD `9dac3e1`），全部亲自跑。

## 文件

- `gen-cases.py` — 生成 `cases.json`（30 形，60 检查；狩猎探针）。
- `cases.json` / `results.json` — 狩猎探针用例与结果：**60/60 MATCH，0 DIFF**。
  驱动复用 R18 的 `../r18/r18-probe.py`（esbuild 打包 TS 探针 + Oracle
  双驱动，全 JSON 深比较；trigger 模式比较完整 TriggerIR，jobs 模式
  比较完整 job list）。用法：
  `python3 ../r18/r18-probe.py cases.json results.json`。
- `parser-probe-p19-r19.txt` / `parser-probe-p19b-r19.txt` — 修复方
  解析器层探针（`../fix-p0-19/parser-probe-p19.py` /
  `parser-probe-p19b.mjs`）本轮重跑输出：F1–F8 全部 PyYAML
  LOAD-ERROR `duplicate mapping key`；B11–B18 规范折叠与报告 §3 一致。
- `reruns/` — 本轮重跑的全部结果副本：R10–R17 探针、十二矩阵、
  fix-p0-16/17/18/19 网格、R18 狩猎/裁决/裁决 2（矩阵结果为行列表
  格式，`checks[mode].match` 计；R5 子集为 fix-p0-04 前 66 行，66/66）。

## 狩猎探针设计（30 形，60 检查）

聚焦修复方未曾端到端探查的形状组合：显式 `?` 键（流式与块式，
H1–H4）、跨映射不重复（H5、H19、H24）、序列内双流映射（H6）、
三冒号吸入别名键（H7–H8）、规范折叠（`.inf`、`0` vs `false`、
quoted、`'1'` vs `1`、`True` vs `1`、`~` vs `null`、`.nan`，
H9–H12、H16、H22、H26–H29）、`on:` / `jobs:` 内重复（H13–H15、
H25）、同一流映射内锚后定义（H17）、双锚同值（H18）、嵌套值 /
深嵌套 / step 的 `env:`（H20、H21、H30）、流内注释（H23）。

负向控制形（H5、H10、H11、H12、H14、H19、H22、H24、H26–H28）
全部双边 VALID，证实新规则无误伤；重复形全部双边 INVALID /
`yaml_parse_error`，证实无漏判。详见评审报告 §2。
