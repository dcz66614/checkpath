# T013 R8 独立复核摘要

**Verdict: NOT PASS — P0 1 / P1 0 / P2 8**，审查对象代码提交 `c157f41`（FIX-P0-08）。全部验证在干净克隆 `/tmp/r8clone` 中完成（HEAD 与 parser.py md5 均核对一致；未在共享工作树跑任何探针或测试；未改代码）。

## 已关闭（全部验证）

- **R7 的 RESID P0 全部关闭**：R8 自写探针独立复现 6 形状 ×2 模式 12/12 MATCH；fix-p0-08 矩阵未标记 152/152 MATCH；fix-p0-07 矩阵 86/86（4 个已标记 RESID 检查现已 MATCH）。
- **全量电池在干净克隆中全过**：npm test **1285/1285**（41 文件）、test:oracle **143/143、0 mismatch、0 false PASS**、trigger/jobs/checks/witness **104/48/46/44 全 0 mismatch**、s0:gate **PASS**、release:verify **PASS**、build-golden --check-only 143。
- **五矩阵重跑**：fix-p0-04 **100/100**（R5 子集 66/66）、fix-p0-05 **76/76**、fix-p0-06 **134/134**、fix-p0-07 **86/86**、fix-p0-08 **156/164**（仅 8 个已标记 R3 检查不同）。
- **S0 门哈希**：克隆值 `365ce033…` 与提交版 `f511a847…` 的唯一差异是 `environment_fingerprint`（克隆路径），自哈希按文件内公式重算均与记录值逐字节一致，**非回归**。
- **试冻两次三哈希一致**：source `64e950c3…`（1,896 文件）、dist `c391ad64…`（与 FIX-P0-07 试冻逐字节一致，Oracle-only 改动所致）、manifest `5d2c158c…`；`sha256sum -c` 3/3 OK；source.zip 含冻结脚本（SHA `5c3142ec…` 三方一致）。
- **违规捷径检查：无**——无测试删除；`src/` 0 改动；`oracle/` 仅 parser.py（+102/−0）；`deepDiff` 0 命中；无忽略名单；trigger/golden 套件均为纯新增。

## 新 P0（分组计 1 项）：反向 flow 键分歧（R3）

`yaml` npm 包接受多行引用标量作 flow 映射的键，PyYAML 全部拒绝。R8 自写探针 10 形状 × trigger+jobs = 20 检查，**14 处 DIFF**（修复方矩阵的 8 处亦复现；本轮新增单引号键与深缩进形状同样分歧）：

- 作额外键（`m: {"a\n b": 1}`）：TS **VALID** vs Oracle **INVALID / yaml_parse_error**；
- 作 `on:` 值（`on: {"a\n b": push}`）：双边 INVALID，但错误码不同（`event_config_not_mapping` vs `yaml_parse_error`）、`on_key_is_string` 不同（true vs false）、jobs 不同（`[test]` vs `[]`）。
- 边界：续行缩进为 0 时双边都拒；块映射键双边都拒；单引号亦然、任意续行缩进 > 0 均分歧、嵌套亦然。

定级 **P0**：PROJECT_BOOK §7.3（L520，任何字段不一致都判失败）、§8.2（L548，Oracle parity 100%）、IMPLEMENTATION_PLAN §8.1（L779）、§10（L827，P0 含 Oracle mismatch）及终审 R2 裁决先例（“双边 fail-closed”降级理由已被明确驳回；R3 的额外键面比 R2 P0 更严重——TS 接受 Oracle 判为无效的文档）。反方考虑（形状退化、PyYAML 更合规范、修复难度）已权衡，均不改变定级。修复方向：TS 侧 AST 规则（`parse()` 接受后拒收 flow 映射中的多行引用键，`hasUnrepresentableKey` 同机制家族）；Oracle 侧无法修；不可换解析器，不可输入手术。

## P2（8 项）

终审 R2 的 6 项 + R6 新增的 2 项（P2-R6-1 manifest `inputs` 只记到 R3，R4–R8 均未记入；P2-R6-2 复核探针证据未入仓库，R8 探针亦只在 `/tmp/r8probe/` 与本报告中）**全部仍成立**；无新增 P2。许可证仍为 PENDING_SAM_DECISION。

## 交付文件（均未提交，留给 parent 处理）

- `evidence/review/INDEPENDENT_REVIEW_R8.md`
- `handoff/P020-T013-R8/SUMMARY.md`（本文件）

## 下一步

**不要**就 c157f41 发终审 R3（必 FAIL）。定点修复 §2 的 R3 → R9 复核（须重跑 R3 10 形状 + 五矩阵 + R5 66 例）→ R9 PASS 后 T014 正式重新冻结（manifest 补记 R4–R9）→ Drive 重归档（新 01_release_R3）→ 终审 R3。
