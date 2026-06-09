import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "../schema";
import type { Project } from "../schema";

export function useProjects() {
  return useLiveQuery(() => getDb().projects.toArray(), [], [] as Project[]);
}

export function useActiveProject(): Project | undefined {
  return useLiveQuery(async () => {
    const list = await getDb().projects.toArray();
    return list.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }, undefined);
}

export function useProject(id: string | undefined) {
  return useLiveQuery(() => (id ? getDb().projects.get(id) : undefined), [id]);
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  await getDb().projects.update(id, { ...patch, updatedAt: Date.now() });
}
