"use client";
import { getDb, type SyncFile, type Project } from "../db/schema";
import { md5Hex } from "./markdown-adapter";
import { isTaskNote, vaultTaskToBrain } from "./tasks-adapter";
import { cacheAttachment, findEmbedTargets } from "./attachments";
import { isTemplate } from "./ignore-patterns";
import { emitAutomationEvent } from "../automation/engine";
import { exportVaultZip, downloadZip, type ZipEntry } from "./zip-export";
import type { VaultBackend } from "./backends/types";
import { DEFAULT_VAULT_SETTINGS, type VaultSettings } from "./types";

export interface BackendSyncResult {
  scanned: number;
  created: number;
  updated: number;
  deleted: number;
  conflicts: number;
  attachments: number;
  errors: string[];
  writeMethod: string;
}

export interface BackendSyncProgress {
  phase: "pick" | "walk" | "read" | "write" | "complete";
  current: number;
  total: number;
  file?: string;
}

export async function runPullWithBackend(
  backend: VaultBackend,
  project: Project,
  onProgress?: (p: BackendSyncProgress) => void,
): Promise<BackendSyncResult> {
  const settings = await getSettings();
  const result: BackendSyncResult = {
    scanned: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    conflicts: 0,
    attachments: 0,
    errors: [],
    writeMethod: backend.capabilities.inPlaceWrites ? "in-place" : "download",
  };
  onProgress?.({ phase: "walk", current: 0, total: 0 });
  const files = await backend.walk();
  const markdowns = files.filter((f) => f.kind === "markdown");
  result.scanned = markdowns.length;
  onProgress?.({ phase: "read", current: 0, total: markdowns.length });
  const existing = await getDb().syncFiles.where({ projectId: project.id }).toArray();
  const existingByPath = new Map<string, SyncFile>();
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
      const text = await backend.read(meta.relativePath);
      if (text == null) continue;
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
        else result.updated++;
      } else {
        const { vaultNoteToBrain } = await import("./markdown-adapter");
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
        else result.updated++;
      }
      for (const emb of findEmbedTargets(text)) {
        try {
          const embText = await backend.read(emb);
          if (embText != null) {
            const blob = new Blob([embText], { type: "text/plain" });
            if (blob.size <= settings.maxAttachmentBytes) {
              await cacheAttachment({
                projectId: project.id,
                relativePath: emb,
                blob,
                sourceVaultPath: emb,
              });
              result.attachments++;
            }
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

export async function runPushWithBackend(
  backend: VaultBackend,
  project: Project,
  opts: { asZip?: boolean } = {},
): Promise<BackendSyncResult> {
  const { brainNoteToVault } = await import("./markdown-adapter");
  const { brainTaskToVault } = await import("./tasks-adapter");
  const result: BackendSyncResult = {
    scanned: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    conflicts: 0,
    attachments: 0,
    errors: [],
    writeMethod: backend.capabilities.inPlaceWrites ? "in-place" : "download",
  };
  const all = await getDb().syncFiles.where({ projectId: project.id }).toArray();
  const pending = all.filter((f) => f.status === "local-newer");
  if (pending.length === 0) return result;
  result.scanned = pending.length;
  if (opts.asZip || !backend.capabilities.inPlaceWrites) {
    const entries: ZipEntry[] = [];
    for (const sf of pending) {
      try {
        if (sf.taskId) {
          const t = await getDb().tasks.get(sf.taskId);
          if (t)
            entries.push({
              path: sf.relativePath,
              content: brainTaskToVault(t),
              mtime: Date.now(),
            });
        } else if (sf.noteId) {
          const n = await getDb().notes.get(sf.noteId);
          if (n)
            entries.push({
              path: sf.relativePath,
              content: brainNoteToVault(n),
              mtime: Date.now(),
            });
        }
      } catch (e) {
        result.errors.push(sf.relativePath + ": " + (e as Error).message);
      }
    }
    if (entries.length > 0) {
      try {
        const blob = await exportVaultZip(entries);
        const fileName =
          (backend.rootName || "vault") + "-" + new Date().toISOString().slice(0, 10) + ".zip";
        downloadZip(blob, fileName);
        result.writeMethod = "download";
        for (const sf of pending) {
          const entry = entries.find((e) => e.path === sf.relativePath);
          if (entry) {
            const hash = await md5Hex(entry.content);
            await getDb().syncFiles.update(sf.id, {
              status: "synced",
              hash,
              mtime: Date.now(),
              lastSyncedAt: Date.now(),
            });
            result.updated++;
          }
        }
      } catch (e) {
        result.errors.push("Zip export: " + (e as Error).message);
      }
    }
    await getDb().vaultMeta.put({ key: "lastPush", value: Date.now() });
    emitAutomationEvent({
      id: "vault-push-" + Date.now(),
      kind: "vault-push",
      message: "Pushed " + result.updated + " files (zip)",
      at: Date.now(),
    });
    return result;
  }
  for (const sf of pending) {
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
      const r = await backend.write(sf.relativePath, body);
      if (r.ok) {
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

export async function runSyncWithBackend(
  backend: VaultBackend,
  project: Project,
  onProgress?: (p: BackendSyncProgress) => void,
): Promise<BackendSyncResult> {
  const pull = await runPullWithBackend(backend, project, onProgress);
  const push = await runPushWithBackend(backend, project, {});
  return {
    scanned: pull.scanned + push.scanned,
    created: pull.created,
    updated: pull.updated + push.updated,
    deleted: pull.deleted,
    conflicts: pull.conflicts,
    attachments: pull.attachments,
    errors: [...pull.errors, ...push.errors],
    writeMethod: push.writeMethod,
  };
}

export async function getSettings(): Promise<VaultSettings> {
  const row = await getDb().vaultMeta.get("settings");
  if (!row) return { ...DEFAULT_VAULT_SETTINGS };
  return { ...DEFAULT_VAULT_SETTINGS, ...((row.value ?? {}) as Partial<VaultSettings>) };
}

export async function saveSettings(s: Partial<VaultSettings>): Promise<VaultSettings> {
  const cur = await getSettings();
  const next = { ...cur, ...s };
  await getDb().vaultMeta.put({ key: "settings", value: next });
  return next;
}

export { getBackend } from "./backends/strategy";
export { getActiveHandle, setActiveHandle } from "./backends/native-fsa";
