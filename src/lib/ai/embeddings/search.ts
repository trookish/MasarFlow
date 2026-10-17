const versions = new Map<string, number>();

/** Called by the indexer after it writes, so the in-memory copy is reloaded (P3.T6 fills in search). */
export function bumpIndexVersion(projectId: string): void {
  versions.set(projectId, (versions.get(projectId) ?? 0) + 1);
}
