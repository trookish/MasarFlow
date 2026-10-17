import { beforeEach, describe, expect, it } from "vitest";
import { defaultProjectState } from "@/lib/dock/presets";
import {
  clearUndo,
  peekUndo,
  rememberUndo,
  takeUndo,
  undoDepth,
} from "@/lib/dock/undo";

const state = (tag: string) => ({ ...defaultProjectState(), activeWorkspace: tag });

beforeEach(() => clearUndo());

describe("dock undo history", () => {
  it("is last-in-first-out and per project", () => {
    rememberUndo("p1", "Closed Task Boards", state("A"));
    rememberUndo("p1", "Closed Notes", state("B"));
    rememberUndo("p2", "Closed Chat", state("C"));

    expect(undoDepth("p1")).toBe(2);
    expect(takeUndo("p1")?.label).toBe("Closed Notes");
    expect(takeUndo("p1")?.label).toBe("Closed Task Boards");
    expect(takeUndo("p1")).toBeNull();
    expect(peekUndo("p2")?.label).toBe("Closed Chat");
  });

  it("peek does not consume", () => {
    rememberUndo("p1", "Reset workspace", state("A"));
    expect(peekUndo("p1")?.label).toBe("Reset workspace");
    expect(undoDepth("p1")).toBe(1);
  });

  it("keeps only the 10 newest entries", () => {
    for (let i = 1; i <= 12; i += 1) rememberUndo("p1", `step ${i}`, state("A"));
    expect(undoDepth("p1")).toBe(10);
    // The ring kept steps 3..12: consuming 10 entries walks 12 down to 3.
    expect(takeUndo("p1")?.label).toBe("step 12");
    for (let i = 0; i < 8; i += 1) takeUndo("p1");
    expect(takeUndo("p1")?.label).toBe("step 3");
    expect(takeUndo("p1")).toBeNull();
  });

  it("returns a snapshot that is not mutated by later edits", () => {
    const snapshot = state("A");
    rememberUndo("p1", "Closed Dashboard", snapshot);
    snapshot.collapsedPanels.push("/tasks");
    expect(takeUndo("p1")?.state.collapsedPanels).toEqual([]);
  });
});
