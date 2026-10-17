import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";

// No mock of @/lib/secrets here: in a plain browser (node env, no window.masarflow)
// `secretsAvailable()` is false and keys must stay in IndexedDB, exactly as in v0.1.
import { db } from "@/lib/db";
import { aiConnectionsRepo } from "@/lib/db/repos";
import { migrateAiConnectionSecrets } from "@/lib/db/repos/chat-secrets";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("browser mode (no desktop bridge) keeps keys in IndexedDB", () => {
  it("create() writes the key into the row unharmed", async () => {
    const c = await aiConnectionsRepo.create({ providerId: "openai", label: "Main", apiKey: "sk-TEST" });
    expect(c.apiKey).toBe("sk-TEST");
    expect((await db.aiConnections.get(c.id))!.apiKey).toBe("sk-TEST");
    expect((await aiConnectionsRepo.get(c.id))!.apiKey).toBe("sk-TEST");
    expect((await aiConnectionsRepo.list())[0].apiKey).toBe("sk-TEST");
  });
  it("update() writes the key through to the row", async () => {
    const c = await aiConnectionsRepo.create({ providerId: "openai", label: "A", apiKey: "" });
    await aiConnectionsRepo.update(c.id, { apiKey: "sk-TEST" });
    expect((await db.aiConnections.get(c.id))!.apiKey).toBe("sk-TEST");
  });
  it("migration is a no-op without a secret store", async () => {
    await db.aiConnections.add({ id: "legacy", providerId: "x", label: "L", apiKey: "sk-OLD", baseUrl: "", createdAt: 1, updatedAt: 1 });
    expect(await migrateAiConnectionSecrets()).toBe(0);
    expect((await db.aiConnections.get("legacy"))!.apiKey).toBe("sk-OLD");
  });
});
