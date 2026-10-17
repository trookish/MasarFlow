import { describe, it, expect } from "vitest";
import { isInternalUrl, isSafeExternalUrl } from "@desktop/security/url-policy";

describe("isInternalUrl", () => {
  it("accepts only the app origin", () => {
    expect(isInternalUrl("masarflow://app/dashboard")).toBe(true);
    expect(isInternalUrl("masarflow://app")).toBe(true);
    expect(isInternalUrl("masarflow://evil/dashboard")).toBe(false);
    expect(isInternalUrl("https://github.com/trookish")).toBe(false);
    expect(isInternalUrl("file:///c:/Windows/win.ini")).toBe(false);
    expect(isInternalUrl("not a url")).toBe(false);
  });
  it("accepts the dev server origin only when provided", () => {
    expect(isInternalUrl("http://localhost:3000/chat")).toBe(false);
    expect(isInternalUrl("http://localhost:3000/chat", "http://localhost:3000")).toBe(true);
    expect(isInternalUrl("http://localhost:3001/chat", "http://localhost:3000")).toBe(false);
  });
});

describe("isSafeExternalUrl", () => {
  it("allows only http, https and mailto", () => {
    expect(isSafeExternalUrl("https://github.com")).toBe(true);
    expect(isSafeExternalUrl("http://localhost:11434")).toBe(true);
    expect(isSafeExternalUrl("mailto:a@b.co")).toBe(true);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("file:///c:/x")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,<b>x</b>")).toBe(false);
    expect(isSafeExternalUrl("masarflow://app/x")).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
  });
});
