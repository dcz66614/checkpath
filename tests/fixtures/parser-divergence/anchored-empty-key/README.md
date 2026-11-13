# Anchored empty key YAML — divergence FIXED by FIX-P0-13 (T013 R12 P0-C3)

## Status (FIX-P0-13)

**FIXED — the divergence below no longer exists.** T013 R12 found
the `yaml` package rejects an anchored empty key (`&x: 1`) with
MULTILINE_IMPLICIT_KEY in a block mapping, while PyYAML accepts
it, so the TypeScript side said INVALID where the Oracle said
VALID.

FIX-P0-13 aligns the Oracle side with the TypeScript side: the
Oracle rejects an anchored empty key in a block mapping with
>= 2 pairs (`_reject_anchored_empty_key` in
`oracle/checkpath_oracle/parser.py`). Flow mappings, single-pair
mappings, and a null-valued anchored key in first position
(`&x:` + more pairs) stay accepted on both sides. The TypeScript
side is untouched: no TypeScript rule could close these shapes.
See `handoff/P020-FIX-P0-13/TASK_REPORT.md` and
`evidence/probes/fix-p0-13/` for the full 98-row probe matrix.
