"use client";

/**
 * Transient toast store. One module-level timer drives expiry for the whole
 * queue (MAX_VISIBLE toasts, see toast-queue.ts). Never persisted: a toast
 * describes something that just happened in this session.
 */

import { create } from "zustand";
import { newId } from "@/lib/dock/types";
import {
  DEFAULT_TTL_MS,
  dismiss,
  enqueue,
  nextExpiry,
  prune,
  type Toast,
  type ToastTone,
} from "@/lib/ui/toast-queue";

export interface ToastInput {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: ToastTone;
  ttlMs?: number;
}

interface ToastStore {
  toasts: Toast[];
  /** Push a toast; returns its id. */
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

function schedule(): void {
  if (timer) clearTimeout(timer);
  const expiry = nextExpiry(useToastStore.getState().toasts);
  if (expiry === null) return;
  timer = setTimeout(() => {
    useToastStore.setState((s) => ({ toasts: prune(s.toasts, Date.now()) }));
    schedule();
  }, Math.max(250, expiry - Date.now()));
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  push: (input) => {
    const id = newId("toast");
    const toast: Toast = {
      id,
      title: input.title,
      description: input.description,
      actionLabel: input.actionLabel,
      onAction: input.onAction,
      tone: input.tone ?? "default",
      createdAt: Date.now(),
      ttlMs: input.ttlMs ?? DEFAULT_TTL_MS,
    };
    set((s) => ({ toasts: enqueue(s.toasts, toast) }));
    schedule();
    return id;
  },

  dismiss: (id) => {
    set((s) => ({ toasts: dismiss(s.toasts, id) }));
    schedule();
  },

  clear: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ toasts: [] });
  },
}));

/** Imperative helper for non-component callers (the dock store). */
export function pushToast(input: ToastInput): string {
  return useToastStore.getState().push(input);
}
