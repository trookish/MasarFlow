import { reindexProject as reindex } from "@/lib/ai/embeddings/indexer";

/**
 * Keeps the local semantic index current. The index lives in IndexedDB and is produced by an
 * in-browser embedding worker — no external service involved.
 */
const PERIODIC_INTERVAL_MS = 10 * 60 * 1000;

/** Reindex one project. Never throws. `onProgress` reports chunks embedded of the run's total. */
export async function reindexProject(
  projectId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  try {
    await reindex(projectId, undefined, onProgress);
  } catch (err) {
    console.warn("[embeddings] reindex failed", err);
  }
}

let periodicTimer: ReturnType<typeof setInterval> | null = null;

export function startPeriodicEmbeddingSync(getProjectId: () => string | null): void {
  if (periodicTimer) clearInterval(periodicTimer);
  const run = () => {
    const id = getProjectId();
    if (id) void reindexProject(id);
  };
  setTimeout(run, 3_000); // first pass shortly after boot
  periodicTimer = setInterval(run, PERIODIC_INTERVAL_MS);
}

export function stopPeriodicEmbeddingSync(): void {
  if (periodicTimer) clearInterval(periodicTimer);
  periodicTimer = null;
}
