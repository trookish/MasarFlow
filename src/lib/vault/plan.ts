import type { Doc, Folder, Note, Spec, SyncFile, Task } from "@/lib/db/schema";
import type { SyncFileInput } from "@/lib/db/repos/sync";
import { classifyRemoteStatus, hashContent, normalizeMd, type SyncStatus } from "@/lib/sync";
import { folderChain, isMirroredPath, pathFor, uniquePaths, type MirrorKind } from "./paths";
import { serializeEntity } from "./serialize";

/**
 * The whole sync policy, with no IO: the engine feeds it entity rows, the
 * recorded index and what is on disk, and executes what comes back.
 */

export const mirrorKey = (kind: MirrorKind, id: string): string => `${kind}:${id}`;

export interface MirrorEntity {
  kind: MirrorKind;
  id: string;
  path: string;
  /** hash of what the app would write right now */
  hash: string;
  /** hash recorded at our last successful interaction (null = no base) */
  baseHash: string | null;
  /** status of the recorded index row (null = never seen) */
  status: SyncStatus | null;
}

export interface MirrorFile {
  path: string;
  /** null = unreadable (truncated / binary / vanished): never write over it */
  hash: string | null;
  /** frontmatter `msf_id`, when the file declares one */
  msfId: string | null;
}

export type VaultAction =
  | { action: "write"; path: string; kind: MirrorKind; entityId: string; reason: "create" | "update" }
  | { action: "import"; path: string; kind: MirrorKind; entityId: string; auto: boolean }
  | { action: "conflict"; path: string; kind: MirrorKind; entityId: string; baseHash: string | null }
  | { action: "missing"; path: string; kind: MirrorKind; entityId: string }
  | { action: "repath"; from: string; to: string; kind: MirrorKind; entityId: string; import: boolean }
  | { action: "external"; path: string }
  | { action: "blocked"; path: string; kind: MirrorKind | null; entityId: string | null }
  | { action: "ignore"; path: string }
  | { action: "skip"; path: string; kind: MirrorKind; entityId: string; status: SyncStatus };

export interface LocalInput {
  notes: Note[];
  docs: Doc[];
  specs: Spec[];
  tasks: Task[];
  folders: Folder[];
  index: SyncFile[];
  projectSlug: string;
}

export interface LocalModel {
  entities: MirrorEntity[];
  contentByKey: Map<string, string>;
}

/** Rows the app owns -> mirror entities + the exact content we would write. */
export function collectLocal(input: LocalInput): LocalModel {
  const byEntity = new Map<string, SyncFile>();
  for (const r of input.index) if (r.entityId) byEntity.set(r.entityId, r);
  const folderPaths = new Map<string, string | null>();
  for (const f of input.folders) folderPaths.set(f.id, folderChain(input.folders, f.id));

  const drafted: Array<{ kind: MirrorKind; id: string; path: string; content: string }> = [];
  const push = (kind: MirrorKind, row: Note | Doc | Spec | Task, folderPath: string | null): void => {
    const prev = byEntity.get(row.id);
    drafted.push({
      kind,
      id: row.id,
      path: prev?.path ?? pathFor(kind, row, folderPath), // the recorded path wins
      content: serializeEntity(kind, row, { projectSlug: input.projectSlug }),
    });
  };
  for (const n of input.notes) push("note", n, n.folderId ? folderPaths.get(n.folderId) ?? null : null);
  for (const d of input.docs) push("doc", d, null);
  for (const s of input.specs) push("spec", s, null);
  for (const t of input.tasks) push("task", t, null);

  const entities: MirrorEntity[] = [];
  const contentByKey = new Map<string, string>();
  for (const e of uniquePaths(drafted)) {
    const prev = byEntity.get(e.id);
    const deleted = prev?.status === "deleted";
    entities.push({
      kind: e.kind,
      id: e.id,
      path: e.path,
      hash: hashContent(normalizeMd(e.content)),
      baseHash: prev && !deleted && prev.hash ? prev.hash : null,
      status: prev?.status ?? null,
    });
    contentByKey.set(mirrorKey(e.kind, e.id), e.content);
  }
  return { entities, contentByKey };
}

/** Decide what to do. Deterministic: sorted by path. */
export function planVaultSync(input: {
  entities: MirrorEntity[];
  files: MirrorFile[];
  autoImport: boolean;
}): VaultAction[] {
  const byPath = new Map(input.files.map((f) => [f.path, f]));
  const byId = new Map(input.files.filter((f) => f.msfId).map((f) => [f.msfId as string, f]));
  const actions: VaultAction[] = [];
  const claimed = new Set<string>();

  for (const e of [...input.entities].sort((a, b) => a.path.localeCompare(b.path))) {
    const atPath = byPath.get(e.path);
    const sameId = byId.get(e.id);
    const remote = atPath ?? (sameId && !claimed.has(sameId.path) ? sameId : undefined);
    if (remote && remote.path !== e.path) {
      claimed.add(remote.path);
      actions.push({ action: "repath", from: e.path, to: remote.path, kind: e.kind, entityId: e.id, import: false });
    }
    const path = remote?.path ?? e.path;
    if (remote) claimed.add(remote.path);

    if (remote && remote.hash == null) {
      actions.push({ action: "blocked", path, kind: e.kind, entityId: e.id });
      continue;
    }
    const remoteHash = remote?.hash ?? null;
    if (remoteHash == null && e.status === "deleted") {
      actions.push({ action: "skip", path, kind: e.kind, entityId: e.id, status: "deleted" });
      continue;
    }
    if (remoteHash == null && e.status !== null) {
      actions.push({ action: "missing", path, kind: e.kind, entityId: e.id });
      continue;
    }
    const status = classifyRemoteStatus(e.hash, remoteHash, e.baseHash, e.status !== null);
    if (status === "synced") {
      actions.push({ action: "skip", path, kind: e.kind, entityId: e.id, status });
      continue;
    }
    if (status === "new") {
      actions.push({ action: "write", path, kind: e.kind, entityId: e.id, reason: "create" });
      continue;
    }
    if (status === "local_modified") {
      actions.push({ action: "write", path, kind: e.kind, entityId: e.id, reason: "update" });
      continue;
    }
    if (status === "remote_modified") {
      actions.push({ action: "import", path, kind: e.kind, entityId: e.id, auto: input.autoImport });
      continue;
    }
    actions.push({ action: "conflict", path, kind: e.kind, entityId: e.id, baseHash: e.baseHash });
  }

  for (const f of [...input.files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (claimed.has(f.path)) continue;
    actions.push(isMirroredPath(f.path) ? { action: "external", path: f.path } : { action: "ignore", path: f.path });
  }
  return actions;
}

/** The index row an action leaves behind (null = keep whatever was there). */
export function indexRowFor(
  action: VaultAction,
  entity: MirrorEntity | undefined,
  fileHash: string | null,
  now: number,
): SyncFileInput | null {
  switch (action.action) {
    case "write":
      return entity
        ? { path: action.path, hash: entity.hash, status: "synced", entityType: action.kind, entityId: action.entityId, lastSyncedAt: now }
        : null;
    case "import":
      return fileHash
        ? { path: action.path, hash: fileHash, status: "synced", entityType: action.kind, entityId: action.entityId, lastSyncedAt: now }
        : null;
    case "skip":
      return entity
        ? {
            path: action.path, hash: entity.hash, status: action.status,
            entityType: action.kind, entityId: action.entityId,
            lastSyncedAt: entity.status === "deleted" ? null : entity.baseHash ? now : null,
          }
        : null;
    case "repath":
      return entity
        ? { path: action.to, hash: entity.hash, status: "synced", entityType: action.kind, entityId: action.entityId, lastSyncedAt: now }
        : null;
    case "conflict":
    case "blocked":
      return entity
        ? {
            path: entity.path, hash: entity.baseHash ?? entity.hash, status: "conflict",
            entityType: entity.kind, entityId: entity.id, lastSyncedAt: null,
          }
        : null;
    case "missing":
      return { path: action.path, hash: "", status: "deleted", entityType: action.kind, entityId: action.entityId, lastSyncedAt: null };
    case "external":
    case "ignore":
      return null;
  }
}

/** Apply a user's conflict choice to the index row. */
export function resolveNextRow(
  row: SyncFile,
  fileHash: string | null,
  choice: "app" | "file" | "recreate",
  now: number,
): SyncFileInput {
  const base = { path: row.path, entityType: row.entityType, entityId: row.entityId };
  if (choice === "app") {
    return { ...base, hash: fileHash ?? row.hash, status: "local_modified", lastSyncedAt: now };
  }
  if (choice === "file") {
    return { ...base, hash: fileHash ?? row.hash, status: "synced", lastSyncedAt: now };
  }
  return { ...base, hash: "", status: "new", lastSyncedAt: null };
}
