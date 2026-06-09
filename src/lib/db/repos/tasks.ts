import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "../schema";
import type { Task } from "../schema";

export function useTasks(projectId: string | undefined) {
  return useLiveQuery(
    () =>
      projectId
        ? getDb().tasks.where("projectId").equals(projectId).reverse().sortBy("updatedAt")
        : Promise.resolve([] as Task[]),
    [projectId],
    [] as Task[],
  );
}

export async function upsertTask(t: Task) {
  await getDb().tasks.put(t);
}
