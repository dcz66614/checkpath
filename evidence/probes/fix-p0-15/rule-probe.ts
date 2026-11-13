// Rule probe for FIX-P0-15 (C3 boundary): run the five TS-side
// rejection rules individually on one YAML file and print which fire.
// Usage: esbuild this file, then `node rule-probe.cjs <file.yml>`.
import {
  hasRejectedAnchorOrTag,
  hasUnrepresentableKey,
  hasMultilineFlowKey,
  hasRejectedTagComma,
} from "../../../src/core/workflow-parser.js";
import * as fs from "node:fs";

const text = fs.readFileSync(process.argv[2], "utf-8");
console.log(
  JSON.stringify({
    hasRejectedAnchorOrTag: hasRejectedAnchorOrTag(text),
    hasUnrepresentableKey: hasUnrepresentableKey(text),
    hasMultilineFlowKey: hasMultilineFlowKey(text),
    hasRejectedTagComma: hasRejectedTagComma(text),
  }),
);
