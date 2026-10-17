# F7 — voice probe in the packaged app: decision `hide`

**Probe** (`tests/e2e/desktop/voice.spec.ts`, run against `desktop/dist/win-unpacked/MasarFlow.exe` on a
throwaway profile, Electron 43): the renderer exposes the `webkitSpeechRecognition` constructor, but starting a
real recognition session fails immediately. `reports/p9/voice-probe.json` records
`{"ctor": true, "events": ["error:not-allowed"]}` — the constructor exists, the service does not: Electron ships
no speech backend, and the app's own main process denies microphone permission by policy
(`desktop/src/main/security/permissions.ts` allows only `clipboard-sanitized-write` and `fullscreen`), so the
session is refused before any service lookup could run. (The plan predicted `error:network`; `not-allowed` is
the same verdict, one layer earlier.)

**Decision: `hide` — the dictation control ships only where recognition can actually work.** T12's
`speechAvailability(window, getDesktop() !== null)` returns `false` under Electron, so `chat-view.tsx` renders
no mic button in the desktop shell, and this spec asserts exactly that on a real packaged app with the thread
composer open (the empty state renders no composer, so the check would be vacuous there). The web build keeps
the button wherever a real constructor exists. If a future Electron ships a working backend, the probe flips to
`start` with no error and the same spec then requires the mic to be visible — it fails until `speechAvailability`
is revisited, so the decision cannot rot silently.
