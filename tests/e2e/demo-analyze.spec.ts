// T012 — E2E: demo → analyze → matrix CLI flow, then the generated
// HTML report in a real browser: all five sections, required-check
// click highlights the provider path, witness toggle shows the
// reduced-vs-original scenario diff, matrix links resolve, and the
// offline React viewer (dist/index.html) renders its empty state.
// Screenshots are committed evidence under evidence/screenshots/.

import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  distDir,
  makeTempDir,
  recomputeReportSha256,
  runCli,
  screenshotsDir,
  serveDir,
} from "./helpers";

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
});

test("demo → analyze → matrix: gate exit codes and recomputable hashes", () => {
  const workDir = makeTempDir("checkpath-e2e-flow-");

  const demo = runCli(["demo", "--out", path.join(workDir, "demo")]);
  expect(demo.status, "demo exit (docs-only scenario gates to 2)").toBe(2);

  const docsOnly = runCli([
    "analyze",
    "--repo", "examples/repo-basic",
    "--scenario", "examples/scenarios/pr-docs-only.json",
    "--required-checks", "examples/required-checks.yml",
    "--out", path.join(workDir, "pr-docs-only"),
  ]);
  expect(docsOnly.status, "analyze pr-docs-only exit").toBe(2);

  const srcOnly = runCli([
    "analyze",
    "--repo", "examples/repo-basic",
    "--scenario", "examples/scenarios/pr-src-only.json",
    "--required-checks", "examples/required-checks.yml",
    "--out", path.join(workDir, "pr-src-only"),
  ]);
  expect(srcOnly.status, "analyze pr-src-only exit").toBe(0);

  const matrix = runCli([
    "matrix",
    "--repo", "examples/repo-basic",
    "--suite", "examples/suites/merge-queue.json",
    "--required-checks", "examples/required-checks.yml",
    "--out", path.join(workDir, "merge-queue"),
  ]);
  expect(matrix.status, "matrix exit (worst scenario gates to 2)").toBe(2);

  // report_sha256 recomputes, and demo == analyze on the same input.
  const demoHash = recomputeReportSha256(path.join(workDir, "demo", "report.json"));
  const docsHash = recomputeReportSha256(path.join(workDir, "pr-docs-only", "report.json"));
  expect(demoHash.match, "demo report_sha256 recomputes").toBe(true);
  expect(docsHash.match, "analyze report_sha256 recomputes").toBe(true);
  expect(demoHash.recomputed, "demo report == analyze report").toBe(docsHash.recomputed);

  // Matrix covers all 3 scenarios with the per-scenario exit codes.
  const matrixJson = JSON.parse(
    readFileSync(path.join(workDir, "merge-queue", "matrix.json"), "utf8"),
  ) as {
    exit_code: number;
    scenarios: { scenario_id: string; exit_code: number }[];
  };
  expect(matrixJson.exit_code).toBe(2);
  expect(matrixJson.scenarios.map((s) => `${s.scenario_id}:${s.exit_code}`).sort()).toEqual([
    "MERGE-GROUP-01:2",
    "PR-DOCS-ONLY:2",
    "PR-SRC-ONLY:0",
  ]);
  const srcHash = recomputeReportSha256(path.join(workDir, "pr-src-only", "report.json"));
  expect(srcHash.match, "src-only report_sha256 recomputes").toBe(true);
});

test("HTML report: five sections, check-click highlights provider", async ({ page }) => {
  const workDir = makeTempDir("checkpath-e2e-report-");
  const outDir = path.join(workDir, "pr-docs-only");
  const analyzed = runCli([
    "analyze",
    "--repo", "examples/repo-basic",
    "--scenario", "examples/scenarios/pr-docs-only.json",
    "--required-checks", "examples/required-checks.yml",
    "--out", outDir,
  ]);
  expect(analyzed.status).toBe(2);
  const server = await serveDir(outDir);
  try {
    await page.goto(`${server.baseUrl}/report.html`);
    await expect(page.getByRole("heading", { name: "CheckPath report — PR-DOCS-ONLY" })).toBeVisible();
    for (const section of ["Summary", "Event Path", "Workflow / Job DAG", "Required Checks", "Witness", "Export"]) {
      await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
    }
    // Both required checks are PENDING_NOT_REPORTED in this scenario.
    await expect(page.locator("tr[data-context='unit-tests'] .st-PENDING_NOT_REPORTED")).toBeVisible();
    await expect(page.locator("tr[data-context='integration'] .st-PENDING_NOT_REPORTED")).toBeVisible();

    await page.locator("tr[data-context='unit-tests']").click();
    await expect(page.locator("tr[data-context='unit-tests'].highlight")).toBeVisible();
    await expect(page.locator("[data-workflow-path='.github/workflows/ci.yml'].highlight").first()).toBeVisible();
    await expect(page.locator("#highlight-note")).toContainText(".github/workflows/ci.yml");

    await page.screenshot({ path: path.join(screenshotsDir, "e2e-report-pr-docs-only.png"), fullPage: true });
  } finally {
    await server.close();
  }
});

test("HTML report: witness toggle shows reduced vs original scenario", async ({ page }) => {
  const workDir = makeTempDir("checkpath-e2e-witness-");
  const outDir = path.join(workDir, "pr-docs-only");
  expect(runCli([
    "analyze",
    "--repo", "examples/repo-basic",
    "--scenario", "examples/scenarios/pr-docs-only.json",
    "--required-checks", "examples/required-checks.yml",
    "--out", outDir,
  ]).status).toBe(2);
  const server = await serveDir(outDir);
  try {
    await page.goto(`${server.baseUrl}/report.html`);
    const panel = page.locator("#witness-diff-witness-001");
    await expect(panel).toHaveClass(/hidden/);
    await page.locator("button[data-witness-toggle='witness-001']").click();
    await expect(panel).not.toHaveClass(/hidden/);
    await expect(panel).toContainText("PR-DOCS-ONLY");
    await page.screenshot({ path: path.join(screenshotsDir, "e2e-witness-toggle.png"), fullPage: true });
  } finally {
    await server.close();
  }
});

test("matrix HTML: scenario links resolve to per-scenario reports", async ({ page }) => {
  const workDir = makeTempDir("checkpath-e2e-matrix-");
  const outDir = path.join(workDir, "merge-queue");
  expect(runCli([
    "matrix",
    "--repo", "examples/repo-basic",
    "--suite", "examples/suites/merge-queue.json",
    "--required-checks", "examples/required-checks.yml",
    "--out", outDir,
  ]).status).toBe(2);
  const server = await serveDir(outDir);
  try {
    await page.goto(`${server.baseUrl}/matrix.html`);
    await expect(page.getByRole("heading", { name: "CheckPath coverage matrix — merge-queue" })).toBeVisible();
    for (const id of ["PR-DOCS-ONLY", "PR-SRC-ONLY", "MERGE-GROUP-01"]) {
      // Each scenario link appears twice: once in the matrix column
      // header and once in the scenarios table.
      await expect(page.locator(`a[href="${id}/report.html"]`)).toHaveCount(2);
    }
    await page.locator("a[href='PR-SRC-ONLY/report.html']").first().click();
    await expect(page.getByRole("heading", { name: "CheckPath report — PR-SRC-ONLY" })).toBeVisible();
    await expect(page.locator("tr[data-context='unit-tests'] .st-REPORTABLE_PENDING")).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, "e2e-matrix.png"), fullPage: true });
  } finally {
    await server.close();
  }
});

test("offline UI viewer (dist/index.html) renders its empty state", async ({ page }) => {
  const server = await serveDir(distDir);
  try {
    await page.goto(`${server.baseUrl}/index.html`);
    await expect(page.locator("#root")).toContainText("No report loaded.");
    await expect(page.locator("#root")).toContainText("Generate one with the local CLI");
    await expect(page.locator("#root")).toContainText("node dist/checkpath.mjs demo");
    await page.screenshot({ path: path.join(screenshotsDir, "e2e-ui-viewer.png"), fullPage: true });
  } finally {
    await server.close();
  }
});
