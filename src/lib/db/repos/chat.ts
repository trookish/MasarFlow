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
import { setSecret, secretsAvailable } from "@/lib/secrets";
import {
  aiKeySecret,
  hydrateConnection,
  removeConnectionSecret,
  stripConnectionSecret,
} from "./chat-secrets";

export const aiConnectionsRepo = {
  async list(): Promise<AiConnection[]> {
    return Promise.all(
      (await db.aiConnections.orderBy("updatedAt").reverse().toArray()).map(
        hydrateConnection,
      ),
    );
  },
  async get(id: string): Promise<AiConnection | undefined> {
    const c = await db.aiConnections.get(id);
    return c ? hydrateConnection(c) : undefined;
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
    await db.aiConnections.add(await stripConnectionSecret(conn));
    return conn;
  },
  async update(id: string, patch: Partial<AiConnection>): Promise<void> {
    let next = patch;
    if (secretsAvailable() && "apiKey" in patch) {
      if (patch.apiKey) await setSecret(aiKeySecret(id), patch.apiKey);
      else await removeConnectionSecret(id);
      next = { ...patch, apiKey: "" };
    }
    await db.aiConnections.update(id, { ...next, updatedAt: now() });
  },
  async remove(id: string): Promise<void> {
    await removeConnectionSecret(id);
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
  get(id: string): Promise<ChatMessage | undefined> {
    return db.chatMessages.get(id);
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
  /**
   * Flip a message that is still mid-stream (from a dead session, e.g. after
   * a refresh or thread switch) into a visible "interrupted" error so it
   * never renders as a silent blank bubble. No-op for finished messages.
   */
  async markInterruptedIfStreaming(
    id: string,
    message = "The response was interrupted before it finished — Retry to get the answer.",
  ): Promise<void> {
    const m = await db.chatMessages.get(id);
    if (!m || m.role !== "assistant") return;
    if (m.status === "streaming" || m.status === undefined) {
      await db.chatMessages.update(id, { status: "error", error: message });
    }
  },
  async remove(id: string): Promise<void> {
    await db.chatMessages.delete(id);
  },
};
