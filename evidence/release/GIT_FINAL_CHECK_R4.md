# P020 CheckPath — Git Final Check (R3-FINAL-04 / T014 R4 re-freeze)
- **Date:** 2026-11-10
- **Purpose:** close the final-review R4 blocker (3) — the Git chain.
  Every command below was run in this repository and its output is quoted
  verbatim; nothing is transcribed by hand. Exit codes are recorded where
  they matter.
- **Scope note (correction to the task brief's expectation):** the brief
  expected `git diff 9dac3e1..3a83371` to show "only the freezer script +
  manifest inputs". That is NOT what the range contains, and this report
  records the truth instead: the range holds FOUR commits (see §2) — the
  FIX-P0-19 report, the R19 evidence (34 files), the R14/R15 stale-flag
  clearing (10 files), and only then the freezer-script patch. The
  freezer-script-only portion is the single commit `3a83371` itself.
  No finding below depends on the brief's expectation; the chain is
  verified as it actually is.

## §1 rev-parse — the six anchor commits

```
$ git rev-parse 9dac3e1 3a83371 4c67520 d8ffdeb 03c2f16 538c669
9dac3e13d2a01a2050b1923b1279323d1a0b649c
3a8337151461b80e4ae50e75ab2edf417f4f9165
4c67520c701527517533dfc7447a7d7925dae7be
d8ffdebb775e5b3241936ec86c11689c51f29bf1
03c2f168a40b114ff1a0f408fa783f5d5389e15d
538c669e11a383aa0554d05239e298cf34aadd4d
```
FIX-P0-19 code commit:
```
$ git log --format='%h %ad %s' --date=iso -1 9dac3e1
9dac3e1 2026-11-09 23:27:41 +0000 FIX-P0-19: reject flow-mapping alias keys resolving to duplicate scalars (R18 P0 family; R18 probe 50/50, adjudication 22/22 + 10/10)
```
R3 source commit:
```
$ git log --format='%h %ad %s' --date=iso -1 3a83371
3a83371 2026-11-10 00:24:14 +0000 T014: freezer records T013 reviews R4-R19 in manifest inputs (P2-R6-1)
```
R3 freeze commit:
```
$ git log --format='%h %ad %s' --date=iso -1 d8ffdeb
d8ffdeb 2026-11-10 00:35:10 +0000 T014: Formal re-freeze (R3) — source.zip 9a54081ec8d322f0f7d78c6c08a2dc8cf9370396a026a7a2d6fd0e85b4dc83cd dist.zip b8e2aa77074cd2f62a518c1c7969cfdaa7cff202c6d87239080c3dfe2c6d335c
```
R3 §9 addendum commit:
```
$ git log --format='%h %ad %s' --date=iso -1 4c67520
4c67520 2026-11-10 00:35:26 +0000 T014 R3: record freeze commit d8ffdeb in freeze report §9 addendum
```
R2 freeze commit:
```
$ git log --format='%h %ad %s' --date=iso -1 03c2f16
03c2f16 2026-11-08 19:49:39 +0000 T014: Formal re-freeze (R2) — source.zip 3a778b933f827b5d1fbf1d617f40de465ec9bd00590a9bc1003cac2f2409743f dist.zip da130ad2747a810c0f62488245fe7902298199faa6e8372f3975d58b573911e6
```
R2 source commit:
```
$ git log --format='%h %ad %s' --date=iso -1 538c669
538c669 2026-11-08 19:33:44 +0000 FIX-P2-R3-2: record T013 R3 review in the re-freeze manifest
```

## §2 git log 9dac3e1..3a83371 — four commits, not one

```
$ git log --oneline 9dac3e1..3a83371
3a83371 T014: freezer records T013 reviews R4-R19 in manifest inputs (P2-R6-1)
a4106d8 T014: clear R14/R15 stale-flag probe rows (residuals closed; R14 78/78, R15 122/122, both exit 0)
9fd0233 T013: record R19 independent review evidence (R19 PASS, 0/0/8; R18 family closed, manifest 89ff8504 trial)
3991856 FIX-P0-19 report: R18 P0 family closed (R18 probe 50/50, adjudication 22/22 + 10/10); trial manifest 89ff8504; no new divergence in probed space
```
Reading: `3991856` is the FIX-P0-19 report (text only);
`9fd0233` records the R19 independent review evidence (34 files, incl.
`evidence/probes/r19/reruns/`); `a4106d8` clears the R14/R15 stale-flag
probe rows (10 files); `3a83371` is the freezer-script patch (+58 lines:
`meta_paths` gains R4–R19, `T013_REVIEW_VERDICTS`, `P2-R6-1: FIXED`).
Only `3a83371` touches the freezer; the range as a whole is evidence +
probe-expectation work, and contains zero `src/` / `oracle/` changes —
verified in §3.

## §3 git diff 9dac3e1..3a83371 — stat and scope

```
$ git diff --stat 9dac3e1..3a83371
 evidence/probes/r14/README.md                      |   18 +-
 evidence/probes/r14/cases.json                     |   44 +-
 evidence/probes/r14/gen-cases.py                   |   37 +-
 evidence/probes/r14/r14-probe.py                   |    5 +
 evidence/probes/r14/results.json                   |   44 +-
 evidence/probes/r15/README.md                      |    9 +
 evidence/probes/r15/cases.json                     |   89 +-
 evidence/probes/r15/gen-cases.py                   |   55 +-
 evidence/probes/r15/r15-probe.py                   |    6 +
 evidence/probes/r15/results.json                   |   48 +-
 evidence/probes/r19/README.md                      |   33 +
 evidence/probes/r19/cases.json                     |  152 +
 evidence/probes/r19/gen-cases.py                   |  120 +
 evidence/probes/r19/parser-probe-p19-r19.txt       |   33 +
 evidence/probes/r19/parser-probe-p19b-r19.txt      |   81 +
 .../probes/r19/reruns/fix-p0-04-results-r19.json   | 1166 ++++++
 .../probes/r19/reruns/fix-p0-05-results-r19.json   |  686 +++
 .../probes/r19/reruns/fix-p0-06-results-r19.json   | 1208 ++++++
 .../probes/r19/reruns/fix-p0-07-results-r19.json   |  776 ++++
 .../probes/r19/reruns/fix-p0-08-results-r19.json   | 1478 +++++++
 .../probes/r19/reruns/fix-p0-09-results-r19.json   |  884 ++++
 .../probes/r19/reruns/fix-p0-10-results-r19.json   | 2828 +++++++++++++
 .../probes/r19/reruns/fix-p0-11-results-r19.json   | 2234 ++++++++++
 .../probes/r19/reruns/fix-p0-12-results-r19.json   | 4376 ++++++++++++++++++++
 .../probes/r19/reruns/fix-p0-13-results-r19.json   | 1766 ++++++++
 .../probes/r19/reruns/fix-p0-14-results-r19.json   | 1028 +++++
 .../probes/r19/reruns/fix-p0-15-results-r19.json   | 2342 +++++++++++
 evidence/probes/r19/reruns/fix-p0-16-grid-r19.json | 2031 +++++++++
 evidence/probes/r19/reruns/fix-p0-17-grid-r19.json | 2687 ++++++++++++
 evidence/probes/r19/reruns/fix-p0-18-grid-r19.json |  996 +++++
 evidence/probes/r19/reruns/fix-p0-19-grid-r19.json |  889 ++++
 evidence/probes/r19/reruns/r10-results-r19.json    |  995 +++++
 evidence/probes/r19/reruns/r11-results-r19.json    |  827 ++++
 evidence/probes/r19/reruns/r12-results-r19.json    | 1331 ++++++
 evidence/probes/r19/reruns/r13-results-r19.json    | 1119 +++++
 evidence/probes/r19/reruns/r14-results-r19.json    | 1005 +++++
 evidence/probes/r19/reruns/r15-results-r19.json    | 1505 +++++++
 evidence/probes/r19/reruns/r16-results-r19.json    | 4313 +++++++++++++++++++
 evidence/probes/r19/reruns/r17-results-r19.json    | 1738 ++++++++
 .../probes/r19/reruns/r18-adjudication-r19.json    |  285 ++
 .../probes/r19/reruns/r18-adjudication2-r19.json   |  133 +
 evidence/probes/r19/reruns/r18-hunt-r19.json       |  641 +++
 evidence/probes/r19/results.json                   |  747 ++++
 evidence/review/INDEPENDENT_REVIEW_R19.md          |  223 +
 handoff/P020-FIX-P0-19/TASK_REPORT.md              |  141 +
 scripts/deterministic-zip.py                       |   58 +
 46 files changed, 43042 insertions(+), 168 deletions(-)
```
```
$ git diff --quiet 9dac3e1..3a83371 -- src/ oracle/; echo exit=$?
exit=0 (0 = no difference: no src/ or oracle/ change in this range)
```
Freezer-script-only portion of the range:
```
$ git diff --stat 9dac3e1..3a83371 -- scripts/deterministic-zip.py
 scripts/deterministic-zip.py | 58 ++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 58 insertions(+)
```

## §4 git log / git diff 3a83371..4c67520 — the R3 freeze itself

```
$ git log --oneline 3a83371..4c67520
4c67520 T014 R3: record freeze commit d8ffdeb in freeze report §9 addendum
d8ffdeb T014: Formal re-freeze (R3) — source.zip 9a54081ec8d322f0f7d78c6c08a2dc8cf9370396a026a7a2d6fd0e85b4dc83cd dist.zip b8e2aa77074cd2f62a518c1c7969cfdaa7cff202c6d87239080c3dfe2c6d335c
```
```
$ git diff --stat 3a83371..4c67520
 evidence/release/T014_FREEZE_REPORT_R3.md | 219 ++++++++++++++++++++++++++++++
 evidence/tests/RELEASE_VERIFY_REPORT.json |   4 +-
 release/RELEASE_MANIFEST.json             | 156 +++++++++++++++++++--
 release/SHA256SUMS.txt                    |   6 +-
 release/dist.zip                          | Bin 253043 -> 269248 bytes
 release/source.zip                        | Bin 9244259 -> 13877998 bytes
 6 files changed, 369 insertions(+), 16 deletions(-)
```
Files (exactly 6, freeze artifacts + report + verify report):
```
$ git diff --name-only 3a83371..4c67520
evidence/release/T014_FREEZE_REPORT_R3.md
evidence/tests/RELEASE_VERIFY_REPORT.json
release/RELEASE_MANIFEST.json
release/SHA256SUMS.txt
release/dist.zip
release/source.zip
```
```
$ git diff --quiet 3a83371..4c67520 -- src/ oracle/ tests/; echo exit=$?
exit=0 (0 = no difference: the freeze changed no code, oracle or tests)
```

## §5 Parent / ancestry checks — freeze commits sit directly on their source commits

```
$ git rev-parse d8ffdeb^
3a8337151461b80e4ae50e75ab2edf417f4f9165
```
(expected: `3a8337151461b80e4ae50e75ab2edf417f4f9165` — the R3 source commit)
```
$ git merge-base --is-ancestor 3a83371 d8ffdeb; echo exit=$?
exit=0 (0 = yes, 3a83371 is an ancestor of d8ffdeb)
```
```
$ git log 3a83371..d8ffdeb
d8ffdeb T014: Formal re-freeze (R3) — source.zip 9a54081ec8d322f0f7d78c6c08a2dc8cf9370396a026a7a2d6fd0e85b4dc83cd dist.zip b8e2aa77074cd2f62a518c1c7969cfdaa7cff202c6d87239080c3dfe2c6d335c
```
(1 commit — the freeze commit itself)
```
$ git rev-parse 03c2f16^
538c669e11a383aa0554d05239e298cf34aadd4d
```
(expected: `538c669e11a383aa0554d05239e298cf34aadd4d` — the R2 source commit)
```
$ git merge-base --is-ancestor 538c669 03c2f16; echo exit=$?
exit=0 (0 = yes)
```
```
$ git log 538c669..03c2f16
03c2f16 T014: Formal re-freeze (R2) — source.zip 3a778b933f827b5d1fbf1d617f40de465ec9bd00590a9bc1003cac2f2409743f dist.zip da130ad2747a810c0f62488245fe7902298199faa6e8372f3975d58b573911e6
```
(1 commit — the R2 freeze commit itself)

## §6 git diff 4c67520..HEAD — this rework's own changes (R3-FINAL-01…04)

```
$ git log --oneline 4c67520..HEAD
4f212f7 R3-FINAL-04: freezer closes freeze_history (R2->03c2f16, R3->d8ffdeb); P2-R3-1 RESOLVED, P2-R6-2 + R4 P2-6 disclosed
a3a1212 R3-FINAL-03: index to R19, R19 coverage matrix, review pack 03, R19 sums
a24e1b2 R3-FINAL-02: add standalone R3 Release Notes; rewrite notes as R4 pre-freeze edition
810a7ef R3-FINAL-01: close T014 R3 freeze-report header (PENDING -> d8ffdeb, matches §9)
```
```
$ git diff --stat 4c67520..HEAD
 REVIEW_INDEX.md                           |  66 +++++++
 evidence/release/T014_FREEZE_REPORT_R3.md |  20 ++-
 evidence/review/COVERAGE_MATRIX_R19.csv   | 100 +++++++++++
 evidence/review/REVIEW_PACK_03.md         | 212 +++++++++++++++++++++++
 evidence/review/REVIEW_SHA256SUMS_R19.txt |   4 +
 release/RELEASE_NOTES.md                  | 275 ++++++++++++++++++------------
 release/RELEASE_NOTES_R3.md               | 208 ++++++++++++++++++++++
 scripts/deterministic-zip.py              |  28 ++-
 8 files changed, 797 insertions(+), 116 deletions(-)
```
```
$ git diff --quiet 4c67520..HEAD -- src/ oracle/ tests/; echo exit=$?
exit=0 (0 = no difference: zero business-code / oracle / test changes in this rework)
```
Files changed by this rework (documentation / matrix / freezer inputs only):
```
$ git diff --name-only 4c67520..HEAD
REVIEW_INDEX.md
evidence/release/T014_FREEZE_REPORT_R3.md
evidence/review/COVERAGE_MATRIX_R19.csv
evidence/review/REVIEW_PACK_03.md
evidence/review/REVIEW_SHA256SUMS_R19.txt
release/RELEASE_NOTES.md
release/RELEASE_NOTES_R3.md
scripts/deterministic-zip.py
```

## §7 Manifest closure — what the R4 freeze records

The R4 freezer (`scripts/deterministic-zip.py`, R3-FINAL-04 patch)
carries a `KNOWN_FREEZE_COMMITS` table and rewrites only still-PENDING
`freeze_history` entries. Applied to the R3 manifest's history, the R4
manifest's `freeze_history` is expected to read (verified after the
formal freeze in `evidence/release/T014_FREEZE_REPORT_R4.md` §1):

| Run | source_commit | freeze_commit | status |
|---|---|---|---|
| R1 formal | `933dd354…` | `3e5e14556f37…` | FORMAL |
| FIX-P1-02 trial | `36476cf19264…` | TRIAL (text) | TRIAL |
| R2 formal | `538c669e11a3…` | `03c2f168a40b…` (closed by R3-FINAL-04) | FORMAL |
| R3 formal | `3a8337151461…` | `d8ffdebb775e…` (closed by R3-FINAL-04) | FORMAL |

The R4 run's own top-level `freeze_commit` remains the PENDING text by
design (a freeze cannot know its own future commit); its real hash is
recorded in `T014_FREEZE_REPORT_R4.md` §9 after committing, exactly as
R2 (`03c2f16`) and R3 (`d8ffdeb`) were.

## §8 What this check did NOT do

- No probe hunting was re-run (out of scope for R3-FINAL; the
  R19 evidence — 4,102 checks, 0 DIFF — stands as the probe record).
- No `src/` / `oracle/` / `tests/` file was modified (see §6, exit 0).
- No message was sent to ChatGPT, no GitHub push, no external message.
