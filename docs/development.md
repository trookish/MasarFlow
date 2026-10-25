# Development

How to run, test and package MasarFlow. The user-facing story lives in the [README](../README.md); the
system shape in [architecture.md](architecture.md).

## Requirements

- **Node 24** and **pnpm 11.21** (`corepack enable` reads `packageManager` from `package.json`).
- **Windows 10/11 x64** for the packaged app and the packaged test suites (D12 — Windows is the only
  validated platform in 0.2; macOS/Linux build config exists but is not shipped or tested).
- No Python and no other runtime: embeddings run in a Web Worker via `@huggingface/transformers`
  (ONNX/WASM), so `pnpm install` is the whole setup.

## Install

```bash
pnpm install
```

`pnpm-workspace.yaml` pins `nodeLinker: hoisted` — the Next standalone build cannot run on pnpm's default
isolated symlink layout on Windows (spike S1, `.hermes/spikes/S1.md`).

## The dev loop

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next dev server on `http://localhost:3000` (browser mode) |
| `pnpm dev:webpack` | Same, with webpack instead of Turbopack |
| `pnpm dev:desktop` | Electron + `next dev` with HMR — the real app shell |

Browser mode (`scripts/start.mjs`, `pnpm dev` / `pnpm start`) exists for contributors and the browser e2e
specs; the supported way to run MasarFlow is the desktop app.

### Request guard in browser mode

Browser mode is guarded as well (`src/proxy.ts`, `checkDevRequest`). Every request must address the server
as `localhost:<PORT>` or `127.0.0.1:<PORT>` (DNS-rebinding defence), and every `/api/*` request must be
same-origin: a cross-site `Sec-Fetch-Site`, a foreign `Origin`, or a state-changing request with no `Origin`
is rejected with 403. Requests from the app itself always pass.

Filesystem routes (`/api/fs/*`, `/api/watch`) fail closed. In browser mode, list the folders you want to
open in `MASARFLOW_DEV_ROOTS`, separated by `;`:

```bash
MASARFLOW_DEV_ROOTS="C:/Users/me/Dev/my-project;D:/notes" pnpm dev
```

Without it, every filesystem request returns 403 with a message that names the variable. `pnpm dev:desktop`
does not need it: it points the dev server at the Electron dev profile (`<appData>/MasarFlow-dev`), so folders
chosen with the native folder picker are honoured exactly as in the packaged app.

## Tests

| Command | What it runs |
| --- | --- |
| `pnpm test` | Vitest unit tests (`tests/unit/**`, node environment) |
| `pnpm e2e` | Playwright browser specs (run `pnpm build` first; dev convenience only) |
| `pnpm desktop:dist:dir && pnpm e2e:desktop` | Packaged-app specs against `desktop/dist/win-unpacked` |
| `pnpm e2e:desktop:slow` | The `@slow` packaged specs (cold start, memory) |
| `pnpm desktop:dist:dir && pnpm smoke:desktop` | Packaged smoke → `SMOKE_OK` |
| `pnpm smoke:boot-gate` | Boot-gate proof against the packaged build |
| `pnpm security:check` | Black-box guard check (token, Host, Origin, root allow-list) |

One test file: `pnpm exec vitest run --config tests/vitest.config.ts <file>`.

The **feature-truth guards** (plugin consumers, dead routes, setting consumers, feature matrix) run inside
`pnpm test`; the rules and the four allow-lists are documented in [AGENTS.md](../AGENTS.md). The packaged
app is the test target — a spec that only asserts "the page rendered" is not a test.

## Typecheck, lint, format

```bash
pnpm typecheck          # web: tsc --noEmit
pnpm desktop:typecheck  # app: tsc -p desktop/tsconfig.node.json --noEmit
pnpm lint               # ESLint (flat config)
pnpm format             # Prettier write; format:check to verify
```

## Build and package

| Command | What it does |
| --- | --- |
| `pnpm build` | Next build (browser mode) |
| `pnpm build:app` | Embedding assets + Next standalone + assembled app-server (`desktop/app-server/`) |
| `pnpm desktop:dist:dir` | `build:app` + electron-builder `--win --dir` → `desktop/dist/win-unpacked/` |
| `pnpm desktop:dist` | `build:app` + electron-builder `--win` → NSIS installer, portable exe, `latest.yml` |

## CI and releases

- `.github/workflows/ci.yml` — on PRs/pushes: install, lint, both typechecks, unit tests, `pnpm build`,
  plus the browser e2e subset, on `windows-latest`.
- `.github/workflows/release.yml` — on a `v*` tag: asserts the version story
  (`node scripts/release-verify.mjs <tag>`), packages, extracts release notes from `CHANGELOG.md`
  (`scripts/release-notes.mjs`), and creates a **draft** GitHub Release. Publishing the draft is the
  owner's call (`gh release edit <tag> --draft=false --latest`); electron-updater only sees published
  releases.

## Repository layout

See [architecture.md](architecture.md#repository-layout).
