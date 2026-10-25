import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertRootAllowed } from "@/lib/server/roots";

describe("assertRootAllowed", () => {
  it("fails closed without MASARFLOW_DATA_DIR or MASARFLOW_DEV_ROOTS", () => {
    expect(() => assertRootAllowed("C:\\anything", {})).toThrow();
    try {
      assertRootAllowed("C:\\anything", {});
    } catch (e) {
      expect((e as { status: number }).status).toBe(403);
    }
  });
  it("allows folders inside MASARFLOW_DEV_ROOTS in browser dev", () => {
    const a = mkdtempSync(join(tmpdir(), "msf-dev-a-"));
    const b = mkdtempSync(join(tmpdir(), "msf-dev-b-"));
    const env = { MASARFLOW_DEV_ROOTS: `${a}; ${b}` };
    expect(() => assertRootAllowed(join(a, "app"), env)).not.toThrow();
    expect(() => assertRootAllowed(b, env)).not.toThrow();
  });
  it("rejects folders outside MASARFLOW_DEV_ROOTS", () => {
    const a = mkdtempSync(join(tmpdir(), "msf-dev-a-"));
    const other = mkdtempSync(join(tmpdir(), "msf-dev-other-"));
    expect(() => assertRootAllowed(other, { MASARFLOW_DEV_ROOTS: a })).toThrow();
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
