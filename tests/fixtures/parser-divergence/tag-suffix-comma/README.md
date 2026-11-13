# Tag-suffix comma YAML — divergence FIXED by FIX-P0-13 (T013 R12 P0-C1)

## Status (FIX-P0-13)

**FIXED — the divergence below no longer exists.** T013 R12 found
PyYAML's tag-suffix scan consumes a flow `,` (`!foo,`), so the
Oracle said INVALID where the TypeScript side said VALID in a flow
mapping (`m: {a: !foo, b: 1}`), and VALID where the TypeScript
side said INVALID in block context (`a: !foo,` + next pair).

FIX-P0-13 aligns both sides: the TypeScript side rejects a tag
whose raw suffix ends with `,` in a flow mapping
(`hasRejectedTagComma` in `src/core/workflow-parser.ts`), and the
Oracle side rejects a tag suffix ending with `,` outside a flow
sequence (`_reject_tag_suffix_comma` in
`oracle/checkpath_oracle/parser.py`). Together they also close the
both-accept shapes where the following node is not a pair key
(`m: {a: !foo, 1}` — the two sides parse different structures).
Flow sequences never trigger on either side; a comma mid-suffix
(`!foo,bar`) and a space before the comma (`!foo ,`) never
trigger. See `handoff/P020-FIX-P0-13/TASK_REPORT.md` and
`evidence/probes/fix-p0-13/` for the full 98-row probe matrix.
