"use client";

/**
 * Dock panel loader — the component half of the page registry.
 *
 * Maps page ids (route paths) to the existing route page components via
 * next/dynamic (see node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md:
 * { ssr: false } is allowed here because this module is a client component).
 * The pages are the app's own route page entries under "src/app/(workspace)",
 * so panel content is always identical to what classic routing renders.
 */

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { pageIdOf } from "@/lib/dock/types";
import { PanelLoading } from "./panel-loading";

function loading() {
  return <PanelLoading />;
}

export const PAGE_COMPONENTS: Record<string, ComponentType> = {
  "/capture": dynamic(() => import("@/app/(workspace)/capture/page"), { ssr: false, loading }),
  "/work": dynamic(() => import("@/app/(workspace)/work/page"), { ssr: false, loading }),
  "/library": dynamic(() => import("@/app/(workspace)/library/page"), { ssr: false, loading }),
  "/ai": dynamic(() => import("@/app/(workspace)/ai/page"), { ssr: false, loading }),
  "/system": dynamic(() => import("@/app/(workspace)/system/page"), { ssr: false, loading }),
  "/dashboard": dynamic(() => import("@/app/(workspace)/dashboard/page"), {
    ssr: false,
    loading,
  }),
  "/brain": dynamic(() => import("@/app/(workspace)/brain/page"), {
    ssr: false,
    loading,
  }),
  "/brain/canvas": dynamic(
    () => import("@/app/(workspace)/brain/canvas/page"),
    { ssr: false, loading },
  ),
  "/brain/templates": dynamic(
    () => import("@/app/(workspace)/brain/templates/page"),
    { ssr: false, loading },
  ),
  "/brain/graph": dynamic(() => import("@/app/(workspace)/brain/graph/page"), {
    ssr: false,
    loading,
  }),
  "/docs": dynamic(() => import("@/app/(workspace)/docs/page"), {
    ssr: false,
    loading,
  }),
  "/files": dynamic(() => import("@/app/(workspace)/files/page"), {
    ssr: false,
    loading,
  }),
  "/git": dynamic(() => import("@/app/(workspace)/git/page"), {
    ssr: false,
    loading,
  }),
  "/specs": dynamic(() => import("@/app/(workspace)/specs/page"), {
    ssr: false,
    loading,
  }),
  "/standards": dynamic(() => import("@/app/(workspace)/standards/page"), {
    ssr: false,
    loading,
  }),
  "/tasks": dynamic(() => import("@/app/(workspace)/tasks/page"), {
    ssr: false,
    loading,
  }),
  "/sprints": dynamic(() => import("@/app/(workspace)/sprints/page"), {
    ssr: false,
    loading,
  }),
  "/devlogs": dynamic(() => import("@/app/(workspace)/devlogs/page"), {
    ssr: false,
    loading,
  }),
  "/architecture": dynamic(() => import("@/app/(workspace)/architecture/page"), {
    ssr: false,
    loading,
  }),
  "/knowledge": dynamic(() => import("@/app/(workspace)/knowledge/page"), {
    ssr: false,
    loading,
  }),
  "/chat": dynamic(() => import("@/app/(workspace)/chat/page"), {
    ssr: false,
    loading,
  }),
  "/agents": dynamic(() => import("@/app/(workspace)/agents/page"), {
    ssr: false,
    loading,
  }),
  "/workflow": dynamic(() => import("@/app/(workspace)/workflow/page"), {
    ssr: false,
    loading,
  }),
  "/sync": dynamic(() => import("@/app/(workspace)/sync/page"), {
    ssr: false,
    loading,
  }),
  "/watcher": dynamic(() => import("@/app/(workspace)/watcher/page"), {
    ssr: false,
    loading,
  }),
  "/search": dynamic(() => import("@/app/(workspace)/search/page"), {
    ssr: false,
    loading,
  }),
  "/plugins": dynamic(() => import("@/app/(workspace)/plugins/page"), {
    ssr: false,
    loading,
  }),
  "/control-center": dynamic(() => import("@/app/(workspace)/control-center/page"), {
    ssr: false,
    loading,
  }),
  "/settings": dynamic(() => import("@/app/(workspace)/settings/page"), {
    ssr: false,
    loading,
  }),
  "/today": dynamic(() => import("@/app/(workspace)/today/page"), { ssr: false, loading }),
  "/tools/terminal": dynamic(() => import("@/app/(workspace)/tools/terminal/page"), {
    ssr: false,
    loading,
  }),
  "/tools/logs": dynamic(() => import("@/app/(workspace)/tools/logs/page"), {
    ssr: false,
    loading,
  }),
  "/tools/system": dynamic(() => import("@/app/(workspace)/tools/system/page"), {
    ssr: false,
    loading,
  }),
};

/** Resolve a page id (with optional query) to its component, or null. */
export function panelComponent(pageId: string): ComponentType | null {
  return PAGE_COMPONENTS[pageIdOf(pageId)] ?? null;
}
