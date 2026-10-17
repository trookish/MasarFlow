import { describe, expect, it } from "vitest";
import { PAGE_PATHS } from "@/lib/dock/registry";
import { readSources } from "../../_helpers/fs-scan";

/**
 * Static guards over the dock's two registries. They exist because both are
 * hand-written text: a nav entry without a loader entry renders "not
 * available", and a loader entry without a loading state shows an empty box.
 */
const loader = () => readSources().find((s) => s.path === "src/components/dock/panel-loader.tsx");

describe("panel loader", () => {
  it("has a component for every dock page", () => {
    const source = loader()?.text ?? "";
    for (const path of PAGE_PATHS) {
      expect(source, path).toContain(`"${path}": dynamic(`);
    }
  });

  it("passes a loading state to every dynamic import", () => {
    const source = loader()?.text ?? "";
    const dynamicCount = source.match(/dynamic\(/g)?.length ?? 0;
    const loadingCount = source.match(/loading\s*[,}]/g)?.length ?? 0;
    expect(loadingCount).toBe(dynamicCount);
  });

  it("wraps panels in the error boundary", () => {
    const group = readSources().find((s) => s.path === "src/components/dock/dock-group.tsx");
    expect(group?.text ?? "").toContain("<PanelErrorBoundary panelId={panelId}>");
  });

  it("registers the Today view and the three tool panels", () => {
    const source = loader()?.text ?? "";
    for (const path of ["/today", "/tools/terminal", "/tools/logs", "/tools/system"]) {
      expect(source, path).toContain(`"${path}": dynamic(`);
    }
  });
});
