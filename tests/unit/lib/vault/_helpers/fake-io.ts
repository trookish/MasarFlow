import { hashContent, normalizeMd } from "@/lib/sync";
import { parseVaultDoc } from "@/lib/vault/serialize";
import { createVaultIO, type VaultIO } from "@/lib/vault/io";
import type { MirrorFile } from "@/lib/vault/plan";

/** An in-memory disk: the same contract as the /api/fs routes, no server. */
export function makeFakeIO(initial: Record<string, string> = {}): {
  io: VaultIO;
  files: Map<string, string>;
  lastRead: { path: string }[];
} {
  const files = new Map(Object.entries(initial));
  const lastRead: { path: string }[] = [];
  const MAX = 512 * 1024;
  const io: VaultIO = {
    async list(_root, folder) {
      const prefix = `${folder}/`;
      const out = [...files.keys()]
        .filter((p) => p.startsWith(prefix))
        .map((p) => ({ path: p.slice(prefix.length), size: files.get(p)!.length, mtime: 0 }));
      return { ok: true, files: out };
    },
    async read(_root, p) {
      lastRead.push({ path: p });
      const content = files.get(p);
      if (content === undefined) return { ok: false, found: false, content: "", truncated: false, error: "ENOENT" };
      const truncated = content.length > MAX;
      return { ok: true, found: true, content: truncated ? "" : content, truncated };
    },
    async write(_root, p, content) {
      files.set(p, content);
      return { ok: true };
    },
  };
  return { io, files, lastRead };
}

/** Hash a fake-disk file exactly like the engine does. */
export function fileToMirror(path: string, content: string): MirrorFile {
  const doc = parseVaultDoc(content);
  return { path, hash: hashContent(normalizeMd(content)), msfId: doc.id };
}

export const realIO = createVaultIO;
