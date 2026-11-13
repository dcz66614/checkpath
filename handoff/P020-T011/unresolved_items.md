# T011 未决项（unresolved items）

本次关闭 4 项（3 项前序未决 + 1 项新发现），无新增未决项结转。无规格错误。

## U-01（已关闭，本任务）：T008-U01 — 空值事件 `on: { pull_request: }` 的 TS↔Oracle 分歧

- 决策（ADR T011/T008-U01）：按 GitHub 语义，空值事件是合法写法（表示“该事件无过滤器”）；Oracle 侧把 BaseLoader 产出的 `''` 视同无配置（与 None 同等处理）。仅 `''` 折叠，其他非映射值仍判 INVALID。TS 解析器无需改动。
- 落地：`oracle/checkpath_oracle/parser.py`；新增 trigger 正例 `tests/fixtures/trigger/T6-16-empty-event-value/`（套件 40→41）；重跑 trigger/jobs/checks 三路差分 41/48/46，全部 0 mismatch；并入 golden G-40。
- 状态：CLOSED。

## U-02（已关闭，本任务）：T009-U01 — WITNESS_KINDS 缺通用“事件触发缺失”kind

- 决策（ADR T011/T009-U01）：增专用 kind `event_trigger_missing`（PROJECT_BOOK §4.6 术语一致）+ 规则 R-EV-01；`merge_group_missing` 仅限 merge_group 场景事件/活动类型不匹配。
- 落地：`src/core/types.ts`、`witness-reducer.ts`、`recommendations.ts`、`oracle/checkpath_oracle/witness.py`；更新 `T9-18`、`T9-19`、`expected-s0/E2E-05.json`（仅 kind 与 rule_id）；witness 测试 59/59，`oracle:diff:witness` 44/44、0 mismatch。
- 状态：CLOSED。

## U-03（已关闭，本任务）：T006 U-03 — `complete: false` 不参与判定

- 决策（ADR T011/T006-U03）：维持现状，不改语义。理由：PROJECT_BOOK §4.3 未赋予 `complete` 独立判定语义；GitHub always-run 规则只绑定 push >1,000 commits 与 diff timeout；两实现已一致且有测试锁定。
- 锁定：T6-14 复用于 golden G-38（抽查 VALID / triggered / REPORTABLE_PENDING）。
- 状态：CLOSED。

## U-04（已关闭，本任务）：新发现 ADR-04 — `strategy.matrix` 与 reusable-workflow Job 曾为 false PASS

- 发现：§3.4 规定两者均输出 UNKNOWN，但两实现此前忽略这两个字段，均误判 REPORTABLE_PENDING（探针复现）。
- 决策：会运行的 matrix/reusable Job 判 UNKNOWN（`unsupported_matrix` / `unsupported_reusable_workflow`）；可判定跳过优先；`strategy` 无 `matrix` 键仍为普通 Job。
- 落地：TS（job-dag/e2e/workflow-ir/types/validate）与 Oracle（parser/evaluator）同步；7 个单元测试；U-07/U-08 夹具与 golden G-79/G-80；Oracle 探针四边界全部符合设计。
- 状态：CLOSED。

## U-05（记录，非阻塞）：`build-golden.py --check-only` 首次运行曾报差异

- 现象：任务中途某次 `--check-only` 报告“golden dir differs from regeneration”（exit 1），当时未定位到原因；随后三次运行（含最终终验）均为 exit 0，且直接字节比对显示零差异。
- 处理：如实记录；最终证据以终验的 exit 0 为准。若 T012/T013 复现该现象，应先比对具体文件再定性，不要直接视为套件漂移。
- 状态：OBSERVED（非阻塞；终验通过）。

## U-06（记录，非阻塞）：`reports/` 为任务开始前已存在的未跟踪目录

- 内容：任务开始时的 `git status` 已显示 `?? reports/`；非本任务产物，本任务未写入该目录、未纳入本次提交。
- 状态：OPEN（归属：请 Muse/parent 确认该目录来源与处理方式）。

## U-07：规范层面无未决项

- 本次未发现规格错误；以上均为已关闭的 ADR 决策与两条记录事项。
- 状态：CLOSED（无规格问题）。
