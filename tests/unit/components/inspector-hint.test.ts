import { describe, it, expect } from "vitest";
import { selectionHint } from "@/components/entity/inspector";
import { SURFACES } from "@/lib/navigation/surfaces";

describe("selectionHint", () => {
  it("gives every surface section a non-empty, section-specific hint", () => {
    for (const surface of SURFACES) {
      for (const section of surface.sections) {
        const hint = selectionHint(surface, section);
        expect(hint.length, `${surface.id}/${section.id}`).toBeGreaterThan(20);
        expect(hint).not.toBe(surface.description);
      }
    }
  });

  it("names what a board can select", () => {
    const work = SURFACES.find((s) => s.id === "work")!;
    const board = work.sections.find((s) => s.id === "board")!;
    expect(selectionHint(work, board)).toMatch(/task/);
  });
});
