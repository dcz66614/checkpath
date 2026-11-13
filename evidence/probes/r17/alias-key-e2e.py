import json, subprocess, sys
from pathlib import Path
WF_PUSH = ("on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n")
SHAPES = {
  "key-absorb-alias": "&w:2 a: 1\nb: *w:2\n" + WF_PUSH,
  "key-absorb-noalias": "&w:2 a: 1\n" + WF_PUSH,
  "key-plain-alias": "&w a: 1\nb: *w\n" + WF_PUSH,
  "key-absorb-other-val": "&w:2 a: 1\nb: 2\n" + WF_PUSH,
  "key-absorb-alias-twice": "&w:2 a: 1\nb: *w:2\nc: *w:2\n" + WF_PUSH,
  "nested-absorb-alias": "&w:2\n  a: 1\nb: *w:2\n" + WF_PUSH,
  "value-nested-absorb-alias": "x: &w:2\n  a: 1\ny: *w:2\n" + WF_PUSH,
  "key-absorb-flow-alias": "m: {&w:2: 1, b: *w:2}\n" + WF_PUSH,
}
def run_json(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0: return {"_error": (r.stderr.strip() or r.stdout.strip())[:200]}
    try: return json.loads(r.stdout)
    except json.JSONDecodeError: return {"_error": "non-json: " + r.stdout[:200]}
for sid, text in SHAPES.items():
    Path("/tmp/ak.yml").write_text(text, encoding="utf-8")
    ts = run_json(["node", "/tmp/r17-ts-probe.cjs", "trigger", "/tmp/ak.yml", "probe"])
    ora = run_json(["python3", "scripts/oracle-parse-probe.py", "--yaml", "/tmp/ak.yml", "--fixture-id", "probe"])
    ts_s = ts.get("status"); ora_s = ora.get("status")
    print(f"{sid}: TS {ts_s}/{ts.get('errors')} vs Oracle {ora_s}/{ora.get('errors')} -> {'MATCH' if ts==ora else 'DIFF'}")
