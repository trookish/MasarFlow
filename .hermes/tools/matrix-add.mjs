#!/usr/bin/env node
// Agent tool (not shipped): add feature titles to tests/e2e/feature-matrix.json without clobbering siblings.
//   node.exe .hermes/tools/matrix-add.mjs "/tasks" "group by sprint" ["/tasks" "another"] ...
// Takes a short lock, re-reads the file, appends, writes it back in the repo's compact CRLF format,
// and refuses to write if the file would not round-trip byte for byte before the edit.
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) {
  console.error('Usage: node.exe .hermes/tools/matrix-add.mjs "<route>" "<feature>" ["<route>" "<feature>" ...]');
  process.exit(2);
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");
const file = path.join(root, "tests", "e2e", "feature-matrix.json");
const lock = path.join(process.env.LOCALAPPDATA ?? process.env.TEMP ?? ".", "Temp", "masarflow-matrix.lock");
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
for (let i = 0; ; i++) {
  try { mkdirSync(lock); break; } catch {
    try { if (Date.now() - statSync(lock).mtimeMs > 60_000) rmSync(lock, { recursive: true, force: true }); } catch {}
    if (i > 100) { console.error("MATRIX_FAIL lock timeout"); process.exit(3); }
    sleep(200);
  }
}
try {
  const raw = readFileSync(file, "utf8");
  const data = JSON.parse(raw);
  const ser = (d) =>
    "{\r\n" +
    Object.keys(d).map((k) => `  ${JSON.stringify(k)}: [${d[k].map((f) => JSON.stringify(f)).join(", ")}]`).join(",\r\n") +
    "\r\n}\r\n";
  if (ser(data) !== raw && ser(data).trimEnd() !== raw.trimEnd()) {
    console.error("MATRIX_FAIL file does not round-trip in the compact format; edit by hand");
    process.exit(4);
  }
  const trailing = raw.endsWith("\r\n") ? "\r\n" : "";
  for (let i = 0; i < args.length; i += 2) {
    const [route, feature] = [args[i], args[i + 1]];
    data[route] ??= [];
    if (!data[route].includes(feature)) data[route].push(feature);
  }
  const sorted = Object.fromEntries(Object.keys(data).sort().map((k) => [k, data[k]]));
  writeFileSync(file, ser(sorted).trimEnd() + trailing);
  console.log(`MATRIX_OK ${args.length / 2} entr${args.length === 2 ? "y" : "ies"}`);
} finally {
  rmSync(lock, { recursive: true, force: true });
}
