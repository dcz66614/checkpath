import * as YAML from "yaml";
const shapes = {
  "e-nested-block": "&x:\n  &y: 1\n",
  "e-nested-flow": "&x: {&y: 1}\n",
  "e-nested-block-2pair": "&x:\n  &y: 1\n  z: 2\n",
  "b-2anchor-scalar": "&x: &y 1\n",
  "b-2anchor-in-wf": "m: {a: &x &y 1}\nname: probe\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
  "a-on-jobs": "&x:\n  on: push\n  jobs:\n    test:\n      runs-on: ubuntu-latest\n      steps:\n        - run: echo hi\n",
  "c-tagkey-in-wf": "!foo &x: 1\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
};
for (const [k, v] of Object.entries(shapes)) {
  try {
    const d = YAML.parse(v);
    console.log(k, "=> OK:", JSON.stringify(d));
  } catch (e) {
    console.log(k, "=> THROW:", String(e.message).split("\n")[0]);
  }
}
