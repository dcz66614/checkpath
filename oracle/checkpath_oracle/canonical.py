"""CheckPath Reference Oracle — canonical JSON + hashing (T004).

Canonical form (must match the TypeScript side byte-for-byte):
  * JSON object keys sorted (recursively),
  * separators "," and ":" (no spaces),
  * UTF-8, non-ASCII characters unescaped,
  * no trailing newline in the hashed form (files add one when writing).
"""

from __future__ import annotations

import hashlib
import json

__all__ = [
    "canonical_json",
    "canonical_bytes",
    "sha256_hex",
]


def canonical_json(obj) -> str:
    """Canonical JSON string for ``obj`` (no trailing newline)."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def canonical_bytes(obj) -> bytes:
    """Canonical JSON encoded as UTF-8 bytes."""
    return canonical_json(obj).encode("utf-8")


def sha256_hex(data) -> str:
    """SHA-256 hex digest of a string (UTF-8) or bytes."""
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()
