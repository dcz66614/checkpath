// FIX-P0-03 — Scalar-rendering jobs parity test (final review R2 P0
// residual, same root cause as the trigger-IR rendering: the
// TypeScript `extractJobs` renders parsed scalars with `String()`
// while the Oracle's `extract_jobs` used to keep raw spellings).
//
// Shapes locked here (fixtures in
// tests/fixtures/parser-divergence/scalar-rendering-jobs/):
//   job ids — plain `True:` -> `"true"`, `Null:`/`~:` -> `""`,
//     `01:` -> `"1"`; quoted `"True":` stays `"True"` (not covered —
//     it already agreed; see the probe table in the FIX-P0-03 report)
//   `if:` — plain `True` -> `"true"`, empty / `null` -> null
//   `needs:` — plain `True` -> `["true"]`, `[a, True, 1]` ->
//     `["a", "true", "1"]`, empty -> `[]`, `[null]` ->
//     `["__invalid_needs__"]`
//   `name:` — plain `True` / `1` / empty -> null
//   duplicate numeric job ids (`1:` + `01:`) -> both sides `[]`
//     (the TypeScript parse throws; the Oracle raises yaml_parse_error)
//
// A scalar (non-mapping) job definition used to be deliberately NOT
// covered here (the TypeScript side omitted the `unsupported_job`
// field and the Oracle included it as null — see the FIX-P0-03
// report §7-3). FIX-P0-04 closed that divergence on the Oracle side
// and locks it in tests/unit/job-dag/scalar-job.test.ts over the
// fixtures in tests/fixtures/parser-divergence/scalar-job/ (plus
// trigger T6-50/T6-51 and golden G-114/G-115 end to end).
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
  "../../fixtures/parser-divergence/scalar-rendering-jobs",
);
const probe = join(repoRoot, "scripts/oracle-jobs-probe.py");

const CASES = [
  "J1_jobid_True",
  "J2_jobid_Null",
  "J4_jobid_01",
  "J5_jobid_tilde",
  "J7_if_True",
  "J9_if_empty",
  "J10_if_null",
  "J11_needs_True",
  "J12_needs_list_mixed",
  "J13_needs_empty",
  "J14_name_True",
  "J15_name_1",
  "J16_name_empty",
  "J17_dup_jobid_1_01",
  "J18_needs_list_null_item",
];

describe("scalar-rendering jobs parity (FIX-P0-03, R2 P0 residual)", () => {
  it("fixture files on disk are exactly the locked cases", () => {
    const files = readdirSync(fixtureDir)
      .filter((f) => f.endsWith(".yml"))
      .sort();
    expect(files).toEqual(CASES.map((c) => `${c}.yml`).sort());
  });

  for (const id of CASES) {
    it(`${id}: TS extractJobs and Oracle extract_jobs agree`, () => {
      const yamlText = readFileSync(join(fixtureDir, `${id}.yml`), "utf-8");

      // TypeScript side.
      const ts = extractJobs(yamlText);

      // Oracle side.
      const oracleRun = spawnSync(
        "python3",
        [probe, "--yaml", join(fixtureDir, `${id}.yml`)],
        { encoding: "utf-8" },
      );
      expect(oracleRun.status).toBe(0);
      expect(oracleRun.stderr).toBe("");
      const oracle = JSON.parse(oracleRun.stdout) as unknown;

      // The two sides agree — this is the parity lock. The Oracle
      // rows carry their keys sorted by the probe driver; compare
      // through JSON so key order cannot mask a difference.
      expect(JSON.parse(JSON.stringify(ts))).toEqual(oracle);
    });
  }
});
