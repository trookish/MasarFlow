import { describe, it, expect, vi } from "vitest";
import { classifyFailure, runWithFallback, type FallbackTarget } from "@/lib/ai/providers/fallback";

const A: FallbackTarget = { connectionId: "a", modelId: "m1" };
const B: FallbackTarget = { connectionId: "b", modelId: "m2" };

describe("classifyFailure", () => {
  it.each([
    ["429 rate limit", "retryable"],
    ["Rate limited — wait a moment", "retryable"],
    ["502 bad gateway", "retryable"],
    ["fetch failed", "retryable"],
    ["took longer than 120s", "retryable"],
    ["402 insufficient credits", "switch"],
    ["401 invalid api key", "switch"],
    ["404 model not found", "switch"],
    ["maximum context length exceeded", "fatal"],
    ["400 bad request", "fatal"],
    ["Aborted", "fatal"],
  ])("%s → %s", (msg, kind) => {
    expect(classifyFailure(new Error(msg))).toBe(kind);
  });
});

describe("runWithFallback", () => {
  it("returns the first success and reports no switch", async () => {
    const attempt = vi.fn().mockResolvedValue("ok");
    const onSwitch = vi.fn();
    expect(await runWithFallback([A, B], attempt, { onSwitch })).toEqual({ value: "ok", used: A });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onSwitch).not.toHaveBeenCalled();
  });
  it("retries a retryable failure once on the same target, then moves on", async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockResolvedValueOnce("from-b");
    const onSwitch = vi.fn();
    const r = await runWithFallback([A, B], attempt, { onSwitch, retryDelayMs: 0 });
    expect(r).toEqual({ value: "from-b", used: B });
    expect(attempt.mock.calls.map((c) => c[0].connectionId)).toEqual(["a", "a", "b"]);
    expect(onSwitch).toHaveBeenCalledWith(A, B, expect.stringMatching(/429/));
  });
  it("switches immediately on auth/credit/missing-model errors", async () => {
    const attempt = vi.fn().mockRejectedValueOnce(new Error("401 invalid api key")).mockResolvedValueOnce("b");
    const r = await runWithFallback([A, B], attempt, { retryDelayMs: 0 });
    expect(r.used).toEqual(B);
    expect(attempt).toHaveBeenCalledTimes(2);
  });
  it("never falls back on fatal errors (context overflow, abort)", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error("maximum context length exceeded"));
    await expect(runWithFallback([A, B], attempt, { retryDelayMs: 0 })).rejects.toThrow(/context/);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
  it("throws the LAST error when every target fails", async () => {
    const attempt = vi.fn().mockRejectedValueOnce(new Error("401 a")).mockRejectedValueOnce(new Error("401 b"));
    await expect(runWithFallback([A, B], attempt, { retryDelayMs: 0 })).rejects.toThrow("401 b");
  });
  it("rejects an empty chain", async () => {
    await expect(runWithFallback([], vi.fn())).rejects.toThrow(/no model/i);
  });
});
