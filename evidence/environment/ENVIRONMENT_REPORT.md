# P020 CheckPath — T001 Environment Report

- **Project:** P020 CheckPath
- **Task:** T001 — 环境发现与最小工程骨架
- **Date (UTC):** 2026-11-08
- **Workspace:** `/home/hatch/workspace/p020-checkpath`
- **Spec sources (read-only, verified):**
  - `~/workspace/P020_PROJECT_BOOK.md` — SHA-256 `028c24720e0780542217719f6e9b14c0fe22b31b79c662520441c2116262b8de`
  - `~/workspace/P020_IMPLEMENTATION_PLAN.md` — SHA-256 `bb645205174eca1d111687928c41505407392d0eefd1281455a776273aaa1e0e`
- **environment_fingerprint:** `e1cfe76c50cb7383d15f11d1e43e804207ec5ce1c8922da86d97b5499627378e`
  - Fingerprint = SHA-256 of the canonical string
    `platform / node / npm / python3 / git / workspace / python-alias`
    as printed by `npm run env:check` (see `logs/env-check.log`).
    It is recomputable by re-running `npm run env:check`.
- **This report's SHA-256:** recorded in the sidecar file
  `evidence/environment/ENVIRONMENT_REPORT.sha256`
  (the hash is kept in a sidecar so the report can state it without
  invalidating itself by embedding it).

## 1. Measured environment (all values actually measured on this VM)

| Item | Measured value | Target (spec) | Verdict |
|---|---|---|---|
| OS | Ubuntu 24.04.5 LTS (Noble Numbat) | — | recorded |
| Kernel | Linux 7.0.0-43-generic | — | recorded |
| Architecture | x86_64 (`linux x64`) | — | recorded |
| CPU | AMD EPYC 9D25 126-Core Processor, 4 vCPU (1 socket × 4 cores, 1 thread/core) | — | recorded |
| Memory | 7,934 MiB total; ~514 MiB available at measurement (7.2 GiB used, 1.0 GiB swap) | — | recorded; VM is under memory pressure, no action needed for T001 |
| Disk (`/home/hatch`) | 150G total, 13G used, 138G available (9%) | — | recorded |
| Disk (`/tmp`) | tmpfs 512M | — | recorded |
| Workspace absolute path | `/home/hatch/workspace/p020-checkpath` | — | recorded |
| Node.js | v24.22.1 | 24.x | PASS |
| npm | 10.9.4 | — | recorded |
| Python 3 | Python 3.12.3 (`python3`; GCC 13.3.0) | 3.12.x | PASS |
| `python` alias | **not found** (`python: command not found`, exit 127) | — | **VERSION_DEVIATION** (see §2) |
| pip | pip 24.0 (system, Python 3.12) | — | recorded |
| PyYAML (system) | 6.0.1, importable; `yaml.BaseLoader` keeps `on` as a string key (verified) | 6.x | usable (see §2) |
| git | git version 2.43.0 | — | recorded |
| Browser (system binary) | none installed (`chromium` / `firefox` / `google-chrome` not found in PATH) | — | recorded; see Playwright cache below |
| Playwright browser cache | `~/.cache/ms-playwright`: `chromium-1248`, `chromium-1254`, `chromium_headless_shell-1248`, `chromium_headless_shell-1254`, `ffmpeg-1013` | — | recorded; E2E is T012 work |
| npm registry | `https://registry.npmjs.org/` — reachable (HTTP 200) | public registry only | PASS |
| PyPI | `https://pypi.org/` — reachable (HTTP 200) | public registry only | PASS |
| GPU | none required, none used | no GPU precondition | PASS |
| Docker | none required, none used | no Docker precondition | PASS |
| GitHub Token | none read, none required, none stored | no Token precondition | PASS |
| Network calls at runtime | 0 by design (local CLI + offline report) | 0 | PASS by design |

## 2. VERSION_DEVIATION — deviations recorded honestly

### D1. `python` command alias missing
- **Fact:** the VM has `python3` (3.12.3) but no `python` binary. Running
  `python --version` fails with `command not found` (exit 127).
- **Impact:** every spec command written as `python ...` must be run as
  `python3 ...` on this VM. The `release:freeze` script in `package.json`
  therefore uses `python3 scripts/deterministic-zip.py --freeze` instead of
  the §7 literal `python ...`. All other §7 script names and commands are
  unchanged.
- **Status:** deviation only; Python 3.12.x itself is verified.

### D2. `pip install -r oracle/requirements.lock.txt` fails (PEP 668)
- **Fact:** `python3 -m pip install -r oracle/requirements.lock.txt` exits 1
  with `error: externally-managed-environment` (Ubuntu 24.04 system Python,
  PEP 668). Full log: `evidence/environment/logs/pip-install.log`.
- **Impact:** the pinned `PyYAML==6.0.3` was **not** installed by this
  command. The Oracle dependency is nevertheless **usable**: system PyYAML
  6.0.1 is already installed and importable, satisfies the 6.x requirement,
  and `yaml.BaseLoader` was verified to keep the `on` key as a string.
- **Not done:** `--break-system-packages` was deliberately **not** used
  (it would modify the system Python installation). T004 may use the system
  PyYAML 6.0.1 or a `python3 -m venv` virtual environment to install the
  pinned 6.0.3.
- **Status:** unresolved item for T004; no success was faked.

### D3. `@vitejs/plugin-react` 5.2.0, not 6.x
- **Fact:** `@vitejs/plugin-react@6.2.1` (latest) declares peer
  `vite@^8.0.0`, which conflicts with the spec-pinned Vite 7.x. T001 pins
  `@vitejs/plugin-react@5.2.0`, the latest 5.x line, which is compatible
  with Vite 7.3.7.
- **Status:** resolved within the spec (Vite 7.x is the frozen choice).

## 3. Locked dependency versions (from `package-lock.json`, lockfileVersion 3, 232 packages)

| Package | Locked version | Spec |
|---|---|---|
| typescript | 5.9.3 | 5.x |
| yaml | 2.9.1 | 2.x |
| react / react-dom | 19.3.1 | 19.x |
| vite | 7.3.7 | 7.x |
| vitest | 5.1.0 | lockfile-pinned |
| @playwright/test | 1.65.0 | lockfile-pinned |
| eslint / @eslint/js | 10.14.0 / 10.0.1 | — |
| typescript-eslint | 8.72.1 | — |
| @vitejs/plugin-react | 5.2.0 | Vite 7-compatible (see D3) |
| globals | 17.14.0 | eslint node globals |
| PyYAML (`oracle/requirements.lock.txt`) | 6.0.3 pinned; 6.0.1 installed system-wide (see D2) | 6.x |

All npm packages come from the public npm registry only; no paid or
private sources were used. `npm ci` reproduces the install from the lockfile.

## 4. Skeleton delivered (T001 only — no business logic)

- Root configs: `package.json`, `package-lock.json`, `tsconfig.json`,
  `vite.config.ts`, `playwright.config.ts`, `eslint.config.mjs`, `.npmrc`,
  `.gitignore`, `README.md`, `LICENSE_STATUS.md`, `THIRD_PARTY_NOTICES.md`.
- `scripts/env-check.mjs` — real environment check (exit 0, see §5).
- Empty-module skeletons (placeholder export only, no algorithms):
  `src/core/` (13 modules), `src/cli/` + `src/cli/commands/` (demo/analyze/matrix),
  `src/report/` (json/html), `src/ui/` (App + 4 panels + main),
  `src/worker/` (protocol + worker),
  `oracle/checkpath_oracle/` (`__init__`, parser, evaluator, glob_subset,
  resolver, canonical, cli).
- Directory tree per Implementation Plan §2, including `examples/`,
  `tests/fixtures/{s0,golden,mutations,unsupported}`, `tests/{unit,integration,e2e}`,
  `evidence/{environment,s0,tests,screenshots,hashes}`, `release/`
  (empty dirs carry a `.gitkeep` so the structure is committed).
- `package.json` contains **all 27 script names** from Implementation Plan §7
  plus `test` (`vitest run`, used by T011/T013 acceptance commands).
  Scripts whose implementation belongs to a later task point at the real
  command (real `vitest` path / real `node scripts/...` file) and fail
  honestly until that task implements them — no empty script, no fixed
  `exit 0` stub anywhere.

## 5. Acceptance commands — actual exit codes and logs

Logs live in `evidence/environment/logs/`.

| Command | Exit code | Log | Result |
|---|---|---|---|
| `node --version` | 0 | `logs/versions.log` | v24.22.1 |
| `npm --version` | 0 | `logs/versions.log` | 10.9.4 |
| `python3 --version` | 0 | `logs/versions.log` | Python 3.12.3 |
| `git --version` | 0 | `logs/versions.log` | git version 2.43.0 |
| `node -p "process.platform + ' ' + process.arch"` | 0 | `logs/versions.log` | linux x64 |
| `python3 -c "import sys; print(sys.version)"` | 0 | `logs/versions.log` | 3.12.3 (main, Aug 31 2026) [GCC 13.3.0] |
| `python --version` | **127** | `logs/versions.log` | command not found — deviation D1 |
| `npm ci` | 0 | `logs/npm-ci.log` | clean install from lockfile (re-run after adding `globals`: exit 0) |
| `python3 -m pip install -r oracle/requirements.lock.txt` | **1** | `logs/pip-install.log` | PEP 668 externally-managed-environment — deviation D2 |
| `npm run env:check` | **0** | `logs/env-check.log` | all hard checks PASS; 2 warnings (D1, Playwright cache note) |
| `npm run typecheck` | **0** | `logs/typecheck.log` | `tsc --noEmit`, no errors |
| `npm run lint` (§7 exact) | **2** | `logs/lint.log` | see §6 — fails only because `tests/` has no lintable files yet; `npx eslint src scripts` exits 0 |

## 6. Scripts pending later tasks (verified to fail honestly, not stubbed)

Sampled in T001; full list is every §7 script except `env:check`,
`typecheck` and `lint` (see above):

| Script | Sampled exit | Failure cause (real, not stubbed) | Owner |
|---|---|---|---|
| `s0:parse` | 1 | no test files under `tests/unit/s0-parser` | T002 |
| `s0:oracle` | 1 | `scripts/oracle-diff.mjs` does not exist yet | T004 |
| `build` | 1 | no Vite entry (`index.html` / UI) yet | T010 |
| `test:e2e` | 1 | `Error: No tests found` | T012 |
| `s0:semantics`, `s0:determinism`, `s0:gate`, `test:*` (others), `release:verify`, `release:freeze` | not sampled in T001 (same pattern: missing test files / missing scripts owned by later tasks) | — | T002–T014 |

## 7. License

No license name is written in any project file. Status is
`PENDING_SAM_DECISION` — see `LICENSE_STATUS.md`.

## 8. Unresolved items (carried to later tasks)

1. **D2 / pip:** pinned PyYAML 6.0.3 not installed; system PyYAML 6.0.1 is
   usable. T004 decides: system PyYAML or a venv install of the pinned version.
2. **`npm run lint` exit 2 in T001:** caused solely by the empty `tests/`
   directory (no test files exist yet). Resolves when T002 adds the first
   test files; no config change needed.
3. **Memory pressure:** only ~514 MiB RAM available at measurement time.
   Later heavy steps (Vite build, Playwright) should be watched; no failure
   observed in T001.
4. **No system browser binary:** E2E (T012) will rely on the Playwright
   browser cache (`chromium-1248`/`1254` already present).
5. **All §7 scripts except `env:check`/`typecheck`** await their owning
   tasks (T002–T014) — listed in §6.
