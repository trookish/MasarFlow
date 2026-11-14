import { describe, it, expect } from "vitest";
import { migrateUi } from "@/lib/stores/ui";

const DEFAULTS = { sidebarCollapsed: false, inspectorOpen: true, sidebarPosition: "left", dockCollapsed: false };

describe("ui store migration", () => {
  it("drops Studio preferences and keeps the 0.1 taskbar direction as the sidebar position", () => {
    expect(
      migrateUi(
        {
          dockEnabled: true,
          layoutMode: "studio",
          taskbarDirection: "right",
          layoutNoticeSeen: false,
          activeNavGroup: "Capture",
          sidebarCollapsed: true,
        },
        1,
      ),
    ).toEqual({ ...DEFAULTS, sidebarCollapsed: true, sidebarPosition: "right" });
  });

  it("also normalizes older dock-only preferences", () => {
    expect(migrateUi({ dockEnabled: true, taskbarDirection: "bottom" }, 0)).toEqual({
      ...DEFAULTS,
      sidebarPosition: "bottom",
    });
  });

  it("adds the position and dock state to a v2 state", () => {
    expect(migrateUi({ sidebarCollapsed: true, inspectorOpen: false }, 2)).toEqual({
      ...DEFAULTS,
      sidebarCollapsed: true,
      inspectorOpen: false,
    });
  });

  it("ignores an unknown position", () => {
    expect(migrateUi({ sidebarPosition: "top", taskbarDirection: "diagonal" }, 2)).toEqual(DEFAULTS);
  });

  it("starts with an expanded navigation on the left", () => {
    expect(migrateUi(null, 0)).toEqual(DEFAULTS);
  });
});
