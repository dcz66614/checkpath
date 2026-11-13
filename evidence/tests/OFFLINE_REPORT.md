# T012 — Offline Run Report

Result: **PASS** — CheckPath CLI runs with zero external network activity.

## Method (all real, no stubs)

1. **Real disconnection:** `demo` and `analyze` were run inside `unshare -rn` — a fresh network namespace with no usable interface (loopback down, no route). Both completed with the expected §4.7 gate exit codes (2 for the docs-only scenario), and the isolated `report.json` is byte-identical to the normal-run report (same `report_sha256`).
2. **Syscall proof:** the `analyze` run was repeated under `strace -f -e trace=network` (still inside `unshare -rn`). The trace contains **0 network syscalls** — the process never even creates a socket, let alone connects anywhere.
3. **Static scan:** every `.html`/`.js`/`.mjs`/`.css` file under `dist/` and in the generated reports was scanned for remote resource references (`src=`/`href=` to `http(s)`, CSS `@import`/`url(http)`, `fetch(http)`, remote WebSocket). Zero failures. The CLI bundle additionally contains no `fetch(`, `http(s).request`, `net.connect` or `node:http(s)` import at all.
4. **Bare URL strings are not requests:** the React UI bundle contains a few string constants that look like URLs (W3C XML namespace URIs, a `react.dev` error-documentation link) and Vite's `modulepreload` polyfill contains a `fetch(` that only fires for in-document `<link rel="modulepreload">` entries — `dist/index.html` contains none. These are recorded as informational notes in `OFFLINE_REPORT.json`, not failures, because no request is ever issued for them (confirmed by the strace trace and by the Playwright request-interception test in `tests/e2e/offline.spec.ts`).

## Steps

- PASS — **build**: npm run build exit 0
- PASS — **unshare -rn run**: isolated demo exit 2, isolated analyze exit 2, normal analyze exit 2; isolated report byte-identical to normal report: true
- PASS — **strace network syscalls**: 0 network syscalls in the whole process tree (no socket/connect/sendto/recvfrom)
- PASS — **offline static scan**: 31 files scanned, 0 remote resource references

Isolated report_sha256: `9dc3af313677f795b3a836d9074833c9cfd2bf190d5e2201b7a99b08a23375b7`
strace network syscalls: 0

Machine evidence: `OFFLINE_REPORT.json` (this directory). Browser-level proof: `npm run test:e2e` (`tests/e2e/offline.spec.ts`, request interception, zero external requests).
