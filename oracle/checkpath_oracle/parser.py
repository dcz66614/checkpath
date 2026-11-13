"""CheckPath Reference Oracle — workflow YAML parsing + trigger evaluation (T002 PoC).

Independent Python implementation. It parses the raw workflow YAML with
a strict ``yaml.BaseLoader`` subclass (which keeps the ``on`` key a
string — a YAML 1.1 reader would resolve it to boolean ``True`` — and,
since FIX-P1-01, rejects a repeated mapping key with ``yaml_parse_error``
instead of silently keeping the last value, matching the TypeScript
``yaml`` parser; since FIX-P0-02 the duplicate check also folds the
YAML 1.2 core-schema boolean/null spellings — ``True`` vs ``true``,
``FALSE`` vs ``false``, ``Null`` vs ``~`` — to one key, again matching
the TypeScript parser; since FIX-P0-03 every plain scalar is resolved
through the same YAML 1.2 core schema and rendered the way the
TypeScript parser renders it — a plain ``True`` key becomes the string
``"true"``, a plain null key becomes ``""``, a plain ``01`` key becomes
``"1"`` — so event names, filter keys and job ids agree, and plain
boolean/null/number scalars in string-only value positions are
rejected exactly as the TypeScript parser rejects them; see
``_StrictBaseLoader`` below) and evaluates it against one synthetic
scenario (PROJECT_BOOK section 4.2):

    workflow_triggered = event_match AND activity_type_match
                         AND branch_match AND path_match AND NOT commit_skip

It never imports or calls any TypeScript code.

Status contract (fail-closed):
  VALID   — every filter is inside the frozen supported subset.
  INVALID — structurally invalid input (missing ``on``, bad shape, or
            ``paths`` + ``paths-ignore`` / ``branches`` + ``branches-ignore``
            together).
  UNKNOWN — well-formed but outside the supported subset (unknown event,
            unknown filter key, unsupported Glob).
For INVALID / UNKNOWN the evaluation fields are null and ``triggered`` is
null; nothing is guessed.
"""

from __future__ import annotations

import math
import re

import yaml

from .glob_subset import match_ordered_patterns

__all__ = [
    "TRIGGER_IR_SCHEMA",
    "SUPPORTED_EVENTS",
    "parse_workflow_yaml",
    "branch_value_for_event",
    "has_commit_skip",
    "evaluate_trigger",
    "build_trigger_ir",
]

TRIGGER_IR_SCHEMA = "checkpath.trigger-ir/v1"

SUPPORTED_EVENTS = ("push", "pull_request", "merge_group")

COMMIT_SKIP_TOKENS = (
    "[skip ci]",
    "[ci skip]",
    "[no ci]",
    "[skip actions]",
    "[actions skip]",
    "skip-checks:true",
    "skip-checks: true",
)

_FILTER_FIELDS = (
    ("types", "types"),
    ("branches", "branches"),
    ("branches-ignore", "branches_ignore"),
    ("paths", "paths"),
    ("paths-ignore", "paths_ignore"),
)


# YAML 1.2 core-schema scalar resolution (FIX-P0-02, FIX-P0-03).
#
# The TypeScript `yaml` parser (YAML 1.2 core schema, PROJECT_BOOK
# §7.2) resolves every plain scalar before it becomes a JS object key
# or value: `true`/`True`/`TRUE` are boolean true, `false`/`False`/
# `FALSE` boolean false, `null`/`Null`/`NULL`/`~`/empty are null, and
# `01`/`0x10`/`0o17`/`1.0`/`1e3`/`.inf`/`.nan` are numbers. A JS
# object key is then `String(value)` — `"true"`, `"false"`, `""`
# (null), `"1"`, `"16"`, `"1000"`, `"Infinity"`, `"NaN"`. Deliberately
# NOT resolved: `on` / `off` / `yes` / `no` (and their capitalisations)
# — under YAML 1.2 core schema they are plain strings, and §7.3
# requires the Oracle to keep `on` a string; also not resolved:
# `0b101`, `1_000`, `1:30`, `+.nan`, `+0x10` (no binary ints, no
# underscores, no sexagesimal, no sign on hex/octal/nan in core
# schema) — all probed as plain strings on the TypeScript side.
#
# The four patterns below are the core schema, registered as implicit
# resolvers on `_StrictBaseLoader` (see below). A quoted scalar never
# reaches them — PyYAML only applies implicit resolvers to plain
# scalars — and an explicit tag (e.g. `!!str True`) wins over them,
# exactly as on the TypeScript side. Registration order matters where
# first characters overlap: int is registered before float, so `1`
# resolves to int (float would match too, but the rendering is the
# same either way: both are the JS number 1, rendered `"1"`).
_BOOL_TRUE_SPELLINGS = frozenset({"true", "True", "TRUE"})

_CORE_BOOL_PATTERN = re.compile(r"^(?:true|True|TRUE|false|False|FALSE)$")
_CORE_NULL_PATTERN = re.compile(r"^(?:~|null|Null|NULL|)$")
_CORE_INT_PATTERN = re.compile(r"^(?:[-+]?[0-9]+|0o[0-7]+|0x[0-9a-fA-F]+)$")
_CORE_FLOAT_PATTERN = re.compile(
    r"^(?:[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?"
    r"|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$"
)

_CORE_SCALAR_TAGS = (
    "tag:yaml.org,2002:str",
    "tag:yaml.org,2002:bool",
    "tag:yaml.org,2002:null",
    "tag:yaml.org,2002:int",
    "tag:yaml.org,2002:float",
)


class _TScalar(str):
    """A YAML scalar string that remembers how it resolved (FIX-P0-03).

    The string value itself is the TypeScript-side rendering
    (`"true"` for plain ``True``, `""` for plain null, `"1"` for
    plain ``01``); ``core_kind`` records the YAML 1.2 core-schema
    kind — ``"string"``, ``"bool"``, ``"null"``, ``"int"`` or
    ``"float"`` — so value-position checks can tell a plain boolean
    from a quoted string with the same spelling. A plain ``str``
    subclass: equality, hashing and JSON serialisation behave exactly
    like ``str``, so every downstream consumer sees an ordinary
    string.
    """

    __slots__ = ("core_kind",)

    def __new__(cls, value, core_kind):
        obj = super().__new__(cls, value)
        obj.core_kind = core_kind
        return obj


def _js_number_to_string(value):
    """Render a float the way JS ``String(number)`` does (FIX-P0-03).

    ECMA-262 Number::toString: shortest round-trip digits, decimal
    notation while the decimal-point position ``p`` satisfies
    ``-6 < p <= 21``, exponential notation otherwise (exponent with
    an explicit ``+`` for non-negative exponents, no zero padding).
    ``repr`` supplies the shortest digits; this only reformats them.
    Verified against Node for the probe battery (see the FIX-P0-03
    report §2.5): ``1e21`` -> ``"1e+21"``, ``1e-7`` -> ``"1e-7"``,
    ``0.00001`` -> ``"0.00001"``, ``1e20`` -> ``"100000000000000000000"``.
    """
    if math.isnan(value):
        return "NaN"
    if math.isinf(value):
        return "Infinity" if value > 0 else "-Infinity"
    if value == 0:
        return "0"
    sign = "-" if value < 0 else ""
    text = repr(abs(value))
    if "e" in text:
        mantissa, exponent = text.split("e")
        exp = int(exponent)
    else:
        mantissa, exp = text, 0
    if "." in mantissa:
        intpart, fracpart = mantissa.split(".")
    else:
        intpart, fracpart = mantissa, ""
    digits = intpart + fracpart
    point = len(intpart) + exp
    stripped = digits.lstrip("0")
    point -= len(digits) - len(stripped)
    digits = stripped.rstrip("0")
    n = len(digits)
    p = point
    if -6 < p <= 21:
        if p >= n:
            out = digits + "0" * (p - n)
        elif p > 0:
            out = digits[:p] + "." + digits[p:]
        else:
            out = "0." + "0" * (-p) + digits
        return sign + out
    mantissa_out = digits[0] + ("." + digits[1:] if n > 1 else "")
    exponent_out = p - 1
    return "%s%se%s%d" % (
        sign,
        mantissa_out,
        "+" if exponent_out >= 0 else "",
        exponent_out,
    )


def _parse_int_spelling(value):
    """Parse a core-schema integer spelling (resolver regex matched)."""
    if value[:2] in ("0x", "0X"):
        return int(value[2:], 16)
    if value[:2] in ("0o", "0O"):
        return int(value[2:], 8)
    return int(value, 10)


def _render_int_spelling(value):
    """Render a core-schema integer spelling as JS ``String(number)``.

    Integers within the exact-integer range of a JS double render as
    themselves; beyond it the double conversion loses precision
    exactly as on the TypeScript side (probed: ``9007199254740993``
    renders ``"9007199254740992"``), and beyond double range the value
    is infinite (``"Infinity"`` / ``"-Infinity"``).
    """
    ivalue = _parse_int_spelling(value)
    if abs(ivalue) <= 2**53:
        return str(ivalue)
    try:
        return _js_number_to_string(float(ivalue))
    except OverflowError:
        return "Infinity" if ivalue > 0 else "-Infinity"


def _parse_float_spelling(value):
    """Parse a core-schema float spelling (resolver regex matched).

    Python's ``float()`` accepts ``inf``/``nan`` but not the YAML
    dotted forms ``.inf``/``.nan``, so those are handled explicitly.
    """
    lowered = value.lower()
    if lowered in (".inf", "+.inf"):
        return math.inf
    if lowered == "-.inf":
        return -math.inf
    if lowered == ".nan":
        return math.nan
    return float(value)


def _resolve_scalar_node(node):
    """Resolve one scalar node to its TypeScript-side rendering.

    The node's tag comes from the implicit core-schema resolvers for
    plain scalars, from the explicit tag (e.g. ``!!str``) when one is
    given, and is ``str`` for quoted scalars — so this needs no
    style check of its own.
    """
    value = node.value
    tag = node.tag
    if tag == "tag:yaml.org,2002:bool":
        return _TScalar(
            "true" if value in _BOOL_TRUE_SPELLINGS else "false", "bool"
        )
    if tag == "tag:yaml.org,2002:null":
        return _TScalar("", "null")
    if tag == "tag:yaml.org,2002:int":
        return _TScalar(_render_int_spelling(value), "int")
    if tag == "tag:yaml.org,2002:float":
        return _TScalar(_js_number_to_string(_parse_float_spelling(value)), "float")
    return _TScalar(value, "string")


def _duplicate_key_canonical(key_node):
    """Canonical form of a mapping key for duplicate detection only.

    Compares keys after YAML 1.2 core-schema scalar resolution, as
    the TypeScript ``yaml`` parser's ``uniqueKeys`` check does: plain
    boolean spellings fold to ``("bool", True/False)``, plain null
    spellings to ``("null", None)``, plain integer/float spellings to
    ``("num", <JS number>)`` — so ``True`` vs ``true``, ``1`` vs
    ``01`` vs ``1.0``, ``0x10`` vs ``16`` and ``-0`` vs ``0`` are each
    one key, while ``true`` vs ``1`` are distinct keys. NaN is the
    exception: ``NaN !== NaN``, so two ``.nan`` keys are never equal
    here and are not flagged — matching the TypeScript side, where
    ``uniqueKeys`` does not flag them either and the JS object simply
    collapses both to the one ``"NaN"`` key, last value wins (probed,
    FIX-P0-03 §2.4 Q1/Q3). Every other scalar — including quoted
    scalars, which resolve to ``str`` — is ``("str", <rendered>)``.
    The constructed mapping is unaffected: this value is used only in
    the ``seen`` set of ``_StrictBaseLoader.construct_mapping``.
    """
    tag = key_node.tag
    value = key_node.value
    if tag == "tag:yaml.org,2002:bool":
        return ("bool", value in _BOOL_TRUE_SPELLINGS)
    if tag == "tag:yaml.org,2002:null":
        return ("null", None)
    if tag == "tag:yaml.org,2002:int":
        try:
            number = float(_parse_int_spelling(value))
        except OverflowError:
            number = math.inf if not value.startswith("-") else -math.inf
        return ("num", number)
    if tag == "tag:yaml.org,2002:float":
        number = _parse_float_spelling(value)
        if math.isnan(number):
            # NaN never equals itself, and the TypeScript uniqueKeys
            # check does not flag two NaN keys either — so each NaN
            # key gets a fresh identity that can never match an
            # earlier one (a plain ("num", nan) tuple would match by
            # CPython's identity shortcut, since both NaNs would be
            # the same float object). The constructed dict still
            # collapses both to the one "NaN" key, last value wins,
            # exactly as the JS object does (probed, FIX-P0-03 §2.4
            # Q1/Q3).
            return ("nan", object())
        return ("num", number)
    return ("str", value)


def _js_object_key_order(keys):
    """Reorder rendered mapping keys the way a JS object enumerates them.

    JS property order (ECMA-262): canonical integer-index keys
    (``"0"`` .. ``"4294967294"``, no sign, no leading zeros, no
    fraction) first, ascending numerically, then every other key in
    insertion order. The TypeScript parser iterates its parsed
    objects with ``Object.entries``/``Object.keys``, so e.g. an
    ``on`` mapping written ``10:`` then ``2:`` enumerates ``2``,
    ``10`` on the TypeScript side (probed, FIX-P0-03 §2.3 O2/O3);
    the Oracle must iterate in the same order or the events /
    unsupported lists come out in different orders. Keys that merely
    look numeric but are not integer indices (``"1.5"``, ``"-1"``,
    ``"4294967295"``) stay in insertion order.
    """
    indices = []
    others = []
    for key in keys:
        text = str(key)
        if re.fullmatch(r"(?:0|[1-9][0-9]*)", text):
            try:
                number = int(text)
            except ValueError:
                number = None
            if number is not None and number <= 4294967294:
                indices.append(key)
                continue
        others.append(key)
    indices.sort(key=lambda k: int(str(k)))
    return indices + others


class _StrictBaseLoader(yaml.BaseLoader):
    """``yaml.BaseLoader`` that resolves plain scalars per YAML 1.2 core schema (FIX-P1-01, FIX-P0-02, FIX-P0-03).

    PyYAML's ``BaseLoader`` silently keeps the LAST value when a mapping
    key repeats, so a workflow with e.g. two ``branches:`` keys under
    ``on.push`` parsed as VALID. The TypeScript ``yaml`` parser rejects
    the same input (``Map keys must be unique`` -> trigger IR INVALID /
    ``yaml_parse_error``), and final review R1 (P1-1) ruled that
    divergence a violation of the Oracle-consistency hard constraint
    (PROJECT_BOOK G07, §7.3, §8.1): the Oracle must reject too.

    FIX-P0-02 (final review R2 P0): the duplicate check compares keys
    after YAML 1.2 core-schema scalar resolution, as the TypeScript
    ``yaml`` parser does — plain (unquoted) ``true`` / ``True`` /
    ``TRUE`` are one boolean key, ``false`` / ``False`` / ``FALSE``
    are one boolean key, and ``null`` / ``Null`` / ``NULL`` / ``~`` /
    the empty scalar are one null key, so e.g. ``True:`` + ``true:``
    under ``on`` is a duplicate and both sides reject it (INVALID /
    ``yaml_parse_error``). Probes (FIX-P0-02 report §2) verified the
    TypeScript side rejects exactly these spellings and no others:
    ``on`` / ``On`` / ``ON`` and ``yes`` / ``Yes`` stay distinct
    string keys (YAML 1.2 core schema has no 1.1 ``on``/``yes``/``no``
    booleans — folding them would re-introduce the §7.3 misread), and
    ``True`` vs ``FALSE`` are distinct keys (different booleans).

    FIX-P0-03 (final review R2 P0 residual): resolving scalars only
    for the duplicate check left the constructed values unreconciled —
    the TypeScript side renders every resolved scalar as a JS object
    key/value (``True`` -> ``"true"``, ``Null`` -> ``""``, ``01`` ->
    ``"1"``) and rejects non-string scalars in string-only positions,
    while the Oracle kept the raw spellings. This loader now resolves
    plain scalars through the core schema itself: the four patterns in
    ``_CORE_*_PATTERN`` are registered as implicit resolvers, so a
    plain scalar's node tag is ``bool``/``null``/``int``/``float``/
    ``str``, and ``_construct_core_scalar`` builds a ``_TScalar``
    whose string value is the TypeScript-side rendering and whose
    ``core_kind`` records the kind. Only the rendering changes; the
    ``on`` key stays the string ``"on"`` (core schema has no 1.1
    booleans), and ``if: false`` renders ``"false"`` — the same
    string the TypeScript ``String(false)`` produces in job
    extraction.

    Quoted keys are NOT folded: a quoted scalar is a string to both
    parsers, so ``"True":`` + ``true:`` are distinct keys on the
    TypeScript side (probed: UNKNOWN, not a parse error) and must stay
    distinct here — implicit resolvers apply to plain scalars only,
    and an explicit tag (``!!str True``) wins over them, so a quoted
    or explicitly-tagged scalar always resolves to ``str``. The
    constructed mapping keys are the rendered strings, so two keys
    that render the same (``"true":`` + ``true:``) collapse in the
    dict with the last value winning — exactly as the JS object on
    the TypeScript side does (probed, FIX-P0-03 §2.4 Q27/Q28).

    The override must be (re-)registered on this subclass: PyYAML
    dispatches through the ``yaml_constructors`` table, which holds a
    reference to ``BaseConstructor.construct_mapping`` — merely
    overriding the method would never be called. ``add_constructor``
    copies the table for the subclass and points the mapping tag at
    this override. The scalar constructors and implicit resolvers
    below are registered the same way.

    Non-scalar mapping keys (a sequence/mapping used as a key) are not
    checked: they never occur in workflow YAML. For scalar keys the
    duplicate test is the canonical form from
    ``_duplicate_key_canonical`` (tag-based: plain-scalar boolean/
    null/numeric spellings folded, everything else compared as its
    rendered string), not the raw string.
    """

    def _construct_core_scalar(self, node):
        # FIX-P0-16 (P0-3, T013 R15 loader boundary): a core scalar
        # tag (``!!int`` / ``!!bool`` / ``!!float`` / ``!!str`` /
        # ``!!null``) on a COLLECTION node (mapping / sequence) must
        # be ignored — construct the collection by kind, exactly as
        # the ``yaml`` package does (it only warns "Unresolved tag"
        # and still parses the set as a mapping) and exactly as
        # PyYAML itself does for an UNKNOWN tag (``construct_object``
        # falls back to ``construct_yaml_map`` / ``construct_yaml_seq``
        # by node kind). ``_resolve_scalar_node`` reads ``node.value``
        # directly, which for a collection is the list of pairs /
        # items, so the old code crashed with a native
        # ``TypeError`` / ``AttributeError`` (``int()`` on a list,
        # hashing a list, ``.lower()`` on a list) that neither
        # caller catches (only ``yaml.YAMLError`` is caught) — the
        # probe driver exited 1 while the TypeScript side returned
        # VALID. Merely catching the exception as ``yaml_parse_error``
        # is NOT enough: the TypeScript side says VALID. Scalar nodes
        # are untouched (``!!int 1`` still resolves through the core
        # schema). A collection used as a mapping KEY still raises
        # ``yaml.YAMLError`` ("found unhashable key") from
        # ``construct_mapping`` itself, matching the TypeScript
        # side's ``yaml_parse_error`` there (p3-map-key).
        if isinstance(node, yaml.MappingNode):
            return self.construct_mapping(node)
        if isinstance(node, yaml.SequenceNode):
            return self.construct_sequence(node)
        return _resolve_scalar_node(node)

    def construct_mapping(self, node, deep=False):
        # No flatten_mapping call here: that helper lives on
        # SafeConstructor, and BaseConstructor.construct_mapping does
        # not merge ``<<`` keys — a ``<<`` entry is just an ordinary
        # key to this loader, exactly as before. Only the duplicate
        # check is added; construction itself is delegated unchanged.
        seen: set[tuple[str, object]] = set()
        for key_node, _value_node in node.value:
            if not isinstance(key_node, yaml.ScalarNode):
                continue
            canonical = _duplicate_key_canonical(key_node)
            if canonical in seen:
                raise yaml.YAMLError(
                    f"duplicate mapping key: {key_node.value!r}"
                )
            seen.add(canonical)
        return super().construct_mapping(node, deep=deep)

    # -- FIX-P0-16 (P0-2): nospace anchor-colon scanner mirror ----
    # PyYAML does not treat ``:`` as a value indicator without a
    # following space in block context, so ``&x:!!tag`` is scanned as
    # a plain scalar (flow lone-doc) or throws ``ScannerError``
    # (block lone-doc) and the token walk never sees the lone-doc
    # pattern — while the ``yaml`` package absorbs the ``:`` into the
    # anchor name (``&x:``) and reads the tagged node. Mirror the
    # ``:`` as a value indicator, except in a value position
    # (``m: &x:!!str {a: 1}``, ``on: &x:!!str {push: {}}``) where
    # the TypeScript side REJECTS the document and the Oracle has
    # no reject rule for the shape — there the mirror must not
    # fire, or a matching ``yaml_parse_error`` (from the unmirrored
    # scanner error) would turn into a spurious VALID / UNKNOWN.
    # The mirror DOES fire when the anchor follows another property
    # (``!foo &x:!!tag``): the TypeScript side rejects that via E05
    # and the Oracle mirrors it through rule (c), which needs the
    # mirrored ``ValueToken``. See ``_mirror_may_fire``. In flow
    # context ``:`` is already a value indicator, so the mirror is
    # block-only. A quoted scalar, a comment, or a plain scalar
    # containing the pattern is never mirrored: the scanner only
    # reaches ``check_value`` for a real ``:`` token, never inside
    # a scalar.
    def get_token(self):
        token = super().get_token()
        if token is not None:
            self._last_taken_token = token
        return token

    def fetch_anchor(self):
        # The token before the anchor in stream order: the last
        # scanned-but-untaken token, else the last token the parser
        # took. Decides key position for the mirror below.
        prev_token = (
            self.tokens[-1]
            if self.tokens
            else getattr(self, "_last_taken_token", None)
        )
        anchor_mark = self.get_mark()
        self._mirror_anchor_key_position = self._mirror_may_fire(
            prev_token, anchor_mark
        )
        # Replicates Scanner.fetch_anchor exactly, so the anchor
        # token's end mark is available for the glued check.
        self.save_possible_simple_key()
        self.allow_simple_key = False
        token = self.scan_anchor(yaml.tokens.AnchorToken)
        self.tokens.append(token)
        self._mirror_anchor_end_index = token.end_mark.index

    def scan_anchor(self, TokenClass):
        """Absorb a ``:`` glued to an anchor / alias name, mirroring
        the ``yaml`` package's ns-anchor-char run (FIX-P0-17, P0-B,
        T013 R16).

        PyYAML's ``scan_anchor`` reads only ``[0-9A-Za-z_-]*`` and
        stops at ``:`` (``:`` is in its post-name terminator set),
        so ``&q:2`` scans as anchor ``q`` followed by a value
        indicator and the Oracle rejects the document, while the
        ``yaml`` package absorbs the whole ``q:2`` into the anchor
        name and accepts it. After the base scan, when the next
        character is ``:``, absorb the ``:`` and the following
        anchor characters (everything except whitespace and the
        flow indicators ``,[]{}`` — the ``yaml`` package's anchor
        run, probed character by character in
        evidence/probes/fix-p0-17/anchor-chars.mjs: ``:`` ``.``
        ``/`` ``;`` ``?`` ``=`` ``+`` ``$`` ``@`` backtick ``%``
        ``#`` ``!`` ``&`` ``*`` ``|`` ``>`` quotes ``(`` ``)``
        backslash are all absorbed; only whitespace and ``,[]{}``
        stop the run) into the anchor / alias name. ``fetch_anchor``
        and ``fetch_alias`` both call this, so anchors AND aliases
        are covered (``*w: 2`` becomes alias ``w:`` — unresolved
        unless an anchor of that exact name exists — which is what
        the ``yaml`` package does too).

        Guards, all probed on both sides:

        * ``:`` followed by blank / EOL / end of input is NOT
          absorbed — that is the C3 domain (``&x: 1``) and the
          ``&x:`` null exemption; the ``:`` stays a value
          indicator.
        * ``:`` followed by a flow indicator (``,[]{}``) is NOT
          absorbed (``&x:,`` is rejected on both sides already).
        * ``:`` followed by ``!`` (a tag) is absorbed ONLY when
          the tag is properly terminated — blank / EOL / end of
          input after it. A tag glued to the next node
          (``&b:!!str{on: ...}``) is rejected on both sides
          (PyYAML ``scan_tag`` / ``hasRejectedAnchorOrTag``), so
          the ``:`` is left for the P0-2 mirror / ``scan_tag`` to
          reject; absorbing it would swallow the tag and turn the
          shape spuriously VALID. When the tag IS terminated,
          absorption is correct: ``&x:!!tag`` at a root is VALID
          on the TypeScript side (the anchor ``x:!!tag`` sits on
          the root mapping) while the P0-2 mirror over-fires on
          it — absorption supersedes the mirror there (see the
          FIX-P0-17 report §2.2).
        * A ``!`` LATER in the run (after a non-``!`` character,
          e.g. ``&q:2!zap``) is absorbed as part of the run — the
          guard above only applies when ``!`` is the FIRST
          character after the ``:``.
        """
        token = super().scan_anchor(TokenClass)
        if self.peek() != ":":
            return token
        nxt = self.peek(1)
        if nxt in "\0 \t\r\n\x85\u2028\u2029":
            return token
        if nxt == "!":
            # Absorb only when the tag after the colon is
            # properly terminated (blank / EOL / end of input).
            # ``_skip_tag`` is a pure lookahead (peek-based).
            tag_end = self._skip_tag(1)
            if tag_end is None or self.peek(tag_end) not in (
                "\0 \t\r\n\x85\u2028\u2029"
            ):
                return token
        elif nxt in ",[]{}":
            return token
        # Absorb ':' and the following anchor characters.
        length = 1
        while True:
            c = self.peek(length)
            if c in "\0 \t\r\n\x85\u2028\u2029,[]{}":
                break
            length += 1
        value = token.value + self.prefix(length)
        self.forward(length)
        return TokenClass(value, token.start_mark, self.get_mark())

    @staticmethod
    def _mirror_may_fire(prev_token, anchor_mark):
        """True when the mirror may fire for an anchor-colon.

        The mirror fires unless the anchor is a pair's VALUE (a
        value indicator / scalar on the SAME line precedes it) or
        an explicit key (``?`` precedes it). It DOES fire when the
        anchor follows another property (anchor / tag / alias):
        the TypeScript side rejects that shape via E05
        (``hasRejectedAnchorOrTag``), and the Oracle mirrors the
        rejection through rule (c) — which needs the mirrored
        ``ValueToken`` after the anchor to see its Key / Tag+ /
        Anchor / Value pattern. (A plain value position has no
        such rule, so the mirror must not fire there: the
        unmirrored scanner error is what makes both sides agree.)
        A value indicator or scalar on a PREVIOUS line opens a
        (nested) mapping, i.e. key position. Everything else
        (stream start, a mapping/sequence start or end, a block
        entry ``-``, a document marker) is key position.
        """
        if prev_token is None:
            return True
        if isinstance(prev_token, yaml.tokens.KeyToken):
            return False
        if isinstance(
            prev_token,
            (yaml.tokens.ValueToken, yaml.tokens.ScalarToken),
        ):
            return prev_token.end_mark.line != anchor_mark.line
        return True

    def check_value(self):
        if self.flow_level:
            return True
        if self.peek(1) == "!":
            # Nospace anchor-colon followed by a tag: mirror the
            # ``:`` as a value indicator only when it is glued to
            # the anchor just scanned (``&x:!!tag``) and that anchor
            # is in implicit-key position. ``self.pointer`` only
            # moves forward, so a stale recorded end index can never
            # match again. The mirror does NOT fire when the node
            # after the tag is a scalar / alias KEY (``&x:!!str
            # hello: 1``): the ``yaml`` package absorbs the ``:``
            # into the anchor name and reads the scalar as the
            # pair's key, so there is no empty-key pair at all —
            # firing would make PyYAML read the scalar as the empty
            # key's value and then reject the ``:`` after it
            # ("mapping values are not allowed here": after a tag a
            # plain scalar is never saved as a possible simple key).
            anchor_end = getattr(self, "_mirror_anchor_end_index", None)
            if (
                anchor_end is not None
                and self.pointer == anchor_end
                and getattr(self, "_mirror_anchor_key_position", False)
                and not self._nospace_anchor_colon_is_key()
            ):
                return True
        return self.peek(1) in "\0 \t\r\n\x85\u2028\u2029"

    def _skip_tag(self, i):
        """Skip a tag starting at buffer offset ``i`` (``peek(i)`` is ``!``).

        Returns the offset just past the tag, or None if the tag is
        malformed / runs to end of line. Mirrors ``scan_tag``'s
        shape loosely (verbatim ``!<...>``, handle ``!h!suffix``,
        shorthand ``!suffix``, bare ``!``) — only used for the P0-2
        key lookahead, never for tokenizing.
        """
        if self.peek(i) != "!":
            return None
        j = i + 1
        if self.peek(j) in "\0 \t\r\n\x85\u2028\u2029":
            return j  # bare '!' tag
        if self.peek(j) == "<":
            j += 1
            while True:
                c = self.peek(j)
                if c in "\0\r\n\x85\u2028\u2029":
                    return None
                if c == ">":
                    return j + 1
                j += 1
        # Handle form: word chars to a second '!'.
        k = j
        while self.peek(k) and (
            self.peek(k).isalnum() or self.peek(k) in "-_"
        ):
            k += 1
        if self.peek(k) == "!" and k > j:
            j = k + 1
        # Suffix: URI chars (alnum + -;/?:@&=+$,_.!~*'()[]% ).
        while True:
            c = self.peek(j)
            if c in "\0 \t\r\n\x85\u2028\u2029,{}#":
                break
            if not (c.isalnum() or c in "-;/?:@&=+$,_.!~*'()[]%"):
                break
            j += 1
        return j

    def _nospace_anchor_colon_is_key(self):
        """True when the node after a nospace anchor-colon tag is a key.

        Called from ``check_value`` with ``self.pointer`` at the
        ``:`` and ``peek(1)`` the ``!`` of the tag. Returns True
        when the node after the tag is a plain / quoted scalar or
        an alias (after any further ``&name`` / ``!tag``
        properties) followed by ``:`` on the same line — i.e. the
        ``yaml`` package reads it as the pair's key, not as the
        empty key's value. A node on the next line, a collection,
        or a block scalar is a value, not a key (returns False).
        """
        i = self._skip_tag(1)
        if i is None:
            return False
        # Skip spaces/tabs only: a newline means the node is on the
        # next line, i.e. a value.
        while self.peek(i) in " \t":
            i += 1
        if self.peek(i) in "\0\r\n\x85\u2028\u2029":
            return False
        # Skip further &name / !tag properties on the node.
        for _ in range(4):
            ch = self.peek(i)
            if ch == "&":
                j = i + 1
                while self.peek(j) and (
                    self.peek(j).isalnum() or self.peek(j) in "-_"
                ):
                    j += 1
                if j == i + 1:
                    return False
                i = j
                while self.peek(i) in " \t":
                    i += 1
                continue
            if ch == "!":
                nxt = self._skip_tag(i)
                if nxt is None:
                    return False
                i = nxt
                while self.peek(i) in " \t":
                    i += 1
                continue
            break
        ch = self.peek(i)
        if ch in "\"'":
            # Quoted scalar: scan to the closing quote.
            quote = ch
            j = i + 1
            while True:
                c = self.peek(j)
                if c in "\0\r\n\x85\u2028\u2029":
                    return False
                if quote == '"' and c == "\\":
                    j += 2
                    continue
                if c == quote:
                    if quote == "'" and self.peek(j + 1) == "'":
                        j += 2
                        continue
                    break
                j += 1
            k = j + 1
            while self.peek(k) in " \t":
                k += 1
            return self.peek(k) == ":"
        if ch == "*":
            # FIX-P0-17 (P0-A, T013 R16): an ALIAS key must NOT
            # exempt the mirror. The ``yaml`` package rejects an
            # alias node with properties ("An alias node must not
            # specify any properties"), so ``&q:!!str *w: 2`` is
            # INVALID on the TypeScript side, while PyYAML reads
            # ``:!!str *w`` as a plain scalar key and accepts it.
            # Returning False makes ``check_value`` treat the ``:``
            # as a value indicator, so the scanner rejects the
            # document the same way. Only the plain / quoted
            # scalar branches above still exempt the mirror.
            return False
        # Plain scalar (block context: ':' not followed by space is
        # part of the scalar; the scalar ends at whitespace / EOL /
        # ':' followed by space or EOL).
        if ch in "\0 \t\r\n\x85\u2028\u2029,[]{}#&*!|>\"'%@`":
            return False
        j = i
        while True:
            c = self.peek(j)
            if c in "\0 \t\r\n\x85\u2028\u2029":
                return False
            if c == ":" and self.peek(j + 1) in "\0 \t\r\n\x85\u2028\u2029":
                return True
            j += 1


_StrictBaseLoader.add_constructor(
    yaml.resolver.Resolver.DEFAULT_MAPPING_TAG,
    _StrictBaseLoader.construct_mapping,
)

# FIX-P0-03: every scalar resolves through _construct_core_scalar,
# which renders it the way the TypeScript parser does. The implicit
# resolvers give plain scalars their core-schema tags (int is
# registered before float: `1` matches both patterns, and is an int);
# quoted scalars and explicit tags keep the `str` tag (or the explicit
# tag), so they are never folded. The empty-string first character
# registers the null pattern for the empty plain scalar.
for _tag in _CORE_SCALAR_TAGS:
    _StrictBaseLoader.add_constructor(
        _tag, _StrictBaseLoader._construct_core_scalar
    )
_StrictBaseLoader.add_implicit_resolver(
    "tag:yaml.org,2002:bool", _CORE_BOOL_PATTERN, list("tTfF")
)
_StrictBaseLoader.add_implicit_resolver(
    "tag:yaml.org,2002:null", _CORE_NULL_PATTERN, ["~", "n", "N", ""]
)
_StrictBaseLoader.add_implicit_resolver(
    "tag:yaml.org,2002:int", _CORE_INT_PATTERN, list("-+0123456789")
)
_StrictBaseLoader.add_implicit_resolver(
    "tag:yaml.org,2002:float", _CORE_FLOAT_PATTERN, list("-+.0123456789")
)


def _null_evaluation(unsupported, reason):
    return {
        "event_match": None,
        "activity_type_match": None,
        "branch_match": None,
        "branch_value": None,
        "path_match": None,
        "path_file_results": [],
        "commit_skip": False,
        "triggered": None,
        "unsupported": list(unsupported),
        "reason": reason,
    }


def _string_or_list(value):
    """Normalize a string-or-list filter value; "INVALID" when malformed.

    Mirrors the TypeScript ``stringOrList`` (FIX-P0-03): a plain null
    scalar (empty value, ``null``, ``~``) is the same as no value
    (``None`` — the TypeScript side receives JS ``null`` and returns
    null); a plain boolean/number scalar — as the value itself, or as
    any list item — is not a string, so the filter is malformed
    (``"INVALID"``); a quoted scalar is a string whatever its
    spelling (``"True"``, ``"1"``, ``"null"`` are all strings).
    ``_TScalar.core_kind`` is what distinguishes them: a plain
    ``str`` that is not a ``_TScalar`` (only possible for values not
    built by this loader) is treated as a string.
    """
    if value is None:
        return None
    if isinstance(value, _TScalar):
        if value.core_kind == "null":
            return None
        if value.core_kind != "string":
            return "INVALID"
        return [str(value)]
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        out = []
        for item in value:
            if isinstance(item, _TScalar):
                if item.core_kind != "string":
                    return "INVALID"
                out.append(str(item))
            elif isinstance(item, str):
                out.append(item)
            else:
                return "INVALID"
        return out
    return "INVALID"


def _reject_adjacent_alias_colon(yaml_text):
    """Reject an alias used as a mapping key when ``:`` follows it with
    no intervening whitespace.

    FIX-P0-05 (D2, final review R2 P0 residual): the TypeScript
    ``yaml`` package rejects an alias key whose ``:`` is glued to
    the alias (``on: {*a: 1}``, ``on: {? *a: 1}``, block ``*a: 1`` —
    "Alias ending in : is ambiguous" -> parse error -> INVALID /
    ``yaml_parse_error``), while PyYAML accepts it and resolves the
    alias, so the Oracle returned INVALID with a different error
    (``event_config_not_mapping``) — or even VALID/UNKNOWN when the
    alias sat outside ``on:``. The rule is adjacency, not flow
    style: a space/tab before the ``:`` (``*a : 1``, ``? *a : 1``)
    parses on both sides, and an alias in any other position
    (value, sequence item) is untouched. The check runs on the
    scanner token stream because the composed node tree loses alias
    identity (an alias key node IS the anchored node object), and
    neither the event stream nor the token stream distinguishes an
    implicit key from an explicit ``?`` key — only the token marks
    do. For each AliasToken, walk back over anchor/tag properties:
    only a KeyToken means the alias is a key. A ``?`` glued to the
    alias (``?*a``) is a plain scalar in the TypeScript reader, not
    an explicit key — the key token then sits exactly one character
    before the alias, so a gap of 1 exempts it; anything else (gap
    0 implicit, gap >= 2 explicit ``?``) is a genuine alias key and
    is rejected when the source character right after the alias is
    ``:``. Raised as ``yaml.YAMLError`` so both callers map it onto
    the existing ``yaml_parse_error`` path (trigger INVALID /
    ``yaml_parse_error`` / events ``[]``; jobs ``[]``).
    """
    tokens = list(yaml.scan(yaml_text, Loader=_StrictBaseLoader))
    for i, token in enumerate(tokens):
        if not isinstance(token, yaml.tokens.AliasToken):
            continue
        j = i - 1
        while j >= 0 and isinstance(
            tokens[j], (yaml.tokens.AnchorToken, yaml.tokens.TagToken)
        ):
            j -= 1
        if j < 0 or not isinstance(tokens[j], yaml.tokens.KeyToken):
            continue
        key_token = tokens[j]
        # `?*a` is a plain scalar "?*a" to the TypeScript reader
        # (probed, FIX-P0-05 §2): the `?` is glued to the alias.
        if token.start_mark.index - key_token.start_mark.index == 1:
            continue
        idx = token.end_mark.index
        if idx < len(yaml_text) and yaml_text[idx] == ":":
            raise yaml.YAMLError(
                "alias key immediately followed by ':'"
            )


def _reject_underindented_multiline_quoted_scalar(yaml_text):
    """Reject a multi-line quoted scalar whose continuation line is
    not indented more than its enclosing block context.

    FIX-P0-08 (RESID, T013 R7 grouped P0): the TypeScript ``yaml``
    package rejects a multi-line quoted scalar (double or single
    quotes) when any of its continuation lines is indented less than
    or equal to the block context it sits in ("Missing closing
    \"quote"), while PyYAML accepts any indent — so the Oracle
    returned VALID where the TypeScript side returned INVALID /
    ``yaml_parse_error``. The divergence does not need a tab (a plain
    ``run: "a\\nb c"`` with an unindented continuation diverges too),
    and it is in the parser itself, so no TypeScript-side rule can
    fix it — the Oracle must reject the same shapes. Raised as
    ``yaml.YAMLError`` so both callers map it onto the existing
    ``yaml_parse_error`` path, same family as
    ``_reject_adjacent_alias_colon`` (FIX-P0-05). This is a
    rejection, not input surgery: the text is never rewritten.

    Threshold rule, derived by probing the ``yaml`` package over
    239 mapping cases (see evidence/probes/fix-p0-08/README.md):
    for every quoted scalar token spanning more than one line, every
    continuation line must be indented strictly more than the
    innermost enclosing block collection —

    * a mapping value: the mapping's indent, i.e. the key indent
      (key indent 0: continuation 0 rejects, 1+ accepts; 2: <=2
      rejects, 3+ accepts; 4: <=4 / 5+; 6: <=6 / 7+; 8: <=8 / 9+ —
      R7's 8/9 is the key-indent-8 instance);
    * a sequence item: the sequence's indent, i.e. the ``-`` indent
      (dash 2: <=2 rejects, 3+ accepts; dash 0: 0 rejects, 1+);
    * a flow-collection item: the enclosing block context's indent
      (``m: {k: ...}``: >0; ``branches: [...]`` at key indent 4:
      4 rejects, 5+ accepts — flow nesting itself adds nothing);
    * a value written on the line after a bare ``key:``: the key
      indent (``run:`` at 0: continuation 0 rejects, 1+ accepts).
    * every continuation line decides (a 9-then-0 pair rejects,
      9-then-9 accepts); the line carrying the closing quote counts
      (closing quote at indent 0 rejects, at 9 accepts).
    * a line that is empty or contains only spaces is skipped (the
      ``yaml`` package treats it as blank); a line containing a tab
      is NOT blank — a tab-only line rejects (its leading-space
      count is 0), and a tab terminates the leading-space count of
      its line (9 spaces + tab accepts, tab at column 0 rejects).
    * double and single quotes behave identically; tab content
      inside the scalar is irrelevant; anchors do not change it.
    * a scalar at the document root has no enclosing block
      collection and is never rejected (any continuation indent
      accepted on both sides).

    The check runs on the scanner token stream: the block-indent
    stack is the ``start_mark.column`` of each
    ``BlockMappingStartToken`` / ``BlockSequenceStartToken``
    (``BlockEndToken`` pops); a quoted ``ScalarToken`` spanning
    lines is checked against the stack top. Plain scalars (style
    ``None``) and block scalars (``|`` / ``>``) are untouched.
    Quoted keys need no special case: PyYAML rejects every
    multi-line quoted key itself ("mapping values are not allowed
    here", block and flow), so this rule never changes a key
    outcome — but note the reverse flow-key divergence it does NOT
    close (the ``yaml`` package ACCEPTS a multi-line quoted key in
    a flow mapping while PyYAML rejects it); see the FIX-P0-08
    report §7, R3, disclosed as a residual for a separate round.
    """
    lines = yaml_text.split("\n")
    block_stack = []
    for token in yaml.scan(yaml_text, Loader=_StrictBaseLoader):
        if isinstance(
            token,
            (yaml.tokens.BlockMappingStartToken, yaml.tokens.BlockSequenceStartToken),
        ):
            block_stack.append(token.start_mark.column)
        elif isinstance(token, yaml.tokens.BlockEndToken):
            if block_stack:
                block_stack.pop()
        elif isinstance(token, yaml.tokens.ScalarToken) and token.style in ("'", '"'):
            if token.start_mark.line == token.end_mark.line:
                continue
            if not block_stack:
                # Document-root scalar: no block context, the
                # `yaml` package accepts any continuation indent.
                continue
            context_indent = block_stack[-1]
            for line_no in range(token.start_mark.line + 1, token.end_mark.line + 1):
                raw = lines[line_no]
                if raw.endswith("\r"):
                    raw = raw[:-1]
                if raw == "" or raw.strip(" ") == "":
                    # Empty or spaces-only line: the `yaml` package
                    # treats it as blank and does not count it. A
                    # line containing a tab is NOT blank (M11).
                    continue
                indent = len(raw) - len(raw.lstrip(" "))
                if indent <= context_indent:
                    raise yaml.YAMLError(
                        "multi-line quoted scalar continuation not "
                        "indented beyond block context"
                    )


def _flow_line_indent(lines, line_no):
    """Leading-space count of one source line, or ``None`` when the
    line is empty or contains only spaces (the ``yaml`` package
    treats such a line as blank and does not count it; a line
    containing a tab is NOT blank — its leading-space count is 0,
    same convention as
    ``_reject_underindented_multiline_quoted_scalar``)."""
    raw = lines[line_no]
    if raw.endswith("\r"):
        raw = raw[:-1]
    if raw == "" or raw.strip(" ") == "":
        return None
    return len(raw) - len(raw.lstrip(" "))


def _reject_underindented_flow_continuation(yaml_text):
    """Reject a flow collection that spans onto a line not indented
    more than its enclosing block context.

    FIX-P0-10 (R4/R5, T013 R9 grouped P0): the TypeScript ``yaml``
    package rejects a flow collection (mapping or sequence) in a
    block collection when any of its continuation lines is indented
    less than or equal to the innermost enclosing block collection
    ("Flow map in block collection must be sufficiently indented"),
    while PyYAML accepts any indent — so the Oracle returned VALID
    (or INVALID with a different error, e.g.
    ``event_config_not_mapping`` for ``on:``) where the TypeScript
    side returned INVALID / ``yaml_parse_error``. The divergence is
    in the parser itself, so no TypeScript-side rule can fix it —
    the Oracle must reject the same shapes. Raised as
    ``yaml.YAMLError`` so both callers map it onto the existing
    ``yaml_parse_error`` path, same family as
    ``_reject_adjacent_alias_colon`` (FIX-P0-05) and
    ``_reject_underindented_multiline_quoted_scalar`` (FIX-P0-08).
    This is a rejection, not input surgery: the text is never
    rewritten.

    Threshold rule, derived by probing the ``yaml`` package over a
    132-case + 25-case parallel mapping (see
    evidence/probes/fix-p0-10/README.md): for every token inside a
    flow collection whose start line is after the start line of the
    innermost flow collection containing it, the token's line must
    be indented strictly more than the innermost enclosing block
    collection —

    * a mapping value: the mapping's indent, i.e. the key indent
      (``m: {...}`` at key indent 0: continuation 0 rejects, 1+
      accepts; ``env: {...}`` under ``jobs: test:`` at key indent
      4: <=4 rejects, 5+ accepts; ``with: m: {...}`` at key indent
      10: <=10 rejects, 11+ accepts);
    * a sequence item: the sequence's indent, i.e. the ``-`` indent
      (``- {...}`` at dash 6: <=6 rejects, 7+ accepts);
    * the rule covers every kind of continuation token — a leading
      comma (R4), an explicit-key ``:`` (R5), a key, a value, a
      first item, a plain-scalar continuation, a nested flow start,
      an anchor/tag — in flow mappings and flow sequences alike,
      in extra keys, ``on:``, ``jobs:``/``env:`` and ``branches:``
      alike; flow nesting itself adds nothing. The threshold is
      the block indent, NOT the flow collection's own start-line
      indent (``m:\\n  {a: 1,\\n  b: 2}`` accepts: continuation 2
      exceeds block indent 0 although it equals the flow start
      line's indent).
    * a line that only closes the OUTERMOST flow collection
      (``}`` / ``]`` on its own line) is exempt when its indent
      equals the innermost block indent — the ``yaml`` package
      lexer's ``atFlowEndMarker`` exemption (indent ==
      indentNext - 1, flowLevel == 1); a close at a greater indent
      passes the normal check anyway, but an INNER close at indent
      <= block indent, or an outer close BELOW the block indent,
      is rejected (FIX-P0-11 close-line narrowing, see the
      FlowEndToken branch below). Any other token on that line is
      still checked (``}, b: 2`` at indent 0 rejects: the ``}`` is
      exempt, the ``,`` and ``b`` are not).
    * a line that is empty or contains only spaces is skipped (it
      carries no token); a comment-only line carries no token
      either (PyYAML discards comments), so neither can trigger.
      A line containing a tab is NOT blank — a tab-only line has
      leading-space count 0.
    * a plain or quoted scalar spanning lines is checked on every
      line it spans (a ``foo`` / ``bar`` continuation at indent 0
      rejects, at 1+ accepts); for quoted scalars this coincides
      exactly with ``_reject_underindented_multiline_quoted_scalar``
      and changes nothing there.
    * a flow collection at the document root has no enclosing
      block collection and is never rejected (the ``yaml`` package
      ignores indent for top-level flow collections).

    The check runs on the scanner token stream: the block-indent
    stack is the ``start_mark.column`` of each
    ``BlockMappingStartToken`` / ``BlockSequenceStartToken``
    (``BlockEndToken`` pops); the flow stack is the
    ``start_mark.line`` of each ``FlowMappingStartToken`` /
    ``FlowSequenceStartToken`` (``FlowMappingEndToken`` /
    ``FlowSequenceEndToken`` pops). A flow-end token closing the
    outermost flow at exactly the block indent is exempt; every
    other token inside a flow collection — including any other
    flow-end token — is checked against the line it starts on, and
    a scalar token is additionally checked on every line it spans.
    """
    lines = yaml_text.split("\n")
    block_stack = []
    flow_stack = []

    def check_line(line_no):
        if not flow_stack or not block_stack:
            return
        # Only continuation lines count: a token on the innermost
        # flow collection's own start line is not a continuation.
        if line_no <= flow_stack[-1]:
            return
        indent = _flow_line_indent(lines, line_no)
        if indent is not None and indent <= block_stack[-1]:
            raise yaml.YAMLError(
                "flow collection continuation not indented "
                "beyond block context"
            )

    for token in yaml.scan(yaml_text, Loader=_StrictBaseLoader):
        if isinstance(
            token,
            (yaml.tokens.BlockMappingStartToken, yaml.tokens.BlockSequenceStartToken),
        ):
            block_stack.append(token.start_mark.column)
        elif isinstance(token, yaml.tokens.BlockEndToken):
            if block_stack:
                block_stack.pop()
        elif isinstance(
            token,
            (yaml.tokens.FlowMappingStartToken, yaml.tokens.FlowSequenceStartToken),
        ):
            # A nested flow start is itself a continuation token of
            # the enclosing flow collection: check it before pushing.
            if flow_stack:
                check_line(token.start_mark.line)
            flow_stack.append(token.start_mark.line)
        elif isinstance(
            token,
            (yaml.tokens.FlowMappingEndToken, yaml.tokens.FlowSequenceEndToken),
        ):
            # FIX-P0-11 (R6 investigation, close-line narrowing): the
            # flow-end token is exempt ONLY when it closes the
            # OUTERMOST flow collection (flow_stack depth 1 at this
            # token) AND it is the first token on its line AND its
            # line indent equals the innermost block indent. That is
            # the `yaml` package lexer's `atFlowEndMarker` exemption
            # (node_modules/yaml parseFlowCollection: indent ==
            # indentNext - 1, flowLevel == 1, line starts with `]` /
            # `}`; indentNext is the block indent + 1, so
            # indentNext - 1 is the block indent). An inner close
            # (`m: {n: {a: 1\n}\n , b: 2}`, flowLevel 2) or an outer
            # close below the block indent (`x:\n  m: {a: 1\n}`,
            # close 0 < block 2) both error in the `yaml` package
            # ("Flow map in block collection must be sufficiently
            # indented") while PyYAML accepts them, so they are
            # checked like any other continuation token. A close on
            # the flow's own start line is not a continuation
            # (check_line returns early there); a close that is not
            # the first token on its line is checked with the line's
            # other tokens anyway (`, b: 2` after a `}` at indent 0
            # still rejects). Probed in the FIX-P0-11 mapping
            # (evidence/probes/fix-p0-11/README.md §3): outer close
            # == block indent accepts, < block indent rejects,
            # > block indent accepts; inner close == block indent
            # rejects, > block indent accepts; inner seq close
            # likewise; the fix-p0-10 matrix's close rows (outer
            # close at block indent 0, indents 0/1/2) are unchanged.
            if flow_stack:
                line_no = token.start_mark.line
                indent = _flow_line_indent(lines, line_no)
                is_outermost = len(flow_stack) == 1
                first_on_line = (
                    indent is not None
                    and token.start_mark.column == indent
                )
                if not (
                    is_outermost
                    and first_on_line
                    and block_stack
                    and indent == block_stack[-1]
                ):
                    check_line(line_no)
                flow_stack.pop()
        else:
            if flow_stack:
                check_line(token.start_mark.line)
                if isinstance(token, yaml.tokens.ScalarToken):
                    for line_no in range(
                        token.start_mark.line + 1, token.end_mark.line + 1
                    ):
                        check_line(line_no)


def _reject_unseparated_comment_in_flow(yaml_text):
    """Reject a comment the TypeScript ``yaml`` package refuses for
    lack of separating whitespace, while PyYAML accepts it.

    FIX-P0-11 (R6, T013 R10 grouped P0, plus the inline family
    found while mapping it): the TypeScript ``yaml`` package
    errors "Comments must be separated from other tokens by white
    space characters" in two shapes, both in ``resolveProps``
    (``node_modules/yaml``): a comment token is reached while
    ``hasSpace`` is false. PyYAML accepts both shapes, so the
    Oracle returned VALID where the TypeScript side returned
    INVALID / ``yaml_parse_error``. The divergence is in the
    parser itself, so no TypeScript-side rule can fix it — the
    Oracle must reject the same shapes. Raised as
    ``yaml.YAMLError`` so both callers map it onto the existing
    ``yaml_parse_error`` path, same family as
    ``_reject_adjacent_alias_colon`` (FIX-P0-05),
    ``_reject_underindented_multiline_quoted_scalar`` (FIX-P0-08)
    and ``_reject_underindented_flow_continuation`` (FIX-P0-10).
    This is a rejection, not input surgery: the text is never
    rewritten.

    T1 — standalone comment line (R6, the R10 P0): a comment-only
    line at indent 0 inside a flow MAPPING, directly after a
    complete ``key: value`` pair. Mechanism: in a flow mapping the
    newline after a complete scalar value is consumed as that
    value's ``<end>``, so the comment becomes the FIRST token in
    the next item's ``start`` props with no space/newline before
    it, and ``resolveProps`` (called with ``startOnNewline: false``
    for flow collections) errors. Threshold rule, derived by
    probing the ``yaml`` package over a 56-case + 30-case +
    16-case parallel mapping (see
    evidence/probes/fix-p0-11/README.md): the comment indent is
    the ONLY deciding dimension — indent 0 rejects, indent >= 1
    accepts, whatever the enclosing block indent (top-level
    ``m:``, nested ``m:`` at key indent 2, ``jobs: env:`` at 4,
    deep ``with:`` at 10, block-sequence item at dash 6, document
    root). The previous line decides too: a complete pair (plain /
    quoted / multi-line quoted / anchor / tag / alias value, a
    nested flow closed on that line, a flow sequence closed on
    that line) rejects; after a trailing comma, after a bare key,
    after a ``:`` with the value on the next line, after a flow
    start (``{`` / nested ``{``), after an anchor/tag with the
    value still pending, after an explicit ``?`` alone, and after
    the flow's first item — all accept. Inside a flow SEQUENCE
    the comment attaches to the value's ``<end>`` and accepts, so
    only flow mappings reject. A blank line between the pair and
    the comment also accepts (the blank line's newline lands in
    the next item's ``start`` first, so ``hasSpace`` is already
    true) — and a blank line anywhere in the scan-back over
    comment-only lines breaks the chain the same way. Trailing
    spaces after the pair do NOT save the comment (they go to the
    value's ``<end>``). CRLF line endings behave identically.

    T2 — inline comment with no space after a flow token: a
    comment that starts immediately (same line, no space/newline)
    after one of ``,`` ``{`` ``}`` ``[`` ``]`` inside a flow
    collection (``m: {a: 1,#c\n b: 2}``, ``m: {a: 1,#c\n}``,
    ``m: [a,#c\n]``, ``m: {#c\n a: 1}``, ``m: {a: 1}#c``). The
    comma / bracket is the first token in the next item's
    ``start`` props and sets ``hasSpace`` false, so the comment
    errors. A space after the token (``, #c``, ``{ #c``, ``} #c``)
    accepts, and a comment after ``:`` or ``?`` with no space
    (``a:#c`` — which is not a comment at all, it is inside the
    plain scalar key ``a:#c 1``; ``?#c``) accepts, so only
    ``,{}[]`` trigger. A ``#`` inside a quoted or plain scalar
    (``"x,#y"``, ``x#y``) is scalar content, not a comment, and
    never triggers; a ``#`` after a block-level ``,`` / ``{``
    (``a: b,#c`` — the ``,`` is inside the plain scalar) never
    triggers either.

    The check needs RAW-LINE scanning: PyYAML's token stream
    discards comments entirely, so the existing ``_reject_*``
    family's token scanning cannot see comment lines at all. The
    token stream is still used for everything else: token spans
    decide whether a ``#`` is scalar content (inside a token
    span) or a real comment start (inside no token span — PyYAML's
    scanner skips comments, so an uncovered ``#`` is a comment);
    the flow stack at each comment line decides whether the
    innermost flow collection is a mapping; and the last token
    before the comment line decides whether the previous pair is
    complete (a scalar is a VALUE when the token before it, over
    anchor/tag properties, is a ``ValueToken``; a KEY when it is a
    ``KeyToken`` — a bare key; a ``FlowEntryToken`` / ``ValueToken``
    / ``KeyToken`` / flow-start / anchor / tag as the last token
    means the value is still pending; a flow-end / alias token
    means the pair is complete).

    Deliberately NOT rejected (all probed, both sides already
    agree): comment lines at indent >= 1 anywhere; comment lines
    after a comma / bare key / ``:`` / flow start / pending
    anchor-tag / ``?``; comments inside flow sequences; inline
    comments with a space after the token; ``#`` inside quoted or
    plain scalars; ``#`` after a block-level ``,`` / ``{``. A
    line containing a tab is NOT blank (same convention as
    ``_reject_underindented_multiline_quoted_scalar``): a
    tab-only line stops the scan-back as a content line — any
    document with a tab line is INVALID on both sides anyway (TS
    FIX-P0-06 tab rule / PyYAML tab scanner error), so that
    choice cannot change a graded outcome. See the FIX-P0-11
    report §7 for the residuals this rule does NOT close (TS-side
    FIX-P0-09 S1 over-reach on null-value multi-line keys;
    reverse divergences ``&x#c`` / ``!!str#c`` where PyYAML
    rejects and the ``yaml`` package accepts).
    """
    lines = yaml_text.split("\n")
    tokens = list(yaml.scan(yaml_text, Loader=_StrictBaseLoader))

    def _pos(mark):
        return (mark.line, mark.column)

    all_spans = [(_pos(t.start_mark), _pos(t.end_mark)) for t in tokens]
    scalar_spans = [
        (_pos(t.start_mark), _pos(t.end_mark))
        for t in tokens
        if isinstance(t, yaml.tokens.ScalarToken)
    ]

    def _inside(pos, spans):
        return any(start <= pos < end for start, end in spans)

    def _line_text(line_no):
        raw = lines[line_no]
        return raw[:-1] if raw.endswith("\r") else raw

    def _is_blank(line_no):
        line = _line_text(line_no)
        return line == "" or line.strip(" ") == ""

    # Per-line comment start: the first `#` on the line that is not
    # inside any token span. A `#` after that one is inside the
    # comment it started; a `#` inside a token span is scalar
    # content (quoted / plain / block scalar), not a comment.
    comment_start = {}
    for line_no in range(len(lines)):
        line = _line_text(line_no)
        for col, ch in enumerate(line):
            if ch != "#":
                continue
            if _inside((line_no, col), all_spans):
                continue
            comment_start[line_no] = col
            break

    # Standalone comment lines: the comment start is the first
    # non-space/tab character on the line.
    standalone = {}
    for line_no, col in comment_start.items():
        line = _line_text(line_no)
        if line[:col].strip(" \t") == "":
            standalone[line_no] = col

    # --- T2: inline comment with no space after a flow token ---
    for line_no, col in comment_start.items():
        if col == 0:
            continue  # standalone line: T1's case, not T2
        if line_no in standalone:
            continue  # standalone line at indent >= 1: no T2
        line = _line_text(line_no)
        prev = line[col - 1]
        if prev not in ",{}[]":
            continue
        if _inside((line_no, col - 1), scalar_spans):
            # The `,` / `{` / ... is scalar content, e.g. `b,#c`
            # at block level — not a flow token.
            continue
        raise yaml.YAMLError(
            "comment immediately after flow token without separation"
        )

    # --- T1: standalone comment line at indent 0 in a flow map ---
    # Replay the token stream to get, for every line, the innermost
    # flow collection open at the start of that line and the index
    # of the last token starting before that line.
    flow_at_line = {}
    last_idx_before = {}
    flow_stack = []
    tok_idx = 0
    last_idx = None
    for line_no in range(len(lines)):
        while tok_idx < len(tokens) and tokens[tok_idx].start_mark.line < line_no:
            t = tokens[tok_idx]
            if isinstance(
                t,
                (yaml.tokens.FlowMappingStartToken, yaml.tokens.FlowSequenceStartToken),
            ):
                flow_stack.append(
                    "map"
                    if isinstance(t, yaml.tokens.FlowMappingStartToken)
                    else "seq"
                )
            elif isinstance(
                t,
                (yaml.tokens.FlowMappingEndToken, yaml.tokens.FlowSequenceEndToken),
            ):
                if flow_stack:
                    flow_stack.pop()
            last_idx = tok_idx
            tok_idx += 1
        flow_at_line[line_no] = flow_stack[-1] if flow_stack else None
        last_idx_before[line_no] = last_idx

    def _last_token_is_complete_pair(idx):
        t = tokens[idx]
        if isinstance(t, yaml.tokens.FlowEntryToken):
            return False  # after a comma
        if isinstance(t, yaml.tokens.ValueToken):
            return False  # value pending (`a:` / value next line)
        if isinstance(t, yaml.tokens.KeyToken):
            return False  # explicit key pending (`?` alone)
        if isinstance(
            t,
            (yaml.tokens.FlowMappingStartToken, yaml.tokens.FlowSequenceStartToken),
        ):
            return False  # flow just opened
        if isinstance(
            t,
            (yaml.tokens.FlowMappingEndToken, yaml.tokens.FlowSequenceEndToken),
        ):
            return True  # nested flow closed: pair complete
        if isinstance(t, (yaml.tokens.AnchorToken, yaml.tokens.TagToken)):
            return False  # anchor/tag pending: value not yet seen
        if isinstance(t, yaml.tokens.AliasToken):
            return True  # alias is a complete value
        if isinstance(t, yaml.tokens.ScalarToken):
            # Walk back over anchor/tag properties to the token
            # that decides the scalar's role.
            j = idx - 1
            while j >= 0 and isinstance(
                tokens[j], (yaml.tokens.AnchorToken, yaml.tokens.TagToken)
            ):
                j -= 1
            if j < 0:
                return False
            prev = tokens[j]
            if isinstance(prev, yaml.tokens.ValueToken):
                return True  # a value scalar: pair complete
            if isinstance(prev, yaml.tokens.KeyToken):
                return False  # a key scalar: bare key
            return False  # seq item / first key: not complete
        return False

    for line_no, col in standalone.items():
        line = _line_text(line_no)
        indent = len(line) - len(line.lstrip(" "))
        if indent != 0:
            continue
        if flow_at_line.get(line_no) != "map":
            continue
        # Previous effective line: scan back over real standalone
        # comment lines; a blank line breaks the chain (the
        # `yaml` package accepts the comment then).
        p = line_no - 1
        while p >= 0 and p in standalone:
            p -= 1
        if p < 0 or _is_blank(p):
            continue
        idx = last_idx_before.get(line_no)
        if idx is None:
            continue
        if _last_token_is_complete_pair(idx):
            raise yaml.YAMLError(
                "standalone comment line at indent 0 in flow mapping "
                "after a complete key:value pair"
            )


def _raw_tag_suffix(yaml_text, token):
    """Raw (undecoded) suffix of a shorthand ``TagToken``, or ``None``
    for a verbatim tag.

    PyYAML's ``scan_tag_uri`` DECODES ``%XX`` escapes into the token
    value (``!foo%5Bbar`` -> suffix ``'foo[bar'``), so the decoded
    value cannot tell a literal ``[`` / ``,`` from an escaped one —
    and the ``yaml`` package does not treat an escaped ``[`` / ``,``
    as a structural character (``!foo%5Bbar 1`` and ``!foo%2C b: 1``
    are accepted by both sides; see evidence/probes/fix-p0-13).
    The raw source slice of the token (``text[start.index:end.index]``)
    is therefore the only safe input: strip the handle (``!``, ``!!``
    or ``!name!`` — its length is ``len(token.value[0])``) and what
    remains is the suffix exactly as written. Verbatim tags
    (``!<...>``, handle ``None``) are excluded: their suffix is a URI
    inside angle brackets, and a ``,`` / ``[`` / ``]`` there is URI
    content both sides accept (``!<foo[bar]>``, ``!<tag:x,>``).
    """
    handle = token.value[0]
    if handle is None:
        return None
    raw = yaml_text[token.start_mark.index:token.end_mark.index]
    return raw[len(handle):]


def _reject_tag_suffix_brackets(yaml_text):
    """Reject a tag whose raw suffix contains ``[`` or ``]``.

    FIX-P0-13 (P0-C2, T013 R12 grouped P0): PyYAML's tag-suffix URI
    charset includes ``[`` / ``]`` (``scan_tag_uri``), so it consumes
    them into the suffix and the Oracle's ``_StrictBaseLoader``
    accepts the tag (``m: {a: !foo[bar] 1}``, ``m: [!foo] 1]``,
    ``m: [!foo], 1]``); the TypeScript ``yaml`` package stops the
    tag at ``[`` / ``]`` and then fails on the leftover token, so
    the TypeScript side returns INVALID / ``yaml_parse_error``.
    The divergence is in the parser itself, so no TypeScript-side
    rule can fix it — the Oracle must reject the same shapes.
    Raised as ``yaml.YAMLError`` so both callers map it onto the
    existing ``yaml_parse_error`` path, same family as
    ``_reject_adjacent_alias_colon`` (FIX-P0-05) and
    ``_reject_unseparated_comment_in_flow`` (FIX-P0-11). This is a
    rejection, not input surgery: the text is never rewritten.

    The check runs on the scanner token stream (a ``TagToken``
    carries the tag; quoted / plain scalars never produce one, so
    a ``[`` inside ``"x[y"`` can never trigger). The raw suffix —
    not the decoded token value — decides (see ``_raw_tag_suffix``):
    ``%5B`` / ``%5D`` escapes are literal ``%`` + hex in the source
    and both sides accept them, so they must not trigger. The rule
    fires in every context (flow mapping, flow sequence, block,
    key or value position): all eleven mapped shapes diverge the
    same way, and the already-agreeing shapes (a tag suffix
    followed by ``}`` / ``,`` with no node, ``{a: !foo]}``,
    ``{a: !foo], b: 1}`` — both sides already reject) are
    unaffected because the scanner itself raises there before this
    rule is reached. Verbatim tags are excluded (both sides accept
    ``!<foo[bar]>``).
    """
    for token in yaml.scan(yaml_text, Loader=_StrictBaseLoader):
        if not isinstance(token, yaml.tokens.TagToken):
            continue
        suffix = _raw_tag_suffix(yaml_text, token)
        if suffix is None:
            continue
        if "[" in suffix or "]" in suffix:
            raise yaml.YAMLError("tag suffix contains '[' or ']'")


def _reject_tag_suffix_comma(yaml_text):
    """Reject a tag whose raw suffix ends with ``,`` outside a flow
    sequence.

    FIX-P0-13 (P0-C1, T013 R12 grouped P0): PyYAML's ``scan_tag_uri``
    treats ``,`` as a URI character, so it consumes a flow ``,``
    into the tag suffix (``!foo,``) and the parser then fails in a
    flow mapping (``m: {a: !foo, b: 1}`` — "while parsing a flow
    mapping") or accepts a different structure in block context
    (``a: !foo,`` + next pair — the tag takes a null node and the
    next line becomes the value). The TypeScript ``yaml`` package
    stops the tag at ``,`` and parses on, so it says VALID where
    the Oracle says INVALID (flow mapping) and INVALID where the
    Oracle says VALID (block). The flow-mapping half is closed by
    the TypeScript-side rule ``hasRejectedTagComma`` (which rejects
    the same shapes there); the block half — and the both-accept
    shapes where the following node is not a pair key
    (``m: {a: !foo, 1}``, ``m: {a: !foo, [1, 2]}`` — the two sides
    parse different structures, invisible in the ``m:`` slot but a
    real divergence in the ``on:`` / ``jobs:`` slots) — can only
    be closed here, by rejecting the same shapes on the Oracle
    side so both sides agree on INVALID. Raised as ``yaml.YAMLError``
    so both callers map it onto the existing ``yaml_parse_error``
    path, same family as ``_reject_tag_suffix_brackets`` above.
    This is a rejection, not input surgery: the text is never
    rewritten.

    Threshold rule, derived by probing the ``yaml`` package and
    PyYAML over a 38-shape + 22-shape parallel mapping (see
    evidence/probes/fix-p0-13/map-p0-13.py and map2-p0-13.py):
    the deciding dimensions are the raw suffix (it must END with
    ``,`` — ``!foo,bar`` does not trigger, the ``,`` is mid-suffix
    and both sides accept; ``!foo ,`` does not trigger, the space
    ends the tag first) and the innermost flow kind (a flow
    MAPPING triggers, a flow SEQUENCE does not — ``[!foo, a: 1]``,
    ``[!foo, 1]`` are accepted by both sides and must stay that
    way; a flow map nested in a sequence DOES trigger, so the
    stack tracks the innermost kind, not just depth). Block
    context (no flow open) triggers. The raw suffix — not the
    decoded token value — decides (see ``_raw_tag_suffix``):
    ``!foo%2C,`` ends with a literal ``,`` and triggers, while
    ``!foo%2C`` (escaped comma only) does not. Verbatim tags are
    excluded (their ``,`` after ``>`` is already rejected on the
    TypeScript side by ``hasRejectedAnchorOrTag``; a ``,`` inside
    the verbatim URI is content both sides accept).
    """
    flow_stack = []
    for token in yaml.scan(yaml_text, Loader=_StrictBaseLoader):
        if isinstance(
            token,
            (yaml.tokens.FlowMappingStartToken, yaml.tokens.FlowSequenceStartToken),
        ):
            flow_stack.append(
                "map"
                if isinstance(token, yaml.tokens.FlowMappingStartToken)
                else "seq"
            )
        elif isinstance(
            token,
            (yaml.tokens.FlowMappingEndToken, yaml.tokens.FlowSequenceEndToken),
        ):
            if flow_stack:
                flow_stack.pop()
        elif isinstance(token, yaml.tokens.TagToken):
            suffix = _raw_tag_suffix(yaml_text, token)
            if suffix is None or not suffix.endswith(","):
                continue
            if flow_stack and flow_stack[-1] == "seq":
                continue
            raise yaml.YAMLError(
                "tag suffix ends with ',' outside a flow sequence"
            )


def _reject_anchored_empty_key(yaml_text):
    """Reject an anchored empty key in a block mapping with >= 2 pairs.

    FIX-P0-13 (P0-C3, T013 R12 grouped P0): the TypeScript ``yaml``
    package rejects an anchored empty key (``&x: 1`` — the anchor
    marks an empty key node) with MULTILINE_IMPLICIT_KEY ("Implicit
    keys need to be on a single line") in a block mapping, while
    PyYAML accepts it and the Oracle returns VALID. The divergence
    is in the parser itself, so no TypeScript-side rule can fix it
    — the Oracle must reject the same shapes. Raised as
    ``yaml.YAMLError`` so both callers map it onto the existing
    ``yaml_parse_error`` path, same family as
    ``_reject_tag_suffix_brackets`` above. This is a rejection, not
    input surgery: the text is never rewritten.

    Threshold rule, derived by probing the ``yaml`` package over a
    17-shape + 13-shape + 12-shape parallel mapping (see
    evidence/probes/fix-p0-13/map-p0-13.py, map2-p0-13.py,
    map3/map4/map5-p0-13.py): the token pattern is ``KeyToken``,
    optional ``TagToken``s, ``AnchorToken``, ``ValueToken`` — the
    anchor sits directly before the ``:`` with no scalar key
    between them. Three conditions decide, and all three were
    probed shape by shape:

    * Flow context exempts: ``m: {&x: 1}`` / ``m: {&x: 1, b: 2}``
      are accepted by both sides, so the rule fires only when the
      innermost collection is a block mapping.
    * Pair count exempts: a mapping with a single pair accepts on
      both sides — nested (``a:\\n  &x: 1`` + root pairs), a
      block-sequence item (``- &x: 1``), and the lone document
      (``&x: 1`` alone, where the ``yaml`` package does not even
      see a mapping) — so the rule fires only when the enclosing
      block mapping holds >= 2 pairs. The lone document stays a
      pre-existing divergence (TS ``workflow_root_not_mapping``
      vs Oracle ``missing_on_key`` — different error codes for a
      non-workflow input; no rejection rule can close it, see the
      FIX-P0-13 report §7).
    * First-pair null-value exempts: an anchored empty key whose
      value is null AND which is the first pair of its mapping
      accepts on both sides (``&x:\\nname: probe...`` — the pair
      vanishes from the ``yaml`` package's output; the same holds
      nested, ``a:\\n  &x:\\n  b: 2``, and with a comment after the
      colon). The exemption is narrow: a scalar / collection /
      anchored value in first position rejects (``&x: 1``,
      ``&x: {a: 1}``, ``&x: [1, 2]``, ``&x: &y 1``), a null value
      in any other position rejects (``&x:`` mid / last), and a
      space between the anchor and the colon breaks it
      (``&x :`` first + null rejects — the anchor must be glued
      to the ``:``, i.e. ``AnchorToken.end == ValueToken.start``).
      "Value is null" is read off the token after the ``:``: a
      ``KeyToken`` (next pair), ``BlockEndToken`` or
      ``StreamEndToken`` means null; anything else (a scalar, a
      collection start, another property) means a value follows.

    A double property (``!foo &x: 1`` — tag then anchor on the
    empty key) is covered by walking back over ``TagToken``s from
    the anchor. An explicit key (``? &x: 1``) needs no special
    case: its inner mapping holds a single pair, so the pair-count
    condition already exempts it, and the Oracle rejects it anyway
    at construction time. ``&x !foo: 1`` (anchor then tag) is not
    matched — the anchor's next token is a tag, not a ``:`` — and
    both sides already reject it.

    FIX-P0-16 (P0-1, T013 R15): a TAG + UNGLUED anchored empty key
    (``!bar &b : 2``) is ACCEPTED by the TypeScript side in every
    position except the first pair of a pair-value block mapping —
    the ``yaml`` package renders the key as the empty string ``""``
    with the tag and anchor attached, so ``hasUnrepresentableKey``
    (which needs a null-valued plain key) does not fire — so C3
    must not fire on it either. The one position the TypeScript
    side DOES reject (first pair of a pair-value block mapping)
    is already covered by ``_reject_unglued_anchored_empty_key``
    (rule (d), tag guard), so narrowing C3 here loses nothing.
    Candidates with a tag before the anchor AND an unglued anchor
    are skipped; a tagged GLUED anchor still fires (rule (c) /
    C3), and an untagged anchor is unaffected.
    """
    tokens = list(yaml.scan(yaml_text, Loader=_StrictBaseLoader))
    # Stack frames: {"kind": "blockmap" | "blockseq" | "flowmap" |
    # "flowseq", "pairs": int}. "pairs" counts KeyTokens belonging
    # to that frame (a KeyToken inside a flow collection belongs to
    # the flow, not to any block frame).
    stack = []
    candidates = []  # (frame, is_first, value_is_null, glued, has_tag)
    for i, token in enumerate(tokens):
        if isinstance(token, yaml.tokens.BlockMappingStartToken):
            stack.append({"kind": "blockmap", "pairs": 0})
        elif isinstance(token, yaml.tokens.BlockSequenceStartToken):
            stack.append({"kind": "blockseq", "pairs": 0})
        elif isinstance(token, yaml.tokens.FlowMappingStartToken):
            stack.append({"kind": "flowmap", "pairs": 0})
        elif isinstance(token, yaml.tokens.FlowSequenceStartToken):
            stack.append({"kind": "flowseq", "pairs": 0})
        elif isinstance(
            token,
            (
                yaml.tokens.BlockEndToken,
                yaml.tokens.FlowMappingEndToken,
                yaml.tokens.FlowSequenceEndToken,
            ),
        ):
            if stack:
                stack.pop()
        elif isinstance(token, yaml.tokens.KeyToken):
            if stack and stack[-1]["kind"] == "blockmap":
                stack[-1]["pairs"] += 1
        elif isinstance(token, yaml.tokens.AnchorToken):
            j = i - 1
            tags = 0
            while j >= 0 and isinstance(tokens[j], yaml.tokens.TagToken):
                tags += 1
                j -= 1
            if j < 0 or not isinstance(tokens[j], yaml.tokens.KeyToken):
                continue
            if i + 1 >= len(tokens) or not isinstance(
                tokens[i + 1], yaml.tokens.ValueToken
            ):
                continue
            if not stack or stack[-1]["kind"] != "blockmap":
                continue
            frame = stack[-1]
            # This pair's KeyToken was already counted (it precedes
            # the anchor), so pairs == 1 means first pair.
            is_first = frame["pairs"] == 1
            value_token = tokens[i + 1]
            nxt = tokens[i + 2] if i + 2 < len(tokens) else None
            value_is_null = nxt is None or isinstance(
                nxt,
                (
                    yaml.tokens.KeyToken,
                    yaml.tokens.BlockEndToken,
                    yaml.tokens.StreamEndToken,
                ),
            )
            glued = token.end_mark.index == value_token.start_mark.index
            candidates.append(
                (frame, is_first, value_is_null, glued, tags > 0)
            )
    for frame, is_first, value_is_null, glued, has_tag in candidates:
        # FIX-P0-16 (P0-1): tag + unglued is accepted on the
        # TypeScript side (the first-pair-of-pair-value position is
        # rule (d)'s, not C3's).
        if has_tag and not glued:
            continue
        if frame["pairs"] >= 2 and not (
            is_first and value_is_null and glued
        ):
            raise yaml.YAMLError(
                "anchored empty key in a block mapping"
            )


def _unwrap_lone_anchored_empty_key_doc(yaml_text, doc):
    """Return the unwrapped mapping for a lone anchored-empty-key doc
    whose value is a mapping, else the doc unchanged.

    FIX-P0-15 (P0-1, T013 R14 family (a)): the ``yaml`` package
    renders a lone ``&x: {on: push}`` document as the mapping
    ``{on: push}`` itself (the anchor ``&x:`` attaches to the
    following node, so the empty key vanishes), while PyYAML renders
    it as the 1-pair mapping ``{'': {on: push}}`` — so the
    TypeScript side returns VALID where the Oracle returned
    ``missing_on_key``. The discriminant is the same token walk as
    ``_is_lone_anchored_empty_key_doc`` conditions 1-4, with
    condition 5 inverted: the value IS a mapping at token level
    (BlockMappingStart / FlowMappingStart as the first value token
    after skipping tags on the value). The walk is derived from a
    100 + 22 + 18 shape parallel mapping (see
    evidence/probes/fix-p0-15/map-p0-15.py, map2/map3/map4/map5/map6-p0-15.py):

    * the walk fires only for a document that is exactly one
      single-pair block mapping (StreamStart, optional
      DocumentStart, BlockMappingStart, KeyToken, AnchorToken,
      ValueToken, <mapping value>, BlockEnd, optional DocumentEnd,
      StreamEnd) with no TagToken between the KeyToken and the
      AnchorToken and the anchor glued to the colon. A mapping value
      in any multi-pair root (``&x: {on: push}`` + a further pair)
      is rejected on BOTH sides — the ``yaml`` package throws
      "Unexpected scalar at node end" and ``_reject_anchored_empty_key``
      fires — so the unwrap never competes with C3 there.
    * the unwrapped doc is the value mapping itself, so the ``on``
      logic in ``parse_workflow_yaml`` and the ``jobs`` lookup in
      ``extract_jobs`` both read it. A value containing ``jobs:``
      also diverges in jobs mode (``&x: {jobs: {...}}``: TS [1 job]
      vs Oracle [0 jobs]), so the unwrap must be wired into both
      callers, not just the trigger path.
    * when the loaded value is already a dict (an unknown tag such
      as ``!foo`` loads by node kind, and since FIX-P0-16 a known
      tag such as ``!!str`` on a mapping constructs the mapping by
      kind — see ``_construct_core_scalar``), it is used directly;
      when a known tag such as ``!!str`` makes ``_StrictBaseLoader``
      construct a string from the mapping node instead, the value
      mapping's own token span is re-parsed (sliced from the
      mapping start — from the line start for a block mapping so
      the indentation is preserved, from the token itself for a
      flow mapping — to its matching end token). A no-space
      ``&x:!!str`` (the ``:`` not followed by a blank) IS unwrapped
      since FIX-P0-16: the ``_StrictBaseLoader`` scanner mirror
      (``check_value``) makes the ``:`` a value indicator in
      implicit-key position, so the token walk below — which scans
      with ``Loader=_StrictBaseLoader`` — sees the lone-doc
      pattern. (Before FIX-P0-16 PyYAML did not even see the ``:``
      as a value indicator there and the shape stayed a disclosed
      residual.)
    * a self-alias — an alias inside the value span that names the
      outer anchor (``&x: {on: *x}``) — raises ``yaml.YAMLError``:
      the ``yaml`` package rejects it ("An alias node must not
      specify any properties" / unresolved alias) while the loaded
      doc would otherwise resolve the alias to the mapping itself.
      The alias is only safe when an anchor of the same name is
      defined earlier INSIDE the span (it shadows the outer one:
      ``&x: {a: &y 1, b: *y}`` and ``&x: {a: &x 1, on: *x}``
      keep MATCHING). An alias used before its definition
      (``&x: {on: *y, a: &y 1}``) is rejected by the loader itself
      before this helper is reached.
    """
    if not isinstance(doc, dict) or set(doc.keys()) != {""}:
        return doc
    # FIX-P0-16 (P0-2): scan with the mirrored loader, so a
    # no-space ``&x:!!tag`` lone-doc is seen as Key / Anchor /
    # Value / Tag / mapping. The reject rules above keep the
    # unmirrored scan (their discriminants are about spaced forms).
    try:
        tokens = list(yaml.scan(yaml_text, Loader=_StrictBaseLoader))
    except yaml.YAMLError:
        return doc
    n = len(tokens)
    i = 0
    if n == 0 or not isinstance(tokens[i], yaml.tokens.StreamStartToken):
        return doc
    i += 1
    if i < n and isinstance(tokens[i], yaml.tokens.DocumentStartToken):
        i += 1
    if i >= n or not isinstance(tokens[i], yaml.tokens.BlockMappingStartToken):
        return doc
    i += 1
    if i >= n or not isinstance(tokens[i], yaml.tokens.KeyToken):
        return doc
    i += 1
    if i >= n or not isinstance(tokens[i], yaml.tokens.AnchorToken):
        return doc
    anchor = tokens[i]
    anchor_name = anchor.value
    i += 1
    if i >= n or not isinstance(tokens[i], yaml.tokens.ValueToken):
        return doc
    value_token = tokens[i]
    if anchor.end_mark.index != value_token.start_mark.index:
        return doc
    i += 1
    while i < n and isinstance(tokens[i], yaml.tokens.TagToken):
        i += 1
    if i >= n:
        return doc
    first = tokens[i]
    if not isinstance(
        first,
        (yaml.tokens.BlockMappingStartToken, yaml.tokens.FlowMappingStartToken),
    ):
        return doc
    # Span of the value mapping: mapping start .. matching end token.
    start_i = i
    depth = 0
    end_i = None
    for j in range(start_i, n):
        t = tokens[j]
        if isinstance(
            t,
            (
                yaml.tokens.BlockMappingStartToken,
                yaml.tokens.FlowMappingStartToken,
                yaml.tokens.BlockSequenceStartToken,
                yaml.tokens.FlowSequenceStartToken,
            ),
        ):
            depth += 1
        elif isinstance(
            t,
            (
                yaml.tokens.BlockEndToken,
                yaml.tokens.FlowMappingEndToken,
                yaml.tokens.FlowSequenceEndToken,
            ),
        ):
            depth -= 1
            if depth == 0:
                end_i = j
                break
    if end_i is None:
        return doc
    # Remainder must be exactly the root BlockEnd, an optional
    # DocumentEnd, and StreamEnd — i.e. the document held exactly
    # one pair.
    k = end_i + 1
    if k >= n or not isinstance(tokens[k], yaml.tokens.BlockEndToken):
        return doc
    k += 1
    if k < n and isinstance(tokens[k], yaml.tokens.DocumentEndToken):
        k += 1
    if not (k == n - 1 and isinstance(tokens[k], yaml.tokens.StreamEndToken)):
        return doc
    # Self-alias inside the value span (see docstring).
    defined_inside = False
    for j in range(start_i, end_i + 1):
        t = tokens[j]
        if isinstance(t, yaml.tokens.AnchorToken) and t.value == anchor_name:
            defined_inside = True
        elif (
            isinstance(t, yaml.tokens.AliasToken)
            and t.value == anchor_name
            and not defined_inside
        ):
            raise yaml.YAMLError(
                "alias to the outer anchor inside an unwrapped mapping value"
            )
    value = doc[""]
    if isinstance(value, dict):
        return value
    # A known tag on the value mapping (``!!str``) makes the loader
    # construct a string instead of a dict — re-parse the span.
    if isinstance(first, yaml.tokens.FlowMappingStartToken):
        span_start = first.start_mark.index
    else:
        span_start = yaml_text.rfind("\n", 0, first.start_mark.index) + 1
    span = yaml_text[span_start : tokens[end_i].end_mark.index]
    reparsed = yaml.load(span, Loader=_StrictBaseLoader)
    if isinstance(reparsed, dict):
        return reparsed
    return doc


def _reject_second_anchor_on_value(yaml_text):
    """Reject a second anchor (or an alias) on the value node of an
    anchored empty key.

    FIX-P0-15 (P0-2, T013 R14 family (b)): the ``yaml`` package
    rejects a node carrying two anchors ("A node can have at most
    one anchor" / "An alias node must not specify any properties"),
    so ``&x: &y 1`` throws on the TypeScript side, while PyYAML
    accepts it and the Oracle returned ``missing_on_key``. The
    discriminant is a token pattern, derived from a 100 + 22 shape
    parallel mapping (see evidence/probes/fix-p0-15/map-p0-15.py,
    map2/map3-p0-15.py):

    * the pattern is KeyToken, AnchorToken, ValueToken — the first
      anchor immediately followed by the value colon — with the
      anchor GLUED to the colon (``AnchorToken.end ==
      ValueToken.start``). Only a glued anchor is attributed to the
      value node by the ``yaml`` package; ``&x : &y 1`` (unglued
      outer anchor) is an unglued-key shape, closed by
      ``_reject_unglued_anchored_empty_key`` instead. Tags between
      the key and the anchor are walked over (``!foo &x: &y 1`` is
      also rejected, by E05 as well as here — same error code).
    * the value node's first token, after skipping any TagTokens on
      the value, must be an AnchorToken (second anchor:
      ``&x: &y 1``, ``&x: &y {on: push}``, ``&x: &y [1]``,
      ``&x: &y`` null) or an AliasToken (``&x: *y`` with ``y``
      defined, ``&x: *x`` self-alias). A scalar / mapping / sequence
      first token does not fire (``&x: 1`` and ``&x: {on: push}``
      keep MATCHING). A tag between the value colon and the second
      anchor (``&x: !foo &y 1``) still fires — the tags are skipped.
    * the first anchor must be immediately followed by the ValueToken:
      an anchored NON-empty key (``&x k: &y 1``) keeps MATCHING
      (both sides ``missing_on_key``) and is excluded by this.
      Adjacent anchors with no value token between them
      (``&x &y 1``) are rejected by BOTH parsers already, so no rule
      is needed there. A second anchor inside a block-sequence item
      (``m:\\n - &x: &y 1``) also fires — the pattern is not
      position-scoped.
    """
    tokens = list(yaml.scan(yaml_text, Loader=_StrictBaseLoader))
    n = len(tokens)
    for i, token in enumerate(tokens):
        if not isinstance(token, yaml.tokens.AnchorToken):
            continue
        j = i - 1
        while j >= 0 and isinstance(tokens[j], yaml.tokens.TagToken):
            j -= 1
        if j < 0 or not isinstance(tokens[j], yaml.tokens.KeyToken):
            continue
        if i + 1 >= n or not isinstance(
            tokens[i + 1], yaml.tokens.ValueToken
        ):
            continue
        value_token = tokens[i + 1]
        if token.end_mark.index != value_token.start_mark.index:
            continue
        k = i + 2
        while k < n and isinstance(tokens[k], yaml.tokens.TagToken):
            k += 1
        if k >= n:
            continue
        if isinstance(
            tokens[k], (yaml.tokens.AnchorToken, yaml.tokens.AliasToken)
        ):
            raise yaml.YAMLError(
                "second anchor or alias on the value of an anchored empty key"
            )


def _reject_tagged_anchored_empty_key(yaml_text):
    """Reject a tagged anchored empty key (``!foo &x: 1``).

    FIX-P0-15 (P0-3, T013 R14 family (c)): the ``yaml`` package's
    ``hasRejectedAnchorOrTag`` (E05) rejects an anchor that follows
    another property and is followed by ``:`` in non-key position,
    so ``!foo &x: 1`` throws on the TypeScript side, while PyYAML
    accepts it and the Oracle returned ``missing_on_key``. The
    discriminant is a token pattern, derived from a 100 + 22 + 18
    shape parallel mapping (see evidence/probes/fix-p0-15/map-p0-15.py,
    map2/map3/map4/map5-p0-15.py):

    * the pattern is KeyToken, TagToken+, AnchorToken, ValueToken —
      at least one tag between the key and the anchor — with the
      anchor GLUED to the colon (``AnchorToken.end ==
      ValueToken.start``). The glued requirement is load-bearing:
      ``!foo &x : 1`` (a space before the colon) is accepted on
      both sides (``missing_on_key``) — the anchor sits on the key
      node there, E05 does not fire — so the rule must not fire on
      it. An explicit key (``? !foo &x: 1``) keeps MATCHING (both
      reject) and needs no special case.
    * the rule fires in every position: the lone document, nested
      single-pair block mappings, flow mappings (``m: {!foo &x: 1}``,
      ``m: {a: 1, !foo &x: 2}`` — E05 fires in flow too, because
      after a tag the previous significant character is the tag's
      last character, never ``{`` / ``,`` / ``[``), flow sequences
      of flow mappings (``m: [{!foo &x: 1}]``), and block-sequence
      items (``m:\\n - !foo &x: 1``). Multi-pair block mappings are
      already covered by ``_reject_anchored_empty_key`` (same error
      code), so the overlap is harmless. A tag on a key whose anchor
      is followed by a scalar key instead (``!foo &x k: 1``) does not
      match — the anchor's next token is not a ValueToken.
    """
    tokens = list(yaml.scan(yaml_text, Loader=_StrictBaseLoader))
    n = len(tokens)
    for i, token in enumerate(tokens):
        if not isinstance(token, yaml.tokens.AnchorToken):
            continue
        j = i - 1
        tags = 0
        while j >= 0 and isinstance(tokens[j], yaml.tokens.TagToken):
            tags += 1
            j -= 1
        if tags == 0:
            continue
        if j < 0 or not isinstance(tokens[j], yaml.tokens.KeyToken):
            continue
        if i + 1 >= n or not isinstance(
            tokens[i + 1], yaml.tokens.ValueToken
        ):
            continue
        value_token = tokens[i + 1]
        if token.end_mark.index != value_token.start_mark.index:
            continue
        raise yaml.YAMLError("tagged anchored empty key")


def _reject_unglued_anchored_empty_key(yaml_text):
    """Reject an unglued anchored empty key (``&x : 1``).

    FIX-P0-15 (P0-4, T013 R14 family (d)): the ``yaml`` package's
    ``hasUnrepresentableKey`` rejects an empty plain-scalar key
    (null value, zero-width range), so ``&x : 1`` throws on the
    TypeScript side, while PyYAML accepts it and the Oracle returned
    ``missing_on_key``. The discriminant is a token pattern with a
    tag guard, derived from a 100 + 22 + 18 shape parallel mapping
    plus a rule-level probe of the TypeScript rules and an AST dump
    (see evidence/probes/fix-p0-15/map-p0-15.py, map2/map3/map4/map5-p0-15.py,
    rule-probe.ts, ast-dump.ts):

    * the pattern is KeyToken, [TagToken]*, AnchorToken, ValueToken
      with the anchor UNGLUED (``AnchorToken.end !=
      ValueToken.start``). It fires in every position for an UNTAGGED
      anchor: the lone document, nested single- and multi-pair block
      mappings, flow mappings of any pair count (``m: {&x : 1}``,
      ``m: {a: 1, &x : 2}``), and block-sequence items
      (``m:\\n - &x : 1``). Multi-pair block mappings are already
      covered by ``_reject_anchored_empty_key`` (same error code).
    * the tag guard: a TAGGED unglued anchored empty key fires ONLY
      when it is the FIRST pair of a block mapping that is the VALUE
      of a pair (``m:\\n  !foo &x : 1`` — the ``yaml`` package renders
      that key as a null-valued plain scalar, so
      ``hasUnrepresentableKey`` fires). A tagged unglued key in any
      other position keeps MATCHING as ``missing_on_key``: the lone
      document (``!foo &x : 1``), the root mapping's first or second
      pair (``!foo &x : 1\\nb: 2``, ``a: 1\\n!foo &x : 2``), a
      second pair of a pair-value mapping, a flow mapping
      (``m: {!foo &x : 1}``), and a block-sequence-item mapping
      (``m:\\n  - !foo &x : 1``) — in all of those the ``yaml``
      package renders the key as the empty STRING ``""`` with the
      tag and anchor attached, so ``hasUnrepresentableKey`` (which
      needs a null value) does not fire. The "pair-value mapping"
      test walks back from the BlockMappingStart over TagTokens /
      AnchorTokens to a ValueToken; a mapping reached from a
      BlockEntry (sequence item) or from StreamStart (root) does not
      count. NOTE: ``a: 1\\n!foo &x : 2`` (tagged + unglued, second
      root pair) is a pre-existing ``_reject_anchored_empty_key``
      over-fire — the Oracle rejects it where the TypeScript side
      accepts — disclosed in the FIX-P0-15 report §7, NOT fixed
      here: narrowing C3 is a separate verified-rule change.
    """
    tokens = list(yaml.scan(yaml_text, Loader=_StrictBaseLoader))
    n = len(tokens)
    # Frame stack: {"kind": "blockmap" | "blockseq" | "flowmap" |
    # "flowseq", "pairs": int, "is_pair_value": bool}. "pairs" counts
    # KeyTokens belonging to that frame; "is_pair_value" is True for
    # a block mapping whose BlockMappingStart is reached from a
    # ValueToken (the mapping is a pair's value), False for the root
    # mapping and for sequence-item mappings.
    stack = []
    for i, token in enumerate(tokens):
        if isinstance(token, yaml.tokens.BlockMappingStartToken):
            is_pair_value = False
            j = i - 1
            while j >= 0 and isinstance(
                tokens[j],
                (yaml.tokens.TagToken, yaml.tokens.AnchorToken),
            ):
                j -= 1
            if j >= 0 and isinstance(tokens[j], yaml.tokens.ValueToken):
                is_pair_value = True
            stack.append(
                {"kind": "blockmap", "pairs": 0, "is_pair_value": is_pair_value}
            )
        elif isinstance(token, yaml.tokens.BlockSequenceStartToken):
            stack.append({"kind": "blockseq", "pairs": 0, "is_pair_value": False})
        elif isinstance(token, yaml.tokens.FlowMappingStartToken):
            stack.append({"kind": "flowmap", "pairs": 0, "is_pair_value": False})
        elif isinstance(token, yaml.tokens.FlowSequenceStartToken):
            stack.append({"kind": "flowseq", "pairs": 0, "is_pair_value": False})
        elif isinstance(
            token,
            (
                yaml.tokens.BlockEndToken,
                yaml.tokens.FlowMappingEndToken,
                yaml.tokens.FlowSequenceEndToken,
            ),
        ):
            if stack:
                stack.pop()
        elif isinstance(token, yaml.tokens.KeyToken):
            if stack:
                stack[-1]["pairs"] += 1
        elif isinstance(token, yaml.tokens.AnchorToken):
            j = i - 1
            tags = 0
            while j >= 0 and isinstance(tokens[j], yaml.tokens.TagToken):
                tags += 1
                j -= 1
            if j < 0 or not isinstance(tokens[j], yaml.tokens.KeyToken):
                continue
            if i + 1 >= n or not isinstance(
                tokens[i + 1], yaml.tokens.ValueToken
            ):
                continue
            value_token = tokens[i + 1]
            if token.end_mark.index == value_token.start_mark.index:
                continue  # Glued: not this rule's shape.
            if tags == 0:
                raise yaml.YAMLError("unglued anchored empty key")
            # Tagged: fire only as the first pair of a pair-value
            # block mapping (see docstring).
            if (
                stack
                and stack[-1]["kind"] == "blockmap"
                and stack[-1]["is_pair_value"]
                and stack[-1]["pairs"] == 1
            ):
                raise yaml.YAMLError(
                    "tagged unglued anchored empty key as the first pair "
                    "of a pair-value block mapping"
                )


def _reject_tagged_empty_key(yaml_text):
    """Reject a tagged empty key (``!bar : 2``) with no anchor.

    FIX-P0-16 (grid residual, T013 R15 P0-1 area): the ``yaml``
    package's ``hasUnrepresentableKey`` rejects a bare tagged empty
    key — a null-valued plain scalar with an empty source range —
    but only as the FIRST pair of a block mapping that is the VALUE
    of a pair (``m:\\n  !bar : 2``). In every other position the
    ``yaml`` package renders the key as the empty STRING ``""``
    with the tag attached, so ``hasUnrepresentableKey`` (which
    needs a null value) does not fire and both sides accept it:
    the lone document, the root mapping's first or second pair, a
    second pair of a pair-value mapping, a flow mapping, and a
    block-sequence-item mapping. This is exactly rule (d)'s tag
    guard, for the no-anchor case — (d) itself only fires when an
    anchor is present, so this rule covers the anchor-less shape.
    The discriminant is a token pattern, derived from a 17-shape
    parallel mapping (see evidence/probes/fix-p0-16/map-p0-16.py
    group p4): KeyToken, TagToken+, ValueToken — at least one tag
    between the key and the value, with NO AnchorToken, ScalarToken,
    AliasToken or other node token between the last tag and the
    value (a quoted empty key ``!bar "": 2`` has a ScalarToken
    there and is accepted on both sides; a tagged scalar key
    ``!bar x: 2`` likewise; a tagged ANCHORED key ``!bar &x : 2``
    has an AnchorToken there and is rule (d)'s). It fires only as
    the first pair of a pair-value block mapping.
    """
    tokens = list(yaml.scan(yaml_text, Loader=_StrictBaseLoader))
    n = len(tokens)
    # Frame stack: {"kind": "blockmap" | "blockseq" | "flowmap" |
    # "flowseq", "pairs": int, "is_pair_value": bool}. Same
    # is_pair_value test as rule (d): a block mapping reached from
    # a ValueToken (walking back over Tag / Anchor tokens).
    stack = []
    for i, token in enumerate(tokens):
        if isinstance(token, yaml.tokens.BlockMappingStartToken):
            is_pair_value = False
            j = i - 1
            while j >= 0 and isinstance(
                tokens[j],
                (yaml.tokens.TagToken, yaml.tokens.AnchorToken),
            ):
                j -= 1
            if j >= 0 and isinstance(tokens[j], yaml.tokens.ValueToken):
                is_pair_value = True
            stack.append(
                {"kind": "blockmap", "pairs": 0, "is_pair_value": is_pair_value}
            )
        elif isinstance(token, yaml.tokens.BlockSequenceStartToken):
            stack.append({"kind": "blockseq", "pairs": 0, "is_pair_value": False})
        elif isinstance(token, yaml.tokens.FlowMappingStartToken):
            stack.append({"kind": "flowmap", "pairs": 0, "is_pair_value": False})
        elif isinstance(token, yaml.tokens.FlowSequenceStartToken):
            stack.append({"kind": "flowseq", "pairs": 0, "is_pair_value": False})
        elif isinstance(
            token,
            (
                yaml.tokens.BlockEndToken,
                yaml.tokens.FlowMappingEndToken,
                yaml.tokens.FlowSequenceEndToken,
            ),
        ):
            if stack:
                stack.pop()
        elif isinstance(token, yaml.tokens.KeyToken):
            if stack:
                stack[-1]["pairs"] += 1
            # A tagged empty key: Key, Tag+, Value with nothing
            # between the last tag and the value.
            j = i + 1
            tags = 0
            while j < n and isinstance(tokens[j], yaml.tokens.TagToken):
                tags += 1
                j += 1
            if tags == 0:
                continue
            if j >= n or not isinstance(tokens[j], yaml.tokens.ValueToken):
                continue
            if (
                stack
                and stack[-1]["kind"] == "blockmap"
                and stack[-1]["is_pair_value"]
                and stack[-1]["pairs"] == 1
            ):
                raise yaml.YAMLError("tagged empty key")


def _reject_flow_anchored_empty_key_collection(yaml_text):
    """Reject an anchored empty key in a flow mapping whose value
    is a collection (``m: {&x: {a: 1}}``).

    FIX-P0-16 (grid residual, T013 R15 P0-2 area): in a FLOW
    mapping the ``yaml`` package absorbs the ``:`` into the anchor
    name (``&x:``) and reads the FOLLOWING collection as the pair's
    KEY — a collection key — so ``hasUnrepresentableKey`` fires and
    the document is ``yaml_parse_error``. A following SCALAR is
    read as a scalar key and accepted (``m: {&x: 1}`` is VALID on
    both sides). PyYAML instead reads the ``:`` as a value
    indicator in flow context and accepts the pair (``""`` key,
    collection value), so the Oracle returned VALID where the
    TypeScript side throws. The discriminant is a token pattern,
    derived from an AST dump plus a 27-shape parallel mapping
    (see evidence/probes/fix-p0-16/map-p0-16.py group p4 and
    ast-dump-p0-16.mjs): KeyToken, [TagToken]*, AnchorToken,
    ValueToken, [TagToken]*, then a collection-start token
    (FlowMappingStart / FlowSequenceStart / BlockMappingStart /
    BlockSequenceStart). It fires only when the innermost frame is
    a FLOW MAPPING. The boundary is tight and probed on both
    sides: a BLOCK pair with a collection value
    (``m:\\n  &x: {a: 1}``) is VALID on both sides — the ``yaml``
    package reads it as an empty-string key, not a collection
    key — so the rule does not fire there; a flow-SEQUENCE item
    pair (``m: [&x: {a: 1}]``) is also VALID on both sides, so
    the rule does not fire there either; a flow pair with a scalar
    value (``m: {&x: 1}``) is VALID on both sides; the spaced
    variant (``m: {&x: !!str {a: 1}}``) diverges identically to
    the nospace one (the token stream is the same), so no glued
    condition is needed; a flow VALUE-position anchor-colon
    (``m: {a: &x: {c: 1}}``) is already rejected on both sides,
    so the rule does not need to cover it. A tagged glued
    collection case (``m: {!foo &x: {a: 1}}``) is also rule (c)'s
    shape and both rules agree (reject), so there is no conflict.
    """
    tokens = list(yaml.scan(yaml_text, Loader=_StrictBaseLoader))
    n = len(tokens)
    # Frame stack: only the innermost collection kind matters.
    # Same start/end tracking as the other reject rules.
    stack = []
    for i, token in enumerate(tokens):
        if isinstance(
            token,
            (
                yaml.tokens.BlockMappingStartToken,
                yaml.tokens.BlockSequenceStartToken,
                yaml.tokens.FlowMappingStartToken,
                yaml.tokens.FlowSequenceStartToken,
            ),
        ):
            kind = (
                "blockmap"
                if isinstance(token, yaml.tokens.BlockMappingStartToken)
                else "blockseq"
                if isinstance(token, yaml.tokens.BlockSequenceStartToken)
                else "flowmap"
                if isinstance(token, yaml.tokens.FlowMappingStartToken)
                else "flowseq"
            )
            stack.append(kind)
        elif isinstance(
            token,
            (
                yaml.tokens.BlockEndToken,
                yaml.tokens.FlowMappingEndToken,
                yaml.tokens.FlowSequenceEndToken,
            ),
        ):
            if stack:
                stack.pop()
        elif isinstance(token, yaml.tokens.KeyToken):
            # Key, [Tag]*, Anchor, Value, [Tag]*, collection-start.
            j = i + 1
            while j < n and isinstance(tokens[j], yaml.tokens.TagToken):
                j += 1
            if j >= n or not isinstance(tokens[j], yaml.tokens.AnchorToken):
                continue
            j += 1
            if j >= n or not isinstance(tokens[j], yaml.tokens.ValueToken):
                continue
            j += 1
            while j < n and isinstance(tokens[j], yaml.tokens.TagToken):
                j += 1
            if j >= n or not isinstance(
                tokens[j],
                (
                    yaml.tokens.FlowMappingStartToken,
                    yaml.tokens.FlowSequenceStartToken,
                    yaml.tokens.BlockMappingStartToken,
                    yaml.tokens.BlockSequenceStartToken,
                ),
            ):
                continue
            if stack and stack[-1] == "flowmap":
                raise yaml.YAMLError(
                    "anchored empty key with a collection value in a "
                    "flow mapping"
                )


def _absorbed_anchor_is_key_position(tokens, i, in_flow):
    """True when the anchor at ``tokens[i]`` is in implicit-key
    position.

    Mirrors ``hasRejectedAnchorOrTag``'s ``keyPos`` decision in
    ``src/core/workflow-parser.ts`` (FIX-P0-17, P0-B): the
    ``yaml`` package absorbs ``:`` into the anchor name, so an
    anchor in key position is accepted there, while the same
    anchor in value position is rejected (``hasRejectedAnchorOrTag``).
    In flow context the anchor is a key iff the preceding token
    is a flow-mapping / flow-sequence start, a flow entry
    (``,``), or an implicit key token sitting exactly at the
    anchor's start. In block context it is a key unless preceded
    on the SAME line by a value indicator / a scalar, by an
    explicit ``?`` key token, or by another property (anchor /
    tag / alias). A value indicator / scalar on a PREVIOUS line
    opens a (nested) mapping, i.e. key position. Everything else
    (stream start, a mapping / sequence start or end, a block
    entry, a document marker) is key position.
    """
    if i == 0:
        return True
    prev = tokens[i - 1]
    anchor = tokens[i]
    if isinstance(prev, yaml.tokens.KeyToken):
        return prev.start_mark.index == anchor.start_mark.index
    if in_flow:
        return isinstance(
            prev,
            (
                yaml.tokens.FlowMappingStartToken,
                yaml.tokens.FlowSequenceStartToken,
                yaml.tokens.FlowEntryToken,
            ),
        )
    if isinstance(
        prev, (yaml.tokens.ValueToken, yaml.tokens.ScalarToken)
    ):
        return prev.end_mark.line != anchor.start_mark.line
    if isinstance(
        prev,
        (
            yaml.tokens.AnchorToken,
            yaml.tokens.TagToken,
            yaml.tokens.AliasToken,
        ),
    ):
        return False
    return True


def _reject_absorbed_anchor_colon_value_position(yaml_text):
    """Reject an absorbed-colon anchor or alias outside implicit-key position.

    FIX-P0-17 (P0-B, T013 R16): after ``scan_anchor`` absorbs
    ``:`` into the anchor name (``&q:2`` -> anchor ``q:2``), the
    anchor attaches to the node that follows it. The ``yaml``
    package only accepts that when the anchor is in implicit-key
    position — in value position (``m: &q:2``,
    ``m: {a: &q:2}``, ``on: &q:2``) it rejects the document via
    ``hasRejectedAnchorOrTag``. PyYAML, with the ``:`` absorbed,
    would instead accept the anchored node as the value and
    return VALID, so the Oracle must reject the same shapes.
    The discriminant is the anchor's position, read off the
    token stream with ``_absorbed_anchor_is_key_position``
    (the ``hasRejectedAnchorOrTag`` ``keyPos`` mirror). Only
    anchors whose name contains ``:`` (i.e. absorbed) are
    covered — a plain anchor in value position is already
    rejected on both sides by the scanner / ``hasRejectedAnchorOrTag``.

    FIX-P0-18 (T013 R17, one new P0 family): the same gap
    existed for ALIASES. ``scan_anchor`` is shared by
    ``fetch_anchor`` and ``fetch_alias``, so ``*w:2`` absorbs
    into alias ``w:2`` exactly like ``&w:2`` absorbs into
    anchor ``w:2`` — but this rule only walked
    ``AnchorToken`` and never checked ``AliasToken``. After a
    key-position absorbed anchor is defined (``&w:2 a: 1``,
    accepted on both sides), a value-position absorbed alias
    (``b: *w:2``) was accepted by the Oracle while the
    ``yaml`` package rejects it via the SAME ``keyPos``
    decision (``hasRejectedAnchorOrTag`` / ``checkProperty``
    treats ``&`` and ``*`` identically). The fix checks
    absorbed-colon aliases with the identical discriminant:
    an alias whose name contains ``:`` and which is not in
    implicit-key position is rejected the same way. Key-position
    aliases (sequence items ``- *w:2`` / ``[*w:2]``), aliases
    after a tag / anchor / explicit ``?`` key, and flow-key
    aliases (``m: {*w:2: 1}``, owned by
    ``_reject_adjacent_alias_colon``) are untouched — the
    discriminant returns key position for them, or another
    rule already owns them.
    """
    tokens = list(yaml.scan(yaml_text, Loader=_StrictBaseLoader))
    flow_level = 0
    for i, token in enumerate(tokens):
        if isinstance(
            token,
            (
                yaml.tokens.FlowMappingStartToken,
                yaml.tokens.FlowSequenceStartToken,
            ),
        ):
            flow_level += 1
        elif isinstance(
            token,
            (
                yaml.tokens.FlowMappingEndToken,
                yaml.tokens.FlowSequenceEndToken,
            ),
        ):
            flow_level = max(0, flow_level - 1)
        elif (
            isinstance(
                token,
                (yaml.tokens.AnchorToken, yaml.tokens.AliasToken),
            )
            and ":" in token.value
            and not _absorbed_anchor_is_key_position(
                tokens, i, flow_level > 0
            )
        ):
            kind = (
                "anchor"
                if isinstance(token, yaml.tokens.AnchorToken)
                else "alias"
            )
            raise yaml.YAMLError(
                f"absorbed-colon {kind} outside implicit-key position"
            )


def _reject_flow_absorbed_anchor_null_key(yaml_text):
    """Reject an absorbed-colon anchor as a null key in a flow mapping.

    FIX-P0-17 (P0-B, T013 R16): in a FLOW mapping the ``yaml``
    package absorbs the ``:`` into the anchor name, so the node
    that follows the anchor becomes the pair's KEY. When that
    node is null (``m: {&q:2}``, ``m: {a: 1, &q:2}``) or the
    anchor is followed by a ``:`` whose value is null
    (``m: {&q:2: }``), an alias (``m: {&q:2: *s}`` — an alias
    node must not specify properties) or a second anchor
    (``m: {&q:2: &s 1}`` — a node can have at most one anchor),
    ``hasUnrepresentableKey`` fires and the document is
    ``yaml_parse_error``. PyYAML reads the ``:`` as a value
    indicator and accepts the pair (``""`` key), so the Oracle
    must reject the same shapes. The discriminant is the token
    after the anchor / after the ``:``:

    * no ``ValueToken`` after the anchor and the next token is
      a flow-mapping end / entry -> null key -> reject;
    * a ``ValueToken`` after the anchor: when it is NOT glued
      to the anchor (``m: {&q:2 : 1}``) the ``yaml`` package
      reads the key as null -> reject; when it IS glued, the
      node after it decides — a null value, an alias or a
      second anchor rejects, while a scalar / tag (``m:
      {&q:2: 1}``, ``m: {&q:2: !zap 1}`` — the ``yaml`` package
      reads that node as the key) or a collection (owned by
      ``_reject_flow_anchored_empty_key_collection``) accepts.
    * a non-absorbed anchor (``m: {&r: }``) is covered the same
      way when its value is null or carries its own anchor —
      the ``yaml`` package reads the key as null there too —
      while a scalar / tag / alias value is the C3 flow
      exemption (``m: {&r: 1}`` is VALID on both sides) and is
      left alone (the alias case is owned by
      ``_reject_second_anchor_on_value``).
    """
    tokens = list(yaml.scan(yaml_text, Loader=_StrictBaseLoader))
    n = len(tokens)
    stack = []
    for i, token in enumerate(tokens):
        if isinstance(
            token,
            (
                yaml.tokens.BlockMappingStartToken,
                yaml.tokens.BlockSequenceStartToken,
                yaml.tokens.FlowMappingStartToken,
                yaml.tokens.FlowSequenceStartToken,
            ),
        ):
            kind = (
                "blockmap"
                if isinstance(token, yaml.tokens.BlockMappingStartToken)
                else "blockseq"
                if isinstance(token, yaml.tokens.BlockSequenceStartToken)
                else "flowmap"
                if isinstance(token, yaml.tokens.FlowMappingStartToken)
                else "flowseq"
            )
            stack.append(kind)
        elif isinstance(
            token,
            (
                yaml.tokens.BlockEndToken,
                yaml.tokens.FlowMappingEndToken,
                yaml.tokens.FlowSequenceEndToken,
            ),
        ):
            if stack:
                stack.pop()
        elif isinstance(token, yaml.tokens.AnchorToken):
            if not stack or stack[-1] != "flowmap":
                continue
            if not _absorbed_anchor_is_key_position(tokens, i, True):
                continue
            absorbed = ":" in token.value
            nxt = tokens[i + 1] if i + 1 < n else None
            if nxt is None:
                continue
            if isinstance(
                nxt,
                (yaml.tokens.FlowMappingEndToken, yaml.tokens.FlowEntryToken),
            ):
                raise yaml.YAMLError(
                    "absorbed-colon anchor as a null key in a flow mapping"
                )
            if not isinstance(nxt, yaml.tokens.ValueToken):
                continue
            glued = token.end_mark.index == nxt.start_mark.index
            v = tokens[i + 2] if i + 2 < n else None
            if v is None:
                continue
            if isinstance(
                v,
                (yaml.tokens.FlowMappingEndToken, yaml.tokens.FlowEntryToken),
            ):
                raise yaml.YAMLError(
                    "absorbed-colon anchor as a null key in a flow mapping"
                )
            if isinstance(v, yaml.tokens.AnchorToken):
                raise yaml.YAMLError(
                    "absorbed-colon anchor as a null key in a flow mapping"
                )
            if absorbed and isinstance(v, yaml.tokens.AliasToken):
                raise yaml.YAMLError(
                    "absorbed-colon anchor as a null key in a flow mapping"
                )
            if isinstance(
                v, (yaml.tokens.ScalarToken, yaml.tokens.TagToken)
            ) and not (absorbed and not glued):
                continue
            if isinstance(
                v,
                (
                    yaml.tokens.FlowMappingStartToken,
                    yaml.tokens.FlowSequenceStartToken,
                    yaml.tokens.BlockMappingStartToken,
                    yaml.tokens.BlockSequenceStartToken,
                ),
            ):
                continue
            if absorbed and not glued:
                raise yaml.YAMLError(
                    "absorbed-colon anchor as a null key in a flow mapping"
                )


def _reject_anchored_nested_block_mapping(yaml_text):
    """Reject an anchored block mapping whose first pair is an
    anchored empty key.

    FIX-P0-15 (P0-5, T013 R14 family (e)): the ``yaml`` package
    rejects a node carrying two anchors ("A node can have at most
    one anchor"), so ``&x:\\n  &y: 1`` throws on the TypeScript
    side, while PyYAML accepts it and the Oracle returned
    ``missing_on_key``. The discriminant is block-context scoped
    and depth-independent, derived from a 100 + 22 shape parallel
    mapping (see evidence/probes/fix-p0-15/map-p0-15.py,
    map2/map3-p0-15.py):

    * a block mapping node M conflicts iff (1) M carries an anchor
      — either M is the value of a GLUED anchored-empty-key pair
      (KeyToken, AnchorToken, ValueToken, [TagTokens],
      BlockMappingStart, anchor glued to the colon) or an
      AnchorToken immediately precedes M (walking back over
      TagTokens: ``m: &x\\n  &y: 1``, ``m: &x !foo\\n  &y: 1``) —
      AND (2) M's FIRST pair is an anchored empty key (KeyToken,
      [TagTokens], AnchorToken, ValueToken) with the nested anchor
      GLUED. A tag on the nested key still conflicts
      (``&x:\\n!foo &y: 1``); a tag between the outer anchor and M
      still conflicts (``&x:!foo\\n &y: 1``).
    * an UNGLUED outer anchor does not conflict (``&x :\\n  &y: 1``
      parses as ``{"": 1}`` in the ``yaml`` package — that shape is
      a (d) shape, closed by ``_reject_unglued_anchored_empty_key``);
      an anchor on a NON-empty key does not conflict
      (``&x:\\n &y k: 1`` and ``&x k:\\n &y: 1`` keep MATCHING);
      a plain nested key does not conflict; the FLOW twin
      (``&x: {&y: 1}``) keeps MATCHING (both ``missing_on_key``) —
      the rule only fires on BlockMappingStart, never on flow
      mappings. Two-pair nested variants keep MATCHING (both reject
      — the ``yaml`` package's parser and ``_reject_anchored_empty_key``
      both fire), so the rule is scoped to the first pair only.
      Deeper nesting conflicts too (``a:\\n &x:\\n &y: 1``) — the
      check is per-frame, not depth-scoped.
    """
    tokens = list(yaml.scan(yaml_text, Loader=_StrictBaseLoader))
    n = len(tokens)
    # Frame stack: {"kind": ..., "pairs": int, "carries_anchor": bool,
    # "first_pair_checked": bool}. Only blockmap frames are checked.
    stack = []
    for i, token in enumerate(tokens):
        if isinstance(token, yaml.tokens.BlockMappingStartToken):
            carries_anchor = False
            j = i - 1
            while j >= 0 and isinstance(tokens[j], yaml.tokens.TagToken):
                j -= 1
            if j >= 0 and isinstance(tokens[j], yaml.tokens.AnchorToken):
                carries_anchor = True
            elif j >= 0 and isinstance(tokens[j], yaml.tokens.ValueToken):
                value_token = tokens[j]
                k = j - 1
                if k >= 0 and isinstance(tokens[k], yaml.tokens.AnchorToken):
                    anchor = tokens[k]
                    if anchor.end_mark.index == value_token.start_mark.index:
                        m = k - 1
                        while m >= 0 and isinstance(
                            tokens[m], yaml.tokens.TagToken
                        ):
                            m -= 1
                        if m >= 0 and isinstance(
                            tokens[m], yaml.tokens.KeyToken
                        ):
                            carries_anchor = True
            stack.append(
                {
                    "kind": "blockmap",
                    "pairs": 0,
                    "carries_anchor": carries_anchor,
                    "first_pair_checked": False,
                }
            )
        elif isinstance(token, yaml.tokens.BlockSequenceStartToken):
            stack.append(
                {
                    "kind": "blockseq",
                    "pairs": 0,
                    "carries_anchor": False,
                    "first_pair_checked": False,
                }
            )
        elif isinstance(token, yaml.tokens.FlowMappingStartToken):
            stack.append(
                {
                    "kind": "flowmap",
                    "pairs": 0,
                    "carries_anchor": False,
                    "first_pair_checked": False,
                }
            )
        elif isinstance(token, yaml.tokens.FlowSequenceStartToken):
            stack.append(
                {
                    "kind": "flowseq",
                    "pairs": 0,
                    "carries_anchor": False,
                    "first_pair_checked": False,
                }
            )
        elif isinstance(
            token,
            (
                yaml.tokens.BlockEndToken,
                yaml.tokens.FlowMappingEndToken,
                yaml.tokens.FlowSequenceEndToken,
            ),
        ):
            if stack:
                stack.pop()
        elif isinstance(token, yaml.tokens.KeyToken):
            if not stack or stack[-1]["kind"] != "blockmap":
                continue
            frame = stack[-1]
            frame["pairs"] += 1
            if frame["pairs"] != 1 or not frame["carries_anchor"]:
                continue
            if frame["first_pair_checked"]:
                continue
            frame["first_pair_checked"] = True
            # Look ahead: [TagTokens], AnchorToken, ValueToken, glued.
            j = i + 1
            while j < n and isinstance(tokens[j], yaml.tokens.TagToken):
                j += 1
            if j >= n or not isinstance(tokens[j], yaml.tokens.AnchorToken):
                continue
            anchor = tokens[j]
            if j + 1 >= n or not isinstance(
                tokens[j + 1], yaml.tokens.ValueToken
            ):
                continue
            value_token = tokens[j + 1]
            if anchor.end_mark.index != value_token.start_mark.index:
                continue
            raise yaml.YAMLError(
                "anchored block mapping whose first pair is an anchored empty key"
            )


def _is_lone_anchored_empty_key_doc(yaml_text, doc):
    """True when a loaded document is a lone anchored-empty-key document.

    FIX-P0-14 (T013 R13 lone-doc P0): the ``yaml`` package renders a
    lone ``&x: 1`` document as the scalar ``1`` (the anchor ``&x:``
    attaches to the following node), while PyYAML renders it as the
    1-pair mapping ``{'': '1'}`` — so the TypeScript side returns
    ``workflow_root_not_mapping`` where the Oracle returned
    ``missing_on_key``. A rejection rule cannot close this (the
    Oracle would have to return ``yaml_parse_error``, still a
    different code), so the Oracle's root check aligns the
    classification instead: a degenerate mapping consisting entirely
    of anchored empty keys is reported as ``workflow_root_not_mapping``.

    The discriminant is derived from a 30 + 15 + 12 shape parallel
    mapping (see evidence/probes/fix-p0-14/map-p0-14.py,
    map2-p0-14.py and the extra boundary probe in the TASK_REPORT)
    and is TOKEN-based — it must not be just "the loaded dict has
    an empty-string key", because the quoted empty key ``"": 1``
    renders as a mapping on BOTH sides and currently MATCHES as
    ``missing_on_key``. The rule fires only when ALL of the
    following hold:

    * the loaded document is a dict with exactly one key, the empty
      string ``''`` (multi-pair anchored-empty-key documents never
      reach here: ``_StrictBaseLoader`` rejects the duplicate ``''``
      key, and ``_reject_anchored_empty_key`` rejects them first);
    * the root token stream is exactly one single-pair block
      mapping: StreamStart, optional DocumentStart,
      BlockMappingStart, KeyToken, AnchorToken, ValueToken, <value>,
      BlockEnd, optional DocumentEnd, StreamEnd — with NO TagToken
      between the KeyToken and the AnchorToken (a tag on the key,
      ``!foo &x: 1``, is rejected on the TypeScript side by
      ``hasRejectedAnchorOrTag``, E05 — the anchor after another
      property is in value position);
    * the anchor is glued to the colon (AnchorToken.end ==
      ValueToken.start — ``&x : 1`` with a space renders as a
      mapping in the ``yaml`` package and is rejected on the
      TypeScript side by ``hasUnrepresentableKey``);
    * the value is manifestly a non-mapping node at token level:
      after skipping any TagTokens on the value, the first token is
      a ScalarToken (any scalar, quoted or plain), a
      BlockSequenceStartToken / FlowSequenceStartToken, or nothing
      (null value — the next token is BlockEnd). A mapping value
      (BlockMappingStart / FlowMappingStart) does NOT fire: the
      ``yaml`` package renders it as a mapping, so the two sides
      already agree (``missing_on_key``, or VALID when the value
      contains ``on`` — those shapes stay disclosed residuals).
      An AnchorToken as the first value token does NOT fire either:
      the ``yaml`` package rejects a second anchor on the value
      node ("A node can have at most one anchor"), so the
      TypeScript side returns ``yaml_parse_error`` there.

    ``extract_jobs`` is untouched: it already returns ``[]`` for
    these documents on both sides, so jobs mode MATCHES with or
    without this rule.

    FIX-P0-16 (P0-2): the token walk scans with the mirrored loader
    (``Loader=_StrictBaseLoader``), so a no-space ``&x:!!tag``
    lone-doc with a scalar / sequence / null value is seen as Key /
    Anchor / Value / Tag / value and classified as a non-mapping
    root here — exactly as the ``yaml`` package renders it. With
    the unmirrored scan the walk would see a plain-scalar key and
    miss it (``missing_on_key`` instead of
    ``workflow_root_not_mapping``).
    """
    if not isinstance(doc, dict) or set(doc.keys()) != {""}:
        return False
    try:
        tokens = list(yaml.scan(yaml_text, Loader=_StrictBaseLoader))
    except yaml.YAMLError:
        return False
    i = 0
    n = len(tokens)
    if n == 0 or not isinstance(tokens[i], yaml.tokens.StreamStartToken):
        return False
    i += 1
    if i < n and isinstance(tokens[i], yaml.tokens.DocumentStartToken):
        i += 1
    if i >= n or not isinstance(tokens[i], yaml.tokens.BlockMappingStartToken):
        return False
    i += 1
    if i >= n or not isinstance(tokens[i], yaml.tokens.KeyToken):
        return False
    i += 1
    # No tag may sit between the key and the anchor: a tag on the
    # key is rejected on the TypeScript side (hasRejectedAnchorOrTag).
    if i >= n or not isinstance(tokens[i], yaml.tokens.AnchorToken):
        return False
    anchor = tokens[i]
    i += 1
    if i >= n or not isinstance(tokens[i], yaml.tokens.ValueToken):
        return False
    value_token = tokens[i]
    # The anchor must be glued to the colon; `&x : 1` renders as a
    # mapping in the `yaml` package (and is rejected by
    # hasUnrepresentableKey on the TypeScript side).
    if anchor.end_mark.index != value_token.start_mark.index:
        return False
    i += 1
    # Skip tags on the value (`&x: !foo 1` still renders as a scalar).
    while i < n and isinstance(tokens[i], yaml.tokens.TagToken):
        i += 1
    if i >= n:
        return False
    first = tokens[i]
    if isinstance(
        first,
        (yaml.tokens.BlockMappingStartToken, yaml.tokens.FlowMappingStartToken),
    ):
        return False
    if isinstance(first, (yaml.tokens.AnchorToken, yaml.tokens.AliasToken)):
        return False
    if isinstance(first, yaml.tokens.ScalarToken):
        i += 1
    elif isinstance(
        first,
        (yaml.tokens.BlockSequenceStartToken, yaml.tokens.FlowSequenceStartToken),
    ):
        depth = 0
        while i < n:
            t = tokens[i]
            if isinstance(
                t,
                (
                    yaml.tokens.BlockMappingStartToken,
                    yaml.tokens.FlowMappingStartToken,
                    yaml.tokens.BlockSequenceStartToken,
                    yaml.tokens.FlowSequenceStartToken,
                ),
            ):
                depth += 1
            elif isinstance(
                t,
                (
                    yaml.tokens.BlockEndToken,
                    yaml.tokens.FlowMappingEndToken,
                    yaml.tokens.FlowSequenceEndToken,
                ),
            ):
                depth -= 1
                if depth == 0:
                    i += 1
                    break
            i += 1
        else:
            return False
    elif isinstance(
        first,
        (
            yaml.tokens.BlockEndToken,
            yaml.tokens.DocumentEndToken,
            yaml.tokens.StreamEndToken,
        ),
    ):
        pass  # Null value: no value tokens.
    else:
        return False
    # Remainder must be exactly the root BlockEnd, an optional
    # DocumentEnd, and StreamEnd — i.e. the document held exactly
    # one pair.
    if i >= n or not isinstance(tokens[i], yaml.tokens.BlockEndToken):
        return False
    i += 1
    if i < n and isinstance(tokens[i], yaml.tokens.DocumentEndToken):
        i += 1
    return i == n - 1 and isinstance(tokens[i], yaml.tokens.StreamEndToken)


def parse_workflow_yaml(yaml_text, fixture_id):
    """Parse workflow YAML into a normalized trigger IR (without evaluation)."""

    def base(on_key_is_string, status, events, errors):
        return {
            "schema": TRIGGER_IR_SCHEMA,
            "fixture_id": fixture_id,
            "on_key_is_string": on_key_is_string,
            "status": status,
            "events": events,
            "evaluation": _null_evaluation(
                [], "triggered" if status == "VALID" else status.lower()
            ),
            "errors": list(errors),
        }

    try:
        _reject_adjacent_alias_colon(yaml_text)
        _reject_underindented_multiline_quoted_scalar(yaml_text)
        _reject_underindented_flow_continuation(yaml_text)
        _reject_unseparated_comment_in_flow(yaml_text)
        _reject_tag_suffix_brackets(yaml_text)
        _reject_tag_suffix_comma(yaml_text)
        _reject_anchored_empty_key(yaml_text)
        _reject_second_anchor_on_value(yaml_text)
        _reject_tagged_anchored_empty_key(yaml_text)
        _reject_unglued_anchored_empty_key(yaml_text)
        _reject_tagged_empty_key(yaml_text)
        _reject_flow_anchored_empty_key_collection(yaml_text)
        _reject_absorbed_anchor_colon_value_position(yaml_text)
        _reject_flow_absorbed_anchor_null_key(yaml_text)
        _reject_anchored_nested_block_mapping(yaml_text)
        doc = yaml.load(yaml_text, Loader=_StrictBaseLoader)
        # FIX-P0-15 (P0-1): unwrap a lone anchored-empty-key doc
        # whose value is a mapping (``&x: {on: push}`` renders as
        # the mapping itself on the TypeScript side). Raises
        # yaml.YAMLError on a self-alias inside the value span.
        doc = _unwrap_lone_anchored_empty_key_doc(yaml_text, doc)
    except yaml.YAMLError:
        return base(False, "INVALID", [], ["yaml_parse_error"])

    # The loader resolves plain scalars per YAML 1.2 core schema, so
    # the `on` key is the string "on" here (a YAML 1.1 reader would
    # resolve it to boolean True instead); every other key/value is
    # likewise already rendered the way the TypeScript parser renders
    # it (see `_TScalar`).
    on_key_is_string = isinstance(doc, dict) and any(
        isinstance(k, str) and k == "on" for k in doc
    )

    if not isinstance(doc, dict):
        return base(on_key_is_string, "INVALID", [], ["workflow_root_not_mapping"])
    if "on" not in doc:
        # FIX-P0-14 (R13 lone-doc P0): a lone document consisting
        # only of an anchored empty key renders as a scalar (or
        # sequence / null) in the `yaml` package but as a 1-pair
        # mapping in PyYAML — classify it as a non-mapping root.
        if _is_lone_anchored_empty_key_doc(yaml_text, doc):
            return base(
                on_key_is_string, "INVALID", [], ["workflow_root_not_mapping"]
            )
        return base(on_key_is_string, "INVALID", [], ["missing_on_key"])
    if not on_key_is_string:
        return base(False, "INVALID", [], ["on_key_not_string"])

    on_value = doc["on"]
    raw_events = []
    if isinstance(on_value, str):
        # A plain boolean/null/number scalar is not a string event
        # name on the TypeScript side (`on: True` -> on_value_invalid);
        # only a genuine string (plain non-core spelling, or quoted)
        # names an event. `_TScalar.core_kind` distinguishes them.
        if isinstance(on_value, _TScalar) and on_value.core_kind != "string":
            return base(True, "INVALID", [], ["on_value_invalid"])
        raw_events.append({"name": on_value, "config": None})
    elif isinstance(on_value, list):
        for item in on_value:
            if not isinstance(item, str):
                return base(True, "INVALID", [], ["on_list_item_not_string"])
            if isinstance(item, _TScalar) and item.core_kind != "string":
                return base(True, "INVALID", [], ["on_list_item_not_string"])
            raw_events.append({"name": item, "config": None})
    elif isinstance(on_value, dict):
        # Iterate in JS object-key order (FIX-P0-03): integer-index
        # keys first ascending, then the rest in file order — the
        # TypeScript side enumerates `Object.entries` that way.
        for name in _js_object_key_order(list(on_value.keys())):
            raw_events.append({"name": name, "config": on_value[name]})
    else:
        return base(True, "INVALID", [], ["on_value_invalid"])

    # Normalize each event config; INVALID (shape / mutual exclusion) is
    # checked before UNKNOWN (unsupported semantics) so the outcome is stable.
    # ADR T011/T008-U01: an empty event value (``on: {pull_request:}``)
    # arrives from the loader as a null-kind scalar — GitHub treats
    # it as "this event, no filters", i.e. the same as no config (None)
    # and the same as ``{}``; the TypeScript ``yaml`` parser renders it
    # as null and likewise treats it as no config. Only a null-kind
    # scalar is folded to None; a quoted empty string (``push: ""``)
    # is a string config and is still event_config_not_mapping /
    # INVALID (probed, FIX-P0-03 §2.4 Q7), as is any other non-mapping
    # value (e.g. a non-empty string).
    events = []
    invalid_errors = []
    for raw in raw_events:
        name = raw["name"]
        config = raw["config"]
        if isinstance(config, _TScalar) and config.core_kind == "null":
            config = None
        cfg = {
            "name": name,
            "types": None,
            "branches": None,
            "branches_ignore": None,
            "paths": None,
            "paths_ignore": None,
        }
        if config is not None:
            if not isinstance(config, dict):
                return base(True, "INVALID", [], ["event_config_not_mapping"])
            for yaml_key, field in _FILTER_FIELDS:
                if yaml_key in config:
                    parsed = _string_or_list(config[yaml_key])
                    if parsed == "INVALID":
                        return base(
                            True,
                            "INVALID",
                            [],
                            ["filter_not_string_or_list:" + yaml_key],
                        )
                    cfg[field] = parsed
        if cfg["branches"] is not None and cfg["branches_ignore"] is not None:
            invalid_errors.append("branches_and_branches_ignore_both_present")
        if cfg["paths"] is not None and cfg["paths_ignore"] is not None:
            invalid_errors.append("paths_and_paths_ignore_both_present")
        events.append(cfg)
    if invalid_errors:
        ir = base(True, "INVALID", events, invalid_errors)
        ir["evaluation"] = _null_evaluation([], "invalid")
        return ir

    # UNKNOWN: unknown event names, unknown filter keys, unsupported Globs.
    unsupported = []
    for raw in raw_events:
        if raw["name"] not in SUPPORTED_EVENTS:
            unsupported.append("unsupported_event:" + raw["name"])
        config = raw["config"]
        if isinstance(config, dict):
            # JS object-key order, as in the `on` mapping above (O3).
            for key in _js_object_key_order(list(config.keys())):
                if key not in ("types", "branches", "branches-ignore", "paths", "paths-ignore"):
                    unsupported.append("unsupported_filter:" + key)
    for event in events:
        for field in ("branches", "branches_ignore", "paths", "paths_ignore"):
            patterns = event[field]
            if patterns is None:
                continue
            for pattern in patterns:
                bad = match_ordered_patterns([pattern], "")["unsupported"]
                if bad:
                    unsupported.append("unsupported_glob:" + pattern)
    if unsupported:
        ir = base(True, "UNKNOWN", events, [])
        ir["evaluation"] = _null_evaluation(unsupported, "unknown")
        return ir

    ir = base(True, "VALID", events, [])
    ir["evaluation"] = _null_evaluation([], "triggered")
    return ir


def branch_value_for_event(event_name, scenario):
    """Branch value the filter compares against, per event (section 4.2)."""
    event = scenario.get("event") or {}
    if event_name == "pull_request":
        return event.get("base_branch")
    if event_name == "push":
        return event.get("branch")
    if event_name == "merge_group":
        return event.get("target_branch")
    return None


def has_commit_skip(commit_message):
    """True when the commit message carries a GitHub commit-skip token (3.3)."""
    message = (commit_message or "").lower()
    return any(token in message for token in COMMIT_SKIP_TOKENS)


def evaluate_trigger(ir, scenario):
    """Evaluate a parsed (VALID) trigger IR against one scenario."""
    if ir["status"] == "INVALID":
        return _null_evaluation([], "invalid")
    if ir["status"] == "UNKNOWN":
        return _null_evaluation(list(ir["evaluation"]["unsupported"]), "unknown")

    event = scenario.get("event") or {}
    event_name = event.get("name") or ""
    matched = next((e for e in ir["events"] if e["name"] == event_name), None)
    if matched is None:
        evaluation = _null_evaluation([], "event_mismatch")
        evaluation["event_match"] = False
        evaluation["triggered"] = False
        return evaluation

    evaluation = {
        "event_match": True,
        "activity_type_match": True,
        "branch_match": True,
        "branch_value": branch_value_for_event(event_name, scenario),
        "path_match": True,
        "path_file_results": [],
        "commit_skip": has_commit_skip(event.get("commit_message")),
        "triggered": None,
        "unsupported": [],
        "reason": "triggered",
    }

    if matched["types"] is not None:
        if event.get("action") is None:
            evaluation["activity_type_match"] = None
            evaluation["reason"] = "unknown"
            return evaluation
        evaluation["activity_type_match"] = event["action"] in matched["types"]
        if not evaluation["activity_type_match"]:
            evaluation["triggered"] = False
            evaluation["reason"] = "activity_type_mismatch"
            return evaluation

    branch_patterns = matched["branches"] if matched["branches"] is not None else matched["branches_ignore"]
    if branch_patterns is not None:
        if evaluation["branch_value"] is None:
            evaluation["branch_match"] = None
            evaluation["reason"] = "unknown"
            return evaluation
        result = match_ordered_patterns(branch_patterns, evaluation["branch_value"])
        if result["unsupported"]:
            evaluation["branch_match"] = None
            evaluation["unsupported"] = list(result["unsupported"])
            evaluation["reason"] = "unknown"
            return evaluation
        hit = result["matched"]
        evaluation["branch_match"] = (not hit) if matched["branches_ignore"] is not None else hit
        if not evaluation["branch_match"]:
            evaluation["triggered"] = False
            evaluation["reason"] = "branch_mismatch"
            return evaluation

    changed_files = scenario.get("changed_files") or []
    # T004 -- GitHub diff boundaries (PROJECT_BOOK section 4.3). Precedence:
    # event -> activity type -> branch -> path/diff -> commit skip.
    #   * push with >1,000 commits, or a timed-out diff, makes the path
    #     filter count as triggered (always-run): every listed file is
    #     reported matched, as with "no path filter" in T002.
    #   * >3,000 changed files with an unconfirmed first-3000 list cannot
    #     be evaluated: path_match null, triggered null, reason unknown.
    #   * >3,000 files with a confirmed first-3000 list: only the first
    #     3,000 files are evaluated.
    # With no "diff" metadata these rules are inert (T002 behavior).
    diff_meta = scenario.get("diff") or {}
    diff_total = diff_meta.get("changed_files_total")
    if not isinstance(diff_total, int) or isinstance(diff_total, bool):
        diff_total = len(changed_files)
    push_commits = diff_meta.get("push_commit_count")
    diff_always_run = diff_meta.get("diff_timed_out") is True or (
        event_name == "push"
        and isinstance(push_commits, int)
        and not isinstance(push_commits, bool)
        and push_commits > 1000
    )
    path_patterns = matched["paths"] if matched["paths"] is not None else matched["paths_ignore"]
    if path_patterns is None:
        evaluation["path_file_results"] = [
            {"file": f, "matched": True} for f in changed_files
        ]
        evaluation["path_match"] = True
    elif diff_always_run:
        evaluation["path_file_results"] = [
            {"file": f, "matched": True} for f in changed_files
        ]
        evaluation["path_match"] = True
    elif diff_total > 3000 and diff_meta.get("first_3000_confirmed") is not True:
        evaluation["path_match"] = None
        evaluation["triggered"] = None
        evaluation["unsupported"] = list(evaluation["unsupported"]) + [
            "diff_first_3000_unconfirmed"
        ]
        evaluation["reason"] = "unknown"
        return evaluation
    else:
        files_to_evaluate = (
            changed_files[:3000] if diff_total > 3000 else changed_files
        )
        for f in files_to_evaluate:
            result = match_ordered_patterns(path_patterns, f)
            if result["unsupported"]:
                evaluation["path_match"] = None
                evaluation["unsupported"] = list(
                    evaluation["unsupported"]
                ) + list(result["unsupported"])
                evaluation["reason"] = "unknown"
                return evaluation
            hit = result["matched"]
            evaluation["path_file_results"].append(
                {
                    "file": f,
                    "matched": (not hit) if matched["paths_ignore"] is not None else hit,
                }
            )
        evaluation["path_match"] = any(
            r["matched"] for r in evaluation["path_file_results"]
        )
        if not evaluation["path_match"]:
            evaluation["triggered"] = False
            evaluation["reason"] = "path_mismatch"
            return evaluation

    if evaluation["commit_skip"]:
        evaluation["triggered"] = False
        evaluation["reason"] = "commit_skip"
        return evaluation

    evaluation["triggered"] = True
    evaluation["reason"] = "triggered"
    return evaluation


def build_trigger_ir(yaml_text, scenario, fixture_id):
    """Parse workflow YAML and evaluate it against one scenario: the full T002 IR."""
    ir = parse_workflow_yaml(yaml_text, fixture_id)
    ir["evaluation"] = evaluate_trigger(ir, scenario)
    return ir


def extract_jobs(yaml_text):
    """Extract Job inputs from a workflow YAML's ``jobs:`` mapping (T004).

    Returns a list of ``{"id", "name", "needs", "if"}`` dicts in file
    order. Scalars are rendered the way the TypeScript side renders
    them (FIX-P0-03): a plain ``True`` job id is ``"true"``, a plain
    null job id is ``""``, a plain ``01`` job id is ``"1"``; ``if:
    false`` arrives as the string ``"false"`` (the TypeScript
    ``String(false)``), ``if:`` empty or ``if: null`` as ``None``, a
    plain boolean/number ``needs`` entry as its rendering, and a null
    ``needs`` entry as the ``"__invalid_needs__"`` sentinel; a
    non-string ``name`` (plain boolean/number/null) maps to ``None``.
    A non-scalar ``if`` is mapped to the ``"__unsupported_if__"``
    sentinel, which both ``if`` parsers reject (-> UNKNOWN, never a
    silent downgrade to "no condition"); a non-scalar ``needs`` entry
    maps to ``"__invalid_needs__"`` (-> missing_need -> INVALID).
    """
    try:
        _reject_adjacent_alias_colon(yaml_text)
        _reject_underindented_multiline_quoted_scalar(yaml_text)
        _reject_underindented_flow_continuation(yaml_text)
        _reject_unseparated_comment_in_flow(yaml_text)
        _reject_tag_suffix_brackets(yaml_text)
        _reject_tag_suffix_comma(yaml_text)
        _reject_anchored_empty_key(yaml_text)
        _reject_second_anchor_on_value(yaml_text)
        _reject_tagged_anchored_empty_key(yaml_text)
        _reject_unglued_anchored_empty_key(yaml_text)
        _reject_tagged_empty_key(yaml_text)
        _reject_flow_anchored_empty_key_collection(yaml_text)
        _reject_absorbed_anchor_colon_value_position(yaml_text)
        _reject_flow_absorbed_anchor_null_key(yaml_text)
        _reject_anchored_nested_block_mapping(yaml_text)
        doc = yaml.load(yaml_text, Loader=_StrictBaseLoader)
        # FIX-P0-15 (P0-1): unwrap a lone anchored-empty-key doc
        # whose value is a mapping, so ``doc.get("jobs")`` reads the
        # unwrapped mapping (a value containing ``jobs:`` diverges
        # in jobs mode too). Raises yaml.YAMLError on a self-alias.
        doc = _unwrap_lone_anchored_empty_key_doc(yaml_text, doc)
    except yaml.YAMLError:
        return []
    if not isinstance(doc, dict):
        return []
    jobs_raw = doc.get("jobs")
    if not isinstance(jobs_raw, dict):
        return []
    jobs = []
    # JS object-key order (FIX-P0-03), as in `parse_workflow_yaml`.
    for job_id in _js_object_key_order(list(jobs_raw.keys())):
        definition = jobs_raw[job_id]
        # ADR T011/ADR-04: a job with ``uses`` calls a reusable workflow
        # and a job with a ``strategy.matrix`` expands to one check per
        # matrix combination; neither has a single reportable context
        # (PROJECT_BOOK section 3.4). Only the presence of the
        # ``matrix`` key matters; ``uses`` wins when both are present.
        if not isinstance(definition, dict):
            # FIX-P0-04 (R5 grouped P0, J20): a non-mapping job
            # definition omits `unsupported_job` here, exactly as the
            # TypeScript side's `extractJobs` does (src/core/e2e.ts
            # non-dict branch pushes an object without the field; the
            # dict branch always carries it). The Oracle is a mirror
            # of the TS output shape, not a normalizer — omitting the
            # field on this side is the smaller change and leaves the
            # TS product code (and dist.zip) untouched. Downstream
            # Oracle readers use `job.get("unsupported_job")`, so a
            # missing key reads as None, the same value as before.
            jobs.append(
                {"id": job_id, "name": None, "needs": [],
                 "if": "__unsupported_if__"}
            )
            continue
        if "uses" in definition:
            unsupported_job = "reusable_workflow"
        elif (
            isinstance(definition.get("strategy"), dict)
            and "matrix" in definition["strategy"]
        ):
            unsupported_job = "matrix"
        else:
            unsupported_job = None
        name = definition.get("name")
        if isinstance(name, _TScalar):
            # Only a genuine string is a job name on the TypeScript
            # side (typeof string); a plain boolean/number/null is
            # not a string -> None. A quoted scalar is a string.
            name = str(name) if name.core_kind == "string" else None
        elif not isinstance(name, str):
            name = None
        needs_raw = definition.get("needs")
        if needs_raw is None:
            needs = []
        elif isinstance(needs_raw, _TScalar):
            if needs_raw.core_kind == "null":
                needs = []
            else:
                needs = [str(needs_raw)]
        elif isinstance(needs_raw, str):
            needs = [needs_raw]
        elif isinstance(needs_raw, list):
            needs = []
            for n in needs_raw:
                if isinstance(n, _TScalar):
                    if n.core_kind == "null":
                        needs.append("__invalid_needs__")
                    else:
                        needs.append(str(n))
                elif isinstance(n, str):
                    needs.append(n)
                else:
                    needs.append("__invalid_needs__")
        else:
            needs = ["__invalid_needs__"]
        raw_if = definition.get("if")
        if raw_if is None:
            if_value = None
        elif isinstance(raw_if, _TScalar):
            if_value = None if raw_if.core_kind == "null" else str(raw_if)
        elif isinstance(raw_if, str):
            if_value = raw_if
        else:
            if_value = "__unsupported_if__"
        jobs.append({"id": job_id, "name": name, "needs": needs,
                     "if": if_value, "unsupported_job": unsupported_job})
    return jobs
