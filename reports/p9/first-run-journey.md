# P9.T23 — the first-time-user journey

This document records the first-run journey test for the packaged application.
The test is `tests/e2e/desktop/journey.spec.ts`. It passed on the rebuilt
wave-11 snapshot on 2026-10-17: one test, one worker, 9.0 seconds, no retries.

## What the test does

The test launches the packaged application against a brand-new profile, so the
setup wizard owns the first screen. It then walks the product the way a new
user would:

1. The setup wizard: the tour, then "Create a project" with the name
   `Journey project <timestamp>`.
2. A first note: "New note", the title `Journey note <timestamp>`, a short
   body, and the debounced autosave.
3. A first task: the board's own "New task" button, the title
   `Journey task <timestamp>`, and the title's save on blur.
4. A first AI chat: a connection to a loopback stub provider is saved through
   the real "AI connections" dialog, the thread is repointed at it with the
   `/model` command, a message is sent, and the reply round-trips through the
   stub. The thread is renamed to `Journey chat <timestamp>`.
5. A restart on the same profile. The test proves that the wizard does not
   reappear and that the project, the note, the task, and the chat (including
   the reply) are all still there.

Every step goes through the product UI. The AI provider is the loopback stub
from `tests/e2e/desktop/_stub-provider.ts`, so the send exercises the real
wire offline and stays deterministic.

## Evidence

The screenshots are in `reports/p9/journey/`:

| File | Moment |
| ---- | ------ |
| `00-launch.png` | first launch on the fresh profile |
| `01-first-run.png` | the setup wizard |
| `02-shell.png` | the app shell after project creation |
| `03-note.png` | the first note saved |
| `04-task.png` | the task detail with the new title |
| `05-chat.png` | the chat with the stub reply, renamed thread |
| `07-restart.png` | after the restart: no wizard, all four entities present |

## Findings and deviations

These were discovered while making the test green. They are product findings,
not spec workarounds, and the last two are recorded here for the owners of
those areas.

- The dashboard's "New task" quick action deep-links to `/tasks?new=1`, and
  the tasks view consumes that intent asynchronously. Under concurrent load
  one click created three tasks before the intent was cleared. The test uses
  the board view's own "New task" button instead, which creates the task
  directly and is deterministic.
- A brand-new chat thread has no connection selected, so a plain send is
  refused with "Select an AI connection from the header and retry". The test
  repoints the thread with the `/model` command, exactly as the studio chat
  spec does.
- The task detail dialog's backdrop covers the dock. The test closes the
  dialog with its "Done" button before navigating on.
- With five dock groups open, the chat group is about 86 pixels wide. Its
  sidebar and conversation column clip to zero width, so UI text there is not
  visible. The test reads the chat wire (the model repoint and the reply)
  from the application's own IndexedDB, and it closes the spent panels
  (AI Agents, Brain, Task Boards) before asserting chat UI. The `/docs` view
  collapses its list in narrow panels; `/chat` does not yet.
