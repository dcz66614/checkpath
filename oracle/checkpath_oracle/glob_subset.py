"""CheckPath Reference Oracle — ordered Glob matching (T002 PoC).

Independent Python implementation of the frozen Glob subset
(PROJECT_BOOK section 3.3, section 4.2; IMPLEMENTATION_PLAN section 6 T002).
It reads only the raw pattern strings; it never imports or calls any
TypeScript code.

Supported:
  ``*``   any run of characters except ``/``
  ``**``  any run of characters including ``/``
  ``**/`` zero or more whole directories
  ``?``   exactly one character except ``/``
  ``[...]`` simple character class (ranges allowed, leading ``!`` negates)
Everything else is UNSUPPORTED and must surface as UNKNOWN, never silently
degrade: ``{a,b}`` brace expansion, ``(``, ``)``, ``\\`` escapes, POSIX
``[[:...:]]`` classes, ``***``, and empty patterns.

Ordered semantics: patterns are evaluated in order. A positive pattern that
matches sets the result to true; a later ``!`` negative pattern that matches
sets it back to false; a later positive pattern may re-include it.
"""

from __future__ import annotations

import re
from typing import Optional

__all__ = [
    "glob_to_regexp",
    "is_supported_glob",
    "match_glob",
    "match_ordered_patterns",
]


def glob_to_regexp(pattern: str) -> Optional["re.Pattern[str]"]:
    """Convert one supported Glob pattern to a regexp, or None if unsupported."""
    if len(pattern) == 0:
        return None
    parts = ["^"]
    i = 0
    n = len(pattern)
    while i < n:
        c = pattern[i]
        # Trailing "/**" matches the directory itself and everything under it.
        if c == "/" and pattern[i:] == "/**":
            parts.append("(?:/.*)?")
            i += 3
            continue
        if c == "*":
            if i + 1 < n and pattern[i + 1] == "*":
                if i + 2 < n and pattern[i + 2] == "*":
                    return None  # "***" is unsupported
                if i + 2 < n and pattern[i + 2] == "/":
                    parts.append("(?:.*/)?")
                    i += 3
                else:
                    parts.append(".*")
                    i += 2
            else:
                parts.append("[^/]*")
                i += 1
            continue
        if c == "?":
            parts.append("[^/]")
            i += 1
            continue
        if c == "[":
            close = pattern.find("]", i + 1)
            if close == -1:
                return None  # unclosed class is unsupported
            body = pattern[i + 1 : close]
            if len(body) == 0:
                return None
            if "[:" in body:
                return None  # POSIX class, e.g. [[:alpha:]]
            if "\\" in body:
                return None
            negated = body.startswith("!")
            cls = body[1:] if negated else body
            if len(cls) == 0:
                return None
            parts.append("[" + ("^" if negated else "") + cls + "]")
            i = close + 1
            continue
        if c in ("{", "}", "(", ")", "\\"):
            return None  # brace expansion / extglob / escapes are unsupported
        if c in "^$.|+":
            parts.append("\\" + c)
        else:
            parts.append(c)
        i += 1
    parts.append("$")
    return re.compile("".join(parts))


def is_supported_glob(pattern: str) -> bool:
    """True when the pattern uses only the frozen supported subset."""
    return glob_to_regexp(pattern) is not None


def match_glob(pattern: str, value: str) -> Optional[bool]:
    """Match one pattern against a value; None when syntax is unsupported."""
    compiled = glob_to_regexp(pattern)
    if compiled is None:
        return None
    return compiled.match(value) is not None


def match_ordered_patterns(patterns: list, value: str) -> dict:
    """Evaluate an ordered pattern list against one value, preserving ``!`` order.

    Returns {"matched": bool, "unsupported": [patterns]}. Unsupported patterns
    are reported and skipped; callers must treat a non-empty "unsupported"
    list as UNKNOWN.
    """
    matched = False
    unsupported: list = []
    for pattern in patterns:
        negated = pattern.startswith("!")
        raw = pattern[1:] if negated else pattern
        hit = match_glob(raw, value)
        if hit is None:
            unsupported.append(pattern)
            continue
        if hit:
            matched = not negated
    return {"matched": matched, "unsupported": unsupported}
