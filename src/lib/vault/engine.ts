import type { SyncFile } from "@/lib/db/schema";
import { docsRepo } from "@/lib/db/repos/docs";
import { foldersRepo } from "@/lib/db/repos/folders";
import { notesRepo } from "@/lib/db/repos/notes";
import { specsRepo } from "@/lib/db/repos/specs";
import { syncRepo } from "@/lib/db/repos/sync";
import { tasksRepo } from "@/lib/db/repos/tasks";
import { hashContent, normalizeMd } from "@/lib/sync";
import type { VaultIO } from "./io";
import { claimOf, fileSegment, isMirroredPath, type MirrorKind } from "./paths";
import {
  collectLocal, indexRowFor, mirrorKey, planVaultSync, resolveNextRow, REPLICA_TRASH,
  type MirrorFile, type OrphanRow, type VaultAction,
} from "./plan";
import { applyVaultDoc, parseVaultDoc } from "./serialize";
import { db } from "@/lib/db";
import { restoreEntity } from "@/lib/domain/commands";
import { trashId } from "@/lib/domain/events";

export interface VaultDeps {
  io: VaultIO;
  /** absolute folder the user picked (an allowed root) */
  root: string;
  /** mirror subfolder inside it, e.g. `MasarFlow/my-project` */
  folder: string;
  projectId: string;
  projectSlug: string;
  /** import file edits automatically, or only when the user asks */
  autoImport: boolean;
  now: () => number;
  /** safety valve for a folder full of foreign files */
  maxExternalPerRun?: number;
  /** adopt unclaimed files as new entities (the explicit "Import folder" command only) */
  adoptUntracked?: boolean;
}

export interface VaultRunSummary {
  written: number;
  imported: number;
  conflicts: number;
  missing: number;
  external: number;
  blocked: number;
  skipped: number;
  /** files the user edited while auto-import is off (waiting for an explicit import) */
  pending: number;
  /** files nobody claims (listed, not adopted) */
  untracked: number;
  /** files of deleted entities moved to `.masarflow-trash/` */
  trashed: number;
  errors: string[];
}

const emptySummary = (): VaultRunSummary => ({
  written: 0, imported: 0, conflicts: 0, missing: 0, external: 0, blocked: 0, skipped: 0,
  pending: 0, untracked: 0, trashed: 0, errors: [],
});

/** Read every mirrored .md and describe it (hash null = unreadable). */
async function scanMirror(deps: VaultDeps): Promise<{ files: MirrorFile[]; errors: string[] }> {
  const listed = await deps.io.list(deps.root, deps.folder);
  if (!listed.ok) return { files: [], errors: [listed.error ?? "vault list failed"] };
  const files: MirrorFile[] = [];
  const errors: string[] = [];
  for (const entry of listed.files) {
    if (!isMirroredPath(entry.path)) {
      files.push({ path: entry.path, hash: null, msfId: null });
      continue;
    }
    const read = await deps.io.read(deps.root, `${deps.folder}/${entry.path}`);
    if (!read.ok || !read.found) {
      errors.push(`unreadable: ${entry.path}`);
      files.push({ path: entry.path, hash: null, msfId: null });
      continue;
    }
    if (read.truncated) {
      errors.push(`too large to verify, left untouched: ${entry.path}`);
      files.push({ path: entry.path, hash: null, msfId: null });
      continue;
    }
    files.push({ path: entry.path, hash: hashContent(normalizeMd(read.content)), msfId: parseVaultDoc(read.content).id });
  }
  return { files, errors };
}

async function importEntity(deps: VaultDeps, action: Extract<VaultAction, { action: "import" }>, fileHash: string | null): Promise<boolean> {
  const read = await deps.io.read(deps.root, `${deps.folder}/${action.path}`);
  if (!read.ok || !read.found || read.truncated) return false;
  const patch = applyVaultDoc(action.kind, parseVaultDoc(read.content));
  switch (patch.kind) {
    case "note":
      await notesRepo.update(action.entityId, patch.patch);
      break;
    case "doc":
      await docsRepo.update(action.entityId, patch.patch);
      break;
    case "spec":
      await specsRepo.update(action.entityId, patch.patch);
      break;
    case "task":
      await tasksRepo.update(action.entityId, patch.patch);
      break;
  }
  return fileHash != null;
}

/** Create an entity for a file no row claims (see D-P7-1 for the kinds). */
async function adoptExternal(deps: VaultDeps, path: string): Promise<{ kind: MirrorKind; id: string } | null> {
  const kind = claimOf(path);
  if (!kind) return null;
  const read = await deps.io.read(deps.root, `${deps.folder}/${path}`);
  if (!read.ok || !read.found || read.truncated) return null;
  const doc = parseVaultDoc(read.content);
  // Keep the file's own id when nothing in the app uses it (a purged entity coming back).
  const id = doc.id && !(await db.table(`${kind}s`).get(doc.id)) ? doc.id : undefined;
  const title = doc.title || fileSegment(path.split("/").pop()!.replace(/\.md$/i, ""), "untitled");
  const folderPath = path.split("/").slice(1, -1).join("/");
  if (kind === "note" || kind === "doc") {
    const created =
      kind === "note"
        ? await notesRepo.create({ id, projectId: deps.projectId, title, body: doc.body, tags: doc.tags })
        : await docsRepo.create({ id, projectId: deps.projectId, title, body: doc.body, category: folderPath || "general" });
    if (Object.keys(doc.props).length) {
      const patch = { props: doc.props };
      if (kind === "note") await notesRepo.update(created.id, patch);
      else await docsRepo.update(created.id, patch);
    }
    return { kind, id: created.id };
  }
  if (kind === "spec") {
    const rawNumber = doc.fields.number;
    const created = await specsRepo.create({
      id,
      projectId: deps.projectId,
      title,
      number: typeof rawNumber === "string" && rawNumber ? rawNumber : "RFC-000",
    });
    return { kind, id: created.id };
  }
  const created = await tasksRepo.create({ id, projectId: deps.projectId, title, description: doc.body, tags: doc.tags });
  return { kind, id: created.id };
}

/** Index rows whose entity no longer exists. */
function orphansOf(index: SyncFile[], live: Set<string>): { orphans: OrphanRow[]; rows: SyncFile[] } {
  const rows = index.filter((r) => r.entityId && !live.has(r.entityId));
  const orphans = rows
    .map((r) => ({ path: r.path, kind: (r.entityType ?? claimOf(r.path)) as MirrorKind | null, entityId: r.entityId!, hash: r.hash }))
    .filter((o): o is OrphanRow => o.kind != null && ["note", "doc", "spec", "task"].includes(o.kind));
  return { orphans, rows };
}

/** A free path in the replica trash for `path` (never overwrites an earlier trashed copy). */
function trashPathFor(path: string, taken: Set<string>, stamp: number): string {
  const base = `${REPLICA_TRASH}/${path}`;
  if (!taken.has(base)) return base;
  return `${REPLICA_TRASH}/${path.replace(/\.md$/i, "")}.${stamp}.md`;
}

/**
 * One run of the folder replica. Every action applies its own entity change and upserts its own
 * index row immediately, so an interrupted run loses at most the action in progress and the
 * next run converges without duplicates.
 */
export async function runVaultSync(deps: VaultDeps): Promise<VaultRunSummary> {
  const summary = emptySummary();
  const [notes, docs, specs, tasks, folders, index, trash] = await Promise.all([
    notesRepo.listByProject(deps.projectId),
    docsRepo.listByProject(deps.projectId),
    specsRepo.listByProject(deps.projectId),
    tasksRepo.listByProject(deps.projectId),
    foldersRepo.listByProject(deps.projectId),
    syncRepo.listByProject(deps.projectId, "folder"),
    db.trash.where("projectId").equals(deps.projectId).toArray(),
  ]);

  const { entities, contentByKey } = collectLocal({ notes, docs, specs, tasks, folders, index, projectSlug: deps.projectSlug });
  const byId = new Map(entities.map((e) => [e.id, e]));
  const { orphans, rows: orphanRows } = orphansOf(index, new Set(byId.keys()));
  const trashedIds = new Set(trash.map((t) => t.entityId));
  const { files, errors } = await scanMirror(deps);
  summary.errors.push(...errors);

  const actions = planVaultSync({
    entities, files, autoImport: deps.autoImport, orphans, trashedIds, adoptUntracked: deps.adoptUntracked,
  });
  const fileHashes = new Map(files.map((f) => [f.path, f.hash]));
  const trashTaken = new Set(files.map((f) => f.path));
  const externalLimit = deps.maxExternalPerRun ?? 200;
  let adopted = 0;
  const done = new Set<string>();

  for (const action of actions) {
    let keepRow = true;
    switch (action.action) {
      case "write": {
        const content = contentByKey.get(mirrorKey(action.kind, action.entityId));
        if (content === undefined) {
          summary.errors.push(`no content for ${action.entityId}`);
          keepRow = false;
          break;
        }
        const res = await deps.io.write(deps.root, `${deps.folder}/${action.path}`, content);
        if (!res.ok) {
          summary.errors.push(res.error ?? `write failed: ${action.path}`);
          keepRow = false;
          break;
        }
        summary.written += 1;
        break;
      }
      case "import": {
        const ok = await importEntity(deps, action, fileHashes.get(action.path) ?? null);
        if (ok) summary.imported += 1;
        else {
          summary.errors.push(`import failed: ${action.path}`);
          keepRow = false;
        }
        break;
      }
      case "pending-import":
        summary.pending += 1;
        break;
      case "repath":
        break; // the row below carries the new path; content decisions are separate actions
      case "external": {
        keepRow = false;
        if (adopted >= externalLimit) {
          summary.errors.push(`adopt limit reached (${externalLimit}), skipped ${action.path}`);
          break;
        }
        adopted += 1;
        const created = await adoptExternal(deps, action.path);
        if (created) {
          summary.external += 1;
          await syncRepo.upsert(deps.projectId, {
            adapter: "folder", path: action.path, hash: fileHashes.get(action.path) ?? "", status: "remote_modified",
            entityType: created.kind, entityId: created.id, lastSyncedAt: null,
          });
        } else {
          summary.errors.push(`could not adopt ${action.path}`);
        }
        break;
      }
      case "untracked":
        summary.untracked += 1;
        break;
      case "trash-file": {
        const to = trashPathFor(action.path, trashTaken, deps.now());
        const res = await deps.io.move(deps.root, `${deps.folder}/${action.path}`, `${deps.folder}/${to}`);
        if (!res.ok) {
          summary.errors.push(res.error ?? `could not move ${action.path} to the trash`);
          break;
        }
        trashTaken.add(to);
        summary.trashed += 1;
        const row = orphanRows.find((r) => r.entityId === action.entityId);
        if (row) await syncRepo.remove(row.id);
        done.add(action.entityId);
        break;
      }
      case "deleted-in-app":
      case "conflict":
        summary.conflicts += 1;
        break;
      case "blocked":
        summary.blocked += 1;
        break;
      case "missing":
        summary.missing += 1;
        break;
      case "ignore":
        break;
      case "skip":
        summary.skipped += 1;
        break;
    }
    if (!keepRow) continue;
    const entityId = "entityId" in action ? action.entityId ?? "" : "";
    const actionPath = "path" in action ? action.path : action.to;
    const row = indexRowFor(action, byId.get(entityId), fileHashes.get(actionPath) ?? null, deps.now());
    if (row) {
      await syncRepo.upsert(deps.projectId, { ...row, adapter: "folder" });
      if (entityId) done.add(entityId);
    }
  }

  // Rows of deleted entities whose file is already gone have nothing left to mirror.
  for (const r of orphanRows) {
    if (!done.has(r.entityId!) && !fileHashes.has(r.path)) await syncRepo.remove(r.id);
  }
  return summary;
}

/** The user's answer to a conflict / deletion. */
export async function resolveVaultConflict(
  deps: VaultDeps,
  entityId: string,
  choice: "app" | "file" | "recreate",
): Promise<boolean> {
  const index = await syncRepo.listByProject(deps.projectId, "folder");
  const row = index.find((r) => r.entityId === entityId);
  if (!row) return false;
  const read = await deps.io.read(deps.root, `${deps.folder}/${row.path}`);
  const fileHash = read.ok && read.found && !read.truncated ? hashContent(normalizeMd(read.content)) : null;
  const kind = (row.entityType as MirrorKind | null) ?? claimOf(row.path);
  const live = kind ? await db.table(`${kind}s`).get(entityId) : null;

  if (!live) {
    // Deleted in the app, edited on disk. "file" brings the entity back from the trash with the
    // file's content; "app" keeps the deletion and moves the file to the replica trash.
    if (choice === "app") {
      const moved = await deps.io.move(deps.root, `${deps.folder}/${row.path}`, `${deps.folder}/${REPLICA_TRASH}/${row.path.replace(/\.md$/i, "")}.${deps.now()}.md`);
      if (!moved.ok) return false;
      await syncRepo.remove(row.id);
      return true;
    }
    if (!kind || !(await restoreEntity(trashId(kind, entityId), "replica"))) return false;
  }

  if (choice === "file") {
    if (fileHash == null || !kind) return false;
    const patch = applyVaultDoc(kind, parseVaultDoc(read.content));
    if (patch.kind === "note") await notesRepo.update(entityId, patch.patch);
    if (patch.kind === "doc") await docsRepo.update(entityId, patch.patch);
    if (patch.kind === "spec") await specsRepo.update(entityId, patch.patch);
    if (patch.kind === "task") await tasksRepo.update(entityId, patch.patch);
  }

  await syncRepo.upsert(deps.projectId, { ...resolveNextRow(row, fileHash, choice, deps.now()), adapter: "folder" });
  return true;
}
