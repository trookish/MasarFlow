/** The three settings P10 owns. They live in `AppSettings` (desktop/src/shared/types.ts) too. */
export interface P10Settings {
  /** R6: hide to the tray instead of quitting on window close. Default OFF. */
  closeToTray: boolean;
  /** ISO timestamp set by the first-run wizard; null = show it again. */
  onboardingCompletedAt: string | null;
  /** "test" maps to electron-updater's allowPrerelease (T10). */
  updateChannel: "stable" | "test";
}

export const P10_SETTING_DEFAULTS: P10Settings = {
  closeToTray: false,
  onboardingCompletedAt: null,
  updateChannel: "stable",
};

/**
 * Merge a renderer-supplied patch into the current settings.
 * Unknown keys and wrong types are ignored (never throw): the renderer is a
 * less-trusted surface than main, and a bad patch must not lock the app out of
 * its settings file.
 */
export function applySettingsPatch<T extends P10Settings>(current: T, patch: unknown): T {
  if (typeof patch !== "object" || patch === null) return current;
  const p = patch as Record<string, unknown>;
  const next: T = { ...current };
  if (typeof p.closeToTray === "boolean") next.closeToTray = p.closeToTray;
  if (p.onboardingCompletedAt === null || typeof p.onboardingCompletedAt === "string") {
    next.onboardingCompletedAt = p.onboardingCompletedAt as string | null;
  }
  if (p.updateChannel === "stable" || p.updateChannel === "test") next.updateChannel = p.updateChannel;
  return next;
}
