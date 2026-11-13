# Duplicate-key YAML — divergence FIXED by FIX-P1-01 (was: documented, known limitation)

## Status (FIX-P1-01, final review R1 P1-1)

**FIXED — the divergence below no longer exists.** Final review R1
ruled the divergence a violation of the Oracle-consistency hard
constraint (PROJECT_BOOK G07, §7.3, §8.1): ADR FIX-P2/01 had no power
to waive it as a "known limitation". FIX-P1-01 (R1; commit titled
`FIX-P1-01: Oracle rejects duplicate YAML keys + dup-name fixture +
static network check coverage`, see
`handoff/P020-FIX-P1-01/TASK_REPORT_R1.md` for the hash) changed the
Oracle side: `oracle/checkpath_oracle/parser.py` now parses with
`_StrictBaseLoader`, a `yaml.BaseLoader` subclass that raises
`yaml.YAMLError` on a repeated mapping key. Both `yaml.load` call
sites (parse + job extraction) use it; every other `BaseLoader`
semantic is unchanged (`on` stays the string `"on"`, `if: false`
stays the string `"false"`, empty event values still fold to no
config).

New behaviour, all four shapes (now all covered by fixtures):

| Case | TypeScript (`yaml` package) | Python Oracle (`_StrictBaseLoader`) |
|---|---|---|
| `dup-branches.yml` — `branches:` twice under `on.push` | `parse()` throws `Map keys must be unique` → trigger IR `INVALID` / `yaml_parse_error` | raises on the duplicate key → IR `INVALID` / `yaml_parse_error`, no events |
| `dup-event.yml` — `push:` twice under `on` | same | same |
| `dup-name.yml` — `name:` twice at top level (P2-2: new fixture) | same | same |
| `dup-bool-true.yml` — `True:` + `true:` under `on` (FIX-P0-02, final review R2 P0) | same: both plain spellings resolve to boolean `true`, so `uniqueKeys` rejects them | same: the duplicate check folds plain boolean/null spellings before comparing (see below) |

## Status (FIX-P0-02, final review R2 P0)

Final review R2 found a fourth divergence: `True:` vs `true:` under
`on` — TypeScript INVALID / `yaml_parse_error`, Oracle UNKNOWN with 2
events — and rejected the R3 P2 grading (PROJECT_BOOK §7.3, §8.1,
§10 are hard constraints). FIX-P0-02 aligns the Oracle with the
TypeScript side: the duplicate check in
`_StrictBaseLoader.construct_mapping` now compares keys after YAML 1.2
core-schema scalar resolution — plain `true` / `True` / `TRUE` are one
boolean key, `false` / `False` / `FALSE` one boolean key, `null` /
`Null` / `NULL` / `~` / empty one null key (all three groups verified
by probe against the TypeScript parser before implementing; see
`handoff/P020-FIX-P0-02/TASK_REPORT.md` §2 for the full probe table).
`on` / `On` / `ON` and `yes` / `Yes` stay distinct string keys (1.2
core schema has no 1.1 `on`/`yes`/`no` booleans), `True` vs `FALSE`
stay distinct keys, event names stay case-sensitive (`Push:` is still
unsupported_event → UNKNOWN on both sides), and quoted keys are never
folded (`"True":` + `true:` are distinct on both sides). The
constructed mapping is untouched — only the duplicate comparison uses
the canonical form, so `on` stays the string `"on"` and `if: false`
stays the string `"false"`. Both sides now return INVALID /
`yaml_parse_error` for the R2 input. New fixture: `dup-bool-true.yml`
in this directory, trigger `T6-20-dup-bool-true`, golden
`G-84-fix-p0-02-T6-20-dup-bool-true`.

Consequences of the fix:

- These cases are now IN the automated Oracle对照, not outside it:
  the trigger suite (`tests/fixtures/trigger/T6-17..T6-20`,
  `npm run oracle:diff:trigger`) and the golden suite
  (`tests/fixtures/golden/G-81..G-84`, `npm run test:oracle`).
- The lock test is now a parity test:
  `tests/unit/diff-boundaries/duplicate-key-yaml.test.ts` asserts both
  sides return `INVALID` / `yaml_parse_error` with no events, and that
  the two sides agree — the old assertion that they disagree is gone.
- `expected.json` in this directory now records `INVALID` on both
  sides for all four cases.
- A user hitting this still gets `INVALID` / `yaml_parse_error` from
  the CLI (exit 3); the fix direction is still to remove the duplicate
  key. What changed is only that the Reference Oracle now agrees.

## The divergence (historical — ADR FIX-P2/01, superseded)

The text below is the FIX-P2 record, kept verbatim for history. Its
decision ("keep the divergence") was superseded by FIX-P1-01 above;
do not act on it.

A workflow YAML file that repeats a mapping key at the same level is
parsed differently by the two implementations:

| Case | TypeScript (`yaml` package) | Python Oracle (PyYAML `BaseLoader`) |
|---|---|---|
| `dup-branches.yml` — `branches:` twice under `on.push` | `parse()` throws `Map keys must be unique` → trigger IR `INVALID` / `yaml_parse_error` | silently last-wins: `branches: [dev]`, IR `VALID` |
| `dup-event.yml` — `push:` twice under `on` | `parse()` throws → `INVALID` / `yaml_parse_error` | silently last-wins: second (empty) `push:` wins, IR `VALID` |

Verified live in the FIX-P2 session (PyYAML 6.0.1; `yaml` npm package):
the TS side throws on all three duplicate-key shapes probed, the Oracle
returns `VALID` with the last value on all three.

## ADR FIX-P2/01 — divergence maintained, TS side is the product rule

**Decision: keep the divergence; do not change either implementation.**
The TypeScript behaviour (reject) is the product-correct side; the
Oracle behaviour (last-wins) is documented reference behaviour, not a
bug to fix in the Oracle.

Reasons:

1. **A duplicate key is ambiguous authoring, and a merge gate must not
   silently pick a winner.** In `dup-branches.yml` the author wrote two
   different branch filters; last-wins silently discards `[main]`, so
   the gate would answer a different question from the one the author
   asked. Fail-closed (`INVALID`, CLI exit 3) surfaces the mistake
   instead of guessing.
2. **Making TS last-wins would weaken the gate** for every malformed
   workflow, just to match a lenient loader default. It would need
   `uniqueKeys: false` in the `yaml` parser and would hide authoring
   errors that today fail loudly.
3. **Making the Oracle reject would rewrite frozen Reference Oracle
   semantics.** The Oracle models what the YAML means under PyYAML's
   default loader; the product adds a stricter validation rule on top.
   Changing the Oracle would invalidate frozen expected files across
   the suites for no product benefit — the Oracle is the reference, the
   product is allowed to be strictly fail-closed where the reference is
   lenient, provided the difference is documented and locked by a test
   (this directory + `tests/unit/diff-boundaries/duplicate-key-yaml.test.ts`).
4. **YAML itself treats duplicate keys as an error** (the spec forbids
   them; parsers vary only in how loudly they complain). Rejecting is
   the defensible reading, not an invention.

## Consequences

- These cases are **not** in any golden / trigger / jobs / checks suite:
  those suites require TS ≡ Oracle, which cannot hold here by design.
- The divergence is locked by
  `tests/unit/diff-boundaries/duplicate-key-yaml.test.ts`, which runs
  both parsers on these fixtures and asserts the exact documented
  outcomes. A drift on either side (TS starts accepting, Oracle starts
  rejecting, or the winning value changes) fails the test.
- A user hitting this gets `INVALID` / `yaml_parse_error` from the CLI
  (exit 3) with the duplicate key named by the parser error; the fix
  direction is to remove the duplicate key.
- If Sam later decides the product should match the Oracle (last-wins),
  the change is a one-line parser option plus moving these cases into
  the trigger suite — but it must be a deliberate decision, recorded as
  a new ADR superseding this one.
