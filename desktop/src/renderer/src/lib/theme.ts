import type { AppSettings, ThemeMode } from "@shared/types";
import { contrastText } from "./cn";

export const ACCENTS = [
  { name: "Violet", value: "#7c5cfc" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Cyan", value: "#22b8cf" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Emerald", value: "#10b981" },
  { name: "Lime", value: "#84cc16" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Orange", value: "#f97316" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Red", value: "#ef4444" },
  { name: "Fuchsia", value: "#d946ef" },
];

export const THEME_MODES: Array<{ mode: ThemeMode; label: string }> = [
  { mode: "dark", label: "Dark" },
  { mode: "light", label: "Light" },
  { mode: "amoled", label: "AMOLED" },
];

/** Apply the app appearance (theme surface + accent) to <html>. */
export function applyAppearance(settings: AppSettings): void {
  const root = document.documentElement;
  root.classList.toggle("dark", settings.theme !== "light");
  root.setAttribute("data-surface", settings.theme === "amoled" ? "amoled" : "default");
  root.style.setProperty("--primary", settings.accent);
  root.style.setProperty("--ring", settings.accent);
  root.style.setProperty("--primary-foreground", contrastText(settings.accent));
}

export interface XtermPalette {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Build an xterm.js color theme from the current CSS tokens. */
export function xtermTheme(accent: string): XtermPalette {
  return {
    background: cssVar("--background", "#0a0a0c"),
    foreground: cssVar("--foreground", "#e8e8ec"),
    cursor: accent,
    cursorAccent: "#0a0a0c",
    selectionBackground: `${accent}55`,
    black: "#27272d",
    red: "#ef4444",
    green: "#22c55e",
    yellow: "#f59e0b",
    blue: "#3b82f6",
    magenta: "#a78bfa",
    cyan: "#22d3ee",
    white: "#d4d4d8",
    brightBlack: "#52525b",
    brightRed: "#f87171",
    brightGreen: "#4ade80",
    brightYellow: "#fbbf24",
    brightBlue: "#60a5fa",
    brightMagenta: "#c4b5fd",
    brightCyan: "#67e8f9",
    brightWhite: "#fafafa",
  };
}
