# P0.T5 — Spike S2: `masarflow://` proxy (streaming, redirect, stable origin)

Read `.hermes/tasks/00-shared-context.md` first.

Implement **P0.T5** from `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p0-p1-baseline-desktop-shell.md`, lines 302–401.

- Create `.hermes/spikes/s2/server.cjs` and `.hermes/spikes/s2/main.cjs` exactly as written, then run Electron twice. The Electron binary is `C:/Users/trookish/Dev/Web-Projects/MasarFlow/desktop/node_modules/.bin/electron.CMD` (or `desktop/node_modules/electron/dist/electron.exe`). Set `S2_OUT` to a Windows path for each run.
- If Electron 43 rejects an option (for example `bypassCustomProtocolHandlers`, or `duplex` with a body), fix it minimally, record the exact error and the fix — that is a key finding for P1.T4.
- If `redirect: "manual"` makes the 307 not get followed by the page, test the alternative (`redirect: "follow"`, or returning the redirect response as-is) and record which one yields `path === "/dashboard"` with `origin === "masarflow://app"`.
- Electron's userData for the spike is per-app-name; make sure both runs use the same userData so the IndexedDB counter test is meaningful (it will be, if you run the same `main.cjs` both times). After you finish, delete the spike's userData directory if you can identify it (`app.getPath("userData")` — print it in run output).

**GO criteria** are in the plan (line 399). Record each with the measured value.

**Clean-up:** delete `.hermes/spikes/s2/` code and run json files after copying the numbers. Nothing else in the repo may change.

**Deliverable:** `.hermes/spikes/S2.md` — verdict, both run JSON blobs verbatim, each criterion with value, any Electron API adjustments needed (exact code that worked for `protocol.handle` + `net.fetch`). Do NOT commit.
