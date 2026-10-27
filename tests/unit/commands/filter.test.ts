import { describe, expect, it } from "vitest";
import { buildCommands, type CommandContext } from "@/lib/commands/registry";
import { filterCommands, isCommandAvailable } from "@/lib/commands/filter";

const CTX: CommandContext = {
  hasProject: true,
  projectId: "p1",
  theme: "dark",
  projects: [
    { id: "p1", name: "MasarFlow" },
    { id: "p2", name: "Roguelike" },
  ],
  desktopAvailable: true,
};

describe("filterCommands", () => {
  const commands = buildCommands(CTX);

  it("matches label, group and keywords", () => {
    expect(filterCommands(commands, "terminal").map((c) => c.id)).toContain("open:/tools/terminal");
    expect(filterCommands(commands, "shell").map((c) => c.id)).toContain("open:/tools/terminal");
    expect(filterCommands(commands, "close").map((c) => c.id)).toContain("tab:close");
  });

  it("ranks a label prefix above a keyword hit", () => {
    const result = filterCommands(commands, "today");
    expect(result[0].id).toBe("open:/today");
  });

  it("returns everything (capped) for an empty query", () => {
    expect(filterCommands(commands, "").length).toBeGreaterThan(5);
    expect(filterCommands(commands, "   ").length).toBe(filterCommands(commands, "").length);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(filterCommands(commands, "zzzzz")).toEqual([]);
  });

  it("filters by mode chips", () => {
    const tabOnly = filterCommands(commands, "", "tabs");
    expect(tabOnly.every((c) => c.group === "Tabs")).toBe(true);
    const gotoOnly = filterCommands(commands, "", "go");
    expect(gotoOnly.every((c) => c.group === "Go to")).toBe(true);
  });

  it("availability respects the project context", () => {
    expect(isCommandAvailable({ id: "x", label: "X", group: "Tabs", run: () => {}, tone: "default" }, CTX)).toBe(true);
    expect(isCommandAvailable({ id: "x", label: "X", group: "Tabs", run: () => {}, tone: "default" }, { ...CTX, hasProject: false })).toBe(false);
  });
});
