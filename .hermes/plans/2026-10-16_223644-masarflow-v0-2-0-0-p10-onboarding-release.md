# MasarFlow v0.2.0.0 — P10: First-run wizard, Control Center, auto-update, CI/CD, release

> **For Hermes:** read `…-master.md` fully first (§1, §2 F9/F10, §3 release gate, §4 D11/D12, §6 conventions, §8 Q3/Q4/Q6/Q8/Q10).
> Execute with `subagent-driven-development`, one task at a time, two-stage review per task. Commit after every task.
> **Branch:** `release/v0.2.0`. **Never `git push`, never tag, never create a release** — every push/tag/release step in this file is marked **OWNER ACTION**.
> **Depends on:** P0 (guards, feature matrix), P1 (Electron shell, IPC contract, smoke), P2 (guard, roots, secrets), P3 (no Python gate), P4 (export/import, backups, DB recovery, `v0.1.6.0` migration release), P5–P9 (entity fabric, git, vault, dock, feature truth).
> **P9 exists and is authoritative for the packaged-app test harness:** `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p9-truth.md` (2,422 lines) defines `tests/playwright.desktop.config.ts`, the `e2e:desktop` / `e2e:desktop:slow` scripts, `tests/e2e/desktop/_harness.ts`, the four e2e anchors, `scripts/truth-scan.mjs`, the four guard tests, the matrix ownership map, and the `reports/p9/**` evidence convention. P10 builds on those exact names; where a P10 task touches a P9 artifact it says so.

**Goal:** Make the shipped desktop app something a stranger can install and use without a README: a first-run wizard that gets them from "installed" to "chatting with a project on disk", a Control Center that tells the truth about the machine (backend, roots, secrets, backups, logs, updates), **real** in-app updates via electron-updater (F9), close-to-tray defaulting OFF (R6), GitHub Actions CI for PRs and tagged releases, and the documentation + clean-machine proof that let us tag `v0.2.0.0` and put an unsigned installer on GitHub Releases.

**This phase makes release-gate items 4, 5 and 6 true** (master §3): clean-machine proof, the guard/feature-matrix truth for the two surfaces P10 adds, and CHANGELOG/SECURITY/README + tag + GitHub Release.

---

## Verified context (read from the repo and from the toolchain on 2026-10-16, refreshed 2026-10-17)

| Area | Fact | Evidence (file:line / command output) |
|---|---|---|
| Versions today | root `package.json` `"version": "0.1.5.1"`; `desktop/package.json` `"version": "0.1.5-1"`, `"name": "masarflow-launcher"` | `package.json:3`, `desktop/package.json:2-3` |
| Root scripts today | `build`, `start`, `test`, `e2e`, `desktop:dev|build|start|dist|typecheck` — **no** `build:app`, `dev:desktop`, `desktop:dist:dir`, `smoke:desktop`, `security:check`, `e2e:desktop` | `package.json:7-27` |
| desktop scripts today | `dist = electron-vite build && electron-builder --win`; `typecheck` still references `tsconfig.web.json` (deleted in P1.T6) | `desktop/package.json:11-13` |
| Tooling present on this machine | `gh 2.97.0 (2026-07-31)`, authenticated as **trookish**, token scopes `delete_repo, gist, read:org, repo, workflow`; `packageManager: pnpm@11.21.0` in root `package.json:6`; Node 24 line in use | `gh --version`, `gh auth status`, `node -e "require('./package.json').packageManager"` — run this session |
| GitHub Action majors that are real today | floating majors resolved with `gh api repos/<repo>/git/refs/tags`: `actions/checkout` **v7**, `pnpm/action-setup` **v6**, `actions/setup-node` **v7**, `actions/upload-artifact` **v7**, `actions/download-artifact` **v8** | `gh api "repos/actions/checkout/git/refs/tags" --jq '.[].ref'` (and the 4 others) — run this session |
| builder config today | `appId: com.masarflow.launcher`, `productName: MasarFlow Launcher`, **no `publish:` key at all**, nsis `oneClick:false` `allowToChangeInstallationDirectory:true`, targets `nsis` + `portable` (x64) | `desktop/electron-builder.yml:1-2,13-22` |
| F9 (update is fake) | `desktop/src/main/updates.ts:74` `checkForUpdates()` only compares versions and returns `releaseUrl`/`releaseNotes`; nothing downloads or installs. `REPO = "trookish/MasarFlow"` at `:5`. This file is **deleted by P1.T6**, so P10 writes a new `desktop/src/main/updater.ts` | `desktop/src/main/updates.ts:5,74-107` |
| Renderer update surface today | `src/lib/updates.ts:3-6` (`APP_VERSION` from package.json, `UPDATE_REPO`), `src/lib/stores/updates.ts:18-41` (zustand persist `masarflow-updates`, `autoCheck`), `src/components/shell/update-dialog.tsx`, `src/components/shell/topbar.tsx:27-29`, settings section id `"updates"` at `src/components/settings/settings-view.tsx:182` with `UpdatesSection` at `:1772` | read |
| R6 (close hides to tray) | current launcher is unconditional: `mainWindow.on("close", (e) => { if (quitting) return; e.preventDefault(); mainWindow?.hide(); })`, tray tooltip `"MasarFlow Launcher"` | `desktop/src/main/index.ts:190-196`, `:133-140` |
| App-level settings today | `settings.ts` persists `launcher-settings.json` under `userData`; `AppSettings` has `hasLaunchedBefore`, `autoCheckUpdates`, theme fields — **no** `closeToTray`, **no** onboarding field | `desktop/src/main/settings.ts:57-102,93`, `desktop/src/shared/types.ts:149-177` |
| Existing first-run hook | the workspace layout shows `NewProjectDialog` `mode="first-run"` when `projectCount === 0` and falls back to a default project on close/skip | `src/app/(workspace)/layout.tsx:62-67,86-89,152-160` |
| Python boot gate (dies in P3) | `if (pythonState !== "ok") return <PythonRequiredScreen />;` — P3 removes it; P10's wizard must not assume it | `src/app/(workspace)/layout.tsx:113-116` |
| Storage | Dexie db name `"masarflow"`, `this.version(10)` is current (P3→11, P5→12, P6→13) | `src/lib/db/index.ts:87,206` |
| Linked folders | `linkedProjectSchema = { id, projectId, name, rootPath, createdAt }`; `linkedProjectsRepo.create({projectId,name,rootPath})`; the app validates a folder by `POST /api/fs/list {root,depth:0,maxEntries:1}` before linking | `src/lib/db/schema.ts:673-683`, `src/components/chat/linked-projects-dialog.tsx:44-66` |
| AI providers | `fetchCatalog(): Promise<Catalog>` merges models.dev over `FALLBACK_CATALOG`; `flattenProviders(catalog)`, `ProviderConnection`; connections are Dexie rows `aiConnectionSchema = { id, providerId, label, apiKey, baseUrl, createdAt, updatedAt }` (P2.T6–T8 move the key out of `apiKey` into safeStorage under `ai-connection:<id>`) | `src/lib/ai/catalog.ts:355-388,114,165`, `src/lib/db/schema.ts:509-518` |
| Nav/dock/palette | sidebar + command palette are driven by `NAV_GROUPS` → `ALL_NAV_ITEMS`; dock `PAGE_PATHS` is derived from it, so one nav entry makes a page reachable everywhere | `src/lib/nav.ts:118-145,168-170`, `src/lib/dock/registry.ts:22-24` |
| Dock panel map today | `src/components/dock/panel-loader.tsx` — 119 lines, 22 `dynamic()` entries in `PAGE_COMPONENTS` (`:25-114`), local `loading()` spinner at `:13`, `panelComponent()` exported at `:117` (unused); the 22 (workspace) routes verified with `find "src/app/(workspace)" -name page.tsx` → 22 | read this session |
| Settings sections | `SECTION_COMPONENTS: Record<Section, …>` at `:1972`; `DataSection` at `:807` is where P4 mounts `DataBackupCard` | `src/components/settings/settings-view.tsx:807,1972` |
| Tests | vitest node env, `include: ["tests/unit/**/*.test.ts"]`, alias `@` → `src` **only today** (P1.T1 adds `@desktop` → `desktop/src/main`, `@desktop-shared` → `desktop/src/shared`); Playwright `testDir ./e2e`, `webServer: pnpm run start`, baseURL `http://localhost:3000`; existing specs: `smoke.spec.ts`, `chat-agentic.spec.ts`, `chat-mentions.spec.ts` | `tests/vitest.config.ts:4-13`, `tests/playwright.config.ts:10-40`, `ls tests/e2e` |
| Never-run infra | **no `.github/` directory exists**; **no `CHANGELOG.md`, no `SECURITY.md`, no `CONTRIBUTING.md`**; `LICENSE` exists and is **MIT**; `README.md` is 17.5 KB; `release/` exists but is empty and git-ignored; `test-results/` exists and is git-ignored | `ls -a`, `ls *.md`, `head -4 LICENSE`, `.gitignore:20-22,64,66` |
| Reports convention | **none in the repo today** (`find . -maxdepth 2 -name reports` → empty) but **P9.T1 creates it**: `reports/README.md` + `reports/p9/**`, and `reports/p9/first-run-journey.md` row 8 names `reports/p10/journey/**` as P10's evidence path | P9 plan `:76,2248-2269` |
| P1/P2 IPC facts P10 builds on | `CH` constants in `desktop/src/shared/channels.ts` (P1.T2) + P2 appends `rootsList`/`rootsCovers`, `secretsAvailable/Get/Set/Delete`; `MasarflowApi` in `desktop/src/shared/api.ts` with `app.info()` returning `{version, displayVersion, userData, packaged}`; `dialog.chooseFolder(): Promise<string \| null>` **registers the picked folder in `roots.json`**; `SecretStore` in `desktop/src/main/secrets.ts` with `available/get/set/delete` + `isValidSecretKey` (`/^[A-Za-z0-9:_-]{1,80}$/`) + `createSafeStorageCodec`; renderer-side `getDesktop(): MasarflowApi \| null` in `src/lib/desktop/bridge.ts`; `createMainWindow({devUrl, onClose: (e: Electron.Event) => void})`; tray menu is 3 items (Open/Quit); `runSmoke` writes `{ok, path, origin, hasApi}` | P1 plan `:770,804,1063-1114,1124-1131,1196-1210,1220-1240,1270-1275,1351-1366`; P1b/P2/P3/P4 plan `:1052-1055,1216-1230,1300-1303`; P6 plan `:17`; P7 plan `:52` |
| Renderer data surfaces P10 reuses | `aiConnectionsRepo.list()/get()/create({providerId,label,…}): Promise<AiConnection>` in `src/lib/db/repos/chat.ts:12-31` (exported via `src/lib/db/repos/index.ts:21`; **no `all()`**); `projectsRepo.all()/count()` (`src/lib/db/repos/projects.ts:29-38`); `aiKeySecret(id)` in `src/lib/db/repos/chat-secrets.ts` (P2.T7); `useMounted()` in `src/lib/hooks/use-mounted.ts`; Button variants `default/secondary/outline/ghost/destructive`, sizes `sm/md/lg/icon/icon-sm` (`src/components/ui/button.tsx:3-4`); `NewProjectDialogProps.mode?: "modal" \| "first-run"` (`src/components/shell/new-project-dialog.tsx:54-72`) | read this session |
| P9 harness P10's specs run on | `tests/playwright.desktop.config.ts` with `testDir: "./e2e/desktop"`, one worker, `--grep-invert @slow`; scripts `"e2e:desktop": "playwright test --config tests/playwright.desktop.config.ts --grep-invert @slow"` and `"e2e:desktop:slow"`; `tests/e2e/desktop/_harness.ts` exports `packagedExe()`, `launchApp({seed:"none"|"demo"})` (throwaway `--user-data-dir`, waits for `[data-testid="app-shell"]`, env `MASARFLOW_E2E=1`), `waitForShellReady` (`[data-testid="shell-ready"]`), `createFirstProject(page,name)`, `seedDemoProjects`, `openRoute`, `writeEvidence`, `runningAppProcesses()`, and a `test` fixture `{ desktop: AppHandle }` where `AppHandle = {app,page,profileDir,close()}` seeded with demo data by default | P9 `:600-805,807-812,814-827` |
| P9 guards + evidence | guards at `tests/unit/lib/plugins-consumers.test.ts`, `tests/unit/repo-truth/dead-routes.test.ts`, `tests/unit/repo-truth/setting-consumers.test.ts`, `tests/unit/repo-truth/anchor-contract.test.ts`, `tests/unit/e2e/feature-matrix.test.ts` (all allow-lists `[]`); `node scripts/truth-scan.mjs`; e2e anchors `data-testid="app-shell"` / `"shell-ready"` / `"dock-panel"` / `data-dock-tab`; `reports/README.md` + `reports/p9/GATE.md` + `reports/p9/first-run-journey.md` (its row 8 expects **P10** evidence at `reports/p10/journey/**`) | P9 `:96-121,600-643,2292-2342,2248-2269,2420` |
| P9 rule P10 must respect | "A spec that only asserts 'the page rendered' is not a test. The packaged app is the target: `pnpm desktop:dist:dir && pnpm e2e:desktop`" — so P10's two new features are covered by specs in `tests/e2e/desktop/`, not by browser specs; and A11: a route's *first* feature must also be removed from `ROUTES_WITHOUT_FEATURES` in the same commit (empty by P9, so P10 has nothing to remove but must not re-add) | P9 `:75,2297-2299`; P0 plan `:204-216` |
| **electron-updater is NOT installed** | `desktop/node_modules` contains only `electron`, `electron-builder`, `electron-vite` (+ renderer deps today); `desktop/package.json` has no updater dependency | `ls desktop/node_modules`, `grep updater desktop/package.json` → empty |
| electron-updater versions today | npm dist-tags: `latest = 6.8.9` (2026-06-05), `v26 = 6.8.10` (2026-09-26), `next = 7.0.0-alpha.9` (needs node ≥ 22.12, builder-util-runtime 10 alpha). No peer deps; deps: semver/js-yaml/fs-extra/lazy-val/tiny-typed-emitter/lodash.*/builder-util-runtime 9.7.0 | `curl registry.npmjs.org/electron-updater`, extracted tarball `package/package.json` |
| electron-updater behaviour (6.8.10 source + typings) | throws `ERR_UPDATER_INVALID_VERSION` if `app.getVersion()` is not valid semver (`AppUpdater.js:213-215`); `autoDownload` default **true** (`:109`), `autoInstallOnAppQuit` default **true** (`:114`), `forceDevUpdateConfig` reads `dev-app-update.yml` instead of `app-update.yml` (`:155-157`); GitHub provider reads `https://github.com/<owner>/<repo>/releases.atom`, resolves the **tag**, then fetches `<owner>/<repo>/releases/download/<tag>/latest.yml` (404 → `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND`), with a `latest.yml` fallback when `allowPrerelease` (`GitHubProvider.js:43,114-146`); with `allowPrerelease=false` it resolves the tag from `releases/latest` (`:161-176`); Windows uses `NsisUpdater`. Typings: `autoDownload`/`autoInstallOnAppQuit`/`allowPrerelease`/`forceDevUpdateConfig`/`channel` are public (`out/AppUpdater.d.ts:31,36,47,83,104-110`), `logger: Logger \| null` where `Logger = { info, warn, error, debug? }` (`:122-126`, `out/types.d.ts:8-13`), singleton `export declare const autoUpdater: AppUpdater` (`out/main.d.ts:13`), `UpdateDownloadedEvent extends UpdateInfo` so `.version` is available (`out/types.d.ts:34`), events are `error \| login \| checking-for-update \| update-not-available \| update-available \| download-progress \| update-downloaded \| update-cancelled` (`out/AppUpdater.d.ts:10-20`) | extracted tarball `/tmp/eu2/package/out` |
| electron-builder 26.15.3 publish schema | `publish` → `GithubOptions` keys include `provider` (const `github`), `owner`, `repo`, `releaseType` (**default `draft`**), `vPrefixedTagName` (default `true`), `channel` (default `latest`), `updaterCacheDirName`, `publishAutoUpdate` | `node_modules/.pnpm/app-builder-lib@26.15.3…/scheme.json` |
| Toolchain on this machine | `node v24.14.0`, `pnpm 11.21.0`, `git 2.53.0.windows.3`, `python3 3.13.14`, **PyYAML 6.0.3 present**, `js-yaml` NOT resolvable from the repo root | ran each |
| GitHub CLI | `gh 2.97.0` at `/c/Program Files/GitHub CLI/gh`, **authenticated as `trookish`** (keyring), scopes `delete_repo, gist, read:org, repo, workflow`; remote `origin = https://github.com/trookish/MasarFlow.git` | `gh --version`, `gh auth status`, `git remote -v` |
| Action majors that exist today | `actions/checkout@v7` (floating `v7` tag), `actions/setup-node@v7`, `actions/upload-artifact@v7`, `actions/cache@v6`, `pnpm/action-setup@v6` | `gh api repos/<r>/git/matching-refs/tags/v` |
| Clean-machine tooling on this box | **`C:\Windows\System32\WindowsSandbox.exe` does NOT exist**; Hyper-V (`vmcompute.exe`) is present | `ls /c/Windows/System32/WindowsSandbox.exe` |
| Branch state | `main` is checked out; `release/v0.2.0` does **not** exist yet (P0.T1 creates it) | `git branch` |

---

## Findings that shape this phase

| # | Finding | Evidence | Consequence |
|---|---|---|---|
| B1 | The app already has a first-run hook — a bare `NewProjectDialog` when `projectCount === 0`, with a default-project fallback — and its modal path is asserted by nothing in `tests/e2e` | `src/app/(workspace)/layout.tsx:62-67,86-89,152-160`; `rg "first-run" tests/e2e` → no hits | The wizard **wraps** this hook instead of replacing it: `shouldShowWizard()` returns false in a plain browser, so `pnpm e2e` (browser mode) keeps today's behaviour and the 3 existing specs stay green. T4 changes the layout to `wizardOpen ? <SetupWizard/> : <NewProjectDialog …/>`. |
| B2 | The wizard cannot read `useSearchParams()` from the `(workspace)` layout without pulling a Suspense/CSR-bailout requirement onto every page | Next 16 `proxy`/`useSearchParams` docs in `node_modules/next/dist/docs/`; the layout already wraps dock code in `<Suspense>` for exactly this reason (`layout.tsx:136-145`) | T4 reads the force flag with `new URLSearchParams(window.location.search)` after mount (`?setup=1`), never `useSearchParams`. |
| B3 | `dialog.chooseFolder()` **already** registers the picked folder in `roots.json` (P2.T4), and the repo already has a validated "link this folder" pattern | P1b/P2/P3/P4 plan `:1052-1055`; `src/components/chat/linked-projects-dialog.tsx:44-66` | The wizard's folder step is 15 lines: pick → validate with `POST /api/fs/list` → `linkedProjectsRepo.create`. No new IPC for folders. |
| B4 | `AppSettings` lives in the main process and is read at window-close time, so R6 (close-to-tray default OFF) **must** be a main-process setting, not a renderer store; there is no settings IPC yet | `desktop/src/main/index.ts:190-196`, `desktop/src/shared/types.ts:149-177`, `desktop/src/shared/channels.ts` has no `settings:*` | T1 adds `settings:get`/`settings:set` + `closeToTray`/`onboardingCompletedAt`/`updateChannel`; the wizard's "Finish" writes `onboardingCompletedAt` through the same channel, so it survives a workspace reset (it is per-install, not per-DB). |
| B5 | `SecretStore` exposes `get/set/delete/available` only. A Control Center that shows "key present" must not call `get()` in the renderer (that would return the secret into the page) | P1b/P2/P3/P4 plan `:1300-1303`, `:1245-1295` | T7 adds `SecretStore.has(key)` in main + `secrets:has` IPC; the renderer only ever learns booleans. |
| B6 | electron-updater must be added (verified absent), and if it is *bundled* by electron-vite it never rides pnpm's symlinked `node_modules` into the asar (master R1's failure mode) | `ls desktop/node_modules`, `desktop/electron.vite.config.ts:10-27` (`external: ["node-pty"]` only), extracted `AppUpdater.js:4-20` shows only static requires of pure-JS deps + `require("electron")` at `:296` | T9 adds `electron-updater@6.8.10` to `devDependencies` and bundles it into `out/main/index.js`. The rejected alternative (dependency + external + asar) is recorded in T9. |
| B7 | electron-builder's GitHub publisher would create the release itself — with tag `v0.2.0` (`vPrefixedTagName` default `true` + package semver `0.2.0`) and `releaseType: draft` — which collides with D11's 4-part tag `v0.2.0.0` | `scheme.json` `GithubOptions.releaseType/vPrefixedTagName/channel`; `GitHubProvider.getBaseDownloadPath` builds `…/download/<tag>/latest.yml` | The release workflow builds with `--publish never`, asserts `latest.yml` exists, and creates the release with **`gh release create v0.2.0.0`** — tag name and release notes are ours, the updater only needs the tag to contain `latest.yml` (verified: the provider resolves the tag first, then the file path). |
| B8 | `electron-updater` compares `updateInfo.version` (from `latest.yml`) against `app.getVersion()` with semver — so the *package* version must be `0.2.0`, and the test-release build must use a higher semver (e.g. `0.2.1`) even though its git tag is `v0.2.1.0-dev` | `AppUpdater.js:213-215,340-358`; `GitHubProvider.js:114-146` (falls back to `latest.yml` when `allowPrerelease`) | T10's test feed = a **prerelease** GitHub release tagged `v0.2.1.0-dev` whose `latest.yml` says `0.2.1`; the Control Center's "Test" channel = `autoUpdater.allowPrerelease = true`. |
| B9 | Nothing in the repo ships `CHANGELOG.md`, so "what changed" in the app must come from a file we ship (`extraResources`) plus the GitHub release body that already exists in `src/lib/updates.ts` | `ls *.md`; `src/lib/updates.ts:20-32` (`releaseNotes` field) | T9 adds `CHANGELOG.md` as an extraResource + `changelog:read`; one pure parser (`extractChangelogSection`) serves both the Control Center and `scripts/release-notes.mjs`. |
| B10 | There is no CI at all; `reports/` arrives with P9 (`reports/README.md`, `reports/p9/**`), whose journey table already reserves `reports/p10/journey/**` for P10's clean-machine evidence | `ls -a` (no `.github`), P9 plan `:76,2248-2269` | T13/T14 create the workflows; T16 writes `reports/p10/clean-machine.md` + `reports/p10/journey/**` (matching P9's convention) and fills row 8 of `reports/p9/first-run-journey.md`; screenshots stay small (≤ 2 MB total). |
| B11 | The packaged e2e runs against `desktop/dist/win-unpacked` through `tests/playwright.desktop.config.ts` (`testDir ./e2e/desktop`), and P9's rule is explicit that a browser spec is "a dev convenience only" | P9 plan `:643-670,807-812,2297-2299`; `tests/playwright.config.ts:34-40` | P10's two new features get **packaged** specs in `tests/e2e/desktop/` using `_harness.ts`; the browser suite (`pnpm e2e`) is not where they are proven. P9's `createFirstProject()` helper and `journey.spec.ts` step 1 assume the old first-run dialog, so T4 updates both in the same commit. |
| B12 | P8 adds three (workspace) routes — `/tools/terminal`, `/tools/logs`, `/tools/system` — plus `src/lib/tools/system.ts` (`formatBytes`, `storageSummary`, `describeRoot`) and `src/components/tools/system-panel.tsx` / `logs-panel.tsx`, and its nav already carries `"diagnostics"` keywords. So P10 does **not** build the "system/diagnostics panel" from scratch: `/tools/system` already shows version, roots, storage, table counts and a **Copy diagnostics** button (browser-side report). Separately, the dock's path→component map `src/components/dock/panel-loader.tsx` **already exists today** with 22 entries, and P8 adds a guard that every `PAGE_PATHS` entry has one. | P8 plan `:94-95,110-119,142,1477-1483,4746,4825,5941`; `src/components/dock/panel-loader.tsx:13-21,25-114,117` (22 entries, local `loading()` at `:13`); `find "src/app/(workspace)" -name page.tsx` → 22 today | The matrix baseline is therefore **22 today + 3 from P8 + P10's `/control-center` = 26 keys**; the Control Center must not clone `system-panel.tsx`, and its nav entry needs a `panel-loader.tsx` line (T8) or both the panels guard and the matrix guard fail. |
| B13 | P8's handoff block names three obligations for P10: (1) P10 owns the **editable** environment surface (API keys/providers/`.env`) that `system-panel.tsx` deliberately leaves alone; (2) P10 owns **log rotation and log deletion** (P8 R-P8-5: nothing truncates `logs/server.log` today); (3) "Copy diagnostics" must **reuse** the report, not copy it — "extract it to `src/lib/tools/system.ts` if a second caller appears". | P8 plan `:7159-7163,7129` | T7 gains server-log rotation + tail limits, T8 reuses/extracts the report text builder and links to `/tools/system` instead of duplicating it, and the Secrets tab is the editable environment surface. None of P8's files are renamed. |
| B14 | The desktop-only diagnostic inputs do not exist in the browser at all (roots allow-list, secret presence, backup files, updater phase) — the browser report can never be the desktop report | P1/P2/P4 IPC surfaces; P8 `:4825` ("In the desktop app: version, data folder, Packaged desktop app") | Two producers, one vocabulary: `src/lib/tools/system.ts` keeps the browser text; the Control Center's Copy diagnostics calls the main-process collector (`diagnostics:collect`, T7). T8 states this in one comment so nobody "fixes" the duplication later. |

---

## File map (all new unless marked)

```
desktop/src/shared/app-settings.ts        pure: P10 setting keys + applySettingsPatch
desktop/src/shared/version.ts             pure: APP_DISPLAY_VERSION + 4-part helpers
desktop/src/shared/log-rotation.ts        pure: rotation/prune rules (P8's R-P8-5 handoff)
desktop/src/shared/ring-buffer.ts         pure: capped line buffer for log tails
desktop/src/shared/diagnostics.ts         pure: redactText / isAllowedPath / buildDiagnosticsReport
desktop/src/shared/window-behavior.ts     pure: closeBehavior({closeToTray, quitting})
desktop/src/shared/updater-status.ts      pure: phase machine + isUpdatableBuild + channel mapping
desktop/src/main/logging.ts               ring buffer install + logTail(n)
desktop/src/main/diagnostics.ts           collector (app/roots/secrets/backups/logs/updater)
desktop/src/main/updater.ts               electron-updater wiring (NEW; old updates.ts is deleted in P1.T6)
src/lib/changelog.ts                      pure: extractChangelogSection(md, version) for the "What changed" panel
src/lib/onboarding/state.ts               pure: WIZARD_STEPS + shouldShowWizard + canAdvance/canSkip/nextStep
src/lib/onboarding/actions.ts             basenameOf + linkFolder + readMigrationFile + applyMigration
src/components/onboarding/setup-wizard.tsx   dialog shell, step rail, Back/Next/Skip/Finish
src/components/onboarding/steps.tsx          the six step bodies
src/components/control-center/control-center-view.tsx   tabs: Overview/Folders/Secrets/Backups/Logs/Updates
src/components/control-center/update-panel.tsx          current version, check, channel, progress, what-changed
src/app/(workspace)/control-center/page.tsx
scripts/release-verify.mjs                version/tag/CHANGELOG consistency gate
scripts/release-notes.mjs                 CHANGELOG section -> release-notes.md
.github/workflows/ci.yml                  install + typecheck + lint + test + build (PR/push)
.github/workflows/release.yml             tag -> package -> feed assertions -> draft release; packaged smoke (diagnostic)
reports/p10/clean-machine.md              clean-machine proof record (T16); screenshots in reports/p10/journey/
reports/p10/GATE.md                       P10 gate + P9-artifact changes (T16/T17)
SECURITY.md, CHANGELOG.md                 new; README.md rewritten (T15)
TESTS (10 new vitest files + 2 packaged Playwright specs):
  tests/unit/desktop/shared/app-settings.test.ts       T1  (4 cases)
  tests/unit/desktop/shared/version.test.ts            T2  (2)
  tests/unit/lib/onboarding/state.test.ts              T3  (7 incl. basenameOf)
  tests/unit/lib/onboarding/actions.test.ts            T5  (2)
  tests/unit/desktop/shared/ring-buffer.test.ts        T6  (2)
  tests/unit/desktop/shared/log-rotation.test.ts       T7  (3)
  tests/unit/desktop/shared/diagnostics.test.ts        T6  (7)
  tests/unit/desktop/shared/updater-status.test.ts     T9  (5)
  tests/unit/desktop/shared/window-behavior.test.ts    T11 (3)
  tests/unit/lib/changelog.test.ts                     T14 (2)
  tests/e2e/desktop/onboarding.spec.ts                 T4  ("/dashboard: first-run setup wizard")
  tests/e2e/desktop/control-center.spec.ts             T8  ("/control-center: diagnostics and update panel")
  tests/unit/desktop/secrets.test.ts                   T7  (+1 `it` inside P2's file — not a new file)
MODIFIED (P10):
  desktop/src/shared/{types.ts,channels.ts,api.ts}, desktop/src/preload/index.ts,
  desktop/src/main/{index.ts,settings.ts,secrets.ts,ipc/index.ts}, desktop/electron-builder.yml,
  desktop/package.json, package.json,
  src/app/(workspace)/layout.tsx, src/lib/nav.ts, src/lib/stores/updates.ts,
  src/components/settings/settings-view.tsx, src/components/shell/update-dialog.tsx,
  src/components/shell/topbar.tsx, src/lib/hooks/use-desktop-navigation.ts (new, T11),
  src/components/dock/panel-loader.tsx (new loader entry, T8),
  tests/e2e/desktop/_harness.ts, tests/e2e/desktop/journey.spec.ts,
  tests/e2e/feature-matrix.json, reports/p9/first-run-journey.md (row 8), scripts/smoke-desktop.mjs
```

---

## P10.T1 — App settings over IPC: `closeToTray`, `onboardingCompletedAt`, `updateChannel` (TDD, ≈10 min)

**Why:** R6 needs a main-process setting read at window-close time (B4); the wizard needs a per-install "done" flag that a workspace reset cannot clear; the updater needs a persisted channel.

**Failing test — create `tests/unit/desktop/shared/app-settings.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { applySettingsPatch, type P10Settings } from "@desktop-shared/app-settings";

const base = (): P10Settings => ({
  closeToTray: false,
  onboardingCompletedAt: null,
  updateChannel: "stable",
});

describe("applySettingsPatch", () => {
  it("applies known keys with the right types", () => {
    expect(applySettingsPatch(base(), { closeToTray: true })).toEqual({ ...base(), closeToTray: true });
    expect(applySettingsPatch(base(), { onboardingCompletedAt: "2026-10-20T08:00:00.000Z" }).onboardingCompletedAt).toBe(
      "2026-10-20T08:00:00.000Z",
    );
    expect(applySettingsPatch(base(), { updateChannel: "test" }).updateChannel).toBe("test");
  });
  it("ignores unknown keys and wrong types instead of throwing", () => {
    const next = applySettingsPatch(base(), { closeToTray: "yes", nope: 1, updateChannel: "beta" });
    expect(next).toEqual(base());
  });
  it("accepts an explicit null to re-arm the wizard", () => {
    const done = applySettingsPatch(base(), { onboardingCompletedAt: "x" });
    expect(applySettingsPatch(done, { onboardingCompletedAt: null }).onboardingCompletedAt).toBeNull();
  });
  it("never mutates the input and tolerates a non-object patch", () => {
    const before = base();
    expect(applySettingsPatch(before, null)).toEqual(before);
    expect(applySettingsPatch(before, "nope")).toEqual(before);
    expect(before).toEqual(base());
  });
});
```

Run → FAIL (`Cannot find module '@desktop-shared/app-settings'`; the alias exists after P1.T1).

**Create `desktop/src/shared/app-settings.ts`:**

```ts
/** The three settings P10 owns. They live in `AppSettings` (desktop/src/shared/types.ts) too. */
export interface P10Settings {
  /** R6: hide to the tray instead of quitting on window close. Default OFF. */
  closeToTray: boolean;
  /** ISO timestamp set by the first-run wizard; null = show it again. */
  onboardingCompletedAt: string | null;
  /** "test" maps to electron-updater's allowPrerelease (T10). */
  updateChannel: "stable" | "test";
}

export const P10_SETTING_DEFAULTS: P10Settings = {
  closeToTray: false,
  onboardingCompletedAt: null,
  updateChannel: "stable",
};

/**
 * Merge a renderer-supplied patch into the current settings.
 * Unknown keys and wrong types are ignored (never throw): the renderer is a
 * less-trusted surface than main, and a bad patch must not lock the app out of
 * its settings file.
 */
export function applySettingsPatch<T extends P10Settings>(current: T, patch: unknown): T {
  if (typeof patch !== "object" || patch === null) return current;
  const p = patch as Record<string, unknown>;
  const next: T = { ...current };
  if (typeof p.closeToTray === "boolean") next.closeToTray = p.closeToTray;
  if (p.onboardingCompletedAt === null || typeof p.onboardingCompletedAt === "string") {
    next.onboardingCompletedAt = p.onboardingCompletedAt as string | null;
  }
  if (p.updateChannel === "stable" || p.updateChannel === "test") next.updateChannel = p.updateChannel;
  return next;
}
```

Run → **PASS** (`1 passed` file, 4 tests). Mutation check: delete the `typeof p.closeToTray === "boolean"` guard line → the "ignores wrong types" test must FAIL; restore.

**Wire it (shared files — append, one stream at a time):**

1. `desktop/src/shared/types.ts`: make the existing `AppSettings` interface (at `:149`) extend the P10 shape, so the fields cannot drift:
   ```ts
   import type { P10Settings } from "./app-settings";
   export interface AppSettings extends P10Settings {
     /* …the existing fields, unchanged… */
   }
   ```
   Then default them in `desktop/src/main/settings.ts` `defaultSettings()` (`:57`, module-private) by spreading `P10_SETTING_DEFAULTS` (`import { P10_SETTING_DEFAULTS } from "@shared/app-settings";`) so the defaults exist in exactly one place.
   Keep the settings file name `launcher-settings.json` (`settings.ts:93`) **on purpose**: renaming it would silently drop the theme/accent choices an existing 0.1 user already made. It is machine-local UI state; the *workspace data* migration is P4's job.
2. `desktop/src/shared/channels.ts`: append `settingsGet: "settings:get", settingsSet: "settings:set",` inside `CH`.
3. `desktop/src/shared/api.ts`: add
   ```ts
   settings: {
     /** The full main-process settings object (AppSettings). */
     get(): Promise<Record<string, unknown>>;
     /** Merge a partial patch; returns the settings after the merge. */
     set(patch: Partial<P10Settings>): Promise<Record<string, unknown>>;
   };
   ```
   (import `P10Settings` as a type from `./app-settings`).
4. `desktop/src/preload/index.ts`: `settings: { get: () => ipcRenderer.invoke(CH.settingsGet), set: (patch) => ipcRenderer.invoke(CH.settingsSet, patch) },`.
5. `desktop/src/main/ipc/index.ts` (inside `registerIpc`): `ipcMain.handle(CH.settingsGet, () => settings.get());` and `ipcMain.handle(CH.settingsSet, (_e, patch: unknown) => settings.set(applySettingsPatch(settings.get() as AppSettings, patch)));` — import `{ settings }` from `../settings` and `applySettingsPatch` from `@shared/app-settings`.

**Run:** `pnpm test -- tests/unit/desktop/shared/app-settings.test.ts` → `Test Files 1 passed`, `Tests 4 passed`; `pnpm desktop:typecheck` → exit 0.

Commit: `feat(desktop): typed app settings over IPC (close-to-tray, onboarding, update channel)`

---

## P10.T2 — One canonical 4-part display version (TDD, ≈6 min)

**Why:** D11 — package semver `0.2.0`, UI/git tag `0.2.0.0`. Today the display string is a private const inside an IPC handler (P1.T5 sets `const DISPLAY_VERSION = "0.2.0.0"`), which no test can see.

**Failing test — `tests/unit/desktop/shared/version.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { APP_DISPLAY_VERSION, formatDisplayVersion, isDisplayVersion } from "@desktop-shared/version";

describe("display version", () => {
  it("pads a semver to four parts", () => {
    expect(formatDisplayVersion("0.2.0")).toBe("0.2.0.0");
    expect(formatDisplayVersion("0.2.1-3")).toBe("0.2.1.3");
    expect(formatDisplayVersion("v0.2.0-alpha.0")).toBe("0.2.0.0");
    expect(formatDisplayVersion("0.2.0.0")).toBe("0.2.0.0");
  });
  it("recognises the 4-part shape", () => {
    expect(isDisplayVersion(APP_DISPLAY_VERSION)).toBe(true);
    expect(isDisplayVersion("0.2.0")).toBe(false);
    expect(isDisplayVersion("0.2.0.0-rc1")).toBe(false);
  });
});
```

Run → FAIL (module not found). **Create `desktop/src/shared/version.ts`:**

```ts
/** The version shown in the UI and used for git tags (master D11). package.json keeps valid semver. */
export const APP_DISPLAY_VERSION = "0.2.0.0";

/** "0.2.0" | "0.2.0.0" | "v0.2.0-alpha.0" | "0.2.1-3" -> "0.2.0.0" style. */
export function formatDisplayVersion(input: string): string {
  const core = input.trim().replace(/^v/i, "").split("-")[0];
  const parts = core
    .split(".")
    .map((s) => s.replace(/[^0-9]/g, ""))
    .filter((s) => s.length > 0);
  while (parts.length < 4) parts.push("0");
  return parts.slice(0, 4).join(".");
}

/** True only for exactly four numeric parts. */
export function isDisplayVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(value);
}
```

Run → **PASS** (2 tests). Note: `formatDisplayVersion("0.2.1-3") === "0.2.1.3"` documents the project's existing `-` → `.` build-number convention (see `desktop/src/main/updates.ts:8-15`, deleted in P1.T6).

**Edit `desktop/src/main/ipc/index.ts`:** delete the private `const DISPLAY_VERSION = "0.2.0.0";`, add `import { APP_DISPLAY_VERSION } from "@shared/version";`, and use `displayVersion: APP_DISPLAY_VERSION` in the `app:info` payload. The `MasarflowApi.app.info()` signature (`desktop/src/shared/api.ts`) does not change.

**Run:** `pnpm test -- tests/unit/desktop/shared/version.test.ts` → P2 passed; `pnpm desktop:typecheck` → exit 0.

Commit: `feat(release): one canonical 4-part display version`

---

## P10.T3 — Onboarding decision + step machine (pure, TDD, ≈8 min)

**Why:** B1 — "show the wizard?" and "may I advance?" must be testable without a browser, a bridge, or IndexedDB, because the vitest env is node-only and has no jsdom.

**Failing test — `tests/unit/lib/onboarding/state.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import {
  WIZARD_STEPS,
  shouldShowWizard,
  canAdvance,
  canSkip,
  nextStep,
  previousStep,
  emptyProgress,
  type WizardContext,
} from "@/lib/onboarding/state";

const ctx = (over: Partial<WizardContext> = {}): WizardContext => ({
  desktop: true,
  completedAt: null,
  projectCount: 0,
  forced: false,
  ...over,
});

describe("shouldShowWizard", () => {
  it("shows once on a fresh desktop install", () => {
    expect(shouldShowWizard(ctx())).toBe(true);
  });
  it("never shows again after it was finished", () => {
    expect(shouldShowWizard(ctx({ completedAt: "2026-10-20T00:00:00.000Z" }))).toBe(false);
    expect(shouldShowWizard(ctx({ completedAt: "2026-10-20T00:00:00.000Z", forced: true }))).toBe(true);
  });
  it("does not nag a user who already has projects (imported data, demo seed)", () => {
    expect(shouldShowWizard(ctx({ projectCount: 3 }))).toBe(false);
  });
  it("stays out of the browser build unless explicitly forced", () => {
    expect(shouldShowWizard(ctx({ desktop: false }))).toBe(false);
    expect(shouldShowWizard(ctx({ desktop: false, forced: true }))).toBe(true);
  });
});

describe("steps", () => {
  it("walks welcome -> finish and back", () => {
    expect(WIZARD_STEPS[0]).toBe("welcome");
    expect(WIZARD_STEPS[WIZARD_STEPS.length - 1]).toBe("finish");
    expect(nextStep("welcome")).toBe("project");
    expect(previousStep("project")).toBe("welcome");
    expect(nextStep("finish")).toBeNull();
    expect(previousStep("welcome")).toBeNull();
  });
  it("blocks only the steps that need an action", () => {
    const p = emptyProgress();
    expect(canAdvance("welcome", p)).toBe(true);
    expect(canAdvance("project", p)).toBe(false);
    expect(canAdvance("project", { ...p, projectReady: true })).toBe(true);
    expect(canAdvance("folder", p)).toBe(true); // skippable: a project can be linked later
    expect(canAdvance("provider", p)).toBe(true); // "add a key later" is a first-class path
    expect(canAdvance("migrate", p)).toBe(true);
    expect(canSkip("welcome")).toBe(false);
    expect(canSkip("folder")).toBe(true);
    expect(canSkip("migrate")).toBe(true);
  });
});
```

Run → FAIL (module not found). **Create `src/lib/onboarding/state.ts`:**

```ts
/** The six first-run steps, in order (P10.T4 renders one component per id). */
export const WIZARD_STEPS = ["welcome", "project", "folder", "provider", "migrate", "finish"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface WizardProgress {
  /** A project exists (created here or already on disk in IndexedDB) and is active. */
  projectReady: boolean;
  /** A folder was linked through the native picker (or an existing link was accepted). */
  folderLinked: boolean;
  /** A provider was chosen (a connection row exists) — a key is NOT required. */
  providerChosen: boolean;
  /** The user visited the migrate step (imported or explicitly skipped). */
  migrationSeen: boolean;
}

export interface WizardContext {
  /** False in a plain browser (pnpm dev) and during SSR. */
  desktop: boolean;
  /** From main-process settings; null = never completed. */
  completedAt: string | null;
  projectCount: number;
  /** `?setup=1` — used by the Control Center button and by e2e. */
  forced: boolean;
}

export function emptyProgress(): WizardProgress {
  return { projectReady: false, folderLinked: false, providerChosen: false, migrationSeen: false };
}

/** Show the wizard exactly once per install, and only where it can act. */
export function shouldShowWizard(ctx: WizardContext): boolean {
  if (ctx.forced) return true;
  if (!ctx.desktop) return false;
  if (ctx.completedAt !== null) return false;
  return ctx.projectCount === 0;
}

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}

export function nextStep(step: WizardStep): WizardStep | null {
  return WIZARD_STEPS[stepIndex(step) + 1] ?? null;
}

export function previousStep(step: WizardStep): WizardStep | null {
  return stepIndex(step) > 0 ? WIZARD_STEPS[stepIndex(step) - 1] : null;
}

export function canAdvance(step: WizardStep, progress: WizardProgress): boolean {
  switch (step) {
    case "project":
      return progress.projectReady;
    default:
      return true; // every other step is either informational or skippable
  }
}

export function canSkip(step: WizardStep): boolean {
  return step === "folder" || step === "provider" || step === "migrate";
}
```

Run → **PASS** (`Tests 7 passed` in one file: 4 × `shouldShowWizard`, 2 × steps, 1 × `basenameOf`). Mutation check: change `canSkip` to `return false;` → the skip test FAILS; restore.

**Also pure (same file, used by T5):** the folder step needs a display name for a picked path:

Add to `src/lib/onboarding/actions.ts` (create the file now; the test below is its only pure surface):

```ts
/** Last non-empty segment of a Windows or POSIX path; "" for a drive/root itself. */
export function basenameOf(input: string): string {
  const clean = input.trim().replace(/[/\\]+$/, "");
  if (!clean) return "";
  const parts = clean.split(/[/\\]+/).filter(Boolean);
  return parts.length <= 1 ? "" : parts[parts.length - 1];
}
```

and assert it in the same test file:

```ts
import { basenameOf } from "@/lib/onboarding/actions";

describe("basenameOf", () => {
  it("handles trailing slashes, drives and POSIX roots", () => {
    expect(basenameOf("C:\\Users\\trookish\\Dev\\MyGame\\")).toBe("MyGame");
    expect(basenameOf("/home/trookish/projects/app")).toBe("app");
    expect(basenameOf("C:\\")).toBe("");
    expect(basenameOf("")).toBe("");
  });
});
```

Commit: `feat(onboarding): pure wizard state machine and path helper`

---

## P10.T4 — The wizard shell and its six steps (≈14 min)

**Files:** `src/components/onboarding/setup-wizard.tsx` (shell), `src/components/onboarding/steps.tsx` (bodies), edit `src/app/(workspace)/layout.tsx`, **edit `tests/e2e/desktop/_harness.ts` + `tests/e2e/desktop/journey.spec.ts` (P9 artifacts whose first-run assumption this task changes — same commit)**, new `tests/e2e/desktop/onboarding.spec.ts`, edit `tests/e2e/feature-matrix.json`.

**Risk this task owns:** P9's journey spec and harness were written against the bare first-run project dialog. The wizard supersedes it (master §7 row P10), so both must be updated here — leaving them stale turns the packaged gate red on a phase that is otherwise green.

**Create `src/components/onboarding/setup-wizard.tsx`:**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { getDesktop } from "@/lib/desktop/bridge";
import { projectsRepo } from "@/lib/db/repos";
import { useProjectStore } from "@/lib/stores/project";
import {
  WIZARD_STEPS,
  canAdvance,
  canSkip,
  emptyProgress,
  nextStep,
  previousStep,
  stepIndex,
  type WizardProgress,
  type WizardStep,
} from "@/lib/onboarding/state";
import { Button } from "@/components/ui/button";
import { WelcomeStep, ProjectStep, FolderStep, ProviderStep, MigrateStep, FinishStep } from "./steps";

/** Set from main-process settings on finish/skip; null re-arms the wizard. */
async function finish(onDone: () => void): Promise<void> {
  const d = getDesktop();
  if (d) await d.settings.set({ onboardingCompletedAt: new Date().toISOString() });
  onDone();
}

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const desktop = getDesktop();
  const [step, setStep] = useState<WizardStep>("welcome");
  const [progress, setProgress] = useState<WizardProgress>(emptyProgress);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);
  const projectCount = useLiveQuery(() => projectsRepo.count(), []) ?? 0;

  const update = useCallback((patch: Partial<WizardProgress>) => setProgress((p) => ({ ...p, ...patch })), []);

  // An existing project (imported data, demo seed) satisfies the project step.
  useEffect(() => {
    if (activeProjectId && projectCount > 0) update({ projectReady: true });
  }, [activeProjectId, projectCount, update]);

  const body = {
    welcome: <WelcomeStep />,
    project: <ProjectStep progress={progress} update={update} setActiveProjectId={setActiveProjectId} />,
    folder: <FolderStep projectId={activeProjectId} progress={progress} update={update} />,
    provider: <ProviderStep progress={progress} update={update} />,
    migrate: <MigrateStep progress={progress} update={update} />,
    finish: <FinishStep />,
  }[step];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-6 backdrop-blur" role="dialog" aria-label="Set up MasarFlow">
      <div className="flex w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
        <ol className="flex items-center gap-2 border-b border-border px-6 py-4 text-xs text-muted-foreground">
          {WIZARD_STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-1 ${i === stepIndex(step) ? "text-foreground" : ""}`}>
              {i < stepIndex(step) ? <Check className="size-3" /> : null}
              <span className="capitalize">{s}</span>
              {i < WIZARD_STEPS.length - 1 ? <span aria-hidden>›</span> : null}
            </li>
          ))}
        </ol>
        <div className="min-h-[260px] px-6 py-5">{body}</div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
          <Button
            variant="ghost"
            disabled={previousStep(step) === null}
            onClick={() => setStep((s) => previousStep(s) ?? s)}
          >
            <ChevronLeft className="mr-1 size-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            {canSkip(step) ? (
              <Button variant="ghost" onClick={() => setStep((s) => nextStep(s) ?? s)}>
                Skip
              </Button>
            ) : null}
            {step === "finish" ? (
              <Button onClick={() => void finish(onDone)}>
                {desktop ? "Start using MasarFlow" : "Close"}
              </Button>
            ) : (
              <Button disabled={!canAdvance(step, progress)} onClick={() => setStep((s) => nextStep(s) ?? s)}>
                Continue <ChevronRight className="ml-1 size-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="px-6 pb-3 text-[11px] text-muted-foreground">
          Everything stays on this computer. MasarFlow never uploads your workspace; only the AI provider
          you choose sends the text you send it. {desktop ? "" : "(Browser preview: folder linking needs the desktop app.)"}
        </p>
      </div>
    </div>
  );
}
```

> The dialog markup deliberately mirrors existing dialog usage (`Dialog`/`DialogHeader` in `src/components/ui/dialog.tsx`) but is a plain fixed overlay, because the wizard is mounted by the *layout* rather than from a trigger; keep the `role="dialog"` + `aria-label` so the e2e can find it with `getByRole("dialog", { name: "Set up MasarFlow" })`.

**Create `src/components/onboarding/steps.tsx`** — six small components; the two that touch the outside world are `ProjectStep` (reuses `NewProjectDialog`) and `FolderStep` (native picker):

```tsx
"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, FolderOpen, KeyRound } from "lucide-react";
import { projectsRepo, aiConnectionsRepo } from "@/lib/db/repos";
import { aiKeySecret } from "@/lib/db/repos/chat-secrets";
import { getDesktop } from "@/lib/desktop/bridge";
import { fetchCatalog, flattenProviders } from "@/lib/ai/catalog";
import type { Project } from "@/lib/db/schema";
import { basenameOf, linkFolder } from "@/lib/onboarding/actions";
import type { WizardProgress } from "@/lib/onboarding/state";
import { NewProjectDialog } from "@/components/shell/new-project-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ... WelcomeStep / MigrateStep / FinishStep are static copy (see the plan's copy list in P10.T15) ... */

export function ProjectStep({
  progress,
  update,
  setActiveProjectId,
}: {
  progress: WizardProgress;
  update: (p: Partial<WizardProgress>) => void;
  setActiveProjectId: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const projects = useLiveQuery(() => projectsRepo.all(), []) ?? [];
  const pick = (p: Project): void => {
    setActiveProjectId(p.id);
    update({ projectReady: true });
  };
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Your first project</h2>
      <p className="text-sm text-muted-foreground">
        A project is a container for notes, specs, tasks and docs. You can create as many as you like later.
      </p>
      {projects.length > 0 ? (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>{p.name}</span>
              <Button size="sm" variant="outline" onClick={() => pick(p)}>
                Use this project <ArrowRight className="ml-1 size-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button onClick={() => setCreating(true)}>{projects.length ? "Create another" : "Create a project"}</Button>
      <NewProjectDialog
        open={creating}
        mode="modal"
        onOpenChange={setCreating}
        onCreated={(id) => {
          setCreating(false);
          pick({ id } as Project);
        }}
      />
      {progress.projectReady ? <p className="text-xs text-emerald-500">Project ready.</p> : null}
    </div>
  );
}

export function FolderStep({
  projectId,
  progress,
  update,
}: {
  projectId: string | null;
  progress: WizardProgress;
  update: (p: Partial<WizardProgress>) => void;
}) {
  const desktop = getDesktop();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(): Promise<void> {
    if (!desktop || !projectId) return;
    setBusy(true);
    setNote(null);
    try {
      // The native picker also registers the folder in roots.json (P2.T4).
      const picked = await desktop.dialog.chooseFolder();
      if (!picked) return;
      const result = await linkFolder({ projectId, path: picked });
      if (result.ok) {
        update({ folderLinked: true });
        setNote(`Linked ${basenameOf(picked) || picked}.`);
      } else setNote(result.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Link the folder on this computer</h2>
      <p className="text-sm text-muted-foreground">
        Point MasarFlow at the folder where the code actually lives. Only folders you pick here can be read
        or written by the app — everything else on the disk stays out of reach.
      </p>
      <Button disabled={!desktop || !projectId || busy} onClick={() => void choose()}>
        <FolderOpen className="mr-2 size-4" /> Choose a folder…
      </Button>
      {!desktop ? <p className="text-xs text-muted-foreground">Available in the desktop app.</p> : null}
      {!projectId ? <p className="text-xs text-muted-foreground">Create a project first.</p> : null}
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {progress.folderLinked ? <p className="text-xs text-emerald-500">Folder linked.</p> : null}
    </div>
  );
}

export function ProviderStep({
  progress,
  update,
}: {
  progress: WizardProgress;
  update: (p: Partial<WizardProgress>) => void;
}) {
  const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [key, setKey] = useState("");

  // fetchCatalog() falls back to FALLBACK_CATALOG when models.dev is unreachable.
  void fetchCatalog().then((c) => setProviders(flattenProviders(c).map((p) => ({ id: p.id, name: p.name }))));

  async function save(withKey: boolean): Promise<void> {
    if (!chosen) return;
    // create() returns the persisted AiConnection row, not an id (src/lib/db/repos/chat.ts:19-31).
    const conn = await aiConnectionsRepo.create({ providerId: chosen, label: chosen, apiKey: "" });
    if (withKey && key.trim()) {
      const { setSecret } = await import("@/lib/secrets");
      await setSecret(aiKeySecret(conn.id), key.trim()); // P2.T7 — key goes to the OS keychain, never Dexie
    }
    update({ providerChosen: true });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Choose an AI provider</h2>
      <p className="text-sm text-muted-foreground">
        A key is optional: you can start with local notes, tasks and files and add a provider later in
        Settings → AI Providers. Keys are stored in the Windows credential store, never in the workspace.
      </p>
      <div className="flex flex-wrap gap-2">
        {providers.slice(0, 8).map((p) => (
          <Button key={p.id} size="sm" variant={chosen === p.id ? "default" : "outline"} onClick={() => setChosen(p.id)}>
            {p.name}
          </Button>
        ))}
      </div>
      <label className="block space-y-1 text-xs text-muted-foreground">
        API key (optional)
        <Input value={key} onChange={(e) => setKey(e.target.value)} type="password" placeholder="sk-…" autoComplete="off" />
      </label>
      <div className="flex gap-2">
        <Button disabled={!chosen} onClick={() => void save(true)}>
          <KeyRound className="mr-2 size-4" /> Save provider
        </Button>
        <Button variant="ghost" onClick={() => void save(false)}>
          No key needed yet — decide later
        </Button>
      </div>
      {progress.providerChosen ? <p className="text-xs text-emerald-500">Provider saved.</p> : null}
    </div>
  );
}
```

`MigrateStep` renders one `input[type=file]` (`accept=".json,application/json"`), calls `parseBackup(text, db)` + `importBackup(db, file, "replace")` from `src/lib/db/backup-import.ts` (P4.T2), shows the record count, and offers "Skip — I'm starting fresh" (sets `progress.migrationSeen`). `FinishStep` shows the close-to-tray choice described in T11 and a SmartScreen note when `process.platform === "win32"`:

```tsx
export function FinishStep() {
  const desktop = getDesktop();
  const [hideOnClose, setHideOnClose] = useState(false);
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">You're set</h2>
      <p className="text-sm text-muted-foreground">
        Data lives in <code>%APPDATA%\MasarFlow</code> and in this app's local database; a rolling backup is
        written automatically. Nothing leaves this computer except the requests you send to your AI provider.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={hideOnClose}
          onChange={(e) => {
            setHideOnClose(e.target.checked);
            if (desktop) void desktop.settings.set({ closeToTray: e.target.checked });
          }}
        />
        <span>Keep MasarFlow running in the notification area when I close the window (off by default)</span>
      </label>
      <p className="text-xs text-muted-foreground">
        This build is not code-signed, so Windows SmartScreen may warn on install: choose “More info” → “Run
        anyway”. See SECURITY.md.
      </p>
    </div>
  );
}
```

**Edit `src/app/(workspace)/layout.tsx`:**

1. Add imports: `getDesktop` from `@/lib/desktop/bridge`, `shouldShowWizard` from `@/lib/onboarding/state`, `SetupWizard` from `@/components/onboarding/setup-wizard`.
2. Replace the first-run block (`:62-67`) with:

```tsx
  // First run (P10): the wizard replaces the bare project dialog when the
  // desktop app has never finished setup. `?setup=1` forces it (Control Center
  // button + e2e). Read from window.location, not useSearchParams: this is the
  // root client layout and a searchParams read here would force every page
  // into a CSR bailout (see layout `:136-145` for the existing Suspense dance).
  const [wizardForced, setWizardForced] = useState(false);
  const [settings, setSettings] = useState<{ onboardingCompletedAt: string | null } | null>(null);
  useEffect(() => {
    setWizardForced(new URLSearchParams(window.location.search).get("setup") === "1");
    const d = getDesktop();
    if (d) void d.settings.get().then((s) => setSettings({ onboardingCompletedAt: (s.onboardingCompletedAt as string | null) ?? null }));
    else setSettings({ onboardingCompletedAt: null });
  }, []);
  const wizardOpen =
    settings !== null &&
    shouldShowWizard({
      desktop: getDesktop() !== null,
      completedAt: settings.onboardingCompletedAt,
      projectCount: projectCount ?? 0,
      forced: wizardForced,
    });
  const firstRunOpen = !wizardOpen && projectCount === 0;
```

3. Render `<SetupWizard onDone={() => setSettings({ onboardingCompletedAt: new Date().toISOString() })} />` **instead of** `<NewProjectDialog …>` when `wizardOpen`; the existing `<NewProjectDialog key={String(firstRunOpen)} open={firstRunOpen} …/>` block (`:152-160`) stays byte-for-byte for the browser case.

4. **Update P9's harness and journey spec — the same commit, because the wizard replaces the dialog they assume.** In `tests/e2e/desktop/_harness.ts` (P9 `:753-760`) `createFirstProject` currently waits for `page.getByRole("dialog")`, fills `"Project name"` and clicks `"Create project"`. The wizard adds a welcome step, so rewrite it as:

```ts
/** First-run path: an empty profile shows the setup wizard; walk it to the project step. */
export async function createFirstProject(page: Page, name: string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Set up MasarFlow" });
  await dialog.waitFor({ timeout: 60_000 });
  await dialog.getByRole("button", { name: /^Continue$/ }).click(); // welcome -> project
  await dialog.getByRole("button", { name: /Create a project|Create another/ }).click();
  const projectDialog = page.getByRole("dialog").filter({ has: page.getByPlaceholder("Project name") });
  await projectDialog.getByPlaceholder("Project name").fill(name);
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  await waitForShellReady(page);
}
```

Also add the fresh-profile launcher P10's spec needs (it must **not** wait for `[data-testid="shell-ready"]`, which only exists once a project is active — P9 `:609`):

```ts
/**
 * Fresh profile with no project: the wizard is up and the shell is NOT ready, so
 * this is deliberately separate from launchApp() (which waits for shell-ready).
 */
export async function launchFreshApp(): Promise<AppHandle> {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "masarflow-e2e-"));
  const app = await electron.launch({
    executablePath: packagedExe(),
    args: [`--user-data-dir=${path.join(profileDir, "profile")}`],
    env: { ...process.env, MASARFLOW_E2E: "1" },
  });
  const page = await app.firstWindow();
  await page.waitForSelector('[data-testid="app-shell"]', { timeout: 120_000 });
  await page.getByRole("dialog", { name: "Set up MasarFlow" }).waitFor({ timeout: 90_000 });
  return {
    app,
    page,
    profileDir,
    async close() {
      await app.close().catch(() => {});
    },
  };
}
```

Then in `tests/e2e/desktop/journey.spec.ts` change step 1's expected copy from the old first-run line to the wizard's welcome text, and record the change in `reports/p10/GATE.md` (T16) with the reason: *the wizard supersedes the bare first-run dialog (master §7 row P10)*.

**Create `tests/e2e/desktop/onboarding.spec.ts`** (packaged app, per P9's "the packaged app is the target" rule — a browser spec would not satisfy master §3 item 2):

```ts
import { test, expect, launchFreshApp, launchFreshAppFrom } from "./_harness";

test("/dashboard: first-run setup wizard", async () => {
  const { page, close, profileDir } = await launchFreshApp();
  try {
    const wizard = page.getByRole("dialog", { name: "Set up MasarFlow" });
    await expect(wizard).toBeVisible();
    // 1. welcome: the local-first promise is on screen and Continue is the only way on
    await expect(wizard.getByText("stays on this computer")).toBeVisible();
    await expect(wizard.getByRole("button", { name: /^Skip$/ })).toHaveCount(0);

    // 2. project: Continue is blocked until a project exists
    await wizard.getByRole("button", { name: /^Continue$/ }).click();
    await expect(wizard.getByRole("button", { name: /^Continue$/ })).toBeDisabled();
    await wizard.getByRole("button", { name: /Create a project/ }).click();
    const projectDialog = page.getByRole("dialog").filter({ has: page.getByPlaceholder("Project name") });
    await projectDialog.getByPlaceholder("Project name").fill("Wizard Project");
    await projectDialog.getByRole("button", { name: "Create project" }).click();
    await expect(wizard.getByText("Project ready.")).toBeVisible();

    // 3. folder step is skippable (linking is proven in /files and the folder picker is native)
    await wizard.getByRole("button", { name: /^Continue$/ }).click();
    await expect(wizard.getByText(/Link the folder on this computer/)).toBeVisible();
    await expect(wizard.getByRole("button", { name: /^Skip$/ })).toBeVisible();
    await wizard.getByRole("button", { name: /^Skip$/ }).click();

    // 4. provider step: the no-key path must exist (the app is usable before any key exists)
    await expect(wizard.getByText(/Choose an AI provider/)).toBeVisible();
    await expect(wizard.getByRole("button", { name: /No key needed yet/ })).toBeVisible();

    // 5. finish: writes onboardingCompletedAt and the wizard never comes back
    await wizard.getByRole("button", { name: /^Skip$/ }).click(); // migrate
    await expect(wizard.getByText(/^You're set$/)).toBeVisible();
    await wizard.getByRole("button", { name: /Start using MasarFlow/ }).click();
    await expect(wizard).toHaveCount(0);
    await page.waitForSelector('[data-testid="shell-ready"]', { timeout: 120_000 });

    // relaunch on the same profile: no wizard (the setting lives in the main process)
    const again = await launchFreshAppFrom(profileDir);
    try {
      await expect(again.page.getByRole("dialog", { name: "Set up MasarFlow" })).toHaveCount(0);
    } finally {
      await again.close();
    }
  } finally {
    await close();
  }
});
```

…where `launchFreshAppFrom(profileDir)` is a three-line second export in `_harness.ts` that reuses the same `--user-data-dir` without waiting for the wizard:

```ts
/** Relaunch on an existing profile (persistence checks). Does not wait for anything. */
export async function launchFreshAppFrom(profileDir: string): Promise<AppHandle> {
  const app = await electron.launch({
    executablePath: packagedExe(),
    args: [`--user-data-dir=${path.join(profileDir, "profile")}`],
    env: { ...process.env, MASARFLOW_E2E: "1" },
  });
  const page = await app.firstWindow();
  await page.waitForSelector('[data-testid="app-shell"]', { timeout: 120_000 });
  return { app, page, profileDir, async close() { await app.close().catch(() => {}); } };
}
```

Add to `tests/e2e/feature-matrix.json` **in the same commit** (master §6): `"/dashboard"` gains `"first-run setup wizard"` (append to the array P9 filled — never replace it).

**Run:**

```bash
pnpm typecheck && pnpm lint
pnpm test -- tests/unit/lib/onboarding/state.test.ts      # 7 passed
pnpm desktop:dist:dir                                      # ≈90 s; the spec needs the packaged binary
pnpm e2e:desktop -- tests/e2e/desktop/onboarding.spec.ts   # 1 passed
pnpm e2e:desktop -- tests/e2e/desktop/journey.spec.ts      # still 1 passed after the helper rewrite
```

Expected: typecheck clean, lint 0 errors, `7 passed` (unit), `1 passed` (both specs). If the wizard spec fails at "Continue is disabled", the `canAdvance` wiring from T3 was bypassed — fix the layout, not the test.

Commit: `feat(onboarding): first-run wizard with project, folder, provider and migration steps`

---

## P10.T5 — Wizard actions: folder linking + migration import (TDD for the pure part, ≈8 min)

**Create the rest of `src/lib/onboarding/actions.ts`:**

```ts
import { linkedProjectsRepo } from "@/lib/db/repos";
import { parseBackup, importBackup, BackupError } from "@/lib/db/backup-import";
import { db } from "@/lib/db";
// `basenameOf` was added to this same file in T3 and is already exercised there.

export type LinkResult = { ok: true; name: string } | { ok: false; error: string };

/**
 * Link a folder the user just picked. The folder is already in the main
 * process root allow-list (the native picker writes roots.json, P2.T4), so the
 * validation call goes through the P2 guard. In a browser this is expected to
 * fail with the "not been linked" message — that is the guard working.
 */
export async function linkFolder({ projectId, path }: { projectId: string; path: string }): Promise<LinkResult> {
  const name = basenameOf(path) || path;
  const res = await fetch("/api/fs/list", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ root: path, depth: 0, maxEntries: 1 }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) return { ok: false, error: json.error ?? "That folder could not be opened." };
  await linkedProjectsRepo.create({ projectId, name, rootPath: path });
  return { ok: true, name };
}

/** Read + validate a v0.1.x / v0.2 export without touching the database (preview before import). */
export function readMigrationFile(text: string): { ok: true; summary: string; rows: number } | { ok: false; error: string } {
  try {
    const file = parseBackup(text, db);
    const rows = Object.values(file.tables).reduce((n, t) => n + t.length, 0);
    return { ok: true, summary: `${rows} records, exported ${new Date(file.exportedAt).toLocaleString()}`, rows };
  } catch (e) {
    return { ok: false, error: e instanceof BackupError ? e.message : "That file is not a MasarFlow backup." };
  }
}

/** Apply a validated export in place (replace semantics, same as Settings → Data). */
export async function applyMigration(text: string): Promise<number> {
  const summary = await importBackup(db, parseBackup(text, db), "replace");
  return Object.values(summary.tables).reduce((a, b) => a + b, 0);
}
```

(One file: `src/lib/onboarding/actions.ts` holds `basenameOf` from T3 plus `linkFolder`, `readMigrationFile` and `applyMigration` from here. The self-import is intentionally absent.)

**Failing test first (extend `tests/unit/lib/onboarding/state.test.ts` with a second file `tests/unit/lib/onboarding/actions.test.ts`):** `readMigrationFile` is the only pure-enough entry point here, and it needs `fake-indexeddb` because `parseBackup` takes `db`:

```ts
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { readMigrationFile } from "@/lib/onboarding/actions";
import { serializeBackup, exportBackup } from "@/lib/db/backup";
import { db } from "@/lib/db";

describe("readMigrationFile", () => {
  it("rejects garbage with a human message", () => {
    expect(readMigrationFile("not json")).toEqual({ ok: false, error: expect.stringMatching(/backup/i) });
  });
  it("accepts a real export and reports its size", async () => {
    const text = serializeBackup(await exportBackup(db, "0.1.6.0"));
    const result = readMigrationFile(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary).toMatch(/records/);
  });
});
```

Run → PASS once the module exists (the first assertion is the guard for the wizard's error copy). `pnpm test -- tests/unit/lib/onboarding/actions.test.ts` → `2 passed`. `pnpm typecheck` → clean.

Commit: `feat(onboarding): folder linking and 0.1 migration actions`

---

## P10.T6 — Redaction rules and the diagnostics report (pure, TDD, ≈10 min)

**Why:** master Q6 — no telemetry; "Copy diagnostics" is the whole support story. The redaction rule must be **stated** and **tested**, not implied: *no keys, tokens, PATs or bridge secrets ever; the user's home directory becomes `%USERPROFILE%`; any path outside the registered roots becomes `<redacted-path>`.*

**Failing test — `tests/unit/desktop/shared/ring-buffer.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { RingBuffer } from "@desktop-shared/ring-buffer";

describe("RingBuffer", () => {
  it("keeps the newest N lines", () => {
    const b = new RingBuffer(3);
    ["a", "b", "c", "d"].forEach((l) => b.push(l));
    expect(b.tail(2)).toEqual(["c", "d"]);
    expect(b.tail(10)).toEqual(["b", "c", "d"]);
    expect(b.size).toBe(3);
  });
  it("rejects a nonsense capacity", () => {
    expect(() => new RingBuffer(0)).toThrow(/positive/);
  });
});
```

**Create `desktop/src/shared/ring-buffer.ts`:**

```ts
/** Fixed-size line buffer used for the main process log tail shown in the Control Center. */
export class RingBuffer {
  private lines: string[] = [];

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("RingBuffer capacity must be a positive integer");
  }

  push(line: string): void {
    this.lines.push(line);
    if (this.lines.length > this.capacity) this.lines.splice(0, this.lines.length - this.capacity);
  }

  tail(n: number): string[] {
    return n >= this.lines.length ? [...this.lines] : this.lines.slice(this.lines.length - n);
  }

  get size(): number {
    return this.lines.length;
  }

  clear(): void {
    this.lines = [];
  }
}
```

**Failing test — `tests/unit/desktop/shared/diagnostics.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { redactText, isAllowedPath, buildDiagnosticsReport, REDACTION_RULES } from "@desktop-shared/diagnostics";

const opts = { allowedPaths: ["C:\\Users\\trookish\\Dev\\MyGame"], userHome: "C:\\Users\\trookish" };

describe("isAllowedPath", () => {
  it("accepts the root and anything under it, case-insensitively", () => {
    expect(isAllowedPath("C:\\Users\\trookish\\Dev\\MyGame", opts.allowedPaths)).toBe(true);
    expect(isAllowedPath("C:\\Users\\trookish\\Dev\\MyGame\\src\\main.cs", opts.allowedPaths)).toBe(true);
    expect(isAllowedPath("c:/users/trookish/dev/mygame/src", opts.allowedPaths)).toBe(true);
  });
  it("rejects siblings that merely share a prefix", () => {
    expect(isAllowedPath("C:\\Users\\trookish\\Dev\\MyGame2", opts.allowedPaths)).toBe(false);
    expect(isAllowedPath("C:\\Users\\trookish\\Dev", opts.allowedPaths)).toBe(false);
    expect(isAllowedPath("D:\\secret", opts.allowedPaths)).toBe(false);
  });
});

describe("redactText", () => {
  it("masks the home directory and foreign paths", () => {
    const out = redactText("cwd=C:\\Users\\trookish\\AppData\\Roaming\\MasarFlow\\logs other=D:\\keys", opts);
    expect(out).toContain("%USERPROFILE%");
    expect(out).not.toContain("trookish");
    expect(out).toContain("<redacted-path>");
  });
  it("keeps paths inside a registered root", () => {
    const out = redactText("root=C:\\Users\\trookish\\Dev\\MyGame\\src\\a.ts", opts);
    expect(out).toContain("Dev\\MyGame\\src\\a.ts");
  });
  it("masks provider keys, PATs and bridge secrets", () => {
    const out = redactText("key=sk-abcdefghijklmnopqrstuvwxyz012345 pat=ghp_0123456789abcdefghijklmn bridge=msf_bridge_0123456789abcdef", opts);
    expect(out).not.toMatch(/sk-abcdef/);
    expect(out).not.toMatch(/ghp_0123/);
    expect(out).not.toMatch(/msf_bridge_/);
  });
  it("masks opaque long strings (launch tokens) but leaves URLs alone", () => {
    const token = "b".repeat(64);
    const out = redactText(`token=${token} url=https://github.com/trookish/MasarFlow/releases`, opts);
    expect(out).not.toContain(token);
    expect(out).toContain("https://github.com/trookish/MasarFlow/releases");
  });
});

describe("buildDiagnosticsReport", () => {
  it("states the redaction rule at the top", () => {
    const md = buildDiagnosticsReport([{ title: "App", lines: ["version 0.2.0.0"] }]);
    expect(md).toContain("# MasarFlow diagnostics");
    expect(md).toContain(REDACTION_RULES[0]);
    expect(md).toContain("## App");
    expect(md).toContain("version 0.2.0.0");
  });
});
```

**Create `desktop/src/shared/diagnostics.ts`:**

```ts
/** The redaction contract, printed at the top of every diagnostics report. */
export const REDACTION_RULES = [
  "No API keys, tokens, PATs, bridge secrets or launch tokens are included.",
  "The user home directory is replaced with %USERPROFILE%.",
  "Paths outside your linked project folders are replaced with <redacted-path>.",
  "What you copy may still name folders you linked on purpose; read it before pasting it anywhere.",
] as const;

export interface RedactionOptions {
  /** Absolute paths allowed to appear verbatim (the roots.json allow-list). */
  allowedPaths: string[];
  /** Home directory to collapse to %USERPROFILE%. */
  userHome: string;
}

const winPath = /[A-Za-z]:[\\/][^\s"'`)\]]+/g;
const posixHomePath = /\/(?:home|Users|root)\/[^\s"'`)\]]+/g;
const urlPlaceholder = "\u0000URL\u0000";
const urls = /https?:\/\/[^\s"'`)\]]+/g;

function normalize(p: string): string {
  return p.trim().replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
}

/** True when `path` is a registered root or inside one (boundary-correct). */
export function isAllowedPath(path: string, allowedPaths: string[]): boolean {
  const target = normalize(path);
  return allowedPaths.some((root) => {
    const r = normalize(root);
    return r.length > 0 && (target === r || target.startsWith(`${r}/`));
  });
}

/** Apply every REDACTION_RULES entry. Pure: same input, same output, no IO. */
export function redactText(text: string, opts: RedactionOptions): string {
  let out = text;
  // 0. Protect URLs so the path rule cannot eat a release link.
  out = out.replace(urls, urlPlaceholder);
  // 1. Explicit secret shapes.
  out = out.replace(/\b(?:gh[pousr]_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9_-]{8,}|msf_[A-Za-z0-9_-]{8,})\b/g, "<redacted-token>");
  // 2. Generic opaque blobs (launch tokens, base64 blobs).
  out = out.replace(/\b[A-Za-z0-9_-]{40,}\b/g, "<redacted>");
  // 3. Home directory.
  if (opts.userHome) {
    out = out.split(opts.userHome).join("%USERPROFILE%");
    out = out.split(opts.userHome.replaceAll("\\", "/")).join("%USERPROFILE%");
  }
  // 4. Foreign paths.
  const mask = (m: string): string => (isAllowedPath(m, opts.allowedPaths) ? m : "<redacted-path>");
  out = out.replace(winPath, mask).replace(posixHomePath, mask);
  // 5. Restore URLs.
  out = out.split(urlPlaceholder).join("");
  return out;
}

export interface DiagnosticsSection {
  title: string;
  lines: string[];
}

/** Render the report the Copy-diagnostics button puts on the clipboard. */
export function buildDiagnosticsReport(sections: DiagnosticsSection[]): string {
  const head = [
    "# MasarFlow diagnostics",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Redaction:",
    ...REDACTION_RULES.map((r) => `- ${r}`),
    "",
  ];
  const body = sections.flatMap((s) => [`## ${s.title}`, "", ...s.lines.map((l) => `- ${l}`), ""]);
  return [...head, ...body].join("\n");
}
```

Run → **PASS**. Then `pnpm test -- tests/unit/desktop/shared/` → 4 files, `Tests 15 passed` (app-settings 4, version 2, ring-buffer 2, diagnostics 7 — `updater-status` arrives in T9); `pnpm desktop:typecheck` → exit 0.

Mutation checks (run once each, restore after): drop rule 1 → the PAT test fails; change `startsWith(`${r}/`)` to `startsWith(r)` → the "MyGame2" test fails.

Commit: `feat(diagnostics): tested redaction rules and report builder`

---

## P10.T7 — Main-process collector, secret presence, changelog reader, IPC (≈12 min)

**Failing test first — extend the existing `tests/unit/desktop/secrets.test.ts` (created in P2.T6; same `codec`/`file()` helpers, same `@desktop/secrets` import) with a `has()` case:**

```ts
  it("reports presence without returning the value", () => {
    const s = new SecretStore(file(), codec);
    s.set("github:pat", "ghp_x");
    expect(s.has("github:pat")).toBe(true);
    expect(s.has("ai-connection:missing")).toBe(false);
  });
```

Run → FAIL (`s.has is not a function`). **Edit `desktop/src/main/secrets.ts`** — add inside `SecretStore`:

```ts
  /** Presence only. Main process answers; the value never crosses IPC (P10 B5). */
  has(key: string): boolean {
    return this.get(key) !== "";
  }
```

Run → PASS.

**Create `desktop/src/main/logging.ts`:**

```ts
import { RingBuffer } from "@shared/ring-buffer";
import { MAX_LOG_BYTES, isRotatable, isPrunable, isRotatedFileName } from "@shared/log-rotation";
import { existsSync, renameSync, rmSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/** Last 400 log lines of the main process, for the Control Center and Copy diagnostics. */
export const LOG_BUFFER = new RingBuffer(400);

/** Prefix console output with a scope and keep the tail in memory + in the log file. */
export function installLogBuffer(): void {
  const wrap = (level: "log" | "warn" | "error"): void => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      LOG_BUFFER.push(`${new Date().toISOString()} ${level.toUpperCase()} ${args.map(String).join(" ")}`);
      original(...args);
    };
  };
  (["log", "warn", "error"] as const).forEach(wrap);
}

export function logLine(scope: string, message: string): void {
  console.log(`[${scope}] ${message}`);
}

export function logTail(n: number): string[] {
  return LOG_BUFFER.tail(n);
}

/* ---------------------------------------------------------------------------
 * Server-log rotation + deletion — P8's R-P8-5 hands this to P10: nothing
 * truncated logs/server.log before, so a long-running install grows it forever.
 * The app-server child appends to it; the main process rotates it before the
 * child starts, so no file is written by two processes at once.
 * ------------------------------------------------------------------------- */

export function logDir(): string {
  return join(app.getPath("userData"), "logs");
}

/** Rename a log file over the limit to <name>.1 (replacing any previous .1). */
export function rotateLogFile(file: string): boolean {
  if (!existsSync(file)) return false;
  if (!isRotatable(statSync(file).size)) return false;
  rmSync(`${file}.1`, { force: true });
  renameSync(file, `${file}.1`);
  return true;
}

/** Rotate every server log we own; called once at startup, before the child spawns. */
export function rotateServerLogs(): void {
  for (const name of ["server.log", "desktop.log"]) rotateLogFile(join(logDir(), name));
}

/** Delete rotated files (.1/.2…) older than KEEP_ROTATED_DAYS. Returns the count removed. */
export function pruneRotatedLogs(now = Date.now()): number {
  if (!existsSync(logDir())) return 0;
  let removed = 0;
  for (const entry of readdirSync(logDir())) {
    if (!isRotatedFileName(entry)) continue;
    const path = join(logDir(), entry);
    if (isPrunable(now - statSync(path).mtimeMs)) {
      rmSync(path, { force: true });
      removed += 1;
    }
  }
  return removed;
}
```

The **decisions** live in a pure module (testable without Electron), the **IO** in `logging.ts`:

`desktop/src/shared/log-rotation.ts`

```ts
/** Pure rules for log rotation; the IO lives in desktop/src/main/logging.ts (T7). */
export const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB
export const KEEP_ROTATED_DAYS = 7;

export function isRotatable(sizeBytes: number): boolean {
  return sizeBytes > MAX_LOG_BYTES;
}

export function isPrunable(ageMs: number): boolean {
  return ageMs > KEEP_ROTATED_DAYS * 24 * 60 * 60 * 1000;
}

/** `server.log.2` yes, `server.log` no, `latest.yml` no. */
export function isRotatedFileName(name: string): boolean {
  return /\.log\.\d+$/.test(name);
}
```

`tests/unit/desktop/shared/log-rotation.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { isRotatable, isPrunable, isRotatedFileName, MAX_LOG_BYTES } from "@desktop-shared/log-rotation";

describe("log rotation rules", () => {
  it("rotates above the limit, not at it", () => {
    expect(isRotatable(MAX_LOG_BYTES)).toBe(false);
    expect(isRotatable(MAX_LOG_BYTES + 1)).toBe(true);
  });
  it("prunes files older than a week", () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    expect(isPrunable(week)).toBe(false);
    expect(isPrunable(week + 1)).toBe(true);
  });
  it("recognises only rotated log names", () => {
    expect(isRotatedFileName("server.log.1")).toBe(true);
    expect(isRotatedFileName("server.log")).toBe(false);
    expect(isRotatedFileName("desktop.log.12")).toBe(true);
  });
});
```

Run → FAIL (module missing) → create the module → **PASS (`Tests 3 passed`)**. Then `logging.ts` imports `isRotatable`/`isPrunable`/`isRotatedFileName` instead of the two local constants and the inline regex. Call order in `desktop/src/main/index.ts`: `installLogBuffer()` → `rotateServerLogs()` → `pruneRotatedLogs()` → spawn the app-server child.

Add to the file map: `desktop/src/shared/log-rotation.ts` (new, T7) and `tests/unit/desktop/shared/log-rotation.test.ts` (new, T7 → **10** vitest files).

**Create `desktop/src/main/diagnostics.ts`:**

```ts
import { app, safeStorage } from "electron";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildDiagnosticsReport, redactText, type DiagnosticsSection } from "@shared/diagnostics";
import { APP_DISPLAY_VERSION } from "@shared/version";
import { readRootsFile } from "./security/roots";
import { listBackups } from "./backups";
import { logTail } from "./logging";
import { SecretStore, createSafeStorageCodec, isValidSecretKey } from "./secrets";

export interface DiagnosticsInput {
  /** Keys to report as present/absent — never their values. */
  secretKeys: string[];
  /** Update phase, supplied by the IPC handler (desktop/src/main/updater.ts, wired in T9). */
  updatePhase?: string;
}

/** Everything the Control Center shows, as redacted markdown. */
export function collectDiagnostics(input: DiagnosticsInput): { markdown: string; generatedAt: string } {
  const userData = app.getPath("userData");
  const rootsFile = join(userData, "roots.json");
  const roots = readRootsFile(rootsFile);
  const secrets = new SecretStore(join(userData, "secrets.json"), createSafeStorageCodec(safeStorage));
  const backups = listBackups(join(userData, "backups"));
  const logs = ["server.log", "main.log"];

  const sections: DiagnosticsSection[] = [
    {
      title: "App",
      lines: [
        `version ${app.getVersion()}`,
        `display version ${APP_DISPLAY_VERSION}`,
        `packaged ${app.isPackaged}`,
        `portable ${process.env.PORTABLE_EXECUTABLE_DIR ? "yes" : "no"}`,
        `platform ${process.platform} ${process.arch}`,
        `electron ${process.versions.electron} / chrome ${process.versions.chrome} / node ${process.versions.node}`,
        `userData ${userData}`,
      ],
    },
    {
      title: "Security",
      lines: [
        `secret storage available ${secrets.available()}`,
        `registered roots ${roots.length}`,
        ...input.secretKeys.filter(isValidSecretKey).map((k) => `secret ${k} ${secrets.has(k) ? "present" : "absent"}`),
      ],
    },
    { title: "Backups", lines: backups.slice(0, 10).map((b) => `${b.name} (${new Date(b.mtimeMs).toISOString()})`) },
    { title: "Updates", lines: [input.updatePhase ?? "not checked"] },
    {
      title: "Logs",
      lines: logs.flatMap((name) => {
        const file = join(userData, "logs", name);
        if (!existsSync(file)) return [`${name}: missing`];
        const mb = (statSync(file).size / 1_048_576).toFixed(1);
        return [`${name}: ${mb} MB`];
      }),
    },
    { title: "Main log tail (last 40 lines)", lines: logTail(40) },
  ];

  const markdown = redactText(buildDiagnosticsReport(sections), { allowedPaths: roots, userHome: app.getPath("home") });
  return { markdown, generatedAt: new Date().toISOString() };
}

/** Raw (unredacted) file contents are never returned — only the redacted report above. */
export function readChangelog(maxBytes = 512 * 1024): string {
  const file = app.isPackaged ? join(process.resourcesPath, "CHANGELOG.md") : join(app.getAppPath(), "..", "CHANGELOG.md");
  try {
    return readFileSync(file, "utf8").slice(0, maxBytes);
  } catch {
    return "";
  }
}
```

**Wire IPC (append; shared files — one stream at a time):**

1. `desktop/src/shared/channels.ts`: append `secretsHas: "secrets:has", diagnosticsCollect: "diagnostics:collect", changelogRead: "changelog:read", logsOpenFolder: "logs:openFolder",`.
2. `desktop/src/shared/api.ts`: add to `MasarflowApi`:
   ```ts
   secrets: { available(): Promise<boolean>; get(key: string): Promise<string>; set(key: string, value: string): Promise<void>; delete(key: string): Promise<void>; has(key: string): Promise<boolean> };
   diagnostics: { collect(input: { secretKeys: string[] }): Promise<{ markdown: string; generatedAt: string }> };
   changelog: { read(): Promise<string> };
   logs: { openFolder(): Promise<void> };
   ```
   (extend the existing `secrets` block from P2 — do not duplicate it).
3. `desktop/src/preload/index.ts`: mirror the three additions with `ipcRenderer.invoke`.
4. `desktop/src/main/ipc/index.ts` (inside `registerIpc`, next to the P2 secret handlers): `secrets:has` validating `isValidSecretKey`; `diagnostics:collect` forwarding `secretKeys` (array of strings, capped at 50) into `collectDiagnostics`; `changelog:read` → `readChangelog()`; `logs:openFolder` → `shell.openPath(logDir())` (`logDir()` from `./logging`).
5. `desktop/src/main/index.ts`: call `installLogBuffer()` as the first statement after `app.setName("MasarFlow")`, then `rotateServerLogs()` and `pruneRotatedLogs()` **before** the app-server child spawns (P8's R-P8-5: nothing truncated `logs/server.log` before P10).

**Run:** `pnpm test -- tests/unit/desktop/secrets.test.ts` → all pass (P2's 5 + 1 new); `pnpm test -- tests/unit/desktop/shared/log-rotation.test.ts` → `3 passed`; `pnpm desktop:typecheck && pnpm typecheck` → exit 0.

Commit: `feat(diagnostics): main-process collector, secret presence, log rotation and changelog over IPC`

---

## P10.T8 — Control Center page, reachable from the UI (≈16 min)

**Why:** master §3 item 5 (no route without a caller) and F10 — launcher-only capabilities must be reachable from the workspace. One nav entry makes the page reachable from the sidebar, the command palette and the dock (B: `PAGE_PATHS` derives from `ALL_NAV_ITEMS`). The tray menu item arrives in T11.

**Files:** `src/app/(workspace)/control-center/page.tsx`, `src/components/control-center/control-center-view.tsx`, `src/components/control-center/update-panel.tsx`, edit `src/lib/nav.ts`, `src/components/settings/settings-view.tsx`, `tests/e2e/feature-matrix.json`, new `tests/e2e/desktop/control-center.spec.ts`.

**Create `src/app/(workspace)/control-center/page.tsx`:**

```tsx
"use client";

import { ControlCenterView } from "@/components/control-center/control-center-view";

export default function ControlCenterPage() {
  return <ControlCenterView />;
}
```

**Create `src/components/control-center/control-center-view.tsx`** — six tabs, all data from real surfaces:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Database, FolderOpen, KeyRound, RefreshCw, ScrollText } from "lucide-react";
import { getDesktop } from "@/lib/desktop/bridge";
import { useMounted } from "@/lib/hooks/use-mounted";
import { AutoBackupsCard } from "@/components/settings/auto-backups-card";
import { backupNow } from "@/lib/db/auto-backup";
import { UpdatePanel } from "./update-panel";
import { Button } from "@/components/ui/button";

type Tab = "overview" | "roots" | "secrets" | "backups" | "logs" | "updates";

/** Keys the Control Center reports as present/absent. Labels only — never values. */
const SECRET_KEYS: Array<{ key: string; label: string }> = [
  { key: "github:pat", label: "GitHub token" },
  { key: "obsidian:api-key", label: "Obsidian local REST API key" },
];

export function ControlCenterView() {
  const mounted = useMounted();
  const desktop = mounted ? getDesktop() : null;
  const [tab, setTab] = useState<Tab>("overview");
  const [info, setInfo] = useState<{ version: string; displayVersion: string; userData: string; packaged: boolean } | null>(null);
  const [health, setHealth] = useState<string>("checking…");
  const [roots, setRoots] = useState<string[]>([]);
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [connectionKeys, setConnectionKeys] = useState<string[]>([]);
  const [markdown, setMarkdown] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/health").catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as { ok?: boolean; version?: string } | null) : null;
    setHealth(json?.ok ? `ok (build ${json.version ?? "?"})` : "no answer from the local service");
    if (!desktop) return;
    setInfo(await desktop.app.info());
    setRoots(await desktop.roots.list());
    const keys = SECRET_KEYS.map((k) => k.key);
    const { aiConnectionsRepo } = await import("@/lib/db/repos");
    const { aiKeySecret } = await import("@/lib/db/repos/chat-secrets");
    const connections = await aiConnectionsRepo.list(); // list(), not all() — src/lib/db/repos/chat.ts:13
    const connKeys = connections.map((c) => aiKeySecret(c.id));
    setConnectionKeys(connKeys);
    const all = [...keys, ...connKeys];
    const flags: Record<string, boolean> = {};
    for (const k of all) flags[k] = await desktop.secrets.has(k);
    setPresent(flags);
    const report = await desktop.diagnostics.collect({ secretKeys: all });
    setMarkdown(report.markdown);
  }, [desktop]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load of external state
    void refresh();
  }, [refresh]);

  async function copyDiagnostics(): Promise<void> {
    const d = getDesktop();
    if (!d) return;
    await d.clipboard.writeText(markdown);
    setNote("Diagnostics copied to the clipboard (keys and foreign paths removed).");
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "roots", label: "Folders", icon: FolderOpen },
    { id: "secrets", label: "Secrets", icon: KeyRound },
    { id: "backups", label: "Backups", icon: Database },
    { id: "logs", label: "Logs", icon: ScrollText },
    { id: "updates", label: "Updates", icon: RefreshCw },
  ];

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Control Center</h1>
          <p className="text-sm text-muted-foreground">
            {info ? `MasarFlow ${info.displayVersion} (${info.version}) · ${info.userData}` : "Running in a browser — desktop information unavailable."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
          <Button onClick={() => void copyDiagnostics()} disabled={!markdown}>
            Copy diagnostics
          </Button>
        </div>
      </header>
      <nav className="flex flex-wrap gap-1" aria-label="Control Center sections">
        {tabs.map((t) => (
          <Button key={t.id} size="sm" variant={tab === t.id ? "default" : "ghost"} onClick={() => setTab(t.id)}>
            <t.icon className="mr-2 size-4" />
            {t.label}
          </Button>
        ))}
      </nav>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {tab === "overview" ? (
        <section className="space-y-2 text-sm">
          <p>Local service: {health}</p>
          <p>Registered folders: {roots.length}</p>
          <p>Automatic backups: listed in the Backups tab</p>
          <p>Secrets present: {Object.values(present).filter(Boolean).length}</p>
        </section>
      ) : null}
      {tab === "roots" ? (
        <section className="space-y-2 text-sm">
          {roots.length === 0 ? <p className="text-muted-foreground">No folders linked yet. Link one from the wizard or a project.</p> : null}
          <ul className="space-y-1">{roots.map((r) => <li key={r} className="font-mono text-xs">{r}</li>)}</ul>
        </section>
      ) : null}
      {tab === "secrets" ? (
        <section className="space-y-2 text-sm">
          <p className="text-muted-foreground">Only presence is shown; values never leave the OS credential store.</p>
          <ul className="space-y-1">
            {[...SECRET_KEYS.map((s) => ({ key: s.key, label: s.label })), ...connectionKeys.map((k) => ({ key: k, label: `AI connection ${k.split(":")[1]?.slice(0, 8) ?? ""}` }))].map((row) => (
              <li key={row.key}>
                {row.label}: {present[row.key] ? "present" : "absent"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {tab === "backups" ? (
        <section className="space-y-3">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void backupNow()}>Back up now</Button>
            <Button variant="ghost" onClick={() => void desktop?.backups.openFolder()}>Reveal backup folder</Button>
          </div>
          <AutoBackupsCard />
        </section>
      ) : null}
      {tab === "logs" ? (
        <section className="space-y-3">
          <p className="text-xs text-muted-foreground">
            The report below is what “Copy diagnostics” puts on your clipboard. Review it before pasting it anywhere.
          </p>
          {/* P8's handoff: the browser-side report lives in src/components/tools/system-panel.tsx
              and stays there for the web case. This one comes from the main process
              (diagnostics:collect) because roots/secrets/backups/updater only exist there.
              Do not "deduplicate" them into one function — they run in two different processes. */}
          <textarea readOnly value={markdown} className="h-80 w-full rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px]" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void copyDiagnostics()}>Copy diagnostics</Button>
            <Button variant="ghost" onClick={() => void desktop?.logs.openFolder()}>Open logs folder</Button>
            <a className="text-xs underline" href="/tools/logs">Browse server logs →</a>
          </div>
          <p className="text-xs text-muted-foreground">
            Server logs rotate at 5 MB and rotated logs are deleted after 7 days; the report above ends with the most recent main-process lines.
          </p>
        </section>
      ) : null}
      {tab === "updates" ? <UpdatePanel /> : null}
    </div>
  );
}
```

(`logs.openFolder` is the `logs:openFolder` IPC added in T7 — P8's `logs-panel.tsx` already has an equivalent button for the web case; the Control Center adds the desktop-side path plus the rotation policy line, which is exactly the R-P8-5 work P8 handed over.)

`<UpdatePanel />` is created in T9; until then (T8 commit) stub it as `export function UpdatePanel() { return <p className="text-sm text-muted-foreground">Updates arrive in T9.</p>; }` and replace it in T9 — do **not** leave the stub in the final release.

**Edit `src/lib/nav.ts`** — add to the `System` group (`:118-145`), before `{ label: "Settings", … }`:

```ts
      {
        label: "Control Center",
        href: "/control-center",
        icon: Activity,
        keywords: ["diagnostics", "logs", "update", "backup", "health", "secrets", "folders"],
      },
```

and add `Activity` to the `lucide-react` import block at the top of the file. `PAGE_PATHS`, the sidebar, the palette and the dock pick it up with no further change (`src/lib/dock/registry.ts:22-24`).

**Edit `src/components/dock/panel-loader.tsx` too — a nav item without a loader breaks two guards.** That file already maps path → route component via `next/dynamic` (`src/components/dock/panel-loader.tsx:17-23,25-118`, 22 entries today) and P8 adds a static guard that asserts, for **every** `PAGE_PATHS` entry, the loader source contains `"<path>": dynamic(` (`tests/unit/lib/dock/panels-guard.test.ts`, P8 plan `:1553-1573`). Since `PAGE_PATHS` derives from nav, skipping this step turns that guard red. Add in P8's exact shape (P8 plan `:1478-1483`):

```tsx
  "/control-center": dynamic(() => import("@/app/(workspace)/control-center/page"), { ssr: false, loading }),
```

`loading`/`PanelLoading` are already in scope there (P8.T5 replaced the local spinner). Run `pnpm test -- tests/unit/lib/dock/panels-guard.test.ts` → passes with the new path included (P8 `:4838-4856` shows the same guard repeated in the packaged matrix test).

**Edit `src/components/settings/settings-view.tsx`** — in `DataSection` (`:807`) add a row above the reset control:

```tsx
      <SettingRow
        label="Control Center"
        description="Health, linked folders, stored secrets, backups, logs and updates in one place."
      >
        <Button variant="outline" onClick={() => router.push("/control-center")}>
          Open Control Center
        </Button>
      </SettingRow>
```

**Create `tests/e2e/desktop/control-center.spec.ts`** (packaged app, default `desktop` fixture = a real profile with demo data, so roots/secrets/backup surfaces are exercised for real):

```ts
import { test, expect, openRoute } from "./_harness";

test("/control-center: diagnostics and update panel", async ({ desktop }) => {
  const { page } = desktop;
  await openRoute(page, "Control Center"); // sidebar click, so the dock URL sync is exercised
  await expect(page.getByRole("heading", { name: "Control Center" })).toBeVisible();
  // The header prints the real 4-part version from the main process (D11).
  await expect(page.getByText(/MasarFlow 0\.2\.0\.0 \(0\.2\.0\)/)).toBeVisible();

  // Overview: the local service answered on the app protocol
  await expect(page.getByText(/Local service: ok/)).toBeVisible();

  // Folders: the allow-list viewer renders (empty on a fresh --user-data-dir profile)
  await page.getByRole("button", { name: "Folders" }).click();
  await expect(page.getByText(/No folders linked yet/)).toBeVisible();

  // Secrets: presence only — never a value
  await page.getByRole("button", { name: "Secrets" }).click();
  await expect(page.getByText(/never leave the OS credential store/)).toBeVisible();
  await expect(page.getByText(/^GitHub token: (present|absent)$/)).toBeVisible();

  // Logs: the redacted report is rendered and copyable, redaction rule #0 included
  await page.getByRole("button", { name: "Logs" }).click();
  const report = page.getByRole("textbox");
  await expect(report).toHaveValue(/# MasarFlow diagnostics/);
  await expect(report).toHaveValue(/No API keys, tokens, PATs/);
  await expect(report).toHaveValue(/display version 0\.2\.0\.0/);

  // Updates: the panel is live (a win-unpacked run reports the dev reason, an installed build reports a version)
  await page.getByRole("button", { name: "Updates" }).click();
  await expect(page.getByRole("button", { name: /Check now/ })).toBeVisible();
  await expect(page.getByText(/Development build|portable build cannot update itself|Not checked yet|up to date/i)).toBeVisible();

  // And it is reachable from Settings too (no route without a caller — master §3 item 5)
  await openRoute(page, "Settings");
  await expect(page.getByText("Health, linked folders, stored secrets, backups, logs and updates in one place.")).toBeVisible();
});
```

**Add to `tests/e2e/feature-matrix.json`:** `"/control-center": ["diagnostics and update panel"]` — same commit, or the matrix guard fails (and P10 adds no line to `ROUTES_WITHOUT_FEATURES`, which P9 emptied — P9 A11).

**Run:**

```bash
pnpm desktop:dist:dir                                      # ≈90 s
pnpm e2e:desktop -- tests/e2e/desktop/control-center.spec.ts   # 1 passed
pnpm test -- tests/unit/e2e/feature-matrix.test.ts         # 3 passed (matrix keys == the (workspace)
                                                           # route scan: 22 today + 3 from P8
                                                           # (/tools/terminal,/tools/logs,/tools/system)
                                                           # + /control-center = 26 keys)
pnpm test -- tests/unit/repo-truth/dead-routes.test.ts tests/unit/repo-truth/setting-consumers.test.ts
pnpm typecheck && pnpm lint
```

Commit: `feat(control-center): diagnostics, folders, secrets, backups, logs and updates page`

---

## P10.T9 — Real auto-update: electron-updater, feed config, IPC (≈18 min)

**Install (exact commands, verified versions):**

```bash
cd /c/Users/trookish/Dev/Web-Projects/MasarFlow
pnpm --dir desktop add --save-dev electron-updater@6.8.10
pnpm --dir desktop ls electron-updater     # expect: electron-updater 6.8.10
```

**Why that version and that dependency slot (decision + rejected alternative):** 6.8.10 is the version the package's own `v26` dist-tag points at (verified on the npm registry, published 2026-09-26) and matches electron-builder 26.15.3; 7.x is `alpha` and requires node ≥ 22.12. It goes into **devDependencies** and is **bundled** into `out/main/index.js` by electron-vite (B6): its only requires are pure-JS packages plus `electron`, and bundling avoids shipping a pnpm-symlinked `node_modules` tree inside the asar — the exact failure mode master R1 calls out. *Rejected:* `dependencies` + `rollupOptions.external` + `asarUnpack` (mirrors `node-pty`, but then the app must carry ~8 transitive packages through pnpm's symlink farm).

**Failing test — `tests/unit/desktop/shared/updater-status.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { isUpdatableBuild, allowedPrerelease, initialUpdaterStatus, reduceUpdaterEvent, describeUpdaterStatus } from "@desktop-shared/updater-status";

describe("isUpdatableBuild", () => {
  it("refuses dev builds and the portable exe", () => {
    expect(isUpdatableBuild({ packaged: false, portable: false })).toBe(false);
    expect(isUpdatableBuild({ packaged: true, portable: true })).toBe(false);
    expect(isUpdatableBuild({ packaged: true, portable: false })).toBe(true);
  });
});

describe("allowedPrerelease", () => {
  it("maps the update channel to electron-updater's allowPrerelease", () => {
    expect(allowedPrerelease("stable")).toBe(false);
    expect(allowedPrerelease("test")).toBe(true);
  });
});

describe("event reduction", () => {
  it("walks checking -> available -> downloading -> ready, with percent", () => {
    let s = initialUpdaterStatus("0.2.0");
    s = reduceUpdaterEvent(s, { type: "checking" });
    expect(s.phase).toBe("checking");
    s = reduceUpdaterEvent(s, { type: "available", version: "0.2.1" });
    expect(s).toMatchObject({ phase: "available", availableVersion: "0.2.1" });
    s = reduceUpdaterEvent(s, { type: "progress", percent: 42 });
    expect(s).toMatchObject({ phase: "downloading", percent: 42 });
    s = reduceUpdaterEvent(s, { type: "downloaded", version: "0.2.1" });
    expect(s.phase).toBe("ready");
  });
  it("records errors without losing the current version, and is idle-safe", () => {
    const s = reduceUpdaterEvent(initialUpdaterStatus("0.2.0"), { type: "error", message: "getaddrinfo ENOTFOUND" });
    expect(s.phase).toBe("error");
    expect(s.currentVersion).toBe("0.2.0");
    expect(describeUpdaterStatus(s)).toMatch(/try again/i);
  });
  it("says so when there is nothing newer", () => {
    const s = reduceUpdaterEvent(initialUpdaterStatus("0.2.0"), { type: "not-available" });
    expect(s.phase).toBe("current");
    expect(describeUpdaterStatus(s)).toMatch(/up to date/i);
  });
});
```

**Create `desktop/src/shared/updater-status.ts`:**

```ts
export type UpdateChannel = "stable" | "test";

export type UpdaterPhase = "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "error" | "disabled";

export interface UpdaterStatus {
  phase: UpdaterPhase;
  currentVersion: string;
  availableVersion: string | null;
  percent: number;
  message: string | null;
  /** Reason the updater is off, when phase === "disabled". */
  disabledReason: string | null;
}

export type UpdaterEvent =
  | { type: "checking" }
  | { type: "not-available" }
  | { type: "available"; version: string }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string }
  | { type: "disabled"; reason: string };

/** Auto-update needs an installed (NSIS) build: not a dev run, not the portable exe. */
export function isUpdatableBuild(input: { packaged: boolean; portable: boolean }): boolean {
  return input.packaged && !input.portable;
}

export function allowedPrerelease(channel: UpdateChannel): boolean {
  return channel === "test";
}

export function initialUpdaterStatus(currentVersion: string): UpdaterStatus {
  return { phase: "idle", currentVersion, availableVersion: null, percent: 0, message: null, disabledReason: null };
}

export function reduceUpdaterEvent(status: UpdaterStatus, event: UpdaterEvent): UpdaterStatus {
  switch (event.type) {
    case "checking":
      return { ...status, phase: "checking", message: null };
    case "not-available":
      return { ...status, phase: "current", availableVersion: null, percent: 0 };
    case "available":
      return { ...status, phase: "available", availableVersion: event.version, percent: 0 };
    case "progress":
      return { ...status, phase: "downloading", percent: Math.max(0, Math.min(100, Math.round(event.percent))) };
    case "downloaded":
      return { ...status, phase: "ready", availableVersion: event.version, percent: 100 };
    case "error":
      return { ...status, phase: "error", message: event.message };
    case "disabled":
      return { ...status, phase: "disabled", disabledReason: event.reason };
  }
}

export function describeUpdaterStatus(status: UpdaterStatus): string {
  switch (status.phase) {
    case "idle":
      return "Not checked yet.";
    case "checking":
      return "Checking for updates…";
    case "current":
      return "MasarFlow is up to date.";
    case "available":
      return `Version ${status.availableVersion} is available.`;
    case "downloading":
      return `Downloading… ${status.percent}%`;
    case "ready":
      return `Version ${status.availableVersion} is ready — restart to install, or it installs when you quit.`;
    case "error":
      return `Could not check for updates (${status.message ?? "unknown error"}). MasarFlow will try again when it next starts.`;
    case "disabled":
      return status.disabledReason ?? "Updates are unavailable in this build.";
  }
}
```

Run → **PASS**. Mutation check: swap `packaged && !portable` for `||` → the portable test fails.

**Create `desktop/src/main/updater.ts`:**

```ts
import { app, BrowserWindow } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import { CH } from "@shared/channels";
import {
  allowedPrerelease,
  initialUpdaterStatus,
  isUpdatableBuild,
  reduceUpdaterEvent,
  type UpdateChannel,
  type UpdaterEvent,
  type UpdaterStatus,
} from "@shared/updater-status";
import { settings } from "./settings";
import { logLine } from "./logging";

let status: UpdaterStatus = initialUpdaterStatus(app.getVersion());

export function updaterSnapshot(): UpdaterStatus {
  return status;
}

function emit(event: UpdaterEvent, win: () => BrowserWindow | null): UpdaterStatus {
  status = reduceUpdaterEvent(status, event);
  win()?.webContents.send(CH.updaterStatus, status);
  return status;
}

/** Wire electron-updater once, after the window exists. */
export function initUpdater(win: () => BrowserWindow | null): void {
  const appSettings = settings.get();
  const updatable = isUpdatableBuild({ packaged: app.isPackaged, portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR) });
  if (!updatable) {
    status = reduceUpdaterEvent(status, {
      type: "disabled",
      reason: app.isPackaged ? "The portable build cannot update itself — download the new version from the releases page." : "Development build — updates are disabled.",
    });
    return;
  }
  autoUpdater.autoDownload = false; // explicit: the user presses Download (master §3 Q6: no silent bandwidth)
  autoUpdater.autoInstallOnAppQuit = true; // "install on next quit" stays the default path
  autoUpdater.allowPrerelease = allowedPrerelease(appSettings.updateChannel as UpdateChannel);
  autoUpdater.logger = {
    // electron-updater's Logger is exactly { info, warn, error, debug? }
    // (out/types.d.ts:8-13); no cast needed.
    info: (m) => logLine("updater", String(m)),
    warn: (m) => logLine("updater", String(m)),
    error: (m) => logLine("updater", String(m)),
    debug: (m) => logLine("updater", m),
  };

  autoUpdater.on("checking-for-update", () => emit({ type: "checking" }, win));
  autoUpdater.on("update-not-available", () => emit({ type: "not-available" }, win));
  autoUpdater.on("update-available", (info: UpdateInfo) => emit({ type: "available", version: info.version }, win));
  autoUpdater.on("download-progress", (p: { percent: number }) => emit({ type: "progress", percent: p.percent }, win));
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => emit({ type: "downloaded", version: info.version }, win));
  autoUpdater.on("error", (e: Error) => emit({ type: "error", message: e.message.split("\n")[0]!.slice(0, 200) }, win));
}

export async function checkForUpdates(win: () => BrowserWindow | null): Promise<UpdaterStatus> {
  if (status.phase === "disabled") return status;
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    emit({ type: "error", message: e instanceof Error ? e.message : String(e) }, win);
  }
  return status;
}

export async function downloadUpdate(win: () => BrowserWindow | null): Promise<UpdaterStatus> {
  if (status.phase === "disabled") return status;
  try {
    await autoUpdater.downloadUpdate();
  } catch (e) {
    emit({ type: "error", message: e instanceof Error ? e.message : String(e) }, win);
  }
  return status;
}

/** Restart now: install and relaunch. `isSilent=false`, `isForceRunAfter=true`. */
export function installUpdateNow(): void {
  autoUpdater.quitAndInstall(false, true);
}

/** Re-read the channel preference and apply it without a restart. */
export function applyChannel(channel: UpdateChannel): void {
  autoUpdater.allowPrerelease = allowedPrerelease(channel);
}
```

**IPC + preload (append):** channels `updaterStatus: "updater:status"`, `updaterGet: "updater:get"`, `updaterCheck: "updater:check"`, `updaterDownload: "updater:download"`, `updaterInstall: "updater:install"`, `updaterSetChannel: "updater:set-channel"`; api:

```ts
  updater: {
    get(): Promise<UpdaterStatus>;
    check(): Promise<UpdaterStatus>;
    download(): Promise<UpdaterStatus>;
    /** Restart now and install. */
    install(): Promise<void>;
    setChannel(channel: "stable" | "test"): Promise<UpdaterStatus>;
    onStatus(cb: (status: UpdaterStatus) => void): () => void;
  };
```

preload: the four `ipcRenderer.invoke` calls plus an `onStatus` listener modelled on `window.onMaximized` (`desktop/src/preload/index.ts`, P1.T2). `ipc/index.ts`: register the handlers, delegating to `desktop/src/main/updater.ts`; `updaterSetChannel` first persists via `settings.set({ updateChannel })` then calls `applyChannel`; and extend the T7 `diagnostics:collect` handler to pass `updatePhase: updaterSnapshot().phase` into `collectDiagnostics`. `desktop/src/main/index.ts`: after the window is created, `initUpdater(() => mainWindow)` and, for packaged builds, `setTimeout(() => void checkForUpdates(() => mainWindow), 15_000)` (a launch check that cannot slow the start-up path; skipped in `SMOKE` mode).

**`desktop/electron-builder.yml` — add the GitHub feed and the changelog resource.** Append these two blocks to the file P1 rewrote (P1 plan `:1437-1464`); **keep P1's `extraResources: - from: app-server` entry** — the Control Center's "what changed" needs `CHANGELOG.md` next to it inside `resources/`:

```yaml
# Auto-update feed (F9). The workflow never lets electron-builder publish
# (that would create tag v0.2.0 instead of v0.2.0.0 — see P10.T14); this block
# only makes electron-builder emit latest.yml next to the installers.
publish:
  provider: github
  owner: trookish
  repo: MasarFlow
  channel: latest
  releaseType: release
extraResources:
  - from: app-server
    to: app-server
  - from: ../CHANGELOG.md
    to: CHANGELOG.md
```

**Create `src/components/control-center/update-panel.tsx`** — this replaces the T8 stub and must not ship as a placeholder: current version (`app.info().displayVersion`), channel selector (Stable/Test → `updater.setChannel`), **Check now** / **Download** / **Restart now** buttons, `describeUpdaterStatus(status)`, a progress bar bound to `status.percent`, the unsigned-build SmartScreen line (T10), and a "What changed" block fed by `desktop.changelog.read()` + `extractChangelogSection(md, pendingVersion)` (T14's parser, `src/lib/changelog.ts`).

**Renderer: point the existing update surface at the updater.** In `src/lib/stores/updates.ts` keep the legacy GitHub check for browser/dev, and add a desktop path:

```ts
import { getDesktop } from "@/lib/desktop/bridge";
import type { UpdaterStatus } from "@desktop-shared/updater-status";

// inside the store:
      updaterStatus: null as UpdaterStatus | null,
      check: async () => {
        const d = getDesktop();
        if (d) {
          set({ state: "checking", updaterStatus: await d.updater.check(), lastCheckedAt: Date.now() });
          set({ state: "checked" });
          return get().info ?? (await fetchUpdateInfo());
        }
        /* legacy browser path unchanged */
        ...
      },
      bindUpdater: () => {
        const d = getDesktop();
        if (!d) return () => {};
        void d.updater.get().then((s) => set({ updaterStatus: s }));
        return d.updater.onStatus((s) => set({ updaterStatus: s }));
      },
```

`src/components/shell/update-dialog.tsx` gains, when `updaterStatus?.phase` is `available|downloading|ready`, the buttons **Download**, **Restart now** (`updater.install()`), and the line “installs when you quit”, plus `describeUpdaterStatus(...)` as the body. `src/components/shell/topbar.tsx:27-29` shows the dot when `phase === "available" || phase === "ready"`. `src/app/(workspace)/layout.tsx`: next to the existing `useUpdatesStore … check()` effect (`:103-108`), add `const off = useUpdatesStore.getState().bindUpdater(); return off;`.

**`scripts/smoke-desktop.mjs`:** extend the success condition (it currently requires `guard.status === 403`, P2.T10) with `r.hasUpdater === true`, and extend the `executeJavaScript` payload in `desktop/src/main/index.ts` `runSmoke` with `hasUpdater: typeof window.masarflow?.updater?.check === "function"`.

**Run:**

```bash
pnpm test -- tests/unit/desktop/shared/updater-status.test.ts      # 5 passed
pnpm desktop:typecheck && pnpm typecheck && pnpm lint
pnpm desktop:dist:dir                                              # build box (also compiles the changelog resource + publish config)
ls desktop/dist/latest.yml desktop/dist/win-unpacked/MasarFlow.exe # latest.yml only appears with the `publish:` block present — if it is
                                                                   # missing, the YAML indent is wrong (or electron-builder < 26)
pnpm smoke:desktop                                                 # SMOKE_OK {"ok":true,…,"guard":{"status":403,…},"hasUpdater":true}
```

(`pnpm test -- tests/unit/e2e/feature-matrix.test.ts` → 3 passed; `pnpm e2e:desktop` still green against the packaged build.)

Commit: `feat(update): electron-updater with a GitHub release feed, status events and restart-now install`

---

## P10.T10 — Prove the update path before release + offline/portable/SmartScreen behaviour (≈14 min)

**Decision — the test feed is a GitHub *prerelease* on the real repo, tagged `v0.2.1.0-dev`.** Justification: it exercises the production path end to end (atom feed → tag resolution → `latest.yml` on the release → NSIS installer + blockmap download → install on quit/restart), needs **no** code or config changes (a `file://` dev feed would need `forceDevUpdateConfig` + `dev-app-update.yml` and only proves the Generic provider — the parts it skips, tag/channel resolution and asset naming, are exactly the parts that broke F9). Verified mechanics: the GitHub provider resolves the tag from `releases.atom`, then fetches `<owner>/<repo>/releases/download/<tag>/latest.yml`, falling back to `latest.yml` when `allowPrerelease` is on; the version compared is `updateInfo.version` (from `latest.yml`, i.e. package semver `0.2.1`), never the git tag.

**Procedure (OWNER ACTION — needs a push and a second build):**

1. Build the "old" app from the current tree and install it with the NSIS installer into a test profile:
   ```bash
   pnpm desktop:dist                 # NSIS + portable + latest.yml in desktop/dist
   ls desktop/dist/*.exe desktop/dist/latest.yml
   ```
   Note the installed version in the Control Center (must read `0.2.0.0`).
2. Build the "new" app: `pnpm version` is not used — set `desktop/package.json` + root `package.json` to `0.2.1`, keep `APP_DISPLAY_VERSION = "0.2.1.0"`, then `pnpm desktop:dist` again. (`scripts/release-verify.mjs` accepts this because it compares the *tag* to the display version, not to a hard-coded number.)
3. Publish the prerelease:
   ```bash
   gh release create v0.2.1.0-dev --prerelease --title "Update test 0.2.1.0-dev" \
     --notes "Test feed — do not install for real." \
     desktop/dist/*.exe desktop/dist/latest.yml desktop/dist/*.blockmap
   gh release view v0.2.1.0-dev --json isPrerelease,tagName,assets --jq '{tagName,isPrerelease,assets:[.assets[].name]}'
   ```
   Expected: `isPrerelease: true` and assets include `MasarFlow Setup 0.2.1.exe`, `MasarFlow 0.2.1.exe` (portable), `latest.yml`, and the `.blockmap`.
4. In the **installed 0.2.0.0 app**: Control Center → Updates → channel **Test**, press **Check now**. Expected: “Version 0.2.1 is available.”
   If it says “up to date”: `curl -s https://github.com/trookish/MasarFlow/releases.atom | head -40` — the first `<entry>` must be the `v0.2.1.0-dev` tag (prereleases do appear in the atom feed; **assumption to confirm here**).
5. Press **Download** → progress advances → “ready — restart to install, or it installs when you quit”.
6. Quit the app (no restart-now), let it install on quit, relaunch: the Control Center shows **0.2.1.0**. That single run proves check → download → install-on-quit. Run the same steps once more with **Restart now** to prove `quitAndInstall`.
7. Switch the channel back to **Stable**; press Check → expected “MasarFlow is up to date.” (proves `allowPrerelease=false` ignores the prerelease).
8. Delete the test release when done: `gh release delete v0.2.1.0-dev --yes --cleanup-tag`, then restore the version bump (`git checkout -- package.json desktop/package.json`) and set `APP_DISPLAY_VERSION` back to `0.2.0.0`.

**Fallback if the prerelease path is unavailable (no network / rate limit):** a local feed — `desktop/dev-app-update.yml` with `provider: generic` + `url: http://127.0.0.1:8123/` served by `npx http-server -p 8123 desktop/dist`, plus `autoUpdater.forceDevUpdateConfig = true` guarded by `process.env.MASARFLOW_UPDATER_DEV_FEED === "1"`. Document which one was used in `reports/`.

**Hardening checks that are code, not procedure (already covered by T9/T10 code paths — assert them by inspection in review):**

- **Offline:** `autoUpdater.checkForUpdates()` rejects → `emit({type:"error"})` → UI text “Could not check for updates … will try again when it next starts.” No modal, no retry loop; the launch check is a plain `setTimeout` that never blocks boot.
- **Portable build:** `PORTABLE_EXECUTABLE_DIR` is set (the same env var `desktop/src/main/settings.ts:25` already relies on) → `isUpdatableBuild()` false → phase `disabled` with the “download it from the releases page” reason, and the release URL is opened by the existing `shell.openExternal` channel.
- **Unsigned installer (Q3):** a `"warning"` line in the Update Panel when `!app.isPackaged ? … : true` — implement as a static note under the panel: “Installer updates are unsigned: Windows SmartScreen may ask you to confirm. More info → Run anyway.” Same sentence in README + SECURITY.md (T15) and in the release notes (T14).

**Run:** `pnpm test -- tests/unit/desktop/shared/updater-status.test.ts` → 5 passed; `pnpm desktop:typecheck && pnpm typecheck` → exit 0.

Commit: `feat(update): offline, portable and unsigned-build behaviour; documented test feed`

---

## P10.T11 — Close-to-tray default OFF (R6) + tray menu v2 (TDD for the rule, ≈10 min)

**Failing test — `tests/unit/desktop/shared/window-behavior.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { closeBehavior } from "@desktop-shared/window-behavior";

describe("closeBehavior", () => {
  it("quits by default (fresh installs must not hide into the tray — R6)", () => {
    expect(closeBehavior({ closeToTray: false, quitting: false })).toBe("quit");
  });
  it("hides only when the user asked for it", () => {
    expect(closeBehavior({ closeToTray: true, quitting: false })).toBe("hide");
  });
  it("always quits during shutdown, whatever the preference says", () => {
    expect(closeBehavior({ closeToTray: true, quitting: true })).toBe("quit");
  });
});
```

**Create `desktop/src/shared/window-behavior.ts`:**

```ts
/**
 * R6: a fresh install must not vanish into the notification area. Hiding is an
 * opt-in the user makes in the wizard or the Control Center.
 */
export function closeBehavior(input: { closeToTray: boolean; quitting: boolean }): "quit" | "hide" {
  if (input.quitting) return "quit";
  return input.closeToTray ? "hide" : "quit";
}
```

Run → **PASS**. Mutation check: invert the ternary → first test fails; restore.

**Edit `desktop/src/main/index.ts`:**

Replace `onClose: () => { quitting = true; }` (P1.T5's placeholder, comment “the tray 'hide on close' option arrives in P10”) with a handler that consults the setting:

```ts
  mainWindow = createMainWindow({
    devUrl: DEV_URL,
    onClose: (e) => {
      // `quitting` is set by before-quit / app.quit paths; a plain window close
      // follows the user's close-to-tray preference, which defaults to OFF.
      if (closeBehavior({ closeToTray: Boolean(settings.get().closeToTray), quitting }) === "hide") {
        e.preventDefault();
        mainWindow?.hide();
      } else {
        quitting = true;
      }
    },
  });
```

Replace the tray menu template (`createTray`, P1.T5) with:

```ts
function rebuildTrayMenu(): void {
  if (!tray) return;
  const hideOnClose = Boolean(settings.get().closeToTray);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open MasarFlow", click: showWindow },
      { type: "separator" },
      { label: "Control Center", click: () => void sendWindowRoute("/control-center") },
      { label: "Check for updates…", click: () => void checkForUpdates(() => mainWindow) },
      { label: "Open logs folder", click: () => void shell.openPath(join(app.getPath("userData"), "logs")) },
      { type: "separator" },
      {
        label: "Hide on close (keep running in the notification area)",
        type: "checkbox",
        checked: hideOnClose,
        click: (item) => {
          settings.set({ closeToTray: item.checked });
          rebuildTrayMenu();
        },
      },
      { type: "separator" },
      { label: "Quit MasarFlow", click: () => app.quit() },
    ]),
  );
}
```

with a small helper added next to `showWindow()`:

```ts
/** Focus the window and ask the renderer to navigate (the shell listens for this). */
function sendWindowRoute(route: string): void {
  showWindow();
  mainWindow?.webContents.send(CH.appNavigate, route);
}
```

and the matching renderer listener in `src/components/shell/` (a 10-line `useDesktopNavigation()` hook mounted in the layout next to `WindowControls`, using the `app.onNavigate` API below).

**IPC/api/preload additions:** channel `appNavigate: "app:navigate"`; api `app: { …, onNavigate(cb: (route: string) => void): () => void }`; preload mirrors `window.onMaximized`'s listener pattern; the hook `src/lib/hooks/use-desktop-navigation.ts` does `router.push(route)` when the route is a known page (`PAGE_PATHS.includes(route)` from `@/lib/dock/registry`), ignoring anything else.

**Control Center toggle:** in the Overview tab add a row bound to `settings.get()/set()`:

```tsx
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hideOnClose}
            onChange={async (e) => {
              setHideOnClose(e.target.checked);
              await desktop?.settings.set({ closeToTray: e.target.checked });
            }}
          />
          Keep MasarFlow running in the notification area when I close the window
        </label>
```

**Run:** `pnpm test -- tests/unit/desktop/shared/window-behavior.test.ts` → 3 passed; `pnpm desktop:typecheck && pnpm typecheck && pnpm lint` → green; `pnpm desktop:dist:dir && pnpm smoke:desktop` → `SMOKE_OK` (the smoke closes the window: with `closeToTray` false the app exits — this is exactly what the harness needs).

Commit: `feat(desktop): close-to-tray defaults off, tray menu with Control Center and updates`

---

## P10.T12 — macOS/Linux build config: compatible, not shipped (D12/Q4) (≈6 min)

**Edit `desktop/electron-builder.yml`** — append (Windows stays the only target we ever build in CI):

```yaml
# D12/Q4: Windows x64 is first-class for 0.2.0.0. These blocks exist so a future
# `--mac`/`--linux` run is a config change, not an archaeology project. They are
# NEVER built in CI for this release and are not validated — do not advertise them.
mac:
  category: public.app-category.developer-tools
  target:
    - target: dmg
      arch: [arm64, x64]
linux:
  category: Development
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
```

Also add, under `win:`, nothing new (keep `icon: resources/icon.png`), and keep `npmRebuild: false` + the `asarUnpack` node-pty entry untouched.

**Verify the Windows path is unaffected:**

```bash
python3 -c "import yaml,sys;[yaml.safe_load(open(f,encoding='utf-8')) for f in sys.argv[1:]];print('YAML_OK')" desktop/electron-builder.yml
pnpm desktop:dist:dir 2>&1 | tail -6      # expect the win-unpacked output line, no mac/linux target built
pnpm smoke:desktop                          # SMOKE_OK
```

`.gitignore` needs **no** change: `/desktop/dist/`, `/out/`, `/release/` are already ignored (`.gitignore:37,64,66`). Commit: `build(desktop): keep mac/linux targets compatible but unshipped`

---

## P10.T13 — CI workflow: PRs and pushes (≈12 min)

**Create `.github/workflows/ci.yml`:**

```yaml
name: CI

on:
  push:
    branches: [main, release/v0.2.0]
  pull_request:
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: windows-latest
    # The whole suite is Windows-only by design (D12): the packaged app, the
    # guard checks and the smoke harness all target win32.
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v7

      - name: Install pnpm
        uses: pnpm/action-setup@v6
        with:
          version: 11.21.0 # must match package.json "packageManager"

      - name: Install Node
        uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck (workspace)
        run: pnpm typecheck

      - name: Typecheck (desktop main/preload)
        run: pnpm desktop:typecheck

      - name: Lint
        run: pnpm lint

      - name: Unit tests
        run: pnpm test

      - name: Build (Next standalone + app-server)
        run: pnpm build:app

      - name: Upload build log on failure
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: ci-failure-logs
          path: |
            desktop/dist/*.yml
            .next/*.log
          if-no-files-found: ignore
          retention-days: 7
```

Notes — **action tags verified on this machine**, not from memory:

```bash
gh --version                              # gh 2.97.0 (2026-07-31)
gh auth status                            # ✓ logged in to github.com as trookish; scopes: delete_repo, gist, read:org, repo, workflow
for r in actions/checkout pnpm/action-setup actions/setup-node actions/upload-artifact actions/download-artifact; do
  gh api "repos/$r/git/refs/tags" --jq '.[].ref' | sed 's|refs/tags/||' | grep -E '^v[0-9]+$' | sort -V | tail -1
done
# -> actions/checkout v7 · pnpm/action-setup v6 · actions/setup-node v7 · actions/upload-artifact v7 · actions/download-artifact v8
```

So `checkout@v7`, `pnpm/action-setup@v6`, `setup-node@v7`, `upload-artifact@v7` are all real floating majors; pin them exactly as written above and re-run that loop before the first release (they float). `version: 11.21.0` matches root `package.json:6` `packageManager: pnpm@11.21.0` (read today) — `pnpm/action-setup` errors when the two disagree. `cache: pnpm` requires pnpm to be installed first, hence the step order. `pnpm build:app` is P1.T3's script (`next build && node scripts/build-app-server.mjs`). Note `upload-artifact@v7`/`download-artifact@v8` are the current majors — **do not** copy an old `@v4` from a tutorial.

**If `gh` were missing or unauthenticated** (`gh auth status` fails): `winget install --id GitHub.cli` then `gh auth login --web --scopes repo,workflow`; with no `gh` at all the workflow still works because the release job uses the runner's own `GITHUB_TOKEN` — only the owner-side verification commands (`gh release view`) and the owner-created test release need it. Without CLI access, do the same steps in the browser: repo → Releases → *Draft a new release* → choose tag → attach the four files → *Publish release*.

**Local pre-flight (run exactly these; CI runs the same commands):**

```bash
pnpm install --frozen-lockfile        # expect "Lockfile is up to date" then "Done"
pnpm typecheck                         # expect only "$ tsc --noEmit"
pnpm desktop:typecheck                 # expect only "$ tsc -p tsconfig.node.json --noEmit"
pnpm lint                              # expect 0 errors (0 warnings after P9)
pnpm test                              # expect "Tests  N passed" (N = P0 baseline + all phase additions)
pnpm build:app 2>&1 | tail -3          # expect "app-server ready: …\desktop\app-server"
```

**YAML syntax gate (PyYAML is installed on this machine — verified 6.0.3):**

```bash
python3 -c "import yaml,sys;[yaml.safe_load(open(f,encoding='utf-8')) for f in sys.argv[1:]];print('YAML_OK')" .github/workflows/ci.yml
# expect: YAML_OK
```

**OWNER ACTION — first push:** `git push -u origin release/v0.2.0` (hold the initial push until the P10 gate is green) → then `gh run list --branch release/v0.2.0 --limit 3` and `gh run watch`; expected: the `CI / verify` job succeeds on the first run. If the runner rejects an action version, `gh run view --log-failed` names it; the fallback is the previous major (`@v6`, verified to exist for checkout/setup-node/upload-artifact and `@v5` for actions/cache). No `gh`? Use the web UI: repo → Actions tab → the run appears at the top; a red X opens the same logs.

Commit: `ci: verify install, typecheck, lint, tests and the app-server build on Windows`

---

## P10.T14 — Tagged-release workflow and the publish mechanics (≈15 min)

**Create `src/lib/changelog.ts` (pure, reused by the Control Center's "What changed" panel; the two `scripts/*.mjs` do their own inline scan on purpose — plain Node in CI has no TypeScript loader, and the workflow asserts the notes file they emit)**

```ts
/** Extract the body of the "## [<version>]" section of a Keep-a-Changelog file. */
export function extractChangelogSection(markdown: string, version: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith("## ") && l.includes(`[${version}]`));
  if (start === -1) return null;
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) break;
    body.push(lines[i]);
  }
  return body.join("\n").trim();
}

/** The version headings present, newest first. */
export function changelogVersions(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .filter((l) => l.startsWith("## "))
    .map((l) => /\[([^\]]+)\]/.exec(l)?.[1] ?? "")
    .filter(Boolean);
}
```

Test it in `tests/unit/lib/changelog.test.ts` with the real file (this test starts failing the moment T15 writes `CHANGELOG.md` without a `[0.2.0.0]` section — a guard, not a formality):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractChangelogSection, changelogVersions } from "@/lib/changelog";
import { REPO_ROOT } from "../_helpers/fs-scan";

const md = readFileSync(join(REPO_ROOT, "CHANGELOG.md"), "utf8");

describe("CHANGELOG.md", () => {
  it("has a section for the release we are shipping", () => {
    const section = extractChangelogSection(md, "0.2.0.0");
    expect(section).toBeTruthy();
    expect(section).toMatch(/Added|Changed|Removed/);
  });
  it("lists versions newest first", () => {
    const versions = changelogVersions(md);
    expect(versions[0]).toBe("0.2.0.0");
  });
});
```

Create `CHANGELOG.md` with at least the `## [0.2.0.0]` heading in the same commit (T15 fills the entries). **Create `scripts/release-verify.mjs`:**

```js
#!/usr/bin/env node
// Fails when the version story is inconsistent. Run: node scripts/release-verify.mjs [tag]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
const semver = (v) => /^\d+\.\d+\.\d+$/.test(v);
const fourPart = (v) => /^\d+\.\d+\.\d+\.\d+$/.test(v);

const fails = [];
const rootPkg = read("package.json");
const deskPkg = read("desktop/package.json");
const ipc = readFileSync(path.join(root, "desktop/src/shared/version.ts"), "utf8");
const display = /APP_DISPLAY_VERSION\s*=\s*"([^"]+)"/.exec(ipc)?.[1] ?? "";
const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const builder = readFileSync(path.join(root, "desktop/electron-builder.yml"), "utf8");
const tag = (process.argv[2] ?? "").replace(/^v/, "");

if (!semver(rootPkg.version)) fails.push(`root package.json version "${rootPkg.version}" is not semver`);
if (!semver(deskPkg.version)) fails.push(`desktop/package.json version "${deskPkg.version}" is not semver`);
if (rootPkg.version !== deskPkg.version) fails.push(`version mismatch: root ${rootPkg.version} vs desktop ${deskPkg.version}`);
if (!fourPart(display)) fails.push(`APP_DISPLAY_VERSION "${display}" is not 4-part`);
if (fourPart(display) && semver(deskPkg.version) && !display.startsWith(deskPkg.version)) {
  fails.push(`APP_DISPLAY_VERSION ${display} does not start with package version ${deskPkg.version}`);
}
if (!changelog.includes(`[${display}]`)) fails.push(`CHANGELOG.md has no section for [${display}]`);
if (!/provider:\s*github/.test(builder) || !/repo:\s*MasarFlow/.test(builder) || !/owner:\s*trookish/.test(builder)) {
  fails.push("desktop/electron-builder.yml is missing the github publish block (owner/repo)");
}
if (tag && tag !== display) fails.push(`tag v${tag} does not match APP_DISPLAY_VERSION ${display}`);

if (fails.length) {
  console.error(`RELEASE_VERIFY_FAIL (${fails.length})\n - ${fails.join("\n - ")}`);
  process.exit(1);
}
console.log(`RELEASE_VERIFY_OK ${deskPkg.version} / v${display}`);
```

**Run it (expect PASS):**

```bash
node scripts/release-verify.mjs v0.2.0.0     # expect: RELEASE_VERIFY_OK 0.2.0 / v0.2.0.0
```

Mutation check (proves it bites): temporarily set `desktop/package.json` `"version": "0.2.1"` → expect `RELEASE_VERIFY_FAIL (1) - version mismatch: root 0.2.0 vs desktop 0.2.1`; revert.

**Create `scripts/release-notes.mjs`:**

```js
#!/usr/bin/env node
// CHANGELOG section -> release-notes.md (Keep-a-Changelog is the source of truth;
// the GitHub auto-generator is deliberately NOT used — it cannot know our P0..P10 story).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = (process.argv[2] ?? "").replace(/^v/, "");
const md = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const lines = md.split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith("## ") && l.includes(`[${version}]`));
if (start === -1) {
  console.error(`No CHANGELOG section for ${version}`);
  process.exit(1);
}
const body = [];
for (let i = start + 1; i < lines.length && !lines[i].startsWith("## "); i++) body.push(lines[i]);
const banner = [
  "> Windows build — unsigned. SmartScreen may warn on install: **More info → Run anyway**.",
  "> Existing 0.1 users: install **v0.1.6.0** first and use Settings → Data → Export, then import that file in the wizard.",
  "",
];
const notes = [...banner, ...body].join("\n").trim() + "\n";
writeFileSync(path.join(root, "release-notes.md"), notes);
console.log(`Release notes for ${version} written (${notes.split("\n").length} lines).`);
```

**Create `.github/workflows/release.yml`:**

```yaml
name: Release

on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      tag:
        description: Tag to build (must already exist)
        required: true

permissions:
  contents: write

jobs:
  build:
    runs-on: windows-latest
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
        with:
          version: 11.21.0
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile

      - name: Version consistency
        shell: bash
        run: node scripts/release-verify.mjs "${{ github.ref_name }}"

      - name: Build and package (no publish from electron-builder)
        shell: bash
        env:
          # Q3: we ship unsigned on purpose; stop electron-builder hunting for a cert.
          CSC_IDENTITY_AUTO_DISCOVERY: "false"
        run: pnpm desktop:dist

      - name: Assert the updater feed and installer exist
        shell: bash
        run: |
          # bash: each glob match becomes ONE word, spaces included — do not quote the glob,
          # and never paste this snippet into PowerShell (it would split "MasarFlow Setup 0.2.0.exe").
          ls -la desktop/dist/*.exe desktop/dist/latest.yml desktop/dist/*.blockmap
          test -s desktop/dist/latest.yml

      - name: Release notes from CHANGELOG
        shell: bash
        run: node scripts/release-notes.mjs "${{ github.ref_name }}"

      - name: Upload installer artifacts
        uses: actions/upload-artifact@v7
        with:
          name: masarflow-windows-${{ github.ref_name }}
          path: |
            desktop/dist/*.exe
            desktop/dist/latest.yml
            desktop/dist/*.blockmap
          retention-days: 30

      - name: Create the GitHub Release (draft)
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "${{ github.ref_name }}" \
            --draft --title "MasarFlow ${{ github.ref_name }}" --notes-file release-notes.md \
            desktop/dist/*.exe desktop/dist/latest.yml desktop/dist/*.blockmap
          gh release view "${{ github.ref_name }}" --json isDraft,tagName,assets --jq '{isDraft,tagName,assets:[.assets[].name]}'
```

Notes: `gh release create` is used instead of a third-party release action (fewer moving parts, and `softprops/action-gh-release` would add a v3 dependency we do not need); `--draft` + a manual publish step is deliberate — electron-updater only sees **published** releases, so a draft is invisible to users while the owner eyeballs the assets. `pnpm desktop:dist` is P1.T3's script (`build:app` + `electron-builder --win`), so `latest.yml` is produced from the `publish:` block added in T9 while nothing is uploaded by electron-builder (B7).

**Diagnostic-only packaged smoke job (optional, clearly non-authoritative):**

```yaml
  packaged-smoke:
    runs-on: windows-latest
    needs: build
    continue-on-error: true   # the authoritative packaged gate is run locally (see the Release checklist)
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
        with: { version: 11.21.0 }
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm desktop:dist:dir
      - name: Packaged smoke (diagnostic)
        shell: bash
        run: |
          pnpm smoke:desktop 2>&1 | tee smoke-ci.log
      - uses: actions/upload-artifact@v7
        if: always()
        with: { name: smoke-ci-log, path: smoke-ci.log, if-no-files-found: ignore }
```

Keep it `continue-on-error` and say so out loud in the plan and in the runbook: **a green CI smoke is not release evidence**; the owner-run `pnpm desktop:dist:dir && pnpm smoke:desktop` on the release commit is. If the runner proves reliable over two releases, promote the job (and only then).

**OWNER ACTION — cut the release (do not run these during implementation):**

```bash
git switch release/v0.2.0
pnpm test && pnpm typecheck && pnpm lint && pnpm desktop:typecheck
node scripts/release-verify.mjs v0.2.0.0
pnpm desktop:dist:dir && pnpm smoke:desktop        # SMOKE_OK (packaged gate, master §3 item 2)
git commit -am "chore(release): v0.2.0.0"          # only if T15/T16 left uncommitted files
git push -u origin release/v0.2.0
git tag -a v0.2.0.0 -m "MasarFlow v0.2.0.0"
git push origin v0.2.0.0                            # triggers .github/workflows/release.yml
gh run watch "$(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh release view v0.2.0.0 --json isDraft,assets --jq '{isDraft,assets:[.assets[].name]}'
gh release edit v0.2.0.0 --draft=false --latest     # publishes it; the updater's feed goes live now
```

Web-UI fallback for every `gh` line: repo → Releases → the draft titled `MasarFlow v0.2.0.0` → Edit → remove the draft flag → Publish release; tag creation: repo → Tags → Create tag at the release commit, then push (the workflow runs on the tag push).

Commit: `ci: tagged release workflow with feed assertions and CHANGELOG notes`

---

## P10.T15 — Documentation, version bump, release copy (≈18 min)

**Where the files go:** `README.md` (rewrite, exists at 17.5 KB), `SECURITY.md` (new), `CHANGELOG.md` (new), `LICENSE` (exists — **MIT**, verified; leave it), no `CONTRIBUTING.md` (single-developer repo; the README gets a one-paragraph "Contributing" section pointing at `AGENTS.md`).

**README.md — replace the 0.1-era text with these sections, in this order** (the old file's "Python sidecar / venv" walkthrough is gone as of P3, so this is a rewrite rather than an edit):

1. **MasarFlow** — one sentence: local-first desktop workspace for planning and building software (notes ↔ specs ↔ tasks ↔ docs ↔ code, with an AI chat that can see all of it).
2. **Install (Windows 10/11 x64)** — download `MasarFlow Setup 0.2.0.exe` from the latest release; run it; **SmartScreen (Q3)**: “Windows protected your PC” → *More info* → *Run anyway*, because the build is unsigned; the portable `MasarFlow 0.2.0.exe` is also published and cannot self-update.
3. **First run** — the wizard: what MasarFlow is, create/open a project, link a folder through the picker (only linked folders are readable), pick an AI provider (or skip — no key needed to use the workspace), optionally import a 0.1 export.
4. **Migrating from MasarFlow 0.1** — install `v0.1.6.0` first, Settings → Data → **Export**, then in 0.2 wizard step 5 (or Settings → Data → Import) pick that `.json`. Why this is needed: the old app stored data in a browser origin; 0.2 uses `masarflow://app` and cannot read the old IndexedDB (Q10).
5. **Where your data lives** — IndexedDB under the app origin + `%APPDATA%\MasarFlow` (`logs/`, `backups/`, `secrets.json` (encrypted), `roots.json`); rolling automatic backups with retention (5 newest + daily + weekly); “Restore from backup”, “Reveal backup folder”.
6. **Updates** — in-app via GitHub Releases: check on launch + manual, download on demand, install on quit or *Restart now*; “Test” channel installs prereleases; portable builds update manually.
7. **Privacy / local-first (Q6)** — no telemetry, no account, no analytics; the only outbound traffic is the provider you configure (plus GitHub for updates/PRs when you use those features); “Copy diagnostics” is the only thing we ever ask you to send, and it is redacted per the stated rules (link to SECURITY.md).
8. **Troubleshooting** — SmartScreen; “workspace could not be opened” → restore a backup; a folder that cannot be read → link it again with the picker (the allow-list is per machine); blank window → `%APPDATA%\MasarFlow\logs\server.log` + Copy diagnostics; update check failing offline.
9. **Development** — `pnpm install`, `pnpm dev` (browser), `pnpm dev:desktop` (Electron + HMR), `pnpm build:app`, `pnpm desktop:dist:dir`, `pnpm smoke:desktop`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm e2e` (browser specs), `pnpm e2e:desktop` (packaged-app specs — needs `pnpm desktop:dist:dir` first).
10. **Security** and **Contributing** — two short sections linking `SECURITY.md` and `AGENTS.md`.

**Create `SECURITY.md`:**

```markdown
# Security

## Reporting a vulnerability

Open a private security advisory: <https://github.com/trookish/MasarFlow/security/advisories/new>.
Do not open a public issue for a vulnerability. Include the version shown in **Control Center → Overview**,
what you did, and what happened. Expect an acknowledgement within a few days.

## Threat model (what MasarFlow defends against)

MasarFlow runs a local Next.js server for its own window. Anything on the machine — and any web page you
visit — can try to talk to a loopback port, so the app assumes it will:

1. The server binds `127.0.0.1` only and every request must carry a per-launch token that the renderer
   never sees; the Electron main process injects it into the `masarflow://app` proxy.
2. `Host` must be the loopback address (anti DNS-rebinding) and any `Origin` must be `masarflow://app`
   (anti CSRF).
3. Filesystem and shell routes only accept paths inside folders **you** picked through the native folder
   picker; that list lives in `%APPDATA%\MasarFlow\roots.json` and is written by the main process.
4. The renderer runs with `sandbox`, `contextIsolation`, no `nodeIntegration`, a CSP, a navigation lock and
   a permission handler; webviews are disabled.
5. API keys, the GitHub token and the Obsidian key are encrypted with the OS credential store
   (`safeStorage`) in `%APPDATA%\MasarFlow\secrets.json` — never in the workspace database or localStorage.
   Only presence is ever displayed (Control Center → Secrets).
6. Diagnostics are redacted: no keys, tokens or PATs, `%USERPROFILE%` instead of your home directory, and
   `<redacted-path>` for everything outside your linked folders.

## Known limits (0.2.0.0)

- The Windows installer is **not code-signed**: SmartScreen warns, and Windows cannot prove the binary came
  from us. Verify the SHA-256 of the installer against the release notes if you care.
- macOS/Linux builds are not produced (D12/Q4).
- A malicious local process running as your user can read your app data; MasarFlow protects the data from
  *remote* and *other-app* access, not from you.
```

**Create `CHANGELOG.md`** (Keep-a-Changelog; the 0.2.0.0 entry is written from master §7's phase map, one bullet group per phase — this is the text the release notes and the in-app "what changed" panel show):

```markdown
# Changelog

All notable changes to MasarFlow. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions use the project's 4-part display style (`0.2.0.0`); the packaged version is valid semver (`0.2.0`).

## [0.2.0.0] - 2026-10-XX

### Added
- One desktop application: the workspace now runs inside the app window on `masarflow://app` (P1).
- First-run wizard: create a project, link a folder with the native picker, choose an AI provider (a key is
  optional), and import data from MasarFlow 0.1 (P10).
- Control Center: service health, linked folders, secret presence, backups, log viewer with redacted
  “Copy diagnostics”, and the updater panel (P10).
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
- Closing the window now quits unless you turn on “Keep running in the notification area” (P10, R6).
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
```

(The `- 2026-10-XX` date is set by the owner at tag time — `scripts/release-verify.mjs` does **not** check the date, deliberately.)

**Version bump steps (exact):**

```bash
cd /c/Users/trookish/Dev/Web-Projects/MasarFlow
# 1. package semver (both manifests must match; release-verify enforces it)
node -e "const f='package.json';const j=require('./'+f);j.version='0.2.0';require('fs').writeFileSync(f, JSON.stringify(j,null,2)+'\n')"
node -e "const f='desktop/package.json';const j=require('./'+f);j.version='0.2.0';require('fs').writeFileSync(f, JSON.stringify(j,null,2)+'\n')"
# 2. the 4-part display version (desktop/src/shared/version.ts)
#    APP_DISPLAY_VERSION = \"0.2.0.0\"
# 3. prove the three agree
node scripts/release-verify.mjs v0.2.0.0        # RELEASE_VERIFY_OK 0.2.0 / v0.2.0.0
rg -n '"version"' package.json desktop/package.json
rg -n "APP_DISPLAY_VERSION" desktop/src/shared/version.ts
```

**Run:** `pnpm test` (the new `tests/unit/lib/changelog.test.ts` must pass → CHANGELOG has the section), `pnpm typecheck`, `pnpm lint`, `pnpm format:check` if you want prettier-clean markdown.

Commit: `docs: README, SECURITY and CHANGELOG for 0.2.0.0; bump to 0.2.0 / v0.2.0.0`

---

## P10.T16 — Clean-machine proof (master §3 item 4) — OWNER ACTION (≈60 min once the sandbox exists)

**Fact that shapes this task:** this machine has **no Windows Sandbox** (`C:\Windows\System32\WindowsSandbox.exe` absent; Hyper-V is present). Enabling it is an OWNER ACTION and needs admin + a reboot:

```powershell
# Owner, in an elevated PowerShell:
Enable-WindowsOptionalFeature -Online -FeatureName "Containers-DisposableClientVM" -All
# reboot when prompted, then verify:
Test-Path C:\Windows\System32\WindowsSandbox.exe    # expect True
```

Fallbacks if Sandbox stays unavailable: a Hyper-V VM (Hyper-V present) with a fresh Windows 11 image, or any VM/cloud Windows instance. A run on this dev box is **not** a clean-machine proof: Node, pnpm, Python and the repo are all installed here, which is exactly what the test is meant to rule out. Record which environment was used.

**Evidence goes in `reports/p10/`** — the convention P9 set up (`reports/README.md`, `reports/p9/**`) and already reserved for P10: `reports/p9/first-run-journey.md` row 8 says *"(P10, clean machine only) NSIS install on Windows Sandbox with no Node/Python"* with evidence at **`reports/p10/journey/**`**. Committed because the proof is part of the release record; keep it small (text logs + ≤ ~2 MB of screenshots):

```
reports/p10/clean-machine.md     the sign-off record (template below)
reports/p10/GATE.md              the P10 gate run + the P9-artifact changes this phase made
reports/p10/journey/install.log      transcript of the installer run
reports/p10/journey/01-wizard-welcome.png … 06-finish.png
reports/p10/journey/07-persistence.png       before/after restart
reports/p10/journey/08-update.png            the update panel after installing the test build
reports/p10/journey/09-uninstall.png
reports/p10/journey/stdout.txt               installer command output + timings
```

Then fill P9's row 8 (`reports/p9/first-run-journey.md`): replace the placeholder in its Evidence column with the file list above and mark it done. If P9's report is missing (phase skipped), say so explicitly in `reports/p10/GATE.md` rather than faking the row.

**Procedure (each step is a pass/fail line in `PASS.md`):**

1. In the sandbox, confirm it is clean: `where node` / `where python` / `where pnpm` → nothing; no `%APPDATA%\MasarFlow`; no `Program Files\MasarFlow`.
2. Copy **only** `MasarFlow Setup 0.2.0.exe` in (drag-and-drop), run it. Expect the SmartScreen warning → *More info* → *Run anyway* → install to the default per-user location. Pass bar: install completes, Start-menu entry appears, the app launches.
3. First run: the wizard appears (welcome → project → folder → provider → migrate → finish). Create a project; link a folder created inside the sandbox; choose "No key needed yet"; skip the 0.1 import; finish.
4. Post-wizard: the workspace renders (dashboard), no error screen, and closing + reopening does **not** show the wizard again (this is the `onboardingCompletedAt` proof).
5. Chat with a configured provider: in the Control Center add a provider with a real key, open Chat, send one message, get a reply. Pass bar: a reply arrives (this is the only step that needs the internet).
6. Restart persistence: create a note and a task, quit, relaunch → both still there, and `%APPDATA%\MasarFlow\backups\` contains at least one `masarflow-*.json.gz`.
7. Update to a newer build: the owner publishes an internal prerelease (T10's `v0.2.1.0-dev`, channel **Test**), the sandbox app checks, downloads, installs on quit, and relaunches as `0.2.1.0`.
8. Uninstall (Settings → Apps → MasarFlow) → `%APPDATA%\MasarFlow\backups\` still holds the backups, because P1 pins `deleteAppDataOnUninstall: false` in the `nsis` block (P1 plan `:1463`).

**`reports/p10/clean-machine.md` template:**

```markdown
# Clean-machine proof — MasarFlow v0.2.0.0
- Date / operator:
- Environment: Windows Sandbox | Hyper-V VM | other (name, Windows build):
- Installer: MasarFlow Setup 0.2.exe — SHA-256:
- Clean check (no node/python/pnpm, no %APPDATA%\MasarFlow): PASS/FAIL — evidence:
1 Install + SmartScreen: PASS/FAIL
2 Wizard (6 steps, no key): PASS/FAIL — journey/01…06
3 Wizard does not reappear: PASS/FAIL
4 Chat reply from a configured provider: PASS/FAIL
5 Restart persistence + a backup file exists: PASS/FAIL — journey/07-persistence.png
6 In-app update to 0.2.1.0 (test channel), install on quit: PASS/FAIL — journey/08-update.png
7 Uninstall keeps %APPDATA%\MasarFlow\backups: PASS/FAIL — journey/09-uninstall.png
- Cross-reference: reports/p9/first-run-journey.md row 8 → filled
- Result: PASS only if all of 1–7 PASS. Any FAIL → open an issue, fix, re-run the whole script.
```

**Pass bar (state it in the commit body):** every line above PASS, on a machine with no development tools, using only the artifact a stranger downloads.

Commit: `docs(release): clean-machine proof procedure and report template`

---

## P10.T17 — P10 gate (≈5 min)

Run top to bottom; every line must exit 0 / print the stated output. Nothing here is optional and nothing may be skipped with "it probably works".

1. **Unit + type + lint** — `pnpm test && pnpm typecheck && pnpm lint && pnpm desktop:typecheck` → vitest prints `Tests  N passed` (N = the P0 baseline plus every phase's additions; P10 contributes **10** new vitest files, listed in the file map), tsc prints nothing but its script line, ESLint `0 errors, 0 warnings`.
2. **Build + guard checks** — `pnpm build:app && pnpm security:check` → `app-server ready: …\desktop\app-server` then `SECURITY_CHECK_OK 12/12`.
3. **Packaged smoke** — `pnpm desktop:dist:dir && pnpm smoke:desktop` → `SMOKE_OK {"ok":true,"path":"/dashboard","origin":"masarflow://app","hasApi":true,"guard":{"status":403,…},"hasUpdater":true}` (the `hasUpdater` key is the P10 addition from T9).
4. **Version consistency** — `node scripts/release-verify.mjs v0.2.0.0` → `RELEASE_VERIFY_OK 0.2.0 / v0.2.0.0`.
5. **Workflow + builder YAML parse** — `python3 -c "import yaml,sys;[yaml.safe_load(open(f,encoding='utf-8')) for f in sys.argv[1:]];print('YAML_OK')" .github/workflows/ci.yml .github/workflows/release.yml desktop/electron-builder.yml` → `YAML_OK`.
6. **Browser e2e (dev convenience, not release evidence)** — `pnpm e2e` → the pre-existing specs still pass (`smoke.spec.ts`, `chat-*.spec.ts`); P10's two new specs do **not** run here (different `testDir`).
7. **Packaged e2e (the authoritative one — master §3 item 2)** — `pnpm desktop:dist:dir && pnpm e2e:desktop` → 0 failures against `desktop/dist/win-unpacked/MasarFlow.exe`, including `tests/e2e/desktop/onboarding.spec.ts`, `control-center.spec.ts` and P9's `journey.spec.ts` (whose first-run helper T4 rewrote). `pnpm e2e:desktop -- tests/e2e/desktop/onboarding.spec.ts` → `1 passed` when you want just the new ones.
8. **Feature-matrix truth** — `pnpm test -- tests/unit/e2e/feature-matrix.test.ts` → `3 passed`, with the matrix holding 26 keys (22 (workspace) routes verified today + P8's `/tools/terminal`, `/tools/logs`, `/tools/system` + P10's `/control-center`) and the P10 entries `"/dashboard": […,"first-run setup wizard"]` and `"/control-center": ["diagnostics and update panel"]`; plus `node scripts/truth-scan.mjs` → the four allow-lists empty.
9. **One commit per task** — `git log --oneline | head -20` → the 16 P10 commit messages above, no "wip".

Then the six-item release checklist below is the last gate before tagging. Write the whole run into `reports/p10/GATE.md` (same shape as P9's, including the deviations section: the wizard replacing P9's first-run dialog is one such deviation, and T12's unshipped mac/linux targets another).

---

## Risks / open questions for P10

- **R-P10-1 `gh release create` asset glob on Windows.** Git Bash expands `desktop/dist/*.exe` before `gh` sees it (that is what we want), but the `MasarFlow Setup 0.2.0.exe` name contains spaces — if `gh` is ever invoked from PowerShell, quote each path. Verify with the `gh release view --json assets` step; a missing asset is visible immediately.
- **R-P10-2 Unsigned builds and SmartScreen (Q3).** Documented in README/SECURITY/wizard/release notes; if a certificate appears later, add `win.certificateFile`/`CSC_LINK` and delete the notes. Nothing else changes.
- **R-P10-3 Bundled electron-updater vs asar.** Chosen deliberately (B6). If `pnpm desktop:dist:dir` ever fails to resolve a dependency during bundling, the fallback is `dependencies` + `rollupOptions.external` + `asarUnpack: "**/node_modules/electron-updater/**"` **plus** `node-linker=hoisted` for the build step (master R1) — record which one shipped.
- **R-P10-4 CI smoke reliability.** The packaged app on a GitHub runner may fail to open a window (no GPU/session guarantees). That is why the smoke job is `continue-on-error` and the authoritative gate is owner-run; if the job is green twice in a row, promote it and delete this note.
- **R-P10-5 Wizard vs. existing first-run dialog.** Two first-run paths now exist (wizard in the desktop app, `NewProjectDialog` in a browser or after a data reset). Both are covered: `tests/e2e/desktop/onboarding.spec.ts` walks the wizard in the packaged app on a fresh profile, the browser suite keeps exercising the dialog fallback, and T4 updates P9's `createFirstProject()` + `journey.spec.ts` step 1 so the packaged journey still passes. If a third path ever appears, collapse them into `shouldShowWizard`.
- **R-P10-6 `latest.yml` naming.** electron-builder writes `latest.yml` because `publish.channel` is `latest`; if a future release sets `channel: beta`, the file becomes `beta.yml` and the updater's `allowPrerelease` path picks it up automatically — do not hand-edit the yml files.
- **R-P10-7 Atom-feed assumption.** The test feed relies on prereleases appearing in `releases.atom`; the T10 step 4b check (`curl … releases.atom`) is the confirmation. If it turns out they do not, switch the test feed to a normal release in a throwaway repo (`trookish/MasarFlow-update-test`) and point `publish.owner/repo` there in a temporary build.
- **Q-P10-1** Should the Control Center be a dock page rather than a route? *Default: route (works in browser/dev, no dock-specific wiring, still reachable from the palette).*
- **Q-P10-2** Should "Copy diagnostics" redact linked-folder names too? *Default: no — you chose those folders, and hiding them makes support harder; the rule is printed above the report.*
- **Q-P10-3** Auto-download updates automatically instead of user-pressed? *Default: no (`autoDownload = false`) — metered connections; the launch check only informs.*
- **Q-P10-4** Do we want a `v0.1.6.0` release notes link inside the wizard's import step? *Default: yes — T15's README step 4 is the canonical text; embed the same two sentences in `MigrateStep`.*

---

## Release checklist — master §3's six items, one by one

| # | Gate item | Exact command / artifact | Expected result |
|---|---|---|---|
| 1 | `pnpm test`, `pnpm typecheck`, `pnpm lint` (0 errors **and** 0 warnings), `pnpm desktop:typecheck` | `pnpm test && pnpm typecheck && pnpm lint && pnpm desktop:typecheck` | all exit 0; `pnpm test` prints `Tests N passed` (N from P0.T1 + every phase); lint prints `0 errors, 0 warnings` (P9 removed the 4 `no-img-element` warnings) |
| 2 | `pnpm e2e:desktop` green against the **packaged** `win-unpacked` build; feature matrix has ≥1 passing test per listed feature and **no route with an empty list** | `pnpm desktop:dist:dir && pnpm e2e:desktop` (P9.T6 defines the script as `playwright test --config tests/playwright.desktop.config.ts --grep-invert @slow`) then `pnpm test -- tests/unit/e2e/feature-matrix.test.ts` | e2e reports 0 failures against `desktop/dist/win-unpacked/MasarFlow.exe`, including `tests/e2e/desktop/onboarding.spec.ts` and `tests/e2e/desktop/control-center.spec.ts`; the guard prints `3 passed` with `ROUTES_WITHOUT_FEATURES` empty and 26 matrix keys (22 + 3 from P8 + `/control-center`); the two P10 entries are present (`"/dashboard": …, "first-run setup wizard"` and `"/control-center": ["diagnostics and update panel"]`) |
| 3 | `node scripts/security-check.mjs` passes | `pnpm build:app && pnpm security:check` | `SECURITY_CHECK_OK 12/12` (12 PASS lines) |
| 4 | Clean-machine proof | `reports/p10/clean-machine.md` with steps 1–7 PASS + `reports/p10/journey/*.png` + `install.log`, produced per T16 in Windows Sandbox/a fresh VM, plus P9's `reports/p9/first-run-journey.md` row 8 filled | every line PASS; both records are committed with the release commit |
| 5 | No catalog plugin without a consumer; no route without a caller; no setting without a consumer — guard tests green with **empty** allowlists | `pnpm test -- tests/unit/lib/plugins-consumers.test.ts tests/unit/repo-truth/dead-routes.test.ts tests/unit/repo-truth/setting-consumers.test.ts tests/unit/repo-truth/anchor-contract.test.ts` then `node scripts/truth-scan.mjs` | each file PASS **and** every allowlist array literal is `[]` in the source (the P9 gate's own check); P10 adds no new plugin, route or setting without a consumer: `/control-center` has a nav entry + palette keywords + a spec, and `closeToTray` / `onboardingCompletedAt` / `updateChannel` are each read by a consumer (main-window close, wizard gate, updater) |
| 6 | `CHANGELOG.md`, `SECURITY.md`, rewritten `README.md`, tag `v0.2.0.0`, GitHub Release with signed-or-documented-unsigned installer | `node scripts/release-verify.mjs v0.2.0.0` → `RELEASE_VERIFY_OK 0.2.0 / v0.2.0.0`; `ls CHANGELOG.md SECURITY.md README.md`; then the OWNER ACTION block in T14 (`git tag -a v0.2.0.0`, `git push origin v0.2.0.0`, `gh release edit v0.2.0.0 --draft=false --latest`) | all three files exist and `release-verify` passes; the release page shows `MasarFlow Setup 0.2.0.exe`, the portable exe, `latest.yml` + `.blockmap`, notes containing the unsigned/SmartScreen sentence and the 0.1-migration sentence; `gh release view v0.2.0.0 --json isDraft,isLatest` → `{"isDraft":false,"isLatest":true}` |

**Post-release smoke (5 minutes, proves the feed users will hit):** on the owner's machine install the published `0.2.0.0` build, Control Center → Updates → channel Stable → Check now → expect “MasarFlow is up to date.” (this exercises the live atom feed + `releases/latest` → the published tag's `latest.yml`). Record the result at the bottom of `reports/p10/clean-machine.md`.

**If any item fails:** fix it in the task that owns it, re-run that item, and only then re-run the checklist from item 1 — the gate is all-or-nothing (master §3).
