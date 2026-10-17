# Wave 11 / Stream C continuation — verify and commit the dock/tools/git/today work, then /files + /sync (original brief: w11-c-dock-tools-vault.md)

## Continuation rules (read these first)
- Read `.hermes/tasks/00-shared-context.md`, then your original brief (named above). Its rules still apply: builds only through `node.exe .hermes/tools/build-snapshot.mjs <letter>`, then `export MASARFLOW_E2E_APP_DIR=...`, then `pnpm e2e:desktop tests/e2e/desktop/<spec>.ts`. Results and traces land in `%LOCALAPPDATA%/Temp/msf-e2e-<letter>/test-results/`. Always use `node.exe`, never `node`.
- A previous agent did the first part of this work and ran out of steps. Its work is on disk, so **read it before changing it**. The items below are what's left. Do them in order, and commit each one as soon as it passes, so a step limit can't lose it.
- **Don't commit `tests/e2e/feature-matrix.json` or `tests/unit/e2e/feature-matrix.test.ts`.** The parent commits them after all four streams finish. You may edit them, for example when you rename a test title, but keep every other stream's lines.
- **Never put probe/scratch specs in `tests/`.** Every sibling's build type-checks that folder. Put probes under `$LOCALAPPDATA/Temp/msf-probe-<letter>/` and run them with `--config tests/playwright.desktop.config.ts` plus an absolute path, or don't use probes at all.
- Before your final report, run `pnpm typecheck` and `pnpm exec eslint <your files>`, and make sure both are clean. The tree is currently at 0 errors and 0 warnings. Note: Playwright fixtures with no test-scoped fixtures use `base.extend<object, {...}>`, not `{}`, because lint rejects the empty type.
- Stop every app/server you start. Never push. Your final message is the written report: commit SHAs, real spec pass counts, and anything left over.

## Remaining work

**Nothing is committed yet.** All of the following is on disk, and `pnpm typecheck` and lint pass on it (the parent changed the four fixtures' empty `{}` types to `object`):
- App fixes:
  - `src/components/chat/linked-projects-dialog.tsx`: an `onChange` prop, so the list refreshes after link, unlink and re-grant.
  - `src/components/git/git-view.tsx`: **NOT modified on disk.** The previous agent reported wiring `onChange` here, but `git status` shows no change. Wire the dialog's `onChange` so its host list re-reads after link/unlink/re-grant. Check every other `LinkedProjectsDialog` call site too (`rg -n "LinkedProjectsDialog" src`); the chat entry point (`src/components/chat/chat-view.tsx` ~line 1674) has the same bug. You may make that **one-prop** edit in chat-view.tsx. Stream B has been told to leave that call site alone.
  - `src/components/dock/dock-group.tsx` and `src/components/dock/dock-tree-view.tsx`: `min-w-0 overflow-hidden` clipping on panel bodies and split tracks.
  - `src/components/git/git-log-list.tsx`: the log refreshes after a commit.
  - `src/components/git/git-branch-menu.tsx`: `aria-label="Create branch"`.
- Specs: `tools.spec.ts` (5), `git.spec.ts` (6), `dock.spec.ts` (2), `today.spec.ts` (2).
- The `_harness.ts` changes (`stubFolderPicker`, `linkFolder`) are uncommitted too, if `git diff tests/e2e/desktop/_harness.ts` shows them.

1. Rebuild your snapshot with `node.exe .hermes/tools/build-snapshot.mjs c` and wait for `BUILD_SNAPSHOT_OK`.
2. **Dock overlap fix:** prove the spec catches the bug.
   - Copy the two current dock files to `$LOCALAPPDATA/Temp/msf-c-dockfix/`. Restore the committed versions with `git show HEAD:src/components/dock/dock-group.tsx > src/components/dock/dock-group.tsx` (and the same for `dock-tree-view.tsx`).
   - Build, run `dock.spec.ts`, and record that it **fails**.
   - Copy the fixed files back, rebuild, and run it to green.
   - Commit `fix(dock): panel bodies and split tracks clip to their track (tiled panes overlapped)`, with `dock.spec.ts`.
   - Do this first and in one go, because siblings rebuild against your dock files.
3. Run `tools.spec.ts`, `git.spec.ts` and `today.spec.ts`, and fix them to green. Then commit in this order: harness and dialog fix; Git fixes with `git.spec.ts`; `tools.spec.ts`; `today.spec.ts`.
4. Write and pass `/files` and `/sync` specs, covering P7's vault-mirror titles. Find the handoff with `rg -n "^## Handoffs" -A40 .hermes/plans/*p7-vault.md`. Assert that the files really exist on disk in a linked temp folder. Commit each spec. Then remove `/files` and `/sync` from `ROUTES_WITHOUT_FEATURES` in the matrix test, which should leave that list **empty**. Don't commit the matrix.
5. In your report, repeat your proposal for the minimum pane size (`MIN_RATIO = 0.05` allows a 64 px pane at 1280 px wide; you suggested `max(0.05, 240/width)`) and **don't apply it**. The user decides.
