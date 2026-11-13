# PyYAML 6.0.3 venv verification (R1 P2-4)

- **Date:** 2026-11-08
- **Task:** FIX-P1-02 (R1 P2-4) — PyYAML version lock vs test environment.
- **HEAD at verification time:** `3e5e145` (FIX-P1-01 not yet committed;
  Oracle parser is the T014 state, duplicate-key last-wins).
- **License:** `PENDING_SAM_DECISION` (unchanged).

## 1. The discrepancy

- `oracle/requirements.lock.txt` pins `PyYAML==6.0.3`.
- The T014 freeze environment recorded system PyYAML **6.0.1**
  (`evidence/environment/ENVIRONMENT_REPORT.md` §D2: the pinned 6.0.3
  was never installed; system 6.0.1 was deemed usable because the spec
  only requires PyYAML 6.x).
- Final review R1 P2-4 asked for re-verification with an independent
  venv at the locked 6.0.3.

## 2. Method (independent venv, no repo files touched)

```sh
python3 -m venv /tmp/p020-pyyaml-venv
/tmp/p020-pyyaml-venv/bin/pip install "PyYAML==6.0.3"
```

Then, for every workflow YAML in the frozen golden suite (80 files
across 80 fixtures — 64× `workflow.yml`, 6× `workflow-a/b.yml`,
`workflow-invalid/unknown/broken-job.yml`, `workflow-ci.yml`):

```sh
# system interpreter (PyYAML 6.0.1)
/tmp/p020-pyyaml-venv/... # no — system:
python3 scripts/oracle-parse-probe.py --yaml <file> --fixture-id <id>
# venv interpreter (PyYAML 6.0.3)
/tmp/p020-pyyaml-venv/bin/python scripts/oracle-parse-probe.py --yaml <file> --fixture-id <id>
```

`scripts/oracle-parse-probe.py` prints the Reference Oracle's
`parse_workflow_yaml` result as JSON and writes nothing to the repo,
so this comparison touches no evidence file. Full per-file outputs
were kept under `/tmp/p020-pyyaml-verify/` (sys601/, venv603/,
sys601-rest/, venv603-rest/) for the handoff log.

## 3. Results

| Check | Result |
|---|---|
| venv PyYAML version | **6.0.3** (`pip install PyYAML==6.0.3`, wheel from cache) |
| system PyYAML version | 6.0.1 |
| Oracle parse probe, 64× `workflow.yml` | all exit 0; outputs **byte-identical** 6.0.1 vs 6.0.3 |
| Oracle parse probe, remaining 16 workflow YAMLs | all exit 0; outputs **byte-identical** 6.0.1 vs 6.0.3 |
| Total fixtures compared | **80 / 80 identical** (plus a re-run, see §3b) |
| `BaseLoader` keeps `on` as a string key under 6.0.3 | yes (`str`, value `on`) |
| Duplicate-key last-wins under 6.0.3 | `{'name': 'b'}` — identical to 6.0.1 |

## 3b. Re-run (same day, log kept)

The comparison was re-run via `handoff/P020-FIX-P1-02/test_logs/venv-verify.sh`
(log: `venv-verify.log`). By then the parallel FIX-P1-01 executor had
added three new untracked golden fixtures (`G-81/G-82/G-83` duplicate-key
workflows) to the working tree, so the re-run covered **83 files — still
byte-identical** between 6.0.1 and 6.0.3 (including the three new
duplicate-key fixtures, parsed with the pre-FIX-P1-01 Oracle).

## 4. Conclusion

- **No lockfile change needed.** `oracle/requirements.lock.txt`
  (`PyYAML==6.0.3`) is correct as pinned.
- **Environment-record issue only.** The 6.0.1-vs-6.0.3 difference has
  **zero observable effect** on the Oracle: all 80 golden parse outputs
  are byte-identical between the two versions, including the
  duplicate-key last-wins behaviour (that divergence is a property of
  the Oracle parser's use of `BaseLoader`, not of the PyYAML version —
  it is fixed separately by FIX-P1-01, which makes the Oracle reject
  duplicate keys).
- The freeze-time `toolchain.pyyaml` field in `RELEASE_MANIFEST.json`
  records the **freeze environment's system interpreter** (6.0.1 at
  T014). That was accurate for that environment; it is not the pinned
  Oracle dependency. README now states the pin (6.0.3) and points here.
