// T007 — Frozen `if` subset evaluator (formal).
//
// Formalizes the T003 PoC `if` parser/evaluator (PROJECT_BOOK §3.3,
// §4.4) for the frozen static subset only. This module is now the single
// home of the `if` language: job-dag.ts imports it and never parses an
// `if` expression itself. The algorithm is moved verbatim from the PoC
// (same tokenizer, same recursive-descent parser, same Kleene
// three-valued evaluation, same reason contract), so the S0 fixtures
// and the Python Reference Oracle keep agreeing field-for-field.
//
// Frozen subset (§3.3):
//   literals true / false; always(); !, &&, ||, ==, !=; parentheses;
//   contexts github.event_name, github.ref, github.base_ref,
//   github.head_ref, github.event.action; string literals ('...' /
//   "..."). An expression may be wrapped as `${{ ... }}`.
// Everything else is UNSUPPORTED, never silently treated as true:
//   success(), failure(), cancelled(), contains(), hashFiles(),
//   fromJSON(), needs.*.outputs, steps.*, matrix.*, env.*, vars.*,
//   secrets.*, github.sha, github.repository, ... — any other
//   identifier, function, operator (single & / |, <, >, +, ...), or
//   malformed syntax raises UnsupportedIfError and evaluates to
//   UNKNOWN with reason "unsupported_if".
//
// Three-valued (Kleene) evaluation:
//   * `always()` is TRUE even when a previous job failed/was skipped
//     (it waives the default success() needs precondition; job-dag.ts
//     reads `hasAlways` for that, it does not re-scan the text).
//   * `false && UNKNOWN` is FALSE; `true || UNKNOWN` is TRUE; any
//     other combination with UNKNOWN stays UNKNOWN.
//   * A bare context or bare string literal is not a boolean condition
//     -> UNKNOWN ("if_unknown").
//   * `==` / `!=` compare operands only when both sides resolve to a
//     known value of the SAME type (string vs string, boolean vs
//     boolean); a missing context value (null) or a type mismatch is
//     UNKNOWN, never a guessed false.
//   * An empty / whitespace-only / absent `if` means "no condition"
//     -> TRUE, `hasAlways` false, reason "no_condition".
//
// This module never predicts whether a Job will really succeed or
// fail — it only decides the static truth value of its condition.

import type { ScenarioV1 } from "./types.js";

/** Three-valued result of a static `if` evaluation. */
export type IfTriState = "TRUE" | "FALSE" | "UNKNOWN";

/**
 * The scenario facts an `if` expression may read. Field names follow
 * the expression language (github.event_name etc.), not ScenarioV1:
 * use `ifContextFromScenario` to adapt a validated ScenarioV1.
 * A null/missing value means "the scenario does not supply this fact"
 * and makes any comparison against it UNKNOWN (fail-closed).
 */
export interface IfScenarioContext {
  event_name?: string | null;
  action?: string | null;
  ref?: string | null;
  base_ref?: string | null;
  head_ref?: string | null;
}

/**
 * Adapt a validated ScenarioV1 to the `if` context (§4.2 branch
 * mapping is the trigger evaluator's job; here the mapping is purely
 * mechanical: event.name -> event_name, base_branch -> base_ref,
 * head_branch -> head_ref).
 */
export function ifContextFromScenario(scenario: ScenarioV1): IfScenarioContext {
  const event = scenario.event;
  return {
    event_name: event.name ?? null,
    action: event.action ?? null,
    ref: event.ref ?? null,
    base_ref: event.base_branch ?? null,
    head_ref: event.head_branch ?? null,
  };
}

/** Thrown when an `if` expression leaves the frozen subset. */
export class UnsupportedIfError extends Error {}

/** Result of evaluating one `if` expression. Never throws. */
export interface IfEvaluation {
  value: IfTriState;
  /** True when the expression contains `always()` anywhere (even under `!` / inside a comparison — job-dag.ts treats any occurrence as waiving the needs precondition, exactly like the PoC and the Oracle). */
  hasAlways: boolean;
  /** True when the expression could not be parsed inside the subset. */
  unsupported: boolean;
  reason: "no_condition" | "evaluated" | "unsupported_if" | "if_unknown";
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export type IfAstNode =
  | { kind: "bool"; value: boolean }
  | { kind: "always" }
  | { kind: "context"; name: string }
  | { kind: "string"; value: string }
  | { kind: "not"; expr: IfAstNode }
  | { kind: "and"; left: IfAstNode; right: IfAstNode }
  | { kind: "or"; left: IfAstNode; right: IfAstNode }
  | { kind: "eq"; left: IfAstNode; right: IfAstNode }
  | { kind: "neq"; left: IfAstNode; right: IfAstNode };

const SUPPORTED_CONTEXTS: Record<string, keyof IfScenarioContext> = {
  "github.event_name": "event_name",
  "github.ref": "ref",
  "github.base_ref": "base_ref",
  "github.head_ref": "head_ref",
  "github.event.action": "action",
};

// ---------------------------------------------------------------------------
// Tokenizer (verbatim from the T003 PoC)
// ---------------------------------------------------------------------------

type Token =
  | { type: "ident"; value: string }
  | { type: "string"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "eof" };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i += 1;
      continue;
    }
    if (ch === "!" && source[i + 1] !== "=") {
      tokens.push({ type: "op", value: "!" });
      i += 1;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (two === "&&" || two === "||" || two === "==" || two === "!=") {
      tokens.push({ type: "op", value: two });
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const end = source.indexOf(ch, i + 1);
      if (end === -1) throw new UnsupportedIfError("unterminated string literal");
      tokens.push({ type: "string", value: source.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z0-9_.]/.test(ch)) {
      let j = i;
      while (j < source.length && /[A-Za-z0-9_.]/.test(source[j])) j += 1;
      tokens.push({ type: "ident", value: source.slice(i, j) });
      i = j;
      continue;
    }
    throw new UnsupportedIfError(`unsupported character: ${ch}`);
  }
  tokens.push({ type: "eof" });
  return tokens;
}

// ---------------------------------------------------------------------------
// Recursive-descent parser (verbatim from the T003 PoC)
// Precedence: || < && < == / != < ! < primary.
// ---------------------------------------------------------------------------

class IfParser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): IfAstNode {
    const node = this.parseOr();
    if (this.peek().type !== "eof") {
      throw new UnsupportedIfError("trailing tokens after expression");
    }
    return node;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private parseOr(): IfAstNode {
    let left = this.parseAnd();
    for (;;) {
      const tok = this.peek();
      if (tok.type !== "op" || tok.value !== "||") return left;
      this.next();
      left = { kind: "or", left, right: this.parseAnd() };
    }
  }

  private parseAnd(): IfAstNode {
    let left = this.parseEquality();
    for (;;) {
      const tok = this.peek();
      if (tok.type !== "op" || tok.value !== "&&") return left;
      this.next();
      left = { kind: "and", left, right: this.parseEquality() };
    }
  }

  private parseEquality(): IfAstNode {
    let left = this.parseUnary();
    for (;;) {
      const tok = this.peek();
      if (tok.type === "op" && (tok.value === "==" || tok.value === "!=")) {
        this.next();
        const right = this.parseUnary();
        left =
          tok.value === "=="
            ? { kind: "eq", left, right }
            : { kind: "neq", left, right };
      } else {
        return left;
      }
    }
  }

  private parseUnary(): IfAstNode {
    const tok = this.peek();
    if (tok.type === "op" && tok.value === "!") {
      this.next();
      return { kind: "not", expr: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): IfAstNode {
    const tok = this.next();
    if (tok.type === "lparen") {
      const inner = this.parseOr();
      const close = this.next();
      if (close.type !== "rparen") {
        throw new UnsupportedIfError("missing closing parenthesis");
      }
      return inner;
    }
    if (tok.type === "string") return { kind: "string", value: tok.value };
    if (tok.type === "ident") {
      if (tok.value === "true") return { kind: "bool", value: true };
      if (tok.value === "false") return { kind: "bool", value: false };
      if (tok.value === "always") {
        const open = this.next();
        const close = this.next();
        if (open.type !== "lparen" || close.type !== "rparen") {
          throw new UnsupportedIfError("always() must be called with no arguments");
        }
        return { kind: "always" };
      }
      if (tok.value in SUPPORTED_CONTEXTS) {
        return { kind: "context", name: tok.value };
      }
      // Any other identifier/function/context (needs.*, steps.*, matrix.*,
      // env.*, success(), contains(), hashFiles(), ...) is unsupported.
      throw new UnsupportedIfError(`unsupported identifier: ${tok.value}`);
    }
    throw new UnsupportedIfError("unexpected token in if expression");
  }
}

/** Strip a surrounding `${{ ... }}` expression wrapper, if present. */
export function stripExpressionWrapper(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("${{") && trimmed.endsWith("}}")) {
    return trimmed.slice(3, -2).trim();
  }
  return trimmed;
}

/**
 * Parse an `if` expression into an AST.
 * @throws UnsupportedIfError when the expression leaves the frozen subset.
 */
export function parseIfExpression(raw: string): IfAstNode {
  return new IfParser(tokenize(stripExpressionWrapper(raw))).parse();
}

/** True when the AST contains `always()` anywhere (any nesting). */
export function containsAlways(node: IfAstNode): boolean {
  switch (node.kind) {
    case "always":
      return true;
    case "not":
      return containsAlways(node.expr);
    case "and":
    case "or":
    case "eq":
    case "neq":
      return containsAlways(node.left) || containsAlways(node.right);
    default:
      return false;
  }
}

/** Evaluate an AST operand to a string/boolean value, or null when unknown. */
function operandValue(
  node: IfAstNode,
  scenario: IfScenarioContext,
): string | boolean | null {
  switch (node.kind) {
    case "string":
      return node.value;
    case "bool":
      return node.value;
    case "context": {
      const field = SUPPORTED_CONTEXTS[node.name];
      const value = scenario[field];
      return value === undefined || value === null ? null : value;
    }
    default:
      return null;
  }
}

/** Kleene three-valued evaluation of a parsed AST. */
export function evaluateIfAst(
  node: IfAstNode,
  scenario: IfScenarioContext,
): IfTriState {
  switch (node.kind) {
    case "bool":
      return node.value ? "TRUE" : "FALSE";
    case "always":
      // always() is true even when a previous job failed/was skipped.
      return "TRUE";
    case "context":
      // A bare context string is not a boolean condition.
      return "UNKNOWN";
    case "string":
      return "UNKNOWN";
    case "not": {
      const inner = evaluateIfAst(node.expr, scenario);
      return inner === "TRUE" ? "FALSE" : inner === "FALSE" ? "TRUE" : "UNKNOWN";
    }
    case "and": {
      const l = evaluateIfAst(node.left, scenario);
      const r = evaluateIfAst(node.right, scenario);
      if (l === "FALSE" || r === "FALSE") return "FALSE";
      if (l === "TRUE" && r === "TRUE") return "TRUE";
      return "UNKNOWN";
    }
    case "or": {
      const l = evaluateIfAst(node.left, scenario);
      const r = evaluateIfAst(node.right, scenario);
      if (l === "TRUE" || r === "TRUE") return "TRUE";
      if (l === "FALSE" && r === "FALSE") return "FALSE";
      return "UNKNOWN";
    }
    case "eq":
    case "neq": {
      const l = operandValue(node.left, scenario);
      const r = operandValue(node.right, scenario);
      if (l === null || r === null) return "UNKNOWN";
      if (typeof l !== typeof r) return "UNKNOWN";
      const equal = l === r;
      return node.kind === "eq"
        ? equal
          ? "TRUE"
          : "FALSE"
        : equal
          ? "FALSE"
          : "TRUE";
    }
  }
}

/**
 * Evaluate one raw `if` expression. Never throws: an out-of-subset
 * expression yields `{ value: "UNKNOWN", unsupported: true, reason:
 * "unsupported_if" }`, and an in-subset expression whose value cannot
 * be decided yields `{ value: "UNKNOWN", unsupported: false, reason:
 * "if_unknown" }`. An absent / empty / whitespace-only expression
 * means "no condition" (`TRUE`, reason "no_condition").
 */
export function evaluateIfExpression(
  raw: string | null | undefined,
  scenario: IfScenarioContext,
): IfEvaluation {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return {
      value: "TRUE",
      hasAlways: false,
      unsupported: false,
      reason: "no_condition",
    };
  }
  try {
    const ast = parseIfExpression(raw);
    const value = evaluateIfAst(ast, scenario);
    return {
      value,
      hasAlways: containsAlways(ast),
      unsupported: false,
      reason: value === "UNKNOWN" ? "if_unknown" : "evaluated",
    };
  } catch (error) {
    if (error instanceof UnsupportedIfError) {
      return {
        value: "UNKNOWN",
        hasAlways: false,
        unsupported: true,
        reason: "unsupported_if",
      };
    }
    throw error;
  }
}
