import type { MasarFlowDB } from "@/lib/db";
import type { ZodType } from "zod";
import * as s from "@/lib/db/schema";
import { BACKUP_FORMAT, BACKUP_VERSION, DATA_VERSION, decodeValue, type BackupFile } from "./backup";
import { withoutActivity } from "@/lib/activity/track";

export type BackupErrorCode = "not-json" | "wrong-format" | "too-new" | "unknown-table" | "invalid-row";

export class BackupError extends Error {
  constructor(
    public readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BackupError";
  }
}

/**
 * Row schema per table. Every row of a backup is checked before anything is written, so a damaged
 * file is refused whole instead of half-restoring. Tables without an entry (events, trash) are
 * written by the domain layer only and are checked for an id.
 */
const ROW_SCHEMAS: Record<string, ZodType> = {
  projects: s.projectSchema, projectCategories: s.projectCategorySchema, folders: s.folderSchema,
  notes: s.noteSchema, noteTemplates: s.noteTemplateSchema, specs: s.specSchema, standards: s.standardSchema,
  tasks: s.taskSchema, sprints: s.sprintSchema, systems: s.systemSchema, archNodes: s.archNodeSchema,
  archEdges: s.archEdgeSchema, docs: s.docSchema, devLogs: s.devLogSchema, agents: s.agentSchema,
  agentRuns: s.agentRunSchema, agentSteps: s.agentStepSchema, commits: s.commitSchema, memories: s.memorySchema,
  links: s.linkSchema, canvases: s.canvasSchema, canvasNodes: s.canvasNodeSchema, canvasEdges: s.canvasEdgeSchema,
  syncFiles: s.syncFileSchema, attachments: s.attachmentSchema, watchEvents: s.watchEventSchema,
  plugins: s.pluginStateSchema, aiConnections: s.aiConnectionSchema, chatThreads: s.chatThreadSchema,
  chatMessages: s.chatMessageSchema, linkedProjects: s.linkedProjectSchema, workflowRuns: s.workflowRunSchema,
  workflowSteps: s.workflowStepSchema, codeFindings: s.codeFindingSchema, linkSuggestions: s.linkSuggestionSchema,
  parsedContents: s.parsedContentSchema, aiUndo: s.aiUndoSchema, embeddings: s.embeddingSchema,
  activity: s.activitySchema,
};

/** Validate a backup file's text against this database. Throws BackupError. */
export function parseBackup(text: string, db: MasarFlowDB): BackupFile {
  let data: Partial<BackupFile>;
  try {
    data = JSON.parse(text) as Partial<BackupFile>;
  } catch {
    throw new BackupError("not-json", "This file is not a MasarFlow backup (it is not valid JSON).");
  }
  if (data.format !== BACKUP_FORMAT || typeof data.tables !== "object" || data.tables === null) {
    throw new BackupError("wrong-format", "This file is not a MasarFlow backup.");
  }
  if ((data.version ?? 0) > BACKUP_VERSION || (data.dexieVersion ?? 0) > db.verno || (data.dataVersion ?? 2) > DATA_VERSION) {
    throw new BackupError("too-new", "This backup was created by a newer version of MasarFlow. Update the application and try again.");
  }
  const known = new Set(db.tables.map((t) => t.name));
  for (const name of Object.keys(data.tables)) {
    if (!known.has(name)) throw new BackupError("unknown-table", `The backup contains an unknown table: ${name}.`);
  }
  return data as BackupFile;
}

/** Bring 0.2.x rows (dataVersion 2) to the current meaning. */
function migrateRow(table: string, row: Record<string, unknown>, from: number): Record<string, unknown> {
  if (from < 3 && table === "syncFiles" && row.adapter === undefined) return { ...row, adapter: "folder" };
  return row;
}

/** Decode, migrate and validate every row. Throws BackupError("invalid-row") naming table and row. */
export function prepareRows(file: BackupFile): Record<string, Record<string, unknown>[]> {
  const from = file.dataVersion ?? 2;
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const [table, rows] of Object.entries(file.tables)) {
    if (!Array.isArray(rows)) throw new BackupError("invalid-row", `Table ${table} is not a list of records.`);
    const schema = ROW_SCHEMAS[table];
    out[table] = rows.map((raw, i) => {
      const row = migrateRow(table, decodeValue(raw) as Record<string, unknown>, from);
      if (!row || typeof row !== "object" || typeof row.id !== "string") {
        throw new BackupError("invalid-row", `Record ${i + 1} in ${table} has no id.`);
      }
      if (!schema) return row;
      const parsed = schema.safeParse(row);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const field = issue?.path.join(".") || "record";
        throw new BackupError("invalid-row", `Record ${i + 1} in ${table} is invalid (${field}: ${issue?.message ?? "invalid"}).`);
      }
      // Keep fields the schema does not list (forward compatible), take the schema's defaults.
      return { ...row, ...(parsed.data as Record<string, unknown>) };
    });
  }
  return out;
}

export interface ImportSummary {
  tables: Record<string, number>;
  /** AI connections whose API key was removed when the backup was made; ask the user to re-enter them */
  redactedConnections: { id: string; name: string }[];
}

/** Atomic: either everything lands or nothing changes. Rows are validated before the transaction. */
export async function importBackup(db: MasarFlowDB, file: BackupFile, mode: "replace" | "merge"): Promise<ImportSummary> {
  const prepared = prepareRows(file);
  const summary: ImportSummary = { tables: {}, redactedConnections: [] };
  await withoutActivity(() =>
    db.transaction("rw", db.tables, async () => {
      if (mode === "replace") await Promise.all(db.tables.map((t) => t.clear()));
      for (const table of db.tables) {
        const rows = prepared[table.name];
        if (!rows) continue;
        let landed = rows;
        if (mode === "replace") {
          await table.bulkAdd(rows);
        } else {
          const have = new Set(await table.toCollection().primaryKeys());
          landed = rows.filter((r) => !have.has(r.id as string));
          if (landed.length) await table.bulkAdd(landed);
        }
        summary.tables[table.name] = landed.length;
        if (table.name === "aiConnections") {
          for (const c of landed) {
            if (!c.apiKey) summary.redactedConnections.push({ id: c.id as string, name: String(c.label ?? c.id) });
          }
        }
      }
    }),
  );
  return summary;
}
