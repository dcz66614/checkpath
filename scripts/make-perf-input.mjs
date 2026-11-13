// T012 — deterministic synthetic performance input generator.
//
// Generates the fixed pressure input for the PROJECT_BOOK §8.2
// performance target: 20 workflows / 200 jobs / 100 changed files /
// 50 required checks. All content is synthetic and fully
// deterministic (fixed names, fixed ordering, no timestamps, no
// randomness): running the generator twice into two directories must
// produce byte-identical trees with the same aggregate hash.
//
// Usage:
//   node scripts/make-perf-input.mjs --out <dir>
//
// Layout under <dir>:
//   repo/.github/workflows/wf-01.yml ... wf-20.yml
//   scenario.json
//   required-checks.yml
//   INPUT_MANIFEST.json   (per-file SHA-256 + aggregate input_sha256)

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PERF_WORKFLOWS = 20;
export const PERF_JOBS_PER_WORKFLOW = 10;
export const PERF_CHANGED_FILES = 100;
export const PERF_REQUIRED_CHECKS = 50;

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function workflowYaml(index) {
  const id = `wf-${String(index).padStart(2, "0")}`;
  // Even-numbered workflows use an ordered negative pattern inside
  // `paths` (CP-G semantics) to exclude src/generated/**; the scenario
  // never touches that directory, so all 20 workflows still trigger.
  // NOTE: `paths` + `paths-ignore` together are INVALID per the frozen
  // spec (mutually exclusive), so the negative pattern must live
  // inside `paths`, not in a separate `paths-ignore` key.
  const pathsBlock =
    index % 2 === 0
      ? `    paths:\n      - 'src/**'\n      - '!src/generated/**'\n`
      : `    paths:\n      - 'src/**'\n`;
  const lines = [
    `name: ${id}`,
    "on:",
    "  pull_request:",
    "    branches:",
    "      - main",
    pathsBlock,
    "jobs:",
  ];
  for (let j = 1; j <= PERF_JOBS_PER_WORKFLOW; j += 1) {
    const job = `${id}-job-${String(j).padStart(2, "0")}`;
    lines.push(`  ${job}:`);
    lines.push("    runs-on: ubuntu-latest");
    lines.push(`    name: ${job}`);
    if (j > 1) {
      const prev = `${id}-job-${String(j - 1).padStart(2, "0")}`;
      lines.push(`    needs: ${prev}`);
    }
    lines.push("    steps:");
    lines.push(`      - run: echo ${job}`);
  }
  return `${lines.join("\n")}\n`;
}

function scenarioJson() {
  const changedFiles = [];
  for (let i = 1; i <= PERF_CHANGED_FILES; i += 1) {
    const module = `module-${String(((i - 1) % 10) + 1).padStart(2, "0")}`;
    changedFiles.push(`src/${module}/file-${String(i).padStart(3, "0")}.ts`);
  }
  return {
    schema: "checkpath.scenario/v1",
    scenario_id: "PERF-20W-200J",
    event: {
      name: "pull_request",
      action: "synchronize",
      base_branch: "main",
      head_branch: "feature/perf",
      commit_message: "perf: synthetic pressure input",
    },
    diff: {
      algorithm: "three-dot",
      changed_files: changedFiles,
      changed_files_total: PERF_CHANGED_FILES,
      returned_files: PERF_CHANGED_FILES,
      complete: true,
      first_3000_confirmed: true,
      diff_timed_out: false,
      push_commit_count: null,
    },
  };
}

function requiredChecksYaml() {
  // First 50 job contexts: wf-01..wf-05, 10 jobs each.
  const lines = ["schema: checkpath.required-checks/v1", "required_checks:"];
  for (let w = 1; w <= 5; w += 1) {
    for (let j = 1; j <= PERF_JOBS_PER_WORKFLOW; j += 1) {
      const job = `wf-${String(w).padStart(2, "0")}-job-${String(j).padStart(2, "0")}`;
      lines.push(`  - context: ${job}`);
      lines.push("    source: github-actions");
    }
  }
  return `${lines.join("\n")}\n`;
}

function listFilesRecursive(dir, base) {
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    const rel = path.relative(base, full);
    if (statSync(full).isDirectory()) {
      out.push(...listFilesRecursive(full, base));
    } else {
      out.push(rel);
    }
  }
  return out.sort();
}

export function generatePerfInput(outDir) {
  rmSync(outDir, { recursive: true, force: true });
  const workflowsDir = path.join(outDir, "repo", ".github", "workflows");
  mkdirSync(workflowsDir, { recursive: true });
  for (let w = 1; w <= PERF_WORKFLOWS; w += 1) {
    const name = `wf-${String(w).padStart(2, "0")}.yml`;
    writeFileSync(path.join(workflowsDir, name), workflowYaml(w), "utf8");
  }
  writeFileSync(
    path.join(outDir, "scenario.json"),
    `${JSON.stringify(scenarioJson(), null, 2)}\n`,
    "utf8",
  );
  writeFileSync(path.join(outDir, "required-checks.yml"), requiredChecksYaml(), "utf8");
  const files = listFilesRecursive(outDir, outDir).map((rel) => ({
    path: rel.split(path.sep).join("/"),
    sha256: sha256Hex(readFileSync(path.join(outDir, rel), "utf8")),
  }));
  const manifest = {
    schema: "checkpath.perf-input-manifest/v1",
    workflows: PERF_WORKFLOWS,
    jobs: PERF_WORKFLOWS * PERF_JOBS_PER_WORKFLOW,
    changed_files: PERF_CHANGED_FILES,
    required_checks: PERF_REQUIRED_CHECKS,
    files,
    input_sha256: sha256Hex(JSON.stringify(files)),
  };
  writeFileSync(
    path.join(outDir, "INPUT_MANIFEST.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

function parseArgs(argv) {
  const out = { outDir: path.join(repoRoot, "evidence", "tests", "perf-input") };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out" && argv[i + 1]) {
      out.outDir = path.resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--help") {
      out.help = true;
    }
  }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/make-perf-input.mjs [--out <dir>]");
    process.exit(0);
  }
  const manifest = generatePerfInput(args.outDir);
  console.log(`wrote ${args.outDir} (${manifest.files.length} files)`);
  console.log(`input_sha256: ${manifest.input_sha256}`);
}
