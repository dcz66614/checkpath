// FIX-P0-12 (P0-A) — Anchor/tag-nospace YAML parity test (T013 R11
// grouped P0: `&x#c` / `!!str#c` — the `yaml` package accepts an
// anchor/tag immediately followed by `#` (no space) where PyYAML's
// scanner rejects it, so the TypeScript side said VALID where the
// Oracle said INVALID).
//
// The fix lives in the TypeScript side only
// (`src/core/workflow-parser.ts`, `hasRejectedAnchorOrTag`, called by
// `parseWorkflowYaml` and by `extractJobs` in `src/core/e2e.ts`): a
// raw line scan mirroring PyYAML's `scan_anchor` / `scan_tag` token
// rules rejects an anchor/alias/tag the PyYAML scanner rejects —
// `#` (and the other name-extending characters `.` `/` `;` `+` `<`
// `!` `*` `|` `>` quotes `[` `{` `&` `%` `@` backtick) right after
// an anchor name, an empty anchor name, a stray `:`/`?` after an
// anchor in value position, and a tag followed by a non-whitespace
// character. The Oracle parser is untouched. Deliberately NOT
// rejected — both sides already agree on them (the controls lock
// that): an anchor on an implicit key followed by `:` (`{&x: 1}`,
// `- &x: 1`), a space-separated comment (`&x #c`), `#` inside a
// quoted or plain scalar, an anchor followed by `,`/`]`/`}`, and
// well-formed unknown/core tags (`!foo 1`, `!!str 1`). See ADR
// FIX-P0-12 in handoff/P020-FIX-P0-12/TASK_REPORT.md and
// evidence/probes/fix-p0-12/ for the full 243-row probe matrix.
//
// This test locks both sides' exact behaviour (status / errors /
// full events, field-for-field) and asserts the two sides agree on
// all 24 shapes.
//
// The Oracle side is run through scripts/oracle-parse-probe.py (a thin
// driver over parse_workflow_yaml, no evaluation logic of its own).

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWorkflowYaml } from "../../../src/core/workflow-parser.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const fixtureDir = join(
  here,
  "../../fixtures/parser-divergence/anchor-tag-nospace",
);
const probe = join(repoRoot, "scripts/oracle-parse-probe.py");

interface ExpectedCase {
  id: string;
  file: string;
  typescript: { status: string; errors: string[]; events: unknown };
  oracle: { status: string; errors: string[]; events: unknown };
}

const expected = JSON.parse(
  readFileSync(join(fixtureDir, "expected.json"), "utf-8"),
) as { schema: string; cases: ExpectedCase[] };

describe("anchor-tag-nospace YAML parity (FIX-P0-12 P0-A, R11 grouped P0)", () => {
  it("expected file schema is the parser-divergence schema", () => {
    expect(expected.schema).toBe("checkpath.parser-divergence/v1");
    expect(expected.cases).toHaveLength(24);
    // The fixture files on disk are exactly the cases in expected.json.
    const files = readdirSync(fixtureDir)
      .filter((f) => f.endsWith(".yml"))
      .sort();
    expect(files).toEqual(
      expected.cases.map((c) => c.file).sort(),
    );
  });

  for (const entry of expected.cases) {
    it(`${entry.id}: TS and Oracle agree (status / errors / events)`, () => {
      const yamlText = readFileSync(join(fixtureDir, entry.file), "utf-8");

      // TypeScript side.
      const ts = parseWorkflowYaml(yamlText, entry.id);
      expect(ts.status).toBe(entry.typescript.status);
      expect(ts.errors).toEqual(entry.typescript.errors);
      expect(ts.events).toEqual(entry.typescript.events);

      // Oracle side.
      const oracleRun = spawnSync(
        "python3",
        [probe, "--yaml", join(fixtureDir, entry.file), "--fixture-id", entry.id],
        { encoding: "utf-8" },
      );
      expect(oracleRun.status).toBe(0);
      expect(oracleRun.stderr).toBe("");
      const oracle = JSON.parse(oracleRun.stdout) as {
        status: string;
        errors: string[];
        events: unknown;
      };
      expect(oracle.status).toBe(entry.oracle.status);
      expect(oracle.errors).toEqual(entry.oracle.errors);
      expect(oracle.events).toEqual(entry.oracle.events);

      // The two sides agree — this is the parity lock.
      expect(ts.status).toBe(oracle.status);
      expect(ts.errors).toEqual(oracle.errors);
      expect(ts.events).toEqual(oracle.events);
    });
  }
});
