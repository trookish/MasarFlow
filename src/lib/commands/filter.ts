/**
 * Palette filtering: one pure function for commands, testable without cmdk.
 * Ranking: label prefix > label contains > keyword hit, then group order as
 * built (Panels, Dock, Tools, …) so the first row is stable.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { Command, CommandContext } from "./registry";

export type CommandMode = "all" | "go" | "dock";

/**
 * True when a command may run in this context. Commands from `buildCommands`
 * are already gated, so this refuses the cases a partially built list could
 * still contain: dock verbs without a dock/project, tool panels without the
 * desktop app, project switches without a project.
 */
export function isCommandAvailable(command: Command, ctx: CommandContext): boolean {
  if (command.group === "Dock" && !(ctx.dockEnabled && ctx.hasProject)) return false;
  if (command.group === "Tools" && !ctx.desktopAvailable) return false;
  if (command.id.startsWith("project:") && !ctx.hasProject) return false;
  return true;
}

function score(command: Command, query: string): number | null {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return 0;

  const label = command.label.toLowerCase();
  if (label.startsWith(needle)) return 0;
  if (label.includes(needle)) return 1;
  if (command.group.toLowerCase().includes(needle)) return 2;
  if (command.id.toLowerCase().includes(needle)) return 3;
  for (const keyword of command.keywords ?? []) {
    if (keyword.toLowerCase().includes(needle)) return 4;
  }
  return null;
}

const MODE_GROUPS: Record<CommandMode, string[] | null> = {
  all: null,
  go: ["Go to"],
  dock: ["Dock"],
};

export function filterCommands(
  commands: Command[],
  query: string,
  mode: CommandMode = "all",
): Command[] {
  const groups = MODE_GROUPS[mode];
  const inMode = groups ? commands.filter((c) => groups.includes(c.group)) : commands;

  const scored: { command: Command; rank: number; index: number }[] = [];
  inMode.forEach((command, index) => {
    const rank = score(command, query);
    if (rank === null) return;
    scored.push({ command, rank, index });
  });

  scored.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.index - b.index));
  return scored.map((entry) => entry.command).slice(0, 40);
}
