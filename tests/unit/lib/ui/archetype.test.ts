import { describe, expect, it } from "vitest";
import { SURFACES } from "@/lib/navigation/surfaces";
import {
  AI_SECTIONS,
  FLOATING_ARCHETYPES,
  SECTION_ARCHETYPES,
  archetypeOf,
  floatsInspector,
} from "@/lib/ui/archetype";

const sectionHrefs = SURFACES.flatMap((surface) => surface.sections.map((section) => section.href));

describe("section archetypes", () => {
  it("names an archetype for every surface section, and nothing else", () => {
    expect(Object.keys(SECTION_ARCHETYPES).sort()).toEqual([...sectionHrefs].sort());
  });

  it("floats the Inspector over exactly the board and canvas sections", () => {
    const floating = sectionHrefs.filter(floatsInspector).sort();
    expect(floating).toEqual(["/architecture", "/brain/canvas", "/knowledge", "/sprints", "/tasks"]);
    for (const href of floating) expect(FLOATING_ARCHETYPES.has(archetypeOf(href)!)).toBe(true);
  });

  it("docks beside unknown pages rather than guessing they float", () => {
    expect(archetypeOf("/not-a-section")).toBeNull();
    expect(floatsInspector("/not-a-section")).toBe(false);
  });

  it("takes the AI sections from the AI surface, so a rename cannot drift", () => {
    expect([...AI_SECTIONS]).toEqual(["/chat", "/agents", "/workflow"]);
  });
});
