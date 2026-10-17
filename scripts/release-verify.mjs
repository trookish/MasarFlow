#!/usr/bin/env node
// Fails when the version story is inconsistent. Run: node scripts/release-verify.mjs [tag]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
const semver = (v) => /^\d+\.\d+\.\d+$/.test(v);
const fourPart = (v) => /^\d+\.\d+\.\d+\.\d+$/.test(v);

const fails = [];
const rootPkg = read("package.json");
const deskPkg = read("desktop/package.json");
const ipc = readFileSync(path.join(root, "desktop/src/shared/version.ts"), "utf8");
const display = /APP_DISPLAY_VERSION\s*=\s*"([^"]+)"/.exec(ipc)?.[1] ?? "";
const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const builder = readFileSync(path.join(root, "desktop/electron-builder.yml"), "utf8");
const tag = (process.argv[2] ?? "").replace(/^v/, "");

if (!semver(rootPkg.version)) fails.push(`root package.json version "${rootPkg.version}" is not semver`);
if (!semver(deskPkg.version)) fails.push(`desktop/package.json version "${deskPkg.version}" is not semver`);
if (rootPkg.version !== deskPkg.version) fails.push(`version mismatch: root ${rootPkg.version} vs desktop ${deskPkg.version}`);
if (!fourPart(display)) fails.push(`APP_DISPLAY_VERSION "${display}" is not 4-part`);
if (fourPart(display) && semver(deskPkg.version) && !display.startsWith(deskPkg.version)) {
  fails.push(`APP_DISPLAY_VERSION ${display} does not start with package version ${deskPkg.version}`);
}
if (!changelog.includes(`[${display}]`)) fails.push(`CHANGELOG.md has no section for [${display}]`);
if (!/provider:\s*github/.test(builder) || !/repo:\s*MasarFlow/.test(builder) || !/owner:\s*trookish/.test(builder)) {
  fails.push("desktop/electron-builder.yml is missing the github publish block (owner/repo)");
}
if (tag && tag !== display) fails.push(`tag v${tag} does not match APP_DISPLAY_VERSION ${display}`);

if (fails.length) {
  console.error(`RELEASE_VERIFY_FAIL (${fails.length})\n - ${fails.join("\n - ")}`);
  process.exit(1);
}
console.log(`RELEASE_VERIFY_OK ${deskPkg.version} / v${display}`);
