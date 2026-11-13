// T005 — SHA-256 helpers (IMPLEMENTATION_PLAN §8).
//
// Same digests as the S0-verified inline copy in src/core/e2e.ts and
// oracle/checkpath_oracle/canonical.py: UTF-8 input, lowercase hex.
// `sha256Canonical` hashes the canonical JSON of a value — the form the
// report hashes (scenario_sha256, workflow_set_sha256,
// required_checks_sha256, report_sha256) are computed from.

import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json.js";

/** SHA-256 hex digest of a UTF-8 string. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** SHA-256 hex digest of the canonical JSON of `value`. */
export function sha256Canonical(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
