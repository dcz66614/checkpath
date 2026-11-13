# CheckPath (P020)

**CheckPath — Know whether your required GitHub Actions checks will report before you merge.**
Simulate PR, push and merge-group trigger paths locally. No Docker. No GitHub token. No network at runtime.

CheckPath is a deterministic CI gate-coverage simulator, not a GitHub
Actions Runner: it never executes a job, never calls the GitHub API,
and never changes your workflows. Given local workflow files, a
synthetic event scenario and a required-checks list, it answers: will
each required check be reported, skipped-but-successful, stuck
Pending because its workflow never triggered, ambiguous, or
undecidable (UNKNOWN)? Every failing case comes with a minimal,
reproducible witness and a concrete fix direction.

**Status: T012 PASS (2026-11-08).** CLI (`demo` / `analyze` /
`matrix`), offline HTML reports, golden/property/Oracle regression
(842 unit tests, 80 golden cases, 1,000 property cases, 0 Oracle
mismatch), Playwright E2E (8/8), offline proof (0 network syscalls)
and performance (P95 768.3 ms, peak RSS 98.3 MiB at 20 workflows /
200 jobs / 100 changed files / 50 required checks; re-measured
2026-11-08 by `npm run test:performance` — 1 warmup + 31 timed runs
of the full CLI `analyze`, wall time around the child process, peak
RSS as max `VmHWM` sampled every 2 ms; thresholds P95 ≤ 1000 ms,
RSS ≤ 256 MiB; P50 556.5 ms, max 965.5 ms, mean 582.3 ms, input
SHA-256 `82d175d794a47a20…`, see
`evidence/tests/PERFORMANCE_REPORT.md`) are all verified.
See `evidence/tests/T012_REPORT.md`.

![Demo report — PR that only touches docs, required checks Pending](evidence/screenshots/e2e-report-pr-docs-only.png)

*Screenshot: the built-in demo scenario (a PR that only changes
`README.md` and `docs/guide.md` against a workflow filtered to
`src/**`). Both required checks are `PENDING_NOT_REPORTED` — the
workflow never triggers, so GitHub would leave the PR waiting for a
status that never arrives. Real screenshot from the Playwright E2E
run; the report is a single self-contained HTML file.*

## Quick start

From source (Linux shell; verified on this VM — see
[Platform status](#platform-status)):

```sh
npm ci
npm run build
node dist/checkpath.mjs demo
```

Windows PowerShell (same commands — Node.js is cross-platform; use
one command per line, no line continuations):

```powershell
npm ci
npm run build
node dist/checkpath.mjs demo
```

From a release package (`dist.zip`, no install step — machine needs
Node.js 24.x only, no network, no token):

```sh
node checkpath.mjs demo
```

(The `dist.zip` bundle itself is frozen in T014; T012 rehearses the
identical entry point from `dist/` via `npm run release:verify`.)

The demo uses only built-in synthetic data and writes
`reports/demo/report.json` + `report.html`. Note: `demo` exits with
code **2** — that is the gate outcome for the demo scenario (its
required checks are `PENDING_NOT_REPORTED`), not a demo failure. See
[Exit codes](#exit-codes).

## Analyze your own repo

```sh
# One PR scenario against the repo in the current directory
node dist/checkpath.mjs analyze \
  --repo . \
  --scenario examples/scenarios/pr-docs-only.json \
  --required-checks examples/required-checks.yml \
  --out reports/pr-docs-only

# A whole suite (PR + merge-group) as a coverage matrix
node dist/checkpath.mjs matrix \
  --repo . \
  --suite examples/suites/merge-queue.json \
  --required-checks examples/required-checks.yml \
  --out reports/merge-queue
```

PowerShell equivalents are the same commands on single lines, e.g.:

```powershell
node dist/checkpath.mjs analyze --repo . --scenario examples/scenarios/pr-docs-only.json --required-checks examples/required-checks.yml --out reports/pr-docs-only
```

Inputs are plain local files: `.github/workflows/*.yml` /
`*.yaml` in `--repo`, a `checkpath.scenario/v1` JSON scenario, and a
`checkpath.required-checks/v1` YAML list. Changed files come from the
scenario — CheckPath never computes a server-side diff and never
reads anything else from your machine.

## Example: the merge_group gap

A workflow that only declares `pull_request` will report its checks
for PRs — but a Merge Queue run fires a separate `merge_group`
event. If no workflow declares `merge_group`, the queue SHA gets no
report and the merge waits forever:

```sh
node dist/checkpath.mjs analyze \
  --repo examples/repo-basic \
  --scenario examples/scenarios/merge-group.json \
  --required-checks examples/required-checks.yml \
  --out reports/merge-group
# → both required checks PENDING_NOT_REPORTED, exit 2,
#   witness: merge_group_missing (workflow declares no merge_group)
```

Fix direction from the witness: add an explicit `merge_group`
trigger (with the same jobs) to the required workflow, or point the
required check at a workflow that already handles `merge_group`.

## Exit codes

| Code | Meaning |
|-----:|---------|
| 0 | All required checks reportable (or skipped-success, unless `--strict-skipped`) |
| 2 | At least one check is `PENDING_NOT_REPORTED`, `AMBIGUOUS` or `UNKNOWN` (or skipped with `--strict-skipped`) |
| 3 | Invalid input / YAML / job DAG, or a usage error (no report is written) |

`--help` and `--version` exit 0. `REPORTABLE_PENDING` means the
check *will be reported* — it does **not** mean the job passed; the
real run result is still unknown.

## Supported semantics — and the UNKNOWN boundary

Supported (frozen; every item has positive, negative and boundary
fixtures): `pull_request` / branch `push` / `merge_group` events and
activity types; `branches` / `branches-ignore` and `paths` /
`paths-ignore` with ordered `!` patterns (branch AND path); commit
skip tokens (`[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]`,
`[actions skip]`, `skip-checks: true`); push >1,000 commits and diff
timeout always-run; the 3,000-file diff limit with confirmed /
unconfirmed first-3,000 metadata; `needs` DAGs (missing reference /
cycle → `INVALID`); the frozen `if` subset (`true`, `false`,
`always()`, `!`, `&&`, `||`, `==`, `!=`, parentheses,
`github.event_name` / `github.ref` / `github.base_ref` /
`github.head_ref` / `github.event.action`); required-check context
matching by job `name` (fallback `job_id`). Duplicate manifest
entries — the same context listed more than once, possibly with
different sources — are resolved one result row per entry, in
manifest order (e.g. `unit-tests` from `github-actions` reports
while the same context from an external App is `UNKNOWN`); two
PROVIDERS sharing one context (two jobs with the same name) →
`AMBIGUOUS` (`duplicate_context`).

Anything outside that subset is reported as `UNKNOWN`, never guessed
as PASS: unsupported expression functions/contexts (`contains()`,
`hashFiles()`, `needs.*.outputs`, `matrix.*`, `env.*`, `secrets.*`,
…), `strategy.matrix` expansion, reusable-workflow (`uses:`)
expansion, `pull_request_target` / `workflow_run` / tag push, external
GitHub App statuses, unsupported Glob forms, and unconfirmed
>3,000-file diffs. The report always names the unsupported feature.

## Reports

Each `analyze` writes `report.json` (`checkpath.report-file/v1`
envelope: report + recommendations + diff-boundary note + scenario)
and a single-file offline `report.html` (inline CSS/JS, zero remote
resources — open it straight from disk). `matrix` additionally
writes `matrix.json` + `matrix.html` (required check × scenario).
Every report carries `input_sha256`, `workflow_set_sha256`,
`required_checks_sha256` and `report_sha256`; the last one recomputes
from the report object (see `evidence/tests/T012_REPORT.md`).
Reports contain no absolute paths, no timestamps as hash input, no
tokens, and no `run:` script bodies.

## Verify it yourself

```sh
npm run typecheck
npm run lint
npm test                    # unit + integration (673 tests)
npm run test:oracle         # TypeScript vs Python Reference Oracle (80 golden cases)
npm run test:e2e            # Playwright: demo → analyze → matrix + report UI (8 tests)
npm run test:offline        # unshare -rn + strace + static scan: 0 network activity
npm run test:performance    # 20 workflows / 200 jobs / 100 files / 50 checks
npm run release:verify      # build determinism + smoke + hash recompute + offline scan
```

Note: this VM has no `python` alias, only `python3`; run Python
commands with `python3` (see
`evidence/environment/ENVIRONMENT_REPORT.md`). The Python Reference
Oracle needs `python3 -m pip install -r
oracle/requirements.lock.txt` (PyYAML 6.0.3 pinned; the system Python
ships 6.0.1 — behaviour verified identical, see
`evidence/environment/PYYAML_6_0_3_VENV_VERIFICATION.md`).

## Platform status

- **Linux (x86_64, Node.js 24.22.1, this VM): verified** — all
  commands above were run here for T012; see
  `evidence/tests/T012_REPORT.md` for the per-command exit codes.
- **Windows PowerShell: NOT_TESTED** — this task runs on a Linux VM
  with no Windows machine available, so the PowerShell Quick Start
  above is provided from the (platform-neutral) Node.js commands but
  has not been executed on Windows. It must not be read as verified.

## What CheckPath is not

Not a GitHub Actions Runner, not a YAML linter, not a merge gatekeeper
and not a GitHub App. It does not run `run:` / `uses:` steps, does not
wait for real jobs, does not read branch protection / rulesets, does
not modify workflows, and does not predict whether a job will
succeed — only whether its check will be reported.

## License

Pending Sam's decision — see `LICENSE_STATUS.md`.
