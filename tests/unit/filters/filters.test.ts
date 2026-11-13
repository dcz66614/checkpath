// T006 — Branch/path filter tests (PROJECT_BOOK §4.2).
//
// Covers the filter half of the formal evaluator through
// `evaluateWorkflowTrigger` plus the glob matcher directly:
// branch + path AND, `branches-ignore` / `paths-ignore` inversion,
// ordered `!` patterns with re-inclusion, mutual exclusion at build
// time, and unsupported-glob fail-closed behavior.

import { describe, expect, it } from "vitest";
import { evaluateWorkflowTrigger } from "../../../src/core/event-evaluator.js";
import {
  isSupportedGlob,
  matchGlob,
  matchOrderedPatterns,
} from "../../../src/core/glob-subset.js";
import { buildWorkflowIR } from "../../../src/core/workflow-ir.js";
import {
  makeEvent,
  makeWorkflow,
  prScenario,
  pushScenario,
} from "../event/test-helpers.js";

describe("T006 glob matcher (formal)", () => {
  it("supports *, **, **/, ? and [...] as frozen", () => {
    expect(matchGlob("src/**", "src/app.ts")).toBe(true);
    expect(matchGlob("src/**", "src")).toBe(true); // trailing /** matches the dir itself
    expect(matchGlob("src/*", "src/app.ts")).toBe(true);
    expect(matchGlob("src/*", "src/a/b.ts")).toBe(false); // * does not cross /
    expect(matchGlob("**/a.ts", "a.ts")).toBe(true); // **/ matches zero dirs
    expect(matchGlob("**/a.ts", "x/y/a.ts")).toBe(true);
    expect(matchGlob("src/?.ts", "src/a.ts")).toBe(true);
    expect(matchGlob("src/?.ts", "src/ab.ts")).toBe(false);
    expect(matchGlob("src/[a-c].ts", "src/b.ts")).toBe(true);
    expect(matchGlob("src/[!a-c].ts", "src/d.ts")).toBe(true);
    expect(matchGlob("src/[!a-c].ts", "src/b.ts")).toBe(false);
  });

  it("rejects brace expansion, extglob, escapes, POSIX classes, *** and empty patterns", () => {
    for (const bad of [
      "src/{a,b}/**",
      "src/**(a)",
      "src/\\*.ts",
      "src/[[:alpha:]].ts",
      "src/***/a.ts",
      "",
      "src/[a.ts", // unclosed class
    ]) {
      expect(isSupportedGlob(bad)).toBe(false);
      expect(matchGlob(bad, "src/a.ts")).toBeNull();
    }
  });

  it("ordered patterns: later ! excludes, later positive re-includes (CP-G)", () => {
    const patterns = ["src/**", "!src/generated/**", "src/generated/keep.ts"];
    expect(matchOrderedPatterns(patterns, "src/app.ts").matched).toBe(true);
    expect(matchOrderedPatterns(patterns, "src/generated/a.ts").matched).toBe(
      false,
    );
    expect(matchOrderedPatterns(patterns, "src/generated/keep.ts").matched).toBe(
      true,
    );
  });

  it("a list of only-unsupported patterns reports them and matches nothing", () => {
    const result = matchOrderedPatterns(["src/{a,b}/**"], "src/a.ts");
    expect(result.matched).toBe(false);
    expect(result.unsupported).toEqual(["src/{a,b}/**"]);
  });

  it("an unsupported pattern is skipped, the supported ones still decide", () => {
    const result = matchOrderedPatterns(
      ["src/**", "src/{a,b}/**"],
      "src/app.ts",
    );
    expect(result.matched).toBe(true);
    expect(result.unsupported).toEqual(["src/{a,b}/**"]);
  });
});

describe("T006 branch + path AND", () => {
  it("both must match: branch-only match does not trigger (CP-F)", () => {
    const wf = makeWorkflow([
      makeEvent("pull_request", {
        branches: ["main"],
        paths: ["src/**"],
      }),
    ]);
    const ev = evaluateWorkflowTrigger(
      wf,
      prScenario({}, { changed_files: ["README.md"] }),
    );
    expect(ev.branch_match).toBe(true);
    expect(ev.path_match).toBe(false);
    expect(ev.triggered).toBe(false);
    expect(ev.reason).toBe("path_mismatch");
  });

  it("both must match: path-only match does not trigger (CP-F)", () => {
    const wf = makeWorkflow([
      makeEvent("pull_request", {
        branches: ["main"],
        paths: ["src/**"],
      }),
    ]);
    const ev = evaluateWorkflowTrigger(
      wf,
      prScenario({ base_branch: "release/1.0" }, { changed_files: ["src/app.ts"] }),
    );
    expect(ev.branch_match).toBe(false);
    expect(ev.path_match).toBe(true); // path stage is not reached; default stays true
    expect(ev.triggered).toBe(false);
    expect(ev.reason).toBe("branch_mismatch");
  });

  it("both match triggers", () => {
    const wf = makeWorkflow([
      makeEvent("pull_request", {
        branches: ["main"],
        paths: ["src/**"],
      }),
    ]);
    const ev = evaluateWorkflowTrigger(wf, prScenario());
    expect(ev.branch_match).toBe(true);
    expect(ev.path_match).toBe(true);
    expect(ev.triggered).toBe(true);
  });

  it("no filters at all triggers on any branch and any files", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("push")]),
      pushScenario({ branch: "anything" }, { changed_files: [] }),
    );
    expect(ev.triggered).toBe(true);
    expect(ev.path_file_results).toEqual([]);
  });
});

describe("T006 ignore lists", () => {
  it("branches-ignore inverts the match", () => {
    const wf = makeWorkflow([
      makeEvent("pull_request", { branches_ignore: ["release/*"] }),
    ]);
    expect(
      evaluateWorkflowTrigger(wf, prScenario({ base_branch: "main" })).triggered,
    ).toBe(true);
    const ignored = evaluateWorkflowTrigger(
      wf,
      prScenario({ base_branch: "release/1.0" }),
    );
    expect(ignored.branch_match).toBe(false);
    expect(ignored.triggered).toBe(false);
    expect(ignored.reason).toBe("branch_mismatch");
  });

  it("paths-ignore inverts the per-file match (docs-only change triggers)", () => {
    const wf = makeWorkflow([
      makeEvent("pull_request", { paths_ignore: ["docs/**"] }),
    ]);
    const docsOnly = evaluateWorkflowTrigger(
      wf,
      prScenario({}, { changed_files: ["docs/guide.md"] }),
    );
    // docs/guide.md is ignored -> no file passes -> no trigger.
    expect(docsOnly.path_match).toBe(false);
    expect(docsOnly.triggered).toBe(false);
    const src = evaluateWorkflowTrigger(
      wf,
      prScenario({}, { changed_files: ["docs/guide.md", "src/app.ts"] }),
    );
    expect(src.path_match).toBe(true);
    expect(src.path_file_results).toEqual([
      { file: "docs/guide.md", matched: false },
      { file: "src/app.ts", matched: true },
    ]);
    expect(src.triggered).toBe(true);
  });

  it("ordered negation inside paths-ignore is preserved", () => {
    const wf = makeWorkflow([
      makeEvent("pull_request", {
        paths_ignore: ["docs/**", "!docs/keep.md"],
      }),
    ]);
    const ev = evaluateWorkflowTrigger(
      wf,
      prScenario({}, { changed_files: ["docs/keep.md"] }),
    );
    // keep.md is re-included by the later positive pattern, so the
    // ignore list does NOT match it -> the file passes the filter.
    expect(ev.path_file_results).toEqual([
      { file: "docs/keep.md", matched: true },
    ]);
    expect(ev.triggered).toBe(true);
  });

  it("ordered negation inside paths: exclude then re-include (CP-G)", () => {
    const wf = makeWorkflow([
      makeEvent("push", {
        paths: ["src/**", "!src/generated/**", "src/generated/keep.ts"],
      }),
    ]);
    const ev = evaluateWorkflowTrigger(
      wf,
      pushScenario(
        {},
        { changed_files: ["src/generated/a.ts", "src/generated/keep.ts"] },
      ),
    );
    expect(ev.path_file_results).toEqual([
      { file: "src/generated/a.ts", matched: false },
      { file: "src/generated/keep.ts", matched: true },
    ]);
    expect(ev.path_match).toBe(true);
    expect(ev.triggered).toBe(true);
  });

  it("path_file_results preserve listed order and report every evaluated file", () => {
    const ev = evaluateWorkflowTrigger(
      makeWorkflow([makeEvent("pull_request", { paths: ["src/**"] })]),
      prScenario({}, { changed_files: ["README.md", "src/a.ts", "docs/x.md"] }),
    );
    expect(ev.path_file_results).toEqual([
      { file: "README.md", matched: false },
      { file: "src/a.ts", matched: true },
      { file: "docs/x.md", matched: false },
    ]);
  });
});

describe("T006 filter mutual exclusion and unsupported globs", () => {
  it("branches + branches-ignore together is INVALID at build time", () => {
    const built = buildWorkflowIR(
      "name: ci\non:\n  push:\n    branches: ['main']\n    branches-ignore: ['release/*']\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
      "ci.yml",
      "T6-F1",
    );
    expect(built.ok).toBe(false);
    expect(built.status).toBe("INVALID");
    expect(built.errors).toContain("branches_and_branches_ignore_both_present");
  });

  it("an unsupported glob in a filter makes the whole workflow UNKNOWN", () => {
    const built = buildWorkflowIR(
      "name: ci\non:\n  push:\n    branches: ['main']\n    paths: ['src/{a,b}/**']\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
      "ci.yml",
      "T6-F2",
    );
    expect(built.ok).toBe(false);
    expect(built.status).toBe("UNKNOWN");
    expect(built.unsupported).toContain("unsupported_glob:src/{a,b}/**");
  });

  it("an unsupported glob reached at evaluation time yields UNKNOWN, not a guess", () => {
    // Build the IR by hand (bypassing the parser's UNKNOWN gate) to
    // prove the evaluator itself fails closed on unsupported patterns.
    const wf = makeWorkflow([
      makeEvent("pull_request", { paths: ["src/{a,b}/**"] }),
    ]);
    const ev = evaluateWorkflowTrigger(wf, prScenario());
    expect(ev.path_match).toBeNull();
    expect(ev.triggered).toBeNull();
    expect(ev.reason).toBe("unknown");
    expect(ev.unsupported).toEqual(["src/{a,b}/**"]);
  });
});
