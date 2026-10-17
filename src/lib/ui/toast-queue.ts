/**
 * Pure toast queue: append-with-cap, dismiss, expire. The zustand store
 * (src/lib/stores/toast.ts) is a thin wrapper, so all of the interesting
 * behaviour is testable in node.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

export type ToastTone = "default" | "success" | "danger";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone: ToastTone;
  createdAt: number;
  ttlMs: number;
}

/** How many toasts can be on screen at once (the oldest is dropped). */
export const MAX_VISIBLE = 3;
/** How long a toast stays unless dismissed. */
export const DEFAULT_TTL_MS = 6000;

export function enqueue(list: Toast[], toast: Toast): Toast[] {
  const next = [...list, toast];
  return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
}

export function dismiss(list: Toast[], id: string): Toast[] {
  return list.filter((toast) => toast.id !== id);
}

export function prune(list: Toast[], now: number): Toast[] {
  return list.filter((toast) => now - toast.createdAt < toast.ttlMs);
}

/** Absolute timestamp of the earliest expiry, or null when nothing is queued. */
export function nextExpiry(list: Toast[]): number | null {
  if (list.length === 0) return null;
  return Math.min(...list.map((toast) => toast.createdAt + toast.ttlMs));
}
