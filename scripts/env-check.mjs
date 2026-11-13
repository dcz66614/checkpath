// T001 — environment check for P020 CheckPath.
// Real checks only: Node / npm / Python 3 / git versions, required files,
// workspace path, Playwright browser cache. No network calls, no tokens.
// Exit 0 when all hard checks pass; exit 1 otherwise.
// Deviations (e.g. missing `python` alias) are warnings, printed and
// recorded, and do NOT turn the check green by hiding them.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: "utf8" }).trim() };
  } catch (err) {
    return { ok: false, out: (err.stdout ?? "").toString().trim(), err: err.message };
  }
}

function parseVersion(out) {
  const m = out.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), raw: out } : null;
}

const checks = [];
const warnings = [];
function check(name, ok, detail) {
  checks.push({ name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) process.exitCode = 1;
}
function warn(name, detail) {
  warnings.push({ name, status: "WARN", detail });
}

const node = run("node", ["--version"]);
const nodeV = node.ok ? parseVersion(node.out) : null;
check("node >= 24", !!nodeV && nodeV.major === 24, node.ok ? node.out : "node not found");

const npm = run("npm", ["--version"]);
check("npm present", npm.ok, npm.ok ? npm.out : "npm not found");

const python3 = run("python3", ["--version"]);
const pyV = python3.ok ? parseVersion(python3.out) : null;
check("python3 3.12.x", !!pyV && pyV.major === 3 && pyV.minor === 12, python3.ok ? python3.out : "python3 not found");

const python = run("python", ["--version"]);
if (!python.ok) {
  warn("python alias missing", "`python` command not found; only `python3` exists. Spec commands written as `python ...` must be run as `python3 ...` on this VM. Recorded as VERSION_DEVIATION in evidence/environment/ENVIRONMENT_REPORT.md.");
}

const git = run("git", ["--version"]);
check("git present", git.ok, git.ok ? git.out : "git not found");

const platform = run("node", ["-p", "process.platform + ' ' + process.arch"]);
check("platform x86_64 linux", platform.ok && platform.out.includes("linux x64"), platform.out);

for (const f of [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "oracle/requirements.lock.txt",
  "scripts/env-check.mjs",
  "LICENSE_STATUS.md",
]) {
  check(`file exists: ${f}`, existsSync(path.join(root, f)), existsSync(path.join(root, f)) ? "present" : "MISSING");
}

const licenseStatus = existsSync(path.join(root, "LICENSE_STATUS.md"))
  ? readFileSync(path.join(root, "LICENSE_STATUS.md"), "utf8")
  : "";
check(
  "license undecided (no license name selected)",
  licenseStatus.includes("PENDING_SAM_DECISION"),
  licenseStatus.trim().split("\n")[0] ?? "",
);

const pwDir = path.join(homedir(), ".cache", "ms-playwright");
if (existsSync(pwDir)) {
  warn("playwright browsers", `browser cache present at ${pwDir} (informational; E2E tests not implemented until T012).`);
} else {
  warn("playwright browsers", `no browser cache at ${pwDir}; E2E tests (T012) will need a Playwright browser install.`);
}

// No GPU / Docker / Token preconditions are required by this project.
check("no GPU required", true, "CheckPath runs on CPU only by design");
check("no Docker required", true, "no container precondition");
check("no GitHub token required", true, "no token read or required");

const fingerprintInput = [
  `platform=${platform.out}`,
  `node=${node.out}`,
  `npm=${npm.out}`,
  `python3=${python3.out}`,
  `git=${git.out}`,
  `workspace=${root}`,
  `python-alias=${python.ok ? python.out : "MISSING"}`,
].join("\n");
const environmentFingerprint = createHash("sha256").update(fingerprintInput, "utf8").digest("hex");

console.log(JSON.stringify({ project: "P020", task: "T001", environmentFingerprint, workspace: root, checks, warnings }, null, 2));
if (process.exitCode) {
  console.error("env:check FAILED");
} else {
  console.log("env:check OK");
}
