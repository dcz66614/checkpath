// T005 — canonical JSON + SHA-256 contract tests (IMPLEMENTATION_PLAN §8).
//
// The canonical form must match oracle/checkpath_oracle/canonical.py
// byte-for-byte. The strongest check here is end-to-end: rebuilding the
// exact S0 input object for fixture E2E-01 from its frozen files and
// hashing it must reproduce the frozen expected.json input_sha256
// (0cf82e76...), which the Python Oracle independently produced in T004.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../src/core/canonical-json.js";
import { sha256Canonical, sha256Hex } from "../../../src/core/sha256.js";

const here = dirname(fileURLToPath(import.meta.url));
const s0Dir = join(here, "../../fixtures/s0");

describe("T005 canonical JSON", () => {
  it("sorts object keys recursively and uses compact separators", () => {
    expect(canonicalJson({ b: 1, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":1}');
  });

  it("preserves array order", () => {
    expect(canonicalJson({ files: ["b.txt", "a.txt"] })).toBe('{"files":["b.txt","a.txt"]}');
  });

  it("keeps non-ASCII unescaped and handles scalars", () => {
    expect(canonicalJson({ s: "中文", n: null, t: true, f: 1.5 })).toBe('{"f":1.5,"n":null,"s":"中文","t":true}');
  });

  it("throws on values that cannot be canonicalized", () => {
    expect(() => canonicalJson(undefined)).toThrow("cannot canonicalize");
    expect(() => canonicalJson({ a: undefined })).toThrow("cannot canonicalize");
  });

  it("sha256Hex matches known vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("sha256Canonical equals sha256Hex(canonicalJson(value))", () => {
    const value = { b: [3, 2], a: "x" };
    expect(sha256Canonical(value)).toBe(sha256Hex(canonicalJson(value)));
  });

  it("reproduces the frozen E2E-01 input_sha256 from its fixture files", () => {
    const fixtureDir = join(s0Dir, "E2E-01-cp-a-pr-docs-only");
    const scenario = JSON.parse(readFileSync(join(fixtureDir, "scenario.json"), "utf-8"));
    const requiredChecks = JSON.parse(readFileSync(join(fixtureDir, "required-checks.json"), "utf-8"));
    const expected = JSON.parse(readFileSync(join(fixtureDir, "expected.json"), "utf-8"));
    const yamlText = readFileSync(join(fixtureDir, "workflow.yml"), "utf-8");
    // Same input object shape as src/core/e2e.ts evaluateE2E.
    const inputObj = {
      required_checks: requiredChecks,
      scenario,
      workflows: [{ path: "workflow.yml", yaml: yamlText }],
    };
    expect(sha256Canonical(inputObj)).toBe(expected.input_sha256);
    expect(expected.input_sha256).toBe("0cf82e76341cef173357a5dd13ddf36aa32de91e0f5748c03380962b3e1d9877");
  });
});
