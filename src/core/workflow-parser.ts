// T002 — Workflow YAML parsing + trigger evaluation (PoC).
//
// Parses a GitHub Actions workflow YAML and produces a normalized trigger IR,
// then evaluates it against one synthetic scenario (PROJECT_BOOK §4.2):
//   workflow_triggered = event_match AND activity_type_match
//                        AND branch_match AND path_match AND NOT commit_skip
//
// `on` key handling: the `yaml` package (YAML 1.2 core schema) keeps `on` a
// string key. The IR records `on_key_is_string` so a YAML 1.1 boolean
// misread (`on` -> `true`) can never pass silently.
//
// T006: the evaluation algorithm itself now lives in the formal module
// src/core/event-evaluator.ts (single home); the functions below
// (`evaluateTrigger`, `branchValueForEvent`, `hasCommitSkip`) are thin
// adapters that translate the loose PoC scenario shape into the formal
// ScenarioV1 shape and delegate. The parsing half of this file is
// unchanged, and its public API is unchanged, so the S0 tests and the
// e2e pipeline keep passing byte-for-byte.
//
// Status contract (fail-closed):
//   VALID   — every filter is inside the frozen supported subset.
//   INVALID — structurally invalid input (missing `on`, bad shape, or
//             `paths`+`paths-ignore` / `branches`+`branches-ignore` together).
//   UNKNOWN — input is well-formed but outside the supported subset
//             (unknown event, unknown filter key, unsupported Glob).
// For INVALID / UNKNOWN the evaluation fields are null and `triggered` is
// null; nothing is guessed.

import { parse, parseDocument, isAlias, isMap, isSeq, isScalar } from "yaml";
import { matchOrderedPatterns } from "./glob-subset.js";
import {
  evaluateTriggerEvents,
  branchValueForEvent as formalBranchValue,
  nullEvaluation,
  type TriggerEvaluation,
} from "./event-evaluator.js";
import { hasCommitSkip } from "./skip-annotation.js";
import type { EventName, ScenarioV1, WorkflowIREvent } from "./types.js";

export type { TriggerEvaluation };
export { hasCommitSkip };

export const TRIGGER_IR_SCHEMA = "checkpath.trigger-ir/v1" as const;

export type TriggerStatus = "VALID" | "INVALID" | "UNKNOWN";

export interface TriggerEventConfig {
  name: string;
  types: string[] | null;
  branches: string[] | null;
  branches_ignore: string[] | null;
  paths: string[] | null;
  paths_ignore: string[] | null;
}

export type { PathFileResult } from "./event-evaluator.js";

export interface TriggerIR {
  schema: typeof TRIGGER_IR_SCHEMA;
  fixture_id: string;
  on_key_is_string: boolean;
  status: TriggerStatus;
  events: TriggerEventConfig[];
  evaluation: TriggerEvaluation;
  errors: string[];
}

/** Minimal scenario shape consumed by this PoC (see PROJECT_BOOK §6.1). */
export interface TriggerScenario {
  event?: {
    name?: string;
    action?: string;
    branch?: string;
    base_branch?: string;
    head_branch?: string;
    target_branch?: string;
    commit_message?: string;
  };
  changed_files?: string[];
  /**
   * T004 (PROJECT_BOOK §4.3): GitHub diff-boundary metadata. Optional;
   * when absent, trigger evaluation behaves exactly as in T002.
   * `changed_files_total` falls back to `changed_files.length`.
   */
  diff?: {
    changed_files_total?: number | null;
    returned_files?: number | null;
    first_3000_confirmed?: boolean | null;
    diff_timed_out?: boolean | null;
    push_commit_count?: number | null;
  };
}

export const SUPPORTED_EVENTS = ["push", "pull_request", "merge_group"] as const;

/**
 * Adapt the loose PoC scenario shape to the formal ScenarioV1 shape.
 * Missing optional fields become null (or "" for commit_message, per
 * the T005 normalization); a missing `diff` block means "no boundary
 * metadata", exactly the T002 behavior. `changed_files_total` falls
 * back inside the formal evaluator, so it is passed through as null
 * when absent.
 */
export function triggerScenarioToScenarioV1(
  scenario: TriggerScenario,
  scenarioId = "poc",
): ScenarioV1 {
  const event = scenario.event ?? {};
  const diff = scenario.diff ?? {};
  const changedFiles = scenario.changed_files ?? [];
  return {
    schema: "checkpath.scenario/v1",
    scenario_id: scenarioId,
    event: {
      name: (event.name ?? "pull_request") as EventName,
      action: event.action ?? null,
      branch: event.branch ?? null,
      base_branch: event.base_branch ?? null,
      head_branch: event.head_branch ?? null,
      target_branch: event.target_branch ?? null,
      ref: null,
      commit_message: event.commit_message ?? "",
    },
    diff: {
      algorithm: event.name === "push" ? "two-dot" : "three-dot",
      changed_files: changedFiles,
      changed_files_total:
        typeof diff.changed_files_total === "number"
          ? diff.changed_files_total
          : null,
      returned_files:
        typeof diff.returned_files === "number" ? diff.returned_files : null,
      complete: null,
      first_3000_confirmed: diff.first_3000_confirmed ?? null,
      diff_timed_out: diff.diff_timed_out ?? null,
      push_commit_count:
        typeof diff.push_commit_count === "number"
          ? diff.push_commit_count
          : null,
    },
  };
}

/**
 * Adapt a parsed TriggerIR's events to the formal WorkflowIREvent
 * shape (identical fields; only the event name widens from string).
 */

function stringOrList(value: unknown): string[] | null | "INVALID" {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return [...(value as string[])];
  }
  return "INVALID";
}

/**
 * FIX-P0-04 (R5 grouped P0, X-empty-1 / X-filter-empty): detect a
 * mapping key that the Reference Oracle's PyYAML parser cannot
 * represent, so the TypeScript side can reject the document with the
 * same `yaml_parse_error` the Oracle returns instead of accepting it.
 *
 * Two shapes, both probed against PyYAML 6.0.1 and the `yaml` 2.9.1
 * AST before fixing (see handoff/P020-FIX-P0-04/TASK_REPORT.md §2):
 *
 * 1. A bare empty key: a PLAIN scalar key whose value is null and
 *    whose source range is empty — the YAML text at that position is
 *    just a `:` with nothing before it. The `yaml` parser accepts it
 *    (null key, rendered `""`); PyYAML fails the whole document at
 *    parse time (`expected <block end>, but found ':'`), before any
 *    Oracle code runs. This covers block and flow mappings, and every
 *    position in the document (event key, filter key, `jobs:` key,
 *    top-level key, nested job/step keys) — PyYAML fails the whole
 *    document, so the rule is whole-document too.
 * 2. A non-scalar, non-alias key: a collection key (explicit `?`
 *    inline forms such as `? push : {}` or `? [a, b] : 1`, a
 *    sequence/mapping key). The `yaml` package stringifies such keys
 *    into garbage event names; PyYAML rejects the document (parse
 *    error / unhashable key) before any Oracle code runs.
 * 3. FIX-P0-06 (N5): an alias key whose anchor resolves to a
 *    collection (`x: &a {b: c}` then `*a : 1`, block or flow, in any
 *    position). The `yaml` package resolves the alias and stringifies
 *    the collection into an event name; PyYAML rejects the unhashable
 *    dict key before any Oracle code runs. Resolution is one step via
 *    `Alias.resolve(doc)`: a scalar anchor (string / number / null —
 *    all probed, both sides agree) is left alone, and an
 *    unresolvable or forward-reference alias (resolve returns
 *    `undefined`) is left alone too — both sides already return
 *    `yaml_parse_error` for those through the plain `parse()` path,
 *    and a chained alias (`*b` where `&b *a`) likewise already fails
 *    identically on both sides, so no chain-following is needed.
 *
 * Deliberately NOT rejected (all probed, both sides already agree):
 * explicit null spellings as keys (`null:` / `Null:` / `NULL:` /
 * `~:` — PLAIN scalars with non-empty source, value null, rendered
 * `""` by both sides since FIX-P0-03), quoted empty keys (`''` /
 * `""` — quoted scalars, value `""`), the standard two-line
 * explicit-key form (`? push` newline `: {}` — a normal scalar key),
 * anchored scalar keys (`&k push:`), merge keys (`<<:`), and alias
 * keys (`*a : 1` in block style — both sides resolve the alias to
 * its scalar). This is a shape check on the parsed AST only: the
 * input text is never rewritten (PROJECT_BOOK §7.3, "read the raw
 * workflow YAML separately"), and the Oracle parser is untouched.
 */
export function hasUnrepresentableKey(yamlText: string): boolean {
  let doc;
  try {
    doc = parseDocument(yamlText);
  } catch {
    return false;
  }
  const walk = (node: unknown): boolean => {
    if (isMap(node)) {
      for (const pair of node.items) {
        const key = pair.key;
        if (isScalar(key)) {
          if (
            key.value === null &&
            key.type === "PLAIN" &&
            key.range !== undefined &&
            key.range !== null &&
            key.range[0] === key.range[1]
          ) {
            return true;
          }
        } else if (isAlias(key)) {
          // FIX-P0-06 (N5): an alias key that resolves to a
          // collection is unhashable for PyYAML, which rejects the
          // whole document; the `yaml` package would stringify it.
          let resolved: unknown;
          try {
            resolved = key.resolve(doc);
          } catch {
            resolved = undefined;
          }
          if (
            resolved !== undefined &&
            (isMap(resolved) || isSeq(resolved))
          ) {
            return true;
          }
        } else {
          // Collection key (Map / Seq): PyYAML cannot use it as a
          // dict key; the `yaml` package would stringify it.
          return true;
        }
        if (walk(pair.value)) return true;
      }
    } else if (isSeq(node)) {
      for (const item of node.items) {
        if (walk(item)) return true;
      }
    }
    return false;
  };
  return walk(doc.contents);
}

/**
 * FIX-P0-09 (R3, T013 R8 grouped P0): detect a flow-mapping key
 * PyYAML rejects, so the TypeScript side can reject the document
 * with the same `yaml_parse_error` the Oracle returns instead of
 * accepting it (or reporting a different error).
 *
 * Empirical rule (probed against PyYAML 6.0.1 and the `yaml` 2.9.1
 * parser, see handoff/P020-FIX-P0-09/TASK_REPORT.md §2 and
 * evidence/probes/fix-p0-09/cases.json): PyYAML rejects a
 * multi-line key in a flow mapping — the `yaml` package accepts
 * it. Two signals, same root cause:
 *
 * S1 — the key is a scalar (PLAIN, single- or double-quoted) whose
 *   source text spans a newline: `m: {"a\n b": 1}`,
 *   `m: {'a\n b': 1}`, `m: {a\n b: 1}`, nested flow maps, flow
 *   maps inside sequences, `on: {"a\n b": push}`, a flow key
 *   inside the `jobs:` mapping. As an extra key the TypeScript
 *   side says VALID where the Oracle says INVALID; as an `on:`
 *   value both sides say INVALID but with different error codes
 *   (`event_config_not_mapping` vs `yaml_parse_error`) and
 *   different `on_key_is_string` / jobs.
 *
 * FIX-P0-12 (R11 P0-B, T013 R11): S1's trigger was wider than its
 * empirical basis — the shapes above all carry a `:` separator and
 * a value, and the R11 mapping proved PyYAML accepts null-value
 * multi-line keys (no `:` separator, no value: `m: {a\n b}`,
 * `m: {"a\n b"}`, `m: {'a\n b'}`, `m: {a\n b, c: 1}`, nested,
 * `m: {a:#c\n 1}` where the `#` is inside the plain scalar key).
 * S1 now fires only when a `:` separator follows the key
 * (`colonSeparatorAfter`): a multi-line key with a colon — even
 * with a null value (`m: {a\n b: }`, which PyYAML rejects) — is
 * still rejected, so the R3 target stays closed; a multi-line key
 * without a colon is left alone. The Oracle is deliberately NOT
 * used to mask this: the Oracle must not reject valid YAML to
 * match an over-broad TypeScript rule.
 * S2 — the `:` separator after the key sits on a later line than
 *   the key ends: `m: {a\n : 1}`, `m: {"a"\n : push}` (quoted
 *   keys too), including a comment between the key and the colon
 *   (`{a # c\n : 1}`, `{a\n # c\n : 1}`). PyYAML rejects; the
 *   `yaml` package accepts when the colon is indented at least 1.
 *
 * Explicit keys are EXCLUDED from both signals: PyYAML accepts
 * `?` keys spanning lines (`m: {? "a\n b" : 1}`,
 * `m: {? a\n b : 1}`, `on: {? "a\n b" : push}` — all probed,
 * both sides agree). The `?` is found by scanning backwards from
 * the key over whitespace, newlines and comments; the first
 * structural character decides (`?` = explicit, `{` / `,` = an
 * ordinary pair). Comment detection is quote-aware: a `#` only
 * starts a comment outside a quoted scalar, and quoted-scalar
 * ranges come from the parsed AST, so a `#` inside a multi-line
 * quoted value (`"a\n b # not a comment"`) is never mistaken for
 * a comment start.
 *
 * Deliberately NOT rejected (all probed, both sides already agree):
 * single-line keys of any kind (plain, quoted, quoted with a tab
 * inside — V8); multi-line quoted scalar VALUES (`m: {"a":
 * "x\n y"}` — the RESID rule already covers the underindented
 * ones on the Oracle side, and the properly-indented ones both
 * accept); block-mapping keys (both sides already reject implicit
 * multi-line block keys through `parse()` itself, and both accept
 * explicit block keys `? "a\n b"\n: 1`); a value written on the
 * next line after the colon (`m: {a:\n 1}`); a key on the next
 * line after `{` (`m: {\n a: 1}`); a `:` on the next line at
 * indent 0 (`m: {a\n: 1}` — both sides already reject through
 * `parse()`). This is a shape check on the parsed AST plus
 * read-only scans of the input text: the input is never rewritten
 * (PROJECT_BOOK §7.3), and the Oracle parser is untouched.
 *
 * Known opposites, NOT fixed here (both are `parse()` rejections
 * on the TypeScript side, so no AST rule can fix them — they
 * would need Oracle-side rejection rules, a separate round):
 * R4, a comma on its own line at indent 0 in a flow map
 * (`m: {a\n, b: 1}` — TS INVALID vs Oracle VALID; indent >= 1
 * both accept); R5, an explicit key whose `:` is on the next
 * line at indent 0 (`m: {? a\n: 1}` — TS INVALID vs Oracle
 * VALID; indent >= 1 both accept). See the FIX-P0-09 report §7.
 */
export function hasMultilineFlowKey(yamlText: string): boolean {
  let doc;
  try {
    doc = parseDocument(yamlText);
  } catch {
    return false;
  }
  // Ranges of quoted scalars, used to decide whether a `#` starts a
  // comment: a `#` inside a quoted scalar is literal text.
  const quotedRanges: Array<[number, number]> = [];
  const collect = (node: unknown): void => {
    if (isScalar(node)) {
      if (
        (node.type === "QUOTE_DOUBLE" || node.type === "QUOTE_SINGLE") &&
        node.range !== undefined &&
        node.range !== null
      ) {
        quotedRanges.push([node.range[0], node.range[1]]);
      }
      return;
    }
    if (isMap(node)) {
      for (const pair of node.items) {
        collect(pair.key);
        collect(pair.value);
      }
    } else if (isSeq(node)) {
      for (const item of node.items) collect(item);
    }
  };
  collect(doc.contents);
  const insideQuoted = (pos: number): boolean =>
    quotedRanges.some(([start, end]) => pos >= start && pos < end);
  // A `#` starts a comment when it is outside any quoted scalar and
  // at the start of a line or preceded by whitespace.
  const isCommentStart = (pos: number): boolean => {
    if (yamlText[pos] !== "#") return false;
    if (insideQuoted(pos)) return false;
    if (pos === 0) return true;
    const prev = yamlText[pos - 1];
    return prev === " " || prev === "\t" || prev === "\n" || prev === "\r";
  };
  // Is position pos inside a comment? Scan its line from the start;
  // the first comment-start `#` at or before pos decides it. Returns
  // that `#`'s position, or -1 when pos is not inside a comment.
  const commentStartAtOrBefore = (pos: number): number => {
    const lineStart = yamlText.lastIndexOf("\n", pos - 1) + 1;
    for (let j = lineStart; j <= pos; j++) {
      if (isCommentStart(j)) return j;
    }
    return -1;
  };
  // Is the key starting at keyStart written with an explicit `?`
  // indicator? Scan backwards over whitespace, newlines and
  // comments; the first structural character decides: `?` means
  // explicit, `{` / `,` (or anything else) means an ordinary pair.
  const isExplicitKey = (keyStart: number): boolean => {
    let i = keyStart - 1;
    while (i >= 0) {
      const ch = yamlText[i];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        i--;
        continue;
      }
      const commentStart = commentStartAtOrBefore(i);
      if (commentStart !== -1) {
        // Inside a comment: resume scanning just before the `#`
        // that starts it — the `?` indicator may sit on the same
        // line, before the comment (`{? # why?\n "a\n b" : 1}`).
        i = commentStart - 1;
        continue;
      }
      return ch === "?";
    }
    return false;
  };
  // Does the `:` separator after the key (which ends at keyEnd) sit
  // on a later line? Scan forwards over whitespace, newlines and
  // comments; a newline crossed before the `:` means yes. Stop
  // with "no" on `,`, `}` or any other token (a pair without a
  // colon, e.g. `{a, b: 1}`, has no separator to check).
  const colonOnLaterLine = (keyEnd: number): boolean => {
    let i = keyEnd;
    let crossedNewline = false;
    const n = yamlText.length;
    while (i < n) {
      const ch = yamlText[i];
      if (ch === " " || ch === "\t") {
        i++;
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        crossedNewline = true;
        i++;
        continue;
      }
      if (ch === "#") {
        // Skip the comment to the end of its line.
        const eol = yamlText.indexOf("\n", i);
        if (eol === -1) return false;
        crossedNewline = true;
        i = eol + 1;
        continue;
      }
      return ch === ":" && crossedNewline;
    }
    return false;
  };
  // Does a `:` separator follow the key (which ends at keyEnd)?
  // Scan forwards over whitespace, newlines and comments; the first
  // structural character decides (`:` = yes; `,`, `}` or anything
  // else = no — a pair without a colon, e.g. `{a, b: 1}`, has no
  // separator). FIX-P0-12 (R11 P0-B): this is the S1 narrowing —
  // a multi-line key is only rejected when it bears a `:` (and
  // hence a value, possibly null); a null-value multi-line key
  // without a colon is accepted by both parsers and must be left
  // alone. A `:` found here also covers S2's later-line colon, so
  // the S2 signal is unchanged by the narrowing.
  const colonSeparatorAfter = (keyEnd: number): boolean => {
    let i = keyEnd;
    const n = yamlText.length;
    while (i < n) {
      const ch = yamlText[i];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        i++;
        continue;
      }
      if (ch === "#") {
        // Skip the comment to the end of its line.
        const eol = yamlText.indexOf("\n", i);
        if (eol === -1) return false;
        i = eol + 1;
        continue;
      }
      return ch === ":";
    }
    return false;
  };
  const walk = (node: unknown): boolean => {
    if (isMap(node)) {
      if (node.flow === true) {
        for (const pair of node.items) {
          const key = pair.key;
          if (
            isScalar(key) &&
            (key.type === "QUOTE_DOUBLE" ||
              key.type === "QUOTE_SINGLE" ||
              key.type === "PLAIN") &&
            key.range !== undefined &&
            key.range !== null &&
            !isExplicitKey(key.range[0]) &&
            (yamlText.slice(key.range[0], key.range[1]).includes("\n") ||
              colonOnLaterLine(key.range[1])) &&
            colonSeparatorAfter(key.range[1])
          ) {
            return true;
          }
        }
      }
      for (const pair of node.items) {
        if (walk(pair.key)) return true;
        if (walk(pair.value)) return true;
      }
    } else if (isSeq(node)) {
      for (const item of node.items) {
        if (walk(item)) return true;
      }
    }
    return false;
  };
  return walk(doc.contents);
}

/**
 * FIX-P0-19 (R18 P0): detect a mapping key that is an alias resolving
 * to a scalar which duplicates another key of the same mapping, so
 * the TypeScript side can reject the document with the same
 * `yaml_parse_error` the Oracle returns instead of accepting it.
 *
 * Root cause (probed against PyYAML 6.0.1 and the `yaml` 2.9.1 AST,
 * see evidence/probes/fix-p0-19/parser-probe-p19.py / .mjs / -p19b):
 * the Oracle's `_StrictBaseLoader.construct_mapping` (FIX-P0-02)
 * composes alias keys to their anchored nodes before the duplicate
 * check, so `m: {a: 1, *w}` (with `&w a: 1`) contains two
 * `ScalarNode('a')` keys and is rejected with
 * `duplicate mapping key: 'a'`. The `yaml` package's `uniqueKeys`
 * check (`compose/util-map-includes.js`) compares keys as
 * `a === b || (isScalar(a) && isScalar(b) && a.value === b.value)`
 * — an Alias node is never `===` to a Scalar and `isScalar(alias)`
 * is false, so alias keys are invisible to it: the same document
 * parses with 0 errors and the later null value silently overwrites
 * the earlier one (`{"a": null}`).
 *
 * The rule mirrors the Oracle's duplicate check exactly, using the
 * `yaml` package's own key equality on the resolved scalars:
 *   - an alias key's effective key is `Alias.resolve(doc)` when it
 *     yields a Scalar (absorbed aliases such as `*w:2` resolve the
 *     same way — the `yaml` package absorbs `:` into the anchor
 *     name, matching FIX-P0-17's `scan_anchor`); a plain scalar
 *     key's effective key is itself;
 *   - two effective keys collide when they are the same node or
 *     both Scalars with `===` values — so plain `1` vs `01`,
 *     `True` vs `true`, `~` vs `null`, and quoted `'a'` vs plain
 *     `a` collide exactly as the Oracle's `_duplicate_key_canonical`
 *     folds them, while `1` vs `'1'`, `True` vs `1`, and `!!str 1`
 *     vs `1` stay distinct, and `.nan` vs `.nan` never collides
 *     (`NaN !== NaN`, matching the Oracle's fresh-identity
 *     `("nan", object())`); see parser-probe-p19b.mjs B11–B18;
 *   - the rule fires only when at least one colliding pair's key
 *     is an alias: plain scalar-vs-scalar duplicates are already
 *     rejected by `parse()`'s `uniqueKeys`, and this rule fills
 *     exactly the alias gap (its contract is the gap, not a
 *     second duplicate check).
 *
 * Scope (all probed, both sides agree after the fix): flow mappings
 * in any position — a scalar key before or after the alias key, the
 * alias key twice, nested flow mappings, flow mappings inside
 * sequences, the `on:` mapping, an anchor defined inside the same
 * flow mapping (`m: {&w a: 1, *w}`), absorbed / triple-colon
 * aliases, and trailing comments. Block mappings need no new rule:
 * a block alias key is already rejected by `parse()` itself
 * ("Implicit map keys need to be followed by map values"), so the
 * uniform walk over all mappings is a no-op there.
 *
 * Deliberately NOT fired on (all probed, both sides already agree):
 * an alias key resolving to a collection (N5, owned by
 * `hasUnrepresentableKey`); an unresolvable / forward-reference
 * alias (`resolve` returns `undefined` — both sides already return
 * `yaml_parse_error` through the plain `parse()` path); a chained
 * alias (`*b` where `&b *a` — `resolve` returns the Alias node,
 * both sides already reject); a valued alias key
 * (`m: {*w: 1, a: 1}` — both sides reject, the `yaml` package at
 * parse time); an alias key whose resolved scalar differs from
 * every other key (`m: {b: 2, *w}`); an alias alone as a key
 * (`m: {*w}`); an alias in a value position (`b: *w`). This is a
 * shape check on the parsed AST only: the input text is never
 * rewritten (PROJECT_BOOK §7.3), and the Oracle parser is untouched.
 */
export function hasDuplicateAliasKey(yamlText: string): boolean {
  let doc;
  try {
    doc = parseDocument(yamlText);
  } catch {
    return false;
  }
  // The `yaml` package's own key equality (compose/util-map-includes.js):
  // same node, or two Scalars with `===` values (NaN never equals itself).
  const keyEquals = (a: unknown, b: unknown): boolean =>
    a === b || (isScalar(a) && isScalar(b) && a.value === b.value);
  // Effective key of a pair for duplicate purposes: a scalar key is
  // itself; an alias key is the Scalar it resolves to, or undefined
  // when it resolves to a collection / nothing (owned elsewhere).
  const effectiveKey = (key: unknown): unknown => {
    if (isAlias(key)) {
      let resolved: unknown;
      try {
        resolved = key.resolve(doc);
      } catch {
        return undefined;
      }
      return isScalar(resolved) ? resolved : undefined;
    }
    return isScalar(key) ? key : undefined;
  };
  const walk = (node: unknown): boolean => {
    if (isMap(node)) {
      const seen: Array<{ key: unknown; isAlias: boolean }> = [];
      for (const pair of node.items) {
        const eff = effectiveKey(pair.key);
        if (eff !== undefined) {
          const aliasKey = isAlias(pair.key);
          if (
            seen.some(
              (s) =>
                (aliasKey || s.isAlias) && keyEquals(s.key, eff),
            )
          ) {
            return true;
          }
          seen.push({ key: eff, isAlias: aliasKey });
        }
        if (walk(pair.value)) return true;
      }
    } else if (isSeq(node)) {
      for (const item of node.items) {
        if (walk(item)) return true;
      }
    }
    return false;
  };
  return walk(doc.contents);
}

/**
 * FIX-P0-06 (H6, tab family): detect a tab character that PyYAML's
 * scanner rejects, so the TypeScript side can reject the document
 * with the same `yaml_parse_error` the Oracle returns instead of
 * accepting it.
 *
 * Empirical rule (probed against PyYAML 6.0.1 and the `yaml` 2.9.1
 * parser, see handoff/P020-FIX-P0-06/TASK_REPORT.md §2 and
 * evidence/probes/fix-p0-06/cases.json): PyYAML rejects a tab
 * anywhere except inside a single/double-quoted scalar, inside a
 * block scalar's content, or inside a comment. That covers tabs
 * before/after a colon, after an alias, after a plain scalar, after
 * a comma / `{` / `-` / `?`, after an anchor/tag, and inside a plain
 * scalar — in both block and flow context. The `yaml` package
 * accepts tabs as separation in all those positions, so every one
 * of them was a TS-vs-Oracle divergence before this rule.
 *
 * Deliberately NOT rejected (all probed, both sides already agree):
 * tabs inside quoted scalars (`"a\tb"`, `'a\tb'`, including quoted
 * keys), tabs inside block scalar content (`run: |` + indented
 * lines), tabs inside comments (`# c\tomment`), and tab indentation
 * at line start (both sides already return `yaml_parse_error` — this
 * rule rejects it too, through the same error path, so the verdict
 * is unchanged). This is a read-only scan of the input text: the
 * input is never rewritten (PROJECT_BOOK §7.3), and the Oracle
 * parser is untouched.
 *
 * Approximations, documented honestly: block scalar content is
 * recognised by indentation relative to the header line, so a
 * misindented block scalar line is treated as ended (probed in the
 * fix-p0-06 matrix, see §7 there); comment lines are transparent to
 * plain-scalar continuation — after a comment line breaks a plain
 * scalar, any more-indented line is an error in PyYAML, so
 * rejecting a tab on it matches the Oracle (probed in the
 * fix-p0-07 matrix: COMMENT-THEN-CONT-QUOTE-TAB,
 * TRAILING-COMMENT-THEN-CONT, BLANK-THEN-CONT-QUOTE-TAB); anchor /
 * tag / alias names are consumed as `[A-Za-z0-9_./-]+`, which
 * covers every realistic property name.
 *
 * FIX-P0-07 (R6 P0): a quote starts a quoted scalar only where a
 * scalar can start — never while a plain scalar is in progress.
 * `run: echo "a\tb"` is a plain scalar (`echo ...`) whose `"` is a
 * literal character, so the tab is a tab inside a plain scalar and
 * PyYAML rejects it; the old token-boundary-only rule treated the
 * quote as a quote start and let the tab through (TS VALID vs
 * Oracle INVALID). The plain-scalar state below is therefore
 * tracked across lines: a plain scalar continues on a more-indented
 * line (blank lines fold, comment lines are transparent), inside a
 * flow collection newlines are folding whitespace, and a value
 * written on the line after a bare `key:` belongs to that key's
 * block context. A quote closes a complete node, so after it closes
 * no plain scalar is in progress. The `:` separator rule follows
 * YAML: in block context `:` separates only when followed by a
 * space/tab/EOL (`key:"b"` and `a:[1]` are single plain scalars);
 * in flow context it also separates before a flow indicator
 * (`{a:[1]}` is `a` → `[1]`, while `{a:1}` is the scalar `a:1`).
 * Flow indicators `,[]{} ` end a plain scalar only inside a flow
 * collection and are literal characters inside a block-context
 * plain scalar (`key: a[b` is one scalar). See
 * handoff/P020-FIX-P0-07/TASK_REPORT.md §2 and
 * evidence/probes/fix-p0-07/cases.json.
 */
export function hasRejectedTab(yamlText: string): boolean {
  const lines = yamlText.split("\n");
  let quote: "'" | '"' | null = null;
  let blockIndent: number | null = null;
  let flowDepth = 0;
  // FIX-P0-07: plain-scalar tracking (see the docstring above). A
  // quote only starts a quoted scalar while no plain scalar is in
  // progress; `plain` persists across lines because a plain scalar
  // may continue on a more-indented line.
  let plain = false;
  let plainIndent = 0;
  // Indent of the most recent line ending with a bare `key:` (a
  // mapping key with an empty value): a plain scalar value written
  // on the next line belongs to that key's block context, so its
  // continuation threshold is the key's indent, not its own line's
  // (`name:\n  some long\n "a\tb" tail` — the continuation at
  // indent 1 is still inside the scalar).
  let bareKeyIndent: number | null = null;
  for (const rawLine of lines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (blockIndent !== null) {
      if (/^[ \t]*$/.test(line)) continue;
      if (line.startsWith("\t")) return true;
      const indent = line.match(/^ */)?.[0].length ?? 0;
      if (indent > blockIndent) continue;
      blockIndent = null;
    }
    const lineIndent = line.match(/^ */)?.[0].length ?? 0;
    // A plain scalar in progress may continue on the next line:
    // inside a flow collection newlines are folding whitespace
    // (any indent continues); in block context the next line must
    // be more indented than the scalar's block context. Blank lines
    // fold and comment lines are transparent, so neither ends it.
    // Otherwise the scalar ended at the previous line end.
    if (plain) {
      if (flowDepth > 0) {
        // continuation regardless of indent
      } else if (/^[ \t]*$/.test(line)) {
        // blank line: folds, scalar stays in progress (the
        // character scan below still rejects a tab on the line)
      } else if (lineIndent > plainIndent) {
        // continuation: plain stays true
      } else {
        plain = false;
      }
    }
    let pendingBlock: number | null = null;
    let inProp = false; // inside an anchor/tag/alias name (&x, !t, *x)
    let lineHasContent = false;
    let lastSig: string | null = null;
    let i = 0;
    const n = line.length;
    const startPlain = (firstContent: boolean): void => {
      if (plain) return;
      plain = true;
      // A scalar that starts as the first content of a line after a
      // bare `key:` line belongs to that key's block context.
      // (Callers pass `!lineHasContent` captured BEFORE they mark
      // the current character as content.)
      plainIndent =
        firstContent &&
        bareKeyIndent !== null &&
        lineIndent > bareKeyIndent
          ? bareKeyIndent
          : lineIndent;
    };
    while (i < n) {
      const ch = line[i];
      if (quote === "'") {
        if (ch === "'") {
          if (line[i + 1] === "'") {
            i += 2;
            continue;
          }
          quote = null;
          plain = false; // a quoted scalar is a complete node
          lastSig = ch;
        }
        i++;
        continue;
      }
      if (quote === '"') {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === '"') {
          quote = null;
          plain = false; // a quoted scalar is a complete node
          lastSig = ch;
        }
        i++;
        continue;
      }
      if (inProp) {
        if (/[A-Za-z0-9_./-]/.test(ch)) {
          i++;
          continue;
        }
        inProp = false;
        // fall through: process ch normally
      }
      if (ch === "#") {
        // A comment starts only at a token boundary (start of line
        // or after a space); otherwise `#` is part of a plain scalar.
        // A tab before the `#` is rejected above, at the tab itself.
        if (i === 0 || line[i - 1] === " ") break;
        const first = !lineHasContent;
        lineHasContent = true;
        lastSig = ch;
        startPlain(first);
        i++;
        continue;
      }
      if (ch === "\t") return true;
      if (ch === "'" || ch === '"') {
        if (!plain && isQuoteStart(line, i)) {
          quote = ch;
          lineHasContent = true;
          lastSig = ch;
          i++;
          continue;
        }
        // Literal quote inside a plain scalar (or starting one).
        const first = !lineHasContent;
        lineHasContent = true;
        lastSig = ch;
        startPlain(first);
        i++;
        continue;
      }
      if (ch === ":") {
        const next = line[i + 1];
        const isSep =
          next === undefined ||
          next === " " ||
          next === "\t" ||
          (flowDepth > 0 &&
            (next === "," ||
              next === "[" ||
              next === "]" ||
              next === "{" ||
              next === "}"));
        const first = !lineHasContent;
        lineHasContent = true;
        lastSig = ch;
        if (isSep) plain = false;
        else startPlain(first);
        i++;
        continue;
      }
      if (ch === "," || ch === "]" || ch === "}") {
        lineHasContent = true;
        lastSig = ch;
        if (flowDepth > 0) {
          plain = false;
          if (ch !== ",") flowDepth = Math.max(0, flowDepth - 1);
        }
        // In block context a `,`/`]`/`}` inside a plain scalar is
        // literal (plain stays true); a stray closer outside flow
        // leaves plain false.
        i++;
        continue;
      }
      if (ch === "[" || ch === "{") {
        lineHasContent = true;
        lastSig = ch;
        if (!plain) flowDepth++;
        // Inside a plain scalar (block context) the char is literal.
        i++;
        continue;
      }
      if (ch === "-" || ch === "?") {
        const next = line[i + 1];
        const afterSep =
          next === undefined || next === " " || next === "\t";
        const prevOk =
          !lineHasContent ||
          (lastSig !== null &&
            [":", ",", "[", "{", "?", "-", "&", "!", "*"].includes(
              lastSig,
            ));
        const first = !lineHasContent;
        lineHasContent = true;
        lastSig = ch;
        if (!plain && afterSep && prevOk) {
          // Sequence-item / explicit-key indicator: no scalar starts.
        } else {
          startPlain(first);
        }
        i++;
        continue;
      }
      if (ch === "&" || ch === "!" || ch === "*") {
        lineHasContent = true;
        lastSig = ch;
        if (!plain) inProp = true;
        // Inside a plain scalar the char is literal.
        i++;
        continue;
      }
      if (
        (ch === "|" || ch === ">") &&
        flowDepth === 0 &&
        pendingBlock === null
      ) {
        const hdr = blockScalarHeaderIndent(line, i);
        if (hdr !== null) {
          pendingBlock = hdr;
          lineHasContent = true;
          lastSig = ch;
          i++;
          continue;
        }
        // Not a header: literal char (starts/continues a plain scalar).
      }
      if (ch === " ") {
        i++;
        continue;
      }
      // Any other character starts or continues a plain scalar.
      const first = !lineHasContent;
      lineHasContent = true;
      lastSig = ch;
      startPlain(first);
      i++;
    }
    if (pendingBlock !== null) blockIndent = pendingBlock;
    // A line ending with a bare `key:` (empty value) sets the block
    // context for a value written on the next line; any other line
    // with significant content clears it. Blank / comment-only
    // lines leave it unchanged.
    if (lastSig !== null && quote === null && flowDepth === 0) {
      bareKeyIndent = lastSig === ":" ? lineIndent : null;
    }
  }
  return false;
}

/** A quote starts a quoted scalar only at a token boundary. */
function isQuoteStart(line: string, i: number): boolean {
  if (i === 0) return true;
  const prev = line[i - 1];
  return prev === " " || prev === "[" || prev === "{" || prev === ",";
}

/**
 * If the `|` / `>` at position `i` is a block scalar header, return
 * the content-indent threshold (a content line must be indented more
 * than this); otherwise return null. A header is recognised only in
 * block context, in value position (after a `:` key or as a bare
 * sequence item), with only chomping/indent indicators and an
 * optional comment after it. A `- ` sequence entry introducing a
 * mapping (`- run: |`) needs content more indented than the mapping
 * (line indent + 2); a bare item (`- |`) or a plain key (`run: |`)
 * needs content more indented than the line itself.
 */
function blockScalarHeaderIndent(line: string, i: number): number | null {
  const indent = line.match(/^ */)?.[0].length ?? 0;
  const afterIndent = line.slice(indent);
  // Text between the indentation and the `|`/`>`, trailing spaces
  // removed: exactly `-` means a bare sequence item (`- |`).
  const beforeHeader = line.slice(indent, i).trimEnd();
  const isBareSeqItem = beforeHeader === "-";
  if (!line.slice(0, i).trimEnd().endsWith(":") && !isBareSeqItem) return null;
  const rest = line.slice(i + 1);
  if (!/^[+-]?[0-9]?[+-]?\s*(#.*)?$/.test(rest)) return null;
  if (afterIndent.startsWith("- ") && afterIndent.slice(2).includes(":")) {
    return indent + 2;
  }
  return indent;
}

/**
 * FIX-P0-12 (R11 P0-A, T013 R11): detect an anchor, alias or tag
 * PyYAML's scanner rejects, so the TypeScript side can reject the
 * document with the same `yaml_parse_error` the Oracle returns
 * instead of accepting it.
 *
 * Empirical rule (probed against PyYAML 6.0.1 and the `yaml` 2.9.1
 * parser, and end-to-end through the real TS bundle vs the Oracle
 * drivers; see handoff/P020-FIX-P0-12/TASK_REPORT.md §2 and
 * evidence/probes/fix-p0-12/cases.json): the `yaml` package accepts
 * anchor/tag names the PyYAML scanner does not, in every position
 * (flow map / flow sequence / block value / block key / block
 * sequence item / `on:` slot / EOF / CRLF). The check replicates
 * PyYAML's `scan_anchor` / `scan_tag` token rules exactly:
 *
 * Anchors and aliases (`&name`, `*name`): PyYAML reads a name of
 * `[0-9A-Za-z_-]*` and then requires the next character to be
 * NUL / whitespace / `?` / `:` / `,` / `]` / `}` / `%` / `@` /
 * backtick — anything else after the name is a scanner error
 * ("while scanning an anchor/alias"). The `yaml` package instead
 * swallows the extra characters into the name (`&x#c` parses as
 * anchor `x#c`, `&x.y` as anchor `x.y`), so it accepts. Covered
 * here: `#` (the R11 core: `&x#c`, `&x#`, `&x##c`, `&x# c`),
 * `.` / `/` / `;` / `+` / `<` and the other name-extending
 * characters, and the property indicators `!` / `*` / `|` / `>` /
 * quotes / `[` / `{` / `&` right after a name. An empty name
 * (`&#c`, `& 1`) is rejected too (PyYAML "expected alphabetic or
 * numeric character"). `%` / `@` / backtick are in PyYAML's
 * post-name set but cannot start any token, so the scanner fails
 * on the next token instead — also rejected here. A tab after a
 * name is NOT rejected here: it is already rejected by
 * `hasRejectedTab` (FIX-P0-06), which owns all tab rejections.
 *
 * `:` and `?` after an anchor name are special: PyYAML's scanner
 * allows them, but its parser rejects a stray `:` / `?` with no
 * node — except on an implicit mapping key, where the anchor
 * marks an (empty) key and both sides accept (`{&x: 1}`,
 * `{a: 1, &x: 2}`, `- &x: 1`, `m:\n  &x: 1`, `&x: 1` at the
 * document root). So `:` after an anchor is rejected unless the
 * anchor sits in implicit-key position: in flow, the previous
 * significant character is `{`, `,` or `[`; in block, the anchor
 * is at line start (a nested or root key — the previous line's
 * `:` opens the nested mapping) or follows a `-` sequence
 * indicator. `?` after an anchor is rejected unconditionally
 * (an explicit key with only an anchor and no node is rejected
 * everywhere: `? &x? 1`, `{&x? 1}`, `[&x? 1]`). The one shape
 * this misses is an explicit key split across lines
 * (`?\n  &x: 1` — the anchor is at line start, so the scan reads
 * it as an implicit key); it is disclosed in the report §7.
 *
 * Tags (`!tag`, `!!tag`, `!<tag:...>`): PyYAML scans a tag per
 * `scan_tag` — a verbatim tag scans URI characters to `>`, a
 * shorthand tag scans a `!handle!` (or a bare `!`) plus a URI
 * suffix (`[0-9A-Za-z]` and `-;/?:@&=+$,_.!~*'()[]%`, with
 * `%XX` escapes), and the character after the tag must then be
 * whitespace or end-of-line. The `yaml` package accepts tags
 * PyYAML rejects: a `#` right after the tag (`!!str#c`,
 * `!foo#c`, `!#c`, `!<tag:x>#c` — `#` is not a URI character,
 * so PyYAML's suffix stops there and the post-tag check fails),
 * a `#` inside a verbatim tag (`!<tag:x#frag>` — the URI scan
 * stops at `#` and never reaches `>`), and a tag followed by
 * `,` / `}` / `]` / `[` / `{` / `|` / `>` / `"` / `!` with no
 * node. A tag whose suffix legitimately contains `:`, `?`,
 * `&`, `*`, `'`, `/` or `[`/`]` (`!foo:bar`, `!foo?`,
 * `!foo[bar]`) is NOT rejected here: those are URI characters,
 * PyYAML's suffix consumes them, and the Oracle's BaseLoader
 * accepts the resulting tag — both sides already agree. Unknown
 * tags in general (`!foo 1`, `!<tag:x> 1`) are accepted by both
 * sides (the Oracle's BaseLoader falls back to constructing the
 * scalar) and are not touched.
 *
 * Deliberately NOT rejected (all probed, both sides already
 * agree): an anchor/tag followed by a space and a comment
 * (`&x #c`, `!!str #c`); `#` inside a quoted scalar
 * (`"&x#c"`) or a plain scalar (`b&x#c`, `x#y`); `&` / `!` /
 * `*` inside a plain scalar, a quoted scalar, a block scalar
 * or a comment; an anchor/tag followed by a space, `,`, `]` or
 * `}` (`&x, …`, `[&x]`, `{a: &x}`, `!foo, …` is rejected by
 * PyYAML — see above — but `&x, …` is accepted); an anchor on
 * an implicit key followed by `:` (see above); a bare `!` tag
 * followed by a space (`! 1`); a verbatim tag without a `#`
 * (`!<tag:x> 1`); aliases (`*x#c` — the `yaml` package reads
 * the alias name with the `#` and then fails to resolve it, so
 * both sides already reject; an alias in key position behaves
 * like an anchor). This is a read-only scan of the input text:
 * the input is never rewritten (PROJECT_BOOK §7.3), and the
 * Oracle parser is untouched. The scan mirrors
 * `hasRejectedTab`'s state machine (quote / block-scalar /
 * plain-scalar / flow tracking) so a `&` / `!` inside a scalar
 * is never mistaken for a property.
 */
export function hasRejectedAnchorOrTag(yamlText: string): boolean {
  const lines = yamlText.split("\n");
  let quote: "'" | '"' | null = null;
  let blockIndent: number | null = null;
  let flowDepth = 0;
  let plain = false;
  let plainIndent = 0;
  let bareKeyIndent: number | null = null;
  // Last significant character seen (outside quotes, block-scalar
  // content and comments), and the line it was on. Decides whether
  // an anchor followed by `:` sits in implicit-key position.
  let prevSig: string | null = null;
  let prevSigLine = -1;
  // Whether the most recent significant token was an anchor/tag/
  // alias property: a `:` after an anchor that follows another
  // property is in value position (E05: `!!str &x: 1`).
  let prevProp = false;

  // A URI character in a PyYAML tag suffix (scan_tag_uri): ASCII
  // alphanumerics and `-;/?:@&=+$,_.!~*'()[]` (`%` is handled
  // separately as a `%XX` escape; `#` is NOT a URI character).
  const isTagUriChar = (c: string): boolean =>
    (c >= "0" && c <= "9") ||
    (c >= "A" && c <= "Z") ||
    (c >= "a" && c <= "z") ||
    "-;/?:@&=+$,_.!~*'()[]".includes(c);
  // A character allowed right after a tag (PyYAML scan_tag's final
  // check: NUL / space / CR / LF / NEL / LS / PS; tab is counted
  // as allowed here because hasRejectedTab owns all tab
  // rejections and fires on a tab after a tag).
  const isTagAfterChar = (c: string): boolean =>
    c === "\0" ||
    c === " " ||
    c === "\t" ||
    c === "\r" ||
    c === "\x85" ||
    c === "\u2028" ||
    c === "\u2029";
  // A character allowed right after an anchor/alias name other
  // than `:` / `?` (handled separately below) — PyYAML
  // scan_anchor's post-name set minus the three characters that
  // cannot start a token (`%`, `@`, backtick: PyYAML fails on the
  // next token instead, so they are rejected here too).
  const isAnchorAfterChar = (c: string): boolean =>
    c === "\0" ||
    c === " " ||
    c === "\t" ||
    c === "\r" ||
    c === "\x85" ||
    c === "\u2028" ||
    c === "\u2029" ||
    c === "," ||
    c === "]" ||
    c === "}";

  // Check the anchor/alias/tag property starting at line[start]
  // (`&`, `!` or `*`). Returns true when PyYAML rejects the
  // property (the caller rejects the document), otherwise the
  // index just past the property. `lineIdx` is the current line,
  // for the anchor `:` key-position decision.
  const checkProperty = (
    line: string,
    start: number,
    lineIdx: number,
  ): true | number => {
    const n = line.length;
    const indicator = line[start];
    if (indicator === "&" || indicator === "*") {
      // Anchor / alias: name is [0-9A-Za-z_-]* (PyYAML
      // scan_anchor); the `yaml` package swallows more characters
      // into the name, so anything else right after the PyYAML
      // name is a divergence.
      let j = start + 1;
      while (j < n && /[0-9A-Za-z_-]/.test(line[j])) j++;
      if (j === start + 1) return true; // empty name
      const next = j < n ? line[j] : "\0";
      if (next === "?") return true; // stray `?`: rejected everywhere
      if (next === ":") {
        // Stray `:` with no node — rejected, except on an implicit
        // mapping key, where the anchor marks an (empty) key.
        const keyPos =
          flowDepth > 0
            ? ["{", ",", "["].includes(prevSig ?? "")
            : !prevProp &&
              prevSig !== "?" &&
              !(prevSig === ":" && prevSigLine === lineIdx);
        // keyPos is true only when the anchor is in implicit-key
        // position; in block that means it is NOT preceded on its
        // own line by `:` (a value) and NOT preceded by `?` (an
        // explicit key, any line). Note prevSig === ":" on a
        // previous line opens a nested mapping, i.e. key position.
        if (!keyPos) return true;
        return j;
      }
      if (!isAnchorAfterChar(next)) return true;
      return j;
    }
    // Tag: `!` + verbatim / bare / shorthand.
    const after = start + 1 < n ? line[start + 1] : "\0";
    if (after === "<") {
      // Verbatim tag: URI characters to `>`.
      let j = start + 2;
      while (j < n) {
        const c = line[j];
        if (c === "%") {
          if (!/[0-9A-Fa-f]{2}/.test(line.slice(j + 1, j + 3))) {
            return true;
          }
          j += 3;
          continue;
        }
        if (isTagUriChar(c)) {
          j++;
          continue;
        }
        break;
      }
      if (j >= n || line[j] !== ">") return true; // `#` inside, or missing `>`
      const afterGt = j + 1 < n ? line[j + 1] : "\0";
      if (!isTagAfterChar(afterGt)) return true;
      return j + 1;
    }
    if (isTagAfterChar(after)) return start + 1; // bare `!` tag
    // Shorthand: look ahead for a second `!` (handle form).
    let k = start + 1;
    let useHandle = false;
    while (k < n) {
      const c = line[k];
      if (c === " " || c === "\t" || c === "\r" || c === "\x85" || c === "\u2028" || c === "\u2029") break;
      if (c === "!") {
        useHandle = true;
        break;
      }
      k++;
    }
    let j = start + 1;
    if (useHandle) {
      while (j < n && /[0-9A-Za-z_-]/.test(line[j])) j++;
      if (j >= n || line[j] !== "!") return true; // handle without closing `!`
      j++;
    }
    // Suffix: URI characters (with `%XX` escapes).
    const suffixStart = j;
    while (j < n) {
      const c = line[j];
      if (c === "%") {
        if (!/[0-9A-Fa-f]{2}/.test(line.slice(j + 1, j + 3))) {
          return true;
        }
        j += 3;
        continue;
      }
      if (isTagUriChar(c)) {
        j++;
        continue;
      }
      break;
    }
    if (j === suffixStart) return true; // empty suffix: PyYAML "expected URI"
    const afterTag = j < n ? line[j] : "\0";
    if (!isTagAfterChar(afterTag)) return true;
    return j;
  };

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (blockIndent !== null) {
      if (/^[ \t]*$/.test(line)) continue;
      if (line.startsWith("\t")) {
        // A tab inside block-scalar content: hasRejectedTab's
        // rule, not this one; do not end the block here.
        continue;
      }
      const indent = line.match(/^ */)?.[0].length ?? 0;
      if (indent > blockIndent) continue;
      blockIndent = null;
    }
    const lineIndent = line.match(/^ */)?.[0].length ?? 0;
    // A plain scalar in progress may continue on the next line:
    // inside a flow collection newlines are folding whitespace
    // (any indent continues); in block context the next line must
    // be more indented than the scalar's block context. Blank
    // lines fold; comment lines are transparent (handled below,
    // they never reach this branch as content). Otherwise the
    // scalar ended at the previous line end.
    if (plain) {
      if (flowDepth > 0) {
        // continuation regardless of indent
      } else if (/^[ \t]*$/.test(line)) {
        // blank line: folds, scalar stays in progress
      } else if (lineIndent > plainIndent) {
        // continuation: plain stays true
      } else {
        plain = false;
      }
    }
    let pendingBlock: number | null = null;
    let lineHasContent = false;
    let lastSig: string | null = null;
    let i = 0;
    const n = line.length;
    // Record a significant character (outside quotes, block-scalar
    // content and comments): it becomes the previous-significant
    // character for the next anchor/tag decision, and it ends any
    // property chain.
    const noteSig = (ch: string): void => {
      prevSig = ch;
      prevSigLine = lineIdx;
      lastSig = ch;
      lineHasContent = true;
      prevProp = false;
    };
    const startPlain = (firstContent: boolean): void => {
      if (plain) return;
      plain = true;
      plainIndent =
        firstContent &&
        bareKeyIndent !== null &&
        lineIndent > bareKeyIndent
          ? bareKeyIndent
          : lineIndent;
    };
    while (i < n) {
      const ch = line[i];
      if (quote === "'") {
        if (ch === "'") {
          if (line[i + 1] === "'") {
            i += 2;
            continue;
          }
          quote = null;
          plain = false; // a quoted scalar is a complete node
          noteSig(ch);
        }
        i++;
        continue;
      }
      if (quote === '"') {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === '"') {
          quote = null;
          plain = false; // a quoted scalar is a complete node
          noteSig(ch);
        }
        i++;
        continue;
      }
      if (ch === "#") {
        // A comment starts only at a token boundary (start of line
        // or after a space); otherwise `#` is part of a plain
        // scalar.
        if (i === 0 || line[i - 1] === " ") break;
        const first = !lineHasContent;
        lineHasContent = true;
        noteSig(ch);
        startPlain(first);
        i++;
        continue;
      }
      if (ch === "\t") {
        // Tabs belong to hasRejectedTab; skip them here.
        i++;
        continue;
      }
      if (ch === "'" || ch === '"') {
        if (!plain && isQuoteStart(line, i)) {
          quote = ch;
          noteSig(ch);
          i++;
          continue;
        }
        // Literal quote inside a plain scalar (or starting one).
        const first = !lineHasContent;
        lineHasContent = true;
        noteSig(ch);
        startPlain(first);
        i++;
        continue;
      }
      if (ch === ":") {
        const next = line[i + 1];
        const isSep =
          next === undefined ||
          next === " " ||
          next === "\t" ||
          (flowDepth > 0 &&
            (next === "," ||
              next === "[" ||
              next === "]" ||
              next === "{" ||
              next === "}"));
        const first = !lineHasContent;
        lineHasContent = true;
        noteSig(ch);
        if (isSep) plain = false;
        else startPlain(first);
        i++;
        continue;
      }
      if (ch === "," || ch === "]" || ch === "}") {
        lineHasContent = true;
        noteSig(ch);
        if (flowDepth > 0) {
          plain = false;
          if (ch !== ",") flowDepth = Math.max(0, flowDepth - 1);
        }
        // In block context a `,`/`]`/`}` inside a plain scalar is
        // literal (plain stays true); a stray closer outside flow
        // leaves plain false.
        i++;
        continue;
      }
      if (ch === "[" || ch === "{") {
        lineHasContent = true;
        noteSig(ch);
        if (!plain) flowDepth++;
        // Inside a plain scalar (block context) the char is literal.
        i++;
        continue;
      }
      if (ch === "-" || ch === "?") {
        const next = line[i + 1];
        const afterSep =
          next === undefined || next === " " || next === "\t";
        const prevOk =
          !lineHasContent ||
          (lastSig !== null &&
            [":", ",", "[", "{", "?", "-", "&", "!", "*"].includes(
              lastSig,
            ));
        const first = !lineHasContent;
        lineHasContent = true;
        noteSig(ch);
        if (!plain && afterSep && prevOk) {
          // Sequence-item / explicit-key indicator: no scalar starts.
        } else {
          startPlain(first);
        }
        i++;
        continue;
      }
      if (ch === "&" || ch === "!" || ch === "*") {
        if (!plain) {
          // Property position: check the anchor/tag/alias.
          const res = checkProperty(line, i, lineIdx);
          if (res === true) return true;
          // The property is the most recent significant token.
          i = res;
          prevSig = line[i - 1] ?? null;
          prevSigLine = lineIdx;
          lastSig = prevSig;
          lineHasContent = true;
          prevProp = true;
          continue;
        }
        // Inside a plain scalar the char is literal.
        const first = !lineHasContent;
        lineHasContent = true;
        noteSig(ch);
        startPlain(first);
        i++;
        continue;
      }
      if (
        (ch === "|" || ch === ">") &&
        flowDepth === 0 &&
        pendingBlock === null
      ) {
        const hdr = blockScalarHeaderIndent(line, i);
        if (hdr !== null) {
          pendingBlock = hdr;
          lineHasContent = true;
          noteSig(ch);
          i++;
          continue;
        }
        // Not a header: literal char (starts/continues a plain scalar).
      }
      if (ch === " ") {
        i++;
        continue;
      }
      // Any other character starts or continues a plain scalar.
      const first = !lineHasContent;
      lineHasContent = true;
      noteSig(ch);
      startPlain(first);
      i++;
    }
    if (pendingBlock !== null) blockIndent = pendingBlock;
    // A line ending with a bare `key:` (empty value) sets the block
    // context for a value written on the next line; any other line
    // with significant content clears it. Blank / comment-only
    // lines leave it unchanged.
    if (lastSig !== null && quote === null && flowDepth === 0) {
      bareKeyIndent = lastSig === ":" ? lineIndent : null;
    }
  }
  return false;
}

/**
 * FIX-P0-13 (P0-C1, T013 R12 grouped P0): detect a tag whose suffix
 * swallows a flow-mapping `,`, so the TypeScript side can reject the
 * document with the same `yaml_parse_error` the Oracle returns
 * instead of accepting it.
 *
 * PyYAML's `scan_tag_uri` treats `,` as a URI character, so it
 * consumes a flow `,` into the tag suffix (`!foo,` — the suffix
 * scan eats the comma) and the parser then fails in a flow mapping
 * ("while parsing a flow mapping", `m: {a: !foo, b: 1}`); the
 * `yaml` package stops the tag at `,` and parses on, so it says
 * VALID where the Oracle says INVALID. The block half of the same
 * family (`a: !foo,` + next pair — the `yaml` package rejects,
 * PyYAML accepts) is closed on the Oracle side instead
 * (`_reject_tag_suffix_comma` in `oracle/checkpath_oracle/parser.py`,
 * which rejects a tag suffix ending with `,` outside a flow
 * sequence); this function closes the flow-mapping half, and the
 * two rules together also close the both-accept shapes where the
 * following node is not a pair key (`m: {a: !foo, 1}`,
 * `m: {a: !foo, [1, 2]}` — the two sides parse different
 * structures, invisible in the `m:` slot but a real divergence in
 * the `on:` / `jobs:` slots), because both sides reject them after
 * the fix.
 *
 * Threshold rule, derived by probing the `yaml` package and PyYAML
 * over a 38-shape + 22-shape parallel mapping (see
 * evidence/probes/fix-p0-13/map-p0-13.py and map2-p0-13.py): two
 * dimensions decide, and only two —
 *
 * * the tag's raw suffix must END with `,` (`!foo,` triggers;
 *   `!foo,bar` does not — the `,` is mid-suffix and both sides
 *   accept; `!foo ,` does not — the space ends the tag first;
 *   `!foo%2C,` triggers — the escaped comma is consumed as part
 *   of the suffix and a literal `,` follows; `!foo%2C` does not —
 *   only an escaped comma, no literal one; a bare `!` followed by
 *   `,` triggers, the suffix is just `,`). The suffix is scanned
 *   the same way `hasRejectedAnchorOrTag` scans it (URI characters
 *   with `%XX` escapes, handle form `!h!suffix`, verbatim
 *   `!<...>`), so the decision is made on the text as written.
 * * the innermost flow collection must be a MAPPING: `{` triggers,
 *   `[` does not (`[!foo, a: 1]`, `[!foo, 1]` are accepted by both
 *   sides and must stay that way; a flow map nested in a sequence
 *   DOES trigger, so the scan keeps a flow-KIND stack, not just a
 *   depth count). Block context never triggers here — the Oracle
 *   rule owns that half.
 *
 * Deliberately NOT rejected (all probed, both sides already agree):
 * a tag-comma in a flow sequence; a comma mid-suffix; a space
 * before the comma; a `,` after a verbatim tag (`!<tag:x>,` — the
 * `yaml` package and PyYAML both reject it already, via
 * `hasRejectedAnchorOrTag` and the scanner respectively); a `,`
 * inside a verbatim tag URI (`!<tag:x,>` — content both sides
 * accept); `!` / `,` inside a quoted scalar, a plain scalar
 * (`b!foo,`), a block scalar or a comment; an anchor followed by
 * `,` (`&x,` — no tag involved). This is a read-only scan of the
 * input text: the input is never rewritten (PROJECT_BOOK §7.3),
 * and the Oracle parser is untouched. The scan mirrors
 * `hasRejectedAnchorOrTag`'s state machine (quote / block-scalar /
 * plain-scalar / flow tracking) so a `!` inside a scalar is never
 * mistaken for a tag.
 */
export function hasRejectedTagComma(yamlText: string): boolean {
  const lines = yamlText.split("\n");
  let quote: "'" | '"' | null = null;
  let blockIndent: number | null = null;
  // Flow-kind stack: 'map' for `{`, 'seq' for `[`. Only the top
  // matters (a flow map nested in a sequence still triggers).
  const flowKindStack: ("map" | "seq")[] = [];
  let plain = false;
  let plainIndent = 0;
  let bareKeyIndent: number | null = null;
  let lastSig: string | null = null;

  // A URI character in a PyYAML tag suffix (scan_tag_uri): ASCII
  // alphanumerics and `-;/?:@&=+$,_.!~*'()[]` (`%` is handled
  // separately as a `%XX` escape). Same set as
  // `hasRejectedAnchorOrTag` — `,` is in it, which is the whole
  // point: the suffix scan consumes a trailing `,`.
  const isTagUriChar = (c: string): boolean =>
    (c >= "0" && c <= "9") ||
    (c >= "A" && c <= "Z") ||
    (c >= "a" && c <= "z") ||
    "-;/?:@&=+$,_.!~*'()[]".includes(c);
  // A character allowed right after a tag (PyYAML scan_tag's final
  // check); only used to recognise a bare `!` tag.
  const isTagAfterChar = (c: string): boolean =>
    c === "\0" ||
    c === " " ||
    c === "\t" ||
    c === "\r" ||
    c === "\x85" ||
    c === "\u2028" ||
    c === "\u2029";

  // Scan the tag starting at line[start] (`!`). Returns the index
  // just past the tag plus its raw suffix, or null when the tag
  // does not scan cleanly (a malformed tag is
  // `hasRejectedAnchorOrTag`'s business, not this rule's — return
  // null so this rule stays silent on it). A verbatim tag returns
  // suffix null: its `,` (after `>` or inside the URI) is not a
  // suffix-ending comma, and the after-`>` case is already
  // rejected by `hasRejectedAnchorOrTag`.
  const scanTag = (
    line: string,
    start: number,
  ): { end: number; suffix: string | null } | null => {
    const n = line.length;
    const after = start + 1 < n ? line[start + 1] : "\0";
    if (after === "<") {
      // Verbatim tag: URI characters to `>`.
      let j = start + 2;
      while (j < n) {
        const c = line[j];
        if (c === "%") {
          if (!/[0-9A-Fa-f]{2}/.test(line.slice(j + 1, j + 3))) {
            return null;
          }
          j += 3;
          continue;
        }
        if (isTagUriChar(c)) {
          j++;
          continue;
        }
        break;
      }
      if (j >= n || line[j] !== ">") return null;
      return { end: j + 1, suffix: null };
    }
    if (isTagAfterChar(after)) return { end: start + 1, suffix: "" };
    // Shorthand: look ahead for a second `!` (handle form).
    let k = start + 1;
    let useHandle = false;
    while (k < n) {
      const c = line[k];
      if (c === " " || c === "\t" || c === "\r" || c === "\x85" || c === "\u2028" || c === "\u2029") break;
      if (c === "!") {
        useHandle = true;
        break;
      }
      k++;
    }
    let j = start + 1;
    if (useHandle) {
      while (j < n && /[0-9A-Za-z_-]/.test(line[j])) j++;
      if (j >= n || line[j] !== "!") return null;
      j++;
    }
    // Suffix: URI characters (with `%XX` escapes).
    const suffixStart = j;
    while (j < n) {
      const c = line[j];
      if (c === "%") {
        if (!/[0-9A-Fa-f]{2}/.test(line.slice(j + 1, j + 3))) {
          return null;
        }
        j += 3;
        continue;
      }
      if (isTagUriChar(c)) {
        j++;
        continue;
      }
      break;
    }
    return { end: j, suffix: line.slice(suffixStart, j) };
  };

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (blockIndent !== null) {
      if (/^[ \t]*$/.test(line)) continue;
      if (line.startsWith("\t")) {
        continue;
      }
      const indent = line.match(/^ */)?.[0].length ?? 0;
      if (indent > blockIndent) continue;
      blockIndent = null;
    }
    const lineIndent = line.match(/^ */)?.[0].length ?? 0;
    if (plain) {
      if (flowKindStack.length > 0) {
        // continuation regardless of indent
      } else if (/^[ \t]*$/.test(line)) {
        // blank line: folds, scalar stays in progress
      } else if (lineIndent > plainIndent) {
        // continuation: plain stays true
      } else {
        plain = false;
      }
    }
    let pendingBlock: number | null = null;
    let lineHasContent = false;
    let i = 0;
    const n = line.length;
    const noteSig = (ch: string): void => {
      lastSig = ch;
      lineHasContent = true;
    };
    const startPlain = (firstContent: boolean): void => {
      if (plain) return;
      plain = true;
      plainIndent =
        firstContent &&
        bareKeyIndent !== null &&
        lineIndent > bareKeyIndent
          ? bareKeyIndent
          : lineIndent;
    };
    while (i < n) {
      const ch = line[i];
      if (quote === "'") {
        if (ch === "'") {
          if (line[i + 1] === "'") {
            i += 2;
            continue;
          }
          quote = null;
          plain = false;
          noteSig(ch);
        }
        i++;
        continue;
      }
      if (quote === '"') {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === '"') {
          quote = null;
          plain = false;
          noteSig(ch);
        }
        i++;
        continue;
      }
      if (ch === "#") {
        // A comment starts only at a token boundary (start of line
        // or after a space); otherwise `#` is part of a plain
        // scalar.
        if (i === 0 || line[i - 1] === " ") break;
        const first = !lineHasContent;
        lineHasContent = true;
        noteSig(ch);
        startPlain(first);
        i++;
        continue;
      }
      if (ch === "\t") {
        i++;
        continue;
      }
      if (ch === "'" || ch === '"') {
        if (!plain && isQuoteStart(line, i)) {
          quote = ch;
          noteSig(ch);
          i++;
          continue;
        }
        const first = !lineHasContent;
        lineHasContent = true;
        noteSig(ch);
        startPlain(first);
        i++;
        continue;
      }
      if (ch === ":") {
        const next = line[i + 1];
        const isSep =
          next === undefined ||
          next === " " ||
          next === "\t" ||
          (flowKindStack.length > 0 &&
            (next === "," ||
              next === "[" ||
              next === "]" ||
              next === "{" ||
              next === "}"));
        const first = !lineHasContent;
        lineHasContent = true;
        noteSig(ch);
        if (isSep) plain = false;
        else startPlain(first);
        i++;
        continue;
      }
      if (ch === "," || ch === "]" || ch === "}") {
        lineHasContent = true;
        noteSig(ch);
        if (flowKindStack.length > 0) {
          plain = false;
          if (ch !== ",") flowKindStack.pop();
        }
        i++;
        continue;
      }
      if (ch === "[" || ch === "{") {
        lineHasContent = true;
        noteSig(ch);
        if (!plain) flowKindStack.push(ch === "{" ? "map" : "seq");
        i++;
        continue;
      }
      if (ch === "-" || ch === "?") {
        const next = line[i + 1];
        const afterSep =
          next === undefined || next === " " || next === "\t";
        const prevOk =
          !lineHasContent ||
          (lastSig !== null &&
            [":", ",", "[", "{", "?", "-", "&", "!", "*"].includes(
              lastSig,
            ));
        const first = !lineHasContent;
        lineHasContent = true;
        noteSig(ch);
        if (!plain && afterSep && prevOk) {
          // Sequence-item / explicit-key indicator: no scalar starts.
        } else {
          startPlain(first);
        }
        i++;
        continue;
      }
      if (ch === "&" || ch === "!" || ch === "*") {
        if (!plain) {
          // Property position: an anchor/alias is skipped (its
          // rejections belong to `hasRejectedAnchorOrTag`); a tag
          // is scanned for a trailing comma in a flow mapping.
          if (ch === "!") {
            const tag = scanTag(line, i);
            if (tag === null) {
              // Malformed tag: not this rule's business.
              i++;
              continue;
            }
            if (
              tag.suffix !== null &&
              tag.suffix.endsWith(",") &&
              flowKindStack.length > 0 &&
              flowKindStack[flowKindStack.length - 1] === "map"
            ) {
              return true;
            }
            i = tag.end;
            lineHasContent = true;
            lastSig = line[i - 1] ?? null;
            continue;
          }
          let j = i + 1;
          while (j < n && /[0-9A-Za-z_-]/.test(line[j])) j++;
          i = j;
          lineHasContent = true;
          lastSig = line[i - 1] ?? null;
          continue;
        }
        // Inside a plain scalar the char is literal.
        const first = !lineHasContent;
        lineHasContent = true;
        noteSig(ch);
        startPlain(first);
        i++;
        continue;
      }
      if (
        (ch === "|" || ch === ">") &&
        flowKindStack.length === 0 &&
        pendingBlock === null
      ) {
        const hdr = blockScalarHeaderIndent(line, i);
        if (hdr !== null) {
          pendingBlock = hdr;
          lineHasContent = true;
          noteSig(ch);
          i++;
          continue;
        }
      }
      if (ch === " ") {
        i++;
        continue;
      }
      // Any other character starts or continues a plain scalar.
      const first = !lineHasContent;
      lineHasContent = true;
      noteSig(ch);
      startPlain(first);
      i++;
    }
    if (pendingBlock !== null) blockIndent = pendingBlock;
    // A line ending with a bare `key:` (empty value) sets the block
    // context for a value written on the next line; any other line
    // with significant content clears it. Blank / comment-only
    // lines leave it unchanged.
    if (lastSig !== null && quote === null && flowKindStack.length === 0) {
      bareKeyIndent = lastSig === ":" ? lineIndent : null;
    }
  }
  return false;
}

/**
 * Parse workflow YAML into a normalized trigger IR (without evaluation).
 * `fixtureId` is carried through so both implementations emit identical IR.
 */
export function parseWorkflowYaml(
  yamlText: string,
  fixtureId: string,
): TriggerIR {
  const base = (
    onKeyIsString: boolean,
    status: TriggerStatus,
    events: TriggerEventConfig[],
    errors: string[],
  ): TriggerIR => ({
    schema: TRIGGER_IR_SCHEMA,
    fixture_id: fixtureId,
    on_key_is_string: onKeyIsString,
    status,
    events,
    evaluation: nullEvaluation([], status === "VALID" ? "triggered" : status.toLowerCase()),
    errors,
  });

  let doc: unknown;
  try {
    doc = parse(yamlText);
  } catch {
    return base(false, "INVALID", [], ["yaml_parse_error"]);
  }

  // Detect the `on` key from the document node: a YAML 1.1 reader would
  // resolve it to boolean `true`; YAML 1.2 keeps the string "on".
  let onKeyIsString = false;
  try {
    const parsedDoc = parseDocument(yamlText);
    const root = parsedDoc.contents;
    if (isMap(root)) {
      for (const pair of root.items) {
        const key = pair.key;
        if (isScalar(key) && typeof key.value === "string" && key.value === "on") {
          onKeyIsString = true;
        }
      }
    }
  } catch {
    return base(false, "INVALID", [], ["yaml_parse_error"]);
  }

  // FIX-P0-04: a bare empty key (or a collection key) anywhere in the
  // document is rejected by PyYAML at parse time, so the Oracle can
  // only return INVALID / yaml_parse_error / events []. Reject it
  // here through the same error path, before any other verdict, so
  // the two sides agree field-for-field (including
  // on_key_is_string: false, as in the Oracle's parse-error base).
  // FIX-P0-06: the same holds for an alias key resolving to a
  // collection (N5, inside hasUnrepresentableKey) and for a tab
  // PyYAML's scanner rejects (H6 family, hasRejectedTab).
  // FIX-P0-09: the same holds for a multi-line key in a flow
  // mapping (R3, hasMultilineFlowKey).
  // FIX-P0-12: the same holds for an anchor/tag PyYAML's scanner
  // rejects (R11 P0-A, hasRejectedAnchorOrTag).
  // FIX-P0-13: the same holds for a tag whose suffix swallows a
  // flow-mapping `,` (R12 P0-C1, hasRejectedTagComma).
  // FIX-P0-19: the same holds for an alias key resolving to a
  // scalar that duplicates another key of the same mapping (R18
  // P0, hasDuplicateAliasKey — the `yaml` package's `uniqueKeys`
  // never resolves alias keys, so only the alias gap is filled).
  if (
    hasUnrepresentableKey(yamlText) ||
    hasRejectedTab(yamlText) ||
    hasMultilineFlowKey(yamlText) ||
    hasRejectedAnchorOrTag(yamlText) ||
    hasRejectedTagComma(yamlText) ||
    hasDuplicateAliasKey(yamlText)
  ) {
    return base(false, "INVALID", [], ["yaml_parse_error"]);
  }

  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return base(onKeyIsString, "INVALID", [], ["workflow_root_not_mapping"]);
  }
  const root = doc as Record<string, unknown>;
  if (!("on" in root)) {
    return base(onKeyIsString, "INVALID", [], ["missing_on_key"]);
  }
  if (!onKeyIsString) {
    return base(false, "INVALID", [], ["on_key_not_string"]);
  }

  const onValue = root["on"];
  // Normalize the `on` value into (event name, raw config) pairs, in order.
  const rawEvents: Array<{ name: string; config: unknown }> = [];
  if (typeof onValue === "string") {
    rawEvents.push({ name: onValue, config: null });
  } else if (Array.isArray(onValue)) {
    for (const item of onValue) {
      if (typeof item !== "string") {
        return base(true, "INVALID", [], ["on_list_item_not_string"]);
      }
      rawEvents.push({ name: item, config: null });
    }
  } else if (onValue !== null && typeof onValue === "object" && !Array.isArray(onValue)) {
    for (const [name, config] of Object.entries(onValue as Record<string, unknown>)) {
      rawEvents.push({ name, config });
    }
  } else {
    return base(true, "INVALID", [], ["on_value_invalid"]);
  }

  // Normalize each event config; INVALID (shape / mutual exclusion) is
  // checked before UNKNOWN (unsupported semantics) so the outcome is stable.
  const events: TriggerEventConfig[] = [];
  const invalidErrors: string[] = [];
  for (const { name, config } of rawEvents) {
    const cfg: TriggerEventConfig = {
      name,
      types: null,
      branches: null,
      branches_ignore: null,
      paths: null,
      paths_ignore: null,
    };
    if (config !== null && config !== undefined) {
      if (typeof config !== "object" || Array.isArray(config)) {
        return base(true, "INVALID", [], ["event_config_not_mapping"]);
      }
      const raw = config as Record<string, unknown>;
      const fields: Array<[string, "types" | "branches" | "branches_ignore" | "paths" | "paths_ignore"]> = [
        ["types", "types"],
        ["branches", "branches"],
        ["branches-ignore", "branches_ignore"],
        ["paths", "paths"],
        ["paths-ignore", "paths_ignore"],
      ];
      for (const [yamlKey, field] of fields) {
        if (yamlKey in raw) {
          const parsed = stringOrList(raw[yamlKey]);
          if (parsed === "INVALID") {
            return base(true, "INVALID", [], [`filter_not_string_or_list:${yamlKey}`]);
          }
          cfg[field] = parsed;
        }
      }
    }
    if (cfg.branches !== null && cfg.branches_ignore !== null) {
      invalidErrors.push("branches_and_branches_ignore_both_present");
    }
    if (cfg.paths !== null && cfg.paths_ignore !== null) {
      invalidErrors.push("paths_and_paths_ignore_both_present");
    }
    events.push(cfg);
  }
  if (invalidErrors.length > 0) {
    const ir = base(true, "INVALID", events, invalidErrors);
    ir.evaluation = nullEvaluation([], "invalid");
    return ir;
  }

  // UNKNOWN: unknown event names, unknown filter keys, unsupported Globs.
  const unsupported: string[] = [];
  for (const { name, config } of rawEvents) {
    if (!(SUPPORTED_EVENTS as readonly string[]).includes(name)) {
      unsupported.push(`unsupported_event:${name}`);
    }
    if (config !== null && config !== undefined && typeof config === "object" && !Array.isArray(config)) {
      for (const key of Object.keys(config as Record<string, unknown>)) {
        if (!["types", "branches", "branches-ignore", "paths", "paths-ignore"].includes(key)) {
          unsupported.push(`unsupported_filter:${key}`);
        }
      }
    }
  }
  for (const event of events) {
    for (const field of ["branches", "branches_ignore", "paths", "paths_ignore"] as const) {
      const patterns = event[field];
      if (patterns === null) continue;
      for (const pattern of patterns) {
        const { unsupported: bad } = matchOrderedPatterns([pattern], "");
        if (bad.length > 0) unsupported.push(`unsupported_glob:${pattern}`);
      }
    }
  }
  if (unsupported.length > 0) {
    const ir = base(true, "UNKNOWN", events, []);
    ir.evaluation = nullEvaluation(unsupported, "unknown");
    return ir;
  }

  const ir = base(true, "VALID", events, []);
  ir.evaluation = nullEvaluation([], "triggered");
  return ir;
}

/** Branch value the filter compares against, per event (§4.2). T006 adapter: delegates to the formal evaluator. */
export function branchValueForEvent(
  eventName: string,
  scenario: TriggerScenario,
): string | null {
  return formalBranchValue(eventName, triggerScenarioToScenarioV1(scenario));
}

/**
 * Evaluate a parsed trigger IR against one scenario. T006 adapter:
 * translates the PoC shapes to the formal evaluator and delegates —
 * the algorithm lives in src/core/event-evaluator.ts only.
 */
export function evaluateTrigger(
  ir: TriggerIR,
  scenario: TriggerScenario,
): TriggerEvaluation {
  const events: WorkflowIREvent[] = ir.events.map((e) => ({
    name: e.name as EventName,
    types: e.types,
    branches: e.branches,
    branches_ignore: e.branches_ignore,
    paths: e.paths,
    paths_ignore: e.paths_ignore,
  }));
  return evaluateTriggerEvents(
    events,
    ir.status,
    ir.evaluation.unsupported,
    triggerScenarioToScenarioV1(scenario, ir.fixture_id),
  );
}

/** Parse workflow YAML and evaluate it against one scenario: the full T002 IR. */
export function buildTriggerIR(
  yamlText: string,
  scenario: TriggerScenario,
  fixtureId: string,
): TriggerIR {
  const ir = parseWorkflowYaml(yamlText, fixtureId);
  ir.evaluation = evaluateTrigger(ir, scenario);
  return ir;
}
