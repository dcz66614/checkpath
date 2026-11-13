# T013 R16 独立探针（FIX-P0-16 复核）

复核员自写探针，全部形状均为本轮新写（未复制修复方 `cases.json` /
网格）：R15 的 13 个残差行用新标识符重建（锚 `&q/&w/&z`、值 3/7/9、
事件 `schedule/workflow_dispatch/push`、标签 `!zap/!qux`），FIX-P0-16
报告 §2.1–§2.4 的判别式/边界控制，(c) × `!foo &b:!!str` 交互边，
新狩猎形状，R13 §4.2 豁免边重建，R14 五族抽查重建；另有 N 组为本轮
发现的 2 个新 P0 家族的边界映射。

- `gen-cases.py` — 生成 `cases.json`（181 形）。
- `r16-probe.py` — 驱动：esbuild 打包 TS 探针（临时目录），每形
  trigger + jobs 双模式跑 TS bundle 与 Oracle 驱动，全 JSON 深比较。
  任何 DIFF 均为 UNEXPECTED（本轮无 expected_diff 行）。
- `parser-probe-r16.py` / `parser-probe-r16.mjs` — 解析器层最小复现：
  PyYAML（`_StrictBaseLoader`，mirror 生效）token 流 + load 结果，
  对 npm `yaml` parseDocument/parse 结果。
- `results.json` — 本轮重跑结果：**331/362 MATCH，31 DIFF**（全部
  属于 §2 的 2 个新 P0 家族；其余 331 检查全部 MATCH）。
- `grid-rerun-results.json` — fix-p0-16 网格重跑：**238/238 MATCH**。
- `r15-results-as-committed.json` — FIX-P0-16 提交的 r15 results.json
  原样备份（122/0）；本轮 r15 探针重跑结果见 `reruns/r15-results.json`。
- `reruns/` — 本轮重跑的 R10–R15 探针与十二矩阵 `results.json` 副本
  （原件已 `git checkout` 恢复）。

## 复现

From the repo root, after `npm ci`:

    python3 evidence/probes/r16/gen-cases.py
    python3 evidence/probes/r16/r16-probe.py
    python3 evidence/probes/r16/parser-probe-r16.py [shape-id ...]
    node evidence/probes/r16/parser-probe-r16.mjs [shape-id ...]

## 结论（见 evidence/review/INDEPENDENT_REVIEW_R16.md）

- R15 的 3 个 P0 家族已全部关闭（R15 探针重跑 122/122，24 处 FLAG STALE
  属预期；本轮 A 组 13 行重建 26/26 MATCH）。
- 新发现 P0 **2 项**（16 形，31 检查），均在 ba71eed（修复前）已分歧，
  非 FIX-P0-16 引入的回归：
  - **P0-A**：mirror 的别名键豁免过度——`&q:!!str *w: 2`（别名作键）
    时 mirror 不触发，PyYAML 把 `:!!str *w` 读成普通标量键而接受，
    npm 则拒收（alias 不得带属性）。7 形 13 检查。
  - **P0-B**：anchor 名含 `:`（`&q:2` / `&q:foo`）后接映射时，
    npm 把整个 `q:2` 吸进 anchor 名并接受，PyYAML 锚名字符集不含
    `:` 而 ScannerError。根位置 TS VALID/UNKNOWN vs Oracle INVALID；
    值位置与流位置方向相反。9 形 18 检查。
