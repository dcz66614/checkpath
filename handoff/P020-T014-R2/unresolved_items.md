# P020 T014-R2 — Unresolved Items

1. **U-01 — Windows PowerShell Quick Start NOT_TESTED** (carried
   from T012). No Windows machine on this VM. The PowerShell
   commands are the same commands on single lines; README and
   `release/RELEASE_NOTES.md` both state NOT_TESTED honestly.
   Needs a Windows machine or Sam to run them.
2. **P2-R3-1 — residual `True:` vs `true:` divergence** (T013 R3,
   minor, non-blocking). TS rejects a duplicate key spelled
   `True:` / `true:` as INVALID; Oracle reports UNKNOWN
   (fail-closed, no false-PASS risk). No such keys occur in real
   workflow YAML. Recorded in `RELEASE_NOTES.md` §5 and the
   manifest. No fix required.
3. **P2-R3-3 — clean-dir-without-`.git` `release:freeze` fails by
   design** (T013 R3, minor, non-blocking). A literal extraction
   of `source.zip` cannot run the freeze (`git rev-parse HEAD`,
   no commit to identify). The accepted substitute — fresh-clone
   re-run — was verified byte-identical for this freeze. Must be
   stated plainly in final-review R2. No code change.
4. **P2-R2-3 — README performance figures are single-run
   snapshots** (carried from T013 R2). Figures vary run to run;
   all far inside thresholds. Recorded in `RELEASE_NOTES.md` §3.
5. **F-T014-01 follow-up (optional, not blocking):** bundle the
   CLI into a single self-contained file instead of vendoring
   `node_modules/yaml`, and extend the release gate with a
   standalone-extracted `dist.zip` smoke run. Both would change
   reviewed build code and require a new T013/T014 cycle.
