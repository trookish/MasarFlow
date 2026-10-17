import { describe, it } from "vitest";
import { PLUGIN_CATALOG } from "@/lib/plugins";
import { readSources } from "../_helpers/fs-scan";
import { expectShrinkingAllowlist } from "../_helpers/shrinking-allowlist";

/** Catalog plugins nothing consumes (verified 2026-10-16). Must be [] by P9. */
const UNWIRED_PLUGINS = [
  "canvas-ai-assist",
  "canvas-collab",
  "canvas-mermaid",
  "github-commits",
  "obsidian-sync",
];

describe("plugin catalog is real", () => {
  it("every catalog plugin id is referenced outside the catalog", () => {
    const sources = readSources().filter((s) => s.path !== "src/lib/plugins.ts");
    const unwired = PLUGIN_CATALOG.filter(
      (p) => !sources.some((s) => s.text.includes(`"${p.id}"`) || s.text.includes(`'${p.id}'`)),
    ).map((p) => p.id);
    expectShrinkingAllowlist(unwired, UNWIRED_PLUGINS);
  });
});
