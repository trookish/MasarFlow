import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { REPO_ROOT, waitForShellReady } from "./_harness";

/** v0.3 measurement harnesses write here (P0); later phases turn the records into gates. */
export function writeAudit(name: string, data: unknown): string {
  const file = path.join(REPO_ROOT, "reports", "v0.3", name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  return file;
}

/**
 * Every page the shell can host, read from src/lib/navigation/surfaces.ts so the harness follows the
 * product instead of a copied list. Parsed as text: importing the module would pull React into Node.
 */
export function navRoutes(): Array<{ label: string; href: string }> {
  const src = readFileSync(path.join(REPO_ROOT, "src", "lib", "navigation", "surfaces.ts"), "utf8");
  const out = new Map<string, string>();
  for (const m of src.matchAll(/\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*href:\s*"([^"]+)"/g)) {
    if (!out.has(m[3])) out.set(m[3], m[2]);
  }
  return [...out.entries()].map(([href, label]) => ({ label, href }));
}

/** Full navigation to `href` inside the app origin, then wait for the workspace. */
export async function openRoute(page: Page, href: string): Promise<void> {
  // `new URL(...).origin` is "null" for the custom masarflow:// scheme, so take scheme + host as text.
  const origin = /^[a-z][a-z0-9+.-]*:\/\/[^/]+/i.exec(page.url())?.[0] ?? "";
  await page.goto(`${origin}${href}`);
  await waitForShellReady(page);
  await page.waitForTimeout(400);
}

/** Read every IndexedDB object store of the app database as plain rows. */
export async function snapshotIndexedDb(page: Page) {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("masarflow");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      const names = Array.from(db.objectStoreNames);
      const tables = [];
      for (const name of names) {
        const tx = db.transaction(name, "readonly");
        const store = tx.objectStore(name);
        const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
          const all = store.getAll();
          all.onsuccess = () => resolve(all.result as Record<string, unknown>[]);
          all.onerror = () => reject(all.error);
        });
        tables.push({ name, indexes: Array.from(store.indexNames), rows });
      }
      return { tables };
    } finally {
      db.close();
    }
  });
}
