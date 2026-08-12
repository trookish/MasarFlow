import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { AppSettings } from "@shared/types";

const ACCENTS = [
  "#dedede",
  "#7c5cfc",
  "#6366f1",
  "#3b82f6",
  "#22b8cf",
  "#14b8a6",
  "#10b981",
  "#84cc16",
  "#f59e0b",
  "#f97316",
  "#f43f5e",
  "#ef4444",
  "#d946ef",
];

function defaultTargetDir(): string {
  // The portable exe extracts itself to %TEMP% at launch; PORTABLE_EXECUTABLE_DIR
  // points back at the folder the exe actually lives in (e.g. the repo's release/).
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) {
    const found = findMasarFlowRoot(portableDir);
    if (found) return found;
  }
  // Dev: app path = desktop/ → parent is the MasarFlow repo root.
  // Packaged (win-unpacked / NSIS): app.asar sits in <...>/resources/ → up two levels.
  const appPath = app.getAppPath();
  const start = app.isPackaged ? resolve(appPath, "..", "..") : resolve(appPath, "..");
  return findMasarFlowRoot(start) ?? start;
}

/** Walk up from `dir` until a package.json named "masarflow" is found. */
function findMasarFlowRoot(dir: string): string | null {
  let cursor = dir;
  for (let i = 0; i < 6; i++) {
    const pkg = join(cursor, "package.json");
    if (existsSync(pkg)) {
      try {
        const name = (JSON.parse(readFileSync(pkg, "utf8")) as { name?: string }).name;
        if (name === "masarflow") return cursor;
      } catch {
        // keep walking
      }
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}

function defaultSettings(): AppSettings {
  return {
    targetDir: defaultTargetDir(),
    hasLaunchedBefore: false,
    theme: "dark",
    accentMode: "solid",
    accent: ACCENTS[0],
    accent2: "#22d3ee",
    gradientStops: [
      { color: ACCENTS[0], position: 0 },
      { color: "#22d3ee", position: 100 },
    ],
    gradientAngle: 135,
    radius: 0.625,
    fontScale: 1,
    logoColorMode: "original",
    logoColor: ACCENTS[0],
    logoBgMode: "accent",
    logoBgColor: "#ffffff",
    bannerColorMode: "original",
    bannerColor: ACCENTS[0],
    bannerGlowMode: "accent",
    bannerGlowColor: ACCENTS[0],
    autoOpenBrowser: true,
    fontSize: 13,
    autoCheckUpdates: true,
  };
}

class SettingsStore {
  private data: AppSettings = defaultSettings();
  private file = "";

  init(): void {
    this.file = join(app.getPath("userData"), "launcher-settings.json");
    try {
      if (existsSync(this.file)) {
        const raw = JSON.parse(readFileSync(this.file, "utf8")) as Partial<AppSettings>;
        this.data = { ...defaultSettings(), ...raw };
      }
    } catch {
      // corrupted file — fall back to defaults
    }
  }

  get(): AppSettings {
    return { ...this.data };
  }

  set(patch: Partial<AppSettings>): AppSettings {
    this.data = { ...this.data, ...patch };
    this.persist();
    return this.get();
  }

  /** Remember that the launcher has been opened at least once. */
  markLaunched(): void {
    if (this.data.hasLaunchedBefore) return;
    this.data.hasLaunchedBefore = true;
    this.persist();
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.data, null, 2), "utf8");
    } catch {
      // best effort
    }
  }
}

export const settings = new SettingsStore();
export { ACCENTS };
