import { describe, it, expect } from "vitest";
import { obsidianTlsOptions, obsidianUrl } from "@/lib/server/obsidian-target";

describe("obsidianUrl", () => {
  it("resolves vault paths on the loopback server", () => {
    expect(obsidianUrl("/vault/a.md", "https://127.0.0.1:27124").toString()).toBe("https://127.0.0.1:27124/vault/a.md");
  });
  it.each(["//evil.test/x", "https://evil.test/vault/a.md", "http://169.254.169.254/"])(
    "refuses a path that leaves loopback: %s",
    (path) => {
      expect(() => obsidianUrl(path, "https://127.0.0.1:27124")).toThrow(/localhost/);
    },
  );
});

describe("obsidianTlsOptions", () => {
  it("relaxes certificate checks only for loopback https", () => {
    expect(obsidianTlsOptions(new URL("https://127.0.0.1:27124/"))).toEqual({ rejectUnauthorized: false });
    expect(obsidianTlsOptions(new URL("http://localhost:27123/"))).toEqual({});
    expect(() => obsidianTlsOptions(new URL("https://example.com/"))).toThrow();
  });
});
