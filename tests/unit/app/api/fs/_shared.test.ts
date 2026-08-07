import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { resolveInsideRoot, isDeniedName } from "@/app/api/fs/_shared";

const ROOT =
  process.platform === "win32" ? "C:\\projects\\game" : "/home/user/game";

describe("resolveInsideRoot", () => {
  it("resolves plain relative paths inside the root", () => {
    expect(resolveInsideRoot(ROOT, "src/main.ts")).toBe(
      path.resolve(ROOT, "src/main.ts"),
    );
  });

  it("resolves nested paths", () => {
    expect(resolveInsideRoot(ROOT, "Assets/Scripts/Player.cs")).toBe(
      path.resolve(ROOT, "Assets/Scripts/Player.cs"),
    );
  });

  it("allows the root itself", () => {
    expect(resolveInsideRoot(ROOT, "")).toBe(path.resolve(ROOT));
    expect(resolveInsideRoot(ROOT, ".")).toBe(path.resolve(ROOT));
  });

  it("rejects dot-dot traversal", () => {
    expect(() => resolveInsideRoot(ROOT, "../outside.txt")).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    expect(() => resolveInsideRoot(ROOT, "a/../../b.txt")).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });

  it("neutralizes absolute-path overrides by stripping them into the root", () => {
    const out = resolveInsideRoot(ROOT, "/etc/passwd");
    expect(out.startsWith(path.resolve(ROOT))).toBe(true);
  });

  it("rejects a non-absolute root", () => {
    expect(() => resolveInsideRoot("relative/root", "a.txt")).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
  });

  it("rejects secret-carrying filenames", () => {
    expect(() => resolveInsideRoot(ROOT, ".env")).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    expect(() => resolveInsideRoot(ROOT, "config/.env.local")).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    expect(() => resolveInsideRoot(ROOT, "certs/server.pem")).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });
});

describe("isDeniedName", () => {
  it("blocks env files, keys, and credentials", () => {
    expect(isDeniedName(".env")).toBe(true);
    expect(isDeniedName("sub/.env.production")).toBe(true);
    expect(isDeniedName("id_rsa")).toBe(true);
    expect(isDeniedName("a/id_ed25519.pub")).toBe(true);
    expect(isDeniedName("tls/cert.key")).toBe(true);
    expect(isDeniedName("secrets.json")).toBe(true);
  });

  it("allows normal source files", () => {
    expect(isDeniedName("src/main.ts")).toBe(false);
    expect(isDeniedName("environment.ts")).toBe(false);
    expect(isDeniedName("README.md")).toBe(false);
  });
});
