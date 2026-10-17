import { describe, it, expect } from "vitest";
import {
  fallbackNoticeText,
  parseFallbackNotice,
} from "@/lib/ai/providers/fallback-notice";

describe("fallback notices", () => {
  it("formats the switch line and round-trips the keep offer", () => {
    const target = { connectionId: "c2", modelId: "meta/llama-3:free" };
    const notice = fallbackNoticeText("Backup", target, "429 rate limit");
    expect(notice).toContain("Switched to Backup:meta/llama-3:free — 429 rate limit");
    const parsed = parseFallbackNotice(notice);
    expect(parsed.text).toBe(
      "Switched to Backup:meta/llama-3:free — 429 rate limit",
    );
    expect(parsed.keep).toEqual(target);
  });

  it("leaves plain notices untouched", () => {
    const parsed = parseFallbackNotice("Workspace briefing trimmed.");
    expect(parsed.text).toBe("Workspace briefing trimmed.");
    expect(parsed.keep).toBeNull();
  });

  it("renders nothing of the marker even for empty ids", () => {
    const parsed = parseFallbackNotice(
      fallbackNoticeText("Local (Ollama)", { connectionId: "", modelId: "m" }, "boom"),
    );
    expect(parsed.text).toBe("Switched to Local (Ollama):m — boom");
    expect(parsed.keep).toEqual({ connectionId: "", modelId: "m" });
  });
});
