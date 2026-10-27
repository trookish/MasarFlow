/** The version shown in the UI and used for git tags (master D11). package.json keeps valid semver. */
export const APP_DISPLAY_VERSION = "0.3.0.0";

/**
 * "0.2.0" | "0.2.0.0" | "v0.2.0-alpha.0" | "0.2.1-3" -> "0.2.0.0" style.
 *
 * The project's build-number convention is `-N` meaning the Nth segment (the
 * deleted launcher's updates.ts documented it): `0.2.1-3` is display version
 * `0.2.1.3`. The dash therefore becomes a dot before the numeric parts are
 * collected; prerelease tags (`-alpha.0`) contribute no numbers and pad to 0.
 */
export function formatDisplayVersion(input: string): string {
  const core = input.trim().replace(/^v/i, "").replace(/-/g, ".");
  const parts = core
    .split(".")
    .map((s) => s.replace(/[^0-9]/g, ""))
    .filter((s) => s.length > 0);
  while (parts.length < 4) parts.push("0");
  return parts.slice(0, 4).join(".");
}

/** True only for exactly four numeric parts. */
export function isDisplayVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(value);
}
