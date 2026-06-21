import { describe, it, expect } from "vitest";
import { AGENT_ROSTER } from "./agents";
import { assigneeSchema } from "@/lib/db/schema";

describe("AGENT_ROSTER", () => {
  it("has unique stable ids", () => {
    const ids = AGENT_ROSTER.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("agent-"))).toBe(true);
  });

  it("uses valid assignee roles", () => {
    for (const a of AGENT_ROSTER) {
      expect(() => assigneeSchema.parse(a.role)).not.toThrow();
    }
  });

  it("gives every agent a non-empty system prompt", () => {
    expect(AGENT_ROSTER.every((a) => a.systemPrompt.trim().length > 20)).toBe(
      true,
    );
  });
});
