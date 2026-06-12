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
    const timeout = setTimeout(() => {
      if (!cancelled) {
        console.warn("ensureSeed timeout - forcing ready");
        setState({ ready: true, error: null });
      }
    }, 8000);
    (async () => {
      try {
        await ensureSeed();
        clearTimeout(timeout);
        if (cancelled) return;
        setState({ ready: true, error: null });
        try {
          const m = await import("@/lib/automation/engine");
          m.startAutomation(30000);
        } catch (e) {
          console.warn("automation start failed", e);
        }
      } catch (e) {
        clearTimeout(timeout);
        if (cancelled) return;
        console.error("ensureSeed failed", e);
        setState({ ready: false, error: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <SeedContext.Provider value={state}>{children}</SeedContext.Provider>;
}

export function useSeedReady() {
  return React.useContext(SeedContext);
}
