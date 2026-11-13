# P020 CheckPath — T013 第六轮独立复核（R6）交接摘要

**Verdict: NOT PASS — P0 1 / P1 0 / P2 8**

- 审查对象：`baf881f`（FIX-P0-06：`f29faec` 代码 + `baf881f` 交接报告）
- 审查窗口：2026-11-09 ~03:10 GMT → ~03:40 GMT
- 全部验证在干净克隆 `/tmp/r6clone` 中完成（HEAD `baf881f`，parser.py md5 与 `git show HEAD:` 一致）；未在共享工作树运行任何探针或测试；未改代码；报告文件未提交。

## 已关闭（全部验证）

- R2 P0（True:/true:）、R5 grouped P0（裸空键 ×2、J20）、D2、N5、H6：全部关闭。
- R5 子集 66/66、fix-p0-04 矩阵 100/100、fix-p0-05 矩阵 76/76、fix-p0-06 矩阵 134/134。
- 全量电池：npm test 1178/1178、test:oracle 125 fixtures 0 mismatch 0 false PASS、trigger/jobs/checks/witness 86/48/46/44 全 0 mismatch、s0:gate PASS、release:verify PASS、build-golden --check-only 125。
- S0 gate hash：克隆值 `0c4703b0…` 与提交版 `f511a847…` 的唯一差异是 `environment_fingerprint`（克隆路径），自哈希重算一致，非回归。
- 试冻两次：source `4c4d0a01…`（1,712 文件）、dist `8194b124…`（114 文件）、manifest `69eb124b…`，哈希一致；source.zip 含冻结脚本（SHA `5c3142ec…` 与 R2 记录一致）。

## 新 P0（分组计 1 项）：行内普通标量进行中的引号内 tab

`hasRejectedTab` 把空格后的 `"`/`'` 一律当作引号起始，但 YAML 中引号只有在行内尚未开始普通标量时才真正开启引用标量。4 种形状 × trigger+jobs = 8 处 DIFF，**TS 判 VALID、Oracle 判 INVALID / yaml_parse_error**：

| 例 | 输入 |
|---|---|
| V1（= R6-TAB-QUOTE） | `steps: - run: echo "a<TAB>b"` |
| V2 | `steps: - run: echo 'a<TAB>b'` |
| V5 | `name: some long` 续行 `  "a<TAB>b" tail` |
| V9 | `steps: - run: echo "a<TAB>b" # c` |

最小复现（与探针驱动无关）：PyYAML 对 V1 全文 ScannerError、对 V3（`run: "a<TAB>b"`，真正的引用标量）解析成功；`yaml` npm 包对 V1 解析成功。根因在 `src/core/workflow-parser.ts` 的 `isQuoteStart`（未跟踪“行内普通标量进行中”状态）；修复方终报把此点记为近似并用 Q1 行锁定，但 Q1 的 tab 在引号外，未能捕获本形状。

修复方向：TS 侧扩展 `hasRejectedTab`（仅当行内尚未开始普通标量时才把引号当作起始；多行普通标量续行不重置该状态），Oracle 不动，加 fixture + 探针证据入仓库。然后派新的独立复核 R7（须重跑 V1/V2/V5/V9 + 三矩阵 + R5 66 例）。

## P2（8 项）

终审 R2 的 6 项全部仍成立；新增 P2-R6-1（manifest `inputs` 只记录 t013 复核到 R3，R4/R5/R6 未记入；T014 重冻时补记）与 P2-R6-2（R6 独立探针证据只在 `/tmp/r6probe/` 与本报告中，未入仓库）。

## 下一步

不要就 baf881f 发终审 R3（必 FAIL）。定点修复 §2 的 4 例 → R7 复核 → R7 PASS 后 T014 正式重新冻结 → Drive 重新归档（新 01_release_R3）→ 终审 R3。

完整报告：`evidence/review/INDEPENDENT_REVIEW_R6.md`（23,033 字节）。
