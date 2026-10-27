import { describe, expect, it } from "vitest";
import { buildCommands, type CommandContext } from "@/lib/commands/registry";

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

describe("buildCommands", () => {
  it("produces unique ids and non-empty labels", () => {
    const commands = buildCommands(CTX);
    const ids = commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const command of commands) {
      expect(command.label.length).toBeGreaterThan(2);
      expect(command.group.length).toBeGreaterThan(1);
      expect(typeof command.run).toBe("function");
    }
  });

  it("covers tabs, tools, navigation, project, appearance and data", () => {
    const groups = new Set(buildCommands(CTX).map((c) => c.group));
    for (const group of ["Actions", "Tabs", "Tools", "Go to", "Project", "Appearance", "Data"]) {
      expect(groups, group).toContain(group);
    }
  });

  it("opens the six surfaces and every tool page", () => {
    const commands = buildCommands(CTX);
    for (const href of ["/today", "/capture", "/work", "/library", "/ask", "/system", "/tools/terminal", "/tools/logs", "/tools/system"]) {
      expect(commands.some((c) => c.id === `open:${href}`), href).toBe(true);
    }
  });

  it("offers one command per project, never for the active one", () => {
    const commands = buildCommands(CTX).filter((c) => c.id.startsWith("project:"));
    expect(commands.map((c) => c.id)).toEqual(["project:p2"]);
    expect(commands[0].label).toBe("Switch to Roguelike");
  });

  it("never exposes dock controls and hides unavailable desktop commands", () => {
    const webCtx: CommandContext = { ...CTX, desktopAvailable: false };
    const ids = buildCommands(webCtx).map((c) => c.id);
    expect(ids.some((id) => id.startsWith("dock:"))).toBe(false);
    expect(ids).toContain("tab:close");
    expect(ids).toContain("tab:reopen");
    expect(ids).not.toContain("open:/tools/terminal");
    expect(ids).not.toContain("tool:open-logs-folder");
  });

  it("never exposes a destructive command without a confirmation path", () => {
    for (const command of buildCommands(CTX)) {
      if (command.tone !== "danger") continue;
      expect(command.confirm, command.id).toBeTruthy();
    }
  });
});
