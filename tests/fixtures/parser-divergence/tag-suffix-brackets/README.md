# Tag-suffix brackets YAML — divergence FIXED by FIX-P0-13 (T013 R12 P0-C2)

## Status (FIX-P0-13)

**FIXED — the divergence below no longer exists.** T013 R12 found
PyYAML's tag-suffix URI charset includes `[` / `]` (`!foo[bar]`),
so the Oracle said VALID where the TypeScript side said INVALID
(the `yaml` package stops the tag at `[` / `]` and fails on the
leftover token).

FIX-P0-13 aligns the Oracle side with the TypeScript side: the
Oracle rejects a tag whose raw suffix contains `[` or `]`
(`_reject_tag_suffix_brackets` in
`oracle/checkpath_oracle/parser.py`), in every context. Verbatim
tags (`!<foo[bar]>`) are excluded — both sides accept them — and
`%5B` / `%5D` escapes are not literal brackets. The TypeScript
side is untouched: no TypeScript rule could close these shapes.
See `handoff/P020-FIX-P0-13/TASK_REPORT.md` and
`evidence/probes/fix-p0-13/` for the full 98-row probe matrix.
