# T013 R14 复核摘要 — FIX-P0-14（R13 lone-doc P0）

- **审查对象**：代码提交 `45487eb`（FIX-P0-14；相对 `a8c120b`，33 文件，+3250/−134）。终报提交 `df53e88` 只含文本，不在审查范围。
- **复核环境**：干净克隆 `~/workspace/p020-review-r14/`（`git checkout 45487eb`），全部命令亲自跑；未与修复并行同一工作树。
- **结论：NOT PASS — P0 5 / P1 0 / P2 8。**

## 已关闭（已验证）

- R13 的 lone-doc P0（`&x: 1` / `&x:` 单独成文档）已关闭：本轮独立重建（`&a: 7` / `&a:`）4/4 MATCH；R13 探针重跑 98/98 MATCH（原 96/98）；新矩阵 103/114 MATCH。
- 五条件判别式逐条验证：每条条件都有且仅有一条被违反的形状，规则既不过宽也不过窄；引号空 key `"": 9` 与映射值形状的 MATCH 均守住。
- 全量电池：`npm test` 1569/1569（49 files）、`test:oracle` 167/167（0 偏差、0 false PASS）、`typecheck` PASS、`s0:oracle` 0/0（2/2 UNKNOWN）、`build-golden` 167、`oracle:diff` 128/48/46/44（全部 0 mismatch）、`s0:gate` PASS（24/24；gate hash 差异仅 `environment_fingerprint`，非回归）、`release:verify` PASS。
- 十一矩阵全部重跑：100/76/134/86/164/98/314/248/486/196/103，R5 子集 66/66；R10 88/88、R11 74/74、R12 118/118、R13 98/98。
- P2-R13-1 已解决（fix-p0-12 12 标志已清，486/486）；fix-p0-13 的 2 个 lone-doc 标志已清（196/196）；T006 哈希 `36c3853d…` 仍一致。
- 试冻三次三哈希一致：source `f8621677…`（2,348 文件）、dist `f2bcd53f…`（114 文件，未变）、manifest **`5a89a52e…`——与终报值逐字节一致，连续两轮无法复现后首次可信**；`sha256sum -c` 3/3 OK；`release/` 已恢复 R2 正式件。
- `src/` 0 改动；删测试 0；无 `skip`/`only`；无忽略名单。

## 新发现 P0（5 项，11 检查，trigger 模式；jobs 模式 MATCH）

全部独立重建（锚名/值/事件均不同）并逐一定级，定级依据 §7.3/§8.2/§10 + R3-ON 先例 + R10 方向先例：

| # | 家族 | 检查 | TS | Oracle | 正确修复方向 |
|---|---|---|---|---|---|
| P0-1 | (a) 映射值含 `on` | 3 | VALID | INVALID `missing_on_key` | unwrap 语义（`parse_workflow_yaml` + `extract_jobs` 均改；值含 `jobs:` 时 jobs 模式亦分歧，已验证） |
| P0-2 | (b) 值节点第二 anchor | 3 | `yaml_parse_error` | `missing_on_key` | 镜像"至多一个 anchor"拒收（`yaml` 包在 workflow 内任意位置都拒收） |
| P0-3 | (c) key 上带 tag | 3 | `yaml_parse_error`（E05） | `missing_on_key` | 镜像 E05（lone-doc 位置） |
| P0-4 | (d) unglued anchor-colon | 1 | `yaml_parse_error` | `missing_on_key` | 镜像 hasUnrepresentableKey（lone-doc 位置） |
| P0-5 | (e) 嵌套块映射值带 anchored key | 1 | `yaml_parse_error` | `missing_on_key` | 镜像嵌套块映射的"至多一个 anchor"拒收（块上下文限定；绕开 P0-C3 单对豁免；流双生 MATCH） |

已权衡不降级的理由："分类对齐会是错误码"（机制问题，非定级问题）、"超出 R13 §12 方向"（R13 本身就是残留定级的先例）、"都 INVALID 只差错误码"（R3-ON 先例）、"产品域之外"（(a) 在 TS 侧就是真实有效 workflow）、规模小、无 de minimis、披露诚实不改变定级。(b) 与 (e) 共用同一报错文案但 token 位置与豁免约束不同，故分计 2 项；若合并则为 P0 4 项，verdict 不变。

## P2（8 个，非阻断）

终审 R2 的 6 个 + R6 的 2 个仍成立（P2-R13-1 已解决）；P2-R6-1 范围扩大到 R14（manifest `inputs` 仍只记到 R3，T014 重冻时须把 R4–R14 一并记入）。

## 下一步

FIX-P0-15 定点修复 §2 的 5 个家族（方向见完整报告 §2.5）→ 新独立复核 R15（干净克隆；重跑本轮 11 行残留 + §4 判别式探针 + 十一矩阵 + R5 66 例 + 本轮 39 行矩阵 + manifest 哈希复核）→ R15 PASS 后 T014 正式重冻 → Drive 新 01_release_R3 归档 → 终审 R3。终审轮次已用 2/5。

## 证据

- 完整报告：`evidence/review/INDEPENDENT_REVIEW_R14.md`
- 自写探针：`evidence/probes/r14/`（`cases.json` 39 行、`gen-cases.py`、`r14-probe.py`、`parser-probe.mjs`、`results.json` 67/78 MATCH、README）
