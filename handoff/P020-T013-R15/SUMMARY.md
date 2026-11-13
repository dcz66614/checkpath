# T013 R15 独立复核摘要 — FIX-P0-15

- **审查对象**：代码提交 `5e3cda7`（FIX-P0-15，相对 `0bd363a`）；干净克隆 `~/workspace/p020-review-r15/`，全部亲自重跑。
- **结论：NOT PASS — P0 3 / P1 0 / P2 9。**

## R14 的 5 个 P0 家族 — 已关闭

本轮独立重建（锚名/值/事件均不同）全部 MATCH：(a) unwrap 24/24、(b) 第二 anchor 18/18、(c) 键带 tag 16/16、(d) unglued 12/12、(e) 嵌套块映射 14/14；R13 探针 98/98（lone-doc P0 未回归）。全量电池：`npm test` **1590/1590**（50 文件）、`test:oracle` 167 夹具 0 偏差 0 false PASS、`s0:gate` PASS（hash 未变，差异仅 `environment_fingerprint`）、`release:verify` PASS；trigger/jobs/checks/witness 128/48/46/44 全部 0 mismatch；十二矩阵全部重跑（fix-p0-04 100、05 76、06 134、07 86、08 164、09 98、10 314、11 248、12 486、13 196、14 114、15 249/260），R5 子集 66/66；R10 88/88、R11 74/74、R12 118/118、R13 98/98、R14 78/78。试冻两次三哈希一致，manifest **`5801092c…`** 与终报值逐字节一致（第二轮可信）；`sha256sum -c` 3/3 OK；`release/` 已恢复 R2 正式件。

## 新发现 P0 — 3 项，13 行，24 检查

| # | 家族 | 检查 | TS | Oracle | 正确修复方向 |
|---|---|---|---|---|---|
| P0-1 | C3 越界：tag + unglued anchored 空键（根首对 **NEW**、根第 2 对、嵌套第 2 对） | 6 | VALID / [1 job] | `yaml_parse_error` / [] | 收窄 C3，跳过 tag+unglued 对（(d) 已覆盖嵌套首对） |
| P0-2 | 扫描器层：无空格 `&x:!!str`（流/块） | 3 | VALID / [1 job] | 流 `missing_on_key`；块 `yaml_parse_error` | 文本层扫描器镜像 |
| P0-3 | loader 边界：标量 tag 在集合值上（`!!int`/`!!bool`/`!!float` 崩溃 + `!!str` UNKNOWN；`on:` 值位置 **NEW**） | 15 | VALID / [1 job] | 崩溃（原生 `TypeError`/`AttributeError`，驱动 exit 1）或 UNKNOWN | loader 忽略集合上的标量 tag |

终报 §7 只披露 6 行 / 11 检查；本轮另发现 7 行 / 13 检查漏披露，且终报两处对照声称是错的：§2.4 称根首对为控制（实为 C3 触发，DIFF）；§7.3 称 `on: !!int {push: {}}` 双边 `yaml_parse_error`（实为 TS VALID、Oracle 崩溃 exit 1）。

## P2 — 9 个（非阻断）

终审 R2 的 6 个 + R6 的 2 个仍成立（P2-R6-1 范围扩大到 R15）；**新增 P2-R15-1**：fix-p0-14 `cases.json` 的 11 个 `known_divergence` 标志已过期未清（行已 MATCH，终报自认过期却未清除）。

## 下一步

FIX-P0-16 定点修复 §2 的 3 个家族（方向见完整报告 §2.5，另须清除 P2-R15-1 的 11 个过期标志）→ 新独立复核 R16（干净克隆；重跑本轮 13 行残留 + §4 边界探针 + 十二矩阵 + R5 66 例 + 本轮 61 行矩阵 + manifest 哈希复核）→ R16 PASS 后 T014 正式重冻 → Drive 新 01_release_R3 归档 → 终审 R3。终审轮次已用 2/5。

完整报告：`evidence/review/INDEPENDENT_REVIEW_R15.md`；自写探针：`evidence/probes/r15/`（61 例，122 检查，98 MATCH / 24 预期 DIFF，exit 0，重跑 md5 一致）。
