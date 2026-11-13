"""Generate cases.json for the FIX-P0-14 probe matrix from the mapping
shape grids (map-p0-14.py groups A + B and the extra boundary probe).

57 rows x 2 modes = 114 checks. 11 rows are flagged
`known_divergence` (see README §7 and the TASK_REPORT §7): lone-doc
anchored-empty-key shapes the classification alignment deliberately
does NOT close — mapping values containing `on` (TS VALID), a second
anchor on the value node, a tag on the key, an unglued anchor-colon,
and a nested block-map value with an anchored key (all TS
yaml_parse_error vs Oracle missing_on_key). Every other row must
match after the fix.

Usage (from the repo root):
    python3 evidence/probes/fix-p0-14/gen-cases.py
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

_spec = importlib.util.spec_from_file_location("map_p0_14", HERE / "map-p0-14.py")
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
A, B = _mod.A, _mod.B

# Extra boundary shapes (from the extra boundary probe; same shape
# grid as map-p0-14.py groups, ids x-*).
X = [
    ("x-nested-block", "&x:\n  &y: 1\n", "RESIDUAL: block-map value, single anchored-empty-key pair (TS yaml_parse_error)"),
    ("x-nested-flow", "&x: {&y: 1}\n", "control: flow-map value, single anchored-empty-key pair"),
    ("x-nested-mixed", "&x:\n  &y: 1\n  a: 2\n", "control: block-map value, anchored key + real key"),
    ("x-nested-flow-mixed", "&x: {&y: 1, a: 2}\n", "control: flow-map value, anchored key + real key"),
    ("x-tag-noval", "&x: !foo\n", "tag value with no node (null)"),
    ("x-anchor-seq", "&x: &y [1]\n", "RESIDUAL: anchored seq value (TS yaml_parse_error, second anchor)"),
    ("x-anchor-null", "&x: &y\n", "RESIDUAL: anchored null value (TS yaml_parse_error, second anchor)"),
    ("x-tag-seq", "&x: !foo [1]\n", "tagged seq value"),
    ("x-tag-map", "&x: !foo {a: 1}\n", "control: tagged flow-map value"),
    ("x-tag-map-on", "&x: !foo {on: push}\n", "RESIDUAL: tagged flow-map value WITH on (TS VALID)"),
    ("x-seq-anchor-item", "&x:\n  - &y: 1\n", "block-seq value, anchored-empty-key item"),
    ("x-docmark-tagkey", "---\n!foo &x: 1\n", "RESIDUAL: docmark + tag on key (TS yaml_parse_error)"),
]

# Residual ids (trigger-mode DIFF, jobs MATCH) — must match the
# mapping verdicts exactly; anything else flagged here is a bug.
RESIDUALS = {
    "a-flowmap-on", "a-blockmap-on", "a-anchor-val",
    "a-tag-key", "a-handle-key", "a-unglued",
    "x-nested-block", "x-anchor-seq", "x-anchor-null",
    "x-tag-map-on", "x-docmark-tagkey",
}


def main() -> int:
    rows = []
    for sid, text, note in list(A) + list(B) + X:
        rows.append({
            "id": sid,
            "mode": "both",
            "note": note,
            "yaml": text,
            "known_divergence": sid in RESIDUALS,
        })
    assert len(rows) == 57, len(rows)
    assert sum(1 for r in rows if r["known_divergence"]) == 11
    (HERE / "cases.json").write_text(
        json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"wrote {len(rows)} rows, "
          f"{sum(1 for r in rows if r['known_divergence'])} flagged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
