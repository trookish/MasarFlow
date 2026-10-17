#!/usr/bin/env node
// Copies the onnxruntime-web WASM runtime next to the app so the embedding worker works offline.
// Only the factory the running app actually requests is copied (measured in P3.T4):
// `ort-wasm-simd-threaded.asyncify.{wasm,mjs}`. The jsep/jspi/plain factories are dead weight
// (~57 MB) — do not widen this again without measuring a request for them.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "node_modules", "onnxruntime-web", "dist");
const to = path.join(root, "public", "ort");
if (!existsSync(from)) { console.error("onnxruntime-web is not installed — run `pnpm install`."); process.exit(1); }
mkdirSync(to, { recursive: true });

const WANTED = /^ort-wasm-simd-threaded\.asyncify\.(wasm|mjs)$/;

// Remove previously copied factories so re-running shrinks an older install.
let removed = 0;
for (const f of readdirSync(to)) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(f) && !WANTED.test(f)) {
    rmSync(path.join(to, f));
    removed++;
  }
}

let n = 0;
for (const f of readdirSync(from)) {
  if (WANTED.test(f)) { cpSync(path.join(from, f), path.join(to, f)); n++; }
}
console.log(`copied ${n} ONNX runtime file(s) to public/ort (removed ${removed} unused)`);
