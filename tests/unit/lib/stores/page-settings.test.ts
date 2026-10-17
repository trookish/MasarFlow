import { describe, it, expect } from "vitest";

/**
 * A tiny in-memory `localStorage` so zustand's persist middleware can hydrate
 * in the node test environment. Defined before the store module is imported:
 * persist resolves the storage when `createJSONStorage` runs.
 */
function installLocalStorage(): Map<string, string> {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
  return map;
}

describe("usePageSettings persistence", () => {
  it("maps a persisted legacy defaultBackend (opencode) to api on hydration", async () => {
    const storage = installLocalStorage();
    storage.set(
      "masarflow-page-settings",
      JSON.stringify({
        state: { chat: { defaultBackend: "opencode", density: "compact" } },
        version: 0,
      }),
    );

    const { usePageSettings } = await import("@/lib/stores/page-settings");
    await usePageSettings.persist.rehydrate();

    const chat = usePageSettings.getState().chat;
    expect(chat.defaultBackend).toBe("api");
    // Persisted values survive the migration…
    expect(chat.density).toBe("compact");
    // …and fields old states never had fall back to the current defaults.
    expect(chat.fallbacks).toEqual([]);
    expect(chat.codeHighlighting).toBe(true);
  });
});
