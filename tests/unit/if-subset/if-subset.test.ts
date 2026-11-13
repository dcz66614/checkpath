// T007 — Frozen `if` subset unit tests.
//
// Every case is derived from PROJECT_BOOK §3.3 (the frozen subset
// list) and §3.4 (unsupported items must be UNKNOWN, never silently
// true). The Python Reference Oracle implements the identical
// tokenizer/parser/Kleene evaluation; the cross-implementation check
// itself lives in `npm run oracle:diff:jobs`.

import { describe, expect, it } from "vitest";
import {
  containsAlways,
  evaluateIfAst,
  evaluateIfExpression,
  ifContextFromScenario,
  parseIfExpression,
  UnsupportedIfError,
  type IfScenarioContext,
} from "../../../src/core/if-subset.js";
import type { ScenarioV1 } from "../../../src/core/types.js";

const PR: IfScenarioContext = {
  event_name: "pull_request",
  action: "synchronize",
  ref: "refs/pull/42/merge",
  base_ref: "main",
  head_ref: "feature/x",
};

const PUSH: IfScenarioContext = {
  event_name: "push",
  action: null,
  ref: "refs/heads/main",
  base_ref: null,
  head_ref: null,
};

function value(
  raw: string | null | undefined,
  scenario: IfScenarioContext = PR,
): string {
  return evaluateIfExpression(raw, scenario).value;
}

describe("if-subset: literals and no-condition", () => {
  it.each([
    ["true", "TRUE"],
    ["false", "FALSE"],
    ["  true  ", "TRUE"],
    ["${{ true }}", "TRUE"],
    ["${{false}}", "FALSE"],
  ])("%s evaluates to %s", (raw, expected) => {
    expect(value(raw)).toBe(expected);
  });

  it.each([null, undefined, "", "   ", "\n\t"])(
    "absent/empty if %s means no condition (TRUE)",
    (raw) => {
      const result = evaluateIfExpression(raw, PR);
      expect(result).toEqual({
        value: "TRUE",
        hasAlways: false,
        unsupported: false,
        reason: "no_condition",
      });
    },
  );
});

describe("if-subset: boolean operators and precedence", () => {
  it.each([
    ["!true", "FALSE"],
    ["!false", "TRUE"],
    ["!!true", "TRUE"],
    ["true && false", "FALSE"],
    ["true && true", "TRUE"],
    ["false || true", "TRUE"],
    ["false || false", "FALSE"],
    ["true || false && false", "TRUE"],
    ["(true || false) && false", "FALSE"],
    ["!(true && false)", "TRUE"],
    ["true && (false || true)", "TRUE"],
  ])("%s evaluates to %s", (raw, expected) => {
    expect(value(raw)).toBe(expected);
  });

  it("&& binds tighter than ||", () => {
    expect(value("false || true && false")).toBe("FALSE");
    expect(value("(false || true) && false")).toBe("FALSE");
    expect(value("false || (true && false)")).toBe("FALSE");
  });
});

describe("if-subset: always()", () => {
  it("always() is TRUE and flagged", () => {
    const result = evaluateIfExpression("always()", PR);
    expect(result).toEqual({
      value: "TRUE",
      hasAlways: true,
      unsupported: false,
      reason: "evaluated",
    });
  });

  it("always() inside a larger expression is still detected", () => {
    expect(evaluateIfExpression("always() && true", PR).hasAlways).toBe(true);
    expect(evaluateIfExpression("false || always()", PR).hasAlways).toBe(true);
    expect(evaluateIfExpression("!always()", PR).hasAlways).toBe(true);
    expect(evaluateIfExpression("github.event_name == 'push' || always()", PR).hasAlways).toBe(true);
  });

  it("always() with arguments is unsupported, not true", () => {
    const result = evaluateIfExpression("always(true)", PR);
    expect(result.unsupported).toBe(true);
    expect(result.value).toBe("UNKNOWN");
    expect(result.reason).toBe("unsupported_if");
  });

  it("containsAlways finds always() at any nesting depth", () => {
    expect(containsAlways(parseIfExpression("always()"))).toBe(true);
    expect(containsAlways(parseIfExpression("!(always() && true)"))).toBe(true);
    expect(containsAlways(parseIfExpression("true"))).toBe(false);
  });
});

describe("if-subset: context comparisons", () => {
  it.each([
    ["github.event_name == 'pull_request'", "TRUE"],
    ["github.event_name == 'push'", "FALSE"],
    ["github.event_name != 'push'", "TRUE"],
    ["github.event_name != 'pull_request'", "FALSE"],
    ['github.event_name == "pull_request"', "TRUE"],
    ["github.ref == 'refs/pull/42/merge'", "TRUE"],
    ["github.ref == 'refs/heads/main'", "FALSE"],
    ["github.base_ref == 'main'", "TRUE"],
    ["github.head_ref == 'feature/x'", "TRUE"],
    ["github.event.action == 'synchronize'", "TRUE"],
    ["github.event.action == 'opened'", "FALSE"],
    ["github.event.action != 'opened'", "TRUE"],
  ])("%s evaluates to %s (PR scenario)", (raw, expected) => {
    expect(value(raw, PR)).toBe(expected);
  });

  it("comparisons use the push scenario values", () => {
    expect(value("github.event_name == 'push'", PUSH)).toBe("TRUE");
    expect(value("github.ref == 'refs/heads/main'", PUSH)).toBe("TRUE");
    expect(value("github.base_ref == 'main'", PUSH)).toBe("UNKNOWN");
    expect(value("github.event.action == 'synchronize'", PUSH)).toBe("UNKNOWN");
  });

  it("a missing context value makes the comparison UNKNOWN, never false", () => {
    const noRef: IfScenarioContext = { ...PR, ref: null };
    expect(value("github.ref == 'refs/heads/main'", noRef)).toBe("UNKNOWN");
    expect(value("github.ref != 'refs/heads/main'", noRef)).toBe("UNKNOWN");
  });

  it("a bare context or bare string is not a boolean condition", () => {
    expect(value("github.event_name", PR)).toBe("UNKNOWN");
    expect(value("'pull_request'", PR)).toBe("UNKNOWN");
    expect(evaluateIfExpression("github.event_name", PR).reason).toBe("if_unknown");
  });

  it("boolean vs string comparison is a type mismatch -> UNKNOWN", () => {
    expect(value("true == 'true'", PR)).toBe("UNKNOWN");
    expect(value("github.event_name == true", PR)).toBe("UNKNOWN");
  });
});

describe("if-subset: Kleene three-valued logic", () => {
  it("false && UNKNOWN is FALSE, true || UNKNOWN is TRUE", () => {
    expect(value("false && github.event_name", PR)).toBe("FALSE");
    expect(value("true || github.event_name", PR)).toBe("TRUE");
  });

  it("true && UNKNOWN and false || UNKNOWN stay UNKNOWN", () => {
    expect(value("true && github.event_name", PR)).toBe("UNKNOWN");
    expect(value("false || github.event_name", PR)).toBe("UNKNOWN");
  });

  it("!UNKNOWN is UNKNOWN", () => {
    expect(value("!github.event_name", PR)).toBe("UNKNOWN");
    expect(value("! (github.ref == 'x' )", { ...PR, ref: null })).toBe("UNKNOWN");
  });

  it("an UNKNOWN comparison propagates through && and ||", () => {
    const noBase: IfScenarioContext = { ...PR, base_ref: null };
    expect(value("github.base_ref == 'main' && true", noBase)).toBe("UNKNOWN");
    expect(value("github.base_ref == 'main' || false", noBase)).toBe("UNKNOWN");
    expect(value("github.base_ref == 'main' || true", noBase)).toBe("TRUE");
    expect(value("github.base_ref == 'main' && false", noBase)).toBe("FALSE");
  });
});

describe("if-subset: unsupported expressions fail closed", () => {
  it.each([
    "success()",
    "failure()",
    "cancelled()",
    "contains(github.event_name, 'push')",
    "hashFiles('**/package-lock.json')",
    "fromJSON('{}')",
    "needs.build.outputs.version == '1'",
    "needs.build.result == 'success'",
    "steps.test.outcome == 'success'",
    "matrix.os == 'ubuntu-latest'",
    "env.FOO == 'bar'",
    "vars.FOO == 'bar'",
    "secrets.TOKEN == 'x'",
    "github.sha == 'abc'",
    "github.repository == 'o/r'",
    "github.event.pull_request.merged == true",
    "github.ref_name == 'main'",
    "startsWith(github.ref, 'refs/heads/')",
    "1 == 1",
    "github.event_name",
  ])("%s is unsupported or non-boolean -> UNKNOWN, never true", (raw) => {
    const result = evaluateIfExpression(raw, PR);
    expect(result.value).toBe("UNKNOWN");
    // Bare-context cases parse but are not boolean; the rest are unsupported.
    if (raw !== "github.event_name") {
      expect(result.unsupported).toBe(true);
      expect(result.reason).toBe("unsupported_if");
    }
  });

  it.each([
    "true & true",
    "true | false",
    "github.event_name < 'x'",
    "true + false",
    "github.event_name == 'pull_request' extra",
    "(true",
    "true)",
    "'unterminated",
    "${{ true }",
    "always",
  ])("malformed or out-of-subset syntax %s is unsupported", (raw) => {
    const result = evaluateIfExpression(raw, PR);
    expect(result.value).toBe("UNKNOWN");
    expect(result.unsupported).toBe(true);
    expect(result.reason).toBe("unsupported_if");
  });

  it("parseIfExpression throws UnsupportedIfError on unsupported input", () => {
    expect(() => parseIfExpression("success()")).toThrow(UnsupportedIfError);
    expect(() => parseIfExpression("true &&")).toThrow(UnsupportedIfError);
  });

  it("evaluateIfExpression never throws on unsupported input", () => {
    for (const raw of ["success()", "true & true", "'unterminated", ""]) {
      expect(() => evaluateIfExpression(raw, PR)).not.toThrow();
    }
  });

  it("evaluateIfAst on a parsed AST agrees with the raw evaluation", () => {
    const ast = parseIfExpression("github.event_name == 'pull_request' && !false");
    expect(evaluateIfAst(ast, PR)).toBe("TRUE");
    expect(evaluateIfAst(ast, PUSH)).toBe("FALSE");
  });
});

describe("if-subset: ScenarioV1 adaptation", () => {
  it("ifContextFromScenario maps ScenarioV1 event fields", () => {
    const scenario = {
      schema: "checkpath.scenario/v1",
      scenario_id: "T7",
      event: {
        name: "pull_request",
        action: "synchronize",
        branch: null,
        base_branch: "main",
        head_branch: "feature/x",
        target_branch: null,
        ref: "refs/pull/42/merge",
        commit_message: "feat: change",
      },
      diff: {
        algorithm: "three-dot",
        changed_files: ["src/app.ts"],
        changed_files_total: 1,
        returned_files: 1,
        complete: true,
        first_3000_confirmed: true,
        diff_timed_out: false,
        push_commit_count: null,
      },
    } as ScenarioV1;
    expect(ifContextFromScenario(scenario)).toEqual({
      event_name: "pull_request",
      action: "synchronize",
      ref: "refs/pull/42/merge",
      base_ref: "main",
      head_ref: "feature/x",
    });
    expect(
      value("github.base_ref == 'main'", ifContextFromScenario(scenario)),
    ).toBe("TRUE");
  });
});
