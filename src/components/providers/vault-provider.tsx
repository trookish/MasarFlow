"use client";
import * as React from "react";
import { useVault } from "@/lib/stores/vault";
import { SetupWizard } from "@/components/vault/setup-wizard";

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const init = useVault((s) => s.init);
  React.useEffect(() => { void init(); }, [init]);
  return (
    <>
      {children}
      <SetupWizard />
    </>
  );
}
