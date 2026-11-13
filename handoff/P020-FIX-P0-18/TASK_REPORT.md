# FIX-P0-18 任务报告（T013 R17 唯一新 P0 家族）

- 代码提交：`55bd04a2f46d083dfe1feb647091edb901b1b210`（“FIX-P0-18: extend absorbed-colon position rule to aliases (R17 new P0 family; R17 probe 141/141)”）
- 本报告提交：见文末（与代码提交分离）
- 修复范围：只改 `oracle/checkpath_oracle/parser.py`；`src/` 零改动
- 结论：**R17 的唯一新 P0 家族已关闭**——R17 76 形探针由修复前 124/141 升至 **141/141 MATCH**；全部验收电池通过；唯一残留是 1 个预先存在的流式别名重复键分歧（§7），与本轮机制不同，留待另轮处理。

## §0 任务

T013 R17 = NOT PASS（P0 1 / P1 0 / P2 8），证据提交 `54b3ef6`。R16 的 2 个 P0 家族已独立验证全部关闭；唯一新 P0 家族（R17 §2）：键位置吸入锚 `&w:2` 定义后，值位置吸入别名 `*w:2` 无镜像拒收规则（9 形，17 检查，Oracle 接受、TS 拒收）。

## §1 根因

- `scan_anchor` 同时服务于 `fetch_anchor` 与 `fetch_alias`：`&w:2` 吸入为锚 `w:2`，`*w:2` 同样吸入为别名 `w:2`。
- 但 FIX-P0-17 的位置规则 `_reject_absorbed_anchor_colon_value_position` 只遍历 `AnchorToken`，从不检查 `AliasToken`，所以值位置的 `*w:2` 畅通无阻，Oracle 判 VALID。
- TS 侧 `hasRejectedAnchorOrTag` / `checkProperty` 对 `&` 与 `*` 用同一 `keyPos` 判定——值位置 `keyPos` 为假即拒收（`yaml_parse_error`）。
- Token 流实测确认（修复前亲自运行）：`&w:2 a: 1` + `b: *w:2` 中，`AnchorToken('w:2')` 的 keyPos 为真，`AliasToken('w:2')` 的 keyPos 为假——判别式在两侧是对称的，缺的只是 Oracle 侧对别名的检查。

## §2 修复

`oracle/checkpath_oracle/parser.py`，+36/−3 行（含 docstring）：

- 位置规则的遍历从 `AnchorToken` 扩展为 `(AnchorToken, AliasToken)`，触发条件不变：name 含 `:`（即被吸入）且 `_absorbed_anchor_is_key_position(tokens, i, in_flow)` 为假。
- 仍抛 `yaml.YAMLError` → `yaml_parse_error`，与 TS 对 `*` 的判定对齐；错误信息按种类区分（`absorbed-colon alias outside implicit-key position` / `absorbed-colon anchor …`）。
- 判别式与 FIX-P0-17 完全相同（`hasRejectedAnchorOrTag` 的 keyPos 镜像），未引入新判别逻辑；`_reject_adjacent_alias_colon` 已拥有的别名键形不受影响（同为 `yaml_parse_error`，码不变，见 §3 的 `b-flow-key` 控制形）。

修复前基线（亲自复现，代码提交 `50788a7`）：R17 探针 **124/141 MATCH，17 DIFF**，全部属于 H3/H8 别名家族（TS INVALID/`yaml_parse_error` vs Oracle VALID/UNKNOWN）。
修复后：R17 探针 **141/141 MATCH，0 DIFF**。

## §3 控制形验证（R17 §2.5，逐一亲自运行，全部为控制形）

新网格 `evidence/probes/fix-p0-18/` B 组 8 形、16 检查，**全部 MATCH**：

| 形 | YAML | TS | Oracle |
|---|---|---|---|
| b-block-seq-item | `- *w:2` | VALID | VALID |
| b-flow-seq-item | `[*w:2]` | VALID | VALID |
| b-after-tag | `m: !zap *w:2` | INVALID | INVALID |
| b-after-anchor | `m: &s *w:2` | INVALID | INVALID |
| b-explicit-key | `? *w:2` | INVALID | INVALID |
| b-flow-key | `m: {*w:2: 1}` | INVALID | INVALID |
| b-anchor-def-only | `&w:2 a: 1`（无别名使用） | VALID | VALID |
| b-plain-alias | `*w`（无 `:`，规则不触发） | VALID | VALID |

即：序列项吸入别名（块/流）双边 VALID；tag 后、anchor 后、显式键、flow 键的别名双边 INVALID；键位置吸入锚定义本身双边 VALID；普通别名不受影响。`b-flow-key` 证实新规则未改变 `_reject_adjacent_alias_colon` 已拥有的别名键形（错误码仍为 `yaml_parse_error`）。

## §4 映射完整性

新网格 `evidence/probes/fix-p0-18/`（`gen-cases.py`、`p18-probe.py`、`cases.json`、`results.json`，40 形 / 79 检查）：**77/79 MATCH，2 DIFF**（见 §7）。

- A 组 = R17 的 9 个家族形：**17/17 MATCH**（块值、流值、嵌套值、`on:` 值、`jobs:` 值、第 2 对值位置、多次使用，全部覆盖）。
- B 组 = R17 §2.5 的 8 个边界控制形：**16/16 MATCH**（§3）。
- C 组 = 23 个新 hunting 形：**44/46**，2 DIFF 均来自同一形状 `c-flow-key-null-2nd`（§7）。

## §5 验收（全部在代码提交 `55bd04a` 上亲自重跑）

完整日志：`handoff/P020-FIX-P0-18/acceptance-log.txt`（电池 2026-11-09 21:26–21:44Z + 电池后附记）。

| 检查 | 结果 |
|---|---|
| npm test | **1661/1661（52 文件）** |
| test:oracle | 167 fixtures，**0 mismatch**，false PASS 0，34/34 UNKNOWN |
| typecheck | exit 0 |
| s0:oracle | **0 mismatch**，false PASS 0，2/2 UNKNOWN |
| build-golden --check-only | 167 cases，exit 0 |
| s0:gate | **PASS**，oracle 24/24，determinism 100 runs / 1 hash，gate_report_sha256 = `f511a84709a6ebf64af94cb788ad3e15cef85af5862b5334fca4288b6ff38386`（不变） |
| release:verify | **PASS**（license guard：无 LICENSE 文件，LICENSE_STATUS.md 仍为 PENDING_SAM_DECISION） |
| oracle:diff trigger / jobs / checks / witness | 128 / 48 / 46 / 44，**全部 0 mismatch** |
| R17 探针 | **141/141 MATCH**（电池内两次：首次与验收重跑一致） |
| R16 探针 | **362/362 MATCH** |
| R15 / R14 / R13 / R12 / R11 / R10 探针 | **122/122、78/78、98/98、118/118、74/74、88/88** |
| R14 / R15 探针 | 仅出现 FLAG STALE 行（旧 flagged 行现为 MATCH，符合 R17 §8 的预期；R14 22 处、R15 24 处） |
| 十二矩阵 fix-p0-04–15 | **100、76、134、86、164、98、314、248、486、196、114、260，全部 0 flagged** |
| R5 66-case 子集 | **66/66**（从电池重跑的 fix-p0-04 results.json 直接计数：R4 的 46 + R1–R10 + R5 残留 10 = 66 行 / 66 检查 / 66 MATCH；其余 17 行 34 检查亦全部 MATCH） |
| fix-p0-16 网格 | **238/238** |
| fix-p0-17 网格 | **216/216** |
| fix-p0-18 网格 | **77/79**（§4、§7） |

验收电池重跑改写过的 tracked 文件均已恢复：除 `evidence/probes/r17/results.json` 外全部逐字节重现（确定性）；`r17/results.json` 已用 `git checkout --` 恢复为评审员提交的 124/141 原值——评审证据不被修复后重跑覆盖，修复后 141/141 的证据在 fix-p0-18 网格与本报告中。

## §6 Trial freeze（两次，方法与结果）

方法：代码提交 `55bd04a` 的工作树上，`npm run release:freeze`（`python3 scripts/deterministic-zip.py --freeze`）连续运行两次，manifest 取自本人两次冻结的 stdout（未抄既往值）。

| 项目 | 两次冻结（完全一致） |
|---|---|
| manifest（RELEASE_MANIFEST.json） | `288d615666d27c340a8766568359526c39c9e802a3486da3043a5cb3005f778e` |
| source.zip | `1b527601616d2b63e0abf6e8b700449b241b5a48a338cd934c8fb157822f6deb`（2,597 文件） |
| dist.zip | `f2bcd53f360ada37da25d3d650009b4c10274594a8faf4ed1c4d7591680e8f7f`（114 文件，**与 R2 相同，未变**） |

冻结后已 `git checkout release/`，R2 正式件（`01_release_R2`）恢复原状；工作树除本报告目录外干净。R18 评审须在代码提交 `55bd04a` 上冻结并复现 manifest `288d6156…`（注意：本报告提交后文件数 +1，R18 的冻结应在代码提交上做，不含报告文件）。

## §7 诚实披露：新发现的分歧（1 个形状，2 检查）

**不得写“无新分歧”——本轮探针空间未全过。** 唯一 DIFF 形状：

- `c-flow-key-null-2nd`：`m: {a: 1, *w:2}`（先定义标量键 `a` 再以别名作键的流映射）。
  - trigger 检查：TS **VALID** / `[]` vs Oracle **INVALID** / `yaml_parse_error`（字段差异：`errors`、`evaluation.reason`（triggered vs invalid）、`events`、`on_key_is_string`、`status`）。
  - jobs 检查：TS 返回 job 列表 `[{id: check, …}]` vs Oracle 返回空列表 `[]`（同源分歧的 jobs 侧表现）。

根因（已隔离，非本轮位置规则）：FIX-P0-02 的重复键检查（`_StrictBaseLoader.construct_mapping`）。PyYAML 在 compose 阶段把别名解析为所锚定的标量，于是组合后的树出现两个 `ScalarNode('a')` 键，Oracle 拒收“duplicate mapping key: 'a'”；而 TS 的 `yaml` 包 `uniqueKeys` 检查不把“标量键在前、别名键在后”的流映射重复判为重复。

预先存在证据（`git stash` 回到基线 `50788a7` 亲自验证）：

- 同一 DIFF 在基线已存在，不是 FIX-P0-18 的回归；
- 普通无吸入别名同样 DIFF：`m: {a: 1, *w}`；
- 块映射 `a: 1` 后接 `*w:` 键：双边 INVALID（MATCH）；别名在前、别名两次的流形：双边 INVALID（MATCH）；纯标量重复键：双边 INVALID（MATCH）。
- 窄化结论：仅限**流式、标量键在前、别名键在后**这一组合。

为什么不顺手修：这是另一条机制（重复键检查的 compose 期别名解析），与本轮位置规则无关；修复它需要先对 TS 侧 `uniqueKeys` 与别名的行为做独立探针，再动重复键检查的 token 层实现，风险高，不宜折进本轮。建议另轮定点处理；R18 评审时应将其列为已知残留（非 P0 家族，属 P2 级待办），不应因此判本轮家族未关闭。

除上述 1 形状外，本轮探针空间（R10–R17 探针、十二矩阵、R5 子集、fix-p0-16/17/18 网格、全部 oracle:diff 与门禁）无其他新分歧。

## §8 P2 状态（8 项，与 R17 相同）

R2 的 6 项 + P2-R6-1（manifest `inputs` 仅记录到 R3，现延伸到 R18——T014 正式重冻时须补记 R4–R18）+ P2-R6-2（评审探针证据仅在 /tmp + 报告中；已部分缓解——R9–R18 探针均已入仓库）。新增的 §7 残留建议记为 P2 级待办，不计入 P0。

## 附录：提交与文件

- 代码提交：`55bd04a2f46d083dfe1feb647091edb901b1b210`（5 文件，+1464/−3；`oracle/checkpath_oracle/parser.py` +36/−3；探针证据 `evidence/probes/fix-p0-18/` 4 文件）
- 本报告提交：`handoff/P020-FIX-P0-18/TASK_REPORT.md` + `handoff/P020-FIX-P0-18/acceptance-log.txt`（单独提交，见提交信息）
- 评审员 R17 证据未动：`evidence/review/INDEPENDENT_REVIEW_R17.md` + `evidence/probes/r17/`（results.json 保持 124/141 原值）
- 下一步（父 agent）：派 T013 R18（全新会话、干净克隆、代码提交 `55bd04a`；重跑 R17 的 9 形 + §4 边界 + 十二矩阵 + R5 66 + R17 76 形矩阵 + manifest `288d6156…` 复现）。R18 通过 → T014 R3 正式重冻（manifest `inputs` 补记 R4–R18，清 stale `known_divergence` 标志）→ Drive 新建 **01_release_R3** 文件夹重归档（永不覆盖 R1/R2）→ 同一立项对话最终评审 R3。
