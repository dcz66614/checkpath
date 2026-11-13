# T014 — deterministic release freezer for P020 CheckPath.
#
# Created by the T014 freeze task: no such script existed before T014
# (package.json referenced it, T012 only rehearsed packaging via
# release-verify.mjs). This script is release tooling, not product code:
# it never modifies src/, oracle/, tests/ fixtures, or any evidence
# file. All frozen inputs are read from the reviewed candidate commit
# (HEAD, expected 933dd35); the working tree is only used for the fresh
# `npm run build` that produces dist/ (and the script refuses to run
# if any build input is modified vs HEAD).
#
# Packaging contract (IMPLEMENTATION_PLAN §3, §6 T014, §8.3):
#   - Python stdlib zipfile only; entries sorted by path; explicit
#     directory entries; fixed timestamp (1980-01-01, the ZIP epoch —
#     no current time); fixed permissions (files 0644, dirs 0755);
#     ZIP_DEFLATED level 9.
#   - source.zip = the exact HEAD tree (every `git ls-files` entry,
#     content read from HEAD via `git cat-file --batch`) PLUS the
#     freezer script itself (scripts/deterministic-zip.py), even when
#     it is untracked at HEAD — see FIX-P1-02 below. No .git,
#     node_modules, dist/, reports/ or other untracked content.
#
# FIX-P1-02 (final review R1, 2026-11-08): the original freezer built
# source.zip purely from `git ls-files` at the candidate commit
# 933dd35 — but this script did not exist in that tree: it was created
# during T014 itself and was still untracked when the freeze ran, so
# `git ls-files` never listed it and source.zip silently omitted it,
# even though package.json declares
# `release:freeze: python3 scripts/deterministic-zip.py --freeze` and
# the manifest recorded only the script's SHA-256 (33b026f3…). A clean
# extraction therefore could not re-run the freeze (exit 2, file not
# found). The dirty-check had explicitly *allowed* the untracked
# script (it is the freezer itself) but nothing *included* it — that
# allow-without-include gap is the root cause. Fix: the freezer always
# includes the exact bytes of the script file executing the freeze
# (working-tree bytes when untracked, HEAD bytes when tracked — the
# dirty-check still refuses a tracked-but-modified script, so the two
# can never disagree), and the manifest records the inclusion. A
# release tool that cannot reproduce itself is not a deliverable.
# Follow-up (same task, found by the R1 trial freeze): the original
# `read_head_files` wrote ALL `git cat-file --batch` queries before
# reading any response — that deadlocks once the queries exceed the
# stdin pipe buffer (~64 KiB; 1,203 files / 71,022 bytes at 11f2fc0).
# It now writes one query and reads its response before the next. At
# T014 (1,144 files) the queries happened to fit, so the bug was latent.
#
# P2-R3-2 (T013 round 3, 2026-11-08): the formal re-freeze manifest
# hardcoded only t013_review_r2 in inputs, so the R3 re-review (which
# cleared the two final-review R1 P1 blockers) was not recorded. The
# manifest now records t013_review_r3 alongside t013_review_r2 (both
# hashed from HEAD), and known_limitations carries the three new R3
# P2s (R3-1 residual True:/true: divergence, R3-2 this fix, R3-3 the
# by-design clean-dir-without-.git freeze limitation).
#   - dist.zip = fresh `npm run build` output (checkpath.mjs at the
#     root) + the single vendored runtime dependency (see F-T014-01
#     below) + synthetic examples + offline HTML assets
#     (dist/index.html + dist/assets/) + QUICKSTART.md +
#     LICENSE_STATUS.md + THIRD_PARTY_NOTICES.md. No source maps (the
#     build emits none; the script fails if any *.map appears).
#
# F-T014-01 (freeze-discovered defect, found by the T014 U-02 check):
# the first frozen dist.zip could NOT run standalone: dist/core/*.js
# imports the `yaml` npm package (`from "yaml"`, the only bare package
# import in dist/), and the bundle shipped no node_modules, so
# `node checkpath.mjs demo` died with ERR_MODULE_NOT_FOUND outside
# the repo. The in-repo `release:verify` never caught this because it
# runs dist/ with the repo's node_modules present. Fix, packaging-only
# (no product code, fixture, doc or source.zip change): dist.zip
# vendors the exact locked runtime dependency — node_modules/yaml
# 2.9.1, package.json + LICENSE + dist/**/*.js only (74 JS files;
# browser build, .d.ts, bin.mjs and README excluded as unused at
# runtime) — so the bundle runs with Node.js 24.x alone, as the README
# promises. The installed version is asserted to equal the lockfile
# version; anything else fails the freeze.
#   - SHA256SUMS.txt records source.zip, dist.zip and
#     RELEASE_MANIFEST.json (GNU `sha256sum -c` format). The manifest
#     itself is never self-hashed.
#   - No absolute paths, machine usernames or current timestamps are
#     embedded in entry names or metadata. NOTE (disclosed): source.zip
#     faithfully archives the reviewed HEAD tree, whose historical
#     evidence/log files (e.g. evidence/environment/ENVIRONMENT_REPORT.md,
#     handoff test logs) contain absolute workspace paths as *text* —
#     that is part of the T013-reviewed commit and T014 must not alter
#     it. The no-absolute-path rule is satisfied at the archive level
#     (relative entry names, fixed metadata) and at the content level
#     for dist.zip, whose files contain no local absolute path.
#
# Usage:
#   python3 scripts/deterministic-zip.py --freeze [--trial]
#   python3 scripts/deterministic-zip.py --verify release/source.zip
#   python3 scripts/deterministic-zip.py --verify release/dist.zip
#
# --trial marks the run as a trial-validation freeze (FIX-P1-02): the
# manifest records freeze_status TRIAL and the artifacts must NOT be
# presented as the formal T014 (re-)freeze. `npm run release:freeze`
# stays the formal path (no --trial).
#
# Exit 0 only when every check passes; any failure prints FAIL and
# exits 1 without writing partial release artifacts.

import hashlib
import json
import os
import subprocess
import sys
import zipfile

EXPECTED_COMMIT = "933dd354e109436551ba40b96d5b4a2d83b839a6"
# FIX-P1-02: EXPECTED_COMMIT is the T013-reviewed candidate that the
# post-R1 fix commits build on — NOT necessarily the commit being
# frozen. do_freeze accepts HEAD == EXPECTED_COMMIT, or any descendant
# of it, and records the actual HEAD as source_commit in the manifest
# (the original exact-match gate would refuse every post-fix freeze).
# HEAD must still be a descendant: freezing an unrelated tree fails.
FREEZER_SCRIPT = "scripts/deterministic-zip.py"
FIXED_DATE = (1980, 1, 1, 0, 0, 0)
FILE_MODE = 0o644
DIR_MODE = 0o755
COMPRESSLEVEL = 9

# Paths whose working-tree state affects the build or the dist.zip
# inputs; any modification vs HEAD is a freeze failure. Generated
# evidence / handoff / reports drift is not a build input.
BUILD_INPUT_PATHSPECS = [
    "src", "oracle", "scripts", "examples",
    "package.json", "package-lock.json",
    "tsconfig.json", "tsconfig.cli.json", "vite.config.ts",
    "eslint.config.mjs", "README.md", "LICENSE_STATUS.md",
    "THIRD_PARTY_NOTICES.md", "REVIEW_INDEX.md", ".gitignore", ".npmrc",
]

# Tracked example files bundled into dist.zip (synthetic data only).
DIST_EXAMPLE_PATHS = [
    "examples/repo-basic/.github/workflows/ci.yml",
    "examples/required-checks.yml",
    "examples/scenarios/merge-group.json",
    "examples/scenarios/pr-docs-only.json",
    "examples/scenarios/pr-src-only.json",
    "examples/suites/merge-queue.json",
]

DIST_DOC_PATHS = ["LICENSE_STATUS.md", "THIRD_PARTY_NOTICES.md"]

# F-T014-01: the single runtime dependency of the built CLI, vendored
# into dist.zip so the bundle runs with Node.js alone. Only the files
# reachable from the "yaml" export at runtime: package.json, LICENSE
# and dist/**/*.js. Version must equal the lockfile pin.
VENDORED_DEP_NAME = "yaml"
VENDORED_DEP_DIR = "node_modules/yaml"

QUICKSTART_MD = """# CheckPath — Quick Start (release bundle)

Deterministic GitHub Actions required-check coverage simulator.
Local CLI + offline HTML report. No network, no token, no Docker,
no real repository needed for the demo.

## Requirements

- Node.js 24.x only (no `npm ci`, no dependencies to install).
  The bundle vendors its single runtime dependency (`yaml` 2.9.1,
  see `THIRD_PARTY_NOTICES.md`); nothing else to install.

## Demo (built-in synthetic data)

```sh
node checkpath.mjs demo
```

Writes `reports/demo/report.json` + `report.html`. The demo exits
with code **2** — that is the gate outcome for the demo scenario
(its required checks are `PENDING_NOT_REPORTED`), not a failure.

## Analyze your own repo

```sh
node checkpath.mjs analyze --repo examples/repo-basic --scenario examples/scenarios/pr-docs-only.json --required-checks examples/required-checks.yml --out reports/pr-docs-only
```

## Coverage matrix over a suite

```sh
node checkpath.mjs matrix --repo examples/repo-basic --suite examples/suites/merge-queue.json --required-checks examples/required-checks.yml --out reports/merge-queue
```

## Exit codes

- `0` — all required checks reportable (gate green)
- `2` — some required check is pending / ambiguous / unknown (gate outcome)
- `3` — invalid input (bad workflow, scenario or manifest)

Inputs are plain local files: `.github/workflows/*.yml` / `*.yaml`
in `--repo`, a `checkpath.scenario/v1` JSON scenario, and a
`checkpath.required-checks/v1` YAML list. Changed files come from
the scenario — CheckPath never computes a server-side diff, never
accesses the network, and never reads anything else from your machine.

## License

License status: `PENDING_SAM_DECISION` (see `LICENSE_STATUS.md`).
No license has been selected; do not redistribute as licensed work.
"""


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def run(cmd, cwd, input_bytes=None):
    r = subprocess.run(cmd, cwd=cwd, input=input_bytes,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode != 0:
        fail(f"command failed ({r.returncode}): {' '.join(cmd)}\n"
             f"{r.stderr.decode('utf-8', 'replace')}")
    return r.stdout


def sha256_hex(data):
    return hashlib.sha256(data).hexdigest()


def repo_root():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def git_head_commit(root):
    return run(["git", "rev-parse", "HEAD"], root).decode().strip()


def git_ls_files(root):
    out = run(["git", "ls-files", "-z"], root)
    names = [p for p in out.split(b"\0") if p]
    if any(b"\n" in p for p in names):
        fail("tracked filename contains a newline; cannot freeze deterministically")
    return [p.decode("utf-8") for p in names]


def read_head_files(root, paths):
    """Read the HEAD content of each path via one `git cat-file --batch`.

    One query is written and its response fully read before the next
    query is written. Writing ALL queries first deadlocks once the
    queries exceed the stdin pipe buffer (~64 KiB): the parent blocks
    writing while git blocks writing responses nobody is reading yet.
    FIX-P1-02: hit during the R1 trial freeze — 1,203 tracked files,
    71,022 query bytes. At T014 (1,144 files) the queries happened to
    fit the buffer, so the bug was latent; tree growth crossed it.
    """
    proc = subprocess.Popen(["git", "cat-file", "--batch"],
                            cwd=root, stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE)
    result = {}
    for p in paths:
        proc.stdin.write(f"HEAD:{p}\n".encode("utf-8"))
        proc.stdin.flush()
        header = proc.stdout.readline().decode("utf-8", "replace").rstrip("\n")
        parts = header.split(" ")
        if len(parts) != 3 or parts[1] == "missing":
            proc.kill()
            fail(f"cannot read HEAD content of {p}: {header}")
        size = int(parts[2])
        data = proc.stdout.read(size)
        proc.stdout.read(1)  # trailing LF after the blob
        if len(data) != size:
            proc.kill()
            fail(f"short read for HEAD content of {p}")
        result[p] = data
    proc.stdin.close()
    proc.wait()
    if proc.returncode != 0:
        fail("git cat-file --batch exited non-zero")
    return result


def read_head_file_optional(root, path):
    """HEAD content of one path, or None if the path is not in HEAD.

    Unlike read_head_files this never fails: the release manifest may
    legitimately be absent (first-ever freeze), and a missing manifest
    just means there is no freeze history to carry forward.
    """
    r = subprocess.run(["git", "show", f"HEAD:{path}"], cwd=root,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode != 0:
        return None
    return r.stdout


def zip_info(name, is_dir):
    info = zipfile.ZipInfo(filename=name, date_time=FIXED_DATE)
    mode = DIR_MODE if is_dir else FILE_MODE
    info.external_attr = (mode & 0xFFFF) << 16
    info.create_system = 3  # Unix
    info.compress_type = zipfile.ZIP_DEFLATED
    return info


def write_deterministic_zip(path, entries):
    """entries: list of (archive_path, bytes). Sorted, fixed metadata."""
    names = [n for n, _ in entries]
    if names != sorted(names):
        fail(f"entries for {path} are not sorted")
    if len(set(names)) != len(names):
        fail(f"duplicate entries for {path}")
    dirs = set()
    for name, _ in entries:
        parent = os.path.dirname(name)
        while parent:
            dirs.add(parent + "/")
            parent = os.path.dirname(parent.rstrip("/"))
    all_entries = [(d, None) for d in sorted(dirs)] + list(entries)
    all_entries.sort(key=lambda e: e[0])
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED,
                         compresslevel=COMPRESSLEVEL) as zf:
        for name, data in all_entries:
            zf.writestr(zip_info(name, data is None),
                        b"" if data is None else data)


def dist_tree(root):
    dist = os.path.join(root, "dist")
    out = []
    for dirpath, dirnames, filenames in os.walk(dist):
        dirnames.sort()
        for fn in sorted(filenames):
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, dist).replace(os.sep, "/")
            with open(full, "rb") as f:
                out.append((rel, f.read()))
    out.sort(key=lambda e: e[0])
    return out


def check_no_local_paths(root, entries, zip_name):
    bad = []
    for name, data in entries:
        for marker in (b"/home/", b"/root/", b"C:\\Users\\", b"C:/Users/"):
            if marker in data:
                bad.append(f"{zip_name}:{name} contains {marker!r}")
    if bad:
        fail("local absolute path found in dist bundle content:\n" + "\n".join(bad))


def do_freeze(root, trial=False):
    head = git_head_commit(root)
    if head == EXPECTED_COMMIT:
        print(f"HEAD commit: {head} (release candidate)")
    else:
        # FIX-P1-02: post-R1 fix commits land on top of the reviewed
        # candidate; freeze them, but only if they descend from it.
        ancestor = subprocess.run(
            ["git", "merge-base", "--is-ancestor", EXPECTED_COMMIT, head],
            cwd=root)
        if ancestor.returncode != 0:
            fail(f"HEAD is {head}, not the release candidate "
                 f"{EXPECTED_COMMIT} nor a descendant of it; refusing to "
                 f"freeze an unrelated tree")
        print(f"HEAD commit: {head} (descendant of reviewed candidate "
              f"{EXPECTED_COMMIT[:7]}; recorded as source_commit)")

    # Tracked modifications to build inputs are a freeze failure.
    # Untracked files are ignored, except under src/, oracle/ and
    # examples/ (an untracked file there would change the build or the
    # bundled examples) — the freezer script itself
    # (scripts/deterministic-zip.py) is untracked by design at T014
    # time and is explicitly allowed. FIX-P1-02: allowing it is not
    # enough — it must also be *included* in source.zip (see the
    # source-tree step below); allowing without including was the R1
    # P1-2 defect.
    status = run(["git", "status", "--porcelain", "--"]
                 + BUILD_INPUT_PATHSPECS, root).decode()
    bad = []
    for line in status.splitlines():
        code, path = line[:2], line[3:]
        if code.strip() == "??":
            if path.split("/")[0] in ("src", "oracle", "examples"):
                bad.append(line)
        elif code.strip():
            bad.append(line)
    if bad:
        fail("build inputs modified vs HEAD; freeze refuses to run:\n"
             + "\n".join(bad))
    print("build inputs clean vs HEAD")

    # --- source.zip: exact HEAD tree + the freezer script itself -----
    tracked = git_ls_files(root)
    head_files = read_head_files(root, tracked)
    source_entries = [(p, head_files[p]) for p in sorted(tracked)]
    # FIX-P1-02 (R1 P1-2 root cause): source.zip was built purely from
    # `git ls-files`, so the freezer script — created during T014 and
    # untracked at the candidate commit — was silently omitted. Always
    # include the exact script file executing this freeze: HEAD bytes
    # when tracked (the dirty-check above already refuses a
    # tracked-but-modified script, so HEAD and working tree agree), or
    # working-tree bytes when untracked. The manifest's freezer.sha256
    # is computed from the same file (__file__), so the recorded hash
    # always matches the bytes inside source.zip.
    if FREEZER_SCRIPT not in head_files:
        with open(os.path.join(root, FREEZER_SCRIPT), "rb") as f:
            script_bytes = f.read()
        source_entries.append((FREEZER_SCRIPT, script_bytes))
        source_entries.sort(key=lambda e: e[0])
        print(f"freezer script untracked at HEAD; including working-tree "
              f"{FREEZER_SCRIPT} ({len(script_bytes)} bytes) in source.zip")
    else:
        print(f"freezer script tracked at HEAD; included from HEAD tree")
    print(f"source tree: {len(source_entries)} files "
          f"({len(tracked)} tracked at HEAD"
          f"{' + freezer script' if FREEZER_SCRIPT not in head_files else ''})")

    # --- dist.zip: fresh build + HEAD examples/docs + quick start --------
    print("running npm run build ...")
    run(["npm", "run", "build"], root)
    dist_entries = dist_tree(root)
    if not any(n == "checkpath.mjs" for n, _ in dist_entries):
        fail("fresh build produced no dist/checkpath.mjs")
    if any(n.endswith(".map") for n, _ in dist_entries):
        fail("build emitted source maps; dist.zip must not contain them")
    print(f"dist tree: {len(dist_entries)} files")
    check_no_local_paths(root, dist_entries, "dist.zip")
    # F-T014-01: vendor the locked `yaml` runtime dependency.
    lock_pre = json.loads(read_head_files(root, ["package-lock.json"])
                          ["package-lock.json"])
    want_ver = lock_pre["packages"]["node_modules/yaml"]["version"]
    vendor_dir = os.path.join(root, VENDORED_DEP_DIR)
    vendor_pkg = json.loads(open(os.path.join(vendor_dir, "package.json"),
                                 encoding="utf-8").read())
    if vendor_pkg.get("version") != want_ver:
        fail(f"installed yaml is {vendor_pkg.get('version')}, "
             f"lockfile pins {want_ver}; freeze refuses to vendor it")
    vendor_entries = []
    for name in ("package.json", "LICENSE"):
        with open(os.path.join(vendor_dir, name), "rb") as f:
            vendor_entries.append((f"node_modules/yaml/{name}", f.read()))
    yaml_dist = os.path.join(vendor_dir, "dist")
    for dirpath, dirnames, filenames in os.walk(yaml_dist):
        dirnames.sort()
        for fn in sorted(filenames):
            if not fn.endswith(".js"):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, vendor_dir).replace(os.sep, "/")
            with open(full, "rb") as f:
                vendor_entries.append((f"node_modules/yaml/{rel}", f.read()))
    vendor_entries.sort(key=lambda e: e[0])
    check_no_local_paths(root, vendor_entries, "dist.zip")
    print(f"vendored runtime dependency: yaml {want_ver} "
          f"({len(vendor_entries)} files: package.json + LICENSE + "
          f"{len(vendor_entries) - 2} dist/*.js)")
    extra = read_head_files(root, DIST_EXAMPLE_PATHS + DIST_DOC_PATHS)
    dist_zip_entries = sorted(
        dist_entries
        + vendor_entries
        + [(p, extra[p]) for p in DIST_EXAMPLE_PATHS + DIST_DOC_PATHS]
        + [("QUICKSTART.md", QUICKSTART_MD.encode("utf-8"))],
        key=lambda e: e[0],
    )
    print(f"dist.zip entries: {len(dist_zip_entries)} "
          f"({len(dist_entries)} built + {len(vendor_entries)} vendored yaml "
          f"+ {len(DIST_EXAMPLE_PATHS)} examples "
          f"+ {len(DIST_DOC_PATHS)} docs + QUICKSTART.md)")

    release_dir = os.path.join(root, "release")
    os.makedirs(release_dir, exist_ok=True)
    source_zip = os.path.join(release_dir, "source.zip")
    dist_zip = os.path.join(release_dir, "dist.zip")
    write_deterministic_zip(source_zip, source_entries)
    write_deterministic_zip(dist_zip, dist_zip_entries)

    with open(source_zip, "rb") as f:
        source_sha = sha256_hex(f.read())
    with open(dist_zip, "rb") as f:
        dist_sha = sha256_hex(f.read())

    # --- manifest inputs (all read from HEAD) -----------------------------
    meta_paths = [
        "evidence/tests/ORACLE_PARITY_REPORT.json",
        "evidence/S0_GATE.json",
        "evidence/review/INDEPENDENT_REVIEW_R3.md",
        "evidence/review/INDEPENDENT_REVIEW_R2.md",
        "evidence/review/INDEPENDENT_REVIEW.md",
        # P2-R6-1 (T014 R3 re-freeze): the manifest used to record
        # only t013_review_r1/r2/r3. The R4–R19 reviews are now
        # recorded as well; verdicts/p0/p1/p2 below were read from
        # each review file's verdict line (see T013_REVIEW_VERDICTS).
        "evidence/review/INDEPENDENT_REVIEW_R4.md",
        "evidence/review/INDEPENDENT_REVIEW_R5.md",
        "evidence/review/INDEPENDENT_REVIEW_R6.md",
        "evidence/review/INDEPENDENT_REVIEW_R7.md",
        "evidence/review/INDEPENDENT_REVIEW_R8.md",
        "evidence/review/INDEPENDENT_REVIEW_R9.md",
        "evidence/review/INDEPENDENT_REVIEW_R10.md",
        "evidence/review/INDEPENDENT_REVIEW_R11.md",
        "evidence/review/INDEPENDENT_REVIEW_R12.md",
        "evidence/review/INDEPENDENT_REVIEW_R13.md",
        "evidence/review/INDEPENDENT_REVIEW_R14.md",
        "evidence/review/INDEPENDENT_REVIEW_R15.md",
        "evidence/review/INDEPENDENT_REVIEW_R16.md",
        "evidence/review/INDEPENDENT_REVIEW_R17.md",
        "evidence/review/INDEPENDENT_REVIEW_R18.md",
        "evidence/review/INDEPENDENT_REVIEW_R19.md",
        "package.json",
        "package-lock.json",
    ]
    meta = read_head_files(root, meta_paths)
    parity = json.loads(meta["evidence/tests/ORACLE_PARITY_REPORT.json"])
    gate = json.loads(meta["evidence/S0_GATE.json"])
    pkg = json.loads(meta["package.json"])
    lock = json.loads(meta["package-lock.json"])
    node_ver = run(["node", "--version"], root).decode().strip()
    npm_ver = run(["npm", "--version"], root).decode().strip()
    py_ver = run(["python3", "--version"], root).decode().strip()
    pyyaml_ver = run(["python3", "-c",
                      "import yaml; print(yaml.__version__)"], root).decode().strip()
    with open(os.path.abspath(__file__), "rb") as f:
        freezer_sha = sha256_hex(f.read())

    # --- manifest: freeze history carried forward from HEAD ----------
    # P2-6 (R1): the original T014 manifest recorded only git_commit
    # 933dd35 (the frozen source) while the freeze itself was committed
    # separately as 3e5e145, and the two were never linked in one place.
    # The manifest now records source_commit (the tree frozen) and
    # freeze_commit (the commit that records the freeze artifacts)
    # separately for the CURRENT run, plus a freeze_history of all
    # EARLIER runs carried forward from the HEAD manifest. History
    # deliberately lists only earlier runs — never the current one —
    # so re-running the freeze at the same HEAD reproduces the manifest
    # byte-for-byte (the T014 determinism property). A freeze run cannot
    # know its own future freeze commit hash, so freeze_commit is
    # recorded as PENDING for a formal freeze and as TRIAL for a
    # trial-validation freeze; the committing step records the real hash
    # in evidence/release/T014_FREEZE_REPORT.md (see the addendum there).
    history = []
    prior = None
    prior_raw = read_head_file_optional(root, "release/RELEASE_MANIFEST.json")
    if prior_raw is not None:
        try:
            prior = json.loads(prior_raw)
            if isinstance(prior.get("freeze_history"), list):
                history = list(prior["freeze_history"])
        except (ValueError, TypeError):
            prior = None
    if prior is not None and not history:
        # The original T014 manifest (written by the pre-FIX-P1-02
        # freezer) has no freeze_history field, so seed the chain with
        # its mapping — verified git evidence in
        # evidence/release/T014_FREEZE_REPORT.md §9 (2026-11-08 addendum):
        # source 933dd35 (T013 re-review PASS) frozen by commit 3e5e145.
        history = [{
            "source_commit": "933dd354e109436551ba40b96d5b4a2d83b839a6",
            "freeze_commit": "3e5e14556f37e78ed411369d3e2324dcad199e20",
            "status": "FORMAL",
        }]
    elif prior is not None:
        # Carry the HEAD manifest's own (top-level) run into history —
        # but only when it froze a DIFFERENT source commit than this
        # run, so a re-run at the same HEAD leaves history (and hence
        # the manifest) unchanged.
        prior_top = {
            "source_commit": prior.get("source_commit") or prior.get("git_commit"),
            "freeze_commit": prior.get("freeze_commit"),
            "status": ("TRIAL" if str(prior.get("freeze_status", "")).startswith("TRIAL")
                       else "FORMAL"),
        }
        if (prior_top["source_commit"] and prior_top["freeze_commit"]
                and prior_top["source_commit"] != head
                and (not history
                     or history[-1].get("source_commit") != prior_top["source_commit"])):
            history.append(prior_top)
    # R3-FINAL-04: close freeze_history entries whose real freeze commit
    # is now known. The R2/R3 manifests recorded their own freeze_commit
    # as PENDING (by design — unknowable at freeze time); the real hashes
    # live in the freeze reports' section 9 addenda (R2: 03c2f16, recorded
    # in T014_FREEZE_REPORT_R2.md section 9; R3: d8ffdeb, recorded in
    # T014_FREEZE_REPORT_R3.md section 9). A later freeze closes them here
    # instead of carrying the PENDING text forward forever. Only entries
    # still reading PENDING are rewritten, so this step is idempotent:
    # re-running the freeze at the same HEAD leaves history (and hence the
    # manifest) unchanged. The CURRENT run's own freeze_commit stays
    # PENDING by the same design and is recorded in the new freeze
    # report's section 9 after committing.
    KNOWN_FREEZE_COMMITS = {
        "538c669e11a383aa0554d05239e298cf34aadd4d":
            "03c2f168a40b114ff1a0f408fa783f5d5389e15d",
        "3a8337151461b80e4ae50e75ab2edf417f4f9165":
            "d8ffdebb775e5b3241936ec86c11689c51f29bf1",
    }
    for entry in history:
        src = entry.get("source_commit")
        fc = entry.get("freeze_commit", "")
        if (src in KNOWN_FREEZE_COMMITS and isinstance(fc, str)
                and fc.startswith("PENDING")):
            entry["freeze_commit"] = KNOWN_FREEZE_COMMITS[src]
    if trial:
        freeze_commit = ("TRIAL — not a formal T014 freeze; trial-"
                         "validation artifacts only, see "
                         "handoff/P020-FIX-P1-02/TASK_REPORT.md")
        freeze_status = ("TRIAL — FIX-P1-02 trial-freeze validation only; "
                         "NOT the formal T014 re-freeze")
    else:
        freeze_commit = ("PENDING — the commit that records these freeze "
                         "artifacts (created after this freeze run); see "
                         "evidence/release/T014_FREEZE_REPORT.md")
        freeze_status = "FORMAL"

    # P2-R6-1: verdicts for the T013 review rounds R4–R19, read from
    # each review file's verdict line (R4–R18 NOT PASS, R19 PASS).
    # Format: round -> (verdict, p0, p1, p2).
    T013_REVIEW_VERDICTS = {
        4: ("NOT PASS", 1, 0, 6),
        5: ("NOT PASS", 1, 0, 7),
        6: ("NOT PASS", 1, 0, 8),
        7: ("NOT PASS", 1, 0, 8),
        8: ("NOT PASS", 1, 0, 8),
        9: ("NOT PASS", 1, 0, 9),
        10: ("NOT PASS", 1, 0, 10),
        11: ("NOT PASS", 2, 0, 8),
        12: ("NOT PASS", 3, 0, 9),
        13: ("NOT PASS", 1, 0, 9),
        14: ("NOT PASS", 5, 0, 8),
        15: ("NOT PASS", 3, 0, 9),
        16: ("NOT PASS", 2, 0, 9),
        17: ("NOT PASS", 1, 0, 8),
        18: ("NOT PASS", 1, 0, 8),
        19: ("PASS", 0, 0, 8),
    }
    t013_reviews_r4_r19 = {}
    for rnd, (verdict, p0, p1, p2) in sorted(T013_REVIEW_VERDICTS.items()):
        rpath = f"evidence/review/INDEPENDENT_REVIEW_R{rnd}.md"
        t013_reviews_r4_r19[f"t013_review_r{rnd}"] = {
            "path": rpath,
            "sha256": sha256_hex(meta[rpath]),
            "verdict": verdict,
            "p0": p0,
            "p1": p1,
            "p2": p2,
        }

    manifest = {
        "project_id": "P020",
        "spec_version": "1.0.0",
        "version": pkg.get("version"),
        "git_commit": head,
        "git_commit_short": head[:7],
        # P2-6: source_commit is the frozen tree; freeze_commit is the
        # commit that records the freeze artifacts (see the note above).
        "source_commit": head,
        "source_commit_short": head[:7],
        "freeze_commit": freeze_commit,
        "freeze_status": freeze_status,
        "freeze_history": history,
        "license_status": "PENDING_SAM_DECISION",
        "toolchain": {
            "node": node_ver,
            "npm": npm_ver,
            "python": py_ver,
            "pyyaml": pyyaml_ver,
            "typescript": lock["packages"]["node_modules/typescript"]["version"],
            "vite": lock["packages"]["node_modules/vite"]["version"],
            "vitest": lock["packages"]["node_modules/vitest"]["version"],
            "react": lock["packages"]["node_modules/react"]["version"],
            "yaml": lock["packages"]["node_modules/yaml"]["version"],
        },
        "freezer": {
            "script": "scripts/deterministic-zip.py",
            "sha256": freezer_sha,
            "fixed_timestamp": "1980-01-01T00:00:00Z",
            "compression": "ZIP_DEFLATED level 9",
            "file_mode": "0644",
            "dir_mode": "0755",
        },
        "inputs": {
            "s0_input_fixture_sha256": gate["input_fixture_sha256"],
            "golden_suite_sha256": parity["suite_sha256"],
            "oracle_parity_report": {
                "path": "evidence/tests/ORACLE_PARITY_REPORT.json",
                "sha256": sha256_hex(meta["evidence/tests/ORACLE_PARITY_REPORT.json"]),
                "fixture_count": parity["fixture_count"],
                "oracle_mismatch_count": parity["oracle_mismatch_count"],
                "false_pass_count": parity["false_pass_count"],
            },
            "s0_gate": {
                "path": "evidence/S0_GATE.json",
                "sha256": sha256_hex(meta["evidence/S0_GATE.json"]),
                "status": gate["status"],
                "gate_report_sha256": gate["gate_report_sha256"],
            },
            "t013_review_r3": {
                "path": "evidence/review/INDEPENDENT_REVIEW_R3.md",
                "sha256": sha256_hex(meta["evidence/review/INDEPENDENT_REVIEW_R3.md"]),
                "verdict": "PASS",
                "p0": 0,
                "p1": 0,
                "p2": 3,
            },
            "t013_review_r2": {
                "path": "evidence/review/INDEPENDENT_REVIEW_R2.md",
                "sha256": sha256_hex(meta["evidence/review/INDEPENDENT_REVIEW_R2.md"]),
                "verdict": "PASS",
                "p0": 0,
                "p1": 0,
                "p2": 3,
            },
            "t013_review_r1": {
                "path": "evidence/review/INDEPENDENT_REVIEW.md",
                "sha256": sha256_hex(meta["evidence/review/INDEPENDENT_REVIEW.md"]),
            },
        },
        "artifacts": {
            "source.zip": {
                "sha256": source_sha,
                "file_count": len(source_entries),
                "contents": "exact HEAD tree (git ls-files at the source commit) + the freezer script itself (scripts/deterministic-zip.py, included even when untracked — FIX-P1-02)",
            },
            "dist.zip": {
                "sha256": dist_sha,
                "file_count": len(dist_zip_entries),
                "contents": "fresh build CLI bundle + vendored yaml 2.9.1 runtime (node_modules/yaml: package.json, LICENSE, dist/*.js; F-T014-01) + synthetic examples + offline HTML assets + Quick Start",
                "vendored_runtime_dependency": {
                    "package": "yaml",
                    "version": want_ver,
                    "files": len(vendor_entries),
                    "reason": "F-T014-01: dist/core imports 'yaml'; without it the standalone bundle cannot run (ERR_MODULE_NOT_FOUND). Packaging-only fix; no product code changed.",
                },
            },
        },
        "known_limitations": [
            "P2-R2-1: FIXED in final-review R1 FIX-P1-01 (commit 11f2fc0): expanded static network check now covers the 10 src/core files + oracle/witness.py (45 files, 0 matches).",
            "P2-R2-2: FIXED in final-review R1 FIX-P1-01 (commit 11f2fc0): dup-name fixture added (tests/fixtures/parser-divergence/duplicate-key/dup-name.yml; trigger T6-19 / golden G-83).",
            "P2-R2-3: README performance figures are single-run snapshots (see RELEASE_NOTES.md).",
            "Duplicate-key YAML divergence (ADR FIX-P2/01): FIXED in final-review R1 FIX-P1-01 (commit 11f2fc0): Oracle now also rejects duplicate mapping keys (INVALID / yaml_parse_error), TS and Oracle agree; the ADR FIX-P2/01 known-limitation waiver was superseded by the R1 verdict.",
            "P2-R3-1: RESOLVED by FIX-P0-02 (Oracle _StrictBaseLoader folds True: / true: to one bool key), verified by T013 R4 section 1 (the R2 input now returns INVALID / yaml_parse_error on both sides, MATCH; fixture-locked by tests/fixtures/trigger/T6-20-dup-bool-true, tests/fixtures/parser-divergence/duplicate-key/dup-bool-true.yml case 4, golden G-84). Note: R4 does not cite the label 'P2-R3-1' literally; the closure is of the exact underlying divergence R3 recorded.",
            "P2-R3-2: FIXED by this freezer change (T014 re-freeze): the manifest now records t013_review_r3 alongside t013_review_r2; the R3 review (PASS, P0 0 / P1 0 / P2 3) is hashed in inputs.",
            "P2-R3-3: a literal clean-directory re-run of release:freeze without .git still fails at git rev-parse HEAD — by design (the freeze identifies the frozen tree by commit); the accepted substitute is a fresh-clone re-run, verified byte-identical for the trial freeze (see T014_FREEZE_REPORT_R2.md).",
            "P2-R6-1: FIXED by this freezer change (T014 R3 re-freeze): the manifest now records t013_review_r4..r19 alongside r1/r2/r3 (verdict + p0/p1/p2, hashed from HEAD); the R4–R19 review rounds are no longer unrecorded.",
            "P2-R6-2: PARTIALLY MITIGATED, still open as a historical residual (R3-FINAL-04, 2026-11-10): the R7/R8 self-written review probes lived only in /tmp and were lost in a VM restart (reconstructible only from report text); R9–R19 probes are archived in evidence/probes/r9/–r19/. Non-blocking.",
            "P2-6 (final-review R4): USER=root ZIP-validator false positive — tool defect, NOT a product defect (R3-FINAL-04, 2026-11-10). scripts/deterministic-zip.py do_verify flags any entry name containing the $USER substring; run as root it fails release/source.zip with 5 'username in entry name' FAILs on fixture filenames containing 'root' (e.g. tests/fixtures/parser-divergence/anchored-empty-key/k01-anchored-root.yml). Verified live 2026-11-10: USER=root exits 1 (5 FAILs); USER unset verifies OK. The ZIPs are unaffected. (Not to be confused with final-review R3's P2-6, the false 'hashes unchanged' claim, which GPT revoked in R4.)",
            "Windows PowerShell Quick Start NOT_TESTED (no Windows machine).",
        ],
    }
    # P2-R6-1: merge the R4–R19 review records into inputs (built
    # above from the HEAD review files; the manifest is dumped with
    # sort_keys=True, so key order here does not affect the bytes).
    manifest["inputs"].update(t013_reviews_r4_r19)
    manifest_path = os.path.join(release_dir, "RELEASE_MANIFEST.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        f.write(json.dumps(manifest, indent=2, sort_keys=True,
                           ensure_ascii=False) + "\n")
    with open(manifest_path, "rb") as f:
        manifest_sha = sha256_hex(f.read())

    sums_path = os.path.join(release_dir, "SHA256SUMS.txt")
    with open(sums_path, "w", encoding="utf-8") as f:
        f.write(f"{source_sha}  source.zip\n")
        f.write(f"{dist_sha}  dist.zip\n")
        f.write(f"{manifest_sha}  RELEASE_MANIFEST.json\n")

    print(f"source.zip: {source_sha} ({len(source_entries)} files)")
    print(f"dist.zip:   {dist_sha} ({len(dist_zip_entries)} files)")
    print(f"RELEASE_MANIFEST.json: {manifest_sha}")
    print("freeze OK")


def do_verify(root, zip_path):
    if not os.path.isfile(zip_path):
        fail(f"no such file: {zip_path}")
    problems = []
    with zipfile.ZipFile(zip_path, "r") as zf:
        bad_crc = zf.testzip()
        if bad_crc is not None:
            problems.append(f"CRC failure in entry {bad_crc}")
        infos = zf.infolist()
        names = [i.filename for i in infos]
        if names != sorted(names):
            problems.append("entries are not sorted by path")
        if len(set(names)) != len(names):
            problems.append("duplicate entries")
        user = os.environ.get("USER", "")
        home = os.path.expanduser("~")
        for info in infos:
            name = info.filename
            if name.startswith("/") or name.startswith("\\") or ":" in name.split("/")[0]:
                problems.append(f"absolute/drive entry name: {name}")
            if ".." in name.split("/"):
                problems.append(f"parent traversal in entry name: {name}")
            segments = name.split("/")
            if ".git" in segments:
                problems.append(f"excluded content in zip: {name}")
            if "node_modules" in segments and not (
                name == "node_modules/"
                or name.startswith("node_modules/yaml/")
            ):
                # node_modules is excluded from source.zip; the single
                # exception is the documented vendored yaml runtime in
                # dist.zip (F-T014-01).
                problems.append(f"excluded content in zip: {name}")
            if user and user in name:
                problems.append(f"username in entry name: {name}")
            if home and home in name:
                problems.append(f"home path in entry name: {name}")
            if info.date_time != FIXED_DATE:
                problems.append(f"non-fixed timestamp {info.date_time} in {name}")
            mode = (info.external_attr >> 16) & 0o777
            want = DIR_MODE if info.is_dir() else FILE_MODE
            if mode != want:
                problems.append(f"permission {oct(mode)} != {oct(want)} in {name}")
            if not info.is_dir() and info.compress_type != zipfile.ZIP_DEFLATED:
                problems.append(f"non-DEFLATED entry: {name}")
    if problems:
        for p in problems:
            print(f"FAIL: {p}", file=sys.stderr)
        sys.exit(1)
    print(f"verify OK: {zip_path} ({len(names)} entries, sorted, "
          f"fixed timestamp {FIXED_DATE[0]:04d}-{FIXED_DATE[1]:02d}-{FIXED_DATE[2]:02d}, "
          f"fixed permissions, CRC OK)")
    return 0


def main():
    args = sys.argv[1:]
    root = repo_root()
    if args == ["--freeze"] or args == ["--freeze", "--trial"]:
        do_freeze(root, trial="--trial" in args)
    elif len(args) == 2 and args[0] == "--verify":
        return do_verify(root, args[1])
    else:
        print("Usage:\n"
              "  python3 scripts/deterministic-zip.py --freeze [--trial]\n"
              "  python3 scripts/deterministic-zip.py --verify <zip>",
              file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
