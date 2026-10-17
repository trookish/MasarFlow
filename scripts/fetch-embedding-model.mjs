#!/usr/bin/env node
// Downloads the quantized embedding model into public/models/ (gitignored).
import { createHash } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = "Xenova/all-MiniLM-L6-v2";
const FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"];

for (const f of FILES) {
  const dest = path.join(root, "public", "models", MODEL, f);
  if (existsSync(dest)) { console.log("have", f); continue; }
  mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(`https://huggingface.co/${MODEL}/resolve/main/${f}`);
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status} — check https://huggingface.co/${MODEL}/tree/main`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  const sha = createHash("sha256").update(readFileSync(dest)).digest("hex").slice(0, 16);
  console.log("got", f, sha);
}
