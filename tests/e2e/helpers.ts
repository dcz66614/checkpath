// T012 — shared E2E helpers: run the built CLI, recompute
// report_sha256 with the shipped core modules, and serve a directory
// over loopback HTTP for the browser tests. No external network.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../src/core/canonical-json";
import { sha256Hex } from "../../src/core/sha256";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const distDir = path.join(repoRoot, "dist");
export const cliEntry = path.join(distDir, "checkpath.mjs");
export const screenshotsDir = path.join(repoRoot, "evidence", "screenshots");

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function runCli(args: string[]): CliResult {
  const r = spawnSync("node", [cliEntry, ...args], { cwd: repoRoot, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

export function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

export function recomputeReportSha256(reportJsonPath: string): {
  claimed: string;
  recomputed: string;
  match: boolean;
} {
  const envelope = JSON.parse(readFileSync(reportJsonPath, "utf8")) as {
    report: Record<string, unknown> & { report_sha256: string };
  };
  const report = envelope.report;
  const claimed = report.report_sha256;
  const copy: Record<string, unknown> = { ...report };
  delete copy.report_sha256;
  const recomputed = sha256Hex(canonicalJson(copy));
  return { claimed, recomputed, match: claimed === recomputed };
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
};

export interface StaticServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function serveDir(dir: string): Promise<StaticServer> {
  const server: Server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const rel = urlPath.replace(/^\/+/, "") || "index.html";
    const file = path.join(dir, rel);
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
