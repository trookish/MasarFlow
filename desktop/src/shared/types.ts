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

export type SetupStepKey = "node" | "npm" | "python" | "deps" | "envfile" | "venv";

export type StepStatus = "pass" | "fail" | "missing" | "running" | "pending";

export interface SetupStep {
  key: SetupStepKey;
  label: string;
  description: string;
  status: StepStatus;
  detail?: string;
}

export interface SetupState {
  targetDir: string;
  initialized: boolean;
  steps: SetupStep[];
}

export type EnvFieldKind = "text" | "url" | "port" | "boolean" | "secret" | "path" | "ms";

export interface EnvField {
  key: string;
  value: string;
  active: boolean;
  description: string;
  kind: EnvFieldKind;
}

export interface EnvData {
  path: string;
  content: string;
  fields: EnvField[];
}

export interface SaveEnvResult {
  ok: boolean;
  error?: string;
}

export type ThemeMode = "light" | "dark" | "amoled" | "system";
export type AccentMode = "solid" | "gradient";
export type LogoColorMode = "original" | "accent" | "custom";
export type LogoBgMode = "none" | "white" | "accent" | "custom";
export type BannerGlowMode = "accent" | "custom";

export interface GradientStop {
  color: string;
  position: number;
}

export interface AppSettings {
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
  autoOpenBrowser: boolean;
  fontSize: number;
}

export interface ServerStatus {
  app: boolean;
  python: boolean;
  appPort: number;
  pythonPort: number;
}

export interface TestDefinition {
  key: string;
  name: string;
  description: string;
  command: string;
  hint?: string;
  /** Override how the command is spawned (e.g. the venv python for pytest). */
  run?: { file: string; args: string[]; cwd: string };
}

export interface TestRunResult {
  key: string;
  sessionId: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
}
