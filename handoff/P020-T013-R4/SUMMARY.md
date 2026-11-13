# P020 T013 第四轮独立复核（R4）— 摘要

**Verdict: NOT PASS — P0 1 / P1 0 / P2 6**

| 项 | 内容 |
|---|---|
| 审查对象 | commit `53fa36a`（FIX-P0-02，终审 R2 P0 修复） |
| 报告时实际 HEAD | `2388be1`（审查中途新增 FIX-P0-03 两 commit；审查对象未换，FIX-P0-03 未审，见下） |
| 审查窗口 | 2026-11-08 ~23:29 GMT → 2026-11-09 ~00:10 GMT |
| 全文 | `evidence/review/INDEPENDENT_REVIEW_R4.md` |

## 结论

- **终审 R2 的 P0 已修好**：`True:` vs `true:` 输入双边均为 INVALID / yaml_parse_error / events `[]`；T6-20、G-84、dup-bool-true 夹具真实覆盖。
- **但同类同根分歧仍在，构成新的 grouped P0**：46 例探针矩阵（干净克隆实测），24 MATCH / **22 DIFF**。
  - A 组 13 例（有效性分歧）：数字标量拼写重复键——`1:`+`01:`、`1.5:`+`1.50:`、`1:`+`1.0:`、`0x10:`+`16:`、`+1:`+`1:`、`-0:`+`0:`、`0o17:`+`15:`、`1e2:`+`100:`、`0.5:`+`.5:`、`5.:`+`5.0:`、`.inf:`+`.Inf:`、`1E2:`+`100:`、`.INF:`+`.inf:`——TS INVALID，Oracle UNKNOWN。**与 R2 P0 完全相同的裁决模式。**
  - B 组 9 例（事件名渲染分歧）：status/errors 一致，仅 events 不同——`True:`+`FALSE:` 拼写、`01:` 单键渲染为 `"1"` vs `"01"`、数字键顺序（TS 排序 vs Oracle 文件顺序）、`.nan:`+`.NaN:` 个数 1 vs 2。
- 根因：FIX-P0-02 只折叠 bool/null 拼写，数字/inf/nan 明确未折叠；TS `yaml` 解析器按 YAML 1.2 core schema 解析全部标量。定级 P0 的依据：PROJECT_BOOK §7.3（任何字段不一致都判失败，不得人工解释放行）、§8.2（Oracle parity 100%）、IMPLEMENTATION_PLAN §8.1（任何 mismatch 都是失败，不得加忽略白名单）、§10（P0 明确包含 Oracle mismatch），以及终审 R2 驳回降级的先例。
- **无违规捷径**：修复区间无文件删除、无比较范围缩小、无忽略名单、无 P0 改 P2；测试计数只上调（44→45、83→84）。
- **全量验收在 53fa36a 上通过**（干净克隆 `/tmp/r4clone` 亲自跑）：npm test 860/860；test:oracle 84/84 0 偏差 0 false PASS；trigger 45 / jobs 48 / checks 46 / witness 44，均为 0 mismatch；s0:oracle 0 false PASS；s0:gate PASS（100 次 1 哈希）；release:verify PASS；build-golden --check-only 84；typecheck 通过。
- **试冻两次三哈希一致**：source `3faa6046…`（1,239 文件）、dist `da130ad2…`（与 R2 逐字节一致）、manifest `df4bd664…`。
- **R2 的 6 个 P2 全部仍成立**（README 性能快照、Windows NOT_TESTED、manifest freeze_commit PENDING、source.zip 一代滞后、无真人数据、裸目录冻结设计限制）。

## 污染声明（重要）

审查中途（~23:39 GMT）兄弟修复协调员（`3ec7ebab`）在工作树内做未提交的 FIX-P0-03，污染了复核员的探针与电池（K3/K4 曾因此误报为 MATCH，已纠正）。复核员杀掉被污染电池，未碰工作树，**全部 verdict 证据来自干净克隆 `/tmp/r4clone`**（HEAD 53fa36a，parser.py md5 已核对）。报告时 HEAD 已变为 `2388be1`（FIX-P0-03 已提交：`c24972b` + `2388be1`）。

## 下一步

1. 不要就 53fa36a 发终审 R3（必 FAIL）。
2. 对 FIX-P0-03（HEAD `2388be1`）派**新的独立复核 R5**（审查对象改为 `2388be1`），用本报告 §2 的 46 例探针矩阵（`/tmp/r4probe/`，注意 /tmp 重启会清）逐项复测，并重跑全量电池 + 试冻。
3. R5 PASS 后：T014 正式重新冻结 → Drive 重新归档（新 01_release_R3）→ 终审 R3。R5 NOT PASS 则继续修 + 复核。PASS 前绝不标记 ACCEPTED、绝不启动 P021。
4. 流程教训：修复与独立复核不得在同一工作树上并行；复核期间应冻结修复写入，或复核员一律在干净克隆里验证。
