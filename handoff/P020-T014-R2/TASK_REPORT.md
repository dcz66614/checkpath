# P020 T014 Formal Re-freeze (R2) — TASK_REPORT

- **Task:** T014 formal re-freeze after final-review R1 FAIL
- **Source commit:** `538c669` (`538c669e11a383aa0554d05239e298cf34aadd4d`)
- **Freeze commit:** PENDING — see `evidence/release/T014_FREEZE_REPORT_R2.md` §9
  (filled in after committing, same pattern as R1)
- **Date:** 2026-11-08
- **Result:** **PASS** — every acceptance command exit 0; all three
  hashes reproduced byte-for-byte in a fresh clone and in an in-repo
  re-run.

## What was frozen

| Artifact | SHA-256 | Files |
|---|---|---|
| `release/source.zip` | `3a778b933f827b5d1fbf1d617f40de465ec9bd00590a9bc1003cac2f2409743f` | 1,209 (exact HEAD tree at `538c669`) |
| `release/dist.zip` | `da130ad2747a810c0f62488245fe7902298199faa6e8372f3975d58b573911e6` | 114 — byte-identical to R1 |
| `release/RELEASE_MANIFEST.json` | `04a07733755c36ba5a614514859ef8698eb2c1b7d92d4c4ebd75d335cfb0a2fb` | — |
| `release/SHA256SUMS.txt` | `sha256sum -c` 3/3 OK | 3 entries |

## What happened before the freeze (separate commits, not this task's freeze)

1. **R3 review evidence (commit `f8df2fe`).** R3 report (PASS,
   P0 0 / P1 0 / P2 3) + handoff summary + 4 regenerated evidence
   JSONs committed. The JSONs were committed deliberately (not
   restored as in R1 §6): the frozen tree has 83 golden / 44
   trigger fixtures, so the manifest must read those counts from
   HEAD to be truthful.
2. **P2-R3-2 (commit `538c669`).** Freezer patched so the manifest
   records `t013_review_r3` alongside `t013_review_r2` (both hashed
   from HEAD) and `known_limitations` carries the three R3 P2s.
   20 insertions, 0 deletions; script hash `7598e960…` →
   `5c3142ec…`, re-recorded by the manifest.

## Verification (all personally run, exit 0 unless noted)

- `npm run typecheck`, `npm run lint` — clean.
- `npm test` — 32 files, **855/855**.
- `npm run test:oracle` — Golden 83/83, 0 mismatches, false PASS 0,
  TS formal-pipeline false PASS 0, UNKNOWN 19/19.
- `npm run s0:oracle` — S0 24/24, 0 mismatches, false PASS 0,
  TS formal false PASS 0, UNKNOWN 2/2.
- `npm run s0:gate` — PASS, 100 runs, 1 hash,
  `gate_report_sha256 f511a847…` unchanged.
- `npm run release:verify` — PASS.
- `deterministic-zip --verify` both ZIPs — OK (source 1,520
  entries, dist 139 entries incl. dirs).
- `source.zip` vs `git archive 538c669` — `diff -r` zero differences.
- Freezer script three-way hash: in-zip = repo file = manifest
  `freezer.sha256` = `5c3142ec…`.
- Clean-dir `dist.zip` demo — exit 2, `report_sha256 9dc3af31…`;
  `analyze` pr-docs-only exit 2, same hash.
- **Fresh clone** at `538c669` + `npm ci` (181 packages) + formal
  freeze — all three hashes byte-identical.
- **Clean-dir without `.git`** — script IS present (R1 exit-2 gone);
  freeze fails at `git rev-parse HEAD` by design (P2-R3-3);
  fresh-clone substitute verified (see above). Log:
  `test_logs/clean-dir-nogit-freeze.log` (exit 1, expected).

## Disclosed

- `source.zip` contains the R1-era `RELEASE_NOTES.md`
  (one-generation lag; a notes file cannot contain the hash of the
  zip that contains it). The R2 notes are recorded at the freeze
  commit and in Drive `01_release_R2`; the manifest is the
  authoritative hash record. Same as R1 (where the zip contained
  no notes at all).
- The `release/source.zip` entry inside the frozen `source.zip` is
  the trial-era artifact from HEAD — expected (the zip archives
  the HEAD tree as it is).
- `dist.zip` byte-identical to R1: no product-code change since R1.

## Files in this handoff

- `TASK_REPORT.md` (this file), `changed_files.txt`,
  `test_commands.txt`, `test_logs/` (13 logs), `sha256.txt`,
  `unresolved_items.md`
- Freeze report: `evidence/release/T014_FREEZE_REPORT_R2.md`
- Release notes (R2): `release/RELEASE_NOTES.md`
