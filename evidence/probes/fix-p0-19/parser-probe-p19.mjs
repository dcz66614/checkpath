// Parser-level probe: `yaml` 2.9.1 behaviour on FIX-P0-19 shapes.
// For each shape: does plain parse() throw (uniqueKeys)? What does the
// AST look like for alias keys (Alias node? resolve(doc) -> ?)?
// No verdicts here — raw parser behaviour only.
import { parse, parseDocument, isAlias, isMap, isSeq, isScalar } from "yaml";

const WF = "on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n";

const SHAPES = {
  // --- R18 family (8 shapes) ---
  "F1-flow-alias-after": "&w:2 a: 1\nm: {a: 1, *w:2}\n" + WF,
  "F2-plain-alias-after": "&w a: 1\nm: {a: 1, *w}\n" + WF,
  "F3-alias-first": "&w a: 1\nm: {*w, a: 1}\n" + WF,
  "F4-alias-twice": "&w a: 1\nm: {*w, *w}\n" + WF,
  "F5-nested-flow": "&w:2 a: 1\nm: {x: {a: 1, *w:2}}\n" + WF,
  "F6-absorbed-first": "&w:2 a: 1\nm: {*w:2, a: 1}\n" + WF,
  "F7-triple-colon": "&w:2:3 a: 1\nm: {a: 1, *w:2:3}\n" + WF,
  "F8-trailing-comment": "&w:2 a: 1\nm: {a: 1, *w:2} # c\n" + WF,
  // --- controls (must stay MATCH) ---
  "B1-valued-first": "&w a: 1\nm: {*w: 1, a: 1}\n" + WF,
  "B2-valued-twice": "&w a: 1\nm: {*w: 1, *w: 2}\n" + WF,
  "B3-block-valued": "&w a: 1\nm:\n  a: 1\n  *w: 1\n" + WF,
  "B4-other-scalar": "&w a: 1\nm: {b: 2, *w}\n" + WF,
  "B5-alias-alone": "&w a: 1\nm: {*w}\n" + WF,
  "B6-alias-value": "&w a: 1\nb: *w\n" + WF,
  "B7-plain-dup": "m: {a: 1, a: 2}\n" + WF,
  // --- unknowns to probe before fixing ---
  "B8-block-null-after": "&w a: 1\nm:\n  a: 1\n  *w\n" + WF,
  "B9-block-null-first": "&w a: 1\nm:\n  *w\n  a: 1\n" + WF,
  "B10-block-null-absorbed": "&w:2 a: 1\nm:\n  a: 1\n  *w:2\n" + WF,
  "B11-int-anchor": "&w 1\nm: {1: x, *w}\n" + WF,
  "B12-int-vs-quoted": "&w 1\nm: {'1': x, *w}\n" + WF,
  "B13-bool-anchor": "&w True\nm: {true: x, *w}\n" + WF,
  "B14-bool-vs-int": "&w True\nm: {1: x, *w}\n" + WF,
  "B15-null-anchor": "&w ~\nm: {null: x, *w}\n" + WF,
  "B16-quoted-anchor": "&w 'a'\nm: {a: x, *w}\n" + WF,
  "B17-tagged-anchor": "&w !!str 1\nm: {1: x, *w}\n" + WF,
  "B18-nan-anchor": "&w .nan\nm: {.nan: x, *w}\n" + WF,
  "B19-alias-twice-spread": "&w a: 1\nm: {*w, b: 2, *w}\n" + WF,
  "B20-flow-in-seq": "&w a: 1\nm: [{a: 1, *w}]\n" + WF,
  "B21-on-alias-dup": "&w push\non: {*w, push: {}}\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
  "B22-anchor-in-flow": "m: {&w a: 1, *w}\n" + WF,
  "B23-forward-ref": "m: {*w, a: 1}\n&w a: 1\n" + WF,
  "B24-alias-to-collection": "x: &a {b: c}\nm: {a: 1, *a}\n" + WF,
  "B25-chained-alias": "&a x\n&b *a\nm: {x: 1, *b}\n" + WF,
};

function describeKey(doc, key) {
  if (isAlias(key)) {
    let resolved;
    try { resolved = key.resolve(doc); } catch (e) { resolved = `THROW ${e.message}`; }
    const r = resolved === undefined ? "undefined"
      : isScalar(resolved) ? `Scalar(${JSON.stringify(resolved.value)})`
      : isMap(resolved) ? "Map" : isSeq(resolved) ? "Seq"
      : isAlias(resolved) ? `Alias(${resolved.source})` : typeof resolved;
    return `Alias(source=${JSON.stringify(key.source)}) -> ${r}`;
  }
  if (isScalar(key)) return `Scalar(${JSON.stringify(key.value)}, type=${key.type})`;
  return `${key?.constructor?.name ?? typeof key}`;
}

for (const [name, text] of Object.entries(SHAPES)) {
  let parseErr = null, parsed = null;
  try { parsed = parse(text); } catch (e) { parseErr = e.message.split("\n")[0]; }
  let doc = null, docErrs = null;
  try {
    doc = parseDocument(text);
    docErrs = doc.errors.map((e) => `${e.code}: ${e.message.split("\n")[0]}`);
  } catch (e) { docErrs = [`THROW ${e.message.split("\n")[0]}`]; }
  // find all maps and their keys
  const maps = [];
  const walk = (node, path) => {
    if (isMap(node)) {
      maps.push(`${path} flow=${!!node.flow} keys=[${node.items.map((p) => describeKey(doc, p.key)).join(" | ")}]`);
      for (const p of node.items) { walk(p.key, path + ".k"); walk(p.value, path + ".v"); }
    } else if (isSeq(node)) {
      node.items.forEach((it, i) => walk(it, `${path}[${i}]`));
    }
  };
  if (doc) walk(doc.contents, "root");
  console.log(`=== ${name} ===`);
  console.log(`  parse(): ${parseErr ? "THROW " + parseErr : "OK " + JSON.stringify(parsed?.m ?? parsed?.on ?? "")}`);
  console.log(`  parseDocument errors: ${JSON.stringify(docErrs)}`);
  for (const m of maps) console.log(`  ${m}`);
}
