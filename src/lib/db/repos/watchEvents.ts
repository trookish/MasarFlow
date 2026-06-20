import { db } from "@/lib/db";
import { watchEventSchema, type WatchEvent } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

type WatchEventInput = Partial<WatchEvent> &
  Pick<WatchEvent, "projectId" | "path">;

export const watchEventsRepo = {
  async listByProject(projectId?: string | null): Promise<WatchEvent[]> {
    if (!projectId) return [];
    return db.watchEvents
      .where("projectId")
      .equals(projectId)
      .reverse()
      .sortBy("createdAt");
  },
  async create(input: WatchEventInput): Promise<WatchEvent> {
    const event = watchEventSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? now(),
    });
    await db.watchEvents.add(event);
    return event;
  },
  async clear(projectId: string): Promise<void> {
    await db.watchEvents.where("projectId").equals(projectId).delete();
  },
};
