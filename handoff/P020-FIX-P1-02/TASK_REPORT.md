# P020 CheckPath — FIX-P1-02 / P2-3 / P2-4 / P2-6 任务报告

- **任务：** 终审 R1（FINAL_VERDICT: FAIL，P0 0 / P1 2 / P2 6，裁决见
  `~/workspace/P020_R1_VERDICT.md`）定点修复：FIX-P1-02（冻结脚本纳入
  可交付源码）+ P2-6（commit 对应关系补记录）+ P2-3（README 性能数
  更新）+ P2-4（PyYAML 版本锁与环境不一致）。
- **执行员：** FIX-P1-02 执行员（与 FIX-P1-01 Oracle 重复键执行员并行；
  文件不重叠：本人未碰 `oracle/*`、`tests/*`、`src/*`、
  `scripts/release-verify.mjs`；未跑 `npm test` / `test:oracle` /
  `s0:gate` / `release:verify`）。
- **日期：** 2026-11-08
- **许可证：** `PENDING_SAM_DECISION`（未写任何许可证名）。

## 0. 状态总览

| 项 | 状态 |
|---|---|
| FIX-P1-02 工具修复（纳入规则） | DONE，见 §1 |
| FIX-P1-02 试冻验证（真实仓库，FIX-P1-01 提交之后） | DONE，见 §1.5 与 §5 |
| P2-6 commit 对应关系补记录 | DONE（Manifest 规则 + T014 报告 §9 补记），见 §2 |
| P2-3 README 性能数更新 | DONE（自测数），见 §3 |
| P2-4 PyYAML venv 复验 | DONE（锁文件无问题，补记录），见 §4 |
| 正式 T014 重新冻结 / T013 复核 / Drive / ACCEPTED 标记 | 不做（按任务要求，另由协调员安排） |

## 1. FIX-P1-02 — 冻结脚本纳入可交付源码

### 1.1 根因（已查明，非猜测）

读完 `scripts/deterministic-zip.py` 全文 + Git 核查：

- `933dd35` 的树里**根本没有** `scripts/deterministic-zip.py`
  （`git ls-tree 933dd35 -- scripts/deterministic-zip.py` 为空；
  `git cat-file -e 933dd35:scripts/deterministic-zip.py` 不存在）。
  该脚本是 T014 任务中新建的，冻结运行时仍是**未跟踪文件**。
- `do_freeze` 的 `source.zip` 只从 `git ls-files`（+ `git cat-file
  --batch` 读 HEAD 内容）构建——未跟踪文件天然不在其中。
- 第 283–286 行附近的 dirty-check 明确**允许**未跟踪的冻结脚本
  本身（"explicitly allowed"），但没有任何代码**把它打进**
  source.zip。**允许而不纳入**就是根因。
- 后果与裁决一致：Manifest 只记了脚本 SHA-256（`33b026f3…`），
  source.zip 里没有脚本；GPT 从干净解压目录跑 `npm run
  release:freeze` 得 exit 2（`can't open file
  'scripts/deterministic-zip.py'`）。冻结提交 `3e5e145` 才把脚本
  提交进树——为时已晚，source.zip 早已生成。

### 1.2 修复（`scripts/deterministic-zip.py`，177 行 diff）

1. **纳入规则**：`source.zip = HEAD 树 + 冻结脚本本身`。脚本在 HEAD
   已跟踪时取 HEAD 字节；未跟踪时取正在执行冻结的本文件工作树字节
   （`__file__`），并打印一行明示。dirty-check 仍拒绝“已跟踪但被
   修改”的脚本，所以两种来源不可能不一致；Manifest 的
   `freezer.sha256` 同样取自 `__file__`，与 zip 内字节恒一致。
2. **HEAD 门禁放宽**：原 `EXPECTED_COMMIT` 精确相等检查改为
   “HEAD == 933dd35，或为其后代”，否则拒绝（`git merge-base
   --is-ancestor`）。原检查会拒绝一切 R1 修复后的冻结；放宽后仍
   拒绝无关树。Manifest 记录实际 HEAD 为 `source_commit`。
3. **Manifest 增加** `source_commit` / `source_commit_short` /
   `freeze_commit` / `freeze_status` / `freeze_history`（此前各次
   冻结的链，从 HEAD Manifest 承接；历史只记**此前**各次，不含本次，
   因此同一 HEAD 重跑冻结可逐字节复现 Manifest——T014 的确定性
   保证得以保留）。`--trial` 标志：
   `python3 scripts/deterministic-zip.py --freeze --trial` 标记试冻，
   Manifest 写明 TRIAL、非正式 T014 重新冻结；`npm run release:freeze`
   仍是正式路径（无 `--trial`）。
4. `source.zip` 的 `contents` 描述同步更新。
5. **管道死锁修复（试冻中发现，同一任务）**：原 `read_head_files`
   先写全部 `git cat-file --batch` 查询、再读响应；查询总量超过
   stdin 管道缓冲（~64 KiB）即死锁。R1 试冻时树已长到 1,203 文件 /
   71,022 查询字节，冻结卡死 4 分钟以上（`git cat-file` 停在
   `anon_pipe_write`，父进程 0 CPU）。T014 时 1,144 文件恰好塞得下，
   故为潜伏 bug。已改为逐条写读交错；实测 1,203 文件 2.5 秒读完。
   若无此修复，当前树规模下任何冻结都无法运行。

### 1.3 根因场景复现验证（scratch 副本，HEAD = 933dd35，脚本未跟踪）

在 `/tmp/p020-untracked-test`（933dd35 副本 + 修复后脚本，未跟踪，
  与 T014 时状态完全一致）跑 `--freeze --trial`，日志
  `test_logs/scratch-freeze-933dd35-untracked.log`：

- freeze exit 0；`freezer script untracked at HEAD; including
  working-tree scripts/deterministic-zip.py (31935 bytes) in source.zip`。
- `source.zip` **1,145 文件**（1,144 跟踪 + 冻结脚本），
  `1042a65a02b5fb4de2b20e08a084e42ea54169b9202b40f9180a518c3e14f4a2`；
  zip 内脚本 SHA-256 与工作树脚本、Manifest `freezer.sha256`
  三方一致（`26e94b98…`，修复后脚本）。
- **`dist.zip` 哈希 `da130ad2…73911e6`，与冻结值逐字节一致**——修复
  不影响 dist。
- `--verify` 两 zip 均 OK；`sha256sum -c SHA256SUMS.txt` 3/3 OK。
- 同一 HEAD 第二次重跑：三哈希完全相同（确定性保持），日志
  `test_logs/scratch-freeze2-rerun.log`。
- 种子链验证（`/tmp/p020-seed-test`，HEAD 为 3e5e145 后代并提交了
  修复脚本）：Manifest `freeze_history` 正确播种为原始映射
  `[{source_commit: 933dd35…, freeze_commit: 3e5e145…, status: FORMAL}]`，
  `source_commit` 为当前 HEAD，dist 仍为 `da130ad2…`，日志
  `test_logs/seed-freeze-3e5e145-descendant.log`。

### 1.4 干净解压目录重跑（字面测试 + 说明）

字面测试：解压试冻 source.zip 到全新 `/tmp/clean-freeze-test`
（无 `.git`、无 `node_modules`），跑 `npm run release:freeze`，
日志 `test_logs/clean-dir-freeze.log`：

- **不再是 P1-2 的失败**：脚本找到了并开始执行（GPT 的 exit 2
  `can't open file 'scripts/deterministic-zip.py'` 已消除）。
- 实际失败点变为 `FAIL: command failed (128): git rev-parse HEAD —
  fatal: not a git repository`。这是**设计使然，非 P1-2**：
  source.zip 按约定不含 `.git`，而冻结器所有输入都从 HEAD 经 git
  读取；且冻结本身是仓库内操作，需要 dev 依赖（`npm run build`
  要 vite，vendoring 要 `node_modules/yaml`）。T014 的干净目录验证
  同样只做了 dist.zip 独立运行，未在解压目录跑冻结。
- 因此“干净目录重跑 release:freeze 实测通过”的完整形态在真实仓库
  试冻后补做：**全新 git clone 到 /tmp + checkout 试冻 commit +
  `npm ci` 后跑 `--freeze --trial`，并与仓库内试冻三哈希逐字节比对**
  （跨目录确定性证明）。结果见 §5——**三哈希逐字节一致，通过**。
  字面解压目录重跑（新试冻 source.zip）结果不变：脚本找到并执行，
  仅因无 `.git` 失败，日志
  `test_logs/clean-dir-freeze-trial-source.log`。

### 1.5 真实仓库试冻（HEAD 36476cf）

- FIX-P1-01 于 `11f2fc0` 提交后试冻（等待约 5 分钟，未超 40 分钟
  上限）。第一次试冻卡死于 `read_head_files` 管道死锁（见 §1.2
  第 5 点），杀死进程、修复、单独提交 `36476cf` 后重跑。
- 试冻 HEAD：`36476cf`（= a3a29d2 修复 + 11f2fc0 FIX-P1-01 +
  36476cf 死锁修复），日志 `test_logs/trial-freeze.log`，exit 0，
  约 20 秒。
- `source.zip`：`2057e207bf35b47f6aabc94386bb8d9aa5b0e04cddf5f562145142fdadba4bd0`（1,203 文件）。
- `dist.zip`：`da130ad2747a810c0f62488245fe7902298199faa6e8372f3975d58b573911e6`（114 文件）——**与冻结值逐字节一致**。
- Manifest：`6745287584ce0ba5611794c326d8d4eba03d3a3a458e4a05ce50e90db2df7d94`；
  `source_commit` = `36476cf19264b3a2f3d0b907bb61f92df47ec91e`；
  `freeze_commit` = TRIAL 标记；`freeze_status` = TRIAL；
  `freeze_history` = `[{source_commit: 933dd35…, freeze_commit: 3e5e145…, status: FORMAL}]`。
- `unzip -l`：`scripts/deterministic-zip.py` 在内（33,717 字节）；
  其 SHA-256 `d4a5784e…` 与仓库文件、Manifest `freezer.sha256`
  三方一致。`--verify` 两 zip 均 OK；`sha256sum -c` 3/3 OK。

## 2. P2-6 — commit 对应关系补记录

- **Git 证据**（本机仓库实测）：`git rev-parse 3e5e145^` →
  `933dd354e109436551ba40b96d5b4a2d83b839a6`（freeze commit 的**直接父
  提交就是 source commit**）；`git merge-base --is-ancestor 933dd35
  3e5e145` 成立；`933dd35..3e5e145` 仅 1 个 commit；脚本在 933dd35
  不存在、在 3e5e145 存在（内容 SHA-256 `33b026f3…`，与 Manifest
  `freezer.sha256` 一致）。GPT 的判断得到确认：无污染/篡改证据，
  只是记录不清。
- **补记录**：
  - `evidence/release/T014_FREEZE_REPORT.md` 追加 §9 补记
    （2026-11-08，只追加，未改写原文）：分别写明 source_commit
    933dd35（被冻结的源码，T013 re-review PASS）与 freeze_commit
    3e5e145（冻结提交本身，仅加 29 个冻结产物/工具文件，未改源码），
    附上述 Git 证据。
  - `release/RELEASE_MANIFEST.json`：冻结器今后每次生成都写
    `source_commit` / `freeze_commit` / `freeze_status` /
    `freeze_history`（见 §1.2 第 3 点）。原始映射已作为种子写进
    冻结器（`933dd35… → 3e5e145…`），试冻 Manifest 将自动携带。

## 3. P2-3 — README 性能数更新（自测，非抄 GPT 数）

- 方法：项目自带 `npm run test:performance`
  （`scripts/release-verify.mjs --performance`；README/性能报告既有
  方法：合成压力输入 20 workflows / 200 jobs / 100 changed files /
  50 required checks，1 warmup + 31 timed runs，全 CLI `analyze` 进程
  墙钟，`VmHWM` 每 2 ms 采样峰值 RSS，P95 最近秩）。
- 结果（2026-11-08，本机实测，**performance PASS**）：
  **P95 768.3 ms，峰值 RSS 98.3 MiB**（P50 556.5 ms，max 965.5 ms，
  mean 582.3 ms；input SHA-256 `82d175d794a47a20…`）；阈值 P95 ≤
  1000 ms、RSS ≤ 256 MiB 均通过。证据：
  `evidence/tests/PERFORMANCE_REPORT.{json,md}`（本次运行重写，已提交）。
- README 已更新为自测数（P95 768.3 ms / 98.3 MiB，含 P50/max/mean
  与 input SHA 前缀），**未采用 GPT 终审重测的 697.9 ms /
  100.2 MiB**。旧数 794.5 ms / 94.2 MiB 为上次快照。

## 4. P2-4 — PyYAML 版本锁与环境不一致

- 现状：`oracle/requirements.lock.txt` 锁 `PyYAML==6.0.3`；T014 实际
  环境为系统 PyYAML 6.0.1（`ENVIRONMENT_REPORT.md` §D2：锁版本未装，
  系统 6.0.1 满足 6.x 要求，被认为可用）。
- 复验（独立 venv，未动仓库文件）：`python3 -m venv
  /tmp/p020-pyyaml-venv` + `pip install PyYAML==6.0.3`；用
  `scripts/oracle-parse-probe.py` 对全部 golden workflow YAML
  （80 个，64×`workflow.yml` + 16 个其余形态）分别以系统解释器
  （6.0.1）与 venv 解释器（6.0.3）跑 Oracle 解析并逐字节比对。
- 结果：**80/80 输出逐字节一致**，全部 exit 0；`BaseLoader` 下 `on`
  仍为字符串键；重复键 last-wins 在两版本下相同（故该分歧是 Oracle
  解析器使用 `BaseLoader` 的属性，与 PyYAML 版本无关，由 FIX-P1-01
  另行修复）。可重跑脚本与日志：
  `test_logs/venv-verify.sh` / `venv-verify.log`（重跑时因并行
  FIX-P1-01 新增 3 个未跟踪 fixture，覆盖 83 个，仍全部一致）。
- 结论：**锁文件本身无问题，不修正锁文件**；只是环境记录问题。
  补记录：新建
  `evidence/environment/PYYAML_6_0_3_VENV_VERIFICATION.md`；README
  的 "(PyYAML 6.0.1)" 更正为锁版本 6.0.3 并注明系统自带 6.0.1、
  行为已验证一致。Manifest 的 `toolchain.pyyaml` 仍如实记录冻结时
  系统解释器版本（T014 为 6.0.1），那是环境事实，不是锁版本。

## 5. 试冻验证（真实仓库，FIX-P1-01 提交之后）— DONE

- [x] `git log --oneline -3` 确认 FIX-P1-01 commit 已出现：`11f2fc0`
      "FIX-P1-01: Oracle rejects duplicate YAML keys + dup-name fixture
      + static network check coverage"（等待约 5 分钟）。
- [x] 真实仓库 `--freeze --trial`（HEAD `36476cf`），日志：
      `test_logs/trial-freeze.log`，exit 0。结果见 §1.5。
- [x] `unzip -l` 证据：`scripts/deterministic-zip.py` 在 source.zip
      内（33,717 字节），哈希 `d4a5784e…` 与仓库文件一致；
      `--verify` 两 zip OK；`sha256sum -c` 3/3 OK。
- [x] dist.zip 哈希与冻结值 `da130ad2…73911e6` 一致（逐字节相同，
      故 `release/dist.zip` 在试冻后无改动）。
- [x] 全新 git clone（`/tmp/p020-clean-clone`，HEAD `36476cf`，干净
      树）+ `npm ci` 后 `--freeze --trial` 重跑，三哈希与仓库内试冻
      **逐字节一致**（source `2057e207…`、dist `da130ad2…`、manifest
      `67452875…`）；`sha256sum -c` 3/3 OK，`--verify` 两 zip OK。
      日志：`test_logs/clean-clone-freeze.log`。
- [x] 干净解压目录字面重跑结果见 §1.4（新试冻 source.zip 复测，
      日志 `test_logs/clean-dir-freeze-trial-source.log`）。
- [x] 试冻产物（`release/source.zip`、`release/dist.zip`（无改动）、
      `release/SHA256SUMS.txt`、`release/RELEASE_MANIFEST.json`）
      单独提交；Manifest 写明 TRIAL、非正式 T014 冻结。见 §6。

## 6. 提交

- 修复 commit：`a3a29d2`（FIX-P1-02 + P2-3/4/6）
  （含：`scripts/deterministic-zip.py`、README、
  `evidence/release/T014_FREEZE_REPORT.md`、
  `evidence/tests/PERFORMANCE_REPORT.{json,md}`、
  `evidence/environment/PYYAML_6_0_3_VENV_VERIFICATION.md`、
  `handoff/P020-FIX-P1-02/` 初版）。
- 死锁修复 commit：`36476cf`（`read_head_files` 管道死锁修复 +
  报告更新）。
- 试冻产物 commit：`7638f06`（FIX-P1-02 trial freeze, TRIAL）。
  （含：`release/source.zip`、`release/SHA256SUMS.txt`、
  `release/RELEASE_MANIFEST.json`——`release/dist.zip` 无改动；
  本报告定稿 + `test_logs/trial-freeze.log`、
  `test_logs/clean-clone-freeze.log`、
  `test_logs/clean-dir-freeze-trial-source.log`。）
- 未提交、未动的他人/再生文件：`evidence/s0/S0_ORACLE_REPORT.json`、
  `evidence/tests/ORACLE_PARITY_REPORT.json`、
  `evidence/tests/RELEASE_VERIFY_REPORT.json`、
  `evidence/tests/T006_ORACLE_TRIGGER_REPORT.json`、
  `oracle/*`、`tests/*`、`scripts/build-golden.py`、
  `scripts/oracle-diff*.mjs` 的工作树改动，以及未跟踪的 `reports/`——
  均未动、未提交（`git add` 均为明确路径，未用 `git add -A`）。

## 7. 已知遗留 / 提请协调员注意

1. **试冻 Manifest 的 `known_limitations` 有两行已过期**：冻结器
   硬编码的 `"Duplicate-key YAML divergence is a known limitation
   (ADR FIX-P2/01)..."` 在 FIX-P1-01 落地后不再成立（Oracle 也会
   判 INVALID）；`"P2-R2-2: duplicate-key dup-name shape probed but
   not locked by a fixture/test"` 同样过期（11f2fc0 已加 G-83
   dup-name fixture）。这两行在冻结器脚本内，不属于 FIX-P1-01
   执行员的文件范围，本人未改（避免越界）；**正式 T014 重新冻结
   前须有人更新这两行**（或 FIX-P1-01 执行员在其报告中注明由冻结
   方更新）。试冻 Manifest 为 TRIAL 产物，本报告在此明示。
2. **干净解压目录无法字面跑通 `release:freeze`**（无 `.git`、
   无 `node_modules`，见 §1.4）。这是冻结器“仓库内操作”的既有
   设计，不是 P1-2；P1-2 本身（脚本缺失致 exit 2）已修复。建议
   正式复核以“全新 clone + `npm ci` 后重跑并比对三哈希”作为干净
   环境验收，而非“无 git 的解压目录跑冻结”。
3. 性能数为单次快照（P95 768.3 ms / 98.3 MiB），与上次（794.5 /
   94.2）及 GPT 重测（697.9 / 100.2）均在同一量级、均过阈值；机器
   负载会使快照浮动，属正常。
4. 规格文件未碰；许可证仍为 `PENDING_SAM_DECISION`；未做 T013
   复核、正式 T014 冻结、Drive、ACCEPTED 标记、完成通知。
