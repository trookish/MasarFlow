/**
 * Pure helpers for the shipped CHANGELOG.md.
 *
 * Pre-landed with P10.T9: the Control Center's "What changed" block needs the
 * parser before the T14/T15 release-notes tasks run; the code is exactly the
 * one the plan specifies for `src/lib/changelog.ts`.
 *
 * Pure TypeScript only — no React, Next, DOM, or Electron imports.
 */

/** Extract the body of the "## [<version>]" section of a Keep-a-Changelog file. */
export function extractChangelogSection(markdown: string, version: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith("## ") && l.includes(`[${version}]`));
  if (start === -1) return null;
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) break;
    body.push(lines[i]);
  }
  return body.join("\n").trim();
}

/** The version headings present, newest first. */
export function changelogVersions(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .filter((l) => l.startsWith("## "))
    .map((l) => /\[([^\]]+)\]/.exec(l)?.[1] ?? "")
    .filter(Boolean);
}
