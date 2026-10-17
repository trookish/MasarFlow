export type UpdateChannel = "stable" | "test";

export type UpdaterPhase = "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "error" | "disabled";

export interface UpdaterStatus {
  phase: UpdaterPhase;
  currentVersion: string;
  availableVersion: string | null;
  percent: number;
  message: string | null;
  /** Reason the updater is off, when phase === "disabled". */
  disabledReason: string | null;
}

export type UpdaterEvent =
  | { type: "checking" }
  | { type: "not-available" }
  | { type: "available"; version: string }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string }
  | { type: "disabled"; reason: string };

/** Auto-update needs an installed (NSIS) build: not a dev run, not the portable exe. */
export function isUpdatableBuild(input: { packaged: boolean; portable: boolean }): boolean {
  return input.packaged && !input.portable;
}

export function allowedPrerelease(channel: UpdateChannel): boolean {
  return channel === "test";
}

export function initialUpdaterStatus(currentVersion: string): UpdaterStatus {
  return { phase: "idle", currentVersion, availableVersion: null, percent: 0, message: null, disabledReason: null };
}

export function reduceUpdaterEvent(status: UpdaterStatus, event: UpdaterEvent): UpdaterStatus {
  switch (event.type) {
    case "checking":
      return { ...status, phase: "checking", message: null };
    case "not-available":
      return { ...status, phase: "current", availableVersion: null, percent: 0 };
    case "available":
      return { ...status, phase: "available", availableVersion: event.version, percent: 0 };
    case "progress":
      return { ...status, phase: "downloading", percent: Math.max(0, Math.min(100, Math.round(event.percent))) };
    case "downloaded":
      return { ...status, phase: "ready", availableVersion: event.version, percent: 100 };
    case "error":
      return { ...status, phase: "error", message: event.message };
    case "disabled":
      return { ...status, phase: "disabled", disabledReason: event.reason };
  }
}

export function describeUpdaterStatus(status: UpdaterStatus): string {
  switch (status.phase) {
    case "idle":
      return "Not checked yet.";
    case "checking":
      return "Checking for updates…";
    case "current":
      return "MasarFlow is up to date.";
    case "available":
      return `Version ${status.availableVersion} is available.`;
    case "downloading":
      return `Downloading… ${status.percent}%`;
    case "ready":
      return `Version ${status.availableVersion} is ready — restart to install, or it installs when you quit.`;
    case "error":
      return `Could not check for updates (${status.message ?? "unknown error"}). MasarFlow will try again when it next starts.`;
    case "disabled":
      return status.disabledReason ?? "Updates are unavailable in this build.";
  }
}
