# P020 T014-R4 — Unresolved / carried-forward items

- P2-R6-2 — review-probe evidence not all in the repository — PARTIALLY MITIGATED, still open as a historical residual. The R7/R8 self-written probes lived only in /tmp and were lost in a VM restart (reconstructible only from report text); R9–R19 probes are archived in evidence/probes/r9/–r19/. Non-blocking.
- P2-6 (final-review R4) — USER=root ZIP-validator false positive — disclosed tool defect, NOT fixed in this task (one-line follow-up for T014 if wanted: match whole path segments instead of a substring in do_verify). Non-blocking; the ZIPs verify OK under a non-root user.
- This R4 report itself is NOT inside the R4 source.zip (one-generation lag); it is in the freeze commit and Drive 01_release_R4, and enters the frozen package at the next freeze, if any. The R3 report — the one GPT asked for — IS inside the R4 source.zip.
- License still PENDING_SAM_DECISION (Sam to decide).
- Final-review rounds used: 4/5. The next round (round 5) is the LAST in the establishment conversation.
