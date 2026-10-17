import { describe, expect, it } from "vitest";
import { ALL_NAV_ITEMS, NAV_GROUPS } from "@/lib/nav";
import { PAGE_PATHS } from "@/lib/dock/registry";
import { readSources } from "./_helpers/fs-scan";

const loader = () => readSources().find((s) => s.path === "src/components/dock/panel-loader.tsx")?.text ?? "";
const routeFiles = () => readSources().map((s) => s.path);

describe("navigation integrity", () => {
  it("every nav item is a dock page", () => {
    for (const item of ALL_NAV_ITEMS) {
      expect(PAGE_PATHS, item.href).toContain(item.href);
    }
  });

  it("every nav item has a route file and a loader entry", () => {
    const files = routeFiles();
    const source = loader();
    for (const path of PAGE_PATHS) {
      const file = `src/app/(workspace)${path}/page.tsx`;
      expect(files, path).toContain(file);
      expect(source, path).toContain(`"${path}": dynamic(`);
    }
  });

  it("no two nav items share an href", () => {
    const seen = new Set<string>();
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(seen.has(item.href), item.href).toBe(false);
        seen.add(item.href);
        for (const child of item.children ?? []) {
          // A child may alias its own parent's route (Brain → Notes both point
          // at "/brain"; dock/registry.ts documents this) — nothing else may
          // collide, or the palette and the dock would list the same page twice.
          if (child.href === item.href) continue;
          expect(seen.has(child.href), child.href).toBe(false);
          seen.add(child.href);
        }
      }
    }
  });

  it("label every group with a plain-language name", () => {
    for (const group of NAV_GROUPS) {
      // "AI" is a legitimate acronym, not a shouty label — allow pure acronyms.
      if (/^[A-Z]{1,3}$/.test(group.label)) continue;
      expect(group.label.length).toBeGreaterThan(2);
      expect(group.label).not.toBe(group.label.toUpperCase());
    }
  });
});
