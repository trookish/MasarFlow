import { describe, it, expect } from "vitest";
import { friendlyChatError } from "@/lib/ai/errors";

describe("friendlyChatError", () => {
  it("maps auth failures", () => {
    expect(friendlyChatError("401 Unauthorized: invalid api key")).toMatch(
      /^Authentication failed — check the API key/,
    );
  });

  it("maps missing models", () => {
    expect(friendlyChatError("404: no such model: gpt-9")).toMatch(
      /^Model not found/,
    );
  });

  it("maps rate limits", () => {
    expect(friendlyChatError("429 rate limit exceeded")).toMatch(
      /^Rate limited/,
    );
  });

  it("maps credit exhaustion", () => {
    expect(friendlyChatError("402 insufficient credits")).toMatch(
      /out of credit/,
    );
  });

  it("maps network failures", () => {
    expect(friendlyChatError("Could not reach provider: fetch failed")).toMatch(
      /^Could not reach the provider/,
    );
  });

  it("maps context overflow", () => {
    expect(
      friendlyChatError("This model's maximum context length is 8192 tokens"),
    ).toMatch(/too long for this model's context window/);
  });

  it("maps provider 5xx", () => {
    expect(friendlyChatError("503 overloaded")).toMatch(
      /^The provider is having trouble/,
    );
  });

  it("passes through unknown errors unchanged", () => {
    expect(friendlyChatError("something weird happened")).toBe(
      "something weird happened",
    );
  });
});
