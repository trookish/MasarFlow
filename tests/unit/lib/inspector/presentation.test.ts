import { describe, it, expect } from "vitest";
import {
  clampInspectorWidth,
  inspectorPresentation,
  toggleInspector,
  type PresentationInput,
} from "@/lib/inspector/presentation";

const base: PresentationInput = { open: true, revealed: false, pinned: false, contentWidth: 1400, pageHref: "/today" };

describe("inspectorPresentation", () => {
  it("docks on a wide window for an ordinary page", () => {
    expect(inspectorPresentation(base)).toBe("docked");
  });

  it("never docks below the minimum content width", () => {
    expect(inspectorPresentation({ ...base, contentWidth: 900 })).toBe("hidden");
    expect(inspectorPresentation({ ...base, contentWidth: 900, revealed: true })).toBe("overlay");
  });

  it("floats over board, canvas, graph and diagram pages unless pinned", () => {
    for (const pageHref of ["/tasks", "/brain/canvas", "/knowledge", "/architecture", "/sprints"]) {
      expect(inspectorPresentation({ ...base, pageHref })).toBe("hidden");
      expect(inspectorPresentation({ ...base, pageHref, revealed: true })).toBe("overlay");
      expect(inspectorPresentation({ ...base, pageHref, pinned: true })).toBe("docked");
    }
  });

  it("shows a revealed overlay even when the preference is off", () => {
    expect(inspectorPresentation({ ...base, open: false })).toBe("hidden");
    expect(inspectorPresentation({ ...base, open: false, revealed: true })).toBe("overlay");
  });

  it("treats an unmeasured width as wide enough", () => {
    expect(inspectorPresentation({ ...base, contentWidth: 0 })).toBe("docked");
  });
});

describe("toggleInspector", () => {
  it("closes a docked inspector", () => {
    expect(toggleInspector(base)).toEqual({ open: false, revealed: false });
  });

  it("reveals the overlay on a page that cannot dock", () => {
    expect(toggleInspector({ ...base, pageHref: "/tasks" })).toEqual({ open: true, revealed: true });
  });

  it("dismisses a visible overlay without touching the preference", () => {
    expect(toggleInspector({ ...base, pageHref: "/tasks", revealed: true })).toEqual({ open: true, revealed: false });
  });

  it("re-docks from the preference when there is room", () => {
    expect(toggleInspector({ ...base, open: false })).toEqual({ open: true, revealed: false });
  });
});

describe("clampInspectorWidth", () => {
  it("clamps and rounds", () => {
    expect(clampInspectorWidth(100)).toBe(280);
    expect(clampInspectorWidth(900)).toBe(480);
    expect(clampInspectorWidth(333.4)).toBe(333);
    expect(clampInspectorWidth(Number.NaN)).toBe(340);
  });
});
