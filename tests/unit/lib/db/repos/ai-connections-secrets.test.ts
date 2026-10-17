import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";

const vault = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/secrets", () => ({
  secretsAvailable: () => true,
  getSecret: async (k: string) => vault.get(k) ?? "",
  setSecret: async (k: string, v: string) => void vault.set(k, v),
  deleteSecret: async (k: string) => void vault.delete(k),
}));

import { db } from "@/lib/db";
import { aiConnectionsRepo } from "@/lib/db/repos";
import { migrateAiConnectionSecrets } from "@/lib/db/repos/chat-secrets";

beforeEach(async () => {
  vault.clear();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("AI connection keys live in the secret store, not in IndexedDB", () => {
  it("create() stores the key as a secret and a blank in the row, but returns it hydrated", async () => {
    const c = await aiConnectionsRepo.create({ providerId: "openai", label: "Main", apiKey: "sk-TEST" });
    expect(c.apiKey).toBe("sk-TEST");
    expect((await db.aiConnections.get(c.id))!.apiKey).toBe("");
    expect(vault.get(`ai-connection:${c.id}`)).toBe("sk-TEST");
    expect((await aiConnectionsRepo.get(c.id))!.apiKey).toBe("sk-TEST");
    expect((await aiConnectionsRepo.list())[0].apiKey).toBe("sk-TEST");
  });
  it("update() without apiKey keeps the secret; with '' deletes it", async () => {
    const c = await aiConnectionsRepo.create({ providerId: "openai", label: "A", apiKey: "sk-1" });
    await aiConnectionsRepo.update(c.id, { label: "B" });
    expect(vault.get(`ai-connection:${c.id}`)).toBe("sk-1");
    await aiConnectionsRepo.update(c.id, { apiKey: "" });
    expect(vault.has(`ai-connection:${c.id}`)).toBe(false);
  });
  it("remove() deletes the secret", async () => {
    const c = await aiConnectionsRepo.create({ providerId: "openai", label: "A", apiKey: "sk-TEST" });
    await aiConnectionsRepo.remove(c.id);
    expect(vault.size).toBe(0);
  });
  it("migrates legacy plaintext rows", async () => {
    await db.aiConnections.add({ id: "legacy", providerId: "x", label: "L", apiKey: "sk-OLD", baseUrl: "", createdAt: 1, updatedAt: 1 });
    await migrateAiConnectionSecrets();
    expect((await db.aiConnections.get("legacy"))!.apiKey).toBe("");
    expect(vault.get("ai-connection:legacy")).toBe("sk-OLD");
  });
  it("migration is one-time: a second run moves nothing", async () => {
    await db.aiConnections.add({ id: "legacy", providerId: "x", label: "L", apiKey: "sk-OLD", baseUrl: "", createdAt: 1, updatedAt: 1 });
    expect(await migrateAiConnectionSecrets()).toBe(1);
    expect(await migrateAiConnectionSecrets()).toBe(0);
    expect(vault.get("ai-connection:legacy")).toBe("sk-OLD");
    expect((await db.aiConnections.get("legacy"))!.apiKey).toBe("");
  });
});
