/**
 * Every action the palette can run, as data. One list, built per context, so
 * the palette stays a renderer and this module stays testable.
 *
 * Rules the tests enforce:
 * - ids are unique and stable ("open:/tools/terminal", "dock:float");
 * - a command is only offered when it can actually run (dock on, project open,
 *   desktop app present);
 * - a destructive command carries `confirm` copy, which the palette turns into
 *   the shared ConfirmDialog — never a one-click wipe.
 *
 * Pure TypeScript only — no React, Next, DOM, or Dexie imports. Actions are
 * injected through the context so this file never imports the dock store.
 */

export type CommandTone = "default" | "danger";

export interface CommandContext {
  dockEnabled: boolean;
  hasProject: boolean;
  projectId: string | null;
  theme: "light" | "dark";
  projects: { id: string; name: string }[];
  desktopAvailable: boolean;
}

export interface Command {
  id: string;
  /** What it does, in the user's words. */
  label: string;
  group: "Panels" | "Dock" | "Tools" | "Go to" | "Project" | "Appearance" | "Data";
  /** Extra search terms (never shown). */
  keywords?: string[];
  /** Shown on the right of the row. */
  hint?: string;
  tone?: CommandTone;
  /** Confirmation copy for destructive commands. */
  confirm?: { title: string; body: string; confirmLabel: string };
  run: () => void | Promise<void>;
}

export const DOCK_PAGES: { href: string; label: string }[] = [
  { href: "/today", label: "Today" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Task Boards" },
  { href: "/chat", label: "Chat" },
  { href: "/brain", label: "Notes" },
  { href: "/specs", label: "Specifications" },
  { href: "/docs", label: "Documentation" },
  { href: "/settings", label: "Settings" },
];

export const TOOL_PAGES: { href: string; label: string; keywords: string[] }[] = [
  { href: "/tools/terminal", label: "Terminal", keywords: ["shell", "console", "command", "powershell"] },
  { href: "/tools/logs", label: "Logs", keywords: ["diagnostics", "errors", "output"] },
  { href: "/tools/system", label: "System Info", keywords: ["version", "storage", "environment", "paths"] },
];

/**
 * Build the command list for a context. `actions` carries the side effects, so
 * the registry stays pure and every command is trivially testable.
 */
export interface CommandActions {
  navigate: (href: string) => void;
  openPanel: (panelId: string) => void;
  closeFocusedPanel: () => void;
  floatFocusedPanel: () => void;
  toggleMaximizeFocused: () => void;
  resetWorkspace: () => void;
  copyLayout: () => void;
  pasteLayout: () => void;
  toggleTheme: () => void;
  switchProject: (projectId: string) => void;
  newTask: () => void;
  newNote: () => void;
  openDailyNote: () => void;
  openLogsFolder: () => void;
  resetAllData: () => void;
  isEntityOpen: (href: string) => boolean;
}

/**
 * Default actions: every command still exists (so callers can build the list
 * without wiring side effects, as the registry tests do), but running one is a
 * no-op until the palette injects the real actions.
 */
const NOOP_ACTIONS: CommandActions = {
  navigate: () => {},
  openPanel: () => {},
  closeFocusedPanel: () => {},
  floatFocusedPanel: () => {},
  toggleMaximizeFocused: () => {},
  resetWorkspace: () => {},
  copyLayout: () => {},
  pasteLayout: () => {},
  toggleTheme: () => {},
  switchProject: () => {},
  newTask: () => {},
  newNote: () => {},
  openDailyNote: () => {},
  openLogsFolder: () => {},
  resetAllData: () => {},
  isEntityOpen: () => false,
};

export function buildCommands(
  ctx: CommandContext,
  actions: CommandActions = NOOP_ACTIONS,
): Command[] {
  const commands: Command[] = [];

  // Pages (always available — this is the app's navigation).
  for (const page of DOCK_PAGES) {
    commands.push({
      id: `open:${page.href}`,
      label: `Open ${page.label}`,
      group: "Go to",
      keywords: [page.label.toLowerCase()],
      hint: ctx.dockEnabled ? "Dock panel" : "Page",
      run: () => actions.navigate(page.href),
    });
  }

  // Tool panels: desktop app only.
  if (ctx.desktopAvailable) {
    for (const tool of TOOL_PAGES) {
      commands.push({
        id: `open:${tool.href}`,
        label: `Open ${tool.label}`,
        group: "Tools",
        keywords: tool.keywords,
        hint: "Desktop app",
        run: () => actions.navigate(tool.href),
      });
    }
    commands.push({
      id: "tool:open-logs-folder",
      label: "Open the logs folder",
      group: "Tools",
      keywords: ["diagnostics", "explorer", "finder"],
      run: () => actions.openLogsFolder(),
    });
  }

  if (ctx.dockEnabled && ctx.hasProject) {
    commands.push(
      {
        id: "dock:float",
        label: "Float the focused panel",
        group: "Dock",
        keywords: ["window", "undock"],
        hint: "Alt+F",
        run: () => actions.floatFocusedPanel(),
      },
      {
        id: "dock:maximize",
        label: "Maximize / restore the focused panel",
        group: "Dock",
        keywords: ["full", "fill"],
        hint: "Alt+M",
        run: () => actions.toggleMaximizeFocused(),
      },
      {
        id: "dock:close",
        label: "Close the focused panel",
        group: "Dock",
        keywords: ["hide", "remove"],
        hint: "Alt+W",
        run: () => actions.closeFocusedPanel(),
      },
      {
        id: "dock:reset-workspace",
        label: "Reset this workspace to its preset layout",
        group: "Dock",
        keywords: ["restore", "default", "layout"],
        run: () => actions.resetWorkspace(),
      },
      {
        id: "dock:copy-layout",
        label: "Copy this layout to the clipboard",
        group: "Dock",
        keywords: ["export", "json", "share"],
        run: () => actions.copyLayout(),
      },
      {
        id: "dock:paste-layout",
        label: "Paste a layout from the clipboard",
        group: "Dock",
        keywords: ["import", "json", "restore"],
        run: () => actions.pasteLayout(),
      },
    );
  }

  if (ctx.hasProject) {
    commands.push(
      {
        id: "create:task",
        label: "New task",
        group: "Panels",
        keywords: ["todo", "add"],
        run: () => actions.newTask(),
      },
      {
        id: "create:note",
        label: "New note",
        group: "Panels",
        keywords: ["write", "brain"],
        run: () => actions.newNote(),
      },
      {
        id: "create:today-note",
        label: "Open today's note",
        group: "Panels",
        keywords: ["daily", "journal"],
        run: () => actions.openDailyNote(),
      },
    );
  }

  for (const project of ctx.projects) {
    if (project.id === ctx.projectId) continue;
    commands.push({
      id: `project:${project.id}`,
      label: `Switch to ${project.name}`,
      group: "Project",
      keywords: ["workspace", "open"],
      run: () => actions.switchProject(project.id),
    });
  }

  commands.push({
    id: "theme:toggle",
    label: ctx.theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme",
    group: "Appearance",
    keywords: ["dark", "light", "mode"],
    run: () => actions.toggleTheme(),
  });

  commands.push({
    id: "data:reset",
    label: "Reset all data",
    group: "Data",
    keywords: ["wipe", "clear", "delete everything", "factory"],
    tone: "danger",
    confirm: {
      title: "Reset all data?",
      body: "Every project, note, task and activity row in this browser profile is deleted. This cannot be undone.",
      confirmLabel: "Delete everything",
    },
    run: () => actions.resetAllData(),
  });

  return commands;
}
