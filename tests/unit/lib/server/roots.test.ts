import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertRootAllowed } from "@/lib/server/roots";

describe("assertRootAllowed", () => {
  it("is a no-op without MASARFLOW_DATA_DIR (browser dev)", () => {
    expect(() => assertRootAllowed("C:\\anything", {})).not.toThrow();
  });
  it("rejects unregistered roots and accepts registered ones", () => {
    const dir = mkdtempSync(join(tmpdir(), "msf-roots-"));
    const allowed = mkdtempSync(join(tmpdir(), "msf-allowed-"));
    writeFileSync(join(dir, "roots.json"), JSON.stringify({ roots: [allowed] }));
    const env = { MASARFLOW_DATA_DIR: dir };
    expect(() => assertRootAllowed(allowed, env)).not.toThrow();
    expect(() => assertRootAllowed(join(allowed, "sub"), env)).not.toThrow();
    expect(() => assertRootAllowed(tmpdir(), env)).toThrow();
    try {
      assertRootAllowed(tmpdir(), env);
    } catch (e) {
      expect((e as { status: number }).status).toBe(403);
    }
  });
  it("rejects everything when roots.json is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "msf-roots-"));
    expect(() => assertRootAllowed(tmpdir(), { MASARFLOW_DATA_DIR: dir })).toThrow();
  });
});
