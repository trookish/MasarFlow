import { describe, it, expect } from "vitest";
import { formatReleaseNotes } from "../../../scripts/release-notes.mjs";

const changelog = `# Changelog

## [0.3.0.0] - 2026-11-01

### Changed
- One sidebar.

## [0.2.0.0] - 2026-10-17

### Added
- Older entry.
`;

describe("release notes", () => {
  it("names the real previous tag, not a hard-coded one", () => {
    const notes: string = formatReleaseNotes({ version: "v0.3.0.0", changelog, previousTag: "v0.2.0.0" });
    expect(notes).not.toContain("v0.1.6.0");
    expect(notes).toContain("Upgrading from **v0.2.0.0**");
    expect(notes).toContain("- One sidebar.");
    expect(notes).not.toContain("Older entry");
  });
  it("keeps the export/import route for 0.1 upgrades", () => {
    const notes: string = formatReleaseNotes({ version: "0.3.0.0", changelog, previousTag: "v0.1.5.1" });
    expect(notes).toMatch(/Export/);
  });
  it("fails on a missing CHANGELOG section", () => {
    expect(() => formatReleaseNotes({ version: "9.9.9.9", changelog, previousTag: null })).toThrow(/No CHANGELOG/);
  });
});
