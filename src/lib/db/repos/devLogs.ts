import { db } from "@/lib/db";
import { devLogSchema, type DevLog } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

type DevLogInput = Partial<DevLog> & Pick<DevLog, "projectId" | "title">;

export const devLogsRepo = {
  async listByProject(projectId?: string | null): Promise<DevLog[]> {
    if (!projectId) return [];
    return db.devLogs
      .where("projectId")
      .equals(projectId)
      .reverse()
      .sortBy("createdAt");
  },
  get(id: string): Promise<DevLog | undefined> {
    return db.devLogs.get(id);
  },
  async create(input: DevLogInput): Promise<DevLog> {
    const devLog = devLogSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? now(),
    });
    await db.devLogs.add(devLog);
    return devLog;
  },
  async update(id: string, patch: Partial<DevLog>): Promise<void> {
    await db.devLogs.update(id, patch);
  },
  async remove(id: string): Promise<void> {
    await db.devLogs.delete(id);
  },
};
