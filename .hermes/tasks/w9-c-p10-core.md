# Wave 9 / Stream C — P10.T1–T7 and T11: app settings IPC, display version, onboarding machine + wizard, diagnostics, tray

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p10-onboarding-release.md`, tasks **P10.T1, T2, T3, T4, T5, T6, T7, T11**. Skip T8 (Control Center, which needs nav/panel files another stream owns) and T9 onward (auto-update, CI, release).

Read the real desktop tree first: `desktop/src/main/{index,settings,secrets,backups,pty,logs}.ts`, `desktop/src/main/ipc/{index,terminal,logs}.ts`, `desktop/src/shared/{channels,api,redact,terminal,git,roots,security}.ts`, `desktop/src/preload/index.ts`. There is no `desktop/src/main/updates.ts` (deleted in P1.T6). Create what T2 needs without resurrecting the launcher's update code. Diagnostics (T6/T7) must reuse `desktop/src/shared/redact.ts` rather than duplicate redaction. No secret value may appear in a diagnostics report: test it with an obvious fake. Secret presence is reported as yes/no only.

Wizard (T4/T5): it needs a mount point in the workspace shell. `src/app/(workspace)/layout.tsx` currently has no owner this wave, so you may edit it, adding the mount only. The first-run "New project" dialog already exists. The wizard must replace or sequence it, never show both, and must not break `tests/e2e/backup.spec.ts`, which relies on the current first-run behaviour. Run that spec and report the result.

Also: `pnpm desktop:typecheck` exits 0. Near the end, `pnpm desktop:dist:dir && pnpm smoke:desktop && pnpm smoke:boot-gate` print `SMOKE_OK` and `BOOT_GATE_OK`. If the wizard would block the smoke's `/dashboard` assertion, make smoke mode skip onboarding explicitly (`--smoke` / env) and say how.

Rules for every task: plan line numbers and some file names are from 2026-10-17 and may have drifted. Search for the quoted text, read the real exports, and let the compiler win over the plan's literal text. Where the plan contradicts itself, fix it minimally and list the change. TDD where the plan gives tests (test → run FAIL → implement → run PASS) with `pnpm exec vitest run --config tests/vitest.config.ts <files>`. Commit after each task with the plan's message, pathspec form. If `pnpm typecheck` fails only in `.next/**/types/validator.ts`, run `pnpm exec next typegen` and retry. If a gate fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report. The repo's lint treats `react-hooks/set-state-in-effect` as an error. Use the render-time "adjust state" pattern, or the repo's existing `eslint-disable-next-line ... -- reason` convention where an effect is truly needed. Don't start dev servers unless a task requires one, and stop any you start. Your final message must be the written report itself, not a tool call.

Shared files (add only, re-read immediately before editing, commit right away in your task's pathspec commit, never drop another stream's lines): `tests/e2e/feature-matrix.json`, `tests/unit/e2e/feature-matrix.test.ts`, `src/lib/dock/registry.ts`, `src/components/dock/panel-loader.tsx`, `src/components/shell/shortcuts-dialog.tsx`, `src/lib/plugins.ts` (D deletes entries, the others only read it).

Exit gate: your tests pass; `pnpm typecheck` and `pnpm lint` exit 0 (0 errors). Any e2e spec you add must be run and its pass count reported.

Streams this wave (disjoint files):
- A (P8 Today + nav): `src/lib/nav.ts`, `src/lib/today/**`, `src/components/today/**`, `src/app/(workspace)/today/**`, `src/components/shell/sidebar.tsx`, `src/lib/db/schema.ts`, `src/lib/db/repos/tasks.ts`, `src/components/tasks/**`, `tests/unit/nav-parity.test.ts`.
- B (P8 palette, compact mode, quality budget): `src/components/shell/{command-palette,topbar}.tsx`, `src/lib/ui/{focus-trap,viewport}.ts`, `src/lib/hooks/{use-focus-trap,use-narrow-viewport,use-dock-sync}.ts`, `src/components/dock/dock-workspace.tsx`, `src/lib/entities/open.ts`, `tests/unit/ui/**`. B needs a compact-mode change in `sidebar.tsx` (owned by A): B describes it exactly and does not edit it.
- C (P10 desktop settings, version, onboarding core, diagnostics, tray): `desktop/src/**` (all of it this wave), `src/lib/onboarding/**`, `src/components/onboarding/**`, `tests/unit/desktop/**`, `tests/unit/lib/onboarding/**`.
- D (P9 truth guards + plugin deletions): `scripts/truth-scan.mjs`, `tests/unit/repo-truth/**`, `src/lib/hooks/use-speech.ts`, `src/lib/plugins.ts`, `src/lib/canvas-*.ts`, `src/components/canvas/**`, `tests/unit/lib/plugins-consumers.test.ts`, `src/lib/ai/fs-tools.ts`, `reports/**`.
Never edit another stream's files outside the shared list. If you need a change in one, describe it exactly in your report.
