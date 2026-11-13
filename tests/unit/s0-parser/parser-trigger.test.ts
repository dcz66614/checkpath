// T002 — parser/trigger PoC tests (test glue only).
//
// For each fixture in tests/fixtures/s0/parser-trigger/suite.json, builds the
// normalized trigger IR from the raw workflow YAML + scenario with the
// TypeScript implementation and compares it field-by-field with the fixture's
// fixed expected.json. The expected files were written from the spec before
// this test was first run and are never edited to fit the implementation.
//
// When CHECKPATH_IR_DUMP_DIR is set, the TS IR for every fixture is also
// written there as <id>.json so it can be diffed against the Python Oracle
// IR (oracle CLI --ir-out) for cross-implementation parity.
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTriggerIR } from "../../../src/core/workflow-parser.js";

const here = dirname(fileURLToPath(import.meta.url));
const suiteDir = join(here, "../../fixtures/s0/parser-trigger");

interface SuiteEntry {
  id: string;
  dir: string;
  workflow: string;
  scenario: string;
  expected: string;
}

const suite = JSON.parse(
  readFileSync(join(suiteDir, "suite.json"), "utf-8"),
) as { schema: string; fixtures: SuiteEntry[] };

describe("T002 parser/trigger PoC", () => {
  it("suite schema is the frozen parser suite schema", () => {
    expect(suite.schema).toBe("checkpath.s0-parser-suite/v1");
    expect(suite.fixtures).toHaveLength(8);
  });

  for (const entry of suite.fixtures) {
    it(`${entry.id} matches its fixed expected trigger IR`, () => {
      const fixtureDir = join(suiteDir, entry.dir);
      const yamlText = readFileSync(join(fixtureDir, entry.workflow), "utf-8");
      const scenario = JSON.parse(
        readFileSync(join(fixtureDir, entry.scenario), "utf-8"),
      );
      const expected = JSON.parse(
        readFileSync(join(fixtureDir, entry.expected), "utf-8"),
      );
      const ir = buildTriggerIR(yamlText, scenario, entry.id);
      const dumpDir = process.env["CHECKPATH_IR_DUMP_DIR"];
      if (dumpDir) {
        mkdirSync(dumpDir, { recursive: true });
        writeFileSync(
          join(dumpDir, `${entry.id}.json`),
          JSON.stringify(ir, null, 2) + "\n",
          "utf-8",
        );
      }
      expect(ir).toEqual(expected);
    });
  }
});
