# FIX-P0-12 probe matrix (T013 R11 grouped P0s)

243 rows × 2 modes (trigger + jobs) = **486 checks**.

## What it covers

- **P0-A core (R11 shapes):** `&x#c` / `!!str#c` in a flow map value,
  flow sequence, block value, and the `on:` slot; `&x#`, `&x##c`,
  `&x# c`; `!foo#c`, `!<tag:…>#c`, `!#c`; alias `*x#c` (both sides
  already reject — the `yaml` package reads the `#` into the alias
  name and then fails to resolve it).
- **Anchor/tag threshold:** name-extending characters after an anchor
  name (`.` `/` `;` `+` `<` `!` `*` `|` `>` quotes `[` `{` `&` `%`
  `@` backtick); empty anchor names (`&#c`, `& 1`); tag followed by
  `,` `}` `]` `[` `{` `|` `>` quotes `&` `*` `!`; verbatim-tag `#`
  inside (`!<tag:x#frag>`) and after `>` (`!<tag:x>#c`,
  `!<tag:x>, …`); handle-form tags (`!e!foo`, `!foo!bar#c`);
  `%XX` escapes (valid `%41` accepted, bad `%zz` / bare `%`
  rejected); tag `:`/`?` consumed by the suffix scan
  (`!!str: 1`, `!foo:bar`, `!foo?` — both sides accept).
- **`:`/`?` after an anchor (position rule):** implicit key in flow
  after `{`/`,`/`[` and in block at line start or after `-` (both
  sides accept — do NOT fire); value position after `:` on the same
  line, after `?` on any line, or after another property (fire);
  `?` after an anchor rejects unconditionally; explicit-key split
  lines (`?\n  &x: 1` — fire); double-property chains
  (tag-then-anchor-colon `!!str &x: 1` is the only divergent chain).
- **Unknown-tag controls (U01–U20):** `!foo`, `!foo:bar`,
  `!<tag:x>`, `!!timestamp`/`!!binary`/`!!seq`/`!!map`/`!!set` and
  the other core tags — all accepted by both sides (the Oracle's
  `_StrictBaseLoader` falls back to constructing the scalar), so no
  unknown-tag rule is needed or wanted.
- **P0-B / S1 narrowing (B01–B55):** the 8 R11 null-value shapes
  (plain / double-quoted / single-quoted, nested, after a pair,
  `a:#c` where the `#` is inside the plain key) now accepted;
  valued multi-line keys still rejected (plain / quoted / with
  comment after the colon / space before the colon / sequence or
  nested-map value / anchor or tag value / multi-line quoted
  value / `on:` slot / CRLF); null-valued keys *with* a colon
  (`{a\n b: }`, `{a\n: }`, `{"a\n b": }`, `{a\n b:\n}`) still
  rejected — the discriminator is "colon present", not "value
  non-null"; comment-skipping in the colon scan (`{a\n b # c\n: 1}`
  rejects, `{a\n b # c\n, d: 1}` is Oracle-rejected via
  `_reject_underindented_flow_continuation`).
- **Controls that must never fire:** space-separated comments
  (`&x #c`, `!!str #c`); `#` inside quoted/plain scalars
  (`"&x#c"`, `b&x#c`, `x#y`); `&`/`!` inside plain scalars;
  block-scalar content; `&x,` / `&x}` / `&x]` / `&x` at EOF;
  `&x 1: a` (anchor on a key with a spaced value); tabs after a
  property (owned by `hasRejectedTab`, FIX-P0-06).

## §7 — known divergences (12 rows / 24 checks, flagged)

> **FIX-P0-14 clearance note (2026-11-09):** all 12 rows below now
> MATCH (matrix re-run 486/486, 0 flagged) — FIX-P0-13 closed
> them (P0-C1/C2/C3), and R13 verified the closure. The 12
> `known_divergence` flags in `cases.json` were cleared by
> FIX-P0-14 (P2-R13-1); the list below is kept as the historical
> record of what the rows were.

- **A45 `&x: 1`** (anchored empty key at the document root): TS
  INVALID (`yaml_parse_error`, npm implicit-key-single-line) vs
  Oracle VALID (PyYAML accepts an anchored empty key). Fix
  direction: Oracle-side rejection of anchored empty keys — out of
  this round's TS-side scope.
- **A70 `!foo[bar] 1`**: TS INVALID (`yaml_parse_error`, npm tag
  scanner stops at `[`) vs Oracle VALID (PyYAML URI charset
  includes `[`/`]`). Fix direction: Oracle-side rejection of
  `[`/`]` in tag suffixes — out of scope.
- **`,`-suffix family (A60, X04, Y03, Y05, Y08, Y09, Y10):** a tag
  suffix swallows a flow `,` (`,` is a URI char, so PyYAML's
  suffix scan consumes it) and the parser then fails on the
  following `:` where a separator was expected — TS VALID (npm
  stops the tag at `,`) vs Oracle INVALID. Parser-level, not
  scanner-level: closing it needs a flow-kind stack (fire in `{`
  maps, NOT in `[` seqs — Y01/Y02 `!foo, a: 1` are accepted by
  both sides) plus a multi-line lookahead past the tagged node
  (quoted nodes Y03, newline Y05, anchor-prefixed nodes Y08,
  numeric Y09, null-value Y10). Out of this round's scope.
- **`]`-suffix family, REVERSE (X08, X09):** a tag suffix swallows
  `]` — TS INVALID (npm stops the tag at `]` and then has extra
  tokens) vs Oracle VALID (PyYAML's suffix consumes `]` and the
  seq still closes). Fix direction: Oracle-side rejection of `]`
  in tag suffixes (same fix as A70); the TS side cannot accept
  this via npm.
- **X11 `a: !foo,` + `b: 1` on the next line (block variant of the
  `,`-suffix family), REVERSE:** TS INVALID (npm rejects) vs
  Oracle VALID (PyYAML's suffix consumes `,`; the tag has a null
  node and `b: 1` is the next pair). Fix direction: Oracle-side
  rejection of a tag suffix ending with `,`; the TS side already
  rejects, so no TS-side rule can close it.

The `,`-suffix rows that MATCH (both sides accept) are also in the
matrix as controls: X02 (`!foo,bar 1` — `,` mid-suffix), X05/X06
(flow seq — the swallowed `,` is harmless there), X13 (space
before `,` — the tag ends first), Y01/Y02 (flow seq with a pair
after the swallowed `,` — PyYAML accepts, so a future rule must
NOT fire there).

## Run

From the repo root:

    python3 evidence/probes/fix-p0-12/run-matrix.py

Writes `results.json` in this directory (deterministic; a re-run on
the same tree reproduces it byte-for-byte). Exits non-zero unless
every check matches except the 2 flagged known-divergence rows.
