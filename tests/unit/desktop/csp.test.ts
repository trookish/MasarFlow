import { describe, it, expect } from "vitest";
import { buildCsp } from "@desktop/security/csp";
import { isPermissionAllowed } from "@desktop/security/permissions";

describe("buildCsp", () => {
  const prod = buildCsp({ dev: false });
  it("locks down plugins, base URI, forms and framing", () => {
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("base-uri 'self'");
    expect(prod).toContain("form-action 'self'");
    expect(prod).toContain("frame-ancestors 'none'");
  });
  it("allows wasm (embeddings) but not eval in production", () => {
    expect(prod).toContain("'wasm-unsafe-eval'");
    expect(prod).not.toContain("'unsafe-eval'");
  });
  it("allows eval and websockets in development only", () => {
    const dev = buildCsp({ dev: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws://localhost:*");
    expect(prod).not.toContain("ws://");
  });
  const directive = (name: string) =>
    prod
      .split("; ")
      .find((d) => d.startsWith(`${name} `))!
      .split(" ")
      .slice(1);
  it("does not allow arbitrary https hosts for connections or frames", () => {
    expect(directive("connect-src")).not.toContain("https:");
    expect(directive("frame-src")).not.toContain("https:");
    expect(directive("connect-src")).toEqual(expect.arrayContaining(["'self'", "https://models.dev", "https://api.github.com"]));
    expect(directive("frame-src")).toEqual(expect.arrayContaining(["https://www.youtube-nocookie.com", "https://player.vimeo.com"]));
  });
  it("still renders remote images (favicons, thumbnails, Markdown)", () => {
    expect(directive("img-src")).toContain("https:");
  });
  it("permits workers from blob: for the embedding worker", () => {
    expect(prod).toContain("worker-src 'self' blob:");
  });
});

describe("isPermissionAllowed", () => {
  it("allows only clipboard writes and fullscreen", () => {
    expect(isPermissionAllowed("clipboard-sanitized-write")).toBe(true);
    expect(isPermissionAllowed("fullscreen")).toBe(true);
    for (const p of ["media", "geolocation", "notifications", "midi", "clipboard-read", "openExternal", "hid", "usb"]) {
      expect(isPermissionAllowed(p)).toBe(false);
    }
  });
});
