import json, subprocess
from pathlib import Path
WF_PUSH = ("on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n")
# Anchor &w:2 is defined on a KEY (key position, accepted on both sides) in every shape;
# the alias *w:2 is then used in various positions.
HEAD = "&w:2 a: 1\n"
SHAPES = {
  "fam-value-block": HEAD + "b: *w:2\n" + WF_PUSH,
  "fam-value-flow": HEAD + "m: {b: *w:2}\n" + WF_PUSH,
  "fam-value-nested": HEAD + "m:\n  n: *w:2\n" + WF_PUSH,
  "fam-value-after-tag": HEAD + "m: !zap *w:2\n" + WF_PUSH,
  "fam-value-after-anchor": HEAD + "m: &s *w:2\n" + WF_PUSH,
  "fam-explicit-key": HEAD + "? *w:2\n: 1\n" + WF_PUSH,
  "fam-flow-seq-item": HEAD + "m: [*w:2]\n" + WF_PUSH,
  "fam-flow-key": HEAD + "m: {*w:2: 1}\n" + WF_PUSH,
  "fam-block-seq-item": HEAD + "m:\n  - *w:2\n" + WF_PUSH,
  "fam-docmark": HEAD + "---\nb: *w:2\n" + WF_PUSH,
  "fam-on-value": HEAD + "on: *w:2\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
  "fam-jobs-value": HEAD + "on: push\njobs: *w:2\n",
  "fam-second-pair": HEAD + "b: 1\nc: *w:2\n" + WF_PUSH,
  "fam-flow-value-2nd": HEAD + "m: {b: 1, c: *w:2}\n" + WF_PUSH,
  "fam-nested-flow-value": HEAD + "m: {a: {b: *w:2}}\n" + WF_PUSH,
}
def run_json(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0: return {"_error": (r.stderr.strip() or r.stdout.strip())[:200]}
    try: return json.loads(r.stdout)
    except json.JSONDecodeError: return {"_error": "non-json: " + r.stdout[:200]}
for sid, text in SHAPES.items():
    Path("/tmp/af.yml").write_text(text, encoding="utf-8")
    ts = run_json(["node", "/tmp/r17-ts-probe.cjs", "trigger", "/tmp/af.yml", "probe"])
    ora = run_json(["python3", "scripts/oracle-parse-probe.py", "--yaml", "/tmp/af.yml", "--fixture-id", "probe"])
    print(f"{sid}: TS {ts.get('status')}/{ts.get('errors')} vs Oracle {ora.get('status')}/{ora.get('errors')} -> {'MATCH' if ts==ora else 'DIFF'}")
