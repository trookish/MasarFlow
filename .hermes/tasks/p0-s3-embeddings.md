# P0.T6 — Spike S3: in-browser embeddings under the real CSP

Read `.hermes/tasks/00-shared-context.md` first.

Implement **P0.T6** from `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p0-p1-baseline-desktop-shell.md`, lines 403–504.

Already done by the orchestrator: `pnpm add -w @huggingface/transformers` (installed ^4.3.1; `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` are modified — leave them). Note: `onnxruntime-web` is NOT hoisted to root `node_modules` (pnpm). Locate it under `node_modules/.pnpm/onnxruntime-web@*/node_modules/onnxruntime-web/dist` or via `require.resolve` from the transformers package dir, and point `ortDir` there. Transformers 4.x may ship its own ORT wasm (`dist/ort-wasm-simd-threaded.jsep.mjs` exists) — serve whatever the runtime requests; 404s in the page log tell you which files.

Steps:
1. Create `scripts/fetch-embedding-model.mjs` exactly as in the plan (kept permanently). Add `/public/models/` to `.gitignore`. Run it; record file sizes. If a file path 404s on Hugging Face, check the repo tree and fix the `FILES` list.
2. Create `.hermes/spikes/s3/run.mjs` and `page.js` as in the plan, adapting bundle paths for transformers 4.x. Run `node .hermes/spikes/s3/run.mjs` from the repo root. If Playwright Chromium is missing, run `pnpm exec playwright install chromium`.
3. Confirm no CSP violation appears in the `[page]` log with `connect-src 'self'` only.
4. If the transformers 4.x API differs (e.g. `dtype`/`device` options), adapt and record.

**GO criteria** at plan line 502. Record each measured value. If NO-GO, try the fallbacks (a) then report; do not implement (b) or (c).

**Clean-up:** delete `.hermes/spikes/s3/` code after recording numbers. Make sure the port 4399 server and browser are closed. Keep `scripts/fetch-embedding-model.mjs`, `.gitignore` change and the downloaded `public/models/` (gitignored).

**Deliverable:** `.hermes/spikes/S3.md` — verdict, the result JSON verbatim, load/embed timings, which bundle + ORT files were served, any API changes for transformers 4.x (P3 depends on this). Do NOT commit.
