// T013 R15 parser-level minimal reproductions (npm `yaml` side).
// Mirrors evidence/probes/r15/parser-probe.py shapes; prints the
// npm package's parse outcome per shape (value or thrown message).
import { parse } from 'yaml';

const SHAPES = {
  'c3-root1st': '!bar &b : 2\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n',
  'c3-root2nd': 'a: 1\n!bar &b : 2\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n',
  'c3-nested2nd': 'm:\n  a: 1\n  !bar &b : 2\non: push\n',
  'c3-nested1st': 'm:\n  !bar &b : 2\non: push\n',
  'c3-lone': '!bar &b : 2\n',
  'str-flow-nospace': '&b:!!str {on: pull_request}\n',
  'str-block-nospace': '&b:!!str\n  on: pull_request\n',
  'str-flow-space': '&b: !!str {on: pull_request}\n',
  'int-flow': '&b: !!int {on: pull_request}\n',
  'bool-flow': '&b: !!bool {on: pull_request}\n',
  'float-flow': '&b: !!float {on: pull_request}\n',
  'int-on': 'on: !!int {push: {}}\n',
  'str-on': 'on: !!str {push: {}}\n',
  'int-scalar': 'a: !!int 1\n',
};

const out = {};
for (const [name, text] of Object.entries(SHAPES)) {
  try {
    out[name] = { ok: true, value: JSON.stringify(parse(text)) };
  } catch (e) {
    out[name] = { ok: false, exc: e?.name ?? 'Error', msg: String(e?.message ?? e).slice(0, 120) };
  }
}
console.log(JSON.stringify(out, null, 1));
