# Changelog

All notable changes to MasarFlow. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions use the project's 4-part display style (`0.2.0.0`); the packaged version is valid semver (`0.2.0`).

## [0.2.0.0] - 2026-10-XX

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
