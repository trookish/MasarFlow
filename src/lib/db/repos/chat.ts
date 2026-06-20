import { db } from "@/lib/db";
import {
  aiConnectionSchema,
  chatThreadSchema,
  chatMessageSchema,
  type AiConnection,
  type ChatThread,
  type ChatMessage,
} from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

export const aiConnectionsRepo = {
  list(): Promise<AiConnection[]> {
    return db.aiConnections.orderBy("updatedAt").reverse().toArray();
  },
  get(id: string): Promise<AiConnection | undefined> {
    return db.aiConnections.get(id);
  },
  async create(
    input: Partial<AiConnection> & Pick<AiConnection, "providerId" | "label">,
  ): Promise<AiConnection> {
    const ts = now();
    const conn = aiConnectionSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? ts,
      updatedAt: ts,
    });
    await db.aiConnections.add(conn);
    return conn;
  },
  async update(id: string, patch: Partial<AiConnection>): Promise<void> {
    await db.aiConnections.update(id, { ...patch, updatedAt: now() });
  },
  async remove(id: string): Promise<void> {
    await db.aiConnections.delete(id);
  },
};

export const chatThreadsRepo = {
  async listByProject(projectId?: string | null): Promise<ChatThread[]> {
    if (!projectId) return [];
    return db.chatThreads
      .where("projectId")
      .equals(projectId)
      .reverse()
      .sortBy("updatedAt");
  },
  get(id: string): Promise<ChatThread | undefined> {
    return db.chatThreads.get(id);
  },
  async create(
    input: Partial<ChatThread> &
      Pick<ChatThread, "projectId" | "connectionId" | "modelId">,
  ): Promise<ChatThread> {
    const ts = now();
    const thread = chatThreadSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? ts,
      updatedAt: ts,
    });
    await db.chatThreads.add(thread);
    return thread;
  },
  async update(id: string, patch: Partial<ChatThread>): Promise<void> {
    await db.chatThreads.update(id, { ...patch, updatedAt: now() });
  },
  async remove(id: string): Promise<void> {
    await db.transaction("rw", [db.chatThreads, db.chatMessages], async () => {
      await db.chatMessages.where("threadId").equals(id).delete();
      await db.chatThreads.delete(id);
    });
  },
};

export const chatMessagesRepo = {
  async listByThread(threadId?: string | null): Promise<ChatMessage[]> {
    if (!threadId) return [];
    return db.chatMessages.where("threadId").equals(threadId).sortBy("createdAt");
  },
  async create(
    input: Partial<ChatMessage> & Pick<ChatMessage, "threadId" | "role">,
  ): Promise<ChatMessage> {
    const msg = chatMessageSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? now(),
    });
    await db.chatMessages.add(msg);
    return msg;
  },
  async update(id: string, patch: Partial<ChatMessage>): Promise<void> {
    await db.chatMessages.update(id, patch);
  },
  async remove(id: string): Promise<void> {
    await db.chatMessages.delete(id);
  },
};
