import type { Note, Spec, Standard, StandardCategory, Task } from "@/lib/db/schema";

/**
 * Standards enforcer — a deterministic, regex-based scan (no AI). Each enforced
 * standard with a non-empty `pattern` is treated as a *forbidden* pattern; any
 * note/spec/task content matching it produces a violation.
 */

export interface Violation {
  /** Stable id (standard + entity + match offset). */
  id: string;
  standardId: string;
  standardTitle: string;
  category: StandardCategory;
  entityKind: "note" | "spec" | "task";
  entityId: string;
  entityLabel: string;
  href: string;
  /** The exact matched text. */
  match: string;
  /** A short surrounding excerpt for context. */
  snippet: string;
}

interface ScanTarget {
  kind: Violation["entityKind"];
  id: string;
  label: string;
  href: string;
  text: string;
}

/** Compile a forbidden pattern (case-insensitive, global). Null if empty/invalid. */
export function compileStandardPattern(pattern: string): RegExp | null {
  if (!pattern || !pattern.trim()) return null;
  try {
    return new RegExp(pattern, "gi");
  } catch {
    return null;
  }
}

/** Whether a pattern string is a valid regex (empty counts as valid). */
export function isValidPattern(pattern: string): boolean {
  if (!pattern.trim()) return true;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + length + 30);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${slice}${end < text.length ? "…" : ""}`;
}

function buildTargets(
  notes: Note[],
  specs: Spec[],
  tasks: Task[],
): ScanTarget[] {
  return [
    ...notes.map((n) => ({
      kind: "note" as const,
      id: n.id,
      label: n.title || "Untitled note",
      href: `/brain?note=${n.id}`,
      text: `${n.title}\n${n.body}`,
    })),
    ...specs.map((s) => ({
      kind: "spec" as const,
      id: s.id,
      label: `${s.number} · ${s.title}`,
      href: `/specs?spec=${s.id}`,
      text: [
        s.number,
        s.title,
        s.purpose,
        s.technicalNotes,
        ...s.goals,
        ...s.features,
        ...s.constraints,
        ...s.acceptance,
        ...s.risks,
      ].join("\n"),
    })),
    ...tasks.map((t) => ({
      kind: "task" as const,
      id: t.id,
      label: t.title,
      href: `/tasks?task=${t.id}`,
      text: `${t.title}\n${t.description}`,
    })),
  ];
}

const MAX_MATCHES_PER_TARGET = 10;

/** Run all enforced, machine-checkable standards over the project's content. */
export function runEnforcer(
  standards: Standard[],
  notes: Note[],
  specs: Spec[],
  tasks: Task[],
): Violation[] {
  const targets = buildTargets(notes, specs, tasks);
  const violations: Violation[] = [];

  for (const standard of standards) {
    if (!standard.enforced) continue;
    const re = compileStandardPattern(standard.pattern ?? "");
    if (!re) continue;

    for (const target of targets) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      let count = 0;
      while (
        (match = re.exec(target.text)) !== null &&
        count < MAX_MATCHES_PER_TARGET
      ) {
        violations.push({
          id: `${standard.id}:${target.id}:${match.index}`,
          standardId: standard.id,
          standardTitle: standard.title,
          category: standard.category,
          entityKind: target.kind,
          entityId: target.id,
          entityLabel: target.label,
          href: target.href,
          match: match[0],
          snippet: snippetAround(target.text, match.index, match[0].length),
        });
        count++;
        // Guard against zero-width matches looping forever.
        if (match.index === re.lastIndex) re.lastIndex++;
      }
    }
  }

  return violations;
}
