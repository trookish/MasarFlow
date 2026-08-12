import { describe, it, expect } from "vitest";
import {
  WORKSPACE_TOOLS,
  WORKSPACE_TOOL_NAMES,
} from "@/lib/ai/workspace-tool-defs";
import {
  NOTE_TYPES,
  STANDARD_CATEGORIES,
  specStatusSchema,
  taskStatusSchema,
  taskPrioritySchema,
  assigneeSchema,
} from "@/lib/db/schema";

/** Pull an enum property's values out of a tool definition's JSON schema. */
function enumValues(toolName: string, prop: string): string[] {
  const def = WORKSPACE_TOOLS.find((t) => t.name === toolName);
  expect(def, `tool ${toolName} exists`).toBeDefined();
  const properties = (
    def!.parameters as {
      properties?: Record<string, { enum?: string[] }>;
    }
  ).properties;
  const values = properties?.[prop]?.enum;
  expect(values, `enum ${toolName}.${prop}`).toBeDefined();
  return values!;
}

describe("workspace-tool-defs parity with db/schema", () => {
  it("keeps the inline enum copies in sync with the zod schemas", () => {
    expect(enumValues("create_note", "type")).toEqual([...NOTE_TYPES]);
    expect(enumValues("create_spec", "status")).toEqual([
      ...specStatusSchema.options,
    ]);
    expect(enumValues("create_task", "status")).toEqual([
      ...taskStatusSchema.options,
    ]);
    expect(enumValues("create_task", "priority")).toEqual([
      ...taskPrioritySchema.options,
    ]);
    expect(enumValues("create_task", "assignee")).toEqual([
      ...assigneeSchema.options,
    ]);
  });

  it("lists the suggested standard categories in the tool description", () => {
    const def = WORKSPACE_TOOLS.find((t) => t.name === "create_standard");
    expect(def).toBeDefined();
    const category = (
      def!.parameters as { properties?: Record<string, { description?: string }> }
    ).properties?.category;
    expect(category?.description).toContain(STANDARD_CATEGORIES[0]);
    expect(category?.description).toContain(STANDARD_CATEGORIES.at(-1));
  });

  it("has unique tool names and consistent name lists", () => {
    const names = WORKSPACE_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(WORKSPACE_TOOL_NAMES).toEqual(names);
  });

  it("describes every tool with parameters in the JSON-schema shape", () => {
    for (const t of WORKSPACE_TOOLS) {
      expect(t.description.length).toBeGreaterThan(10);
      const params = t.parameters as {
        type: string;
        properties?: object;
        required?: string[];
      };
      expect(params.type).toBe("object");
      if (params.required) {
        for (const r of params.required) {
          expect(params.properties).toHaveProperty(r);
        }
      }
    }
  });
});
