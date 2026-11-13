// T012 — vitest config (separate from vite.config.ts, whose
// defineConfig type rejects the `test` key): `npm test` must not pick
// up the Playwright E2E specs under tests/e2e (they use Playwright's
// test() API, not vitest's); `npm run test:e2e` runs them. The React
// plugin is kept so the .tsx unit tests transform exactly as before.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ["node_modules", "dist", ".idea", ".git", ".cache", "tests/e2e/**"],
  },
});
