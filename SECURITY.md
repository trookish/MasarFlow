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
