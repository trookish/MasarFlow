import { describe, expect, it } from "vitest";
import { buildCommands, type CommandContext } from "@/lib/commands/registry";

const CTX: CommandContext = {
  dockEnabled: true,
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

  it("covers dock, tools, navigation, project, appearance and data", () => {
    const groups = new Set(buildCommands(CTX).map((c) => c.group));
    for (const group of ["Panels", "Dock", "Tools", "Go to", "Project", "Appearance", "Data"]) {
      expect(groups, group).toContain(group);
    }
  });

  it("opens every dock page and every tool panel", () => {
    const commands = buildCommands(CTX);
    for (const href of ["/today", "/dashboard", "/tools/terminal", "/tools/logs", "/tools/system"]) {
      expect(commands.some((c) => c.id === `open:${href}`), href).toBe(true);
    }
  });

  it("offers one command per project, never for the active one", () => {
    const commands = buildCommands(CTX).filter((c) => c.id.startsWith("project:"));
    expect(commands.map((c) => c.id)).toEqual(["project:p2"]);
    expect(commands[0].label).toBe("Switch to Roguelike");
  });

  it("hides dock-only and desktop-only commands when they cannot run", () => {
    const webCtx: CommandContext = { ...CTX, dockEnabled: false, desktopAvailable: false };
    const ids = buildCommands(webCtx).map((c) => c.id);
    expect(ids).not.toContain("dock:float");
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
