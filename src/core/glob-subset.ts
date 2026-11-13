// T006 — Ordered Glob matching (formal).
//
// Formal version of the T002 PoC. The algorithm is unchanged from the
// S0-verified PoC (24/24 Oracle parity, 8/8 parser-trigger fixtures):
// changing it would risk the frozen semantics, so formalization here
// means freezing the contract below and documenting the edge cases the
// tests lock, not rewriting the matcher.
//
// Frozen supported subset (PROJECT_BOOK §3.3, §4.2; IMPLEMENTATION_PLAN §6 T002):
//   `*`  matches any run of characters except `/`
//   `**` matches any run of characters including `/`
//   `**/` matches zero or more whole directories
//   `?`  matches exactly one character except `/`
//   `[...]` simple character class (ranges allowed, leading `!` negates)
// Everything else is UNSUPPORTED and must surface as UNKNOWN, never silently
// degrade: `{a,b}` brace expansion, `(`, `)`, `\` escapes, POSIX `[[:...:]]`
// classes, `***`, and empty patterns.
//
// Ordered semantics: patterns are evaluated in order. A positive pattern that
// matches sets the result to true; a later `!` negative pattern that matches
// sets it back to false; a later positive pattern may re-include it.
// A trailing `/**` also matches the directory itself (e.g. `src/**`
// matches `src`), and a leading `**/` matches zero directories (e.g.
// `**/a.ts` matches `a.ts`).
//
// Notes locked by tests:
//   * `matchOrderedPatterns` reports unsupported patterns and SKIPS them
//     for matching; a non-empty `unsupported` list must be treated as
//     UNKNOWN by the caller — a list whose only patterns are unsupported
//     yields `matched: false` plus the unsupported report, never a
//     silent pass.
//   * An ignore list (`branches-ignore` / `paths-ignore`) is evaluated
//     with the same ordered matcher and its result inverted by the
//     caller; the matcher itself never knows about ignore lists.

export interface OrderedMatchResult {
  matched: boolean;
  /** Non-empty when at least one pattern used unsupported syntax. */
  unsupported: string[];
}

/** Convert one supported Glob pattern to a RegExp, or null when unsupported. */
export function globToRegExp(pattern: string): RegExp | null {
  if (pattern.length === 0) return null;
  let re = "^";
  let i = 0;
  const n = pattern.length;
  while (i < n) {
    const c = pattern[i] as string;
    // Trailing "/**" matches the directory itself as well as everything under it.
    if (c === "/" && pattern.slice(i) === "/**") {
      re += "(?:/.*)?";
      i += 3;
      continue;
    }
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "*") return null; // "***" is unsupported
        if (pattern[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        re += "[^/]*";
        i += 1;
      }
      continue;
    }
    if (c === "?") {
      re += "[^/]";
      i += 1;
      continue;
    }
    if (c === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close === -1) return null; // unclosed class is unsupported
      const body = pattern.slice(i + 1, close);
      if (body.length === 0) return null;
      if (body.includes("[:")) return null; // POSIX class, e.g. [[:alpha:]]
      if (body.includes("\\")) return null;
      const negated = body.startsWith("!");
      const cls = negated ? body.slice(1) : body;
      if (cls.length === 0) return null;
      re += "[" + (negated ? "^" : "") + cls + "]";
      i = close + 1;
      continue;
    }
    if (c === "{" || c === "}" || c === "(" || c === ")" || c === "\\") {
      return null; // brace expansion / extglob / escapes are unsupported
    }
    if ("^$.|+".includes(c)) re += "\\" + c;
    else re += c;
    i += 1;
  }
  re += "$";
  return new RegExp(re);
}

/** True when the pattern uses only the frozen supported subset. */
export function isSupportedGlob(pattern: string): boolean {
  return globToRegExp(pattern) !== null;
}

/**
 * Match a single pattern against a value.
 * Returns true/false, or null when the pattern syntax is unsupported.
 */
export function matchGlob(pattern: string, value: string): boolean | null {
  const re = globToRegExp(pattern);
  if (re === null) return null;
  return re.test(value);
}

/**
 * Evaluate an ordered pattern list against one value, preserving `!`
 * negation order. When any pattern is unsupported it is reported in
 * `unsupported` and skipped for matching; callers must treat a non-empty
 * `unsupported` list as UNKNOWN.
 */
export function matchOrderedPatterns(
  patterns: string[],
  value: string,
): OrderedMatchResult {
  let matched = false;
  const unsupported: string[] = [];
  for (const pattern of patterns) {
    const negated = pattern.startsWith("!");
    const raw = negated ? pattern.slice(1) : pattern;
    const hit = matchGlob(raw, value);
    if (hit === null) {
      unsupported.push(pattern);
      continue;
    }
    if (hit) matched = !negated;
  }
  return { matched, unsupported };
}
