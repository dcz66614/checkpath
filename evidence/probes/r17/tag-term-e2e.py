import json, subprocess
from pathlib import Path
WF_PUSH = ("on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n")
SHAPES = {
  "tag-comma": "&b:!!str, {on: push}\n" + WF_PUSH,
  "tag-comma-block": "&x:!!str,\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n",
  "tag-rbracket": "&b:!!str] {on: push}\n" + WF_PUSH,
  "tag-colon": "&x:!!str: 1\n" + WF_PUSH,
  "tag-colon-eol": "&x:!!str:\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n",
  "tag-semi": "&b:!!str; {on: push}\n" + WF_PUSH,
  "tag-dot": "&b:!!str. {on: push}\n" + WF_PUSH,
}
def run_json(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0: return {"_error": (r.stderr.strip() or r.stdout.strip())[:200]}
    try: return json.loads(r.stdout)
    except json.JSONDecodeError: return {"_error": "non-json: " + r.stdout[:200]}
for sid, text in SHAPES.items():
    Path("/tmp/tt.yml").write_text(text, encoding="utf-8")
    ts = run_json(["node", "/tmp/r17-ts-probe.cjs", "trigger", "/tmp/tt.yml", "probe"])
    ora = run_json(["python3", "scripts/oracle-parse-probe.py", "--yaml", "/tmp/tt.yml", "--fixture-id", "probe"])
    print(f"{sid}: TS {ts.get('status')}/{ts.get('errors')} vs Oracle {ora.get('status')}/{ora.get('errors')} -> {'MATCH' if ts==ora else 'DIFF'}")
