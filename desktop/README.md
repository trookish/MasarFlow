# MasarFlow Desktop Launcher

A local desktop app that initializes, runs, configures, tests, and watches the
MasarFlow workspace — no terminal window needed. Built with Electron 43,
electron-vite, React 19, Tailwind CSS v4, and xterm.js + node-pty, styled to
match the MasarFlow web interface.

```
desktop/
  src/
    main/       Electron main process: window, PTY session manager (node-pty),
                setup engine, .env.local config, settings store, health polling
    preload/    contextBridge API surface (window.masarFlow)
    renderer/   React UI: sidebar rail, topbar, Run / Setup / Configuration /
                Testing pages, collapsible terminal panel
    shared/     Types shared between main and renderer
  resources/    Build resources (app icon)
```

## Features

- **Setup** — checks Node.js 20+, pnpm, Python 3.11+, `node_modules`,
  `.env.local`, and the Python venv; installs whatever is missing (`pnpm
  install`, venv + pip) with live output in the terminal panel. Also
  compares the installed project version against the latest GitHub release
  and can update the project in place (`git pull` + dependency reinstall).
  Runs automatically on first launch for a target directory.
- **Run** — Development (`pnpm run dev:full`) and Production (`pnpm run build`
  → `pnpm start`) modes with a pill-tab switch, live status chip, port health
  indicators (:3000 app / :8000 Python AI), open-in-browser, and Stop, which
  kills the entire process tree (`taskkill /T /F` on Windows).
- **Configuration** — form for every `.env.local` variable (with enable/
  disable toggles and a `.env.local.bak` backup on first save), a raw
  advanced editor, and app settings: target directory, theme (dark / light /
  AMOLED), accent color (12 presets + custom), auto-open browser, terminal
  font size.
- **Testing** — one-click runs of `lint`, `typecheck`, `test`, `e2e`, and the
  Python service's `pytest`, each streaming to its own terminal tab with a
  pass/fail badge.
- **Terminal** — a collapsible bottom panel with a tab per session (run,
  build, test, setup, plus an interactive shell). Real PTY: ANSI colors,
  Ctrl-C, resize-aware, and sessions survive renderer reloads (ring buffer).

## Requirements

- **Node.js 20+** and **pnpm** (to build the launcher)
- The MasarFlow repo itself (the launcher detects it automatically: in the
  repo's `desktop/` folder it walks up to the repo root; the packaged exe
  uses `PORTABLE_EXECUTABLE_DIR`)

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm run dev` | electron-vite dev server (HMR for the renderer, reloads for main) |
| `pnpm run build` | Production build of main/preload/renderer into `out/` |
| `pnpm run start` | Run the built app (`electron-vite preview`) |
| `pnpm run dist` | Build + package NSIS installer and portable exe into `dist/` |
| `pnpm run dist:dir` | Build + unpacked app folder only |
| `pnpm run typecheck` | `tsc --noEmit` for main/preload and renderer |

From the repo root, the same commands are available as
`pnpm run desktop:dev`, `desktop:build`, `desktop:start`, `desktop:dist`, and
`desktop:typecheck`.

## Releasing

```bash
pnpm run dist
```

- `dist/MasarFlow Launcher Setup <ver>.exe` — NSIS installer
- `dist/MasarFlow Launcher <ver>.exe` — portable executable

Copy the portable exe anywhere inside the MasarFlow repo tree (e.g.
`release/MasarFlow.exe`); it finds the workspace by walking up from its own
location, so a plain desktop shortcut works out of the box.

### Windows SmartScreen ("Windows protected your PC")

The packaged executables are **not code-signed**, so Windows SmartScreen shows
"Windows protected your PC" the first time they run — on every release
(including the older 0.1.2.x installers). This is expected for unsigned apps;
running from source (`pnpm start`) never warns because it uses Electron's own
signed binary.

To run a downloaded installer or portable exe:

- Click **More info → Run anyway** on the SmartScreen dialog, or
- Right-click the file → **Properties → General → Unblock → OK**, then run it.

On Windows 11 with **Smart App Control** enabled the dialog offers no
"Run anyway": unblock the file via Properties first, or turn Smart App
Control off (Windows Security → App & browser control).

The only way to remove the warning entirely is a code-signing certificate
(OV/EV). electron-builder signs automatically when `CSC_LINK` and
`CSC_KEY_PASSWORD` are set, so future builds can produce signed installers
without further changes.

## Smoke tests

The main process includes two env-gated harnesses useful for CI:

```powershell
$env:MASARFLOW_LAUNCHER_SELFTEST = "$env:TEMP\selftest.log"   # pty echo/kill + dev:full + optional build/start
$env:MASARFLOW_LAUNCHER_SELFTEST_PROD = "1"                   # add the production build+start phase
$env:MASARFLOW_LAUNCHER_GUITEST = "$env:TEMP\guitest.log"     # DOM dump + click-through run/stop cycle
pnpm start
```

## Notes

- `node-pty` ships N-API prebuilds that are ABI-stable across Node and
  Electron, so no native rebuild is required (`npmRebuild: false` in
  `electron-builder.yml`). Building it from source would require the
  "Spectre-mitigated libraries" Visual Studio component.
- Geist and Geist Mono fonts are bundled from the `geist` npm package (OFL
  license).
