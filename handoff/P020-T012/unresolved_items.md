# P020 T012 — Unresolved items

## U-01 — Windows PowerShell Quick Start: NOT_TESTED

- What: the PowerShell Quick Start in README.md (same Node.js commands as the
  verified bash version, one per line) has not been executed on Windows.
- Why: this task runs on a Linux VM; no Windows machine is available.
- Impact: README marks it NOT_TESTED honestly; the commands are
  platform-neutral Node.js invocations, but that is not a substitute for a
  Windows run.
- Next: run the README PowerShell block on a Windows machine (or a Windows
  runner) and update README + T012 report; no code change expected.

## U-02 — Release-package entry point (`node checkpath.mjs demo` inside dist.zip) not verified end-to-end

- What: README documents running the demo from an unpacked `dist.zip`;
  the zip itself is only frozen in T014, so the exact unpacked path could
  not be exercised in T012.
- Why: T014 owns `dist.zip` freezing; T012 rehearsed the identical entry
  point from `dist/` via `npm run release:verify` (exit 0).
- Next: after T014 freezes `dist.zip`, unpack it in a clean directory and
  run `node checkpath.mjs demo` (expect exit 2, report_sha256 9dc3af31…).

## U-03 — README `npm ci` step not re-run in this task

- What: `npm ci` (first Quick Start line) was not executed during T012.
- Why: it requires npm registry network access, which the task rules forbid
  for test runs (only the already-installed Playwright browsers were used).
  `node_modules/` and `package-lock.json` were not modified by T012, and
  `npm run build` / all test commands ran successfully against the existing
  install.
- Next: none required for T012; a fresh-clone `npm ci` check can be done by
  T013/T014 on a networked machine.

## Closed in this task (no carry-over)

- T011 had no open unresolved items to carry over.
- No new semantic/unknown items were found: the three issues met during the
  work (perf-generator filter combination, offline-scan rule overreach,
  vitest/Playwright spec collision) were all test/scaffolding-side and fixed
  inside T012 — see T012_REPORT.md §6.
