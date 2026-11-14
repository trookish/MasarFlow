import { useLiveQuery } from "dexie-react-hooks";
import { getDb, type Sprint } from "../schema";
import { uid } from "@/lib/utils";

export function useSprints(projectId?: string) {
  return useLiveQuery(
    () => (projectId ? getDb().sprints.where("projectId").equals(projectId).sortBy("createdAt") : []),
    [projectId],
  );
}

export function useActiveSprint(projectId?: string) {
  return useLiveQuery(
    async () => {
      if (!projectId) return undefined;
      const sprints = await getDb().sprints.where("projectId").equals(projectId).toArray();
      return sprints.find((s) => s.status === "active") || sprints.find((s) => s.status === "planning");
    },
    [projectId],
  );
}

export async function createSprint(projectId: string, name: string, goal: string = ""): Promise<Sprint> {
  const sprint: Sprint = {
    id: uid("spr"),
    projectId,
    name,
    goal,
    status: "planning",
    startDate: null,
    endDate: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await getDb().sprints.add(sprint);
  return sprint;
}

export async function updateSprint(id: string, updates: Partial<Sprint>) {
  await getDb().sprints.update(id, { ...updates, updatedAt: Date.now() });
}

export async function deleteSprint(id: string) {
  await getDb().transaction("rw", getDb().sprints, getDb().tasks, async () => {
    await getDb().sprints.delete(id);
    const tasks = await getDb().tasks.where("sprintId").equals(id).toArray();
    for (const t of tasks) {
      await getDb().tasks.update(t.id, { sprintId: null });
    }
  });
}
