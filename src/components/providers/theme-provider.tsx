"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useEffect } from "react";
import { useThemeStore } from "@/lib/stores/theme";

/** Syncs the persisted accent into a `data-accent` attribute on <html>. */
function AccentApplier() {
  const accent = useThemeStore((s) => s.accent);
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);
  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <AccentApplier />
      {children}
    </NextThemesProvider>
  );
}
