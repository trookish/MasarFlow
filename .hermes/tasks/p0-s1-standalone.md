# P0.T4 — Spike S1: Next standalone + pnpm + electron-builder on Windows

Read `.hermes/tasks/00-shared-context.md` first.

Implement **P0.T4** from `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p0-p1-baseline-desktop-shell.md`, lines 240–300, with these overrides:

- **Do not create or switch to a spike branch.** Work in place on `release/v0.2.0`.
- Edit `next.config.ts` as the plan says. Read `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md` (or locate the equivalent doc with a file search) to confirm `outputFileTracingExcludes` syntax.
- Run `pnpm build` once, capture the real tail of the output and the build time.
- Start the standalone server on port 3123 as the plan shows. Use the Windows temp dir for its log. Check `/dashboard` returns 200 and that a real `/_next/static/...` asset (pick one file from `.next/static/chunks`) returns 200. Stop the server afterwards (find its PID with `netstat -ano | grep 3123`, then `powershell "Stop-Process -Id <pid> -Force"`).
- Measure size (MB) and file count of `.next/standalone`, and whether symlinks exist inside it.
- Electron-builder step: copy with `cpSync(..., {recursive:true, dereference:true})` to `desktop/app-server/`, temporarily add the `extraResources` entry to `desktop/electron-builder.yml`, run `pnpm --dir desktop exec electron-builder --win --dir`, confirm `desktop/dist/win-unpacked/resources/app-server/server.js` exists. Record time taken.
- If a GO criterion fails, try the plan's NO-GO fallbacks in order and record what happened.

**Clean-up (mandatory):**
- `git checkout -- next.config.ts desktop/electron-builder.yml` (P1.T3 re-applies the config properly).
- Delete `desktop/app-server/`, `desktop/dist/`, and `.next/standalone/public` + `.next/standalone/.next/static` copies.
- `git status --short` must show nothing from you except `.hermes/spikes/S1.md`.

**Deliverable:** `.hermes/spikes/S1.md` with: verdict (GO / NO-GO + fallback used), each GO criterion with its measured value, build time, standalone size MB + file count, symlink finding, electron-builder time, any surprises (e.g. traced paths you did not expect — list the top-level dirs inside `.next/standalone`). Do NOT commit; the orchestrator commits.
