// R18 parser-layer minimal repro (yaml npm package side).
// Run: node evidence/probes/r18/parser-probe-r18.mjs
import { parse, parseDocument } from "yaml";

const SHAPES = {
  "dup-scalar-first-plain": "&w a: 1\nm: {a: 1, *w}\n",
  "dup-scalar-first-absorbed": "&w:2 a: 1\nm: {a: 1, *w:2}\n",
  "dup-alias-first-plain": "&w a: 1\nm: {*w, a: 1}\n",
  "dup-alias-twice-plain": "&w a: 1\nm: {*w, *w}\n",
  "dup-nested": "&w:2 a: 1\nm: {x: {a: 1, *w:2}}\n",
  "control-valued-first": "&w a: 1\nm: {*w: 1, a: 1}\n",
  "control-diff-scalar": "&w a: 1\nm: {b: 2, *w}\n",
  "control-alias-alone": "&w a: 1\nm: {*w}\n",
};

for (const [name, text] of Object.entries(SHAPES)) {
  const doc = parseDocument(text, { uniqueKeys: true });
  const errs = doc.errors.map((e) => e.message);
  let parsed = null;
  try {
    parsed = JSON.stringify(parse(text, { uniqueKeys: true }));
  } catch (e) {
    parsed = "THROW " + e.message;
  }
  console.log(`${name}: errors=${errs.length} [${errs.join("; ")}] parsed=${parsed}`);
}
