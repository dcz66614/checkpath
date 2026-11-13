# Unresolved items — T013 Re-review (Round 2, PASS)

## New (this review, minor, non-blocking)

- **P2-R2-1** — P2-5 residual: 10 `src/core` files (`canonical-json`, `event-evaluator`, `if-subset`, `recommendations`, `sha256`, `skip-annotation`, `types`, `validate`, `witness-reducer`, `workflow-ir`) and `oracle/checkpath_oracle/witness.py` are still outside both static network checks (`staticNetworkCheck` 11 files + `expandedStaticNetworkCheck`). No network call found in any of them by this reviewer's own grep; `test:offline` proves 0 network syscalls at runtime. Fix (separate session): extend the expanded check to the remaining `src/core` files and Oracle modules.
- **P2-R2-2** — Duplicate-key `dup-name` shape (top-level duplicate `name:`) verified live by this reviewer (TS INVALID / `yaml_parse_error`, Oracle VALID last-wins) but not locked by a fixture/test; only `dup-branches` and `dup-event` are fixture-locked. Fix (separate session): add `dup-name.yml` + expected entry, or note in the fixture README that only two shapes are locked.
- **P2-R2-3** — README perf figures are single-run snapshots: this session's `test:performance` measured P95 697.9 ms / 100.2 MiB vs printed 794.5 / 94.2 (timing variance; thresholds P95 ≤ 1000 ms / RSS ≤ 256 MiB still pass comfortably). Fix (separate session): state a range or measurement date, or cite thresholds instead of exact figures.

## Carried forward (unchanged from R1 / T012)

- **U-01** — Windows PowerShell Quick Start NOT_TESTED (no Windows machine on this VM).
- **U-02** — `dist.zip` `node checkpath.mjs demo` not end-to-end verified (for T014).
