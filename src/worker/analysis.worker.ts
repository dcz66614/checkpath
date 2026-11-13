// T010 — Dedicated analysis worker (PROJECT_BOOK §7.1).
//
// Receives an `analyze-request` message, runs the pure report builder
// (the same `buildReport` the CLI uses — one implementation, two
// callers), and posts an `analyze-response` back. The worker does no
// I/O, no fetch, no DOM access; a bad request yields ok:false with
// the error message instead of crashing the worker.
//
// Note on scope access: the worker global is reached through
// `globalThis` with a narrow cast so this file type-checks under both
// the bundler tsconfig and the NodeNext CLI tsconfig.

import { buildReport, exitCodeForReport } from "../report/build.js";
import { toReportFile } from "../report/json.js";
import {
  isAnalyzeRequest,
  type AnalyzeRequestMessage,
  type AnalyzeResponseMessage,
} from "./protocol.js";

const workerScope = globalThis as unknown as {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage: (message: AnalyzeResponseMessage) => void;
};

function handleRequest(message: AnalyzeRequestMessage): void {
  try {
    const built = buildReport({
      fixtureId: message.fixtureId,
      workflows: message.workflows,
      scenario: message.scenario,
      requiredChecks: message.requiredChecks,
    });
    workerScope.postMessage({
      type: "analyze-response",
      requestId: message.requestId,
      ok: true,
      file: toReportFile(built, message.scenario),
      exitCode: exitCodeForReport(built.report),
    });
  } catch (error) {
    workerScope.postMessage({
      type: "analyze-response",
      requestId: message.requestId,
      ok: false,
      error: (error as Error).message,
    });
  }
}

workerScope.onmessage = (event: { data: unknown }): void => {
  if (isAnalyzeRequest(event.data)) {
    handleRequest(event.data);
  }
};

export { handleRequest };
