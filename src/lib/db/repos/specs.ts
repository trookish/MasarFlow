import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "../schema";
import type { Spec, Task, Plan } from "../schema";

export function useSpecs(projectId: string | undefined) {
  return useLiveQuery(
    () =>
      projectId
        ? getDb().specs.where("projectId").equals(projectId).reverse().sortBy("updatedAt")
        : Promise.resolve([] as Spec[]),
    [projectId],
    [] as Spec[],
  );
}

export function useSpec(id: string | undefined) {
  return useLiveQuery(() => (id ? getDb().specs.get(id) : undefined), [id]);
}

export function usePlanForSpec(specId: string | undefined) {
  return useLiveQuery(
    () => (specId ? getDb().plans.where("specId").equals(specId).first() : undefined),
    [specId],
  );
}

export function useTasksForSpec(specId: string | undefined) {
  return useLiveQuery(
    () =>
      specId
        ? getDb().tasks.where("specId").equals(specId).toArray()
        : Promise.resolve([] as Task[]),
    [specId],
    [] as Task[],
  );
}

export function useAllPlans() {
  return useLiveQuery(
    () => getDb().plans.orderBy("createdAt").reverse().toArray(),
    [],
    [] as Plan[],
  );
}
