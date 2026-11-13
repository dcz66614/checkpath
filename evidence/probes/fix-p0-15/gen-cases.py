"""Generate cases.json for the FIX-P0-15 probe matrix from the mapping
shape grids (map-p0-15.py groups A-F, map4/map5/map6-p0-15.py extras).

130 rows x 2 modes = 260 checks. The 11 R14 residuals are UN-flagged
(they must MATCH after the fix). 6 rows are flagged
`known_divergence` (see README §7 and the TASK_REPORT §7): shapes
this round deliberately does NOT close — the C3 over-fire on a
tagged + unglued anchored empty key in second-or-later position
(2 rows), the no-space ``&x:!!str`` scanner-level divergences
(2 rows), and the ``!!int`` / ``!!bool``-on-a-mapping Oracle crash
(2 rows, the Oracle probe itself raises a raw TypeError). Every
other row must match after the fix.

Excluded: map5's ``d-rootseq-item`` and ``d-rootseq-item-untagged``
— a root block sequence followed by the workflow suffix is not a
valid test shape (the ``on:`` / ``jobs:`` lines after a root sequence
make the document itself invalid YAML on both sides for a trivial
reason); they carry no signal about the (d) rule.

Usage (from the repo root):
    python3 evidence/probes/fix-p0-15/gen-cases.py
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_map = _load("map-p0-15")
_map4 = _load("map4-p0-15")
_map5 = _load("map5-p0-15")
_map6 = _load("map6-p0-15")

# Map5 / map6 extras with notes (map-p0-15.py and map4 carry their own).
MAP5_NOTES = {
    "c-flow-2nd": "(c): tag on key in flow map, 2nd pair",
    "c-flow-1st-2pair": "(c): tag on key in flow map, 1st of 2 pairs",
    "c-flow-seq-of-map": "(c): tag on key in flow map inside a flow seq",
    "d-blockseq-item-single": "(d): tagged+unglued as a block-seq-item mapping (control: both accept)",
    "d-blockseq-item-2pair": "(d): tagged+unglued as a block-seq-item mapping, 2 items (control: both accept)",
    "d-rootseq-item": "(excluded: invalid test shape — root seq + workflow suffix)",
    "d-rootseq-item-untagged": "(excluded: invalid test shape — root seq + workflow suffix)",
    "d-epos-tag-unglued": "(d): tagged+unglued nested key under an anchored empty key (C3 covers via the outer pair)",
    "d-nested-single-tag-unglued": "(d): tagged+unglued, nested single-pair (needs the (d) tagged condition)",
    "f-lone-tag-unglued": "control: lone tagged+unglued anchored empty key (both missing_on_key)",
    "x-c3-overfire-tag-unglued-2nd": "KNOWN DIVERGENCE: C3 over-fire, tagged+unglued 2nd root pair (TS VALID)",
    "x-c3-overfire-tag-unglued-2nd-nested": "KNOWN DIVERGENCE: C3 over-fire, tagged+unglued 2nd pair of a nested mapping (TS VALID)",
}
MAP6_NOTES = {
    "a-str-flow-space": "(a): !!str tag on flow-map value WITH on (span re-parse)",
    "a-str-flow-nospace": "KNOWN DIVERGENCE: no-space &x:!!str, scanner-level (PyYAML reads a plain-scalar key)",
    "a-str-block-space": "(a): !!str tag on block-map value WITH on + jobs (span re-parse)",
    "a-str-block-nospace": "KNOWN DIVERGENCE: no-space &x:!!str block, scanner-level (PyYAML ScannerError)",
    "a-str-flow-space-jobs": "control: !!str on a jobs-only flow-map value + workflow suffix (both reject)",
    "a-int-flow-space": "KNOWN DIVERGENCE: !!int on a flow-map value — the Oracle loader raises a raw TypeError (pre-existing robustness gap)",
    "a-bool-flow-space": "KNOWN DIVERGENCE: !!bool on a flow-map value — the Oracle loader raises a raw TypeError (pre-existing robustness gap)",
    "a-unknown-flow-space": "(a): unknown tag on flow-map value WITH on",
    "a-unknown-block-space": "(a): unknown tag on block-map value WITH on + jobs",
    "a-handle-flow-space": "(a): !!str tag on flow-map value WITH on + jobs",
}

# Rows flagged known_divergence (see the module docstring).
KNOWN = {
    "x-c3-overfire-tag-unglued-2nd",
    "x-c3-overfire-tag-unglued-2nd-nested",
    "a-str-flow-nospace",
    "a-str-block-nospace",
    "a-int-flow-space",
    "a-bool-flow-space",
}

# Map4's x-tag-unglued-2nd-root is the same YAML as map5's
# x-c3-overfire-tag-unglued-2nd; keep the descriptive map5 id only.
EXCLUDED = {
    "x-tag-unglued-2nd-root",
    "d-rootseq-item",
    "d-rootseq-item-untagged",
    "f-lone-tag-unglued",  # same YAML as the main grid's c-tagkey-unglued
    "a-str-flow-space",  # same YAML as the main grid's a-handle-map-on
    "a-unknown-flow-space",  # same YAML as the main grid's a-tag-map-on
}


def main() -> int:
    rows = []
    seen_yaml = {}
    for sid, text, note in (
        [s for g in "abcdef" for s in _map.GROUPS[g]]
        + list(_map4.S)
        + [(sid, text, MAP5_NOTES[sid]) for sid, text in _map5.SHAPES]
        + [(sid, text, MAP6_NOTES[sid]) for sid, text in _map6.SHAPES]
    ):
        if sid in EXCLUDED:
            continue
        if text in seen_yaml:
            raise SystemExit(
                f"duplicate YAML for {sid} (already used by {seen_yaml[text]})"
            )
        seen_yaml[text] = sid
        rows.append(
            {
                "id": sid,
                "mode": "both",
                "note": note,
                "yaml": text,
                "known_divergence": sid in KNOWN,
            }
        )
    assert len(rows) == 130, len(rows)
    assert sum(1 for r in rows if r["known_divergence"]) == 6
    (HERE / "cases.json").write_text(
        json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        f"wrote {len(rows)} rows, "
        f"{sum(1 for r in rows if r['known_divergence'])} flagged"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
