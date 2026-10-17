#!/usr/bin/env node
/**
 * Browser-mode runner for contributors and e2e tests: `next start` (or `next dev` with --dev).
 * The desktop app (desktop/src/main) is the supported way to run MasarFlow.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const nextCli = require.resolve("next/dist/bin/next");
const dev = process.argv.includes("--dev");
const port = process.env.PORT ?? "3000";

const child = spawn(process.execPath, [nextCli, dev ? "dev" : "start", "-p", port], { cwd: root, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
