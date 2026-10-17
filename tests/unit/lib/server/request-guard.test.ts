import { describe, it, expect } from "vitest";
import { checkRequest, guardConfigFromEnv, type GuardConfig, type GuardRequest } from "@/lib/server/request-guard";

const cfg: GuardConfig = {
  token: "T".repeat(64),
  allowedHosts: ["127.0.0.1:41000", "localhost:41000"],
  allowedOrigins: ["masarflow://app"],
};
const req = (over: Partial<GuardRequest> = {}): GuardRequest => ({
  method: "GET",
  pathname: "/api/health",
  host: "127.0.0.1:41000",
  origin: null,
  token: cfg.token,
  ...over,
});

describe("checkRequest", () => {
  it("accepts a valid renderer request", () => {
    expect(checkRequest(cfg, req())).toEqual({ ok: true });
    expect(checkRequest(cfg, req({ method: "POST", origin: "masarflow://app" }))).toEqual({ ok: true });
  });
  it("rejects a missing or wrong token with 401", () => {
    expect(checkRequest(cfg, req({ token: null }))).toMatchObject({ ok: false, status: 401 });
    expect(checkRequest(cfg, req({ token: "x" }))).toMatchObject({ ok: false, status: 401 });
    expect(checkRequest(cfg, req({ token: cfg.token.slice(0, -1) + "x" }))).toMatchObject({ ok: false, status: 401 });
  });
  it("rejects a foreign Host with 403 (DNS rebinding)", () => {
    expect(checkRequest(cfg, req({ host: "evil.example" }))).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest(cfg, req({ host: "127.0.0.1:9999" }))).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest(cfg, req({ host: null }))).toMatchObject({ ok: false, status: 403 });
  });
  it("rejects a foreign Origin for every method with 403", () => {
    expect(checkRequest(cfg, req({ origin: "https://evil.example" }))).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest(cfg, req({ method: "POST", origin: "http://localhost:3000" }))).toMatchObject({ ok: false, status: 403 });
  });
  it("requires an Origin on state-changing requests", () => {
    expect(checkRequest(cfg, req({ method: "POST", origin: null }))).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest(cfg, req({ method: "DELETE", origin: null }))).toMatchObject({ ok: false, status: 403 });
  });
  it("has no exempt paths: even a former bridge path needs the token", () => {
    const r = req({ method: "POST", pathname: "/api/opencode/ws-call", token: null, origin: null });
    expect(checkRequest(cfg, r)).toMatchObject({ ok: false, status: 401 });
  });
  it("prefixes every denial so callers can tell guard errors from route errors", () => {
    const r = checkRequest(cfg, req({ token: null }));
    expect(r.ok === false && r.reason).toMatch(/^MasarFlow guard:/);
  });
});

describe("guardConfigFromEnv", () => {
  it("is null (not enforced) without a launch token", () => {
    expect(guardConfigFromEnv({})).toBeNull();
    expect(guardConfigFromEnv({ MASARFLOW_TOKEN: "  " })).toBeNull();
  });
  it("derives hosts from PORT and allows only the app origin", () => {
    expect(guardConfigFromEnv({ MASARFLOW_TOKEN: "abc", PORT: "41000" })).toEqual({
      token: "abc",
      allowedHosts: ["127.0.0.1:41000", "localhost:41000"],
      allowedOrigins: ["masarflow://app"],
    });
  });
});
