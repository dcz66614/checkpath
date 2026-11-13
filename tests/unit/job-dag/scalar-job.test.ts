// FIX-P0-04 — Scalar-job parity test (final review R2 P0 residual,
// grouped P0 in T013 R5, J20: `jobs: {test: True}` — the TypeScript
// `extractJobs` non-dict branch omits the `unsupported_job` field
// while the Oracle's `extract_jobs` non-dict branch wrote it out as
// null).
//
// The fix lives in the Oracle side only
// (`oracle/checkpath_oracle/parser.py`, `extract_jobs` non-dict
// branch): the field is now omitted there too, matching the
// TypeScript output exactly. The TypeScript product code is
// untouched. A normal mapping job definition still carries the field
// on both sides (control case j06). See ADR FIX-P0-04 in
// handoff/P020-FIX-P0-04/TASK_REPORT.md and the README in the
// fixture directory for the trade-off.
//
// Shapes locked here (fixtures in
// tests/fixtures/parser-divergence/scalar-job/):
//   non-mapping definitions — `True`, empty/null, sequence, quoted
//     string, number — omit `unsupported_job` on both sides;
//   mapping definition — carries `unsupported_job: null` on both.
// The same shapes are covered end to end by the trigger suite
// (T6-50 scalar `True`, T6-51 scalar null) and the golden suite
// (G-114, G-115).
//
// The Oracle side is run through scripts/oracle-jobs-probe.py (a thin
// driver over extract_jobs, no evaluation logic of its own).

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractJobs } from "../../../src/core/e2e.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const fixtureDir = join(
  here,
  "../../fixtures/parser-divergence/scalar-job",
);
const probe = join(repoRoot, "scripts/oracle-jobs-probe.py");

interface ExpectedCase {
  id: string;
  file: string;
  typescript: { jobs: unknown };
  oracle: { jobs: unknown };
}

const expected = JSON.parse(
  readFileSync(join(fixtureDir, "expected.json"), "utf-8"),
) as { schema: string; cases: ExpectedCase[] };

describe("scalar-job parity (FIX-P0-04, R2 P0 residual J20)", () => {
  it("expected file schema is the parser-divergence schema", () => {
    expect(expected.schema).toBe("checkpath.parser-divergence/v1");
    expect(expected.cases).toHaveLength(6);
    // The fixture files on disk are exactly the cases in expected.json.
    const files = readdirSync(fixtureDir)
      .filter((f) => f.endsWith(".yml"))
      .sort();
    expect(files).toEqual(
      expected.cases.map((c) => c.file).sort(),
    );
  });

  for (const entry of expected.cases) {
    it(`${entry.id}: TS extractJobs and Oracle extract_jobs agree`, () => {
      const yamlText = readFileSync(join(fixtureDir, entry.file), "utf-8");

      // TypeScript side.
      const ts = extractJobs(yamlText);
      expect(ts).toEqual(entry.typescript.jobs);

      // Oracle side.
      const oracleRun = spawnSync(
        "python3",
        [probe, "--yaml", join(fixtureDir, entry.file)],
        { encoding: "utf-8" },
      );
      expect(oracleRun.status).toBe(0);
      expect(oracleRun.stderr).toBe("");
      const oracle = JSON.parse(oracleRun.stdout) as unknown;
      expect(oracle).toEqual(entry.oracle.jobs);

      // The two sides agree — this is the parity lock. Compare
      // through JSON so key order cannot mask a difference.
      expect(JSON.parse(JSON.stringify(ts))).toEqual(oracle);
    });
  }
});
