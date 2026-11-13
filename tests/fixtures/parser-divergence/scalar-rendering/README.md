# Scalar-rendering YAML — divergence FIXED by FIX-P0-03 (final review R2 P0 residual)

## Status (FIX-P0-03)

**FIXED — the divergence below no longer exists.** FIX-P0-02 closed
the final-review R2 P0 (``True:`` vs ``true:`` duplicate keys) but
only fixed the duplicate check; the constructed values still differed.
The main controller's residual probe (10 cases, all DIFF) showed the
same root cause in three more places: key rendering (a plain ``True:``
event was ``"true"`` on the TypeScript side but ``"True"`` in the
Oracle; a plain ``Null:``/``~:`` event was ``""`` vs ``"Null"``/``"~"``),
filter-key rendering (``push: {True: ...}`` → ``unsupported_filter:true``
vs ``unsupported_filter:True``), and string-only value positions (a
plain ``True`` in an ``on:`` list or a ``branches:``/``types:`` list is
not a string on the TypeScript side → INVALID, but the Oracle's
``BaseLoader`` strings passed it through as ``"True"`` → UNKNOWN /
VALID).

FIX-P0-03 aligns the Oracle with the TypeScript side at the loader:
``oracle/checkpath_oracle/parser.py`` now registers the YAML 1.2
core-schema patterns as implicit resolvers on ``_StrictBaseLoader``
(bool / null / int / float) and builds every scalar as a ``_TScalar``
whose string value is the TypeScript-side rendering (``True`` →
``"true"``, ``Null``/``~``/empty → ``""``, ``01`` → ``"1"``,
``0x10`` → ``"16"``, ``1e3`` → ``"1000"``, ``.inf`` → ``"Infinity"``,
``.nan`` → ``"NaN"``, ``.5`` → ``"0.5"``) and whose ``core_kind``
records the kind, so value-position checks can reject plain
boolean/null/number scalars exactly where the TypeScript parser does
(``on_list_item_not_string``, ``filter_not_string_or_list:<field>``,
``on_value_invalid``) while a plain null scalar as a filter value
means "no filter" (VALID, field null), as on the TypeScript side.
The duplicate check now folds numbers too (``1`` vs ``01`` vs
``1.0``, ``0x10`` vs ``16``, ``-0`` vs ``0`` are each one key;
``.nan`` vs ``.nan`` is NOT a duplicate — ``NaN !== NaN`` — and the
dict collapses both to the one ``"NaN"`` key, last value wins, as the
JS object does). Mapping keys are iterated in JS object-key order
(integer-index keys first, ascending, then the rest in file order),
so ``10:`` then ``2:`` enumerates ``2``, ``10`` on both sides.
``on`` / ``yes`` / ``no`` stay plain strings, event names stay
case-sensitive, and quoted scalars are never folded (``"True":``
stays ``"True"``; an explicit ``!!str True`` stays ``"True"``).
Numbers were probed, not assumed: ``0b101``, ``1_000``, ``1:30``,
``+.nan``, ``+0x10`` are plain strings on both sides; ``08`` → ``8``,
``0.`` → ``0``, ``1e21`` → ``"1e+21"``, ``9007199254740993`` →
``"9007199254740992"`` (double precision). Full probe tables: see
``handoff/P020-FIX-P0-03/TASK_REPORT.md`` §2.

Consequences of the fix:

- These cases are now IN the automated Oracle对照, not outside it:
  the trigger suite (`tests/fixtures/trigger/T6-21..T6-41`,
  `npm run oracle:diff:trigger`) and the golden suite
  (`tests/fixtures/golden/G-85..G-105`, `npm run test:oracle`).
  Job-id / `if` / `needs` / `name` scalar rendering (same root cause,
  `extractJobs` vs Oracle `extract_jobs`) is locked by
  `tests/unit/job-dag/scalar-rendering-jobs.test.ts` over the fixtures
  in `scalar-rendering-jobs/` (a T7-suite entry would have renumbered
  the golden suite, so the lock lives in the unit test instead).
- The lock test is a parity test:
  `tests/unit/diff-boundaries/scalar-rendering-yaml.test.ts` runs both
  parsers on the 21 fixtures in this directory and asserts status /
  errors / events agree field-for-field.
- `expected.json` in this directory records both sides' agreed
  outcome for all 21 cases (status / errors / full events).

## Known residuals (probed, not fixed — see the FIX-P0-03 report §7)

- ~~A bare empty key (a line containing only ``:``) is accepted by the
  TypeScript `yaml` parser (null key → ``""``) but rejected by
  PyYAML's own parser (``expected <block end>, but found ':'``) before
  any Oracle code runs, so the Oracle returns INVALID /
  `yaml_parse_error` where the TypeScript side returns UNKNOWN with a
  ``""`` event/filter key. The realistic null spellings
  (`null`/`Null`/`NULL`/`~`) all work; only the bare-``:`` spelling
  diverges, and fixing it would need a different YAML parser or
  text surgery on the input, both out of scope.~~ — **FIXED by
  FIX-P0-04**: the TypeScript side now rejects bare empty keys (and
  collection keys) through `hasUnrepresentableKey`
  (`src/core/workflow-parser.ts`); see
  `tests/fixtures/parser-divergence/bare-empty-key/README.md` and
  ADR FIX-P0-04. No parser change, no text surgery — an AST shape
  check on the TypeScript side only.
- ~~A scalar (non-mapping) job definition omits the `unsupported_job`
  field on the TypeScript side but includes it as `null` in the
  Oracle — a pre-existing TS-side shape difference, unrelated to
  scalar rendering, left untouched (the TS product code is not to be
  changed by a fix task).~~ — **FIXED by FIX-P0-04 on the Oracle
  side** (the non-dict branch now omits the field, matching the
  TypeScript output); see
  `tests/fixtures/parser-divergence/scalar-job/README.md` and ADR
  FIX-P0-04.

## The divergence (historical)

Before FIX-P0-03, the two implementations disagreed on every plain
boolean/null/number scalar that reached the IR as a name or a
string-only value (10/10 residual probe cases DIFF; a further 28
extended probe cases DIFF before the fix, 25 of which the fix closes).
The TypeScript `yaml` parser resolves plain scalars per YAML 1.2 core
schema and stringifies them as JS object keys/values; the Oracle's
``BaseLoader`` kept every scalar as its raw spelling string. The
duplicate-key half of this was already fixed by FIX-P0-02; this fix
closes the rendering half.
