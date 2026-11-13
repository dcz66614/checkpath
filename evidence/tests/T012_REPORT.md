# T012 — E2E / Offline / Performance / Packaging Rehearsal Report

**Task:** T012 (S4) — E2E、离线运行、性能与发布预演
**Base commit:** `11e0740` (T011 PASS, 工作树 clean;仅 `reports/` 未跟踪目录为任务开始前已存在）
**Date:** 2026-11-08
**Result:** **PASS** — 5 项验收命令全部 exit 0；E2E 8/8；离线 0 网络系统调用；性能 P95 701.2 ms / 峰值 RSS 101.1 MiB；两次构建 dist 哈希一致；S0 Gate 仍为 PASS。
**Zero humans. No network (except Playwright browsers, already installed), no GitHub API, no token. Synthetic data only.**
**License:** `PENDING_SAM_DECISION`（LICENSE_STATUS.md 未动；本次新增文件均不含任何许可证名称）。

---

## 1. 做了什么（T012 新建的实现，而非仅测试运行）

T011 结束时，计划 §7 契约中的三条命令其实不存在：`scripts/release-verify.mjs`
缺失（`test:offline` / `test:performance` / `release:verify` 均不可执行），
`tests/e2e/` 为空（Playwright 只有配置），README 仍是 T001 骨架
（"Status: T001 skeleton only"，无 demo/analyze/matrix 命令）。T012 的工作是
把这些缺失的部分真正实现出来，再用它们验收：

| 文件 | 说明 |
|---|---|
| `scripts/release-verify.mjs`（新建） | 三模式：默认 `release:verify`（构建确定性 + CLI smoke + report_sha256 重算 + 离线静态扫描 + 许可证守卫）；`--offline`（`unshare -rn` 真断网运行 + `strace` 系统调用证明 + 静态扫描）；`--performance`（合成压力输入 + 31 次计时 + RSS 采样） |
| `scripts/make-perf-input.mjs`（新建） | 确定性压力输入生成器：20 workflows / 200 jobs / 100 changed files / 50 required checks，两次生成字节一致（`input_sha256` 相同）；规范副本在 `evidence/tests/perf-input/` |
| `tests/e2e/helpers.ts`、`global-setup.ts`（新建） | 运行已构建 CLI、重算 report_sha256、回环静态服务器；global setup 每次先 `npm run build` 保证 dist 新鲜，并清空上次 trace 输出目录 |
| `tests/e2e/demo-analyze.spec.ts`（新建） | demo → analyze → matrix 全流程（退出码 + 哈希重算）、HTML 五区渲染、check 点击高亮 provider、witness 开关、matrix 链接、离线 UI 空态；4 张截图 |
| `tests/e2e/offline.spec.ts`（新建） | file:// 零子请求、HTTP 回环零外部请求（路由拦截）、dist UI 零外部请求 |
| `playwright.config.ts`（改） | `trace: 'on'`（每测一 trace）、`outputDir: evidence/tests/e2e-output/`（trace 落盘为提交证据）、`globalSetup` |
| `vitest.config.ts`（新建） | 见 §6 第 3 项：把 `tests/e2e/**` 排除出 `npm test`（Playwright spec 会被 vitest 误跑）；`vite.config.ts` 恢复原样零改动 |
| `README.md`（重写） | 真实 CLI 的 Quick Start（bash + PowerShell）、demo 截图、merge_group 缺失示例、退出码表、支持语义与 UNKNOWN 边界、平台实测状态 |
| `evidence/tests/OFFLINE_REPORT.md` / `.json` | 离线报告（方法 + 逐项结果） |
| `evidence/tests/PERFORMANCE_REPORT.md` / `.json` | 性能报告（方法 + P50/P95/max/mean + 原始逐次数据） |
| `evidence/tests/RELEASE_VERIFY_REPORT.json` | `release:verify` 默认模式机器报告 |
| `evidence/tests/perf-input/` | 压力输入规范副本（22 文件 + INPUT_MANIFEST.json） |
| `evidence/screenshots/e2e-*.png`（4 张） | 报告全页、witness 开关后、matrix、UI 空态（真实渲染截图，非占位） |
| `evidence/tests/e2e-output/` | 8 个 Playwright trace.zip（每测一个）+ 失败截图位（本次 0 失败，故无） |

未修改：Oracle 算法、已冻结语义、S0 fixtures、S0 已提交证据、规格文件
（PROJECT_BOOK SHA-256 `028c2472…`、IMPLEMENTATION_PLAN `bb645205…` 已复核不变）、
LICENSE_STATUS.md（PENDING_SAM_DECISION）。

---

## 2. 验收命令逐项结果（亲自跑，日志见 handoff/P020-T012/test_logs/）

| 命令 | 结果 | 证据 |
|---|---|---|
| `npm run test:e2e` | exit 0 — **8/8**（demo-analyze 5 + offline 3） | `test_logs/test-e2e.log`，traces 见 `evidence/tests/e2e-output/` |
| `npm run test:offline` | exit 0 — **offline PASS**（见 §4） | `test_logs/test-offline.log`，`evidence/tests/OFFLINE_REPORT.{md,json}` |
| `npm run test:performance` | exit 0 — **performance PASS**（P95 701.2 ms，峰值 RSS 101.1 MiB，见 §5） | `test_logs/test-performance.log`，`evidence/tests/PERFORMANCE_REPORT.{md,json}` |
| `npm run build` | exit 0 — vite build + `dist/checkpath.mjs` 已写 | `test_logs/build.log` |
| `npm run release:verify` | exit 0 — **release:verify PASS**（构建确定性 + smoke + 哈希重算 + 离线扫描 + 许可证守卫） | `test_logs/release-verify.log`，`evidence/tests/RELEASE_VERIFY_REPORT.json` |

回归（同样亲自跑，全部 exit 0）：

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0（0 错误 0 警告） |
| `npm test` | exit 0 — **673/673**（29 文件，T011 的 673/673 全部保持，无新增 vitest 用例） |
| `npm run test:oracle` | exit 0 — Golden 80 例，0 mismatch，false PASS 0 |
| `npm run test:property -- --seed 20261108 --count 1000` | exit 0 — 1,000 例，0 mismatch |
| `npm run test:mutation` | exit 0 — 13/13 |
| `npm run oracle:diff:trigger` / `jobs` / `checks` / `witness` | exit 0 — 41 / 48 / 46 / 44 例，全部 0 mismatch |
| `npm run s0:oracle` | exit 0 — 24/24，0 mismatch，false PASS 0 |
| `npm run s0:gate` | exit 0 — **S0_GATE.json status PASS**，`gate_report_sha256 f511a847…`（与 T010/T011 一致，未变） |

---

## 3. E2E（Demo → analyze → HTML/JSON export）

- CLI 全流程：`demo` exit 2、`analyze` pr-docs-only exit 2、pr-src-only exit 0、
  `matrix` merge-queue exit 2（均为 §4.7 约定值）；`report_sha256` 用已构建的
  dist 模块重算通过，且 demo 报告 == analyze（pr-docs-only）报告
  （`9dc3af313677f795…`）；matrix 覆盖 3 scenarios（2/0/2）。
- 浏览器内：报告 h1 + Summary / Event Path / Workflow / Job DAG /
  Required Checks / Witness / Export 六标题全部可见；两 check 均为
  PENDING_NOT_REPORTED；点击 `unit-tests` 行后该行、provider workflow 节点与
  job 节点均带 `.highlight`，`#highlight-note` 显示 provider 路径
  （截图中蓝色高亮可见）；witness 开关切开后 `#witness-diff-witness-001`
  去掉 `.hidden` 并含 `PR-DOCS-ONLY`；matrix 每 scenario 链接各出现 2 处
  （表头 + 场景表），点击 PR-SRC-ONLY 链接到达其报告（两 check
  REPORTABLE_PENDING）；`dist/index.html` 离线 UI 渲染空态
  （"No report loaded. Generate one with the local CLI…" + `node dist/checkpath.mjs demo` 命令）。
- Playwright 浏览器：已安装，无需下载（`chromium-1248/1254`，
  `~/.cache/ms-playwright/`）；`npx playwright --version` 1.65.0。

---

## 4. 离线运行（零外部请求，三重证明）

1. **真断网运行：** `demo` 与 `analyze` 在 `unshare -rn` 中执行——全新 network
   namespace，无可用接口（loopback 亦 down）。退出码与正常运行一致（2/2），
   隔离运行的 `report.json` 与正常运行**字节一致**（同一 `report_sha256 9dc3af31…`）。
2. **系统调用证明：** `analyze` 在 `strace -f -e trace=network` 下重复运行
   （仍在 `unshare -rn` 内）：整个进程树 **0 个网络系统调用**——连 `socket(` 都
   没有创建，更不用说 `connect`。这是比“无外部请求”更强的结论：进程根本不碰网络。
3. **静态扫描 + 浏览器拦截：** `dist/` 与生成的报告共 31 个文件扫描：
   0 个远程资源引用（`src=`/`href=` 走 `http(s)`、CSS `@import`/`url(http)`、
   `fetch(http)`、远程 WebSocket 全无）；CLI bundle 另无 `fetch(` /
   `http(s).request` / `net.connect` / `node:http(s)` 引入。Playwright 路由拦截：
   file:// 报告除文档导航自身外零请求；HTTP 回环加载仅 1 个请求（文档本身，
   127.0.0.1），零外部；dist UI 同样零外部。
4. **裸 URL 字符串不是请求（已说明，不算失败）：** React UI bundle 含 20 处裸
   URL 字符串（W3C XML namespace URI、`react.dev` 错误文档链接）与 Vite 的
   `modulepreload` polyfill 中的 `fetch(`（只对文档内的
   `<link rel="modulepreload">` 发请求，而 `dist/index.html` 中一个都没有），
   以及 `dist/report/html.js` 注释里的 `http://` 字样（注释复述离线断言本身）。
   它们被记为 informational notes，不构成失败——strace 的 0 系统调用与浏览器
   拦截已证明这些字符串从不产生请求。扫描规则最初把 CLI bundle 的裸 URL
   字符串也判失败，误报了上述注释，见 §6 第 2 项（已修正为只禁网络能力面）。

---

## 5. 性能（合成大输入，方法与数字）

- 输入：`scripts/make-perf-input.mjs` 生成，20 workflows × 10 jobs = 200 jobs、
  100 changed files（`src/module-*/file-*.ts`）、50 required checks；两次生成
  字节一致（`input_sha256 82d175d794a47a20…`）；规范副本在
  `evidence/tests/perf-input/`。20/20 workflows 触发，50/50 checks
  REPORTABLE_PENDING，exit 0。
- 测量：1 次 warmup（丢弃）+ 31 次实测 `node dist/checkpath.mjs analyze`
  全进程（含 Node 启动与 20 个 YAML 解析）；每轮墙钟用 `performance.now()`；
  峰值 RSS 为每 2 ms 采样 `/proc/<pid>/status` 的 `VmHWM` 最大值；P95 为
  nearest-rank 百分位。阈值（PROJECT_BOOK §8.2）：P95 ≤ 1000 ms，峰值 ≤ 256 MiB。
- 结果（最终跑）：**P50 529.6 ms、P95 701.2 ms、max 714.1 ms、mean 538.6 ms；
  峰值 RSS（31 轮最大值）101.1 MiB**——两项均通过，余量充足。
  原始逐次时间与 RSS 见 `PERFORMANCE_REPORT.json`（`raw_times_ms` /
  `raw_peak_rss_mib`）。
- 观察（非未决项）：墙钟 P95 在不同轮次间有波动（本任务内两次完整测量为
  560.5 ms 与 701.2 ms），主因是共享 VM 的调度抖动与 Node 启动开销；两次均
  远低于 1000 ms 阈值。数字的主体是进程启动 + YAML 解析，不是求值本身。

---

## 6. 工作中发现并修复的问题（全部是测试/脚手架侧，产品语义零改动）

1. **压力输入生成器初版写错了过滤器组合（生成器 bug，产品行为正确）：**
   偶数 workflow 同时写 `paths` + `paths-ignore`，产品判 INVALID——这是冻结
   规格的正确行为（§1 决策 6：两者互斥）。已改为在 `paths` 内用有序负模式
   `['src/**', '!src/generated/**']`（CP-G 语义），20/20 触发。
2. **离线扫描规则初版过严（扫描器 bug）：** CLI bundle 禁裸 `http(s)://`
   字符串，误报了 `dist/report/html.js` 中复述离线断言的注释。已修正：只禁
   网络能力面（`fetch(`/`http(s).request`/`net.connect`/`node:http(s)` 引入）；
   裸字符串记为 notes；运行时保证由 strace 承担。
3. **vitest 误跑 Playwright spec（脚手架冲突）：** 新建 E2E spec 后 `npm test`
   exit 1——vitest 把 `tests/e2e/*.spec.ts` 当 vitest 套件执行。修复：新建
   `vitest.config.ts`（`test.exclude` 加 `tests/e2e/**`，保留 React 插件使
   .tsx 单测变换不变）；曾尝试把 `test` 塞进 `vite.config.ts`，但其
   `defineConfig` 类型拒绝该键，已恢复原样（`git diff` 为空）。
4. **`helpers.ts` 的 `delete` 类型错误：** `report_sha256` 在交叉类型中非可选，
   `tsc` 报 TS2790。修复：复制为 `Record<string, unknown>` 后再删键。
5. **三处 E2E 断言写法错误（测试侧，产品正确）：** matrix 链接每场景出现
   2 次（表头 + 场景表）→ 断言改为 `toHaveCount(2)`；UI 空态文本是
   `node dist/checkpath.mjs demo` 而非 `checkpath demo`；file:// 加载时
   Playwright 会把文档导航本身记为一次 request → 断言改为“除导航自身外零请求”。

---

## 7. 通过标准逐项核对

- Demo → analyze → HTML/JSON export 完整 E2E 通过：是，8/8（§3）。
- 离线运行无外部请求：是，三重证明（§4），strace 0 系统调用。
- 20 workflows / 200 jobs / 100 changed files / 50 required checks 的 P95 ≤1 秒：是，701.2 ms（§5）。
- 内存目标 ≤256 MiB：是，101.1 MiB（§5）。
- Windows PowerShell 与 Linux shell 的 Quick Start 均通过：**Linux 通过；
  Windows 为 NOT_TESTED**（见 §8 未决项 U-01）。
- 两次独立构建 dist 产物 hash 一致：是，`dist tree sha256 f4464038fabbd92a…`
  （29 文件，两次构建完全一致；`release:verify` 内另做一次双构建验证）。
- README 命令与真实 CLI 一致：是，逐条核对见 §8 下表（`npm ci` 与
  `dist.zip` 入口除外，原因见未决项 U-02/U-03）。

## 8. README 命令逐条核对（逐条运行）

| README 中的命令 | 运行结果 |
|---|---|
| `npm run build` | exit 0（本任务内多次运行；`test_logs/build.log`） |
| `node dist/checkpath.mjs demo` | exit 2（§4.7 约定值；报告 `9dc3af31…`） |
| `node dist/checkpath.mjs analyze --repo . --scenario examples/scenarios/pr-docs-only.json --required-checks examples/required-checks.yml --out reports/pr-docs-only` | exit 2（约定值；与 demo 同一报告哈希） |
| `node dist/checkpath.mjs analyze --repo examples/repo-basic --scenario examples/scenarios/merge-group.json --required-checks examples/required-checks.yml --out reports/merge-group`（merge_group 示例） | exit 2；witness kind `merge_group_missing` ×2；两 check PENDING_NOT_REPORTED；`report_sha256 efc6a6d4…`（与 T010 一致） |
| `node dist/checkpath.mjs matrix --repo . --suite examples/suites/merge-queue.json --required-checks examples/required-checks.yml --out reports/merge-queue` | exit 2（约定值；3 scenarios 2/0/2） |
| `npm run typecheck` / `lint` / `test` / `test:oracle` / `test:e2e` / `test:offline` / `test:performance` / `release:verify`（Verify it yourself 一节） | 全部 exit 0（§2） |
| `npm ci` | **未在本任务重跑**：需访问 npm registry，而本任务禁外部网络；`node_modules` 与 lockfile 均未被 T012 改动。见未决项 U-03 |
| `node checkpath.mjs demo`（dist.zip 内入口） | **未端到端验证**：`dist.zip` 在 T014 才冻结；T012 用 `release:verify` 演练了同一入口（`dist/` 内）。见未决项 U-02 |
| PowerShell 版 Quick Start | **NOT_TESTED**：Linux VM，无 Windows 机器；命令本身与已验证的 bash 版逐字相同（仅分行方式不同）。见未决项 U-01 |

### 平台实测状态

- **Linux（x86_64，Node.js v24.22.1，本 VM）：PASS**——§2 全部命令在此实测。
- **Windows PowerShell：NOT_TESTED**——本机为 Linux VM，无 Windows 可用，
  不得伪称通过；README 已如实标注。

---

## 9. S0 证据完整性

- 回归前后对 `evidence/` 全部 96 个文件取 SHA-256 快照并 diff：仅 5 个
  `evidence/*/logs/` 下的 vitest 计时日志变化（`s0-oracle-ts.log`、
  `s0-parse-t004.log`、`s0-semantics-t004.log`、`golden-oracle-ts.log`、
  `property-ts.log`）——它们是 gitignored 的运行日志（与 T010 相同情况），
  不是已提交的 S0 证据；`git check-ignore` 已确认。已提交的 S0 证据文件
  （含 `S0_GATE.json`、`S0_ORACLE_REPORT.json`、四路差分报告）**零字节变化**；
  S0 fixtures 未动；规格文件 SHA 不变。

---

## 10. 未决项（详见 handoff/P020-T012/unresolved_items.md）

1. **U-01 — Windows PowerShell Quick Start NOT_TESTED**（需 Windows 机器或 Sam 实测；本任务无法解决）。
2. **U-02 — `dist.zip` 内 `node checkpath.mjs demo` 未端到端验证**（T014 冻结产物后复核）。
3. **U-03 — README 的 `npm ci` 未在本任务重跑**（需 registry 网络；lockfile 未动）。
4. 本次无新增语义未决项；T011 的未决项已全部关闭，无结转。

## 11. 交付清单

- 证据：`evidence/tests/T012_REPORT.md`（本文件）、`OFFLINE_REPORT.{md,json}`、
  `PERFORMANCE_REPORT.{md,json}`、`RELEASE_VERIFY_REPORT.json`、
  `perf-input/`（22 文件）、`e2e-output/`（8 trace.zip）、
  `evidence/screenshots/e2e-{report-pr-docs-only,witness-toggle,matrix,ui-viewer}.png`。
- Handoff：`handoff/P020-T012/`（TASK_REPORT.md、changed_files.txt、
  test_commands.txt、test_logs/ 17 个日志、sha256.txt、unresolved_items.md）。
- 环境：Linux x86_64，Node.js v24.22.1，Playwright 1.65.0（Chromium 已安装）。
