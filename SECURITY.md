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
7. Server-side fetches (canvas web embeds) resolve every host and refuse loopback, private, link-local
   (cloud metadata), carrier-grade NAT, multicast and reserved addresses, including IPv4-mapped IPv6. The
   check repeats on every redirect hop (at most three), the connection is pinned to the vetted address, and
   TLS certificates are always verified.
8. Third-party frames on the canvas are limited to known video players (YouTube, Vimeo, Dailymotion, Loom),
   sandboxed and sent without a referrer. The CSP lists the same players in `frame-src` and only the public
   hosts the window reads directly (`models.dev`, `api.github.com`) in `connect-src`; AI providers, GitHub
   sync and Obsidian are reached through the local server.
9. No secret appears in a URL. Obsidian attachments stream through a short-lived media session id; the
   Obsidian key is sent only in request bodies. Obsidian traffic is restricted to loopback, the only place
   its self-signed certificate is accepted.

## Development mode

`pnpm dev` runs `next dev` behind an Electron window without a launch token, for contributors. It is still
guarded: `Host` must be `localhost` or `127.0.0.1` on the configured port, and every `/api/*` request must be
same-origin (`Origin` and `Sec-Fetch-Site`; state-changing requests without an `Origin` are refused).
Filesystem and shell routes accept only folders linked with the native picker in the dev profile, and fail
closed without a data folder (see `docs/development.md`). Development mode is not a supported way to run
MasarFlow day to day; there is no browser build.

## Known limits

- The Windows installer is **not code-signed**: SmartScreen warns, and Windows cannot prove the binary came
  from us. Verify the SHA-256 of the installer against the release notes if you care.
- macOS/Linux builds are not produced (D12/Q4).
- A malicious local process running as your user can read your app data and forge any request header;
  MasarFlow protects the data from *remote* and *web-page* access, not from code already running as you.
  This is why development mode relies on header checks rather than a secret.
