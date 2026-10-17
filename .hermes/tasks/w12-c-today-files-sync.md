# Wave 12 / Stream C — finish /today, then write /files and /sync packaged specs

## Rules
- Read `.hermes/tasks/00-shared-context.md` and `.hermes/tasks/w11-c2-continue.md` (rules section) first. Builds go only through `node.exe .hermes/tools/build-snapshot.mjs c`. Wait for `BUILD_SNAPSHOT_OK`, export the printed `MASARFLOW_E2E_APP_DIR`, then run `pnpm e2e:desktop tests/e2e/desktop/<spec>.ts`. Always use `node.exe`, never `node`. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` before tests.
- Never put probe specs under `tests/`. Don't **commit** `tests/e2e/feature-matrix.json` or `tests/unit/e2e/feature-matrix.test.ts`, but do edit them to add your titles. Your aim is that `ROUTES_WITHOUT_FEATURES` in the test ends up `[]`. Keep every other line.
- Commit each spec with explicit pathspecs as soon as it passes. Never push. Stop every app you start. `pnpm typecheck` and `pnpm exec eslint <files>` must be clean before your report.
- Tests in one file may share fixture state. Every test must leave state as it found it (the git.spec lesson: an earlier test left a file staged and broke the next one).

## 1. today.spec.ts (untracked, written by the previous agent; 2 failures, both spec-side)
- **GROUPS:** `getByRole("button", { name: "Per-channel backpressure + stale state" })` matches 2 elements: the row button, and "Set the deadline of … to today", whose aria-label contains the title. Anchor it with `exact: true` (lines ~58–72).
- **DAILY:** `page.locator('[data-testid="dock-panel"]')` matches every panel, which is a strict-mode violation. Scope it to the `/today` panel or the newly focused daily-note panel, by `data-dock-url`.
- Run it green and commit.

## 2. /files and /sync specs (new files `files.spec.ts` and `sync.spec.ts`)
The previous agent's reconnaissance (verify it before relying on it):
- P7 handoff titles:
  - `/sync: vault mirror writes markdown files`
  - `/sync: file edits import without touching the file`
  - `/sync: conflicting edits are never overwritten`
  - `/sync: a deleted file is reported, not re-created`
- `/files` title: `/files: lists vault attachments and finds one by name`. Confirm it with `rg -n "^## Handoffs" -A40 .hermes/plans/*p7-vault.md` and the P9 fallback table.
- Mechanics:
  - Bind with `stubFolderPicker` plus "Choose folder…".
  - The mirror lives at `<root>/MasarFlow/<slug>`, read from the panel's `<code>`.
  - Turn "Watch continuously" off for deterministic manual runs.
  - The panel shows counts and "changed in the app AND on disk"/"deleted on disk" rows.
  - Attachments come only via the Obsidian pull; that can be stubbed through `POST /api/obsidian`.

Every assertion must be real. Check the files on disk with `node:fs` in a linked temp folder, and check that on-disk content is unchanged where the title says so. Don't assert only that the panel rendered.

If a title's behaviour is genuinely broken in the app, that's a product bug: write the failing spec, fix it in the app, and commit them together. Don't weaken the assertion.

## Report
Commit SHAs, real pass counts per spec, final `ROUTES_WITHOUT_FEATURES` content, and anything left over.
