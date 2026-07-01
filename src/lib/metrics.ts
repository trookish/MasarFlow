import type { Spec, Task, System, Standard, Note } from "@/lib/db/schema";
import { runEnforcer } from "@/lib/enforce";

/**
 * Real project metrics, derived from live workspace data — nothing stored,
 * nothing invented. Every score is a documented formula over specs, tasks,
 * systems, and standards violations; `null` means "not enough data yet".
 */

export interface ProjectMetrics {
  /** 0–100: delivery health from task completion, spec progress, urgency. */
  health: number | null;
  /** 0–100: architecture score from the systems catalog's health. */
  archScore: number | null;
  /** 0–100: tech debt from standards violations and stale urgent work. */
  techDebt: number | null;
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/**
 * Health = 60% task completion + 40% average spec implementation progress,
 * minus 5 points per open urgent task (max −20). Null when the project has
 * neither tasks nor specs.
 */
export function computeHealth(tasks: Task[], specs: Spec[]): number | null {
  if (tasks.length === 0 && specs.length === 0) return null;
  const doneRatio = tasks.length
    ? tasks.filter((t) => t.status === "done").length / tasks.length
    : null;
  const specAvg = specs.length
    ? specs.reduce((acc, s) => acc + s.implementationProgress, 0) / specs.length / 100
    : null;
  const parts = [doneRatio, specAvg].filter((v): v is number => v !== null);
  const base =
    doneRatio !== null && specAvg !== null
      ? 0.6 * doneRatio + 0.4 * specAvg
      : parts[0];
  const urgentOpen = tasks.filter(
    (t) => t.priority === "urgent" && t.status !== "done",
  ).length;
  return clamp(base * 100 - Math.min(20, urgentOpen * 5));
}

/**
 * Architecture score = average health of catalogued systems, minus 10 points
 * per deprecated-but-depended-on system (max −20). Null with no systems.
 */
export function computeArchScore(systems: System[]): number | null {
  if (systems.length === 0) return null;
  const avg = systems.reduce((acc, s) => acc + s.health, 0) / systems.length;
  const deprecatedIds = new Set(
    systems.filter((s) => s.status === "deprecated").map((s) => s.id),
  );
  const dependedOnDeprecated = systems.filter(
    (s) =>
      s.status !== "deprecated" &&
      s.dependencies.some((d) => deprecatedIds.has(d)),
  ).length;
  return clamp(avg - Math.min(20, dependedOnDeprecated * 10));
}

/**
 * Tech debt (higher is worse) = standards violations relative to content
 * volume (up to 70 points) + share of stale open urgent/high tasks (up to 30).
 * Null when there is nothing to measure (no content and no tasks).
 */
export function computeTechDebt(
  standards: Standard[],
  notes: Note[],
  specs: Spec[],
  tasks: Task[],
): number | null {
  const contentCount = notes.length + specs.length + tasks.length;
  if (contentCount === 0) return null;

  const violations = runEnforcer(standards, notes, specs, tasks).length;
  // 1 violation per 2 content items ⇒ maxed-out violation debt.
  const violationDebt = Math.min(70, (violations / Math.max(1, contentCount)) * 140);

  const open = tasks.filter((t) => t.status !== "done");
  const pressing = open.filter(
    (t) => t.priority === "urgent" || t.priority === "high",
  ).length;
  const priorityDebt = open.length
    ? Math.min(30, (pressing / open.length) * 30)
    : 0;

  return clamp(violationDebt + priorityDebt);
}

export function computeProjectMetrics(input: {
  tasks: Task[];
  specs: Spec[];
  systems: System[];
  standards: Standard[];
  notes: Note[];
}): ProjectMetrics {
  return {
    health: computeHealth(input.tasks, input.specs),
    archScore: computeArchScore(input.systems),
    techDebt: computeTechDebt(
      input.standards,
      input.notes,
      input.specs,
      input.tasks,
    ),
  };
}
