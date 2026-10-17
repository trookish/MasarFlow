# P9.T21 — 10-minute memory soak (packaged build)

**Verdict: PASS** — the packaged app stayed inside every memory budget for a
full 10.1 minutes of idle time with a demo project open, then shut down
cleanly (exit code 0).

- Evidence: `reports/p9/perf-memory-10min.json` (machine-readable; written by
  the spec itself, persisted after every 30-second sample so an unexpected
  app death cannot lose the timeline).
- Spec: `tests/e2e/desktop/soak.spec.ts` (`@slow`; run via
  `pnpm e2e:desktop:slow tests/e2e/desktop/soak.spec.ts` with
  `MASARFLOW_E2E_APP_DIR` pointing at a packaged `win-unpacked` directory).
- Run: 2026-10-17, started `12:35:28Z`, ended `12:45:32Z` (~10.1 min).
- Snapshot under test: a private copy of the wave-11 packaged build at
  `%LOCALAPPDATA%\Temp\msf-e2e-d-soak\win-unpacked`, made before the run so
  that later builds cannot mutate the binary under test.

## Measurements

| Sample | Main RSS | Renderer heap |
| ------ | -------- | ------------- |
| `at2` (+120 s, real wait) | 112 MB | 24 MB |
| `at10` (+600 s) | 112 MB | 24 MB |
| Growth (2 → 10 min) | 0% | 0% |

Budgets (from `tests/e2e/desktop/perf-budgets.ts`): main RSS ≤ 600 MB,
renderer heap ≤ 400 MB, 2→10 min growth ≤ 25%. All comfortably met; the
30-second series (20 samples) is flat at 112/24 MB after boot settling
(131 MB at +30 s dropping to 114 MB at +60 s).

## Diagnostics

The spec instruments the run so a mid-run death leaves evidence:

- Electron `render-process-gone` / `child-process-gone` listeners — no events
  fired during the entire run (every sample records `gone: []`).
- Main-process stdout/stderr captured; nothing abnormal (only Electron's
  own Node-debugger help lines on stderr).
- Process exit recorded: `code 0, signal null` at `+604 s` (clean shutdown).
- Page `crash` / `close` listeners: no crash; the single `close` at `+600 s`
  is the spec's own teardown.

## Context: the earlier 4.6-minute exit

A first soak attempt on an earlier packaged snapshot died at ~4.6 min
(`Target page, context or browser has been closed`) with no crash event and no
external kill found. The instrumented rerun above ran on a later rebuild and
**did not reproduce** the exit: no page close, no crash events, flat memory,
clean exit. The original death remains unattributed (that run predates the
instrumentation, so it left no crash evidence); it is not reproducible on the
current snapshot under the same conditions.

## Load caveat

The run happened while sibling agents were building/testing on the same
machine, so the measurements are pessimistic (concurrent CPU/IO load). Memory
figures were unaffected in practice — the series is flat.
