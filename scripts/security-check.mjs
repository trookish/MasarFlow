#!/usr/bin/env node
// Black-box check of the guard: boots the packaged Next server (desktop/app-server) with a token
// and asserts the denial matrix. Run: pnpm build:app && node scripts/security-check.mjs
// (the `security:check` package.json script lands with the next package.json edit.)
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "desktop", "app-server", "server.js");
const TOKEN = "t".repeat(64);

const port = await new Promise((res) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
});
const data = mkdtempSync(path.join(os.tmpdir(), "msf-sec-data-"));
const allowed = mkdtempSync(path.join(os.tmpdir(), "msf-sec-allowed-"));
const other = mkdtempSync(path.join(os.tmpdir(), "msf-sec-other-"));
writeFileSync(path.join(allowed, "hello.txt"), "hi");
writeFileSync(path.join(data, "roots.json"), JSON.stringify({ roots: [allowed] }));

const server = spawn(process.execPath, [entry], {
  env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", MASARFLOW_TOKEN: TOKEN, MASARFLOW_DATA_DIR: data, NODE_ENV: "production" },
  stdio: ["ignore", "ignore", "pipe"],
});
let serverErr = "";
server.stderr.on("data", (c) => { serverErr += c; if (serverErr.length > 8000) serverErr = serverErr.slice(-8000); });
let stopped = false;
const stop = () => { if (!stopped) { stopped = true; server.kill(); } };
process.on("exit", stop);

function call({ method = "GET", p, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: p, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => { let json = null; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, json, text }); });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

let ready = false;
for (let i = 0; i < 120; i++) {
  try { const r = await call({ p: "/api/health", headers: { "x-masarflow-token": TOKEN } }); if (r.status === 200) { ready = true; break; } } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
if (!ready) {
  stop();
  console.error("SECURITY_CHECK_FAIL: the packaged server did not become ready on 127.0.0.1:" + port);
  if (serverErr.trim()) console.error(serverErr.trim().split(/\r?\n/).slice(-15).join("\n"));
  process.exit(1);
}

const J = { "content-type": "application/json" };
const T = { "x-masarflow-token": TOKEN };
const O = { origin: "masarflow://app" };
const cases = [
  ["no token → 401", () => call({ p: "/api/health" }), (r) => r.status === 401],
  ["token → 200", () => call({ p: "/api/health", headers: T }), (r) => r.status === 200 && r.json?.ok === true],
  ["wrong token → 401", () => call({ p: "/api/health", headers: { "x-masarflow-token": "z".repeat(64) } }), (r) => r.status === 401],
  ["foreign Host → 403", () => call({ p: "/api/health", headers: { ...T, host: "evil.example" } }), (r) => r.status === 403],
  ["localhost Host → 200", () => call({ p: "/api/health", headers: { ...T, host: `localhost:${port}` } }), (r) => r.status === 200],
  ["foreign Origin → 403", () => call({ method: "POST", p: "/api/fs/list", headers: { ...T, ...J, origin: "https://evil.example" }, body: JSON.stringify({ root: allowed, path: "" }) }), (r) => r.status === 403],
  ["POST without Origin → 403", () => call({ method: "POST", p: "/api/fs/list", headers: { ...T, ...J }, body: JSON.stringify({ root: allowed, path: "" }) }), (r) => r.status === 403],
  ["registered root → 200", () => call({ method: "POST", p: "/api/fs/list", headers: { ...T, ...J, ...O }, body: JSON.stringify({ root: allowed, path: "" }) }), (r) => r.status === 200],
  ["unregistered root → 403 (route-level)", () => call({ method: "POST", p: "/api/fs/list", headers: { ...T, ...J, ...O }, body: JSON.stringify({ root: other, path: "" }) }), (r) => r.status === 403 && /not been linked/.test(r.json?.error ?? "")],
  ["unregistered root on shell → 403", () => call({ method: "POST", p: "/api/fs/shell", headers: { ...T, ...J, ...O }, body: JSON.stringify({ root: other, command: "echo hi" }) }), (r) => r.status === 403],
  ["watch unregistered dir → 403", () => call({ p: `/api/watch?dir=${encodeURIComponent(other)}`, headers: T }), (r) => r.status === 403],
  ["no path is exempt from the token (former bridge path)", () => call({ method: "POST", p: "/api/opencode/ws-call", headers: J, body: "{}" }), (r) => r.status === 401 && String(r.json?.error ?? "").startsWith("MasarFlow guard:")],
];

let failed = 0;
for (const [name, run, ok] of cases) {
  let r;
  try { r = await run(); } catch (e) { r = { status: -1, text: String(e) }; }
  const pass = ok(r);
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  (HTTP ${r.status})`);
  if (!pass) console.log(`      body: ${(r.text ?? "").slice(0, 300)}`);
}
stop();
for (const dir of [data, allowed, other]) rmSync(dir, { recursive: true, force: true });
if (failed) { console.error(`SECURITY_CHECK_FAIL ${failed}/${cases.length}`); process.exit(1); }
console.log(`SECURITY_CHECK_OK ${cases.length}/${cases.length}`);
