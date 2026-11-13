// T010 — UI entry point.
//
// Renders App with the report injected as window.__CHECKPATH_REPORT__
// (a ReportFile object) when present; otherwise App renders the empty
// state. The worker (src/worker/analysis.worker.ts) is the path for
// in-browser analysis; this entry point only displays a report that
// already exists.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { ReportFile } from "../report/json.js";

declare global {
  interface Window {
    __CHECKPATH_REPORT__?: ReportFile;
  }
}

const data = window.__CHECKPATH_REPORT__ ?? null;

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App data={data} />
  </StrictMode>,
);
