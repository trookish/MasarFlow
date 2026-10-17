import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_BINDING, useVaultStore, vaultBindingFor } from "@/lib/stores/vault";

describe("vault binding store", () => {
  beforeEach(() => {
    useVaultStore.setState({ byProject: {} });
  });

  it("falls back to the default binding (nothing is mirrored until the user binds)", () => {
    expect(vaultBindingFor("p1")).toEqual(DEFAULT_BINDING);
    expect(DEFAULT_BINDING.enabled).toBe(false);
    expect(DEFAULT_BINDING.autoImport).toBe(false);
  });

  it("binds per project, with a derived folder and no cross-talk", () => {
    useVaultStore.getState().bind("p1", "C:/vault", "p1");
    useVaultStore.getState().bind("p2", "D:/notes", "p2");
    expect(vaultBindingFor("p1")).toMatchObject({ root: "C:/vault", folder: "MasarFlow/p1", enabled: true });
    expect(vaultBindingFor("p2")).toMatchObject({ root: "D:/notes", folder: "MasarFlow/p2" });
    expect(vaultBindingFor("p3").enabled).toBe(false);
  });

  it("updates flags and unbinds", () => {
    useVaultStore.getState().bind("p1", "C:/vault", "p1");
    useVaultStore.getState().patch("p1", { autoImport: true, enabled: false });
    expect(vaultBindingFor("p1")).toMatchObject({ autoImport: true, enabled: false });
    useVaultStore.getState().unbind("p1");
    expect(vaultBindingFor("p1")).toEqual(DEFAULT_BINDING);
  });

  it("records the last run", () => {
    useVaultStore.getState().bind("p1", "C:/vault", "p1");
    useVaultStore.getState().patch("p1", { lastRunAt: 42, lastSummary: "2 written" });
    expect(vaultBindingFor("p1")).toMatchObject({ lastRunAt: 42, lastSummary: "2 written" });
  });
});
