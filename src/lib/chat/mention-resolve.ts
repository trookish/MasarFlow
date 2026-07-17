import {
  notesRepo,
  specsRepo,
  tasksRepo,
  docsRepo,
  standardsRepo,
  systemsRepo,
  memoriesRepo,
  devLogsRepo,
} from "@/lib/db/repos";
import type { Mention } from "./mentions";

/**
 * Repo-dependent half of the mention engine. Kept separate from the pure
 * `mentions.ts` so the trigger/token/command logic stays unit-testable in node
 * (where Dexie/IndexedDB is unavailable). Fetches a referenced record's body
 * so it can be inlined as context into the outgoing message — this works in
 * any chat mode (agentic or direct), guaranteeing referenced content reaches
 * the model even when tools are off.
 */

export interface ResolvedRecord {
  title: string;
  body: string;
}

export async function resolveRecordMention(
  _projectId: string,
  m: Mention,
): Promise<ResolvedRecord | null> {
  if (m.kind !== "record" || !m.recordKind || !m.recordId) return null;
  try {
    switch (m.recordKind) {
      case "note": {
        const r = await notesRepo.get(m.recordId);
        return r ? { title: r.title, body: r.body } : null;
      }
      case "spec": {
        const r = await specsRepo.get(m.recordId);
        if (!r) return null;
        const parts = [
          `**${r.number} · ${r.title}**`,
          r.purpose ? `Purpose: ${r.purpose}` : "",
          r.goals.length ? `Goals:\n- ${r.goals.join("\n- ")}` : "",
          r.acceptance.length
            ? `Acceptance:\n- ${r.acceptance.join("\n- ")}`
            : "",
          r.constraints.length
            ? `Constraints:\n- ${r.constraints.join("\n- ")}`
            : "",
          r.technicalNotes ? `Technical notes:\n${r.technicalNotes}` : "",
        ].filter(Boolean);
        return { title: `${r.number} ${r.title}`, body: parts.join("\n\n") };
      }
      case "task": {
        const r = await tasksRepo.get(m.recordId);
        return r
          ? {
              title: r.title,
              body: [
                `**${r.title}**`,
                `Status: ${r.status} · Priority: ${r.priority} · Assignee: ${r.assignee} · Progress: ${r.progress}%`,
                r.description ? r.description : "",
              ]
                .filter(Boolean)
                .join("\n\n"),
            }
          : null;
      }
      case "doc": {
        const r = await docsRepo.get(m.recordId);
        return r ? { title: r.title, body: r.body } : null;
      }
      case "standard": {
        const r = await standardsRepo.get(m.recordId);
        return r
          ? {
              title: r.title,
              body: [
                `**${r.title}** (${r.category}${r.enforced ? ", enforced" : ""})`,
                r.rule,
                r.examples.length ? `Examples:\n- ${r.examples.join("\n- ")}` : "",
              ]
                .filter(Boolean)
                .join("\n\n"),
            }
          : null;
      }
      case "system": {
        const r = await systemsRepo.get(m.recordId);
        return r
          ? {
              title: r.name,
              body: [
                `**${r.name}** (${r.category}, ${r.status}, health ${r.health})`,
                r.description,
                r.dependencies.length
                  ? `Depends on: ${r.dependencies.join(", ")}`
                  : "",
              ]
                .filter(Boolean)
                .join("\n\n"),
            }
          : null;
      }
      case "memory": {
        const r = await memoriesRepo.get(m.recordId);
        return r
          ? { title: r.content.slice(0, 60), body: `[${r.type}] ${r.content}` }
          : null;
      }
      case "devlog": {
        const r = await devLogsRepo.get(m.recordId);
        return r
          ? { title: r.title, body: `**${r.title}**\n\n${r.body}` }
          : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}
