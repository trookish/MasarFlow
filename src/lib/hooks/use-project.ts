"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useProjectStore } from "@/lib/stores/project";

/** The id of the project currently in focus (null until initialized). */
export function useActiveProjectId(): string | null {
  return useProjectStore((s) => s.activeProjectId);
}

/** The active project record, live from IndexedDB. */
export function useActiveProject() {
  const id = useActiveProjectId();
  return useLiveQuery(async () => (id ? db.projects.get(id) : undefined), [id]);
}
