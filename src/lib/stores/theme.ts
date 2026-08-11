import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Color-scheme mode. `amoled` is dark with pure-black surfaces; `system` follows the OS. */
export type ThemeMode = "light" | "dark" | "amoled" | "system";

/** How the primary accent is painted: a flat color, or a multi-stop gradient. */
export type AccentMode = "solid" | "gradient";

/** How the brand logo is tinted. `original` shows the source PNG untouched. */
export type LogoColorMode = "original" | "accent" | "custom";

/** Background fill behind the brand logo. */
export type LogoBgMode = "none" | "white" | "accent" | "custom";

/** One color stop in a custom gradient (position 0–100). */
export interface GradientStop {
  color: string;
  position: number;
}

export interface AccentPreset {
  name: string;
  color: string;
}

export interface GradientPreset {
  name: string;
  from: string;
  to: string;
  angle: number;
}

/** Clamp a gradient stop position into 0–100. */
export function clampPosition(pos: number): number {
  return Math.min(100, Math.max(0, Math.round(pos)));
}

/** Sort stops by position, clamp positions, dedupe overlapping stops. */
export function normalizeStops(stops: GradientStop[]): GradientStop[] {
  const sorted = [...stops]
    .map((s) => ({
      color: /^#[0-9a-fA-F]{6}$/.test(s.color)
        ? s.color.toLowerCase()
        : "#dedede",
      position: clampPosition(s.position),
    }))
    .sort((a, b) => a.position - b.position);
  // When two stops share a position, keep the later one (it wins visually).
  const deduped: GradientStop[] = [];
  for (const s of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && last.position === s.position) deduped[deduped.length - 1] = s;
    else deduped.push(s);
  }
  return deduped.length >= 2
    ? deduped
    : [
        { color: "#dedede", position: 0 },
        { color: "#22d3ee", position: 100 },
      ];
}

/** The CSS value for `background-image` built from stops + angle. */
export function gradientCss(stops: GradientStop[], angle: number): string {
  const parts = normalizeStops(stops).map((s) => `${s.color} ${s.position}%`);
  return `linear-gradient(${angle}deg, ${parts.join(", ")})`;
}

// ─── Presets ────────────────────────────────────────────────────────────────

/** Solid accent swatches offered in the picker. Any hex is also allowed. */
export const ACCENT_PRESETS: AccentPreset[] = [
  { name: "White", color: "#dedede" },
  { name: "Violet", color: "#7c5cfc" },
  { name: "Indigo", color: "#6366f1" },
  { name: "Blue", color: "#3b82f6" },
  { name: "Cyan", color: "#22b8cf" },
  { name: "Teal", color: "#14b8a6" },
  { name: "Emerald", color: "#10b981" },
  { name: "Lime", color: "#84cc16" },
  { name: "Amber", color: "#f59e0b" },
  { name: "Orange", color: "#f97316" },
  { name: "Rose", color: "#f43f5e" },
  { name: "Red", color: "#ef4444" },
  { name: "Fuchsia", color: "#d946ef" },
];

/** Ready-made gradients. Selecting one fills accentColor/accentColor2/gradientAngle. */
export const GRADIENT_PRESETS: GradientPreset[] = [
  { name: "Aurora", from: "#dedede", to: "#22d3ee", angle: 135 },
  { name: "Sunset", from: "#f43f5e", to: "#f59e0b", angle: 135 },
  { name: "Ocean", from: "#3b82f6", to: "#06b6d4", angle: 135 },
  { name: "Forest", from: "#10b981", to: "#84cc16", angle: 135 },
  { name: "Candy", from: "#d946ef", to: "#f43f5e", angle: 135 },
  { name: "Fire", from: "#f97316", to: "#ef4444", angle: 135 },
  { name: "Twilight", from: "#6366f1", to: "#d946ef", angle: 135 },
  { name: "Mint", from: "#14b8a6", to: "#a3e635", angle: 135 },
];

// ─── Defaults ───────────────────────────────────────────────────────────────

export const APPEARANCE_DEFAULTS = {
  mode: "dark" as ThemeMode,
  accentMode: "solid" as AccentMode,
  accentColor: "#dedede",
  accentColor2: "#22d3ee",
  /** The gradient's color stops (source of truth for gradient mode). */
  gradientStops: [
    { color: "#dedede", position: 0 },
    { color: "#22d3ee", position: 100 },
  ] as GradientStop[],
  gradientAngle: 135,
  /** Corner radius in rem. */
  radius: 0.625,
  /** Root font-size multiplier (UI scale). */
  fontScale: 1,
  /** Brand logo tint: keep the source PNG, follow the accent, or a custom hex. */
  logoColorMode: "original" as LogoColorMode,
  logoColor: "#dedede",
  /** Background fill behind the logo. */
  logoBgMode: "white" as LogoBgMode,
  logoBgColor: "#ffffff",
};

// ─── Store ──────────────────────────────────────────────────────────────────

interface ThemeState {
  mode: ThemeMode;
  accentMode: AccentMode;
  accentColor: string;
  accentColor2: string;
  gradientStops: GradientStop[];
  gradientAngle: number;
  radius: number;
  fontScale: number;
  logoColorMode: LogoColorMode;
  logoColor: string;
  logoBgMode: LogoBgMode;
  logoBgColor: string;
  setMode: (mode: ThemeMode) => void;
  setAccentMode: (m: AccentMode) => void;
  setAccentColor: (hex: string) => void;
  setAccentColor2: (hex: string) => void;
  setGradientStops: (stops: GradientStop[]) => void;
  setGradientAngle: (deg: number) => void;
  setRadius: (rem: number) => void;
  setFontScale: (scale: number) => void;
  setLogoColorMode: (m: LogoColorMode) => void;
  setLogoColor: (hex: string) => void;
  setLogoBgMode: (m: LogoBgMode) => void;
  setLogoBgColor: (hex: string) => void;
  applyGradientPreset: (p: GradientPreset) => void;
  reset: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      ...APPEARANCE_DEFAULTS,
      setMode: (mode) => set({ mode }),
      setAccentMode: (accentMode) => set({ accentMode }),
      setAccentColor: (accentColor) =>
        set((s) => ({
          accentColor,
          // Gradient mode: keep the first stop in sync with the solid color.
          gradientStops:
            s.accentMode === "gradient"
              ? s.gradientStops.map((st, i) =>
                  i === 0 ? { ...st, color: accentColor } : st,
                )
              : s.gradientStops,
        })),
      setAccentColor2: (accentColor2) =>
        set((s) => ({
          accentColor2,
          gradientStops:
            s.accentMode === "gradient"
              ? s.gradientStops.map((st, i, arr) =>
                  i === arr.length - 1 ? { ...st, color: accentColor2 } : st,
                )
              : s.gradientStops,
        })),
      setGradientStops: (gradientStops) =>
        set((s) => {
          const stops = normalizeStops(gradientStops);
          return {
            gradientStops: stops,
            accentColor: stops[0].color,
            accentColor2: stops[stops.length - 1].color,
            accentMode: s.accentMode === "gradient" ? s.accentMode : "gradient",
          };
        }),
      setGradientAngle: (gradientAngle) => set({ gradientAngle }),
      setRadius: (radius) => set({ radius }),
      setFontScale: (fontScale) => set({ fontScale }),
      setLogoColorMode: (logoColorMode) => set({ logoColorMode }),
      setLogoColor: (logoColor) => set({ logoColor }),
      setLogoBgMode: (logoBgMode) => set({ logoBgMode }),
      setLogoBgColor: (logoBgColor) => set({ logoBgColor }),
      applyGradientPreset: (p) =>
        set({
          accentMode: "gradient",
          accentColor: p.from,
          accentColor2: p.to,
          gradientStops: [
            { color: p.from, position: 0 },
            { color: p.to, position: 100 },
          ],
          gradientAngle: p.angle,
        }),
      reset: () => set({ ...APPEARANCE_DEFAULTS }),
    }),
    {
      name: "masarflow-theme",
      version: 2,
      // Older persisted state predates gradientStops — derive it from the
      // two legacy color fields instead of leaving the gradient broken.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ThemeState>;
        if (!p.gradientStops) {
          const from = p.accentColor ?? current.accentColor;
          const to = p.accentColor2 ?? current.accentColor2;
          return {
            ...current,
            ...p,
            gradientStops: normalizeStops([
              { color: from, position: 0 },
              { color: to, position: 100 },
            ]),
          };
        }
        return { ...current, ...p };
      },
    },
  ),
);

// ─── Color helpers ──────────────────────────────────────────────────────────

/** Parse a #rgb/#rrggbb string into [r,g,b] (0-255), or null if invalid. */
export function parseHex(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Pick black or white foreground for best contrast on the given background hex. */
export function readableForeground(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return "#ffffff";
  // Relative luminance (sRGB, simplified).
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.45 ? "#0a0a0c" : "#ffffff";
}
