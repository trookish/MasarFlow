"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect } from "react";
import {
  useThemeStore,
  readableForeground,
  gradientCss,
} from "@/lib/stores/theme";

/**
 * Reads the appearance store and projects it onto the document:
 *  - drives next-themes (light / dark / system; amoled maps to dark + a surface flag)
 *  - sets data-surface / data-accent-mode attributes consumed by globals.css
 *  - writes the live accent, gradient, radius and font-scale CSS variables inline
 */
function AppearanceApplier() {
  const { setTheme } = useTheme();
  const {
    mode,
    accentMode,
    accentColor,
    gradientStops,
    gradientAngle,
    radius,
    fontScale,
  } = useThemeStore();

  // Color scheme → next-themes (amoled is a dark variant).
  useEffect(() => {
    setTheme(mode === "amoled" ? "dark" : mode);
    document.documentElement.dataset.surface =
      mode === "amoled" ? "amoled" : "default";
  }, [mode, setTheme]);

  // Accent, gradient, radius and scale → inline CSS variables on <html>.
  useEffect(() => {
    const root = document.documentElement;
    const fg = readableForeground(accentColor);
    root.style.setProperty("--primary", accentColor);
    root.style.setProperty("--primary-foreground", fg);
    root.style.setProperty("--ring", accentColor);
    root.style.setProperty(
      "--accent-gradient",
      gradientCss(gradientStops, gradientAngle),
    );
    root.dataset.accentMode = accentMode;
    root.style.setProperty("--radius", `${radius}rem`);
    root.style.fontSize = `${fontScale * 100}%`;
  }, [
    accentMode,
    accentColor,
    gradientStops,
    gradientAngle,
    radius,
    fontScale,
  ]);

  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <AppearanceApplier />
      {children}
    </NextThemesProvider>
  );
}
