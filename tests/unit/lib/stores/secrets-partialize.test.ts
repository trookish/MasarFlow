import { describe, it, expect, vi, afterAll } from "vitest";

const mode = vi.hoisted(() => ({ available: true }));
vi.mock("@/lib/secrets", () => ({
  secretsAvailable: () => mode.available,
  getSecret: async () => "",
  setSecret: async () => {},
  deleteSecret: async () => {},
}));

/** Minimal in-memory Storage so zustand's persist middleware attaches in the node test env. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

vi.stubGlobal("window", { localStorage: memoryStorage() });

// Imported after the storage stub so persist keeps its options (it bails out without storage).
const { useGithub } = await import("@/lib/stores/github");
const { useObsidianStore } = await import("@/lib/stores/obsidian");

afterAll(() => {
  vi.unstubAllGlobals();
});

type Partialize = (state: never) => Record<string, unknown>;

function partializeOf(store: unknown): Partialize {
  const api = store as {
    persist: { getOptions(): { partialize: Partialize } };
  };
  return api.persist.getOptions().partialize;
}

describe("persisted stores keep secrets out of localStorage in desktop mode", () => {
  it("github drops the PAT from the persisted slice when a secret store exists", () => {
    mode.available = true;
    const out = partializeOf(useGithub)({ ...useGithub.getState(), pat: "sk-TEST" } as never);
    expect(out).not.toHaveProperty("pat");
    expect(out.owner).toBe(useGithub.getState().owner);
    expect(out).toHaveProperty("lastSyncedAt");
  });

  it("github still persists the PAT in browser mode (no secret store)", () => {
    mode.available = false;
    const out = partializeOf(useGithub)({ ...useGithub.getState(), pat: "sk-TEST" } as never);
    expect(out.pat).toBe("sk-TEST");
    mode.available = true;
  });

  it("obsidian drops the API key from the persisted slice when a secret store exists", () => {
    mode.available = true;
    const out = partializeOf(useObsidianStore)({
      ...useObsidianStore.getState(),
      apiKey: "sk-TEST",
    } as never);
    expect(out).not.toHaveProperty("apiKey");
    expect(out.baseUrl).toBe("https://127.0.0.1:27124");
  });

  it("obsidian still persists the API key in browser mode (no secret store)", () => {
    mode.available = false;
    const out = partializeOf(useObsidianStore)({
      ...useObsidianStore.getState(),
      apiKey: "sk-TEST",
    } as never);
    expect(out.apiKey).toBe("sk-TEST");
    mode.available = true;
  });
});
