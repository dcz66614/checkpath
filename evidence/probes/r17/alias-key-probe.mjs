import { parseDocument } from 'yaml';
const WF = 'on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n';
const SHAPES = {
  'key-absorb-alias': '&w:2 a: 1\nb: *w:2\n' + WF,
  'key-absorb-noalias': '&w:2 a: 1\n' + WF,
  'key-plain-alias': '&w a: 1\nb: *w\n' + WF,
  'seq-absorb-alias': 'm:\n  - &w:2 1\n  - *w:2\n' + WF,
  'key-absorb-alias-lone': '&w:2 a: 1\nb: *w:2\n',
  'key-absorb-undef-alias': '&w:2 a: 1\nb: *w:9\n' + WF,
};
for (const [id, text] of Object.entries(SHAPES)) {
  try {
    const doc = parseDocument(text, { logLevel: 'error' });
    console.log(`### ${id}`);
    console.log('  errors:', doc.errors.map(e => e.message.split('\n')[0]).join(' | ') || '(none)');
    try { console.log('  parsed:', JSON.stringify(doc.toJS())); } catch (e) { console.log('  toJS THROW:', String(e).slice(0,120)); }
  } catch (e) { console.log(`### ${id}: THROW ${String(e).slice(0,160)}`); }
}
