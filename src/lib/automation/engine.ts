import { getDb } from "../db/schema";
import { invalidateSearchIndex } from "../search";
import { toast } from "sonner";

const LAST_RUN_KEY = "automation_last_run";
const DECAY_INTERVAL_MS = 60_000;

export interface AutomationEvent {
  id: string;
  kind: string;
  message: string;
  at: number;
}

const listeners = new Set<(e: AutomationEvent) => void>();
let timer: number | null = null;

export function onAutomationEvent(cb: (e: AutomationEvent) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function emit(e: AutomationEvent) {
  for (const cb of listeners) {
    try {
      cb(e);
    } catch (err) {
      console.warn("automation listener failed", err);
    }
  }
}

export function emitAutomationEvent(e: AutomationEvent) {
  emit(e);
}

export async function tick(): Promise<AutomationEvent[]> {
  const db = getDb();
  const events: AutomationEvent[] = [];
  const now = Date.now();

  // Memory weight decay: long-unused memories fade; recently recalled ones stay sharp.
  const memories = await db.memories.toArray();
  for (const m of memories) {
    const recency = m.lastRecallAt ?? m.createdAt;
    const daysSince = (now - recency) / (24 * 3600_000);
    let target = m.weight;
    if (daysSince > 60) target -= 0.05;
    if (daysSince > 30) target -= 0.02;
    if (daysSince > 14) target -= 0.01;
    if (m.lastRecallAt && now - m.lastRecallAt < 7 * 24 * 3600_000) target += 0.03;
    target = Math.max(0.05, Math.min(1, target));
    if (Math.abs(target - m.weight) > 0.001) {
      await db.memories.update(m.id, { weight: target });
    }
  }

  // Recalculate implementation progress from tasks for every spec.
  const [specs, tasks] = await Promise.all([db.specs.toArray(), db.tasks.toArray()]);
  for (const s of specs) {
    const tasksForSpec = tasks.filter((t) => t.specId === s.id);
    if (tasksForSpec.length === 0) continue;
    const done = tasksForSpec.filter((t) => t.status === "done").length;
    const progress = Math.round((done / tasksForSpec.length) * 100);
    if (progress !== s.implementationProgress) {
      await db.specs.update(s.id, { implementationProgress: progress, updatedAt: now });
    }
  }

  // Auto-mark specs as shipped when 100% tasks done.
  for (const s of specs) {
    if (s.implementationProgress === 100 && s.status !== "shipped") {
      await db.specs.update(s.id, { status: "shipped", updatedAt: now });
      events.push({
        id: "auto_" + now + "_" + s.id,
        kind: "spec-shipped",
        message: s.title + " auto-shipped (100% tasks done)",
        at: now,
      });
      toast.success("Spec completed", { description: s.title + " has 100% of tasks done." });
    }
  }

  // Invalidate the search index so queries pick up new content.
  invalidateSearchIndex();

  // Update the last-run stamp.
  try {
    await db.meta.put({ key: LAST_RUN_KEY, value: now });
  } catch {
    /* meta may not exist in older schemas, ignore */
  }

  if (events.length > 0) {
    for (const e of events) emit(e);
  } else {
    emit({
      id: "tick_" + now,
      kind: "tick",
      message: "automation tick (" + memories.length + " memories, " + specs.length + " specs)",
      at: now,
    });
  }
  return events;
}

export function startAutomation(intervalMs = DECAY_INTERVAL_MS): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (timer !== null) return () => stopAutomation();
  void tick();
  timer = window.setInterval(() => {
    void tick();
  }, intervalMs);
  return () => stopAutomation();
}

export function stopAutomation() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

export async function recallMemory(memoryId: string) {
  const db = getDb();
  const m = await db.memories.get(memoryId);
  if (!m) return;
  const newWeight = Math.min(1, m.weight + 0.05);
  await db.memories.update(memoryId, { lastRecallAt: Date.now(), weight: newWeight });
  emit({
    id: "recall_" + memoryId + "_" + Date.now(),
    kind: "memory-recalled",
    message: m.content.slice(0, 80),
    at: Date.now(),
  });
}
