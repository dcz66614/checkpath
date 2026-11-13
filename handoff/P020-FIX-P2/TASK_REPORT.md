# P020 FIX-P2 — 任务报告：剩余 P2 修复（P2-1、P2-3、P2-4、P2-5、P2-6、P2-7）

- **任务：** FIX-P2（T013 NOT PASS 的剩余 P2 修复；P0-1、P1-1 已由 FIX-P0-01 / FIX-P1-01 修复并验证通过）
- **执行者：** 修复执行者，全新独立会话，与 T013 审查者及 FIX-P0-01/FIX-P1-01 执行者隔离
- **基线：** commit `e9bdf09`（FIX-P1-01 PASS；任务开始时工作树 clean，仅 `reports/` 未跟踪目录为任务开始前已存在；另有 3 个 evidence 生成文件被改动——`S0_ORACLE_REPORT.json`、`ORACLE_PARITY_REPORT.json`、`RELEASE_VERIFY_REPORT.json`，为前一任务测试运行残留，已用 `git checkout -- evidence/` 恢复至基线后再开工）
- **日期：** 2026-11-08
- **结论：PASS — 6 项 P2 全部修复，全部验收命令通过，P0/P1 无退化，S0_GATE 仍为 PASS 且 gate_report_sha256 不变。**

## 1. 逐项修复对照

### P2-1 — `src/core/types.ts` stale 注释

- **修复前：** `JobStatus` 注释称 "Also defined locally in job-dag.ts (PoC); T007 re-bases that module onto this type"；`CheckStatus` 同理（"T008 re-bases onto this type"）；文件头注释称 PoC 模块 "keep their own local shapes until the tasks that own them (T006–T008, T010) re-base onto these contracts"。
- **修复后：** 两处改为当前事实——`types.ts` 是唯一定义，`job-dag.ts`（T007）与 `check-resolver.ts`（T008）已 re-base 到此类型（`job-dag.ts` 仅 re-export `JobStatus` 以保持既有 import 编译通过；`CheckStatus` 的本地副本已在 T008 删除）。文件头段落同步改写为 "The PoC modules were re-based onto these contracts by the tasks that own them (T006–T008, T010); this file is the single definition…"。
- **核对：** `job-dag.ts:58` 从 `./types.js` import、`check-resolver.ts:60` 同理；`grep` 确认 `job-dag.ts` 内无 `JobStatus`/`CheckStatus` 本地定义。

### P2-3 — `src/ui/RequiredCheckTable.tsx` 的 `key={row.context}`

- **修复前：** `rows.map((row) => … <tr key={row.context}>`。duplicate-context manifest（T8-05/G-57：同一 context `unit-tests` ×3）产生 3 个相同 React key。
- **修复后：** `rows.map((row, index) => … <tr key={`${index}:${row.context}`}>`。行标识取 manifest 下标（行按 manifest 顺序渲染、报告一旦建成不可变，下标在其生命周期内稳定），并附注释说明。
- **复现证明（先失败、再通过）：** 新增 `tests/unit/cli/required-check-table.test.tsx`（2 个测试，从冻结 T8-05 夹具经 `buildReport` 建真实报告后渲染）：
  - 修复前：唯一 key 断言失败（5 行只有 3 个不同 key：`expected 3 to be 5`），见 `test_logs/p2-3-before-fix.log`。另注：React 19.3.1 的 server renderer（`renderToStaticMarkup`）不输出 duplicate-key 告警（已用最小复现验证：`ERRORS: []`），故"无告警"无法经静态渲染观测；测试改为直接断言元素树中 `<tbody>` 下每个 `<tr>` 的 key 唯一——这正是该告警所守护的性质，测试头注释写明了这一推导。
  - 修复后：2/2 通过（`test_logs/p2-3-after-fix.log`；亦在全量 `npm test` 842/842 内）。

### P2-4 — duplicate-key YAML 分歧未覆盖（adversarial）

- **实测分歧（修复前亲自验证）：**
  - TS `yaml` `parse()`：三种重复键形状（顶层 `name` 重复、`on` 下 `push` 重复、`push.branches` 重复）均抛 `Map keys must be unique` → `parseWorkflowYaml` 返回 `INVALID` / `yaml_parse_error`。
  - Python Oracle（PyYAML 6.0.1 `BaseLoader`）：三种形状均静默 last-wins 后继续（`dup-branches` → `branches: [dev]`，`[main]` 被丢弃；`dup-event` → 第二个空 `push:` 获胜；`dup-name` → `name: b`），IR `VALID`。
- **夹具（新增，不在任何冻结套件内——套件要求 TS ≡ Oracle，此处按设计不一致）：**
  - `tests/fixtures/parser-divergence/duplicate-key/dup-branches.yml`、`dup-event.yml`、`expected.json`（`checkpath.parser-divergence/v1`，锁定两侧精确行为）、`README.md`（分歧表 + ADR 全文）。
- **测试（新增）：** `tests/unit/diff-boundaries/duplicate-key-yaml.test.ts`（3 个测试）：每案跑 TS `parseWorkflowYaml` 与 Oracle 探针 `scripts/oracle-parse-probe.py`（新增，仅转调 `parse_workflow_yaml`，无求值逻辑），断言 TS `INVALID`/`yaml_parse_error`、Oracle `VALID` + last-wins 事件值与 `expected.json` 一致、且两侧状态确实不同。3/3 通过。
- **口径：** ADR FIX-P2/01（见 §5）——维持分歧为已知限制，TS 侧为正（产品侧 fail-closed 规则），Oracle 侧不改。

### P2-5 — `scripts/oracle-diff.mjs` 的 `staticNetworkCheck()` 只 grep 11 个文件

- **修复前：** 仅 11 个文件（`src/core` 5 个 + Oracle 6 个），不覆盖 `src/report/*`、`src/cli/*`、`src/ui/*`、`src/worker/*`、`scripts/*`。
- **修复后：** 新增 `expandedStaticNetworkCheck()`，以同一 `NETWORK_PATTERNS` grep：
  - `src/report`、`src/cli`、`src/ui`、`src/worker` 下全部 `.ts`/`.tsx`（17 个文件），
  - `scripts/` 下全部 `.mjs`/`.py`（16 个文件），
  - 外加两个模式表文件自身的"表限定"检查（见下）。`runGate` 中调用，c8 扩展为原检查与扩展检查均为 0 匹配且表限定无未解释匹配。
- **自匹配处理（关键设计）：** `scripts/oracle-diff.mjs`（`NETWORK_PATTERNS` 数组字面量，`axios`/`urllib`/`XMLHttpRequest` 三个裸词）与 `scripts/release-verify.mjs`（离线正则表 `re: /…/`、扫描注释、报告 prose 字符串）含模式表本身，字面 grep 必然自匹配。二文件排除在字面 grep 外，改为表限定检查：`oracle-diff.mjs` 的每个匹配必须落在 `NETWORK_PATTERNS` 数组字面量行区间内；`release-verify.mjs` 的每个匹配必须落在 `//` 扫描注释、`re: /…/` 表项或报告 prose 字符串（`modulepreload` / `Static scan:` / `Bare URL strings` 标记）行上。任一真实调用落在其他行上都会成为未解释匹配、使 c8 失败（fail-closed；新调用无法伪装成表项）。
- **实测：** 扩展 grep 覆盖 33 个文件，0 匹配；两表文件的全部自匹配（`oracle-diff.mjs` 3 行、`release-verify.mjs` 9 行）均被解释、0 未解释。`src/report`、`src/cli`、`src/ui`、`src/worker` 四目录 grep 直接验证 0 匹配。
- **首次 gate 运行失败与修复（诚实记录）：** 扩展检查上线后第一次 `s0:gate` 运行 c8 = FAIL（`table-confinement … 3 matches, 3 unexplained` / `9 matches, 9 unexplained`，gate 状态 FAIL，`gate_report_sha256` 当场算为 `08579ef2…`）。根因是本人的 `checkTableFile` 实现缺陷：单文件 grep 默认不输出文件名前缀（GNU grep 仅多文件时加前缀），`file:lineno:text` 解析恒失败、行号恒为 -1，故全部匹配被判未解释。修复：grep 加 `-H` 强制前缀。修复后重跑 `s0:gate`：PASS，8 条件全 true（见 §4）。失败运行改写的 `evidence/S0_GATE.json`（FAIL 状态）已用 `git checkout -- evidence/` 恢复；本报告如实记录该次失败，不隐藏。
- **gate 哈希设计（为什么 `network_check` 对象不动）：** `evidence/S0_GATE.json` 的 `gate_report_sha256` 覆盖 `network_check.command`（含文件清单）；若把扩展清单写进该对象，哈希必然改变。本任务验收要求哈希不变、且 S0 证据文件不得修改，故**原 `staticNetworkCheck()` 返回对象一字不动**（仍为 11 文件命令），扩展结果只写入 gate 日志（`evidence/s0/logs/s0-gate.log`，本次运行日志见 `test_logs/s0-gate.log`），而 c8 的判定已包含扩展检查——门禁实际变严了，冻结证据文件保持字节一致。这是刻意设计，见 ADR FIX-P2/02。

### P2-6 — `THIRD_PARTY_NOTICES.md` 顶着 "T001 skeleton" 头

- **修复前：** `# Third-party notices` 下第一句为 "T001 skeleton."。
- **修复后：** 改为当前事实："Dependency list for the P020 CheckPath release candidate, verified against `package.json` / `package-lock.json` at the FIX-P2 review (2026-11-08)." 所列依赖内容一字未动（已核对 `package.json`：`react`、`react-dom`、`yaml`；`typescript`、`vite`、`@vitejs/plugin-react`、`vitest`、`@playwright/test`、`eslint`、`@eslint/js`、`typescript-eslint`、`@types/*`；`PyYAML`——与文件所列一致）。

### P2-7 — README 性能数字过期

- **修复前：** README 称 "P95 560.5 ms, peak RSS 100.0 MiB"（T012 报告实为 701.2 / 101.1；审查重跑 654.7 / 99）。
- **修复后：** 亲自重跑 `npm run test:performance` 两次（同条件：1 warmup + 31 timed runs，全 CLI `analyze`，20 workflows / 200 jobs / 100 changed files / 50 required checks；输入 SHA-256 `82d175d7…` 与 T012 一致，确定性输入）：
  - 第 1 次：P95 **756.0 ms**，peak RSS **98.4 MiB**（该次运行在 `test_logs/` 目录建立前执行，数值以本次会话终端输出为准；第二次运行已记入 `test_logs/test-performance.log`）。
  - 第 2 次：P95 **794.5 ms**，peak RSS **94.2 MiB**。
  - 两次均远低于阈值（P95 ≤ 1000 ms、RSS ≤ 256 MiB）；运行间差异为机器计时方差。
  - README 更新为最后一次实测值 **P95 794.5 ms / 94.2 MiB**，并注明测量条件（1 warmup + 31 runs、全 CLI `analyze`、wall time、peak RSS 为每 2 ms 采样的 max `VmHWM`、阈值）。
- **同句附带修正：** 同一状态句中的 "673 unit tests" 亦已过期，更新为本次实测的 **842**（`npm test` 32 文件 842/842）。仅此一处数字，未动其他 README 内容。

## 2. 回归确认（P2-2、P2-8 余部、P2-9 余部仍关闭）

- **P2-2：** `src/core/e2e.ts` 仍为 FIX-P0-01 改写的两路分工注释（"Two pipelines, explicit division of labour (FIX-P0-01, T013 P2-2)"），无 "Known S0 limitation" 残留；正式管线差分测试（163 个测试，含 G-57 probe）在全量套件内通过。
- **P2-8 余部：** README §"Supported semantics" 的 duplicate-context 句仍为 FIX-P1-01 的修正表述（manifest 条目逐条解析、一行一个结果；两个 PROVIDER 共享同一 context → `AMBIGUOUS` / `duplicate_context`）；matrix/`uses:` → UNKNOWN 一句仍为真（U-07/U-08 probe 见 §3）。
- **P2-9 余部：** `scripts/release-verify.mjs` 仍含 U-07、U-08、T8-05 三个 smoke 用例（本次 `release:verify` 全部 PASS，见 §4）。

## 3. Probe 前后对比（shipped `dist/` CLI，`npm run build` 后实测；P0/P1 无退化）

完整日志：`test_logs/probe-regression.log`（首次 probe 因本人 YAML 转换漏了 `required_checks:` 包装而 exit 3，已按 `release-verify.mjs` 的 `stageChecksFixture` 写法修正后重跑；失败版未保留为证据，因属探针脚本错误、非产品行为——修正前后探针脚本见 `/tmp/probe-fixp2.sh`）。

| | 本次实测 | 与 FIX-P0-01 / FIX-P1-01 报告对比 |
|---|---|---|
| U-07 job `test` / check | UNKNOWN / `unsupported_matrix` / UNKNOWN / `provider_unknown` | 一致 |
| U-07 exit / `report_sha256` | 2 / `59fb7bf4ddea3b5391ccc46a81e2a5c29e08469cef1271c0ab31ffc7386f5016`（已独立重算吻合） | 与 FIX-P0-01 一致 |
| U-08 job `call-reusable` / check | UNKNOWN / `unsupported_reusable_workflow` / UNKNOWN / `provider_unknown` | 一致 |
| U-08 exit / `report_sha256` | 2 / `4b9d167b806d0d73868d3f509c808da325776229ebb2f2947bc4d2279324ec46`（已独立重算吻合） | 与 FIX-P1-01 一致 |
| T8-05 exit / `report_sha256` | 2 / `781098456ca6399183a89def05646893cd085165405219b7a26e3031f9674fbb`（已独立重算吻合） | 与 FIX-P1-01 一致 |
| T8-05 checks（5 行） | 与 G-57 frozen expected 逐字段一致（顺序、status、reason 全同） | 一致 |

## 4. 验收（全部亲自跑，逐项结果；日志在 `test_logs/`）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | clean |
| `npm test` | 0 | 32 个文件，**842/842**（基线 837 + 本次新增 5：RequiredCheckTable 2、duplicate-key 3） |
| `npm run test:oracle` | 0 | 80/80，0 mismatches，false PASS 0，**TS formal-pipeline false PASS 0**，unsupported UNKNOWN 19/19 |
| `npm run test:property -- --seed 20261108 --count 1000` | 0 | 1000 cases，0 mismatches，false PASS 0 |
| `npm run test:mutation` | 0 | 13/13 |
| `npm run test:e2e` | 0 | 8/8 |
| `npm run test:offline` | 0 | offline PASS；strace 0 network syscalls；静态扫描 31 文件 0 远程引用 |
| `npm run test:performance` | 0 | performance PASS；P95 794.5 ms（≤1000），peak RSS 94.2 MiB（≤256）；另一次同条件运行 756.0 ms / 98.4 MiB |
| `npm run build` | 0 | clean |
| `npm run release:verify` | 0 | PASS；U-07/U-08/T8-05 smoke 均 PASS，2-build determinism（dist tree sha256 `14cd8492…`，29 文件，两构建一致——由源码改动所致，属预期；确定性仍成立）、hash 重算、离线扫描 34 文件、license guard 均 PASS |
| `npm run oracle:diff:trigger` | 0 | 41/41，0 mismatches |
| `npm run oracle:diff:jobs` | 0 | 48/48，0 mismatches |
| `npm run oracle:diff:checks` | 0 | 46/46，0 mismatches |
| `npm run oracle:diff:witness` | 0 | 44/44，0 mismatches |
| `npm run s0:oracle` | 0 | 24/24，false PASS 0，**TS formal false PASS 0**，unsupported UNKNOWN 2/2 |
| `npm run s0:gate` | 0 | **S0_GATE PASS**；100 runs，1 hash，`gate_report_sha256 f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386` **不变**（已独立重算吻合）；8 个条件全 true（含已扩展的 c8：扩展检查 33 文件 0 匹配，表限定 3/0 与 9/0 未解释）；首次运行因表限定 grep 缺 `-H` 而 c8 FAIL，修复后重跑 PASS（见 §1 P2-5） |

另：P2-3 测试单跑 2/2（修复前 1 失败）；P2-4 测试单跑 3/3。

## 5. 契约决策（ADR 形式）

### ADR FIX-P2/01 — duplicate-key YAML 分歧维持现状，TS 侧为正（状态 CLOSED）

**决策：** 不改任一实现。TS 侧（`yaml_parse_error` / `INVALID`）是产品规则；Oracle 侧（last-wins）是参考行为，登记为已知限制（夹具 README + 本报告 §1 P2-4）。

**理由：**
1. 重复键是歧义作者意图（`dup-branches` 中两个不同的 branch filter，last-wins 会静默丢掉 `[main]`）；merge gate 不得静默替作者选赢家。fail-closed（`INVALID`，CLI exit 3）把错误 surface 出来，而不是猜。
2. 改 TS 为 last-wins（`uniqueKeys: false`）会为所有畸形 workflow 放宽门禁，隐藏作者错误。
3. 改 Oracle 为拒绝会重写冻结的 Reference Oracle 语义、使各套件冻结预期失效；Oracle 建模的是"YAML 在 PyYAML 默认加载器下的含义"，产品在其上叠加更严的校验规则是合理分层，且分歧已被测试锁定，不会无声漂移。
4. YAML 规范本身禁止重复键（各解析器仅在报错响度上不同）；拒绝是可辩护的解读。GitHub 自身行为未作断言——公开资料对此说法不一（有的称静默 last-wins，有的称 "duplicate mapping key" 报错），故不作为本决策的依据。

**后果：** 此二夹具永不进入要求 TS ≡ Oracle 的冻结套件；任一侧漂移（TS 开始接受、Oracle 开始拒绝、赢家值变化）都会使 `duplicate-key-yaml.test.ts` 失败；用户遇此问题时 CLI 给 `INVALID` / `yaml_parse_error`（exit 3），修复方向是删除重复键。若 Sam 日后决定产品改为 last-wins，须以新 ADR 取代本 ADR，并把夹具移入 trigger 套件。

### ADR FIX-P2/02 — P2-5 扩展检查记入 gate 日志，不嵌入冻结 gate JSON（状态 CLOSED）

**决策：** `staticNetworkCheck()` 的返回对象（11 文件命令）保持不变；扩展检查 `expandedStaticNetworkCheck()` 的结果只写入 `s0-gate.log`，但 c8 的判定包含它。

**理由：** `gate_report_sha256` 覆盖 `network_check.command`；把扩展清单写进该对象必然改变哈希，而本任务验收要求哈希不变、S0 证据文件不得修改。门禁的实际效力来自 c8 的判定（扩展检查任一匹配即 FAIL），而非 JSON 里是否逐字记录清单；日志 + 代码注释 + 本报告已完整记录扩展范围。冻结证据文件的字节一致性与门禁变严两者兼得。

## 6. 未改动项（核查）

- P0 修复未碰：`unsupported_job` 贯通（`job-dag.ts`）、正式管线差分测试核心断言、TS 正式侧 false-pass 计数均未动；U-07/U-08 probe 哈希与 FIX-P0-01 报告逐字节一致（§3）。
- P1 修复未碰：validator 放行 duplicate context 的 ADR 结论（`validate.ts`）、G-57 probe 测试、T8-05 smoke 均未动；T8-05 probe 哈希与 FIX-P1-01 报告逐字节一致（§3）。
- 未改 S0 fixtures、S0 证据文件、规格文件：
  `P020_PROJECT_BOOK.md` SHA-256 `028c24720e0780542217719f6e9b14c0fe22b31b79c662520441c2116262b8de`、
  `P020_IMPLEMENTATION_PLAN.md` SHA-256 `bb645205174eca1d111687928c41505407392d0eefd1281455a776273aaa1e0e`，均不变。
  测试运行改写的生成物（`evidence/tests/PERFORMANCE_REPORT.*`、`RELEASE_VERIFY_REPORT.json`、`ORACLE_PARITY_REPORT.json`、`evidence/s0/S0_ORACLE_REPORT.json`、8 个 e2e `trace.zip`）已用 `git checkout -- evidence/` 还原，**未纳入本次 commit**；任务开始前已存在的未跟踪 `reports/` 目录未纳入提交、未动。
- Python Oracle 核心算法未动；无阈值放宽、无夹具删除、无 Oracle 预期修改、无 golden 预期修改。
- 零真人参与；无具体许可证名称写入任何文件；`LICENSE_STATUS.md` 仍为 `PENDING_SAM_DECISION`（`release:verify` license guard PASS）。
- 无网络访问、无 GitHub API、无 Token；全部合成数据。

## 7. 证据路径

- 本报告：`handoff/P020-FIX-P2/TASK_REPORT.md`
- 变更文件：`handoff/P020-FIX-P2/changed_files.txt`
- 测试命令：`handoff/P020-FIX-P2/test_commands.txt`
- 测试日志：`handoff/P020-FIX-P2/test_logs/`（probe 前后、修复前后复现、全部验收命令）
- 文件哈希：`handoff/P020-FIX-P2/sha256.txt`
- 未决项：`handoff/P020-FIX-P2/unresolved_items.md`
- 审查依据：`evidence/review/INDEPENDENT_REVIEW.md` §P2（P2-1…P2-10 全表）

## 8. 改动文件

- `src/core/types.ts` — P2-1：JobStatus/CheckStatus 及文件头 stale 注释改写为当前事实
- `src/ui/RequiredCheckTable.tsx` — P2-3：行 key 改为 `index:context`
- `tests/unit/cli/required-check-table.test.tsx` — 新增：P2-3 回归测试（2）
- `tests/fixtures/parser-divergence/duplicate-key/` — 新增：P2-4 夹具（2 个 YAML + expected.json + README/ADR）
- `scripts/oracle-parse-probe.py` — 新增：P2-4 Oracle 探针驱动
- `tests/unit/diff-boundaries/duplicate-key-yaml.test.ts` — 新增：P2-4 分歧锁定测试（3）
- `scripts/oracle-diff.mjs` — P2-5：新增扩展静态网络检查 + c8 扩展
- `THIRD_PARTY_NOTICES.md` — P2-6：头改写为当前事实（依赖内容不变）
- `README.md` — P2-7：性能数字更新为本次实测 + 测量条件；同句单测数 673 → 842
- `handoff/P020-FIX-P2/` — 本 handoff 包
