// T010 — Report JSON file format (PROJECT_BOOK §6.3).
//
// The file a CLI run writes is a small ENVELOPE, not a bare ReportV1
// document:
//
//   {
//     "schema": "checkpath.report-file/v1",
//     "report": { ...ReportV1... },
//     "recommendations": [ {witness_id, rule_id, kind, check_context,
//                          recommendation}, ... ],
//     "diff_boundary": "first_3000_truncated" | ... | null,
//     "scenario": { ...ScenarioV1 (the validated input scenario)... }
//   }
//
// Why an envelope: ReportV1 is a frozen schema (validate.ts rejects
// unknown fields), so the parallel `WitnessRecommendation` list
// (T009-U03: never merged into ReportWitness objects) and the
// presentation-only diff-boundary annotation (T006 U-02: the formal
// layer's `annotateDiffBoundary` wording, NOT an Oracle field) cannot
// live inside the report object itself. The envelope keeps them
// alongside it, each under its own key, and `validateReport` still
// sees the exact frozen shape. `scenario` is included so the HTML
// witness view can show the reduced scenario against the original
// input without re-reading the scenario file.
//
// File bytes are canonical JSON + one trailing LF. The trailing LF is
// a file convention only: hashes are computed over the canonical form
// WITHOUT the newline (canonical-json.ts), so stripping one trailing
// "\n" before hashing reproduces every hash in the report.

import { canonicalJson } from "../core/canonical-json.js";
import { validateReport, validateScenario } from "../core/validate.js";
import type { WitnessRecommendation } from "../core/witness-reducer.js";
import type { DiffBoundary } from "../core/skip-annotation.js";
import type { ReportV1, ScenarioV1 } from "../core/types.js";
import type { BuiltReport } from "./build.js";

export const REPORT_FILE_SCHEMA = "checkpath.report-file/v1" as const;

/** The on-disk report file: frozen report + parallel side data. */
export interface ReportFile {
  schema: typeof REPORT_FILE_SCHEMA;
  report: ReportV1;
  recommendations: WitnessRecommendation[];
  diff_boundary: DiffBoundary | null;
  scenario: ScenarioV1;
}

/** Build the file object from a built report (pure, no I/O). */
export function toReportFile(built: BuiltReport, scenario: ScenarioV1): ReportFile {
  return {
    schema: REPORT_FILE_SCHEMA,
    report: built.report,
    recommendations: built.recommendations,
    diff_boundary: built.diffBoundary,
    scenario,
  };
}

/** Canonical file text (canonical JSON + one trailing LF). */
export function reportFileText(file: ReportFile): string {
  return canonicalJson(file) + "\n";
}

/**
 * Parse + structurally validate a report file's text. Returns the
 * file object, or throws with the validation issues. The embedded
 * ReportV1 is validated with `validateReport` (frozen shape) and the
 * embedded scenario with `validateScenario`; the parallel
 * recommendations list is checked for shape only (each entry must
 * name a witness id present in the report).
 */
export function parseReportFileText(text: string): ReportFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`report file is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("report file must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj["schema"] !== REPORT_FILE_SCHEMA) {
    throw new Error(`report file schema must be ${REPORT_FILE_SCHEMA}`);
  }
  const reportValidation = validateReport(obj["report"]);
  if (!reportValidation.ok || reportValidation.value === null) {
    throw new Error(
      `embedded report failed validation: ${reportValidation.issues
        .map((i) => `${i.path} ${i.code} ${i.message}`)
        .join("; ")}`,
    );
  }
  const scenarioValidation = validateScenario(obj["scenario"]);
  if (!scenarioValidation.ok || scenarioValidation.value === null) {
    throw new Error(
      `embedded scenario failed validation: ${scenarioValidation.issues
        .map((i) => `${i.path} ${i.code} ${i.message}`)
        .join("; ")}`,
    );
  }
  if (!Array.isArray(obj["recommendations"])) {
    throw new Error("report file recommendations must be an array");
  }
  const witnessIds = new Set(reportValidation.value.witnesses.map((w) => w.id));
  for (const rec of obj["recommendations"] as unknown[]) {
    if (rec === null || typeof rec !== "object" || Array.isArray(rec)) {
      throw new Error("report file recommendation must be an object");
    }
    const entry = rec as Record<string, unknown>;
    if (typeof entry["witness_id"] !== "string" || !witnessIds.has(entry["witness_id"])) {
      throw new Error(
        `recommendation witness_id ${JSON.stringify(entry["witness_id"])} does not name a witness in the report`,
      );
    }
    if (typeof entry["recommendation"] !== "string" || entry["recommendation"] === "") {
      throw new Error("report file recommendation must carry non-empty recommendation text");
    }
  }
  return {
    schema: REPORT_FILE_SCHEMA,
    report: reportValidation.value,
    recommendations: obj["recommendations"] as WitnessRecommendation[],
    diff_boundary:
      obj["diff_boundary"] === null || typeof obj["diff_boundary"] === "string"
        ? (obj["diff_boundary"] as DiffBoundary | null)
        : null,
    scenario: scenarioValidation.value,
  };
}
