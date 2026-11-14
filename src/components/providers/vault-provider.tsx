"use client";
import * as React from "react";
import { useVault } from "@/lib/stores/vault";
import { SetupWizard } from "@/components/vault/setup-wizard";

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const init = useVault((s) => s.init);
  const verifyConnection = useVault((s) => s.verifyConnection);
  const reconnect = useVault((s) => s.reconnect);
  const settings = useVault((s) => s.settings);

  React.useEffect(() => {
    void init();
  }, [init]);

  React.useEffect(() => {
    const isVaultMode =
      settings.mode === "obsidian" ||
      settings.mode === "opfs" ||
      settings.mode === "legacy-fallback";
    if (!isVaultMode) return;

    const handleVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      const health = await verifyConnection();
      if (health === "connected") return;
      if (health === "needs-reauth" && settings.backend === "native-fsa") {
        await reconnect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [settings.mode, settings.backend, verifyConnection, reconnect]);

  return (
    <>
      {children}
      <SetupWizard />
    </>
  );
}
