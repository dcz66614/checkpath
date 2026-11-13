# T013 R15 独立探针

自写探针（`gen-cases.py` 生成 `cases.json`，`r15-probe.py` 运行），
形状按 R14 复核报告 §2/§2.5 与 FIX-P0-15 报告 §2/§7 原文重建，
锚名/值/事件均不同（`&b`/`&c`/`&z`，值 2/7/9，事件 `pull_request`），
未复制修复方 `cases.json`。

- `cases.json`：61 行（× trigger/jobs 双模式 = 122 检查）。
- `r15-probe.py`：与 R14 探针同构（esbuild 打包 TS 探针入口，
  双边全 JSON 深比对）；`diff_modes` 字段逐模式标注预期 DIFF
  （残留行 trigger 与 jobs 的预期可以不同）。
- `parser-probe.py` / `parser-probe.mjs`：解析器层最小复现
  （PyYAML `_StrictBaseLoader` 与 npm `yaml` 包直接对照），
  输出 `parser-probe-py.json` / `parser-probe-npm.json`。

结果：**98/122 MATCH，24 DIFF，全部为预期残留行**（exit 0；
两次重跑 `results.json` md5 一致）。24 处 DIFF = §2 的 3 个 P0 家族：

### T014 闭合（2026-11-10）

上述 13 个残留行（24 处预期 DIFF 检查）已被后续修复闭合。R19 重跑
（2026-11-09）验证 **122/122 MATCH，0 DIFF，24 处全部 stale**；清除
期望后重跑仍为 **122/122 MATCH，0 stale，exit 0**，`results.json`
记 122 检查 / 122 match / 0 diff。`cases.json` 中全部行的
`expected_diff` 现为 `false`、`diff_modes` 为空。以上 R15 当时结果
保留为历史记录；下表仍列出原始残留机制。

| 家族 | 行 | 检查 |
|---|---|---:|
| P0-1 C3 越界（tag + unglued anchored 空键） | 3（根首对为本轮新发现） | 6 |
| P0-2 扫描器层 `&x:!!str` 无空格 | 2 | 3 |
| P0-3 loader 边界（标量 tag 在集合值上） | 8（`on:` 值位置为本轮新发现） | 15 |

其余 98 检查全部 MATCH：R14 的 5 个 P0 家族（重建形状）、
R13 lone-doc P0 对照、`"": 1` 与映射值对照、(d) tag 护栏边界、
C3 豁免形状等。
