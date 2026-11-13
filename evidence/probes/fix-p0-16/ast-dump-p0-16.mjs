import { parseDocument, isMap, isScalar, isSeq } from 'yaml';
import fs from 'node:fs';
const shapes = {
  'flow-map-val': 'm: {&b:!!str {a: 1}}\non: push\n',
  'flow-scalar-val': 'm: {&x: 1}\non: push\n',
  'flow-seq-val': 'm: {&b:!!str [1, 2]}\non: push\n',
  'flow-spaced': 'm: {&b: !!str {a: 1}}\non: push\n',
};
for (const [name, text] of Object.entries(shapes)) {
  const doc = parseDocument(text);
  const root = doc.contents;
  const mPair = root.items.find(p => p.key && p.key.value === 'm');
  const flowMap = mPair.value;
  console.log('=====', name);
  for (const pair of flowMap.items) {
    const k = pair.key;
    console.log('  key node:', k ? k.constructor.name : null,
      '| isScalar:', isScalar(k), '| isMap:', isMap(k), '| isSeq:', isSeq(k),
      '| value:', JSON.stringify(k && k.value),
      '| type:', k && k.type, '| range:', JSON.stringify(k && k.range),
      '| anchor:', k && k.anchor);
    console.log('  value node:', pair.value ? pair.value.constructor.name : null,
      '| value:', JSON.stringify(pair.value && pair.value.toJSON ? pair.value.toJSON() : pair.value && pair.value.value));
  }
}
