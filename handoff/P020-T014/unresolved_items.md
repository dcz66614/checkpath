# P020 T014 — Unresolved Items

1. **U-01 — Windows PowerShell Quick Start NOT_TESTED** (carried
   from T012). No Windows machine on this VM. The PowerShell
   commands are the same commands on single lines; README and
   `release/RELEASE_NOTES.md` both state NOT_TESTED honestly.
   Needs a Windows machine or Sam to run them.
2. **P2-R2-1 — static network-check coverage gap** (T013 R2, minor,
   non-blocking). 10 `src/core` files + `oracle/witness.py` remain
   outside both static network greps. No network call found in any
   of them; runtime proof (`test:offline`, strace 0 syscalls) and the
   `dist/` scan cover the built artifact. Fix direction: extend the
   expanded check to all of `src/` and the remaining Oracle modules
   (separate session; requires new T013/T014 if product code changes).
3. **P2-R2-2 — duplicate-key `dup-name` shape not fixture-locked**
   (T013 R2, minor, non-blocking). Probed live (TS INVALID,
   Oracle VALID last-wins) but only `dup-branches`/`dup-event` are
   locked by fixtures/tests. Fix direction: add `dup-name.yml` +
   `expected.json`, or note in the README that only two shapes are
   locked.
4. **P2-R2-3 — README performance figures are single-run snapshots**
   (T013 R2, minor, non-blocking). Printed P95 794.5 ms / 94.2 MiB
   vs independent re-runs 697.9 ms / 100.2 MiB and 701.2 ms /
   101.1 MiB; all far inside thresholds. Fix direction: state a
   range, or drop exact figures in favour of the thresholds.
5. **Duplicate-key YAML divergence (ADR FIX-P2/01)** — known
   limitation, deliberately maintained (TS rejects, Oracle
   last-wins). Documented in `RELEASE_NOTES.md` and in
   `tests/fixtures/parser-divergence/duplicate-key/README.md`.
6. **Freezer script not T013-reviewed.** `scripts/deterministic-zip.py`
   was created by T014 (it did not exist before) and is therefore
   outside the T013 review scope. Its outputs were verified
   independently (see `evidence/release/T014_FREEZE_REPORT.md` §4).
   The parent should confirm whether a re-review of this tooling —
   and of the F-T014-01 `dist.zip` vendoring — is wanted before the
   release is treated as fully reviewed.
7. **F-T014-01 follow-ups (optional, not blocking).** (a) A future
   task could bundle the CLI into a single self-contained file
   (e.g. via the build step) instead of vendoring
   `node_modules/yaml` into `dist.zip`. (b) The release gate could
   gain a standalone-extracted `dist.zip` smoke run so this class of
   defect is caught by `release:verify` itself. Both would change
   reviewed build/gate code and therefore need a new fix + T013 +
   T014 cycle; neither was done here.
8. **Historical absolute paths inside `source.zip`.** The archive
   faithfully contains the reviewed tree, whose historical evidence
   and log files record absolute workspace paths as text. Not
   altered by T014 (altering them would break the reviewed commit);
   disclosed in `RELEASE_NOTES.md` §7.
