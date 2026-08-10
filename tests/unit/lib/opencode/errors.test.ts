import { describe, expect, it } from "vitest";

import {
  OpenCodeError,
  classifyAssistantError,
  classifyHttp,
  safeDetail,
  userMessage,
} from "@/lib/opencode/errors";

describe("classifyHttp", () => {
  it("maps auth failures", () => {
    const e = classifyHttp(401, "unauthorized");
    expect(e.kind).toBe("auth");
    expect(e.retryable).toBe(false);
  });

  it("maps not-found", () => {
    expect(classifyHttp(404, "").kind).toBe("not_found");
  });

  it("maps rate limits as retryable", () => {
    const e = classifyHttp(429, "");
    expect(e.kind).toBe("rate_limit");
    expect(e.retryable).toBe(true);
  });

  it("maps 5xx as retryable provider errors", () => {
    const e = classifyHttp(502, "bad gateway");
    expect(e.kind).toBe("provider_error");
    expect(e.retryable).toBe(true);
  });

  it("keeps unknown statuses as unknown", () => {
    expect(classifyHttp(418, "teapot").kind).toBe("unknown");
  });
});

describe("classifyAssistantError", () => {
  it("maps ProviderAuthError to provider_auth with actionable copy", () => {
    const e = classifyAssistantError({
      name: "ProviderAuthError",
      data: { providerID: "anthropic", message: "invalid key" },
    })!;
    expect(e.kind).toBe("provider_auth");
    expect(e.message).toContain("opencode auth");
  });

  it("maps 429 APIError to rate_limit", () => {
    const e = classifyAssistantError({
      name: "APIError",
      data: { message: "rate limited", statusCode: 429, isRetryable: true },
    })!;
    expect(e.kind).toBe("rate_limit");
    expect(e.retryable).toBe(true);
  });

  it("maps context-window 400s to a helpful bad_request", () => {
    const e = classifyAssistantError({
      name: "APIError",
      data: { message: "context length exceeded", statusCode: 400, isRetryable: false },
    })!;
    expect(e.kind).toBe("bad_request");
    expect(e.message).toMatch(/context window/i);
  });

  it("maps MessageAbortedError / MessageOutputLengthError", () => {
    expect(classifyAssistantError({ name: "MessageAbortedError", data: { message: "x" } })!.kind).toBe("message_aborted");
    expect(classifyAssistantError({ name: "MessageOutputLengthError", data: {} })!.kind).toBe("output_length");
  });

  it("returns null for undefined", () => {
    expect(classifyAssistantError(undefined)).toBeNull();
  });
});

describe("safeDetail / userMessage", () => {
  it("redacts long tokens and truncates", () => {
    const secret = "sk-".padEnd(60, "a");
    const out = safeDetail(`failed with ${secret} here`);
    expect(out).not.toContain("a".repeat(40));
    expect(out.length).toBeLessThanOrEqual(170);
  });

  it("userMessage unwraps OpenCodeError", () => {
    expect(userMessage(new OpenCodeError("unavailable", "boom"))).toBe("boom");
  });

  it("userMessage sanitizes arbitrary errors", () => {
    const secret = "x".repeat(80);
    expect(userMessage(new Error(`bad ${secret}`)).length).toBeLessThan(180);
  });
});
