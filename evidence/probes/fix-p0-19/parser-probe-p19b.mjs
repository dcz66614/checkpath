// Corrected canonical-folding probes (anchors defined as VALUES).
import { parse, parseDocument, isAlias, isMap, isSeq, isScalar } from "yaml";
const WF = "on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n";
const SHAPES = {
  "B11-int-anchor": "x: &w 1\nm: {1: y, *w}\n" + WF,
  "B12-int-vs-quoted": "x: &w 1\nm: {'1': y, *w}\n" + WF,
  "B13-bool-anchor": "x: &w True\nm: {true: y, *w}\n" + WF,
  "B14-bool-vs-int": "x: &w True\nm: {1: y, *w}\n" + WF,
  "B15-null-anchor": "x: &w ~\nm: {null: y, *w}\n" + WF,
  "B16-quoted-anchor": "x: &w 'a'\nm: {a: y, *w}\n" + WF,
  "B17-tagged-anchor": "x: &w !!str 1\nm: {1: y, *w}\n" + WF,
  "B18-nan-anchor": "x: &w .nan\nm: {.nan: y, *w}\n" + WF,
  "B21-on-alias-dup": "x: &w push\non: {*w, push: {}}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
  "B25-chained-alias": "x: &a foo\ny: &b *a\nm: {foo: 1, *b}\n" + WF,
};
function describeKey(doc, key) {
  if (isAlias(key)) {
    let resolved;
    try { resolved = key.resolve(doc); } catch (e) { resolved = `THROW`; }
    const r = resolved === undefined ? "undefined"
      : isScalar(resolved) ? `Scalar(${JSON.stringify(resolved.value)})`
      : isMap(resolved) ? "Map" : isSeq(resolved) ? "Seq"
      : isAlias(resolved) ? `Alias(${resolved.source})` : typeof resolved;
    return `Alias(${JSON.stringify(key.source)}) -> ${r}`;
  }
  if (isScalar(key)) return `Scalar(${JSON.stringify(key.value)}, type=${key.type})`;
  return `${key?.constructor?.name ?? typeof key}`;
}
for (const [name, text] of Object.entries(SHAPES)) {
  let parseErr = null, parsed = null;
  try { parsed = parse(text); } catch (e) { parseErr = e.message.split("\n")[0]; }
  let doc = null, docErrs = null;
  try { doc = parseDocument(text); docErrs = doc.errors.map((e) => `${e.code}`); }
  catch (e) { docErrs = ["THROW"]; }
  const maps = [];
  const walk = (node, path) => {
    if (isMap(node)) {
      maps.push(`${path} flow=${!!node.flow} keys=[${node.items.map((p) => describeKey(doc, p.key)).join(" | ")}]`);
      for (const p of node.items) { walk(p.key, path + ".k"); walk(p.value, path + ".v"); }
    } else if (isSeq(node)) node.items.forEach((it, i) => walk(it, `${path}[${i}]`));
  };
  if (doc) walk(doc.contents, "root");
  console.log(`=== ${name} ===`);
  console.log(`  parse(): ${parseErr ? "THROW " + parseErr : "OK " + JSON.stringify(parsed?.m ?? parsed?.on ?? "")}`);
  console.log(`  doc errors: ${JSON.stringify(docErrs)}`);
  for (const m of maps) console.log(`  ${m}`);
}
