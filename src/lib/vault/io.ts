import { assertRelativeVaultPath } from "./paths";

/**
 * The vault's disk transport: the P2-confined /api/fs routes. Every path is
 * validated here BEFORE a request is built, so a bug upstream cannot escape the
 * chosen root even if the server had no guard of its own.
 */

export interface VaultListEntry {
  path: string;
  size: number;
  mtime: number;
}

export interface VaultIO {
  list(root: string, folder: string): Promise<{ ok: boolean; files: VaultListEntry[]; error?: string }>;
  read(root: string, path: string): Promise<{ ok: boolean; found: boolean; content: string; truncated: boolean; error?: string }>;
  write(root: string, path: string, content: string): Promise<{ ok: boolean; error?: string }>;
  /** Rename a file inside the root (used to move a deleted entity's file to the replica trash). */
  move(root: string, from: string, to: string): Promise<{ ok: boolean; error?: string }>;
}

/** Mirror files bigger than this are treated as unreadable (the read route caps at 512 KB). */
export const MAX_MIRROR_BYTES = 512 * 1024;
/** The write route rejects > 1 MB. */
export const MAX_WRITE_BYTES = 900 * 1024;
export const MAX_MIRROR_FILES = 2000;

async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok && json.error === undefined) json.error = `HTTP ${res.status}`;
  return json;
}

export function createVaultIO(): VaultIO {
  return {
    async list(root, folder) {
      try {
        const json = await post("/api/fs/list", { root, path: folder, depth: 6, maxEntries: MAX_MIRROR_FILES });
        if (!json.ok) return { ok: false, files: [], error: String(json.error ?? "list failed") };
        const prefix = `${folder.replace(/\/+$/, "")}/`;
        const files = ((json.entries as Array<{ path: string; type: string; size: number; mtime: number }>) ?? [])
          .filter((e) => e.type === "file" && e.path.startsWith(prefix) && e.path.toLowerCase().endsWith(".md"))
          .map((e) => ({ path: e.path.slice(prefix.length), size: e.size, mtime: e.mtime }))
          .slice(0, MAX_MIRROR_FILES);
        return { ok: true, files };
      } catch (e) {
        return { ok: false, files: [], error: e instanceof Error ? e.message : String(e) };
      }
    },

    async read(root, path) {
      const rel = assertRelativeVaultPath(path);
      try {
        const json = await post("/api/fs/read", { root, path: rel, maxBytes: MAX_MIRROR_BYTES });
        if (!json.ok) return { ok: false, found: false, content: "", truncated: false, error: String(json.error ?? "read failed") };
        const binary = json.binary === true;
        const truncated = json.truncated === true;
        const content = binary || truncated ? "" : String(json.content ?? "");
        return { ok: true, found: true, content, truncated: binary || truncated };
      } catch (e) {
        return { ok: false, found: false, content: "", truncated: false, error: e instanceof Error ? e.message : String(e) };
      }
    },

    async write(root, path, content) {
      const rel = assertRelativeVaultPath(path);
      if (new TextEncoder().encode(content).length > MAX_WRITE_BYTES) {
        return { ok: false, error: `refusing to write ${rel}: over ${MAX_WRITE_BYTES} bytes` };
      }
      try {
        const json = await post("/api/fs/write", { root, path: rel, content });
        return json.ok ? { ok: true } : { ok: false, error: String(json.error ?? "write failed") };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },

    async move(root, from, to) {
      const src = assertRelativeVaultPath(from);
      const dest = assertRelativeVaultPath(to);
      try {
        const json = await post("/api/fs/move", { root, from: src, to: dest });
        return json.ok ? { ok: true } : { ok: false, error: String(json.error ?? "move failed") };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
