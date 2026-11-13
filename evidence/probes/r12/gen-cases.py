"""Generate evidence/probes/r12/cases.json for the T013 R12 independent review.

All shapes rebuilt by the R12 reviewer from the R11 review report text
(§2.1 P0-A, §3.1 P0-B) and the FIX-P0-12 report §7 text (residuals),
NOT copied from the fixer's cases.json. Wrapper is a full workflow doc.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

SUFFIX = (
    "name: probe\n"
    "on: push\n"
    "jobs:\n"
    "  test:\n"
    "    runs-on: ubuntu-latest\n"
    "    steps:\n"
    "      - run: echo hi\n"
)
# For shapes that ARE the `on:` slot, the wrapper has no `on:` line.
SUFFIX_NO_ON = (
    "name: probe\n"
    "jobs:\n"
    "  test:\n"
    "    runs-on: ubuntu-latest\n"
    "    steps:\n"
    "      - run: echo hi\n"
)


def w(shape: str) -> str:
    return shape + SUFFIX


def w_on(shape: str) -> str:
    return shape + SUFFIX_NO_ON


CASES = [
    # ---- P0-A rebuild (R11 §2.1) ----
    ("r12-a1-anchor-nospace-flowmap", "P0-A rebuilt from R11 §2.1: anchor nospace in flow-map value", "m: {a: &x#c\n 1}\n"),
    ("r12-a2-tag-nospace-flowmap", "P0-A rebuilt from R11 §2.1: tag nospace in flow-map value", "m: {a: !!str#c\n 1}\n"),
    ("r12-a3-anchor-nospace-on", "P0-A rebuilt from R11 §2.1: anchor nospace in the on: slot (both INVALID, different codes in R11)", "on: {push: &x#c\n pull_request}\n"),
    ("r12-a4-anchor-nospace-flowseq", "P0-A rebuilt from R11 §2.1: anchor nospace in flow sequence", "m: [&x#c\n 1]\n"),
    # ---- P0-A boundaries (must stay MATCH) ----
    ("r12-a5-anchor-space-comment", "Boundary: anchor + space + comment must still accept both sides", "m: {a: &x #c\n 1}\n"),
    ("r12-a6-anchor-nospace-quoted", "Boundary: anchor-nospace inside double quotes is scalar content", 'm: {a: "&x#c", b: 1}\n'),
    ("r12-a7-anchor-mid-scalar", "Boundary: & mid-plain-scalar is literal content", "m: {a: b&x#c}\n"),
    ("r12-a8-hash-in-scalar", "Boundary: # mid-plain-scalar is literal content", "m: {a: x#y}\n"),
    ("r12-a9-anchor-colon-implicit-key", "Boundary (fixer C01): anchor-colon in flow-map implicit-key position must not trigger", "m: {&x: 1}\n"),
    ("r12-a10-anchor-colon-implicit-key-pair", "Boundary (fixer C21): anchor-colon implicit key + following pair", "m: {&x: 1, b: 2}\n"),
    ("r12-a11-unknown-tag", "Boundary: well-formed unknown tag both sides accept", "m: {a: !foo}\n"),
    ("r12-a12-unknown-tag-colon", "Boundary: unknown tag with colon suffix both sides accept", "m: {a: !foo:bar}\n"),
    ("r12-a13-verbatim-tag", "Boundary: verbatim tag both sides accept", "m: {a: !<tag:x>}\n"),
    ("r12-a14-anchor-then-comma", "Boundary: anchor followed by comma must accept", "m: {a: &x, b: 1}\n"),
    ("r12-a15-anchor-flow-end", "Boundary: anchor at flow end must accept", "m: {a: &x}\n"),
    ("r12-a16-anchor-colon-value-pos", "Boundary (fixer C02): anchor-colon in VALUE position must trigger (both INVALID)", "m: {a: &x: 1}\n"),
    ("r12-a17-anchor-colon-block-seq", "Boundary (fixer C06): anchor-colon in block-seq item, implicit key", "m:\n  - &x: 1\n"),
    ("r12-a18-anchor-colon-flowseq-key", "Boundary (fixer D01): anchor-colon implicit key in flow seq", "m: [&x: 1]\n"),
    ("r12-a19-double-property-chain", "Boundary: double property chain both INVALID (MATCH)", "m: {a: &x &y: 1}\n"),
    ("r12-a20-tag-nospace-unknown", "P0-A variant: unknown tag + nospace # in flow-map value", "m: {a: !foo#c\n 1}\n"),
    ("r12-a21-tag-space-comment", "Boundary: tag + space + comment must still accept", "m: {a: !!str #c\n 1}\n"),
    # ---- P0-B rebuild (R11 §3.1) ----
    ("r12-b1-null-ml-plain", "P0-B rebuilt from R11 §3.1: null-value multi-line plain key", "m: {a\n b}\n"),
    ("r12-b2-null-ml-dq", "P0-B rebuilt from R11 §3.1: null-value multi-line double-quoted key", 'm: {"a\n b"}\n'),
    ("r12-b3-null-ml-hash-key", "P0-B rebuilt from R11 §3.1: # inside plain-scalar key, not a comment", "m: {a:#c\n 1}\n"),
    ("r12-b4-null-ml-then-pair", "P0-B rebuilt from R11 §3.1: null-ml key then a pair", "m: {a\n b, c: 1}\n"),
    ("r12-b5-null-ml-nested", "P0-B rebuilt from R11 §3.1: nested null-ml key", "m: {n: {a\n b}}\n"),
    ("r12-b6-null-ml-hash-value", "P0-B rebuilt from R11 §3.1: null-ml key with # in second pair", "m: {a: 1, b:#c\n 2}\n"),
    ("r12-b7-null-ml-after-pair", "P0-B rebuilt from R11 §3.1 (R11-B7): null-ml key after a complete pair", "m: {a: 1, b\n c}\n"),
    ("r12-b8-null-ml-sq", "P0-B rebuilt from R11 §3.1 (R11-B8): null-ml single-quoted key", "m: {'a\n b'}\n"),
    # ---- P0-B S1 target must stay rejected (valued multi-line keys) ----
    ("r12-b9-valued-ml", "S1 target intact: valued multi-line key must still be rejected both sides", "m: {a\n b: 1}\n"),
    ("r12-b10-valued-ml-after-pair", "S1 target intact: valued multi-line key after a pair", "m: {a: 1, b\n c: 2}\n"),
    ("r12-b11-valued-ml-null-value", "S1 discriminant edge: colon present but null value — PyYAML rejects", "m: {a\n b:}\n"),
    ("r12-b12-valued-ml-null-value-dq", "S1 discriminant edge: quoted key, colon, null value", 'm: {"a\n b":}\n'),
    ("r12-b13-valued-ml-colon-nl", "S1 discriminant edge: colon then newline before close", "m: {a\n b:\n}\n"),
    ("r12-b14-b41-comment-comma", "B41: null-ml key + inline comment + comma — both INVALID via other rules", "m: {a\n b # c\n, d: 1}\n"),
    ("r12-b15-valued-ml-then-pair", "S1 target intact: valued multi-line key then a pair", "m: {a\n b: 1, c: 2}\n"),
    ("r12-b16-valued-ml-colon-after-comment", "S1 discriminant edge: colon on a later line after a comment", "m: {a\n b # note\n: 1}\n"),
    ("r12-b17-mixed-null-and-valued", "Composite: null-ml key (accept) + valued-ml key (reject) — both INVALID overall", "m: {a\n b, c\n d: 1}\n"),
    # ---- Residuals (rebuilt from FIX-P0-12 report §7 text) ----
    ("r12-r1-a45-anchored-empty-key", "Residual §7.1 A45: anchored empty key at document root", None),
    ("r12-r2-a70-tag-brackets", "Residual §7.2 A70: tag suffix containing [ ]", "m: {a: !foo[bar] 1}\n"),
    ("r12-r3-a60-comma-suffix", "Residual §7.3 A60: tag suffix swallows flow comma", "m: {a: !foo, b: 1}\n"),
    ("r12-r4-x04-comma-suffix-2pairs", "Residual §7.3 X04: comma-suffix family, another pair follows", "m: {a: !foo, b: 1, c: 2}\n"),
    ("r12-r5-x08-rbrack-seq", "Residual §7.4 X08 (reverse): tag suffix swallows ]", "m: [!foo] 1]\n"),
    ("r12-r6-x09-rbrack-seq2", "Residual §7.4 X09 (reverse): ]-suffix family, comma after swallowed ]", "m: [!foo], 1]\n"),
    ("r12-r7-x11-comma-block", "Residual §7.5 X11 (reverse): block variant, tag-comma then next pair", "a: !foo,\n  b: 1\n"),
    ("r12-r8-y03-comma-quoted", "Residual §7.3 Y03: comma-suffix family, quoted node after swallowed comma", 'm: {a: !foo, "b": 1}\n'),
    ("r12-r9-y05-comma-nl", "Residual §7.3 Y05: comma-suffix family, node on next line", "m: {a: !foo,\n b: 1}\n"),
    ("r12-r10-y08-comma-anchor", "Residual §7.3 Y08: comma-suffix family, anchor-prefixed node", "m: {a: !foo, &x 1: 2}\n"),
    ("r12-r11-y09-comma-num", "Residual §7.3 Y09: comma-suffix family, numeric node", "m: {a: !foo, 1: 2}\n"),
    ("r12-r12-y10-comma-null", "Residual §7.3 Y10: comma-suffix family, null-value node", "m: {a: !foo, b:}\n"),
    # ---- Comma-suffix controls (must stay MATCH, fixer §7.3) ----
    ("r12-c1-x02-comma-mid-suffix", "Control (fixer X02): comma in the middle of the suffix", "m: {a: !foo,bar 1}\n"),
    ("r12-c2-y01-seq-pair", "Control (fixer Y01): flow seq with pair — PyYAML accepts", "m: [!foo, a: 1]\n"),
    ("r12-c3-x13-space-before-comma", "Control (fixer X13): space before comma, tag ends first", "m: {a: !foo , b: 1}\n"),
    ("r12-c4-x05-seq-comma", "Control (fixer X05): flow seq, swallowed comma harmless", "m: [!foo, 1]\n"),
    # ---- R6 regression (rebuilt from R10 report §2.1) ----
    ("r12-r6-1-extra", "R6 regression (R10 §2.1 R6-EXTRA): comment indent 0 after complete pair", "m: {a: 1\n# note\n, b: 2}\n"),
    ("r12-r6-2-on", "R6 regression (R10 §2.1 R6-ON): on: slot comment indent 0", "on: {push: {types: [opened]}\n# note\n, pull_request}\n"),
    ("r12-r6-3-on-unsupported", "R6 regression (R10 §2.1 R6-ON-UNSUPPORTED): on: slot, unsupported event pull", "on: {push: {types: [opened]}\n# note\n, pull}\n"),
    ("r12-r6-4-close", "R6 regression (R10 §2.1 R6-CLOSE): comment before closing brace", "m: {a: 1, b: 2\n# note\n}\n"),
    ("r12-r6-5-nestedblock", "R6 regression (R10 §2.1 R6-NESTEDBLOCK): nested block, comment 0, comma 3", "x:\n  m: {a: 1\n# note\n   , b: 2}\n"),
]

rows = []
for cid, note, shape in CASES:
    if cid == "r12-r1-a45-anchored-empty-key":
        yaml_text = "&x: 1\n" + SUFFIX
    elif cid.startswith("r12-r6-2") or cid.startswith("r12-r6-3") or cid.startswith("r12-a3"):
        yaml_text = w_on(shape)
    else:
        yaml_text = w(shape)
    rows.append({"id": cid, "mode": "both", "note": note, "yaml": yaml_text})

(HERE / "cases.json").write_text(
    json.dumps(rows, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
)
print(f"wrote {len(rows)} cases")
