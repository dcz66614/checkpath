// R16 parser-level probe (npm side): `yaml` package parse for the 3 DIFF
// shapes found by r16-probe.py, plus controls.
// Usage: node evidence/probes/r16/parser-probe-r16.mjs [shape-id ...]
import { parse, parseDocument } from 'yaml';

const WF = 'on: schedule\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n';

const SHAPES = {
  'c15-alias-key': 'x: &w 1\n&q:!!str *w: 2\n' + WF,
  'c16-absorb-2': '&q:2\n' + WF,
  'c17-absorb-foo': '&q:foo\n' + WF,
  'c16-lone': '&q:2\n',
  'c17-lone': '&q:foo\n',
  'c15-ctrl-scalar-key': '&q:!!str hello: 1\n' + WF,
  'c15-ctrl-alias-key-lone': 'x: &w 1\n&q:!!str *w: 2\n',
  'c16-lone-wf-null': '&q:2\non: schedule\n',
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
  console.log('--- yaml ---');
  console.log(text);
  try {
    const doc = parseDocument(text, { logLevel: 'error' });
    console.log('--- npm parseDocument ---');
    console.log('errors:', JSON.stringify(doc.errors.map(e => e.message.slice(0, 200))));
    console.log('warnings:', JSON.stringify(doc.warnings.map(e => e.message.slice(0, 120))));
    console.log('contents:', summarize(doc.contents));
  } catch (e) {
    console.log('PARSE-ERROR', e.constructor.name, String(e).slice(0, 300));
  }
  try {
    const val = parse(text, { logLevel: 'error' });
    console.log('--- npm parse (plain JS) ---');
    console.log(JSON.stringify(val, (k, v) => (typeof v === 'bigint' ? String(v) : v)).slice(0, 400));
  } catch (e) {
    console.log('PARSE-ERROR', e.constructor.name, String(e).slice(0, 300));
  }
}
