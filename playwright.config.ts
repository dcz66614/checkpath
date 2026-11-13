// T012 — Playwright config: local Chromium E2E only, no network.
// Traces are recorded for every test and written under
// evidence/tests/e2e-output/ (committed evidence); failure screenshots
// go there too. Deliverable screenshots are taken explicitly by the
// specs into evidence/screenshots/.

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  outputDir: "evidence/tests/e2e-output",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    headless: true,
    trace: "on",
    screenshot: "only-on-failure",
  },
});
