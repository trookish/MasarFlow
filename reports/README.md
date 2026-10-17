# reports/

Committed evidence for phase gates. One directory per phase (`reports/p9/`, `reports/p10/`).

Rules:
- Files here are *records of runs*, not fixtures. Never edit a past run; add a new file with a date.
- JSON for measurements (`perf-baseline.json`, `a11y/summary.json`), Markdown for narratives and checklists.
- Every claim in a report must name the command that produced it.
- `reports/` is intentionally committed (unlike `test-results/` and `playwright-report/`).
