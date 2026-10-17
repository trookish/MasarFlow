# Wave 12 / Stream B — /chat must stay usable in a narrow dock panel

## Rules
- Read `.hermes/tasks/00-shared-context.md` first. Builds go only through `node.exe .hermes/tools/build-snapshot.mjs b`. Wait for `BUILD_SNAPSHOT_OK`, export the printed `MASARFLOW_E2E_APP_DIR`, then run `pnpm e2e:desktop tests/e2e/desktop/<spec>.ts`. Always use `node.exe`, never `node`. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` before tests.
- Never put probe specs under `tests/`; use `$LOCALAPPDATA/Temp/msf-probe-b/`. Don't commit `tests/e2e/feature-matrix.json` or `tests/unit/e2e/feature-matrix.test.ts`, but **do** add your new title to the `/chat` array in `feature-matrix.json`, keeping every other line.
- Commit with explicit pathspecs as soon as each item passes. Never push. Stop every app you start. `pnpm typecheck` and `pnpm exec eslint <files>` must be clean before your report.

## The bug
The chat view has a fixed thread sidebar (`w-64`) beside the conversation column, in `src/components/chat/chat-view.tsx`. When the chat sits in a narrow dock panel, the conversation column (messages and composer) starves:
- about 176 px with 3 groups at 1440 px wide;
- about 86 px with 5 groups;
- the message column clips to 0 px.

The `/docs` view had the identical bug and was fixed in commit `7e7fcb3`. Read that diff (`git show 7e7fcb3`) and follow the same pattern: `@container` on the view root, then `@max-[600px]:`/`@min-[600px]:` variants. Below the threshold, the thread list collapses to a "Show conversations" toggle overlay that closes on backdrop click and on selection. Keep the wide layout unchanged. Use project-formal copy for the toggle label and aria-label.

## TDD
1. Add the packaged spec `/chat: the conversation stays usable in a narrow panel` to `tests/e2e/desktop/studio-chat.spec.ts`. Use the same panel-forcing method as `/docs: the editor stays usable in a narrow panel` (read that test). Assert:
   - the composer textarea's bounding width is >= 280 px;
   - the message list column is >= 280 px wide.
   Then send a message to the stub provider and assert its reply is **visible** (not just in IndexedDB).
   Build and run; record that it fails, with the measured width.
2. Fix it, rebuild, and run the whole `studio-chat.spec.ts` green (9 tests).
3. Then simplify the earlier workaround: if `/chat: chat knows the open page` or `create task from message` read IndexedDB only because the panel was too narrow to see text, add a visible-text assertion on the panel as well. Keep the stub-capture assertions.
4. Commit the spec and the fix together.

## Report
Commit SHAs, the red width and the green result, real pass counts, and anything left over.
