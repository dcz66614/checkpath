# FIX-P0-10 probe fixtures — flow-collection continuation

Flow collections (mappings and sequences) in a block collection
whose continuation line is indented less than or equal to the
innermost enclosing block collection (T013 R9 grouped P0 /
R4+R5): the TypeScript `yaml` package rejects them in `parse()`
("Flow map in block collection must be sufficiently indented"),
while PyYAML accepts any indent. The Oracle-side rule
`_reject_underindented_flow_continuation` in
`oracle/checkpath_oracle/parser.py` (same family as
`_reject_adjacent_alias_colon` and
`_reject_underindented_multiline_quoted_scalar`) rejects the
same shapes as `yaml.YAMLError`, so both sides return INVALID /
`yaml_parse_error` (trigger) and `[]` (jobs).

Threshold (derived from the 132+25-case parallel mapping in
`evidence/probes/fix-p0-10/`): a continuation line's leading
spaces must strictly exceed the innermost block-collection
indent (key indent for mappings, `-` indent for sequences).
Closing-brace-only lines (`}` / `]` alone) are exempt at any
indent; document-root flow collections are exempt (no block
context); blank and comment-only lines carry no token.

Each `.yml` file is one case; `expected.json` pins both sides'
exact behaviour (status / errors / events / jobs) in trigger
and jobs modes, locked by
`tests/unit/diff-boundaries/flow-continuation.test.ts`.
