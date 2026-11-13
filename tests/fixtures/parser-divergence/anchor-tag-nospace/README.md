# Anchor/tag-nospace YAML — divergence FIXED by FIX-P0-12 (T013 R11 grouped P0-A)

## Status (FIX-P0-12)

**FIXED — the divergence below no longer exists.** T013 R11 found
the `yaml` package accepts an anchor/tag immediately followed by `#`
(no space) where PyYAML's scanner rejects it (`&x#c`, `!!str#c`),
so the TypeScript side said VALID where the Oracle said INVALID
(8 checks in R11's probe, 50/74 MATCH overall).

FIX-P0-12 aligns the TypeScript side with the Oracle:
`parseWorkflowYaml` and `extractJobs` now reject the document
through the same `yaml_parse_error` path when the text contains an
anchor/alias/tag PyYAML's scanner rejects (see
`hasRejectedAnchorOrTag` in `src/core/workflow-parser.ts`). The
Oracle parser is untouched.

## The rule (read-only line scan, no text surgery)

A raw line scan mirroring PyYAML's `scan_anchor` / `scan_tag`
token rules (and `hasRejectedTab`'s quote / block-scalar /
plain-scalar / flow state machine, so a `&` / `!` inside a scalar
is never mistaken for a property) rejects:

- `#` (and the other name-extending characters `.` `/` `;` `+`
  `<` `!` `*` `|` `>` quotes `[` `{` `&` `%` `@` backtick) right
  after an anchor/alias name — PyYAML reads a name of
  `[0-9A-Za-z_-]*` and then requires a token boundary; the `yaml`
  package swallows the extra characters into the name.
- An empty anchor name (`&#c`, `& 1`).
- A stray `:` after an anchor in value position (`a: &x: 1`,
  `m: {a: &x: 1}`), and a `?` after an anchor anywhere
  (`m: {a: &x? 1}`) — except on an implicit mapping key, where
  the anchor marks an (empty) key both sides accept
  (`{&x: 1}`, `- &x: 1`, `m:\n  &x: 1`).
- A tag followed by a non-whitespace character (`!!str#c`,
  `!foo,`, `!foo}`, `!<tag:x>#c`, `!<tag:x#frag>`) — PyYAML's
  suffix scan stops at `#` (not a URI character) and its
  post-tag check then fails.

Deliberately NOT rejected (both sides already agree — the controls
in this directory lock that): an anchor on an implicit key followed
by `:`, a space-separated comment (`&x #c`), `#` inside a quoted
or plain scalar, an anchor followed by `,`/`]`/`}`, and
well-formed unknown/core tags (`!foo 1`, `!!str 1`, `!<tag:x> 1` —
the Oracle's `_StrictBaseLoader` accepts them).

## Known divergences (NOT fixed here)

- Anchored empty key at the document root (`&x: 1`): TS INVALID
  (npm implicit-key-single-line) vs Oracle VALID — needs an
  Oracle-side rejection of anchored empty keys.
- `!foo[bar] 1`: TS INVALID (npm tag scanner stops at `[`) vs
  Oracle VALID (PyYAML URI charset includes `[`/`]`) — needs an
  Oracle-side rejection of `[`/`]` in tag suffixes.
- The tag-suffix `,`/`]` family (`!foo, b: 1` in a flow map, etc.):
  parser-level, not scanner-level — see
  evidence/probes/fix-p0-12/README.md §7 and the TASK_REPORT §7.

All 24 cases in this directory are parity-locked (TS and Oracle
agree on status / errors / events); the divergences above live in
the probe matrix as flagged known-divergence rows.
