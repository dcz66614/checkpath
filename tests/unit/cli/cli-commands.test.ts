// T010 — CLI command tests (in-process main()).
//
// Covers: help/version/unknown-command exit codes, analyze on the
// checked-in examples (exit 2 for the docs-only PR, exit 0 for the
// src-only PR), demo == analyze on the same inputs (same report
// object, same report_sha256), matrix over the merge-queue suite,
// and input errors exiting 3 without a report.

import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../../../src/cli/index.js";
import { parseReportFileText } from "../../../src/report/json.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../");
const examples = join(repoRoot, "examples");

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "checkpath-t010-"));
}

describe("CLI entry", () => {
  it("help and version exit 0; unknown command exits 3", async () => {
    expect(await main(["--help"])).toBe(0);
    expect(await main(["--version"])).toBe(0);
    expect(await main(["bogus-command"])).toBe(3);
  });

  it("analyze docs-only PR exits 2 and writes JSON + HTML", async () => {
    const out = join(tmp(), "pr-docs-only");
    const code = await main([
      "analyze",
      "--repo",
      join(examples, "repo-basic"),
      "--scenario",
      join(examples, "scenarios/pr-docs-only.json"),
      "--required-checks",
      join(examples, "required-checks.yml"),
      "--out",
      out,
    ]);
    expect(code).toBe(2);
    expect(existsSync(join(out, "report.json"))).toBe(true);
    expect(existsSync(join(out, "report.html"))).toBe(true);
    const file = parseReportFileText(readFileSync(join(out, "report.json"), "utf8"));
    expect(file.report.scenario_id).toBe("PR-DOCS-ONLY");
    expect(file.report.required_check_results.map((r) => r.status)).toEqual([
      "PENDING_NOT_REPORTED",
      "PENDING_NOT_REPORTED",
    ]);
    expect(file.report.witnesses).toHaveLength(2);
    expect(readFileSync(join(out, "report.html"), "utf8")).toContain("Event Path");
  });

  it("analyze src-only PR exits 0", async () => {
    const out = join(tmp(), "pr-src-only");
    const code = await main([
      "analyze",
      "--repo",
      join(examples, "repo-basic"),
      "--scenario",
      join(examples, "scenarios/pr-src-only.json"),
      "--required-checks",
      join(examples, "required-checks.yml"),
      "--out",
      out,
    ]);
    expect(code).toBe(0);
    const file = parseReportFileText(readFileSync(join(out, "report.json"), "utf8"));
    expect(file.report.required_check_results.map((r) => r.status)).toEqual([
      "REPORTABLE_PENDING",
      "REPORTABLE_PENDING",
    ]);
  });

  it("demo report equals analyze report on the example files", async () => {
    const demoOut = join(tmp(), "demo");
    const analyzeOut = join(tmp(), "analyze");
    expect(await main(["demo", "--out", demoOut])).toBe(2);
    expect(
      await main([
        "analyze",
        "--repo",
        join(examples, "repo-basic"),
        "--scenario",
        join(examples, "scenarios/pr-docs-only.json"),
        "--required-checks",
        join(examples, "required-checks.yml"),
        "--out",
        analyzeOut,
      ]),
    ).toBe(2);
    const demo = parseReportFileText(readFileSync(join(demoOut, "report.json"), "utf8"));
    const analyzed = parseReportFileText(readFileSync(join(analyzeOut, "report.json"), "utf8"));
    expect(demo.report).toEqual(analyzed.report);
    expect(demo.report.report_sha256).toBe(analyzed.report.report_sha256);
    expect(demo.recommendations).toEqual(analyzed.recommendations);
  });

  it("matrix runs all suite scenarios and exits with the worst code", async () => {
    const out = join(tmp(), "merge-queue");
    const code = await main([
      "matrix",
      "--repo",
      join(examples, "repo-basic"),
      "--suite",
      join(examples, "suites/merge-queue.json"),
      "--required-checks",
      join(examples, "required-checks.yml"),
      "--out",
      out,
    ]);
    expect(code).toBe(2);
    expect(existsSync(join(out, "matrix.json"))).toBe(true);
    expect(existsSync(join(out, "matrix.html"))).toBe(true);
    const matrix = JSON.parse(readFileSync(join(out, "matrix.json"), "utf8")) as {
      scenarios: { scenario_id: string; exit_code: number }[];
      exit_code: number;
    };
    expect(matrix.scenarios.map((s) => s.scenario_id).sort()).toEqual([
      "MERGE-GROUP-01",
      "PR-DOCS-ONLY",
      "PR-SRC-ONLY",
    ]);
    expect(matrix.exit_code).toBe(2);
    for (const scenario of matrix.scenarios) {
      expect(existsSync(join(out, scenario.scenario_id, "report.json"))).toBe(true);
      expect(existsSync(join(out, scenario.scenario_id, "report.html"))).toBe(true);
    }
  });

  it("input errors exit 3 and write no report", async () => {
    const out = join(tmp(), "bad");
    expect(
      await main([
        "analyze",
        "--repo",
        join(examples, "repo-basic"),
        "--scenario",
        join(examples, "scenarios/does-not-exist.json"),
        "--required-checks",
        join(examples, "required-checks.yml"),
        "--out",
        out,
      ]),
    ).toBe(3);
    expect(existsSync(join(out, "report.json"))).toBe(false);

    const badScenario = join(tmp(), "bad-scenario.json");
    writeFileSync(badScenario, JSON.stringify({ schema: "checkpath.scenario/v1" }), "utf8");
    expect(
      await main([
        "analyze",
        "--repo",
        join(examples, "repo-basic"),
        "--scenario",
        badScenario,
        "--required-checks",
        join(examples, "required-checks.yml"),
        "--out",
        out,
      ]),
    ).toBe(3);
    expect(existsSync(join(out, "report.json"))).toBe(false);
  });

  it("missing required flags exit 3", async () => {
    expect(await main(["analyze", "--repo", join(examples, "repo-basic")])).toBe(3);
    expect(await main(["analyze", "--repo", join(examples, "repo-basic"), "--scenario", "x", "--required-checks", "y", "--bogus", "z"])).toBe(3);
  });
});
