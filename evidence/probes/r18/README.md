# T013 R18 独立复核探针（复核员自写）

干净克隆 `~/workspace/p020-r18-review`（HEAD `55bd04a`），全部亲自跑。

## 文件

- `gen-cases.py` — 生成 `cases.json`（25 形，50 检查；狩猎探针）。
- `r18-probe.py` — 通用驱动：esbuild 打包 TS 探针 + Oracle 双驱动深比较；
  用法 `python3 evidence/probes/r18/r18-probe.py [cases.json] [results.json]`。
- `cases.json` / `results.json` — 狩猎探针用例与结果：**44/50 MATCH，6 DIFF**
  （`r18-h17`、`r18-h19`、`r18-h20`，均为重复键别名家族，见评审报告 §2）。
- `results-50788a7.json` — 同一狩猎探针在基线 `50788a7` 上的结果：**40/50**，
  多出的 4 处 DIFF 为 R17 家族（`r18-h08`、`r18-h09`），证明基线切换真实生效；
  重复键家族的 6 处在两版上完全相同（预先存在）。
- `adjudication-cases.json` / `adjudication-results-55bd04a.json` /
  `adjudication-results-50788a7.json` — `c-flow-key-null-2nd` 裁决探针（11 形，
  22 检查）：**两版均为 12/22，DIFF 集逐字相同**（5 形 ×2 模式）。
- `adjudication2-cases.json` / `adjudication2-results-55bd04a.json` /
  `adjudication2-results-50788a7.json` — 补充对照（5 形，10 检查）：**两版均为
  8/10，DIFF 集逐字相同**（仅 `adj2-flow-alias-key-first-absorbed`）。
- `parser-probe-r18.py` / `parser-probe-r18.mjs` /
  `parser-probe-py.txt` / `parser-probe-mjs.txt` — 解析器层最小复现：
  PyYAML compose 把别名解析为标量后出现两个 `ScalarNode('a')` 键，
  `construct_mapping` 报 `duplicate mapping key: 'a'`；`yaml` 包 0 错误，
  静默接受（uniqueKeys 对别名盲视）。
- `reruns/` — 本轮重跑的全部结果副本：R10–R17 探针、十二矩阵、fix-p0-16/17/18
  网格（矩阵结果为行列表格式，`checks[mode].match` 计；R5 子集为
  fix-p0-04 前 66 行，66/66）。
- `logs/` — 验收电池、重跑、狩猎、裁决、三次冻结的日志。

## 关键结论

- R17 家族已关闭：R17 探针 141/141；fix-p0-18 网格 A 组 17/17、B 组 16/16。
- 新 P0 家族 1 个（见评审报告 §2）：流式映射中空值别名键解析为重复标量键，
  8 形 16 检查（去重形状；各套探针合计 20 处 DIFF 检查），两版基线逐字相同，
  预先存在，与本轮位置规则无关；根因为 TS 侧 uniqueKeys 别名盲视，
  Oracle 侧 FIX-P0-02 重复键检查在 compose 期解析别名。修复方向在 TS 侧。
- 试冻：trial 模式 manifest `5479dc8f…`（两次一致）；source.zip
  `1b527601…`（2,597 文件）、dist.zip `f2bcd53f…`（114 文件，未变）与修复方
  声称一致；修复方声称的 manifest `288d6156…` 是 formal 模式产物（未加
  `--trial`），本轮已直接复现（见评审报告 §6）。
