// T012 — browser-level offline proof: the generated report.html and
// the dist UI viewer must issue zero external requests. Two angles:
// (1) loaded via file://, the report must issue zero requests at all;
// (2) loaded over loopback HTTP with a route interceptor, every
// request must be loopback-local and none may target an external host.
// This complements the CLI-level proof in `npm run test:offline`
// (unshare -rn + strace: 0 network syscalls).

import path from "node:path";
import { test, expect } from "@playwright/test";
import { distDir, makeTempDir, runCli, serveDir } from "./helpers";

function generatedReportDir(): string {
  const workDir = makeTempDir("checkpath-e2e-offline-");
  const outDir = path.join(workDir, "pr-docs-only");
  const r = runCli([
    "analyze",
    "--repo", "examples/repo-basic",
    "--scenario", "examples/scenarios/pr-docs-only.json",
    "--required-checks", "examples/required-checks.yml",
    "--out", outDir,
  ]);
  expect(r.status).toBe(2);
  return outDir;
}

test("report.html via file:// issues zero network requests", async ({ page }) => {
  const outDir = generatedReportDir();
  const reportUrl = `file://${path.join(outDir, "report.html")}`;
  const urls: string[] = [];
  page.on("request", (req) => urls.push(req.url()));
  await page.goto(reportUrl);
  await expect(page.getByRole("heading", { name: "CheckPath report — PR-DOCS-ONLY" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Witness", exact: true })).toBeVisible();
  // Playwright records the document navigation itself as a request;
  // the assertion is that the report loads nothing else (no subresource,
  // no favicon, no remote fetch). Only the navigation may appear.
  expect(urls, "only the document navigation itself, no subresource").toEqual([reportUrl]);
});

test("report.html over HTTP issues zero external requests", async ({ page }) => {
  const outDir = generatedReportDir();
  const server = await serveDir(outDir);
  const external: string[] = [];
  const all: string[] = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    all.push(url);
    if (!url.startsWith("http://127.0.0.1")) {
      external.push(url);
      await route.abort();
    } else {
      await route.continue();
    }
  });
  try {
    await page.goto(`${server.baseUrl}/report.html`);
    await expect(page.getByRole("heading", { name: "CheckPath report — PR-DOCS-ONLY" })).toBeVisible();
    // The single-file report loads nothing else: exactly one request,
    // the document itself, loopback-local.
    expect(all).toEqual([`${server.baseUrl}/report.html`]);
    expect(external, "no request to any external host").toEqual([]);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    await server.close();
  }
});

test("dist UI viewer issues zero external requests", async ({ page }) => {
  const server = await serveDir(distDir);
  const external: string[] = [];
  const all: string[] = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    all.push(url);
    if (!url.startsWith("http://127.0.0.1")) {
      external.push(url);
      await route.abort();
    } else {
      await route.continue();
    }
  });
  try {
    await page.goto(`${server.baseUrl}/index.html`);
    await expect(page.locator("#root")).toContainText("No report loaded.");
    expect(external, "no request to any external host").toEqual([]);
    expect(
      all.every((u) => u.startsWith("http://127.0.0.1")),
      `all requests loopback-local, got: ${all.join(", ")}`,
    ).toBe(true);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    await server.close();
  }
});
