#!/usr/bin/env node
// CHANGELOG section -> release-notes.md (Keep-a-Changelog is the source of truth;
// the GitHub auto-generator is deliberately NOT used — it cannot know the phase story).
// The upgrade banner names the previous release tag (`git describe --tags --abbrev=0 HEAD^`).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {{ version: string, changelog: string, previousTag: string | null }} input
 * @returns {string} release notes markdown
 */
export function formatReleaseNotes({ version, changelog, previousTag }) {
  const v = version.replace(/^v/, "");
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith("## ") && l.includes(`[${v}]`));
  if (start === -1) throw new Error(`No CHANGELOG section for ${v}`);
  const body = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith("## "); i++) body.push(lines[i]);
  const banner = ["> Windows build — unsigned. SmartScreen may warn on install: **More info → Run anyway**."];
  if (previousTag) {
    banner.push(
      /^v?0\.1\./.test(previousTag)
        ? `> Upgrading from **${previousTag}**: use Settings → Data → Export there, then import that file in the first-run wizard.`
        : `> Upgrading from **${previousTag}**: install over it. Your data and settings carry over, and a backup is taken before migration.`,
    );
  }
  banner.push("");
  return [...banner, ...body].join("\n").trim() + "\n";
}

/** The release tag before HEAD, or null when there is none (first release). */
export function previousReleaseTag(cwd) {
  try {
    return execFileSync("git", ["describe", "--tags", "--abbrev=0", "--match", "v*", "HEAD^"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const version = (process.argv[2] ?? "").replace(/^v/, "");
  try {
    const notes = formatReleaseNotes({
      version,
      changelog: readFileSync(path.join(root, "CHANGELOG.md"), "utf8"),
      previousTag: process.env.PREVIOUS_TAG || previousReleaseTag(root),
    });
    writeFileSync(path.join(root, "release-notes.md"), notes);
    console.log(`Release notes for ${version} written (${notes.split("\n").length} lines).`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
