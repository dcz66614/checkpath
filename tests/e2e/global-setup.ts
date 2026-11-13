// T012 — E2E global setup: rebuild dist/ from source so the browser
// tests always exercise the current build, and clear the previous
// trace/screenshot output directory. Fails fast if the build fails.

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default function globalSetup(): void {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  rmSync(path.join(repoRoot, "evidence", "tests", "e2e-output"), { recursive: true, force: true });
  const r = spawnSync("npm", ["run", "build"], { cwd: repoRoot, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`E2E global setup: npm run build failed (exit ${r.status}):\n${r.stdout}\n${r.stderr}`);
  }
}
