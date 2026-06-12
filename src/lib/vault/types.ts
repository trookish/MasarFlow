export type { NoteType, TaskPriority, TaskStatus } from "../db/schema";
import type { NoteType as _NT, TaskPriority as _TP, TaskStatus as _TS } from "../db/schema";

export type VaultMode = "local" | "obsidian" | "disconnected";

export interface VaultCapabilities {
  fsa: boolean;
  webkit: boolean;
  showDirectoryPicker: boolean;
  browserName: string;
}

export interface VaultFileMeta {
  relativePath: string;
  size: number;
  mtime: number;
  kind: "markdown" | "canvas" | "attachment" | "other";
  inTrash: boolean;
  isTemplate: boolean;
}

export type SyncStatus =
  | "synced"
  | "local-newer"
  | "remote-newer"
  | "conflict"
  | "deleted-local"
  | "deleted-remote"
  | "ignored"
  | "trash";

export interface SyncFile {
  id: string;
  projectId: string;
  relativePath: string;
  side: "remote" | "local" | "both";
  status: SyncStatus;
  mtime: number;
  hash: string;
  noteId: string | null;
  taskId: string | null;
  lastSyncedAt: number;
  isTemplate: boolean;
  inTrash: boolean;
  size: number;
}

export interface ParsedFrontmatter {
  type: _NT | null;
  tags: string[];
  aliases: string[];
  status: _TS | null;
  priority: _TP | null;
  scheduled: number | null;
  completedDate: number | null;
  dateCreated: number | null;
  dateModified: number | null;
  raw: Record<string, unknown>;
}

export interface Wikilink {
  raw: string;
  target: string;
  alias: string | null;
  heading: string | null;
  isEmbed: boolean;
  start: number;
  end: number;
}

export interface VaultSettings {
  mode: VaultMode;
  vaultName: string | null;
  pollingMs: number;
  archiveIncluded: boolean;
  trashIncluded: boolean;
  includePatterns: string[];
  excludePatterns: string[];
  maxAttachmentBytes: number;
  maxVaultBytes: number;
  typeFolderMap: Record<_NT, string>;
  firstRunDone: boolean;
}

export const DEFAULT_VAULT_SETTINGS: VaultSettings = {
  mode: "local",
  vaultName: null,
  pollingMs: 300000,
  archiveIncluded: false,
  trashIncluded: true,
  includePatterns: ["00. Inbox", "01. Projects", "02. Areas", "03. Knowledge", "04. Resources", "05. Tasks", "06. Templates", "99. Core"],
  excludePatterns: [".obsidian", ".makemd", ".qodo", ".space", ".git"],
  maxAttachmentBytes: 50 * 1024 * 1024,
  maxVaultBytes: 500 * 1024 * 1024,
  typeFolderMap: {
    idea: "00. Inbox",
    lore: "00. Inbox",
    note: "00. Inbox",
    system: "01. Projects",
    mechanic: "01. Projects",
    decision: "01. Projects",
    experiment: "01. Projects",
    research: "03. Knowledge",
  },
  firstRunDone: false,
};
