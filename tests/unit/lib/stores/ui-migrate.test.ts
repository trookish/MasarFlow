import { describe, it, expect } from "vitest";
import { migrateUi } from "@/lib/stores/ui";

describe("ui store v0 → v1", () => {
  it("an untouched dock moves to the standard layout and shows the notice", () => {
    expect(migrateUi({ dockEnabled: true, taskbarDirection: "bottom", activeNavGroup: "Capture" }, 0, 1)).toEqual({
      sidebarCollapsed: false,
      taskbarDirection: "bottom",
      layoutMode: "standard",
      layoutNoticeSeen: false,
    });
  });

  it("a customised dock keeps the Studio layout", () => {
    const tiled = migrateUi({ dockEnabled: true, taskbarDirection: "bottom" }, 0, 3);
    expect(tiled.layoutMode).toBe("studio");
    expect(migrateUi({ dockEnabled: true, taskbarDirection: "left" }, 0, 0).layoutMode).toBe("studio");
    expect(tiled.layoutNoticeSeen).toBe(true);
    expect("activeNavGroup" in tiled).toBe(false);
  });

  it("a user who had turned the dock off gets the standard layout without a notice", () => {
    const m = migrateUi({ dockEnabled: false, taskbarDirection: "right", sidebarCollapsed: true }, 0, 4);
    expect(m).toMatchObject({ layoutMode: "standard", layoutNoticeSeen: true, sidebarCollapsed: true });
  });
});
