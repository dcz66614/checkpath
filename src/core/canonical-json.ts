// T005 — Canonical JSON (IMPLEMENTATION_PLAN §8).
//
// Canonical form (must match oracle/checkpath_oracle/canonical.py
// byte-for-byte, and the S0-verified inline copy in src/core/e2e.ts):
//   * object keys sorted recursively,
//   * separators "," and ":" (no spaces),
//   * UTF-8, non-ASCII characters unescaped,
//   * no trailing newline in the hashed form.
// Array order is preserved (changed_files order matters for the 3,000
// file truncation semantic). `undefined` values cannot be canonicalized
// and throw, exactly like the S0 copy.

/** Canonical JSON string for `value` (no trailing newline). */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((item) => canonicalJson(item)).join(",") + "]";
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    );
    return (
      "{" +
      entries
        .map(([key, item]) => JSON.stringify(key) + ":" + canonicalJson(item))
        .join(",") +
      "}"
    );
  }
  throw new Error(`cannot canonicalize value of type ${typeof value}`);
}
