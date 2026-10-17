# P10.T10 — the update path, proven locally (2026-10-17)

Command (all claims below come from this run):

```
pnpm desktop:dist:dir      # builds desktop/dist/win-unpacked + the portable exe
pnpm proof:update-local    # desktop/scripts/proof-update-local.mjs
```

Raw evidence: `reports/p10/update-path-proof.json` (same run). The proof uses a
*generic* feed on `127.0.0.1` — no request ever reaches github.com — and drives
the real renderer API (`window.masarflow.updater`) over CDP in the packaged app.

## Result: PROOF_OK

| # | Scenario | Setup | Observed |
|---|----------|-------|----------|
| A | local feed | packaged app + `MASARFLOW_UPDATER_DEV_FEED=1`, feed config from `MASARFLOW_UPDATER_FEED_FILE`, feed advertises `0.2.1` | `check()` → `available` / `0.2.1`; `download()` → `ready` / `percent 100`; events `checking → available → downloading → ready` |
| B | offline | same app, feed server stopped before the check | `check()` → `error`, `message: net::ERR_CONNECTION_REFUSED`; app alive, no crash, no hang |
| C | portable | `desktop/dist/MasarFlow <version>.exe` (portable stub sets `PORTABLE_EXECUTABLE_DIR`), no dev-feed flag | `phase: disabled`, reason: "The portable build cannot update itself — download the new version from the releases page." |

Installed version in all three runs: `0.2.0-alpha.0` (`app.getVersion()`); the
Control Center shows the four-part display version `0.2.0.0`.

## Behaviour matrix (what ships)

| Build | Updater |
|-------|---------|
| development (`pnpm dev`, `app.isPackaged === false`) | disabled — "Development build — updates are disabled." |
| portable exe | disabled (proven in C) |
| installed NSIS build | enabled; launch check 15 s after start; stable channel rejects prereleases, test channel allows them |
| smoke mode (`MASARFLOW_SMOKE`) | never initialised, never checks (smoke stays offline and fast) |
| offline | check lands on `error` with a message; nothing blocks startup (proven in B) |
| unsigned installer | Windows SmartScreen may prompt — the Update Panel and the Updates dialog both say so before download |

## Manual fallback (same code path, by hand)

`desktop/dev-app-update.yml` points at `http://127.0.0.1:8123/`. To reproduce
scenario A without the script:

```
npx http-server -p 8123 desktop/dist      # serve a dir holding latest.yml + the installer
MASARFLOW_UPDATER_DEV_FEED=1 pnpm dev     # or launch the packaged exe with the same env
```

## OWNER ACTIONS (not done here — they need a push, and a second build)

1. **Real GitHub path**: after the release workflow publishes a release, bump
   `desktop/package.json` to a newer version, publish a second prerelease, and
   install the first build on a clean Windows machine. Expect: check → available
   → download → "Restart now" (or install on quit). Nothing in this repo can
   prove that without two real releases.
2. **SmartScreen**: the installers are unsigned. The first install on a fresh
   machine needs "More info → Run anyway". Decide before GA whether to buy a
   code-signing certificate; if not, the release notes must say this.
3. **Channel policy**: stable = non-prerelease releases only; test =
   `allowPrerelease: true` (also the path used for the owner's own testing).
