"""Round-2 mapping for FIX-P0-13: full workflow docs through the real
end-to-end probe drivers (TS bundle + Oracle drivers, full JSON
compare). Bare-fragment parser mapping (map-p0-13.py) can mislead:
the probe only compares TriggerIR (trigger mode) and the job list
(jobs mode), so a difference in an ignored key's VALUE is invisible
— only parse status / on: / jobs: content matter.

Usage (from the repo root, after `npm ci`):
    python3 evidence/probes/fix-p0-13/map2-p0-13.py [group]
Groups: c1, c2, c3, esc (percent escapes), all (default).
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent

TAIL = ("name: probe\non: push\njobs:\n  test:\n"
        "    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n")

def doc(fragment, slot="m"):
    if slot == "m":
        return fragment + "\n" + TAIL
    if slot == "root":
        return fragment + "\n" + TAIL
    raise ValueError(slot)

# (id, yaml-doc, note)
C1 = [
    ("c1f-a60", doc("m: {a: !foo, b: 1}"), "A60 core"),
    ("c1f-val-notpair", doc("m: {a: !foo, 1}"), "both accept bare; m: invisible?"),
    ("c1f-val-then-pair", doc("m: {a: !foo, 1, b: 2}"), "value then pair"),
    ("c1f-key-nocolon", doc("m: {a: !foo, b}"), "key no colon"),
    ("c1f-on-key", doc("m: {!foo, b: 1}"), "tag-comma on KEY"),
    ("c1f-verbatim-comma", doc("m: {a: !<tag:x>, b: 1}"), "verbatim tag + comma"),
    ("c1f-block-eol", doc("a: !foo,", "root"), "block tag-comma EOL"),
    ("c1f-trailing", doc("m: {a: !foo,}"), "trailing comma in map"),
    ("c1f-last-pair", doc("m: {a: 1, b: !foo,}"), "last pair tag-comma"),
    ("c1f-flowseq-key", doc("m: [{a: !foo, b: 1}]"), "flow map inside flow seq"),
    ("c1f-seq-in-map", doc("m: {a: [!foo, b: 1]}"), "flow seq inside flow map"),
    ("c1f-double-comma", doc("m: {a: !foo,, b: 1}"), "double comma"),
    ("c1f-alias-after", doc("m: {a: !foo, *x}"), "alias after comma"),
    ("c1f-two-commas", doc("m: {a: !foo,bar, b: 1}"), "two commas in suffix"),
    ("c1f-handle", doc("m: {a: !!str, b: 1}"), "handle tag + comma"),
    ("c1f-block-sameline", doc("a: !foo, b: 1", "root"), "block same line"),
    ("c1f-seqval-after", doc("m: {a: !foo, [1, 2]}"), "seq value after comma"),
    ("c1f-mapval-after", doc("m: {a: !foo, {b: 1}}"), "map value after comma"),
    ("c1f-on-slot", "on: {push: {types: [opened]}, !foo, b: 1}\nname: probe\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "tag-comma inside on: slot"),
    ("c1f-y01", doc("m: [!foo, a: 1]"), "control Y01 seq"),
    ("c1f-x02", doc("m: {a: !foo,bar 1}"), "control X02 mid-suffix"),
    ("c1f-x13", doc("m: {a: !foo , b: 1}"), "control X13 space"),
    ("c1f-x05", doc("m: [!foo, 1]"), "control X05 seq"),
]

C2 = [
    ("c2f-a70", doc("m: {a: !foo[bar] 1}"), "A70 core"),
    ("c2f-x08", doc("m: [!foo] 1]"), "X08"),
    ("c2f-x09", doc("m: [!foo], 1]"), "X09"),
    ("c2f-mid-bracket", doc("m: {a: !foo[bar]baz 1}"), "bracket mid-suffix"),
    ("c2f-rbrack-noval", doc("m: {a: !foo] 1}"), "rbrack no value"),
    ("c2f-lbrack-space", doc("m: {a: !foo[ 1}"), "lbrack then space"),
    ("c2f-empty-brackets", doc("m: {a: !foo[] 1}"), "empty brackets"),
    ("c2f-nested-brackets", doc("m: {a: !foo[[x]] 1}"), "nested brackets"),
    ("c2f-tagbracket-key", doc("m: {!foo[bar]: 1}"), "tag-bracket on key"),
    ("c2f-block-tagbracket", doc("a: !foo[bar] 1", "root"), "block tag-bracket"),
    ("c2f-tagbracket-seq", doc("m: [!foo[bar] 1]"), "tag-bracket in seq"),
    ("c2f-verbatim-bracket", doc("m: {a: !<foo[bar]> 1}"), "control verbatim"),
    ("c2f-quoted-bracket", doc('m: {a: "x[y"}'), "control quoted"),
    ("c2f-a65", doc("m: {a: !foo]}"), "control A65 both reject"),
    ("c2f-rbrack-comma", doc("m: {a: !foo], b: 1}"), "control both reject"),
]

C3 = [
    ("c3f-a45", doc("&x: 1", "root"), "A45 core"),
    ("c3f-last-pair", "name: probe\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n&x: 1\n", "anchored key LAST pair, EOF after"),
    ("c3f-space-colon", doc("&x : 1", "root"), "space before colon"),
    ("c3f-under-m", doc("m:\n  &x: 1\n  b: 2"), "nested under m"),
    ("c3f-under-jobs", doc("jobs:\n  &x: 1\n  test:\n    runs-on: ubuntu-latest"), "nested under jobs"),
    ("c3f-flow", doc("m: {&x: 1}"), "control flow"),
    ("c3f-flow-pair", doc("m: {&x: 1, b: 2}"), "control flow pair"),
    ("c3f-blockseq-steps", "name: probe\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - &x: 1\n", "anchor-empty-key as seq item in steps"),
    ("c3f-explicit", doc("? &x: 1", "root"), "explicit key"),
    ("c3f-comment-after", doc("&x: 1\n# comment", "root"), "comment after anchored key"),
    ("c3f-blank-after", doc("&x: 1\n", "root"), "blank line after anchored key"),
    ("c3f-nested-block", doc("a:\n  &x: 1\n  b: 2"), "nested block"),
    ("c3f-two-anchored", doc("&x: 1\n&y: 2", "root"), "two anchored keys"),
    ("c3f-anchor-quoted", doc('&x: "1"', "root"), "anchored key, quoted value"),
]

ESC = [
    ("esc-comma", doc("m: {a: !foo%2C b: 1}"), "%2C comma escape in suffix"),
    ("esc-bracket", doc("m: {a: !foo%5Bbar 1}"), "%5B bracket escape in suffix"),
    ("esc-rbracket", doc("m: {a: !foo%5D 1}"), "%5D rbracket escape"),
    ("esc-comma-end", doc("m: {a: !foo%2C, b: 1}"), "%2C then real comma"),
]

GROUPS = {"c1": C1, "c2": C2, "c3": C3, "esc": ESC}


def run_json(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        return {"_error": (r.stderr.strip() or r.stdout.strip())[:200]}
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return {"_error": "non-json: " + r.stdout[:200]}


def main() -> int:
    groups = sys.argv[1:] or ["all"]
    shapes = []
    for g in groups:
        if g == "all":
            for v in GROUPS.values():
                shapes += v
        else:
            shapes += GROUPS[g]
    esbuild = REPO / "node_modules" / ".bin" / "esbuild"
    entry = REPO / "evidence" / "probes" / "fix-p0-12" / "ts-probe-entry.ts"
    with tempfile.TemporaryDirectory(prefix="map2-p0-13-") as tmp:
        tmp = Path(tmp)
        bundle = tmp / "ts-probe.cjs"
        r = subprocess.run(
            [str(esbuild), str(entry), "--bundle", "--platform=node",
             "--format=cjs", f"--outfile={bundle}", "--log-level=error"],
            capture_output=True, text=True)
        if r.returncode != 0:
            print("esbuild failed:\n" + r.stderr, file=sys.stderr)
            return 2
        for sid, text, note in shapes:
            yf = tmp / "case.yml"
            yf.write_text(text, encoding="utf-8")
            line = []
            for mode in ("trigger", "jobs"):
                ts = run_json(["node", str(bundle), mode, str(yf), "probe"])
                if mode == "trigger":
                    orc = run_json(["python3", str(REPO / "scripts" / "oracle-parse-probe.py"),
                                    "--yaml", str(yf), "--fixture-id", "probe"])
                else:
                    orc = run_json(["python3", str(REPO / "scripts" / "oracle-jobs-probe.py"),
                                    "--yaml", str(yf)])
                match = ts == orc
                ts_s = ts.get("status") if isinstance(ts, dict) else "?"
                or_s = orc.get("status") if isinstance(orc, dict) else "?"
                line.append(f"{mode}:{'MATCH' if match else 'DIFF'}(TS {ts_s}/O {or_s})")
            print(f"{sid:<24} {' '.join(line)}  # {note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
