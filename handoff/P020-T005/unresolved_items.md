# T005 未决项（unresolved items）

共 5 项，均为工程归属 / 去重事项，无规格错误，未阻塞验收。

## U-01：`src/core/workflow-ir.ts` 仍为 T001 空骨架

- 内容：YAML→WorkflowIR 的构建器（组合 `parseWorkflowYaml` + job 提取）未在本任务实现。
- 原因：WorkflowIR 契约（`src/core/types.ts`）与验证器（`src/core/validate.ts`）已交付；构建器若在本任务实现，会复制解析逻辑、造成第二事实来源。
- 归属：T006（触发求值器正式化，拥有 `workflow-parser.ts`）。
- 状态：OPEN，T006 输入。

## U-02：`JobStatus` / `CheckStatus` 双份定义

- 内容：`types.ts` 与 PoC 的 `job-dag.ts` 中各有一份相同的 `JobStatus` / `CheckStatus` 联合类型。
- 原因：本任务禁止修改 PoC 文件（归属 T007/T008），故未合并。
- 归属：T007/T008 正式化时把 PoC 模块 re-base 到 `types.ts`，消除重复。
- 状态：OPEN。

## U-03：`canonicalJson` / `sha256Hex` 在 `e2e.ts` 仍有内联副本

- 内容：`src/core/e2e.ts` 保留 S0 已验证的内联实现；`canonical-json.ts` / `sha256.ts` 是 §8 哈希合同的正式归宿，算法逐字节一致（E2E-01 `input_sha256` 复算验证）。
- 归属：T010 报告构建时可改为引用正式模块，须以 S0 回归（47/47 + Oracle）验证行为一致。
- 状态：OPEN。

## U-04：`ReportV1.report_sha256` 不重算验证

- 内容：`validateReport` 只做哈希格式检查（小写 64 位十六进制），不重算报告哈希。
- 原因：重算属于报告构建器（T010）与冻结（T014）的职责，不属于 schema 验证。
- 归属：T010/T014。
- 状态：OPEN。

## U-05：规范层面无未决项

- 本次未发现规格错误，因此未按“发现规范错误先停下”的规则停下；以上 U-01–U-04 均不是规格问题。
- 状态：CLOSED（无规格问题）。
