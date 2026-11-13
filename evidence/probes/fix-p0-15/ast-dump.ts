// AST dump for FIX-P0-15 (C3 boundary): print the parsed document
// structure with key node types, values, tags and ranges.
// Usage: esbuild this file, then `node ast-dump.cjs <file.yml>`.
import { parseDocument, isMap, isScalar, isSeq } from "yaml";
import * as fs from "node:fs";

const text = fs.readFileSync(process.argv[2], "utf-8");
const doc = parseDocument(text);
function show(node: unknown, indent: string): void {
  if (isMap(node)) {
    console.log(`${indent}Map`);
    for (const pair of node.items) {
      const k: any = pair.key;
      console.log(
        `${indent}  key: type=${isScalar(k) ? k.type : typeof k} value=${JSON.stringify(isScalar(k) ? k.value : null)} tag=${k?.tag ?? "?"} range=${JSON.stringify(k?.range ?? null)} anchor=${k?.anchor ?? null}`,
      );
      show(pair.value, indent + "    ");
    }
  } else if (isSeq(node)) {
    console.log(`${indent}Seq`);
    for (const item of node.items) show(item, indent + "  ");
  } else if (isScalar(node)) {
    console.log(`${indent}Scalar type=${node.type} value=${JSON.stringify(node.value)} tag=${node.tag} range=${JSON.stringify(node.range)} anchor=${node.anchor ?? null}`);
  } else {
    console.log(`${indent}${typeof node} ${JSON.stringify(node)}`);
  }
}
show(doc.contents, "");
