import { describe, it, expect } from "vitest";
import { formatModelRef, parseModelRef, parseSlashModel, resolveModelRef } from "@/lib/ai/providers/model-ref";

describe("model refs", () => {
  it("formats and parses provider:model, keeping colons inside the model id", () => {
    expect(formatModelRef("anthropic", "claude-sonnet-4-5")).toBe("anthropic:claude-sonnet-4-5");
    expect(parseModelRef("openrouter:meta/llama-3:free")).toEqual({ providerId: "openrouter", modelId: "meta/llama-3:free" });
    expect(parseModelRef("gpt-5")).toEqual({ providerId: "", modelId: "gpt-5" });
  });
  it("recognises /model and /model <ref>", () => {
    expect(parseSlashModel("/model")).toEqual({ ref: "" });
    expect(parseSlashModel("/model  anthropic:claude-haiku-4-5 ")).toEqual({ ref: "anthropic:claude-haiku-4-5" });
    expect(parseSlashModel("hello /model x")).toBeNull();
    expect(parseSlashModel("/models")).toBeNull();
  });
  it("resolves against saved connections", () => {
    const conns = [
      { id: "c1", providerId: "anthropic", label: "Work" },
      { id: "c2", providerId: "openai", label: "Personal" },
    ];
    expect(resolveModelRef("openai:gpt-5", conns)).toEqual({ connectionId: "c2", modelId: "gpt-5" });
    expect(resolveModelRef("Work:claude-haiku-4-5", conns)).toEqual({ connectionId: "c1", modelId: "claude-haiku-4-5" });
    expect(resolveModelRef("nope:x", conns)).toBeNull();
    expect(resolveModelRef("gpt-5", conns)).toBeNull();
  });
});
