# P020 FIX-P1-01 (终审 R1) — 任务报告：Oracle 重复键严格化 + dup-name fixture + 静态网络检查补齐

- **任务：** 终审 R1 FIX-P1-01（P1-1 Oracle 重复键严格化）+ P2-2（dup-name fixture）+ P2-1（静态网络检查补齐）
- **执行者：** 修复执行员（独立会话）
- **基线：** 冻结 commit `3e5e145`（T014；工作树有未提交的 evidence 再生文件与未跟踪的 `reports/`，任务开始前已存在，未动、未提交）
- **日期：** 2026-11-08
- **提交：** `11f2fc0a68061c0bf9eb7465141e5b578a201e0d`（单一 commit，35 个文件，+747/−42）
- **结论：PASS — P1-1、P2-2、P2-1 全部修复，全部验收命令亲自跑过、全部通过**

> **命名冲突说明（重要）：** `handoff/P020-FIX-P1-01/` 已存在一份同名任务报告，那是 T013 时代的 FIX-P1-01（duplicate-context 契约对齐，commit `e9bdf09`，基线 `d961135`），与本次终审 R1 的 FIX-P1-01（重复键 YAML）是两个不同的 P1-1。本报告因此写为 `TASK_REPORT_R1.md`，原 `TASK_REPORT.md` 及 `changed_files.txt` / `sha256.txt` / `test_commands.txt` / `test_logs/` 一字未动。并行执行的 FIX-P1-02（commit `a3a29d2`）先于本次提交落盘，文件无重叠。

## 1. 缺陷与根因（与 R1 裁决一致，已亲自复现）

R1 P1-1：三种重复键 YAML 形态（`dup-branches`、`dup-event`、`dup-name`）均为 TS 判 INVALID、Oracle 判 VALID。根因是 `oracle/checkpath_oracle/parser.py` 第 106 行与第 390 行用 `yaml.load(yaml_text, Loader=yaml.BaseLoader)`，PyYAML BaseLoader 对重复映射键静默取最后一个值。修复前亲自复现：三个形态经 `scripts/oracle-parse-probe.py` 均为 `VALID`（dup-branches 取 `[dev]`、dup-event 取第二个空 `push:`、dup-name 取 `dup-name-again`）。

全树 grep 确认只有这两处 `yaml.load` 调用点（其余命中均为注释/文档）；`scripts/*.py`、`src/`、`tests/` 无其他 YAML 加载点。

## 2. 修复

### 2.1 核心修复 — `oracle/checkpath_oracle/parser.py`（P1-1）

新增 `_StrictBaseLoader(yaml.BaseLoader)`：重写 `construct_mapping`，在构造前检查同一映射内有无重复标量键，重复即抛 `yaml.YAMLError`；构造本身全权委托给 `super().construct_mapping()`。两处 `yaml.load` 改用该 loader。并在子类上显式 `add_constructor(DEFAULT_MAPPING_TAG, _StrictBaseLoader.construct_mapping)` 注册——PyYAML 经 `yaml_constructors` 表分发，只重写方法不会被调用。

- 除重复键规则外，BaseLoader 语义**完全不变**（`on` 仍为字符串 `"on"`，`if: false` 仍为字符串 `"false"`，空事件值仍折叠为无配置；已逐项验证，见 §4.1）。
- 非标量映射键（极罕见，workflow YAML 中不存在）不检查；`True` vs `true` 这类拼写不同但 YAML 1.1 解析后相同的键，在 BaseLoader 下本就是不同字符串，不判重复（残留边界，见 §6）。
- 修复中途发现并修正：`flatten_mapping` 属于 SafeConstructor，BaseConstructor 没有该方法，第一版调用它会报 `AttributeError`；已去掉该调用（BaseLoader 本就不处理 `<<` 合并键，保持原样）。

### 2.2 三形态纳入自动化对照（P1-1 + P2-2）

`test:oracle` 的枚举方式（查清后）：`npm run test:oracle` = `node scripts/oracle-diff.mjs --suite tests/fixtures/golden/suite.json`，按 `suite.json` 的 `fixtures` 列表枚举；每个夹具由 `workflow.yml` + `scenario.json` + `required-checks.json` + `expected.json` 组成，TS 端（`tests/unit/golden/golden.test.ts`，`evaluateE2E`）与 Oracle 端（`oracle.checkpath_oracle.cli --report-out`）逐字段比对，另有 formal 管线（`buildReport`）的 false-PASS 计数。解析层对照另有一条线：`scripts/oracle-diff-trigger.mjs` 按 `tests/fixtures/trigger/suite.json` 枚举（TS `trigger-oracle-dump.test.ts` vs `scripts/oracle-trigger-dump.py`）。

三形态同时进了两条线：

- **Trigger 套件：** 新增 `tests/fixtures/trigger/T6-17-dup-branches/`、`T6-18-dup-event/`、`T6-19-dup-name/`（各含 `workflow.yml` + `scenario.json`（push 场景）+ `required-checks.json`（context `test`）），`suite.json` 增加 3 条（source `fix-p1-01`）。`trigger-oracle-dump.test.ts` 计数 41→44，`trigger-suite.ts` 与 `oracle-diff-trigger.mjs` 头注释同步。
- **Golden 套件（即 test:oracle）：** 新增 `tests/fixtures/golden/G-81-fix-p1-01-T6-17-dup-branches/`、`G-82-…-T6-18-dup-event/`、`G-83-…-T6-19-dup-name/`，`suite.json` 80→83。`expected.json` 按 T011 方法由 Oracle 自身生成：`scripts/build-golden.py` 扩展了一个 `fix-p1-01` 区块（从 trigger 套件取输入、显式 required-checks——`extract_jobs` 对不可解析 YAML 返回 `[]`，derive 会得到空 manifest，故用显式 manifest 锁定 `no_provider`  verdict），然后**运行生成器重建整个 golden 目录**；git diff 证实既有 80 个夹具字节级未变，只有 suite.json 增加 45 行与 3 个新目录。`python3 scripts/build-golden.py --check-only` exit 0（83 cases）。
  - 新夹具的 frozen 形态：trigger `INVALID` / `yaml_parse_error`，jobs `[]`，required check `test` → `PENDING_NOT_REPORTED` / `no_provider`（无 provider job；TS 与 Oracle 逻辑一致，见对照日志）。
- **单元测试改写：** `tests/unit/diff-boundaries/duplicate-key-yaml.test.ts` 由“断言两边不一致”改为**断言两边一致**（均 `INVALID` / `yaml_parse_error`、events `[]`），用例 2→3；`tests/fixtures/parser-divergence/duplicate-key/expected.json` 相应更新（三条均为双边 INVALID）；新增 `dup-name.yml`（P2-2）。
- **ADR：** `tests/fixtures/parser-divergence/duplicate-key/README.md` 的 ADR FIX-P2/01 原文**全文保留**，顶部新增 FIXED 状态段（修复 commit 标题、新行为、两条对照线的落点），并注明 FIX-P2/01 的“已知限制”豁免已被 R1 否决、现已废止。历史未删。
- 注释同步：`golden.test.ts`、`formal-pipeline-unsupported.test.ts`、`oracle-diff.mjs` 的 golden 计数注释 80→83。

### 2.3 静态网络检查补齐（P2-1）

查清实现：静态检查在 `scripts/oracle-diff.mjs`，分两档——`staticNetworkCheck()`（11 个 S0/Oracle 路径文件，**其结果对象嵌在 `evidence/S0_GATE.json` 内、受 `gate_report_sha256` 覆盖**）与 FIX-P2 新增的 `expandedStaticNetworkCheck()`（原 34 个文件：`src/report`、`src/cli`、`src/ui`、`src/worker` 的全部 `.ts/.tsx` + `scripts/` 的 `.mjs/.py`，不含两 gate 文件本身；结果只记日志、不嵌 gate JSON）。

漏网名单（与裁决一致）：`src/core` 的 10 个文件（`canonical-json`、`event-evaluator`、`if-subset`、`recommendations`、`sha256`、`skip-annotation`、`types`、`validate`、`witness-reducer`、`workflow-ir`）+ `oracle/checkpath_oracle/witness.py`。先对这 11 个文件跑全树同款 `NETWORK_PATTERNS` grep：**0 命中**（exit 1），符合裁决“全树 grep 无网络调用”的前提。

补齐方式：把这 11 个文件显式加入 `expandedStaticNetworkCheck()`（显式列表而非递归 `src/core`，使未来新增的 `src/core` 文件在登记前保持“未覆盖”可见）。**没有**动 `staticNetworkCheck()`——动它会改 gate JSON、改 gate hash，违反验收要求；FIX-P2 的先例正是把扩展放进 expanded 检查。函数与文件头注释已同步说明此取舍。

## 3. 未碰的东西

- 规格文件（PROJECT_BOOK / IMPLEMENTATION_PLAN）未碰；许可证仍为 `PENDING_SAM_DECISION`，未写任何许可证名。
- 未碰 `scripts/deterministic-zip.py`、`release/*`、`README.md`（仓库根）、`requirements.lock.txt`、`package.json`、`evidence/release/T014_FREEZE_REPORT.md`（FIX-P1-02 执行员的范围）。
- 未做 T013 复核、未做 T014 冻结、未碰 Drive、未标记 ACCEPTED、未发完成通知。
- 未提交测试运行再生的 evidence 文件：`evidence/s0/S0_ORACLE_REPORT.json`、`evidence/tests/ORACLE_PARITY_REPORT.json`、`evidence/tests/RELEASE_VERIFY_REPORT.json`、`evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`（均已再生，工作树中为已修改状态，未 `git add`）。`evidence/S0_GATE.json` 经核对**内容未变**（git status 无修改）。
- 提交只用 `git add <明确路径>` 逐个加，未用 `git add -A`。`reports/`（任务开始前已存在）未动。

## 4. 验收（全部亲自跑命令，日志见 `handoff/P020-FIX-P1-01/logs/`）

### 4.1 Oracle 行为复核（修复后 probe + 语义回归）

- 三形态 probe：`dup-branches` / `dup-event` / `dup-name` 均为 `status INVALID`、`errors ["yaml_parse_error"]`、`events []`、`on_key_is_string false`（见 `logs/three-forms-parity.log` §1）。
- 语义不变：正常 workflow 仍 `VALID` 且 `on_key_is_string true`；`if: false` 经 `extract_jobs` 仍为字符串 `"false"`；空事件值仍 `VALID`；重复键出现在 `jobs:` 映射内同样判 INVALID；`extract_jobs` 对重复键 YAML 返回 `[]`，与 TS `extractJobs`（解析抛错返回 `[]`）一致。

### 4.2 验收命令汇总

| 命令 | 结果 |
|---|---|
| `npm run test:oracle` | **PASS**：83 fixtures，TS==expected / Oracle==expected / formal TS 均 exit 0；TS vs Oracle mismatches **0**；false PASS **0**；TS formal false PASS **0**；UNKNOWN 19/19（`logs/test-oracle.log`） |
| `npm run oracle:diff:trigger` | **PASS**：44 fixtures，TS/Oracle exit 0，mismatches **0**（`logs/oracle-diff-trigger.log`；T006 报告 44 passed / 0 failed / 0 missing） |
| `npm run oracle:diff:jobs` | **PASS**：48 fixtures，mismatches **0** |
| `npm run oracle:diff:checks` | **PASS**：46 fixtures，mismatches **0** |
| `npm run oracle:diff:witness` | **PASS**：44 fixtures，mismatches **0** |
| `npm test` | **PASS**：32 个文件，**855/855**（基线验证：干净 worktree 检出 `3e5e145` 跑 `npx vitest run` 为 842/842；+13 = golden +3、formal-pipeline +6（每夹具 2 个 it：主差分 + two-path lock）、trigger +3、dup-key +1；其余文件计数逐项比对无变化）（`logs/npm-test.log`） |
| `npm run s0:gate` | **PASS**：oracle 24/24，mismatches 0，false PASS 0，TS formal false PASS 0；determinism 100 runs / 1 unique hash；static network check 0 matches；**expanded static network check 45 files / 0 matches**（原 34）；table-confinement `oracle-diff.mjs` 3 matches / 0 unexplained、`release-verify.mjs` 9 / 0（与基线 HEAD 版 grep 复核一致）；**`gate_report_sha256` = `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`，与要求值完全一致、未变**（`logs/s0-gate.log`） |
| `python3 scripts/build-golden.py --check-only` | **exit 0**，golden cases 83（重建前基线亦为 exit 0 / 80 cases） |
| `npx eslint`（本次改动的 7 个 TS/MJS 文件） | **exit 0** |
| 三形态对照日志 | `logs/three-forms-parity.log`（probe 输出 + trigger/golden 对照 + 各 G-81..G-83 frozen 形态） |

## 5. 提交内容（`11f2fc0`，35 个文件）

- `oracle/checkpath_oracle/parser.py`（`_StrictBaseLoader` + 两处 call site + 注释）
- `scripts/build-golden.py`（`fix-p1-01` 生成区块）
- `scripts/oracle-diff.mjs`（expanded 检查 +11 文件；golden 计数注释 80→83；头注释）
- `scripts/oracle-diff-trigger.mjs`（头注释 41→44）
- `tests/fixtures/trigger/suite.json` + `T6-17/18/19` 各 3 个文件（workflow/scenario/required-checks）
- `tests/fixtures/golden/suite.json` + `G-81/82/83` 各 4 个文件
- `tests/fixtures/parser-divergence/duplicate-key/`：`dup-name.yml`（新增）、`expected.json`、`README.md`
- `tests/unit/diff-boundaries/duplicate-key-yaml.test.ts`、`tests/unit/event/trigger-oracle-dump.test.ts`、`tests/unit/event/trigger-suite.ts`、`tests/unit/golden/golden.test.ts`、`tests/unit/cli/formal-pipeline-unsupported.test.ts`（计数/注释同步）

## 6. 残留与后续注意

1. **残留边界（不阻断）：** 拼写不同但 YAML 1.1 解析后相同的映射键（如 `True:` vs `true:`）在 BaseLoader 下仍是不同字符串，不判重复；TS `yaml` 解析器会将其解析为同一布尔键而拒绝。workflow YAML 中实际不存在此类键，三个裁决形态均为普通字符串键，未处理。
2. **jobs/checks/witness 差分套件未新增重复键用例：** 重复键的 job/check 行已由 golden E2E 报告覆盖（jobs `[]` + `no_provider` check）；jobs 套件要求每用例有 frozen expected job rows，另加用例收益低。
3. **handoff 命名冲突：** 见顶部说明——本报告为 `TASK_REPORT_R1.md`；若父级希望统一命名，请决定是否将 T013 旧报告改名，勿由执行员自行改写历史。
4. **后续仍待他人处理（不在本次范围）：** FIX-P1-02（冻结脚本等，另一执行员并行进行中）、新的独立 T013 复核与 T014 重冻结、终审 R2。
