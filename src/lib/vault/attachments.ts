import { getDb, type Attachment } from "../db/schema";
import { detectMimeType } from "./ignore-patterns";
import { md5Hex } from "./markdown-adapter";

export interface AttachmentCache {
  blob: Blob;
  mimeType: string;
  size: number;
  url: string;
}

const blobUrlCache = new Map<string, string>();

export function revokeAttachmentUrl(id: string) {
  const url = blobUrlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrlCache.delete(id);
  }
}

export function revokeAllAttachmentUrls() {
  for (const url of blobUrlCache.values()) URL.revokeObjectURL(url);
  blobUrlCache.clear();
}

export async function getCachedAttachment(id: string): Promise<AttachmentCache | null> {
  if (typeof window === "undefined") return null;
  const cached = blobUrlCache.get(id);
  if (cached) {
    const att = await getDb().attachments.get(id);
    if (att?.blob) return { blob: att.blob, mimeType: att.mimeType, size: att.size, url: cached };
  }
  const att = await getDb().attachments.get(id);
  if (!att?.blob) return null;
  const url = URL.createObjectURL(att.blob);
  blobUrlCache.set(id, url);
  return { blob: att.blob, mimeType: att.mimeType, size: att.size, url };
}

export async function cacheAttachment(input: {
  projectId: string;
  relativePath: string;
  blob: Blob;
  sourceVaultPath: string | null;
}): Promise<Attachment> {
  const id = await md5Hex(input.relativePath);
  const att: Attachment = {
    id,
    projectId: input.projectId,
    relativePath: input.relativePath,
    mimeType: input.blob.type || detectMimeType(input.relativePath),
    size: input.blob.size,
    blob: input.blob,
    cachedAt: Date.now(),
    sourceVaultPath: input.sourceVaultPath,
  };
  await getDb().attachments.put(att);
  return att;
}

export async function getAttachmentByPath(
  projectId: string,
  relativePath: string,
): Promise<Attachment | null> {
  const id = await md5Hex(relativePath);
  return (await getDb().attachments.get(id)) ?? null;
}

export async function getStorageUsage(
  projectId?: string,
): Promise<{ totalBytes: number; count: number }> {
  const all = await getDb().attachments.toArray();
  const filtered = projectId ? all.filter((a) => a.projectId === projectId) : all;
  return { totalBytes: filtered.reduce((s, a) => s + a.size, 0), count: filtered.length };
}

export async function clearAttachmentCache(projectId?: string): Promise<number> {
  const all = await getDb().attachments.toArray();
  const filtered = projectId ? all.filter((a) => a.projectId === projectId) : all;
  for (const a of filtered) {
    revokeAttachmentUrl(a.id);
    await getDb().attachments.delete(a.id);
  }
  return filtered.length;
}

export function findEmbedTargets(body: string): string[] {
  const re = /!\[\[([^\[\]]+?)\]\]/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const inner = m[1].trim();
    const pipe = inner.indexOf("|");
    out.push((pipe >= 0 ? inner.slice(0, pipe) : inner).trim());
  }
  return out;
}

export function formatBytes(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}
