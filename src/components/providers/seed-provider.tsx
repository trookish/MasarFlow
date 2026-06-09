"use client";
import * as React from "react";
import { ensureSeed } from "@/lib/db/seed";

interface SeedState {
  ready: boolean;
  error: string | null;
}

const SeedContext = React.createContext<SeedState>({ ready: false, error: null });

export function SeedProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<SeedState>({ ready: false, error: null });

  React.useEffect(() => {
    let cancelled = false;
    ensureSeed()
      .then(() => {
        if (!cancelled) setState({ ready: true, error: null });
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ ready: false, error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <SeedContext.Provider value={state}>{children}</SeedContext.Provider>;
}

export function useSeedReady() {
  return React.useContext(SeedContext);
}
