# Changelog

All notable changes to MasarFlow. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions use the project's 4-part display style (`0.2.0.0`); the packaged version is valid semver (`0.2.0`).

## [0.2.0.0] - 2026-10-28

The first release of the desktop app. It replaces the 0.1 launcher and web workspace.

### Added
- One desktop application: the workspace runs inside the app window on `masarflow://app`.
- Six surfaces replace the 30-entry module list: Today, Capture, Work, Library, Ask and System. Each groups
  its pages as sections.
- Project tabs: one strip per project that remembers open pages, the item selected on each, and recently closed
  tabs (Ctrl+Shift+T). Ctrl+Tab cycles, Ctrl+1–9 jumps, Ctrl+W or Delete closes. At most four tabs stay mounted.
- Inspector: the right column shows the selected task, spec, note or doc with its properties, links in both
  directions and **Ask about this**.
- First-run wizard: create a project, link a folder with the native picker, choose an AI provider (a key is
  optional), and import data from MasarFlow 0.1.
- Control Center: service health, linked folders, secret presence, backups, log viewer with redacted
  "Copy diagnostics", and the updater panel.
- In-app updates from GitHub Releases — check, download, install on quit or restart now.
- Data safety: export/import, silent rolling backups with retention, a trash with restore, and a database
  recovery screen.
- Local semantic search and RAG in-app (no Python, no extra runtime).
- Cross-page entity fabric: every note, spec, task, doc, canvas and agent is linkable and the chat knows
  what you have open.
- Today inbox and note promotion: a note becomes a task, spec or doc with a link back.
- Git and GitHub integration: issues ⇄ tasks, PR/CI status, commit links.
- Vault: properties, quick switcher, daily notes and a plain-markdown mirror. Untracked files are imported only
  on request; files whose entity was deleted move to `.masarflow-trash/`.
- Tool panels: terminal, logs and system info, and a command palette.

### Changed
- The app installs side by side with the old launcher and uses `%APPDATA%\MasarFlow`
  (`com.masarflow.app`); uninstall the launcher when you are done migrating.
- One write path: every change is a domain command that writes its data and its activity event in one
  transaction.
- One task model: status is the only input to progress; parents average subtasks; spec progress is the share of
  done tasks.
- One vault engine: upsert-only reconciliation, one run per project at a time, conflicts the user answers.
- One AI runtime: Chat, AI agents and AI workflow share one turn service, coarse toolsets and one approval card
  for writes.
- Closing the window now quits unless you turn on "Keep running in the notification area".
- Package version is valid semver (`0.2.0`); the app and git tags keep the 4-part style (`v0.2.0.0`).
- Local-only: no telemetry, no account.

### Removed
- The Python sidecar is no longer required or started.
- The separate launcher UI (its terminal and diagnostics moved into the app).

### Security
- Per-launch request token, Host/Origin guard, machine-local folder allow-list, Electron hardening and OS
  keychain secret storage. See SECURITY.md.
- Browser-mode API routes check host, origin and token; filesystem roots fail closed outside the desktop app.
- The embed proxy validates every redirect hop and pins the resolved address; canvas frames allow only
  listed video players, sandboxed; CSP `connect-src` and `frame-src` list real hosts only.
- Obsidian media URLs carry a session id, never the API key.
- Black-box guard check (`pnpm security:check`) and a packaged smoke test that proves the renderer's own
  requests pass the guard (`pnpm smoke:desktop`).

### Upgrade notes
- **From 0.1**: export from the old workspace, then import in the first-run wizard.
- **Backups** are written as data version 3. Older backups (data version 2) restore and migrate; a backup with
  one invalid row is refused whole, so a restore never half-applies.
- **Old URLs** (`/tasks`, `/specs`, `/brain`, `/chat`, `/settings`, …) redirect to their surface section, so
  bookmarks and links inside notes keep working.
