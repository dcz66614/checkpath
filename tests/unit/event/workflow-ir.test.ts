// T006 — YAML -> WorkflowIR builder tests.
//
// Locks the T005 open item U-01 contract (src/core/workflow-ir.ts):
// the builder composes the existing parser + job extractor + validator
// and never re-implements parsing. Cases: list/string/scalar `on`
// forms, job extraction with context derivation, display name, INVALID
// / UNKNOWN parse outcomes, job-level validation issues, and the
// workspace-relative source_path rule.

import { describe, expect, it } from "vitest";
import { buildWorkflowIR } from "../../../src/core/workflow-ir.js";
import { validateWorkflowIR } from "../../../src/core/validate.js";

const SIMPLE = `name: ci
on:
  pull_request:
    branches:
      - main
    paths:
      - 'src/**'
jobs:
  test:
    runs-on: ubuntu-latest
    name: unit-tests
    steps:
      - run: echo hi
  lint:
    runs-on: ubuntu-latest
    needs: [test]
    steps:
      - run: echo lint
`;

describe("T006 workflow-ir builder: happy path", () => {
  it("builds a schema-valid WorkflowIR from YAML", () => {
    const built = buildWorkflowIR(SIMPLE, ".github/workflows/ci.yml", "T6-B1");
    expect(built.ok).toBe(true);
    expect(built.status).toBe("VALID");
    expect(built.errors).toEqual([]);
    expect(built.unsupported).toEqual([]);
    expect(built.validationIssues).toEqual([]);
    expect(built.workflow).not.toBeNull();
    expect(built.workflow?.schema).toBe("checkpath.workflow-ir/v1");
    expect(built.workflow?.source_path).toBe(".github/workflows/ci.yml");
    expect(built.workflow?.name).toBe("ci");
    expect(built.workflow?.on).toEqual([
      {
        name: "pull_request",
        types: null,
        branches: ["main"],
        branches_ignore: null,
        paths: ["src/**"],
        paths_ignore: null,
      },
    ]);
    // Context derivation (§4.5): name when declared, else job id.
    // ADR T011/ADR-04: ordinary jobs carry unsupported_job: null.
    expect(built.workflow?.jobs).toEqual([
      { id: "test", name: "unit-tests", needs: [], if: null, context: "unit-tests", unsupported_job: null },
      { id: "lint", name: null, needs: ["test"], if: null, context: "lint", unsupported_job: null },
    ]);
    // The built IR validates cleanly on its own.
    expect(validateWorkflowIR(built.workflow).ok).toBe(true);
  });

  it("accepts the string-form and list-form `on:`", () => {
    const str = buildWorkflowIR(
      "name: ci\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
      "ci.yml",
      "T6-B2",
    );
    expect(str.ok).toBe(true);
    expect(str.workflow?.on).toEqual([
      {
        name: "push",
        types: null,
        branches: null,
        branches_ignore: null,
        paths: null,
        paths_ignore: null,
      },
    ]);
    const list = buildWorkflowIR(
      "name: ci\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
      "ci.yml",
      "T6-B3",
    );
    expect(list.ok).toBe(true);
    expect(list.workflow?.on.map((e) => e.name)).toEqual([
      "push",
      "pull_request",
    ]);
  });

  it("normalizes single-string filters to one-element lists", () => {
    const built = buildWorkflowIR(
      "name: ci\non:\n  push:\n    branches: main\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
      "ci.yml",
      "T6-B4",
    );
    expect(built.ok).toBe(true);
    expect(built.workflow?.on[0]?.branches).toEqual(["main"]);
  });

  it("carries `types` and hyphenated ignore filters through", () => {
    const built = buildWorkflowIR(
      "name: ci\non:\n  merge_group:\n    types: [checks_requested]\n    branches-ignore: ['release/*']\n  pull_request:\n    paths-ignore: ['docs/**']\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
      "ci.yml",
      "T6-B5",
    );
    expect(built.ok).toBe(true);
    expect(built.workflow?.on).toEqual([
      {
        name: "merge_group",
        types: ["checks_requested"],
        branches: null,
        branches_ignore: ["release/*"],
        paths: null,
        paths_ignore: null,
      },
      {
        name: "pull_request",
        types: null,
        branches: null,
        branches_ignore: null,
        paths: null,
        paths_ignore: ["docs/**"],
      },
    ]);
  });

  it("keeps `if: false` as the string 'false' (BaseLoader parity)", () => {
    const built = buildWorkflowIR(
      "name: ci\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    if: false\n",
      "ci.yml",
      "T6-B6",
    );
    expect(built.ok).toBe(true);
    expect(built.workflow?.jobs[0]?.if).toBe("false");
  });

  it("a missing workflow name normalizes to null", () => {
    const built = buildWorkflowIR(
      "on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
      "ci.yml",
      "T6-B7",
    );
    expect(built.ok).toBe(true);
    expect(built.workflow?.name).toBeNull();
  });
});

describe("T006 workflow-ir builder: INVALID / UNKNOWN", () => {
  it("missing `on:` is INVALID with the parser error code", () => {
    const built = buildWorkflowIR(
      "name: ci\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
      "ci.yml",
      "T6-B8",
    );
    expect(built.ok).toBe(false);
    expect(built.status).toBe("INVALID");
    expect(built.workflow).toBeNull();
    expect(built.errors).toContain("missing_on_key");
  });

  it("unparseable YAML is INVALID with yaml_parse_error", () => {
    const built = buildWorkflowIR("on: [unclosed\njobs: {\n", "ci.yml", "T6-B9");
    expect(built.ok).toBe(false);
    expect(built.status).toBe("INVALID");
    expect(built.workflow).toBeNull();
    expect(built.errors).toContain("yaml_parse_error");
  });

  it("paths + paths-ignore together is INVALID", () => {
    const built = buildWorkflowIR(
      "name: ci\non:\n  push:\n    paths: ['src/**']\n    paths-ignore: ['docs/**']\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
      "ci.yml",
      "T6-B10",
    );
    expect(built.ok).toBe(false);
    expect(built.status).toBe("INVALID");
    expect(built.workflow).toBeNull();
    expect(built.errors).toContain("paths_and_paths_ignore_both_present");
  });

  it("an unsupported event is UNKNOWN and the trigger carries the reason", () => {
    const built = buildWorkflowIR(
      "name: ci\non:\n  release:\n    types: [published]\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
      "ci.yml",
      "T6-B11",
    );
    expect(built.ok).toBe(false);
    expect(built.status).toBe("UNKNOWN");
    expect(built.workflow).toBeNull();
    expect(built.unsupported).toContain("unsupported_event:release");
  });

  it("an unsupported glob is UNKNOWN", () => {
    const built = buildWorkflowIR(
      "name: ci\non:\n  push:\n    paths: ['src/{a,b}/**']\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
      "ci.yml",
      "T6-B12",
    );
    expect(built.ok).toBe(false);
    expect(built.status).toBe("UNKNOWN");
    expect(built.workflow).toBeNull();
    expect(built.unsupported).toContain("unsupported_glob:src/{a,b}/**");
  });

  it("an unknown filter key is UNKNOWN", () => {
    const built = buildWorkflowIR(
      "name: ci\non:\n  push:\n    tags: ['v*']\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
      "ci.yml",
      "T6-B13",
    );
    expect(built.ok).toBe(false);
    expect(built.status).toBe("UNKNOWN");
    expect(built.unsupported).toContain("unsupported_filter:tags");
  });
});

describe("T006 workflow-ir builder: job-level validation", () => {
  it("duplicate job ids cannot survive YAML parsing: the parser rejects them", () => {
    const yaml = [
      "name: ci",
      "on: push",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "  test:",
      "    runs-on: ubuntu-latest",
      "",
    ].join("\n");
    // The `yaml` parser rejects duplicate mapping keys outright, so
    // the build is INVALID (yaml_parse_error) before any job-level
    // validation runs. A duplicate job id that reaches the validator
    // through the JSON IR path is still `duplicate_value` (T005).
    const built = buildWorkflowIR(yaml, "ci.yml", "T6-B14");
    expect(built.ok).toBe(false);
    expect(built.status).toBe("INVALID");
    expect(built.workflow).toBeNull();
    expect(built.errors).toContain("yaml_parse_error");
  });

  it("a `needs` reference to an undeclared job fails validation but keeps the IR", () => {
    const built = buildWorkflowIR(
      "name: ci\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    needs: [missing]\n",
      "ci.yml",
      "T6-B15",
    );
    expect(built.ok).toBe(false);
    expect(built.workflow).not.toBeNull();
    expect(built.workflow?.jobs[0]?.needs).toEqual(["missing"]);
    expect(built.validationIssues[0]?.code).toBe("unknown_reference");
  });

  it("an absolute source_path fails validation and the build is not ok", () => {
    const built = buildWorkflowIR(SIMPLE, "/abs/ci.yml", "T6-B16");
    expect(built.ok).toBe(false);
    expect(built.workflow).not.toBeNull();
    expect(
      built.validationIssues.some(
        (i) => i.code === "invalid_value" && i.path === "$.source_path",
      ),
    ).toBe(true);
  });
});
