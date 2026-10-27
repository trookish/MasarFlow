/**
 * Page registry for the dock window manager — the pure lookup half.
 *
 * Maps page ids (route paths, e.g. "/brain") to display metadata sourced from
 * the nav definitions in @/lib/nav, so dock tabs and menus show the same
 * labels/icons as the sidebar. The component half (dynamic page imports)
 * lives in src/components/dock/panel-loader.tsx: it uses next/dynamic, which
 * is client-only and cannot be imported from node-env tests.
 *
 * A page id may carry a query snapshot ("/brain?note=abc"); lookups use only
 * the path part.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { LucideIcon } from "lucide-react";
import { ALL_NAV_ITEMS, type NavItem } from "@/lib/nav";
import { SURFACES } from "@/lib/navigation/surfaces";
import { pageIdOf } from "./types";

/** Every page that can live in the dock: all nav routes, deduped (the Brain
 * item and its Notes child share the "/brain" href). */
export const PAGE_PATHS: string[] = [
  ...new Set([
    ...SURFACES.map((surface) => surface.route),
    ...ALL_NAV_ITEMS.map((item) => item.href),
  ]),
];

/** A page definition minus its component (kept out of node-testable code). */
export interface PageDef {
  label: string;
  icon: LucideIcon;
}

function findNavItem(path: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((item) => item.href === path);
}

/** Display metadata for a page id (query ignored). Null when unknown. */
export function getPageDef(pageId: string): PageDef | null {
  const path = pageIdOf(pageId);
  const surface = SURFACES.find((item) => item.route === path);
  if (surface) return { label: surface.label, icon: surface.icon };
  const item = findNavItem(path);
  if (!item) return null;
  return { label: item.label, icon: item.icon };
}

/** True when the page id's path is a known dock page. */
export function isKnownPage(pageId: string): boolean {
  return PAGE_PATHS.includes(pageIdOf(pageId));
}
