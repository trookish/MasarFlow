#!/usr/bin/env node
// Assembles desktop/app-server from the Next standalone output so
// electron-builder can ship it as an extraResource.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");
const out = path.join(root, "desktop", "app-server");

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("Missing .next/standalone/server.js — run `pnpm build` first (needs output: 'standalone').");
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
// dereference: pnpm's node_modules are symlinks; electron-builder cannot carry them on Windows.
cpSync(standalone, out, { recursive: true, dereference: true });
mkdirSync(path.join(out, ".next"), { recursive: true });
cpSync(path.join(root, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });
cpSync(path.join(root, "public"), path.join(out, "public"), { recursive: true });
console.log("app-server ready:", out);
