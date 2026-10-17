#!/usr/bin/env node
// Copies the onnxruntime-web WASM runtime next to the app so the embedding worker works offline.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "node_modules", "onnxruntime-web", "dist");
const to = path.join(root, "public", "ort");
if (!existsSync(from)) { console.error("onnxruntime-web is not installed — run `pnpm install`."); process.exit(1); }
mkdirSync(to, { recursive: true });
let n = 0;
for (const f of readdirSync(from)) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(f)) { cpSync(path.join(from, f), path.join(to, f)); n++; }
}
console.log(`copied ${n} ONNX runtime file(s) to public/ort`);
