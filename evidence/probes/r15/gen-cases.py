"""T013 R15 independent probe case generator.

Cases are rebuilt from the R14 review report §2/§2.5 and the
FIX-P0-15 report §2/§7 text, with anchor names, values and events
all different from the fixer's matrix (b/c/z anchors, values 2/7/9,
event pull_request). NOT copied from the fixer's cases.json.

Groups:
  A  R14's 5 P0 families, rebuilt (expected MATCH after the fix).
  B  R13 lone-doc P0 controls (expected MATCH, no regression).
  C  The disclosed residual rows from FIX-P0-15 §7, rebuilt
     (each row graded independently in §2 at R15 time). At R15
     they were expected DIFF per their diff_modes; the residuals
     were closed by later fixes (verified 122/122 MATCH at the
     R19 re-run, 2026-11-09), so T014 (2026-11-10) cleared the
     expectation: these rows are now ordinary MATCH rows. The
     notes below still name the original R15-time mechanism for
     the historical record.
  D  (d)-tag boundary controls (expected MATCH per fixer §2.4).

Usage: python3 evidence/probes/r15/gen-cases.py
Writes evidence/probes/r15/cases.json (deterministic).
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

WF_JOBS = (
    "on: push\n"
    "jobs:\n"
    "  test:\n"
    "    runs-on: ubuntu-latest\n"
    "    steps:\n"
    "      - run: echo hi\n"
)
WF_JOBS_FLOW = (
    "on: push\n"
    "jobs:\n"
    "  test:\n"
    "    runs-on: ubuntu-latest\n"
    "    steps:\n"
    "      - run: echo hi\n"
)


def row(cid, yaml, mode="both", expected_diff=False, note="",
        diff_modes=None):
    return {"id": cid, "yaml": yaml, "mode": mode,
            "expected_diff": expected_diff, "note": note,
            "diff_modes": diff_modes or (["trigger", "jobs"] if expected_diff
                                         else [])}


CASES = [
    # ---- Group A(a): unwrap ----
    row("r15-a-flow", "&b: {on: pull_request}\n"),
    row("r15-a-block", "&b:\n  on: pull_request\n"),
    row("r15-a-tagmap", "&b: !bar {on: pull_request}\n"),
    row("r15-a-full-flow",
        "&b: {on: push, jobs: {test: {runs-on: ubuntu-latest, "
        "steps: [{run: echo hi}]}}}\n"),
    row("r15-a-full-block",
        "&b:\n  on: push\n  jobs:\n    test:\n"
        "      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n"),
    row("r15-a-jobs-only",
        "&b: {jobs: {test: {runs-on: ubuntu-latest, "
        "steps: [{run: echo hi}]}}}\n"),
    row("r15-a-str-flow", "&b: !!str {on: pull_request}\n"),
    row("r15-a-str-block", "&b: !!str\n  on: pull_request\n"),
    row("r15-a-self-alias", "&b: {on: *b}\n"),
    row("r15-a-alias-inside", "&b: {a: &c 1, on: *c}\n"),
    row("r15-a-name-only", "&b: {name: probe}\n"),
    row("r15-a-bool-key", "&b: {True: pull_request}\n"),
    # ---- Group A(b): second anchor on the value node ----
    row("r15-b-val", "&b: &c 2\n"),
    row("r15-b-seq", "&b: &c [2]\n"),
    row("r15-b-null", "&b: &c\n"),
    row("r15-b-flowmap", "&b: &c {a: 1}\n"),
    row("r15-b-alias-defined", "q: &z 9\n&b: *z\n"),
    row("r15-b-alias-undef", "&b: *z\n"),
    row("r15-b-nonempty-key", "&b k: &c 2\n"),
    row("r15-b-unglued-2anchor", "&b : &c 2\n"),
    row("r15-b-wf", "m: &b &c 2\n" + WF_JOBS),
    # ---- Group A(c): tagged anchored empty key ----
    row("r15-c-key", "!bar &b: 2\n"),
    row("r15-c-handle", "!!str &b: 2\n"),
    row("r15-c-docmark", "---\n!bar &b: 2\n"),
    row("r15-c-nested", "m:\n  !bar &b: 2\n" + WF_JOBS),
    row("r15-c-flow", "m: {!bar &b: 2}\n" + WF_JOBS),
    row("r15-c-seqitem", "m:\n  - !bar &b: 2\n" + WF_JOBS),
    row("r15-c-unglued", "!bar &b : 2\n"),
    row("r15-c-explicit", "m:\n  ? !bar &b: 2\n" + WF_JOBS),
    # ---- Group A(d): unglued anchor-colon ----
    row("r15-d-lone", "&b : 2\n"),
    row("r15-d-null", "&b :\n"),
    row("r15-d-nested", "m:\n  &b : 2\n" + WF_JOBS),
    row("r15-d-flow", "m: {&b : 2}\n" + WF_JOBS),
    row("r15-d-tag-nested-first", "m:\n  !bar &b : 2\n" + WF_JOBS),
    # R15-time exception: C3 overfire, root 1st pair (fixer §2.4
    # control claim wrong). CLOSED (T014 2026-11-10): now MATCH,
    # expectation cleared.
    row("r15-d-tag-root-first", "!bar &b : 2\n" + WF_JOBS,
        note="C3 overfire, root 1st pair — NEW: "
        "fixer §2.4 control claim wrong (C3 fires, not (d))"),
    row("r15-d-tag-seqitem", "m:\n  - !bar &b : 2\n" + WF_JOBS),
    # ---- Group A(e): nested block mapping with anchored key ----
    row("r15-e-nested", "&b:\n  &c: 2\n"),
    row("r15-e-nested-null", "&b:\n  &c:\n"),
    row("r15-e-nested-tagkey", "&b:\n  !bar &c: 2\n"),
    row("r15-e-deeper", "a:\n  &b:\n    &c: 2\n"),
    row("r15-e-flow", "&b: {&c: 2}\n"),
    row("r15-e-2pair", "&b:\n  &c: 2\n  z: 2\n"),
    row("r15-e-nonempty", "&b:\n  &c k: 2\n"),
    # ---- Group B: R13 lone-doc P0 controls ----
    row("r15-f-lone-7", "&b: 7\n"),
    row("r15-f-lone-null", "&b:\n"),
    row("r15-f-quoted", '"": 9\n'),
    row("r15-f-mapval-flow", "&b: {c: 3}\n"),
    row("r15-f-mapval-block", "&b:\n  c: 3\n"),
    # ---- Group C: FIX-P0-15 §7 residuals — CLOSED (T014 2026-11-10).
    # At R15 these were expected DIFF per diff_modes; later fixes
    # closed them (R19 re-run: 122/122 MATCH, all 24 stale-flag
    # checks now MATCH). Expectation is now MATCH in both modes;
    # the notes keep the R15-time mechanism for the record. ----
    # (1) C3 overreach: tag + unglued anchored empty key at pair 2+.
    row("r15-r1-c3-root2nd", "a: 1\n!bar &b : 2\n" + WF_JOBS,
        note="C3 overfire, root 2nd pair"),
    row("r15-r1-c3-nested2nd", "m:\n  a: 1\n  !bar &b : 2\n" + WF_JOBS,
        note="C3 overfire, nested 2nd pair"),
    # (2) no-space &x:!!str scanner layer. At R15 the flow row was
    # trigger DIFF / jobs MATCH (lone doc, jobs both []), so jobs
    # mode was NOT expected_diff. CLOSED (T014): now MATCH in both
    # modes; the explicit diff_modes below is removed.
    row("r15-r2-str-flow-nospace", "&b:!!str {on: pull_request}\n",
        note="scanner: no-space tag, flow"),
    row("r15-r2-str-block-nospace",
        "&b:!!str\n  on: pull_request\n  jobs:\n    test:\n"
        "      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n",
        note="scanner: no-space tag, block"),
    # (3) !!int/!!bool/!!float on collection values crash the Oracle.
    row("r15-r3-int", "&b: !!int {on: pull_request}\n",
        note="loader crash TypeError"),
    row("r15-r3-bool", "&b: !!bool {on: pull_request}\n",
        note="loader crash TypeError"),
    row("r15-r3-int-pos", "m: !!int {a: 1}\n" + WF_JOBS,
        note="loader crash, workflow position"),
    row("r15-r3-float-pos", "m: !!float {a: 1}\n" + WF_JOBS,
        note="loader crash AttributeError, workflow position"),
    row("r15-r3-scalar-ok", "a: !!int 1\n" + WF_JOBS,
        note="control: scalar tag, both VALID"),
    row("r15-r3-on-tag", "on: !!int {push: {}}\njobs:\n  test:\n"
        "    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
        note="loader crash at on-value; fixer §7.3 "
        "control claim wrong (TS VALID, Oracle exits 1)"),
    row("r15-r3-on-bool", "on: !!bool {push: {}}\njobs:\n  test:\n"
        "    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
        note="loader crash at on-value, TypeError"),
    row("r15-r3-on-float", "on: !!float {push: {}}\njobs:\n  test:\n"
        "    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
        note="loader crash at on-value, AttributeError"),
    row("r15-r3-on-str", "on: !!str {push: {}}\njobs:\n  test:\n"
        "    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
        # At R15: loader boundary, trigger DIFF only. CLOSED (T014):
        # now MATCH in both modes; explicit diff_modes removed.
        note="loader boundary: TS VALID vs Oracle UNKNOWN"),
]

if __name__ == "__main__":
    (HERE / "cases.json").write_text(
        json.dumps(CASES, indent=1, ensure_ascii=False) + "\n",
        encoding="utf-8")
    print(f"wrote {len(CASES)} cases")
