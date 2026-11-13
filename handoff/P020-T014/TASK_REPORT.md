# P020 T014 — Task Report (Release Freeze)

- **Task:** T014 — 发布冻结与 SHA-256 清单 (S5)
- **Base commit:** `933dd35`
  (`933dd354e109436551ba40b96d5b4a2d83b839a6`, "T013 re-review —
  PASS, P0 0 / P1 0 / P2 3")
- **Date:** 2026-11-08
- **Result:** **PASS** — all acceptance commands exit 0; both ZIPs
  verified; `dist.zip` standalone demo verified (T012 U-02 CLOSED).
- **Zero humans. No network, no GitHub API, no token. Synthetic
  data only.**
- **License:** `PENDING_SAM_DECISION` (no LICENSE file created).

## 1. Result

| Artifact | SHA-256 | Files |
|---|---|---|
| `release/source.zip` | `5e84c787c73cb1430d022537f3ae9982c574921de93bf60a2cb06684881aefb8` | 1,144 (exact HEAD tree) |
| `release/dist.zip` | `da130ad2747a810c0f62488245fe7902298199faa6e8372f3975d58b573911e6` | 114 (29 built + 76 vendored yaml + 6 examples + 2 docs + QUICKSTART.md) |
| `release/RELEASE_MANIFEST.json` | `6c25a3812df4da9d4d63f269751d2a451621f7368e34fb94603a492a2a61a0ba` | — |
| `release/SHA256SUMS.txt` | `sha256sum -c` all OK | 3 entries |

Full evidence: `evidence/release/T014_FREEZE_REPORT.md`;
release notes with all known limitations:
`release/RELEASE_NOTES.md`.

## 2. Acceptance commands (all exit 0; logs in `test_logs/`)

| Command | Exit | Result |
|---|---|---|
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | clean |
| `npm test` | 0 | 32 files, **842/842** |
| `npm run test:oracle` | 0 | Golden 80/80, 0 mismatches, false PASS 0, TS formal false PASS 0, UNKNOWN 19/19 |
| `npm run s0:oracle` | 0 | S0 24/24, 0 mismatches, false PASS 0, TS formal false PASS 0, UNKNOWN 2/2 |
| `npm run s0:gate` | 0 | PASS, 100 runs, 1 hash, `gate_report_sha256 f511a847…` unchanged, independently recomputed |
| `npm run release:freeze` | 0 | source.zip `5e84c787…`, dist.zip `da130ad2…`, manifest `6c25a381…` |
| `npm run release:verify` | 0 | PASS; dist tree `14cd8492…` (29 files, identical across builds, same as T013 R2); smoke incl. U-07/U-08/T8-05; report hash recompute OK; offline scan 34 files, 0 remote refs; license guard PASS |
| `python3 scripts/deterministic-zip.py --verify release/source.zip` | 0 | verify OK |
| `python3 scripts/deterministic-zip.py --verify release/dist.zip` | 0 | verify OK |

Independent checks (see freeze report §4): source.zip listing
identical to HEAD tree (1,144 files) and contents byte-identical
to `git archive HEAD`; dist.zip extracted standalone — demo exit 2
(`report_sha256 9dc3af31…`, identical to in-repo demo/analyze),
analyze pr-docs-only exit 2, matrix exit 2, analyze pr-src-only
exit 0; no `/home/` or `/root/` strings in the extracted bundle;
re-freeze byte-identical (all 3 hashes unchanged).

## 3. Deliverables

- `release/source.zip`, `release/dist.zip`,
  `release/SHA256SUMS.txt`, `release/RELEASE_MANIFEST.json`,
  `release/RELEASE_NOTES.md`
- `evidence/release/T014_FREEZE_REPORT.md`
- `scripts/deterministic-zip.py` (new release tooling — see §4)
- This handoff package: `handoff/P020-T014/`

## 4. Notes — read before accepting

1. **The freezer script did not exist before T014.**
   `package.json` referenced `scripts/deterministic-zip.py`, but
   the file was absent (T012 only rehearsed packaging). Per plan
   §7, the owning task must actually implement it — T014 is that
   task. The script (SHA-256 `33b026f3…`, recorded in the manifest)
   is release tooling, not product code; it never modifies `src/`,
   `oracle/`, tests, fixtures or evidence, and reads all frozen
   inputs from HEAD. It was **not** covered by the T013 review; its
   outputs were verified independently (source listing/content vs
   HEAD, standalone demo/analyze/matrix, hash recomputation,
   byte-identical re-freeze).
2. **F-T014-01 — first frozen `dist.zip` could not run standalone**
   (`ERR_MODULE_NOT_FOUND: Cannot find package 'yaml'`). The built
   CLI imports `yaml` (the only bare package import in `dist/`);
   the bundle shipped no `node_modules`. Packaging-only fix: the
   exact locked `yaml` 2.9.1 is vendored into `dist.zip`
   (`package.json`, `LICENSE`, `dist/**/*.js`, 76 files). No product
   code, fixture, doc or `source.zip` byte changed (source.zip hash
   is identical before/after the fix). Full detail in the freeze
   report §3.5 and `RELEASE_NOTES.md`.
3. **Task-start tree was not clean** (contrary to the task card):
   `evidence/s0/S0_ORACLE_REPORT.json` and
   `evidence/tests/RELEASE_VERIFY_REPORT.json` were already modified
   by a test run after the T013 commit. This task's runs also
   rewrote `evidence/tests/ORACLE_PARITY_REPORT.json`. All three
   generated files were restored with `git checkout -- evidence/`
   before the commit and are **not** included in it. Untracked
   `reports/` left untouched, excluded from the commit and the ZIPs.
4. **Known limitations** (P2-R2-1/2/3, duplicate-key ADR FIX-P2/01,
   Windows PowerShell NOT_TESTED, historical absolute paths inside
   `source.zip`) are recorded in `release/RELEASE_NOTES.md` and
   `unresolved_items.md`. Nothing was hidden or smoothed.
5. Specs unchanged: PROJECT_BOOK `028c2472…`,
   IMPLEMENTATION_PLAN `bb645205…`. No LICENSE name appears in any
   new file; `LICENSE_STATUS.md` still `PENDING_SAM_DECISION`.

## 5. Unresolved items

See `unresolved_items.md`: U-01 (Windows NOT_TESTED), P2-R2-1/2/3
(carried forward, non-blocking), the freezer-script re-review
question, and the optional F-T014-01 follow-ups.
