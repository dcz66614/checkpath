// T009 — Witness determinism test.
//
// Runs the witness reducer 100 times over the whole 44-case suite
// and asserts the canonical SHA-256 of the full output is identical
// every time (IMPLEMENTATION_PLAN §6 T009: "100 次运行 witness
// SHA-256 稳定"). The reducer is a pure function of its input — no
// dates, no randomness, no environment reads — so the hash must be
// unique.
//
// NOTE on the plan §7 script: `vitest run tests/unit/witness
// --repeat=100` cannot run — vitest 5.1 has no `--repeat` option
// (it fails with `CACError: Unknown option '--repeat'`). The
// repetition therefore lives in this file (100 explicit runs), and
// `npm run test:witness:determinism` runs this file. Same script
// name, same PASS semantics (100 runs, one hash).

import { describe, expect, it } from "vitest";
import { sha256Canonical } from "../../../src/core/sha256.js";
import { buildWitnesses } from "../../../src/core/witness-reducer.js";
import { loadWitnessSuite } from "./witness-suite.js";

const { cases } = loadWitnessSuite();

describe("T009 witness determinism", () => {
  it(
    "100 repetitions over all 44 suite cases yield exactly one canonical SHA-256",
    () => {
      const hashes = new Set<string>();
      for (let run = 0; run < 100; run++) {
        const outputs = cases.map((c) => buildWitnesses(c.inputs));
        hashes.add(sha256Canonical(outputs));
      }
      expect(hashes.size).toBe(1);
    },
    300_000,
  );
});
