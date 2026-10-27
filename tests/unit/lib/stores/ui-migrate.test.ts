import { describe, it, expect } from "vitest";
import { migrateUi } from "@/lib/stores/ui";

describe("ui store tabs-only migration", () => {
  it("drops Studio and taskbar preferences while preserving the collapsed sidebar", () => {
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
    ).toEqual({ sidebarCollapsed: true, inspectorOpen: true });
  });

  it("also normalizes older dock-only preferences", () => {
    expect(migrateUi({ dockEnabled: true, taskbarDirection: "bottom" }, 0)).toEqual({
      sidebarCollapsed: false,
      inspectorOpen: true,
    });
  });

  it("starts with an expanded surface navigation", () => {
    expect(migrateUi(null, 0)).toEqual({ sidebarCollapsed: false, inspectorOpen: true });
  });
});
