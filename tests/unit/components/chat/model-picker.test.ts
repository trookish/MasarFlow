import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  UnifiedModelPicker,
  filterModelPickerEntries,
  modelPickerEntries,
  selectionOf,
} from "@/components/chat/model-picker";
import type { Catalog } from "@/lib/ai/catalog";
import type { AiConnection } from "@/lib/db/schema";

const catalog: Catalog = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    api: "https://api.anthropic.com",
    npm: "@ai-sdk/anthropic",
    env: ["ANTHROPIC_API_KEY"],
    models: {
      "claude-haiku-4": {
        id: "claude-haiku-4",
        name: "Claude Haiku 4",
        tool_call: true,
      },
      "claude-sonnet-4": {
        id: "claude-sonnet-4",
        name: "Claude Sonnet 4",
        tool_call: true,
        attachment: true,
        reasoning: true,
      },
    },
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    api: "https://api.openai.com/v1",
    npm: "@ai-sdk/openai",
    env: ["OPENAI_API_KEY"],
    models: {
      "gpt-4o-mini": { id: "gpt-4o-mini", name: "GPT-4o mini", tool_call: false },
    },
  },
};

function conn(id: string, providerId: string, label: string): AiConnection {
  return { id, providerId, label, apiKey: "", baseUrl: "", createdAt: 0, updatedAt: 0 };
}

const connections: AiConnection[] = [
  conn("c1", "anthropic", "Work"),
  conn("c2", "openai", "Home"),
];

describe("unified model picker", () => {
  it("renders the models of every saved connection", () => {
    const entries = modelPickerEntries(connections, catalog);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => `${e.connectionLabel}/${e.model.id}`)).toEqual([
      "Work/claude-haiku-4",
      "Work/claude-sonnet-4",
      "Home/gpt-4o-mini",
    ]);
    // Capability badges come from the model metadata.
    expect(entries.find((e) => e.model.id === "claude-sonnet-4")?.reasoning).toBe(true);
    expect(entries.find((e) => e.model.id === "gpt-4o-mini")?.tools).toBe(false);
  });

  it("typing haiku filters to matching models", () => {
    const entries = modelPickerEntries(connections, catalog);
    const filtered = filterModelPickerEntries(entries, { query: "haiku" });
    expect(filtered.map((e) => e.model.id)).toEqual(["claude-haiku-4"]);
    expect(filterModelPickerEntries(entries, { query: "GPT-4o" })).toHaveLength(1);
    expect(filterModelPickerEntries(entries, { connectionId: "c2" })).toHaveLength(1);
  });

  it("selecting a row yields the connection/model/provider patch", () => {
    const entries = modelPickerEntries(connections, catalog);
    const haiku = filterModelPickerEntries(entries, { query: "haiku" })[0];
    expect(selectionOf(haiku)).toEqual({
      connectionId: "c1",
      modelId: "claude-haiku-4",
      providerId: "anthropic",
    });
  });

  it("renders the open picker with both connections and every model", () => {
    const html = renderToStaticMarkup(
      createElement(UnifiedModelPicker, {
        connections,
        catalog,
        connectionId: "c1",
        modelId: "claude-haiku-4",
        open: true,
        onOpenChange: () => {},
        onSelect: () => {},
        onManageConnections: () => {},
      }),
    );
    expect(html).toContain("Claude Haiku 4");
    expect(html).toContain("Claude Sonnet 4");
    expect(html).toContain("GPT-4o mini");
    expect(html).toContain("Work");
    expect(html).toContain("Home");
    expect(html).toContain("Manage connections");
  });
});
