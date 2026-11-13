// FIX-P0-14 probe entry — bundles the TypeScript side of the probe
// matrix (evidence/probes/fix-p0-14/cases.json) for run-matrix.py.
//
// Usage (via run-matrix.py, which calls esbuild on this file):
//   node <bundle.cjs> trigger|jobs <workflow.yml> [fixture-id]
// Prints parseWorkflowYaml (trigger) or extractJobs (jobs) as JSON.
// No evaluation logic of its own; the Oracle side is driven by
// scripts/oracle-parse-probe.py / scripts/oracle-jobs-probe.py.
import { parseWorkflowYaml } from "../../../src/core/workflow-parser.js";
import { extractJobs } from "../../../src/core/e2e.js";
import * as fs from "node:fs";

const [,, mode, file, fid] = process.argv;
const text = fs.readFileSync(file, "utf-8");
if (mode === "trigger") {
  console.log(JSON.stringify(parseWorkflowYaml(text, fid ?? "probe")));
} else if (mode === "jobs") {
  console.log(JSON.stringify(extractJobs(text)));
} else {
  throw new Error(`bad mode: ${mode}`);
}
