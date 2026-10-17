import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addRootToFile, readRootsFile } from "@desktop/security/roots";

describe("roots.json", () => {
  it("reads [] when the file does not exist", () => {
    expect(readRootsFile(join(mkdtempSync(join(tmpdir(), "msf-r-")), "roots.json"))).toEqual([]);
  });
  it("adds roots atomically and de-duplicates by normalized path", () => {
    const file = join(mkdtempSync(join(tmpdir(), "msf-r-")), "roots.json");
    const a = mkdtempSync(join(tmpdir(), "msf-a-"));
    addRootToFile(file, a);
    addRootToFile(file, a + (process.platform === "win32" ? "\\" : "/"));
    const roots = readRootsFile(file);
    expect(roots).toHaveLength(1);
    expect(JSON.parse(readFileSync(file, "utf8")).roots).toHaveLength(1);
  });
});
