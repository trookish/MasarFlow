# Wave 11 / Stream B continuation — finish P9.T10 chat + fix the /docs zero-width editor (original brief: w11-b-studio-chat.md)

## Continuation rules (read these first)
- Read `.hermes/tasks/00-shared-context.md`, then your original brief (named above). Its rules still apply: builds only through `node.exe .hermes/tools/build-snapshot.mjs <letter>`, then `export MASARFLOW_E2E_APP_DIR=...`, then `pnpm e2e:desktop tests/e2e/desktop/<spec>.ts`. Results and traces land in `%LOCALAPPDATA%/Temp/msf-e2e-<letter>/test-results/`. Always use `node.exe`, never `node`.
- A previous agent did the first part of this work and ran out of steps. Its work is on disk, so **read it before changing it**. The items below are what's left. Do them in order, and commit each one as soon as it passes, so a step limit can't lose it.
- **Don't commit `tests/e2e/feature-matrix.json` or `tests/unit/e2e/feature-matrix.test.ts`.** The parent commits them after all four streams finish. You may edit them, for example when you rename a test title, but keep every other stream's lines.
- **Never put probe/scratch specs in `tests/`.** Every sibling's build type-checks that folder. Put probes under `$LOCALAPPDATA/Temp/msf-probe-<letter>/` and run them with `--config tests/playwright.desktop.config.ts` plus an absolute path, or don't use probes at all.
- Before your final report, run `pnpm typecheck` and `pnpm exec eslint <your files>`, and make sure both are clean. The tree is currently at 0 errors and 0 warnings. Note: Playwright fixtures with no test-scoped fixtures use `base.extend<object, {...}>`, not `{}`, because lint rejects the empty type.
- Stop every app/server you start. Never push. Your final message is the written report: commit SHAs, real spec pass counts, and anything left over.

## Remaining work

Already committed: `b0817b2`, `f1917dc`, `3cfdb26`, `2677e09`, `5f1a403`. In `studio-chat.spec.ts`, 5 of 7 tests pass (agents, architecture, canvas, docs, watcher).
On disk, uncommitted: in `studio-chat.spec.ts`, the "create task from message" test now clicks `.last()`, which is the reply's button, not a seeded message's.

1. Rebuild your snapshot.
2. **"/chat: create task from message":** run it with the `.last()` fix. When it's green, commit it.
3. **"/chat: chat knows the open page":** reorder it. Open `/chat` and assert the `/model` switch notice while the chat panel is focused. Scope every locator to `[data-testid="dock-panel"][data-dock-url^="/chat"]`, because each route opens its own dock group. Then open the other page, return to the chat tab, and send a message. The real assertion is the **request body your stub captured** (`stub.chatBodies()`): the active-context briefing must name that page, and the awareness tools must be in the tool list. Visible text alone doesn't count. Commit when it's green. The stub-provider wire from chat to `/api/chat` to the stub is only proven once this passes.
4. **Product bug: the /docs editor collapses to 0 px in narrow panels.** With three side-by-side groups at 1440x902, the /docs panel is about 360 px wide. Its doc list keeps a fixed width of about 176 px, and the editor column (`flex-1 min-w-0`) measures 0 px wide: it's in the DOM but you can't see it or type in it.
   - Write the failing packaged spec first: open three groups (dashboard, chat, docs), select a doc, and assert the editor's bounding box is at least 280 px wide. Confirm it fails.
   - Then fix it in `src/components/docs/**` (yours): below a panel-width threshold, the doc list collapses to a toggle or overlays the editor. Use a CSS container query on the panel (`@container`; Tailwind 4 supports `@container` and `@max-[...]` variants; check how the project already uses it with `rg -n "@container" src`) or the existing narrow-mode pattern. The editor must keep a usable width.
   - Don't touch `src/components/dock/**`, which is Stream C's.
   - Commit the spec and the fix together. Add the matrix title `/docs: the editor stays usable in a narrow panel` to the matrix file, but don't commit the matrix.
5. Stream C will add one `onChange` prop to the `<LinkedProjectsDialog>` call site in `src/components/chat/chat-view.tsx` (~line 1674). Don't edit that call site.
6. Confirm `tests/e2e/desktop/_probe-b-layout.spec.ts` is gone. The parent deleted it.
