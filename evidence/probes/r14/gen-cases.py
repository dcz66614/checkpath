"""Generate cases.json for the T013 R14 independent probe.

All shapes rebuilt INDEPENDENTLY from the R13 review report text
(INDEPENDENT_REVIEW_R13.md §2/§3/§4) and the FIX-P0-14 report's
threshold description (§2) — NOT copied from the fixer's
evidence/probes/fix-p0-14/cases.json. Anchor names, values and
events differ from the fixer's matrix throughout (a/b instead of
x/y; 7/2/5/9 instead of 1; pull_request instead of push where an
event appears).

Groups:
  P  lone-doc P0 core (R13 §2.1): &a: 7 / &a: alone.
  C  controls that must MATCH (quoted empty key, mapping values,
     lone scalars, quoted-empty-key + full workflow, bare/explicit
     empty key both-reject).
  D  discriminant necessity: shapes violating exactly one of the
     five conditions of _is_lone_anchored_empty_key_doc, plus
     shapes where the rule must fire through a tag/sequence/
     doc-mark/comment. Any DIFF here is a NEW finding to analyse.
  R  the 11 disclosed residual rows (fixer report §7), rebuilt
     with different anchors/values/events. At R14 they were expected
     DIFF in trigger mode only, jobs mode MATCH; the residuals were
     closed by later fixes (verified 78/78 MATCH at the R19 re-run,
     2026-11-09), so T014 (2026-11-10) cleared the expectation:
     these rows are now ordinary MATCH rows in both modes. The
     "CLOSED RESIDUAL" notes below still name the original
     R14-time mechanism for the historical record.
  G  the R6 5 shapes (R10 §2.1 via R13 §1), rebuilt with the
     standard workflow scaffold.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

WF = (
    "name: probe\n"
    "on: push\n"
    "jobs:\n"
    "  test:\n"
    "    runs-on: ubuntu-latest\n"
    "    steps:\n"
    "      - run: echo hi\n"
)

# (id, yaml, mode, note, expected_diff)
ROWS = [
    # --- P: lone-doc P0 core ---
    ("r14-p0-scalar", "&a: 7\n", "both",
     "P0 core: lone &a: 7", False),
    ("r14-p0-null", "&a:\n", "both",
     "P0 core: lone &a: (null)", False),
    # --- C: controls, must MATCH ---
    ("r14-c-quoted", '"": 9\n', "both",
     "CONTROL: quoted empty key, cond 2 violated (ScalarToken key)", False),
    ("r14-c-squoted", "'': 9\n", "both",
     "CONTROL: single-quoted empty key", False),
    ("r14-c-flowmap", "&a: {b: 3}\n", "both",
     "CONTROL: flow-map value, cond 5 violated", False),
    ("r14-c-blockmap", "&a:\n  b: 3\n", "both",
     "CONTROL: block-map value, cond 5 violated", False),
    ("r14-c-lone-scalar", "42\n", "both",
     "CONTROL: lone scalar", False),
    ("r14-c-lone-anchored", "&a hello\n", "both",
     "CONTROL: lone anchored scalar", False),
    ("r14-c-lone-tagged", "!bar 7\n", "both",
     "CONTROL: lone tagged scalar", False),
    ("r14-c-quoted-wf", '"": 1\n' + WF, "both",
     "CONTROL: quoted empty key + full workflow", False),
    ("r14-c-explicit", "? : 1\n", "both",
     "CONTROL: explicit empty key, both yaml_parse_error", False),
    ("r14-c-bare-colon", ": 1\n", "both",
     "CONTROL: bare colon, both yaml_parse_error", False),
    # --- D: discriminant necessity ---
    ("r14-d-tagval", "&a: !bar 2\n", "both",
     "value tag skipped, rule must fire", False),
    ("r14-d-flowseq-on", "&a: [{on: pull_request}]\n", "both",
     "flow-seq value containing on; doc is a sequence, rule must fire", False),
    ("r14-d-blockseq", "&a:\n  - b\n", "both",
     "block-seq value; rule must fire", False),
    ("r14-d-docmark", "---\n&a: 5\n", "both",
     "explicit doc start; rule must fire", False),
    ("r14-d-docend", "&a: 5\n...\n", "both",
     "explicit doc end; rule must fire", False),
    ("r14-d-comment", "&a: 5  # note\n", "both",
     "trailing comment; rule must fire", False),
    ("r14-d-alias", "&a: *missing\n", "both",
     "undefined alias value", False),
    ("r14-d-null-space", "&a: \n", "both",
     "null value, trailing space", False),
    ("r14-d-two-pair-real", "&a: 7\nname: probe\n", "both",
     "cond 1 violated: doc has a real key; rule must NOT fire", False),
    ("r14-d-seq-anchor-item", "&a:\n  - &b: 2\n", "both",
     "block-seq value, anchored-empty-key item; rule must fire", False),
    # --- R: 11 disclosed residuals — CLOSED (T014 2026-11-10).
    # At R14 these were trigger DIFF / jobs MATCH; later fixes closed
    # them (R19 re-run: 78/78 MATCH, all 11 flagged STALE). Expectation
    # is now MATCH in both modes; the notes keep the R14-time
    # mechanism for the historical record. ---
    ("r14-r-on-flow", "&a: {on: pull_request}\n", "both",
     "CLOSED RESIDUAL (a): flow-map value WITH on, TS VALID", False),
    ("r14-r-on-block", "&a:\n  on: pull_request\n", "both",
     "CLOSED RESIDUAL (a): block-map value WITH on, TS VALID", False),
    ("r14-r-on-tag", "&a: !bar {on: pull_request}\n", "both",
     "CLOSED RESIDUAL (a): tagged flow-map value WITH on, TS VALID", False),
    ("r14-r-2anchor-scalar", "&a: &b 2\n", "both",
     "CLOSED RESIDUAL (b): second anchor on scalar value, TS yaml_parse_error", False),
    ("r14-r-2anchor-seq", "&a: &b [2]\n", "both",
     "CLOSED RESIDUAL (b): second anchor on seq value, TS yaml_parse_error", False),
    ("r14-r-2anchor-null", "&a: &b\n", "both",
     "CLOSED RESIDUAL (b): second anchor on null value, TS yaml_parse_error", False),
    ("r14-r-tagkey", "!bar &a: 2\n", "both",
     "CLOSED RESIDUAL (c): tag on the key, TS yaml_parse_error (E05)", False),
    ("r14-r-tagkey-handle", "!!str &a: 2\n", "both",
     "CLOSED RESIDUAL (c): handle tag on the key, TS yaml_parse_error", False),
    ("r14-r-tagkey-docmark", "---\n!bar &a: 2\n", "both",
     "CLOSED RESIDUAL (c): docmark + tag on key, TS yaml_parse_error", False),
    ("r14-r-unglued", "&a : 2\n", "both",
     "CLOSED RESIDUAL (d): space between anchor and colon, TS yaml_parse_error", False),
    ("r14-r-nested-block", "&a:\n  &b: 2\n", "both",
     "CLOSED RESIDUAL (e): nested block-map value, anchored key, TS yaml_parse_error", False),
    ("r14-r-nested-flow", "&a: {&b: 2}\n", "both",
     "CONTROL twin of (e): flow-map value, anchored key; must MATCH", False),
    # --- G: R6 5 shapes (R10 §2.1) ---
    ("r14-g-extra", "m: {a: 1\n# note\n, b: 2}\n" + WF, "both",
     "R6 core: standalone comment line indent 0 after complete pair", False),
    ("r14-g-on", "on: {push: {types: [opened]}\n# note\n, pull_request}\n" + WF, "both",
     "R6 on: slot", False),
    ("r14-g-on-unsupported", "on: {push: {types: [opened]}\n# note\n, pull}\n" + WF, "both",
     "R6 on: slot, unsupported event pull", False),
    ("r14-g-close", "m: {a: 1, b: 2\n# note\n}\n" + WF, "both",
     "R6 close: comment before flow close", False),
    ("r14-g-nestedblock", "x:\n  m: {a: 1\n# note\n   , b: 2}\n" + WF, "both",
     "R6 nested block: comment indent 0 inside flow mapping", False),
]

cases = [
    {"id": i, "yaml": y, "mode": m, "note": n, "expected_diff": e}
    for (i, y, m, n, e) in ROWS
]
(HERE / "cases.json").write_text(
    json.dumps(cases, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {len(cases)} rows, {sum(1 for c in cases if c['expected_diff'])} expected-diff rows")
