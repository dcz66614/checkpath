# Third-party notices

Dependency list for the P020 CheckPath release candidate, verified
against `package.json` / `package-lock.json` at the FIX-P2 review
(2026-11-08). Direct dependencies (see `package.json` /
`package-lock.json` for exact locked versions and
`oracle/requirements.lock.txt` for Python):

- `react`, `react-dom` — UI (T010)
- `yaml` — TypeScript YAML parsing (T002)
- `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `@playwright/test`,
  `eslint`, `@eslint/js`, `typescript-eslint`, `@types/*` — toolchain / tests
- `PyYAML` — Python Reference Oracle YAML parsing (T002–T004)

Upstream license texts live in each installed package (`node_modules/<pkg>/LICENSE`
after `npm ci`). A consolidated license list is produced at release freeze
(T014); no project license is selected here — see `LICENSE_STATUS.md`
(PENDING_SAM_DECISION).
