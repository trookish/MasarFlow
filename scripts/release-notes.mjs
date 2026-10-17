#!/usr/bin/env node
// CHANGELOG section -> release-notes.md (Keep-a-Changelog is the source of truth;
// the GitHub auto-generator is deliberately NOT used — it cannot know our P0..P10 story).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = (process.argv[2] ?? "").replace(/^v/, "");
const md = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const lines = md.split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith("## ") && l.includes(`[${version}]`));
if (start === -1) {
  console.error(`No CHANGELOG section for ${version}`);
  process.exit(1);
}
const body = [];
for (let i = start + 1; i < lines.length && !lines[i].startsWith("## "); i++) body.push(lines[i]);
const banner = [
  "> Windows build — unsigned. SmartScreen may warn on install: **More info → Run anyway**.",
  "> Existing 0.1 users: install **v0.1.6.0** first and use Settings → Data → Export, then import that file in the wizard.",
  "",
];
const notes = [...banner, ...body].join("\n").trim() + "\n";
writeFileSync(path.join(root, "release-notes.md"), notes);
console.log(`Release notes for ${version} written (${notes.split("\n").length} lines).`);
