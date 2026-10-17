import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Desktop mode: the secret store is a main-process IPC call, which resolves
// outside Dexie's transaction zone. A setTimeout reproduces that boundary.
vi.mock("@/lib/secrets", () => ({
  secretsAvailable: () => true,
  getSecret: () => new Promise<string | null>((r) => setTimeout(() => r(null), 5)),
  setSecret: () => new Promise<void>((r) => setTimeout(r, 5)),
  deleteSecret: () => new Promise<void>((r) => setTimeout(r, 5)),
}));

import { db } from "@/lib/db";
import { seedDemoProject } from "@/lib/db/demo-seed";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("seedDemoProject with the desktop secret store", () => {
  it("seeds all three demo projects when reading a key crosses an IPC boundary", async () => {
    await seedDemoProject();
    expect(await db.projects.count()).toBe(3);
    expect(await db.chatThreads.count()).toBeGreaterThanOrEqual(3);
    expect(await db.aiConnections.count()).toBe(1);
  });
});
