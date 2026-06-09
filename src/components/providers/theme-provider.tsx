"use client";
import * as React from "react";
import { useUi, ACCENTS, type AccentColor } from "@/lib/stores/ui";

export function ThemeApplier({ children }: { children: React.ReactNode }) {
  const theme = useUi((s) => s.theme);
  const accent = useUi((s) => s.accent);
  const font = useUi((s) => s.font);

  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else if (theme === "light") root.classList.remove("dark");
    else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    }
  }, [theme]);

  React.useEffect(() => {
    const root = document.documentElement;
    const data = ACCENTS[accent];
    root.style.setProperty("--accent-hue", String(data.hue));
  }, [accent]);

  React.useEffect(() => {
    const root = document.documentElement;
    const fontMap: Record<string, string> = {
      inter: "var(--font-sans)",
      geist: "var(--font-sans)",
      system: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    };
    root.style.setProperty("--font-sans-active", fontMap[font] ?? "var(--font-sans)");
  }, [font]);

  return <>{children}</>;
}

export const ACCENT_OPTIONS: AccentColor[] = ["violet", "cyan", "emerald", "amber", "rose", "sky"];
