import type { P10Settings } from "./app-settings";

export type SessionKind = "run" | "build" | "test" | "setup" | "shell";
export type SessionStatus = "running" | "exited";

export interface SessionInfo {
  id: string;
  label: string;
  kind: SessionKind;
  command: string;
  cwd: string;
  status: SessionStatus;
  exitCode: number | null;
  createdAt: number;
}

export interface StartSessionRequest {
  label: string;
  kind: SessionKind;
  command: string;
  file: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

export interface SessionOutputPayload {
  id: string;
  data: string;
}

export interface SessionExitPayload {
  id: string;
  exitCode: number | null;
}

export type ThemeMode = "light" | "dark" | "amoled" | "system";
export type AccentMode = "solid" | "gradient";
export type LogoColorMode = "original" | "accent" | "custom";
export type LogoBgMode = "none" | "white" | "accent" | "custom";
export type BannerGlowMode = "accent" | "custom";
export type TaskbarDirection = "left" | "bottom" | "right";

export interface GradientStop {
  color: string;
  position: number;
}

export interface AppSettings extends P10Settings {
  targetDir: string;
  /** Set to true after the launcher window is first opened (drives "Welcome back"). */
  hasLaunchedBefore: boolean;
  theme: ThemeMode;
  accentMode: AccentMode;
  accent: string;
  accent2: string;
  gradientStops: GradientStop[];
  gradientAngle: number;
  radius: number;
  fontScale: number;
  logoColorMode: LogoColorMode;
  logoColor: string;
  logoBgMode: LogoBgMode;
  logoBgColor: string;
  bannerColorMode: LogoColorMode;
  bannerColor: string;
  bannerGlowMode: BannerGlowMode;
  bannerGlowColor: string;
  /** Where the nav rail sits: left/right edge, or a floating bottom dock. */
  taskbarDirection: TaskbarDirection;
  /** Taskbar hidden (collapsed) — the topbar toggle / Ctrl+B brings it back. */
  taskbarCollapsed: boolean;
  autoOpenBrowser: boolean;
  fontSize: number;
  /** Check GitHub for updates automatically when the launcher starts. */
  autoCheckUpdates: boolean;
}
