# T013 R13 独立探针

复核员自写探针（干净克隆 `~/workspace/p020-review-r13`，HEAD `01509e0`）。
全部形状自 R12 报告 §2/§3/§4 原文重建 + 自写边界变体，**未复制修复方
`cases.json`**。

## 内容

- `gen-cases.py` — 生成 `cases.json`（49 行）。
- `cases.json` — 49 例：P0-C1 重建 8 + both-accept 2 + 对照 4 +
  flow-KIND 判别式 5；P0-C2 重建 3 + 对照 5；P0-C3 A45 1 + 豁免边 8；
  lone-doc 2 + lone-doc 对照 5；R6 回归 5。
- `r13-probe.py` — 驱动（esbuild 打包 `fix-p0-13/ts-probe-entry.ts`，
  与 `scripts/oracle-parse-probe.py` / `scripts/oracle-jobs-probe.py`
  全 JSON 深比较）。
- `results.json` — 本轮实测结果。

## 结果（本轮亲自跑）

**96/98 MATCH，2 DIFF**：

- `r13-lone-scalar [trigger]`：`&x: 1` lone 文档，TS INVALID /
  `workflow_root_not_mapping` vs Oracle INVALID / `missing_on_key`。
- `r13-lone-null [trigger]`：`&x:` lone 文档，同上。

其余 96 检查全部 MATCH，包括 P0-C1 8 形状、P0-C2 3 形状、P0-C3 A45
及全部豁免边、flow-KIND 判别式、全部 lone-doc 对照（lone 纯量/字符串/
序列/anchored scalar/tagged scalar）、R6 5 形状。

## 用法

```sh
python3 evidence/probes/r13/gen-cases.py   # 再生成 cases.json
python3 evidence/probes/r13/r13-probe.py   # 运行并写 results.json
```

退出码：全部 MATCH 时 0，否则 1。
