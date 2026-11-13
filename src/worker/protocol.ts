// T010 — Worker protocol (PROJECT_BOOK §7.1).
//
// A single Dedicated Web Worker executes UI analysis off the main
// thread. Messages are plain JSON; the worker never touches the DOM
// and never fetches anything — it only runs the pure report builder
// over data the UI thread posts to it. No network, no token.

import type { ReportWorkflowInput } from "../report/build.js";
import type { RequiredCheckEntry, ScenarioV1 } from "../core/types.js";
import type { ReportFile } from "../report/json.js";

/** UI thread -> worker: analyze one case. */
export interface AnalyzeRequestMessage {
  type: "analyze-request";
  requestId: string;
  fixtureId: string;
  workflows: ReportWorkflowInput[];
  scenario: ScenarioV1;
  requiredChecks: RequiredCheckEntry[];
}

/** Worker -> UI thread: analysis result. */
export type AnalyzeResponseMessage =
  | {
      type: "analyze-response";
      requestId: string;
      ok: true;
      /** The report file object (frozen report + recommendations + annotation + scenario). */
      file: ReportFile;
      exitCode: number;
    }
  | { type: "analyze-response"; requestId: string; ok: false; error: string };

export type WorkerMessage = AnalyzeRequestMessage | AnalyzeResponseMessage;

/** Type guard for inbound worker messages. */
export function isAnalyzeRequest(message: unknown): message is AnalyzeRequestMessage {
  return (
    message !== null &&
    typeof message === "object" &&
    (message as Record<string, unknown>)["type"] === "analyze-request"
  );
}
