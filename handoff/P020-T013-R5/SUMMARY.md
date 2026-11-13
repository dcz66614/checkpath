# P020 T013 第五轮独立复核（R5）完成：**Verdict: NOT PASS — P0 1 / P1 0 / P2 7**

审查对象 commit `2388be1`（FIX-P0-03）。全部结论均为我亲自跑命令、读文件验证，未采信修复方与主控自报；全部验证在干净克隆 `/tmp/r5clone` 中完成，未在共享工作树上跑探针或电池。

## 交付

- [INDEPENDENT_REVIEW_R5.md](sandbox://workspace/p020-checkpath/evidence/review/INDEPENDENT_REVIEW_R5.md)（全文含 66 例探针全表、规格引文、全部命令与结果）
- [SUMMARY.md](sandbox://workspace/p020-checkpath/handoff/P020-T013-R5/SUMMARY.md)（本文件）

只写了这两个地方，未改代码、未提交、未做 T014、未动 Drive、未发终审 R3。

## 结论

- **R4 的 P0 已关闭**：46 例探针矩阵 46/46 MATCH（A 组 13 例数字重复键、B 组 9 例渲染分歧，顺序敏感 6 例各 3 次重跑均稳定）；终审 R2 原输入（`True:`+`true:`）双边 INVALID；FIX-P0-03 10-case 探针 10/10 一致。比较标准为全 JSON 深相等（比 R4 的四字段比较更严）。
- **但 3 处残留分歧仍在，构成新的 grouped P0**：66 例探针，63 MATCH / 3 DIFF。
  - 裸空键 ×2（事件键、filter 键各一）：TS UNKNOWN（空串事件名），Oracle INVALID / yaml_parse_error（PyYAML 解析器层拒绝，Oracle 代码运行前即报错）。
  - J20（`jobs: {test: True}`）：除 `unsupported_job` 字段有无外全部一致——TS 非 dict 分支（`src/core/e2e.ts` L276–285）不含该字段，Oracle 非 dict 分支（`parser.py` L861–865）显式写出 `None`。
  - 定级 P0 的依据：PROJECT_BOOK §7.3、§8.2、IMPLEMENTATION_PLAN §8.1、§10 硬约束 + 终审 R2 驳回 R3 降级的先例（同类分歧、双边 fail-closed、无 false PASS 仍为 P0）。反方考虑（BaseLoader 指定组件限制、退化输入）已在报告 §3 权衡记录，不改变定级；修复方向明确且工作量小（TS 侧拒空键一条规则；J20 一处改动）。
- **无违规捷径**：无测试删除、无 `src/` 改动、oracle-diff 仅计数注释、deepDiff 未动、无忽略名单；夹具真实（trigger 66、golden 105）。
- **全量验收在 2388be1 上通过**（干净克隆亲自跑）：npm test 982/982；test:oracle 105/105 0 偏差 0 false PASS；trigger 66 / jobs 48 / checks 46 / witness 44，均为 0 mismatch；s0:oracle 0 false PASS；s0:gate PASS（100 次 1 哈希；克隆 gate hash 与提交版不同仅因 environment_fingerprint，已逐字段 diff + 自哈希重算验证）；release:verify PASS；build-golden --check-only 105；typecheck 通过。
- **试冻两次三哈希一致**：source `c6554c07…`（1,428 文件）、dist `da130ad2…`（与 R2 逐字节一致）、manifest `abb4125c…`；source.zip 含冻结脚本。
- **R2 的 6 个 P2 全部仍成立**。新增 P2-R5-1：复核探针证据未入仓库（只在报告 + /tmp）。许可证仍 PENDING_SAM_DECISION。

## 下一步（请 parent 决策）

1. 不要就 2388be1 发终审 R3（必 FAIL）。
2. 定点修复 §2 的 3 例残留，然后派新的独立复核 R6（审查对象为修复后 HEAD，干净克隆验证）。
3. R6 PASS 后：T014 正式重新冻结 → Drive 重新归档（新 01_release_R3）→ 终审 R3。PASS 前绝不标记 ACCEPTED、绝不启动 P021。
