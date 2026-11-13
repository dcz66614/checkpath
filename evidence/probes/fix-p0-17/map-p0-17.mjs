// FIX-P0-17 parser-level probe (npm side): `yaml` package parse for
// P0-A (alias-key exemption) and P0-B (anchor absorbs ':') shapes,
// plus boundary variants. Usage from the repo root:
//   node evidence/probes/fix-p0-17/map-p0-17.mjs [shape-id ...]
import { parse, parseDocument } from 'yaml';

const WF_PUSH = 'on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n';
const WF_SCHED = 'on: schedule\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n';

const SHAPES = {
  // P0-A: alias key after nospace anchor-colon tag
  'a-alias-key': 'x: &w 1\n&q:!!str *w: 2\n' + WF_SCHED,
  'a-alias-key-push': 'x: &w 1\n&q:!!str *w: 2\n' + WF_PUSH,
  'a-alias-key-lone': 'x: &w 1\n&q:!!str *w: 2\n',
  'a-alias-key-int': 'x: &w 1\n&q:!!int *w: 2\n' + WF_SCHED,
  'a-alias-key-custom': 'x: &w 1\n&q:!zap *w: 2\n' + WF_SCHED,
  'a-alias-seq-key': 'x: &w [1]\n&q:!!str *w: 2\n' + WF_SCHED,
  'a-alias-undef-key': '&q:!!str *w: 2\n' + WF_SCHED,
  'a-ctrl-scalar-key': '&q:!!str hello: 1\n' + WF_SCHED,
  'a-ctrl-quoted-dq': 'x: &w 1\n&q:!!str "hello": 2\n' + WF_SCHED,
  'a-ctrl-quoted-sq': "x: &w 1\n&q:!!str 'hello': 2\n" + WF_SCHED,
  'a-ctrl-qmark': '? &q:!!str *w: 2\n' + WF_SCHED,
  'a-ctrl-spaced': 'x: &w 1\n&q: !!str *w: 2\n' + WF_SCHED,
  'a-ctrl-value-pos': 'm: &q:!!str {a: 1}\n' + WF_SCHED,
  // P0-B: anchor absorbs ':'
  'b-absorb-2': '&q:2\n' + WF_SCHED,
  'b-absorb-2-push': '&q:2\n' + WF_PUSH,
  'b-absorb-foo': '&q:foo\n' + WF_SCHED,
  'b-absorb-lone': '&q:2\n',
  'b-absorb-value-pos': 'm: &q:2\n' + WF_PUSH,
  'b-absorb-flow': 'm: {&q:2}\n' + WF_SCHED,
  'b-absorb-multi-colon': '&q:2:3\n' + WF_PUSH,
  'b-absorb-multi-colon-lone': '&q:2:3\n',
  'b-absorb-double-colon': '&q::2\n' + WF_PUSH,
  'b-absorb-tag-after': '&q:2!zap {a: 1}\n' + WF_SCHED,
  'b-absorb-tag-after-spaced': '&q:2 !zap {a: 1}\n' + WF_SCHED,
  'b-absorb-scalar-val': '&q:2 1\n' + WF_SCHED,
  'b-absorb-colon-space': '&q:2: 1\n' + WF_SCHED,
  'b-absorb-seq-item': 'm:\n  - &q:2\n    on: push\n    jobs:\n      check:\n        runs-on: ubuntu-latest\n        steps:\n          - run: echo hi\n',
  'b-absorb-nested-value': 'm:\n  &q:2\n  on: push\n  jobs:\n    check:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n',
  'b-absorb-nested-map-val': 'm: &q:2\n  a: 1\n' + WF_SCHED,
  'b-absorb-flow-val': 'm: {a: &q:2}\n' + WF_SCHED,
  'b-absorb-flow-key-map': 'm: {&q:2: {a: 1}}\n' + WF_SCHED,
  'b-absorb-comment': '&q:2 # comment\n' + WF_PUSH,
  'b-absorb-docmark': '&q:2\n---\n' + WF_PUSH,
  'b-absorb-anchor-only-colon': '&q:\n' + WF_SCHED,
  'b-absorb-space-after-colon': '&q: 2\n' + WF_PUSH,
  'b-absorb-tag-colon': '&q:!zap {on: schedule}\n',
  'b-absorb-hyphen-num': '&q:bar-baz-9\n' + WF_PUSH,
  'b-absorb-underscore': '&q:foo_bar\n' + WF_PUSH,
  'b-absorb-flow-seq': 'm: [&q:2]\n' + WF_SCHED,
  'b-absorb-two-anchors': '&q:2 &w:3\n' + WF_PUSH,
};

function summarize(node, depth = 0) {
  if (node === null || node === undefined) return String(node);
  if (typeof node !== 'object') return JSON.stringify(node);
  if (node.constructor && node.constructor.name === 'Document') {
    return `Document(errors=${JSON.stringify(node.errors.map(e => e.message.slice(0, 120)))} contents=${summarize(node.contents, depth + 1)})`;
  }
  if (node.items) {
    const kind = node.constructor.name;
    const anchor = node.anchor ? ` anchor=${node.anchor}` : '';
    const tag = node.tag ? ` tag=${node.tag}` : '';
    const items = node.items.map(it => {
      if (it.key !== undefined) return `${summarize(it.key, depth + 1)}:${summarize(it.value, depth + 1)}`;
      return summarize(it, depth + 1);
    }).join(', ');
    return `${kind}${anchor}${tag}[${items}]`;
  }
  if (node.value !== undefined) {
    const anchor = node.anchor ? ` anchor=${node.anchor}` : '';
    const tag = node.tag ? ` tag=${node.tag}` : '';
    return `Scalar(${JSON.stringify(node.value)})${anchor}${tag}`;
  }
  if (node.source !== undefined) return `Alias(${node.source})`;
  return node.constructor.name;
}

const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHAPES);
for (const sid of want) {
  const text = SHAPES[sid];
  console.log(`===== ${sid} =====`);
  try {
    const doc = parseDocument(text, { logLevel: 'error' });
    console.log('errors:', JSON.stringify(doc.errors.map(e => e.message.slice(0, 160))));
    console.log('warnings:', JSON.stringify(doc.warnings.map(e => e.message.slice(0, 120))));
    console.log('contents:', summarize(doc.contents));
  } catch (e) {
    console.log('PARSE-ERROR', e.constructor.name, String(e).slice(0, 300));
  }
}
