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

export type SetupStepKey =
  | "project"
  | "version"
  | "node"
  | "npm"
  | "python"
  | "deps"
  | "envfile"
  | "venv";

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

/** Result of pulling the latest MasarFlow project code from GitHub. */
export interface ProjectUpdateResult {
  ok: boolean;
  error?: string;
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

export interface DirectoryPickResult {
  path: string;
  ok: boolean;
  reason?: string;
}

export interface GithubCloneResult {
  ok: boolean;
  /** The folder the project lives in (chosen parent + /MasarFlow). */
  dest?: string;
  /** Set when a clone session was actually started (absent = already present). */
  sessionId?: string;
  error?: string;
}

/** Latest commit on the MasarFlow repo's default branch. */
export interface UpdateCommitInfo {
  sha: string;
  message: string;
  date: string;
}

/** Latest published release of the MasarFlow repo (what the setup version check compares against). */
export interface LatestRelease {
  /** Release version (tag without the v prefix). */
  version: string;
  tag: string;
  name: string;
  notes: string;
  url: string;
  publishedAt: string | null;
}

/** Result of a GitHub update check (releases + commits). */
export interface UpdateInfo {
  /** Installed launcher version (app.getVersion()). */
  currentVersion: string;
  /** Latest published release version (tag without the v prefix). */
  latestVersion: string;
  latestTag: string;
  updateAvailable: boolean;
  releaseUrl: string;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string | null;
  latestCommit: UpdateCommitInfo | null;
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
  /** Check GitHub for updates automatically when the launcher starts. */
  autoCheckUpdates: boolean;
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
