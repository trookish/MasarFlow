import { describe, it, expect } from "vitest";
import { entityKindSchema } from "@/lib/db/schema";
import { ENTITY_KINDS } from "@/lib/entities/registry";
import { WORKSPACE_TOOLS } from "@/lib/ai/workspace-tool-defs";

function enumOf(tool: string, prop: string): string[] {
  const def = WORKSPACE_TOOLS.find((t) => t.name === tool);
  const props = (def!.parameters as { properties: Record<string, { enum?: string[] }> }).properties;
  return props[prop].enum!;
}

describe("entity kinds stay in sync", () => {
  it("registry == zod schema (same order)", () => {
    expect([...ENTITY_KINDS]).toEqual([...entityKindSchema.options]);
  });
  it("create_link accepts every kind", () => {
    expect(enumOf("create_link", "sourceType")).toEqual([...entityKindSchema.options]);
    expect(enumOf("create_link", "targetType")).toEqual([...entityKindSchema.options]);
  });
});
