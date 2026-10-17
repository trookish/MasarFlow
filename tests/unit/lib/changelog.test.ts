import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractChangelogSection, changelogVersions } from "@/lib/changelog";
import { REPO_ROOT } from "../_helpers/fs-scan";

const md = readFileSync(join(REPO_ROOT, "CHANGELOG.md"), "utf8");

describe("CHANGELOG.md", () => {
  it("has a section for the release we are shipping", () => {
    const section = extractChangelogSection(md, "0.2.0.0");
    expect(section).toBeTruthy();
    expect(section).toMatch(/Added|Changed|Removed/);
  });
  it("lists versions newest first", () => {
    const versions = changelogVersions(md);
    expect(versions[0]).toBe("0.2.0.0");
  });
});
