import { getDb, type SyncFile, type Project } from "../db/schema";
import { readVaultFile, walkVault } from "./fs-access";
import { vaultNoteToBrain, brainNoteToVault, md5Hex } from "./markdown-adapter";
import { vaultTaskToBrain, brainTaskToVault, isTaskNote } from "./tasks-adapter";
import { cacheAttachment, findEmbedTargets } from "./attachments";
import { isTemplate } from "./ignore-patterns";

import { emitAutomationEvent } from "../automation/engine";
import { getActiveHandle, setActiveHandle } from "./handle-store";

export { getActiveHandle, setActiveHandle };
export { getSettings, saveSettings } from "./sync-engine-backend";
import { getSettings } from "./sync-engine-backend";

export interface SyncResult {
  scanned: number;
  created: number;
  updated: number;
  deleted: number;
  conflicts: number;
  attachments: number;
  errors: string[];
}

export interface SyncProgress {
  phase: "walk" | "read" | "write" | "complete";
  current: number;
  total: number;
  file?: string;
}

export async function runPull(
  handle: FileSystemDirectoryHandle,
  project: Project,
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  const settings = await getSettings();
  const result: SyncResult = {
    scanned: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    conflicts: 0,
    attachments: 0,
    errors: [],
  };
  onProgress?.({ phase: "walk", current: 0, total: 0 });
  const files = await walkVault(handle, {
    includePatterns: settings.includePatterns,
    excludePatterns: settings.excludePatterns,
    archiveIncluded: settings.archiveIncluded,
    trashIncluded: settings.trashIncluded,
  });
  const markdowns = files.filter((f) => f.kind === "markdown");
  result.scanned = markdowns.length;
  onProgress?.({ phase: "read", current: 0, total: markdowns.length });
  const existingByPath = new Map<string, SyncFile>();
  const existing = await getDb().syncFiles.where({ projectId: project.id }).toArray();
  for (const e of existing) existingByPath.set(e.relativePath, e);
  for (let i = 0; i < markdowns.length; i++) {
    const meta = markdowns[i];
    onProgress?.({
      phase: "read",
      current: i + 1,
      total: markdowns.length,
      file: meta.relativePath,
    });
    try {
      const f = await readVaultFile(handle, meta.relativePath);
      if (!f) continue;
      const text = await f.text();
      const hash = await md5Hex(text);
      const prev = existingByPath.get(meta.relativePath);
      if (prev && prev.hash === hash) {
        await getDb().syncFiles.update(prev.id, {
          status: meta.inTrash ? "trash" : "synced",
          mtime: meta.mtime,
          lastSyncedAt: Date.now(),
        });
        continue;
      }
      const isTask = isTaskNote(text);
      const isTpl = isTemplate(meta.relativePath);
      if (isTask) {
        const { task } = vaultTaskToBrain({
          projectId: project.id,
          body: text,
          relativePath: meta.relativePath,
          mtime: meta.mtime,
        });
        await getDb().tasks.put(task);
        const id = "sync_" + project.id + "_" + meta.relativePath.replace(/[^a-zA-Z0-9]/g, "_");
        const status: SyncFile["status"] = meta.inTrash
          ? "trash"
          : prev
            ? "remote-newer"
            : "synced";
        await getDb().syncFiles.put({
          id,
          projectId: project.id,
          relativePath: meta.relativePath,
          side: "remote",
          status,
          mtime: meta.mtime,
          hash,
          noteId: null,
          taskId: task.id,
          lastSyncedAt: Date.now(),
          isTemplate: isTpl,
          inTrash: meta.inTrash,
          size: meta.size,
        });
        if (!prev) result.created++;
        else {
          result.updated++;
        }
      } else {
        const { note } = vaultNoteToBrain({
          projectId: project.id,
          body: text,
          relativePath: meta.relativePath,
          mtime: meta.mtime,
        });
        await getDb().notes.put(note);
        const id = "sync_" + project.id + "_" + meta.relativePath.replace(/[^a-zA-Z0-9]/g, "_");
        const status: SyncFile["status"] = meta.inTrash
          ? "trash"
          : prev
            ? "remote-newer"
            : "synced";
        await getDb().syncFiles.put({
          id,
          projectId: project.id,
          relativePath: meta.relativePath,
          side: "remote",
          status,
          mtime: meta.mtime,
          hash,
          noteId: note.id,
          taskId: null,
          lastSyncedAt: Date.now(),
          isTemplate: isTpl,
          inTrash: meta.inTrash,
          size: meta.size,
        });
        if (!prev) result.created++;
        else {
          result.updated++;
        }
      }
      for (const emb of findEmbedTargets(text)) {
        try {
          const af = await readVaultFile(handle, emb);
          if (af && af.size <= settings.maxAttachmentBytes) {
            await cacheAttachment({
              projectId: project.id,
              relativePath: emb,
              blob: af,
              sourceVaultPath: emb,
            });
            result.attachments++;
          }
        } catch {}
      }
    } catch (e) {
      result.errors.push(meta.relativePath + ": " + (e as Error).message);
    }
  }
  onProgress?.({ phase: "complete", current: markdowns.length, total: markdowns.length });
  emitAutomationEvent({
    id: "vault-pull-" + Date.now(),
    kind: "vault-pull",
    message: "Pulled " + result.created + " created, " + result.updated + " updated from vault",
    at: Date.now(),
  });
  await getDb().vaultMeta.put({ key: "lastPull", value: Date.now() });
  return result;
}

export async function runPush(
  handle: FileSystemDirectoryHandle,
  project: Project,
  onlyLocalNewer = true,
): Promise<SyncResult> {
  const { writeVaultFile } = await import("./fs-access");
  const result: SyncResult = {
    scanned: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    conflicts: 0,
    attachments: 0,
    errors: [],
  };
  const pending = await getDb()
    .syncFiles.where({
      projectId: project.id,
      status: onlyLocalNewer ? "local-newer" : (undefined as unknown as string),
    })
    .toArray();
  for (const sf of pending) {
    result.scanned++;
    if (!sf.noteId && !sf.taskId) continue;
    try {
      let body = "";
      if (sf.taskId) {
        const t = await getDb().tasks.get(sf.taskId);
        if (!t) continue;
        body = brainTaskToVault(t);
      } else if (sf.noteId) {
        const n = await getDb().notes.get(sf.noteId);
        if (!n) continue;
        body = brainNoteToVault(n);
      }
      const ok = await writeVaultFile(handle, sf.relativePath, body);
      if (ok) {
        const hash = await md5Hex(body);
        await getDb().syncFiles.update(sf.id, {
          status: "synced",
          hash,
          mtime: Date.now(),
          lastSyncedAt: Date.now(),
        });
        result.updated++;
      } else {
        result.errors.push("Write failed: " + sf.relativePath);
      }
    } catch (e) {
      result.errors.push(sf.relativePath + ": " + (e as Error).message);
    }
  }
  await getDb().vaultMeta.put({ key: "lastPush", value: Date.now() });
  emitAutomationEvent({
    id: "vault-push-" + Date.now(),
    kind: "vault-push",
    message: "Pushed " + result.updated + " files to vault",
    at: Date.now(),
  });
  return result;
}

export async function runSync(
  handle: FileSystemDirectoryHandle,
  project: Project,
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  const pull = await runPull(handle, project, onProgress);
  const push = await runPush(handle, project, true);
  return {
    scanned: pull.scanned + push.scanned,
    created: pull.created,
    updated: pull.updated + push.updated,
    deleted: pull.deleted,
    conflicts: pull.conflicts,
    attachments: pull.attachments,
    errors: [...pull.errors, ...push.errors],
  };
}

export async function trashVaultFile(
  handle: FileSystemDirectoryHandle,
  sf: SyncFile,
): Promise<boolean> {
  const parts = sf.relativePath.split("/");
  const fileName = parts.pop();
  if (!fileName) return false;
  try {
    let dir = handle;
    for (const seg of parts) {
      dir = await dir.getDirectoryHandle(seg, { create: false });
    }
    const fh = await dir.getFileHandle(fileName, { create: false });
    await (fh as unknown as { remove: () => Promise<void> }).remove();
    await getDb().syncFiles.update(sf.id, { status: "deleted-remote", lastSyncedAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}

export async function restoreFromTrash(
  handle: FileSystemDirectoryHandle,
  sf: SyncFile,
  destPath: string,
): Promise<boolean> {
  const { readVaultFile, writeVaultFile } = await import("./fs-access");
  try {
    const f = await readVaultFile(handle, sf.relativePath);
    if (!f) return false;
    const text = await f.text();
    const ok = await writeVaultFile(handle, destPath, text);
    if (ok) {
      await trashVaultFile(handle, sf);
      const hash = await md5Hex(text);
      const id = "sync_" + sf.projectId + "_" + destPath.replace(/[^a-zA-Z0-9]/g, "_");
      await getDb().syncFiles.put({
        ...sf,
        id,
        relativePath: destPath,
        status: "synced",
        inTrash: false,
        hash,
        mtime: Date.now(),
        lastSyncedAt: Date.now(),
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function hardDeleteSyncRecord(id: string): Promise<void> {
  await getDb().syncFiles.delete(id);
}
