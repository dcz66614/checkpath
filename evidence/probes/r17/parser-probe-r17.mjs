// T013 R17 parser-level probe (npm `yaml` package side, written fresh by
// the R17 reviewer). Dumps parseDocument anchor + errors for the same
// shapes as parser-probe-r17.py, so the two sides can be compared at
// the parser level, independent of the end-to-end probe drivers.
//
// Usage from the repo root:
//   node evidence/probes/r17/parser-probe-r17.mjs [shape-id ...]
import { parseDocument } from 'yaml';

const WF_PUSH = 'on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n';

const SHAPES = {
  'tag-root-block': '&x:!!tag\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n',
  'tag-nobrace': '&b:!!str{on: pull_request}\n',
  'tag-tab-brace': '&x:!!str\t{on: push}\n',
  'tag-bare-bang': '&x:!\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n',
  'tag-double-bang': '&x:!!\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n',
  'tag-bang-mid': '&x:!!str!zap\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n',
  'tag-comment': '&x:!!str # note\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n',
  'hash-glued': '&q:2#x\n' + WF_PUSH,
  'nbsp': '&q:2 \n' + WF_PUSH,
  'triple-colon': '&q:2:3:4\n' + WF_PUSH,
  'alias-colon-lone': '*w:2\n',
  'alias-resolved': 'x: &w:2 1\ny: *w:2\n' + WF_PUSH,
};

function anchorOf(doc) {
  const c = doc.contents;
  if (!c) return '(no contents)';
  if (c.anchor !== undefined) return JSON.stringify(c.anchor);
  if (c.items) return '(map, anchor=' + JSON.stringify(c.anchor) + ')';
  return '(scalar, anchor=' + JSON.stringify(c.anchor) + ')';
}

const want = process.argv.slice(2);
for (const [id, text] of Object.entries(SHAPES)) {
  if (want.length && !want.includes(id)) continue;
  try {
    const doc = parseDocument(text, { logLevel: 'error' });
    const errs = doc.errors.map((e) => e.message.split('\n')[0]).join(' | ').slice(0, 160);
    console.log(`### ${id}: ${JSON.stringify(text)}`);
    console.log(`  anchor: ${anchorOf(doc)} errors: ${doc.errors.length} ${errs}`);
    try {
      console.log('  parsed:', JSON.stringify(doc.toJS()).slice(0, 200));
    } catch (e) {
      console.log('  toJS THROW:', String(e).slice(0, 120));
    }
  } catch (e) {
    console.log(`### ${id}: THROW ${String(e).slice(0, 160)}`);
  }
}
