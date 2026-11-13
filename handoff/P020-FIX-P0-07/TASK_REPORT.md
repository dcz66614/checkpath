# P020 CheckPath — FIX-P0-07 终报

## 1. 任务与范围

修复 T013 R6 的 grouped P0（唯一根因，4 种形状）：行内普通标量进行中
的引号内 tab。TS 判 VALID，Oracle 判 INVALID / `yaml_parse_error`；
每种 trigger + jobs 各 1 处 DIFF，共 8 处。

- V1：`steps: - run: echo "a<TAB>b"`（双引号）
- V2：`steps: - run: echo 'a<TAB>b'`（单引号）
- V5：`name: some long` 续行 `  "a<TAB>b" tail`（引号在普通标量续行行首）
- V9：V1 加行尾注释 `# c`

范围：只修这 4 例及其同类变体；Oracle 不动；不删测试、不缩小 Oracle
比较范围、不加 mismatch 忽略名单、不把 P0 改回 P2。复核对象：R6 报告
`evidence/review/INDEPENDENT_REVIEW_R6.md`（复核 commit `baf881f`）；
修复基线 HEAD `402a3b0`。工作树独占，修复期间无任何复核并行。

## 2. 根因

`src/core/workflow-parser.ts` 的 `hasRejectedTab` + `isQuoteStart`
把空格后的 `"`/`'` 一律当作引号起始（token-boundary 规则：行首，或
空格/`[`/`{`/`,` 之后）。但 YAML 里引号只有在行内尚未开始普通标量时
才真正开启引用标量——`run: echo "a…"` 中值起始于 `echo`（普通标量进行
中），`"` 只是字面字符；多行普通标量的续行（V5）同理。于是 tab 被当成
"引用标量内的 tab"（合法）而放行，TS 判 VALID；PyYAML 的扫描器在普通
标量内遇到 tab 即报错，Oracle 判 INVALID / `yaml_parse_error`。

FIX-P0-06 终报 §7 把"多行普通标量续行行首的 `"` 当作引号起始"记为近似，
并用 Q1 行锁定——但 Q1 的 tab 在引号外，未能捕获本形状。R6 的 4 形状
正是该近似的全部后果；FIX-P0-06 的"0 残留分歧"结论因此是错的（已在
`evidence/probes/fix-p0-06/README.md` 补附录如实更正，见 §8）。

修复过程中的一次自伤（诚实记录，见 §4.1）：第一版实现在
`startPlain()` 内用 `!lineHasContent` 判断"行首第一个内容"，但各分支
先把 `lineHasContent` 置 true 再调 `startPlain()`，导致裸键规则
（`bareKeyIndent`）永远不生效，V1e（`name:` 下一行写值、再下一行续行）
仍 DIFF。矩阵跑出 80/86 后定位到该 bug，改为调用点先捕获 `first`
再传参，复跑 82/86（仅 4 个已标记 RESID 检查不同）。

## 3. 改动（TS 侧，Oracle 不动）

### 3.1 `src/core/workflow-parser.ts`（唯一产品代码改动）

重写 `hasRejectedTab`（原 L295 起函数体全换；`isQuoteStart` 与
`blockScalarHeaderIndent` 不动），新增"行内普通标量进行中"状态机：

- `plain`（bool）+ `plainIndent`（块上下文缩进）：普通标量跨行延续——
  流集合内换行是折叠空白（任何缩进都延续）；块上下文中下一行须比标量
  的块上下文更缩进；空行折叠、注释行透明；否则标量在上一行末结束。
- `bareKeyIndent`：最近一行以裸 `key:` 结尾时记其缩进；下一行写的值
  属于该键的块上下文（续行阈值是键的缩进，不是值行自己的缩进）——
  `name:\n  some long\n "a\tb" tail` 中缩进 1 的续行仍在标量内。
- 引号只在 `!plain && isQuoteStart(...)` 时开启引用标量；引号闭合后
  `plain=false`（引用标量是完整节点）。
- `:` 分隔符规则：块上下文中仅当其后是空格/tab/行尾；流上下文中其后
  是流指示符 `,[]{}` 时也分隔（`{a:"b"}`、`{a:1}` 仍是单个普通标量）。
- `,`/`]`/`}` 仅在流集合内结束普通标量（块上下文中是字面字符，
  `key: a[b` 是一个标量）；`[`/`{` 仅在无普通标量进行中时进流深度
  （普通标量内的 `[` 是字面字符）。
- `-`/`?` 仅在无普通标量进行中、后跟空格/tab/行尾、且处于 token 边界
  时是指示符；否则开始/延续普通标量。
- `&`/`!`/`*` 在标量起始位置进入 inProp 状态，消费名字符
  `[A-Za-z0-9_./-]+`（覆盖 `&a.b`、`!!str`）；锚点/tag 之后引号是引号
  起始。
- `#` 在 token 边界（行首或空格后）恒开启注释（即使普通标量进行中，
  标量到此结束）；其他位置是普通标量字面字符。
- 块标量头检测不变；`#` 前的 tab 仍在 tab 本身处拒绝。

`extractJobs`（`src/core/e2e.ts` L270）调用同一函数，两调用点同修。
走既有 `yaml_parse_error` 路径；无输入文本手术式预处理（§7.3）；
Oracle 零改动；`src/` 其余文件零改动。

### 3.2 Fixture 与测试

- `tests/fixtures/parser-divergence/quoted-mid-plain-scalar/`（新，12 例
  f01–f12 + `expected.json` + `README.md`）：V1/V2/V5/V9 及同类变体
  （锚点后、流式、普通键、裸键下一行值、续行中间、空行后续行、流式
  plain-quote），f12 为 VALID 边界（真正引用标量内 tab，续行缩进大于
  块上下文）。`expected.json` 由双侧实测生成并经全 JSON 深相等断言
  后冻结。
- `tests/unit/diff-boundaries/quoted-mid-plain-scalar.test.ts`（新，13
  个测试）：锁定双侧 status / errors / 全量 events / 全量 jobs，
  trigger + jobs 双模式。
- trigger T6-62..T6-67（6 例，`source: "fix-p0-07"`）：V1/V2/V5/V9 +
  V1e + V1f；suite 86 → 92。
- golden G-126..G-131（6 例，`scripts/build-golden.py` 新增 fix-p0-07
  块，同 FIX-P0-06 模式）；suite 125 → 131。
- 计数注释同步：trigger-oracle-dump / trigger-suite /
  oracle-diff-trigger（86 → 92）、golden.test / oracle-diff.mjs /
  formal-pipeline-unsupported（125 → 131）。

## 4. 探针证据

`evidence/probes/fix-p0-07/`（新，cases.json 43 行、run-matrix.py、
ts-probe-entry.ts、README、results.json）——探针证据进仓库，缓解
P2-R6-2（R6 探针只在 `/tmp/r6probe/`，重启即丢）。

- 基线（HEAD `402a3b0`，修复前）：**60/86 MATCH**；22 个未标记 DIFF
  = 11 个 V1 族行 × 2 模式 + 4 个已标记 RESID 检查。
- 修复后：**82/86 MATCH**；仅 4 个已标记 RESID 检查不同（见 §7）。
- 边界行全部保持 MATCH：V3/V4 真正引用标量、V6 tab 在引号外、V7
  引号粘贴普通文本、V8 引用键、Q1、Q3、B4/B5/B6、TAB-COMMENT、
  TAB-BLOCK、N5 显式集合键、X-empty-2/3/4、ANCHOR-QUOTED、TAG-QUOTED、
  FLOW-V3-QUOTED、SEQ-ITEM-QUOTED、MULTILINE-QUOTED-TAB（缩进续行）、
  MULTILINE-QUOTED-TAB-SQ、COMMENT-THEN-CONT-QUOTE-TAB、
  TRAILING-COMMENT-THEN-CONT、Q8、FLOW-NESTED-QUOTED、
  FLOW-PLAIN-KEY-TAB、EXPLICIT-QUOTED-KEY、V1g-explicit-plain-key-quote、
  COMMENT-THEN-CONT、TRAILING-COMMENT-THEN-CONT。

### 4.1 自伤回归事件（V1e，诚实记录）

第一版 `startPlain()` 的裸键规则因调用顺序 bug 失效（§2 末），矩阵
80/86，V1e 两模式仍 DIFF。修复后复跑 82/86。无其他自伤：三套旧矩阵
一次跑过（见 §6）。

## 5. 验收实测数（全部亲自重跑，同一干净窗口，HEAD ca7a584）

| 命令 | 实测 |
|---|---|
| `npm test` | **1215/1215 通过**（40 文件；修复前 1178，新增 37：parser-divergence 新测试 13 + trigger-oracle-dump 6 + golden 6 + formal-pipeline-unsupported 12——后三者均由套件扩容带入） |
| `npm run test:oracle` | **131 fixtures，131 passed，0 failed，0 mismatches，0 false PASS**；unsupported UNKNOWN 34/34 |
| `npm run oracle:diff:trigger` | 92 fixtures，0 mismatch |
| `npm run oracle:diff:jobs` | 48 fixtures，0 mismatch |
| `npm run oracle:diff:checks` | 46 fixtures，0 mismatch |
| `npm run oracle:diff:witness` | 44 fixtures，0 mismatch |
| `npm run s0:gate` | **PASS**：oracle 24/24，mismatches 0，false PASS 0，100 runs 1 unique hash，network matches 0；**gate_report_sha256 `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386` 不变** |
| `npm run release:verify` | **PASS**（offline scan 34 文件 0 远程引用；license guard PENDING_SAM_DECISION） |
| `python3 scripts/build-golden.py --check-only` | 131 cases，exit 0 |
| `npm run typecheck` | exit 0（矩阵跑前已验证） |

试冻两次（三哈希自洽，`--trial`，HEAD `ca7a584`）：

| 产物 | 哈希（两次运行完全一致） |
|---|---|
| source.zip（1,780 文件） | `0f89fce9012d7c0f4610ce017744b125de3a7a541abedde008ac86221d027da3` |
| dist.zip（114 文件） | `c391ad648d56db7c91e5a49fdae0fb2cae1972c2a771f1d2f83ba643249cf024` |
| RELEASE_MANIFEST.json | `d538f8fe5c595684228ad18261e45d429b1b5c29fe4a173ace366c7af70a64fe` |

注：dist.zip 与 R2 的 `da130ad2…` 不同——符合预期，FIX-P0-04/06/07
改了 TS 产品代码（dist 树哈希亦变）。试冻覆盖了工作树内已跟踪的
R2 正式冻结产物后已用 `git checkout -- release/` 恢复（R2 哈希
`3a778b93…` / `da130ad2…` / `04a07733…` 完好）；正式重冻是 T014 的事。

无测试删除（`git diff --diff-filter=D` 为空）；无 mismatch 忽略名单；
Oracle 零改动；`src/` 仅 `workflow-parser.ts` 一文件（+209/−15）。

## 6. 回归矩阵重跑（§5 已含，此处汇总）

| 矩阵 | 结果 |
|---|---|
| fix-p0-04（100 checks，含 R5 的 66 例全 JSON 深相等子集） | **100/100 MATCH**（2 个已标记 known-divergence 检查在内） |
| fix-p0-05（76 checks） | **76/76 MATCH**（4 个已标记） |
| fix-p0-06（134 checks） | **134/134 MATCH**（0 标记） |
| fix-p0-07（86 checks，本轮新增） | **82/86 MATCH**（仅 4 个已标记 RESID 检查不同） |
| R6 的 V1/V2/V5/V9 | 全部关闭（trigger + jobs 各 2 模式，共 8 处 DIFF 归零） |

## 7. 残留分歧清单

### 7.1 RESID — 未缩进的多行引用标量续行（parser 层，超出本轮范围）

`yaml` npm 包拒绝多行引用标量续行缩进 ≤ 块上下文缩进的形状
（例：`run: "a\nb\tc"` 续行缩进 0；`- run: "a` 续行缩进 ≤ 8 = `run`
键缩进；实测阈值：续行缩进 9+ 解析通过，8− 失败），而 PyYAML 接受
任意缩进。**且不带 tab 也分歧**（`run: "a\nb c"` → yaml 包报错
`Missing closing "quote`，PyYAML 正常）。双引号与单引号均受影响。

根因是 `yaml` 包的解析器宽容度，不是 `hasRejectedTab`
（`hasRejectedTab` 对这些形状正确返回 false，分歧出在 `parse()`
本身）。修它需要解析器层改动（换解析器或在解析前对输入做手术——
后者被 §7.3 禁止），超出 FIX-P0-07 范围。已在探针矩阵中标记为
known_divergence（RESID-MULTILINE-QUOTED-UNINDENTED-DQ/SQ，各
trigger + jobs 2 检查，共 4 检查），在 parser-divergence fixture
目录 README 与本终报如实列出，未隐瞒。**建议 parent 决定：R7 前是
否另派一轮解析器层修复，还是由 R7 评级。** 若 R7 将其评为 P0，
本轮的 82/86 与 1215/1215 均不受影响（该形状不在任何已冻结 fixture
中）。

### 7.2 其他

无。R6 的 6 个 P2 全部仍在（P2-R6-1 manifest 只记到 R3、P2-R6-2
探针归档——本轮的探针进仓库即是 P2-R6-2 的缓解；R2 的 6 个 P2
仍在）；许可证仍为 PENDING_SAM_DECISION。

## 8. 文件与提交

- 代码提交：`ca7a584` "FIX-P0-07: hasRejectedTab tracks
  plain-scalar-in-progress (R6 P0)"（76 文件，+3448/−42；含
  `src/core/workflow-parser.ts`、12 个 parser-divergence fixture +
  expected.json + README、T6-62..T6-67、G-126..G-131、13 个新单元
  测试、3 份再生证据 JSON、fix-p0-07 探针目录、fix-p0-06 README 附录）。
- 另附：`evidence/probes/fix-p0-06/README.md` 增加 FIX-P0-07 附录，
  如实更正 FIX-P0-06 的"0 残留分歧"结论（§2 所述近似正是 R6 P0
  的来源）。
- 本终报：单独 commit（见 HEAD）。
- 未提交：`reports/`（2026-11-08 旧演示产物，修复前已存在，与本轮
  无关，留原样）。

## 9. 下一步建议（给 parent）

1. 派 T013 R7（全新会话、干净克隆、HEAD `ca7a584`）：必须重跑
   V1/V2/V5/V9 + 三套旧矩阵 + R5 66 例 + 本轮 82/86 矩阵；并请 R7
   对 §7.1 的 RESID 形状定级（P0 或 P2），不要由修复方自评。
2. R7 PASS 后：T014 R3 正式重冻（manifest `inputs` 须补记 R4/R5/R6/R7，
   P2-R6-1）+ Drive 重归档进新 `01_release_R3` 文件夹（不覆盖 R1/R2）
   → 终审 R3（同立项对话，GPT-6 + Extra High + 全尾巴）。
3. 若 R7 对 §7.1 评 P0：另派解析器层修复轮（不属于 FIX-P0-07 的
   hasRejectedTab 范围），修完再 R8。
