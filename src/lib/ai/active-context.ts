/** "What is the user looking at?" — derived purely from the dock state; no page wiring. */

import { collectPages } from "@/lib/dock/tree";
import { urlOfFocused } from "@/lib/dock/dock-core";
import { pageIdOf, type ProjectDockState } from "@/lib/dock/types";
import { getPageDef } from "@/lib/dock/registry";
import { KIND_META, refFromUrl, type EntityRef } from "@/lib/entities/registry";

export interface OpenPanel {
  path: string;
  label: string;
  ref: EntityRef | null;
  focused: boolean;
}

export interface ActiveContext {
  focusedUrl: string;
  panels: OpenPanel[];
}

export function deriveActiveContext(state: ProjectDockState | null): ActiveContext | null {
  const ws = state?.workspaces[state.activeWorkspace];
  if (!state || !ws) return null;
  const focusedUrl = urlOfFocused(state);
  const focusedPath = pageIdOf(focusedUrl);
  const paths = [...new Set(collectPages(ws.tree).map(pageIdOf))];
  const panels: OpenPanel[] = paths.map((path) => ({
    path,
    label: getPageDef(path)?.label ?? path,
    ref: refFromUrl(path, ws.params[path] ?? ""),
    focused: path === focusedPath,
  }));
  panels.sort((a, b) => Number(b.focused) - Number(a.focused));
  return { focusedUrl, panels };
}

export const titleKey = (ref: EntityRef): string => `${ref.kind}:${ref.id}`;

function describePanel(p: OpenPanel, titles: Map<string, string>): string {
  if (!p.ref) return p.label;
  const title = titles.get(titleKey(p.ref));
  const what = title ? `${KIND_META[p.ref.kind].label} "${title}"` : KIND_META[p.ref.kind].label;
  return `${p.label} — ${what} (id ${p.ref.id})`;
}

/** Markdown for the system prompt. Empty string when nothing is known. */
export function formatActiveContext(ctx: ActiveContext, titles: Map<string, string>): string {
  const focused = ctx.panels.find((p) => p.focused);
  const others = ctx.panels.filter((p) => !p.focused);
  const lines = ["## Currently open"];
  if (focused) lines.push(`Focused: ${describePanel(focused, titles)}`);
  if (others.length) {
    lines.push("Also open:");
    for (const p of others) lines.push(`- ${describePanel(p, titles)}`);
  }
  lines.push(
    '"This", "it", "the current task" etc. refer to the focused entity unless the user says otherwise.',
  );
  return lines.join("\n") + "\n";
}
