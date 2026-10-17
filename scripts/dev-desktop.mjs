#!/usr/bin/env node
// Dev: Next dev server + Electron pointing at it (no embedded server, no token).
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const PORT = Number(process.env.PORT ?? 3000);
const win = process.platform === "win32";

let electron;
function killTree(child) {
  if (!child?.pid) return;
  if (win) spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"]);
  else child.kill("SIGTERM");
}
function waitForPort(port, timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const probe = () => {
      const s = net.connect(port, "127.0.0.1");
      s.once("connect", () => { s.destroy(); resolve(); });
      s.once("error", () => { s.destroy(); Date.now() > end ? reject(new Error("next dev did not start")) : setTimeout(probe, 500); });
    };
    probe();
  });
}

const next = spawn("pnpm", ["exec", "next", "dev", "-p", String(PORT)], { stdio: "inherit", shell: win });
const cleanup = () => { killTree(next); killTree(electron); };
process.on("SIGINT", () => { cleanup(); process.exit(0); });
await waitForPort(PORT);
electron = spawn("pnpm", ["--dir", "desktop", "exec", "electron-vite", "dev"], {
  stdio: "inherit",
  shell: win,
  env: { ...process.env, MASARFLOW_DEV_URL: `http://localhost:${PORT}` },
});
electron.on("exit", (code) => { cleanup(); process.exit(code ?? 0); });
