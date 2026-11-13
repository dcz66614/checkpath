import { parseDocument } from 'yaml';
const WF = 'on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n';
const SHAPES = {
  'alias-colon-key': 'x: &w 1\n*w: 2\n' + WF,
  'alias-colon-key-spaced': 'x: &w 1\n*w : 2\n' + WF,
  'alias-colon-value': 'x: *w: 2\n' + WF,
  'alias-colon-flow-key': 'm: {*w: 2}\n' + WF.replace('x: &w 1\n', 'x: &w 1\n'),
  'alias-colon-lone': 'x: &w 1\n*w: 2\n',
  'alias-colon-undef': '*w: 2\n' + WF,
  'alias-dot': 'x: &w 1\n*w.2: 3\n' + WF,
};
for (const [sid, text] of Object.entries(SHAPES)) {
  try {
    const doc = parseDocument(text, { logLevel: 'error' });
    console.log(`===== ${sid} =====`);
    console.log('errors:', JSON.stringify(doc.errors.map(e => e.message.split('\n')[0]).slice(0, 3)));
    console.log('contents:', JSON.stringify(doc.toJS(), (k, v) => (typeof v === 'bigint' ? String(v) : v)).slice(0, 200));
  } catch (e) { console.log(`===== ${sid} ===== THROW`, String(e).slice(0, 200)); }
}
