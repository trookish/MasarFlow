import type {
  AccentMode,
  AppSettings,
  GradientStop,
  LogoBgMode,
  LogoColorMode,
  ThemeMode,
} from "@shared/types";
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

export const GRADIENT_PRESETS: Array<{ name: string; from: string; to: string; angle: number }> = [
  { name: "Aurora", from: "#7c5cfc", to: "#22d3ee", angle: 135 },
  { name: "Sunset", from: "#f43f5e", to: "#f59e0b", angle: 135 },
  { name: "Ocean", from: "#3b82f6", to: "#06b6d4", angle: 135 },
  { name: "Forest", from: "#10b981", to: "#84cc16", angle: 135 },
  { name: "Candy", from: "#d946ef", to: "#f43f5e", angle: 135 },
  { name: "Fire", from: "#f97316", to: "#ef4444", angle: 135 },
  { name: "Twilight", from: "#6366f1", to: "#d946ef", angle: 135 },
  { name: "Mint", from: "#14b8a6", to: "#a3e635", angle: 135 },
];

export const THEME_MODES: Array<{ mode: ThemeMode; label: string }> = [
  { mode: "dark", label: "Dark" },
  { mode: "light", label: "Light" },
  { mode: "amoled", label: "AMOLED" },
  { mode: "system", label: "System" },
];

export const ACCENT_MODE_OPTIONS: Array<{ mode: AccentMode; label: string }> = [
  { mode: "solid", label: "Solid" },
  { mode: "gradient", label: "Gradient" },
];

export const LOGO_COLOR_OPTIONS: Array<{ mode: LogoColorMode; label: string }> = [
  { mode: "original", label: "Original" },
  { mode: "accent", label: "Accent" },
  { mode: "custom", label: "Custom" },
];

export const LOGO_BG_OPTIONS: Array<{ mode: LogoBgMode; label: string }> = [
  { mode: "none", label: "None" },
  { mode: "white", label: "White" },
  { mode: "accent", label: "Accent" },
  { mode: "custom", label: "Custom" },
];

/** Default appearance values (mirror of the main-process defaults). */
export const APPEARANCE_DEFAULTS = {
  theme: "dark" as ThemeMode,
  accentMode: "solid" as AccentMode,
  accent: "#7c5cfc",
  accent2: "#22d3ee",
  gradientStops: [
    { color: "#7c5cfc", position: 0 },
    { color: "#22d3ee", position: 100 },
  ] as GradientStop[],
  gradientAngle: 135,
  radius: 0.625,
  fontScale: 1,
  logoColorMode: "original" as LogoColorMode,
  logoColor: "#7c5cfc",
  logoBgMode: "none" as LogoBgMode,
  logoBgColor: "#ffffff",
};

// ─── Gradient helpers ───────────────────────────────────────────────────────

export function clampPosition(pos: number): number {
  return Math.min(100, Math.max(0, Math.round(pos)));
}

export function normalizeStops(stops: GradientStop[]): GradientStop[] {
  const sorted = [...stops]
    .map((s) => ({
      color: /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color.toLowerCase() : "#7c5cfc",
      position: clampPosition(s.position),
    }))
    .sort((a, b) => a.position - b.position);
  const deduped: GradientStop[] = [];
  for (const s of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && last.position === s.position) deduped[deduped.length - 1] = s;
    else deduped.push(s);
  }
  return deduped.length >= 2
    ? deduped
    : [
        { color: "#7c5cfc", position: 0 },
        { color: "#22d3ee", position: 100 },
      ];
}

export function gradientCss(stops: GradientStop[], angle: number): string {
  const parts = normalizeStops(stops).map((s) => `${s.color} ${s.position}%`);
  return `linear-gradient(${angle}deg, ${parts.join(", ")})`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(124, 92, 252, ${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Whether the current theme resolves to a dark surface. */
export function isDarkTheme(theme: ThemeMode): boolean {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return theme !== "light";
}

/**
 * CSS for the ambient background layer behind the app shell. A soft pair of
 * radial glows tinted by the accent (or gradient) colors, plus a faint
 * linear wash that follows the gradient angle. Adapts to the theme.
 */
export function backgroundCss(settings: AppSettings): string {
  const stops =
    settings.accentMode === "gradient"
      ? normalizeStops(settings.gradientStops)
      : [
          { color: settings.accent, position: 0 },
          { color: settings.accent, position: 100 },
        ];
  const c1 = stops[0].color;
  const c2 = stops[stops.length - 1].color;
  const alpha = isDarkTheme(settings.theme) ? 0.12 : 0.08;
  const layers = [
    `radial-gradient(60rem 42rem at 85% -10%, ${hexToRgba(c1, alpha)}, transparent 60%)`,
    `radial-gradient(52rem 38rem at -10% 110%, ${hexToRgba(c2, alpha)}, transparent 60%)`,
  ];
  if (settings.accentMode === "gradient") {
    layers.push(
      `linear-gradient(${settings.gradientAngle}deg, ${hexToRgba(c1, alpha * 0.5)}, transparent 45%, ${hexToRgba(c2, alpha * 0.5)})`,
    );
  }
  return layers.join(", ");
}

/** Apply the full appearance (theme surface + accent + gradient + scale) to <html>. */
export function applyAppearance(settings: AppSettings): void {
  const root = document.documentElement;
  root.classList.toggle("dark", isDarkTheme(settings.theme));
  root.setAttribute("data-surface", settings.theme === "amoled" ? "amoled" : "default");
  root.setAttribute("data-accent-mode", settings.accentMode);
  root.style.setProperty("--primary", settings.accent);
  root.style.setProperty("--ring", settings.accent);
  root.style.setProperty("--primary-foreground", contrastText(settings.accent));
  root.style.setProperty(
    "--accent-gradient",
    gradientCss(settings.gradientStops, settings.gradientAngle),
  );
  root.style.setProperty("--radius", `${settings.radius}rem`);
  root.style.fontSize = `${settings.fontScale * 100}%`;
}

/** Keep the DOM appearance in sync with the OS color scheme while in system mode. */
export function watchSystemTheme(settings: AppSettings, onChange: (s: AppSettings) => void): () => void {
  if (settings.theme !== "system") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (): void => onChange(settings);
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
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
