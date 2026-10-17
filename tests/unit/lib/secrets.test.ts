import { describe, it, expect, vi, afterEach } from "vitest";
import { getSecret, setSecret, deleteSecret, secretsAvailable, _resetSecretsForTests } from "@/lib/secrets";

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSecretsForTests();
});

describe("secrets without the desktop bridge (browser dev)", () => {
  it("is unavailable and uses an in-memory/localStorage fallback", async () => {
    expect(secretsAvailable()).toBe(false);
    await setSecret("a", "1");
    expect(await getSecret("a")).toBe("1");
    await deleteSecret("a");
    expect(await getSecret("a")).toBe("");
  });
});

describe("secrets with the desktop bridge", () => {
  it("delegates to window.masarflow.secrets", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      masarflow: {
        secrets: {
          available: async () => true,
          get: async (k: string) => store.get(k) ?? "",
          set: async (k: string, v: string) => void store.set(k, v),
          delete: async (k: string) => void store.delete(k),
        },
      },
    });
    _resetSecretsForTests();
    expect(secretsAvailable()).toBe(true);
    await setSecret("github:pat", "tok");
    expect(store.get("github:pat")).toBe("tok");
    expect(await getSecret("github:pat")).toBe("tok");
  });
});
