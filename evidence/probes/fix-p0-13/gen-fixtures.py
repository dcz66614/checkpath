"""Generate tests/fixtures/parser-divergence/{tag-suffix-comma,
tag-suffix-brackets,anchored-empty-key}/ from shape lists, and the
matching expected.json (TS + Oracle status/errors/events, computed
by running both sides — the test then locks them).

Usage (from the repo root):
    python3 evidence/probes/fix-p0-13/gen-fixtures.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
FIXDIR = REPO / "tests" / "fixtures" / "parser-divergence"

TAIL = ("name: probe\non: push\njobs:\n  test:\n"
        "    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n")


def doc(fragment, slot="m"):
    return fragment + "\n" + TAIL


# (dir, [(id, yaml, note)])
GROUPS = {
    "tag-suffix-comma": [
        ("c01-comma-pair", doc("m: {a: !foo, b: 1}"), "C1 core A60: tag-comma, pair follows — INVALID both sides."),
        ("c02-comma-2pairs", doc("m: {a: !foo, b: 1, c: 2}"), "X04: another pair follows — INVALID both sides."),
        ("c03-comma-quoted", doc('m: {a: !foo, "b": 1}'), "Y03: quoted node after comma — INVALID both sides."),
        ("c04-comma-nl", doc("m: {a: !foo,\n b: 1}"), "Y05: node on next line — INVALID both sides."),
        ("c05-comma-anchor", doc("m: {a: !foo, &x 1: 2}"), "Y08: anchor-prefixed node — INVALID both sides."),
        ("c06-comma-num", doc("m: {a: !foo, 1: 2}"), "Y09: numeric node — INVALID both sides."),
        ("c07-comma-null", doc("m: {a: !foo, b:}"), "Y10: null-value node — INVALID both sides."),
        ("c08-comma-block", doc("a: !foo,\n  b: 1", "root"), "X11 reverse: block variant — INVALID both sides."),
        ("c09-comma-val", doc("m: {a: !foo, 1}"), "Value (not pair) after comma — INVALID both sides after fix."),
        ("c10-comma-seq-in-map", doc("m: {a: [!foo, b: 1]}"), "Control: flow seq inside flow map — VALID both sides."),
        ("c11-comma-seq", doc("m: [!foo, a: 1]"), "Control Y01: flow seq with pair — VALID both sides."),
        ("c12-comma-mid", doc("m: {a: !foo,bar 1}"), "Control X02: comma mid-suffix — VALID both sides."),
        ("c13-comma-space", doc("m: {a: !foo , b: 1}"), "Control X13: space before comma — VALID both sides."),
        ("c14-comma-handle", doc("m: {a: !!str, b: 1}"), "Handle tag + comma — INVALID both sides."),
        ("c15-comma-nested", doc("m: {a: {b: !foo, c: 1}}"), "Nested flow map — INVALID both sides."),
        ("c16-comma-escaped", doc("m: {a: !foo%2C, b: 1}"), "Escaped comma + literal trailing comma — INVALID both sides."),
    ],
    "tag-suffix-brackets": [
        ("b01-bracket", doc("m: {a: !foo[bar] 1}"), "C2 core A70 — INVALID both sides."),
        ("b02-rbrack-seq", doc("m: [!foo] 1]"), "X08 reverse — INVALID both sides."),
        ("b03-rbrack-comma", doc("m: [!foo], 1]"), "X09 reverse — INVALID both sides."),
        ("b04-bracket-mid", doc("m: {a: !foo[bar]baz 1}"), "Bracket mid-suffix — INVALID both sides."),
        ("b05-rbrack", doc("m: {a: !foo] 1}"), "Rbrack, no value — INVALID both sides."),
        ("b06-lbrack", doc("m: {a: !foo[ 1}"), "Lbrack then space — INVALID both sides."),
        ("b07-empty-brackets", doc("m: {a: !foo[] 1}"), "Empty brackets — INVALID both sides."),
        ("b08-nested-brackets", doc("m: {a: !foo[[x]] 1}"), "Nested brackets — INVALID both sides."),
        ("b09-bracket-key", doc("m: {!foo[bar]: 1}"), "Tag-bracket on a key — INVALID both sides."),
        ("b10-bracket-block", doc("a: !foo[bar] 1", "root"), "Block tag-bracket — INVALID both sides."),
        ("b11-verbatim", doc("m: {a: !<foo[bar]> 1}"), "Control: verbatim tag — VALID both sides."),
        ("b12-quoted", doc('m: {a: "x[y"}'), "Control: bracket in quoted scalar — VALID both sides."),
    ],
    "anchored-empty-key": [
        ("k01-anchored-root", doc("&x: 1", "root"), "C3 core A45 — INVALID both sides."),
        ("k02-anchored-last", "name: probe\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n&x: 1\n", "Anchored key, LAST pair — INVALID both sides."),
        ("k03-anchored-space", doc("&x : 1", "root"), "Space before colon — INVALID both sides."),
        ("k04-anchored-nested", doc("a:\n  &x: 1\n  b: 2"), "Nested block, 2 pairs — INVALID both sides."),
        ("k05-anchored-blockval", doc("&x:\n  a: 1", "root"), "Anchor on nested block value — INVALID both sides."),
        ("k06-anchored-null-mid", "name: probe\n&x:\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "Null value, middle — INVALID both sides."),
        ("k07-anchored-null-last", "name: probe\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n&x:\n", "Null value, last — INVALID both sides."),
        ("k08-anchored-flowval", doc("&x: {a: 1}", "root"), "Anchor on flow-map value — INVALID both sides."),
        ("k09-tag-anchor", doc("!foo &x: 1", "root"), "Tag then anchor on empty key — INVALID both sides."),
        ("k10-anchored-seqitem", doc("m:\n  - &x: 1\n    b: 2"), "Seq-item mapping, 2 pairs — INVALID both sides."),
        ("k11-flow", doc("m: {&x: 1}"), "Control: flow mapping — VALID both sides."),
        ("k12-seqitem-single", "name: probe\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - &x: 1\n", "Control: seq item, single pair — VALID both sides."),
        ("k13-null-first", doc("&x:\n", "root"), "Control: null value, FIRST pair — VALID both sides."),
        ("k14-nested-single", doc("a:\n  &x: 1"), "Control: nested, single pair — VALID both sides."),
        ("k15-null-nested-first", doc("a:\n  &x:\n  b: 2"), "Control: null value, nested FIRST pair — VALID both sides."),
        ("k16-anchor-tag", doc("&x !foo: 1", "root"), "Control: anchor then tag, already both INVALID."),
    ],
}


def run_json(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"command failed: {cmd}\n{r.stderr[:500]}")
    return json.loads(r.stdout)


def main() -> int:
    esbuild = REPO / "node_modules" / ".bin" / "esbuild"
    entry = REPO / "evidence" / "probes" / "fix-p0-12" / "ts-probe-entry.ts"
    with tempfile.TemporaryDirectory(prefix="gen-fixtures-p0-13-") as tmp:
        tmp = Path(tmp)
        bundle = tmp / "ts-probe.cjs"
        r = subprocess.run(
            [str(esbuild), str(entry), "--bundle", "--platform=node",
             "--format=cjs", f"--outfile={bundle}", "--log-level=error"],
            capture_output=True, text=True)
        if r.returncode != 0:
            print("esbuild failed:\n" + r.stderr, file=sys.stderr)
            return 2
        for dirname, shapes in GROUPS.items():
            d = FIXDIR / dirname
            d.mkdir(parents=True, exist_ok=True)
            cases = []
            for sid, text, note in shapes:
                fname = sid + ".yml"
                (d / fname).write_text(text, encoding="utf-8")
                ts = run_json(["node", str(bundle), "trigger", str(d / fname), sid])
                orc = run_json(["python3", str(REPO / "scripts" / "oracle-parse-probe.py"),
                                "--yaml", str(d / fname), "--fixture-id", sid])
                assert ts["status"] == orc["status"] and ts["errors"] == orc["errors"] and ts["events"] == orc["events"], \
                    f"{sid}: TS/Oracle disagree: {ts} vs {orc}"
                cases.append({
                    "file": fname, "id": sid, "note": note,
                    "typescript": {"status": ts["status"], "errors": ts["errors"], "events": ts["events"]},
                    "oracle": {"status": orc["status"], "errors": orc["errors"], "events": orc["events"]},
                })
                print(f"  {dirname}/{fname}: {ts['status']} (agree)")
            (d / "expected.json").write_text(
                json.dumps({"schema": "checkpath.parser-divergence/v1", "cases": cases},
                           indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"{dirname}: {len(cases)} cases")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
