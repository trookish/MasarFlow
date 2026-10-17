import { describe, it, expect } from "vitest";
import { isNullBodyStatus, rewriteRequestToServer, rewriteRedirectToApp } from "@desktop/backend/protocol-url";

const TARGET = "http://127.0.0.1:41000";

describe("rewriteRequestToServer", () => {
  it("maps masarflow://app requests onto the loopback server", () => {
    expect(rewriteRequestToServer("masarflow://app/dashboard", TARGET)).toBe(`${TARGET}/dashboard`);
    expect(rewriteRequestToServer("masarflow://app/", TARGET)).toBe(`${TARGET}/`);
    expect(rewriteRequestToServer("masarflow://app/brain?note=abc&x=1", TARGET)).toBe(
      `${TARGET}/brain?note=abc&x=1`,
    );
  });

  it("tolerates a trailing slash on the target origin", () => {
    expect(rewriteRequestToServer("masarflow://app/dashboard", `${TARGET}/`)).toBe(`${TARGET}/dashboard`);
  });

  it("rejects every other host, scheme or malformed URL", () => {
    expect(rewriteRequestToServer("masarflow://evil/dashboard", TARGET)).toBeNull();
    expect(rewriteRequestToServer("https://github.com/trookish", TARGET)).toBeNull();
    expect(rewriteRequestToServer("file:///c:/Windows/win.ini", TARGET)).toBeNull();
    expect(rewriteRequestToServer("not a url", TARGET)).toBeNull();
  });
});

describe("rewriteRedirectToApp", () => {
  it("re-hosts a relative Location under masarflow://app", () => {
    expect(rewriteRedirectToApp("/dashboard", `${TARGET}/`)).toBe("masarflow://app/dashboard");
  });

  it("keeps the query string", () => {
    expect(rewriteRedirectToApp("/tasks?task=5", `${TARGET}/`)).toBe("masarflow://app/tasks?task=5");
  });

  it("re-hosts an absolute same-origin Location (S2 semantics)", () => {
    expect(rewriteRedirectToApp(`${TARGET}/dashboard`, `${TARGET}/`)).toBe("masarflow://app/dashboard");
    expect(rewriteRedirectToApp(`${TARGET}/chat?thread=1`, `${TARGET}/`)).toBe("masarflow://app/chat?thread=1");
  });

  it("resolves a relative Location against the request URL", () => {
    expect(rewriteRedirectToApp("board", `${TARGET}/brain/notes`)).toBe("masarflow://app/brain/board");
  });

  it("leaves a cross-origin Location untouched (the navigation policy decides)", () => {
    expect(rewriteRedirectToApp("https://github.com/login", `${TARGET}/`)).toBe("https://github.com/login");
    expect(rewriteRedirectToApp("http://127.0.0.1:9999/x", `${TARGET}/`)).toBe("http://127.0.0.1:9999/x");
  });
});

describe("isNullBodyStatus", () => {
  it("is true for statuses a Response may not carry a body with", () => {
    for (const s of [101, 103, 204, 205, 304]) expect(isNullBodyStatus(s)).toBe(true);
  });
  it("is false for ordinary statuses", () => {
    for (const s of [200, 201, 206, 302, 404, 500]) expect(isNullBodyStatus(s)).toBe(false);
  });
});
