import { parseDocument } from 'yaml';
const chars = [':', '.', '/', ';', '?', '=', '+', '$', '@', '`', '%', '#', ',', '[', ']', '{', '}', '!', '&', '*', '|', '>', "'", '"', '-', '_', '~', '(', ')', '\\'];
for (const c of chars) {
  const text = `&q${c}2\non: push\njobs: {}\n`;
  try {
    const doc = parseDocument(text, { logLevel: 'error' });
    const anchor = doc.contents && doc.contents.anchor ? doc.contents.anchor : (doc.contents && doc.contents.items ? '(map, no anchor shown)' : '?');
    console.log(JSON.stringify(c), '-> anchor:', JSON.stringify(anchor), 'errors:', doc.errors.length, doc.errors.map(e=>e.message.split('\n')[0]).join(' | ').slice(0,80));
  } catch (e) { console.log(JSON.stringify(c), '-> THROW', String(e).slice(0,80)); }
}
// also: what stops an anchor run? test multi-char runs
for (const t of ['&q:2.5', '&q:2/3', '&q:2,3', '&q:2}3', '&q:2]3', '&q:2 3', '&q:2\t3']) {
  const text = `${t}\non: push\njobs: {}\n`;
  try {
    const doc = parseDocument(text, { logLevel: 'error' });
    console.log(JSON.stringify(t), '-> anchor:', JSON.stringify(doc.contents && doc.contents.anchor), 'errors:', doc.errors.length);
  } catch (e) { console.log(JSON.stringify(t), '-> THROW', String(e).slice(0,80)); }
}
