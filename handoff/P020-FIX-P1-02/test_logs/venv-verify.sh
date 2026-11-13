#!/bin/bash
# P2-4 re-verification log generator (re-runnable). Runs the Oracle parse
# probe over all 80 golden workflow YAMLs with the system interpreter
# (PyYAML 6.0.1) and with the independent venv (PyYAML 6.0.3), then diffs.
set -u
cd ~/workspace/p020-checkpath
echo "HEAD: $(git rev-parse HEAD) $(git rev-parse --short HEAD)"
echo "system python: $(python3 --version) PyYAML $(python3 -c 'import yaml; print(yaml.__version__)')"
echo "venv python: $(/tmp/p020-pyyaml-venv/bin/python --version) PyYAML $(/tmp/p020-pyyaml-venv/bin/python -c 'import yaml; print(yaml.__version__)')"
rm -rf /tmp/p020-pyyaml-verify/re-sys /tmp/p020-pyyaml-verify/re-venv
mkdir -p /tmp/p020-pyyaml-verify/re-sys /tmp/p020-pyyaml-verify/re-venv
n=0
for f in $(find tests/fixtures/golden -name "*.yml" | sort); do
  id=$(echo "$f" | sed 's|tests/fixtures/golden/||; s|/|__|g; s|\.yml$||')
  python3 scripts/oracle-parse-probe.py --yaml "$f" --fixture-id "$id" > /tmp/p020-pyyaml-verify/re-sys/$id.json 2>/dev/null
  /tmp/p020-pyyaml-venv/bin/python scripts/oracle-parse-probe.py --yaml "$f" --fixture-id "$id" > /tmp/p020-pyyaml-verify/re-venv/$id.json 2>/dev/null
  n=$((n+1))
done
echo "probes run: $n per interpreter"
if diff -r /tmp/p020-pyyaml-verify/re-sys /tmp/p020-pyyaml-verify/re-venv > /dev/null; then
  echo "RESULT: IDENTICAL — all $n oracle parse outputs byte-identical between PyYAML 6.0.1 (system) and 6.0.3 (venv)"
else
  echo "RESULT: DIFFERENT — see diff above"; diff -r /tmp/p020-pyyaml-verify/re-sys /tmp/p020-pyyaml-verify/re-venv | head -20
fi
