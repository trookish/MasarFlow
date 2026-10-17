import { describe, it, expect, vi } from "vitest";
import { createStore } from "zustand/vanilla";

const vault = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/secrets", () => ({
  secretsAvailable: () => true,
  getSecret: async (k: string) => vault.get(k) ?? "",
  setSecret: async (k: string, v: string) => void vault.set(k, v),
  deleteSecret: async (k: string) => void vault.delete(k),
}));
import { bindSecretField } from "@/lib/secrets-binding";

const mk = (pat: string) => createStore<{ pat: string; owner: string }>(() => ({ pat, owner: "o" }));
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("bindSecretField", () => {
  it("migrates a legacy plaintext value into the vault and keeps the store value", async () => {
    vault.clear();
    const s = mk("legacy-token");
    await bindSecretField(s, "pat", "github:pat");
    expect(vault.get("github:pat")).toBe("legacy-token");
    expect(s.getState().pat).toBe("legacy-token");
  });
  it("hydrates an empty store from the vault", async () => {
    vault.clear();
    vault.set("github:pat", "from-vault");
    const s = mk("");
    await bindSecretField(s, "pat", "github:pat");
    expect(s.getState().pat).toBe("from-vault");
  });
  it("mirrors later changes and deletions", async () => {
    vault.clear();
    const s = mk("");
    await bindSecretField(s, "pat", "github:pat");
    s.setState({ pat: "new" });
    await tick();
    expect(vault.get("github:pat")).toBe("new");
    s.setState({ pat: "" });
    await tick();
    expect(vault.has("github:pat")).toBe(false);
  });
});
