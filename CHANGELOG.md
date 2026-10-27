# Changelog

All notable changes to MasarFlow. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions use the project's 4-part display style (`0.2.0.0`); the packaged version is valid semver (`0.2.0`).

## [0.3.0.0] - 2026-10-28

### Added
- Six surfaces replace the 30-entry module list: Today, Capture, Work, Library, Ask and System. Each groups
  its pages as sections (P5).
- Project tabs: one strip per project that remembers open pages, the item selected on each, and recently closed
  tabs (Ctrl+Shift+T). Ctrl+Tab cycles, Ctrl+1–9 jumps, Ctrl+W closes. At most four tabs stay mounted (P5).
- Inspector: the right column shows the selected task, spec, note or doc with its properties, links in both
  directions and **Ask about this** (P6).
- Today inbox, note promotion (a note becomes a task, spec or doc with a link back), and a trash with restore
  (P2/P6).
- Vault panel: untracked files are imported only on request; files whose entity was deleted move to
  `.masarflow-trash/` (P3).

### Changed
- One write path: every change is a domain command that writes its data and its activity event in one
  transaction (P2).
- One task model: status is the only input to progress; parents average subtasks; spec progress is the share of
  done tasks (P6).
- One vault engine: upsert-only reconciliation, one run per project at a time, conflicts the user answers (P3).
- One AI runtime: Chat, AI agents and AI workflow share `runAgentTurn`, coarse toolsets and one approval card
  for writes (P4).
- Every note link opens the note in Capture (the command palette's **New note** previously opened Library).

### Removed
- The Studio layout: split panes, floating windows, collapse/maximize, layout presets, named workspaces and the
  layout setting. Saved 0.2 Studio layouts fold into the project tab strip on first launch; no tab is lost.

### Security
- Browser-mode API routes check host, origin and token; filesystem roots fail closed outside the desktop app
  (P1).
- The embed proxy validates every redirect hop and pins the resolved address; canvas frames allow only
  listed video players, sandboxed; CSP `connect-src` and `frame-src` list real hosts only (P1).
- Obsidian media URLs carry a session id, never the API key (P1).

### Upgrade notes
- **Backups** are written as data version 3. 0.3 restores 0.2 backups (data version 2) and migrates them; a
  backup with one invalid row is refused whole, so a restore never half-applies.
- **Old URLs** (`/tasks`, `/specs`, `/brain`, `/chat`, `/settings`, …) redirect to their surface section, so
  bookmarks and links inside notes keep working.
- **Studio users** get the same pages back as tabs; split and floating arrangements are not restored.

## [0.2.0.0] - 2026-10-17

### Added
- One desktop application: the workspace now runs inside the app window on `masarflow://app` (P1).
- First-run wizard: create a project, link a folder with the native picker, choose an AI provider (a key is
  optional), and import data from MasarFlow 0.1 (P10).
- Control Center: service health, linked folders, secret presence, backups, log viewer with redacted
  "Copy diagnostics", and the updater panel (P10).
- In-app updates from GitHub Releases — check, download, install on quit or restart now (P10).
- Data safety: export/import, silent rolling backups with retention, and a database recovery screen (P4).
- Local semantic search and RAG in-app (no Python, no extra runtime) (P3).
- Cross-page entity fabric: every note, spec, task, doc, canvas and agent is linkable and the chat knows
  what you have open (P5).
- Git and GitHub integration: issues ⇄ tasks, PR/CI status, commit links (P6).
- Vault: properties, quick switcher, daily notes, plain-markdown mirror (P7).
- Dock shell: tool panels, terminal, Today view, command palette v2 (P8).

### Changed
- The app installs side by side with the old launcher and uses `%APPDATA%\MasarFlow`
  (`com.masarflow.app`); uninstall the launcher when you are done migrating.
- Closing the window now quits unless you turn on "Keep running in the notification area" (P10, R6).
- Package version is valid semver (`0.2.0`); the app and git tags keep the 4-part style (`v0.2.0.0`) (D11).
- Local-only: no telemetry, no account (Q6).

### Removed
- The Python sidecar is no longer required or started (P3).
- The separate launcher UI (its terminal and diagnostics moved into the app) (P1/P10).

### Security
- Per-launch request token, Host/Origin guard, machine-local folder allow-list, Electron hardening and OS
  keychain secret storage (P2). See SECURITY.md.
- Black-box guard check (`pnpm security:check`) and a packaged smoke test that proves the renderer's own
  requests pass the guard (`pnpm smoke:desktop`).
