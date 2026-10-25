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
 * Every workspace route the navigation lists, read from src/lib/nav.ts so the harness follows the
 * product instead of a copied list. Parsed as text: importing nav.ts would pull React into Node.
 */
export function navRoutes(): Array<{ label: string; href: string }> {
  const src = readFileSync(path.join(REPO_ROOT, "src", "lib", "nav.ts"), "utf8");
  const out = new Map<string, string>();
  for (const m of src.matchAll(/label:\s*"([^"]+)",\s*href:\s*"([^"]+)"/g)) {
    if (!out.has(m[2])) out.set(m[2], m[1]);
  }
  return [...out.entries()].map(([href, label]) => ({ label, href }));
}

/** Full navigation to `href` inside the app origin, then wait for the workspace. */
export async function openRoute(page: Page, href: string): Promise<void> {
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}${href}`);
  await waitForShellReady(page);
  await page.waitForTimeout(400);
}

/** Switch the shell between the dock layout and the rail layout (persisted UI store). */
export async function setDockMode(page: Page, dock: boolean): Promise<void> {
  await page.evaluate((on) => {
    const key = "masarflow-ui";
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as { state?: Record<string, unknown> }) : { state: {} };
    parsed.state = { ...(parsed.state ?? {}), dockEnabled: on };
    localStorage.setItem(key, JSON.stringify(parsed));
  }, dock);
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
