// FIX-P2 — RequiredCheckTable duplicate-key regression test (T013 P2-3).
//
// The T8-05 / golden G-57 manifest lists the same context `unit-tests`
// three times (different sources), so the built report has three
// required-check rows with the same context. The table used
// `key={row.context}`, giving React three children with the same key:
// React logs a duplicate-key warning and row identity (selection /
// reconciliation) is undefined. The key must be unique per row
// (manifest index), and rendering the duplicate-context report must
// produce no key warning at all.
//
// The report is built from the frozen T8-05 fixture through buildReport
// (the same formal entry point the CLI and UI worker use), so the rows
// under test are the real resolver output, not hand-made data.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { RequiredCheckTable } from "../../../src/ui/RequiredCheckTable.js";
import { buildReport } from "../../../src/report/build.js";
import {
  validateRequiredChecks,
  validateScenario,
} from "../../../src/core/validate.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "../../fixtures/checks/T8-05-external-source");

function buildT805Report() {
  const yamlText = readFileSync(join(fixtureDir, "workflow.yml"), "utf-8");
  const validatedScenario = validateScenario(
    JSON.parse(readFileSync(join(fixtureDir, "scenario.json"), "utf-8")),
  );
  if (!validatedScenario.ok || validatedScenario.value === null) {
    throw new Error(
      `T8-05 scenario failed validation: ${JSON.stringify(validatedScenario.issues)}`,
    );
  }
  const validatedChecks = validateRequiredChecks(
    JSON.parse(readFileSync(join(fixtureDir, "required-checks.json"), "utf-8")),
  );
  if (!validatedChecks.ok || validatedChecks.value === null) {
    throw new Error(
      `T8-05 required checks failed validation: ${JSON.stringify(validatedChecks.issues)}`,
    );
  }
  return buildReport({
    fixtureId: "T8-05",
    workflows: [{ path: ".github/workflows/ci.yml", yamlText }],
    scenario: validatedScenario.value,
    requiredChecks: validatedChecks.value.required_checks,
  }).report;
}

describe("RequiredCheckTable duplicate-context rows (T013 P2-3)", () => {
  it("renders one row per manifest entry for duplicate contexts", () => {
    const report = buildT805Report();
    expect(report.required_check_results).toHaveLength(5);
    const html = renderToStaticMarkup(
      <RequiredCheckTable report={report} onSelect={() => {}} />,
    );
    // Three rows carry the context `unit-tests` (T8-05: github-actions /
    // external-app / ""), plus `ghost` and `lint`.
    expect(html.match(/<code>unit-tests<\/code>/g)).toHaveLength(3);
    expect(html).toContain("<code>ghost</code>");
    expect(html).toContain("<code>lint</code>");
    // Header row + 5 data rows.
    expect(html.match(/<tr/g)).toHaveLength(6);
  });

  it("assigns a unique React key to every row (no key conflict)", () => {
    // React 19's server renderer (renderToStaticMarkup) does not emit
    // the duplicate-key warning, so "no warning" cannot be observed
    // through a static render. The warning guards exactly one
    // property — row keys are unique — so this test asserts that
    // property directly on the element tree: it walks the <tbody>
    // subtree of the returned element and collects the key of every
    // <tr>. With `key={row.context}` the three `unit-tests` rows share
    // one key and this fails; with a per-row key it passes.
    const report = buildT805Report();
    const tree = RequiredCheckTable({ report, onSelect: () => {} });
    const keys: unknown[] = [];
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      const el = node as {
        type?: unknown;
        key?: unknown;
        props?: { children?: unknown };
      };
      if (el.type === "tbody") {
        const collect = (n: unknown): void => {
          if (n === null || typeof n !== "object") return;
          if (Array.isArray(n)) {
            n.forEach(collect);
            return;
          }
          const child = n as {
            type?: unknown;
            key?: unknown;
            props?: { children?: unknown };
          };
          if (child.type === "tr" && child.key !== null) {
            keys.push(child.key);
          }
          if (child.props?.children !== undefined) {
            collect(child.props.children);
          }
        };
        collect(el.props?.children);
        return;
      }
      if (el.props?.children !== undefined) walk(el.props.children);
    };
    walk(tree);
    expect(keys).toHaveLength(5);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
