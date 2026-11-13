// T005 — shared valid inputs for the schema/validation tests.
//
// Not a test file (no .test.ts suffix, so vitest does not collect it).
// Each test file clones these objects before mutating them.

export const validWorkflowIR = {
  schema: "checkpath.workflow-ir/v1",
  source_path: ".github/workflows/ci.yml",
  name: "ci",
  on: [
    {
      name: "pull_request",
      types: ["opened", "synchronize"],
      branches: ["main"],
      branches_ignore: null,
      paths: "src/**",
      paths_ignore: null,
    },
  ],
  jobs: [
    { id: "build", name: null, needs: [], if: null, context: "build" },
    { id: "test", name: "unit-tests", needs: ["build"], if: "always()", context: "unit-tests" },
  ],
};

export const validScenario = {
  schema: "checkpath.scenario/v1",
  scenario_id: "PR-DOCS-ONLY",
  event: {
    name: "pull_request",
    action: "synchronize",
    base_branch: "main",
    head_branch: "docs/update",
    commit_message: "docs: update guide",
  },
  diff: {
    algorithm: "three-dot",
    changed_files: ["README.md", "docs/guide.md"],
    changed_files_total: 2,
    returned_files: 2,
    complete: true,
    first_3000_confirmed: true,
    diff_timed_out: false,
    push_commit_count: null,
  },
};

/** Error codes of a validation result ([] when ok). */
export function codes(result: { ok: boolean; issues: Array<{ code: string }> }): string[] {
  return result.ok ? [] : result.issues.map((i) => i.code);
}
