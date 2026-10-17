/** Renderer permissions: deny by default, allow only what the app actually needs. */
const ALLOWED = new Set(["clipboard-sanitized-write", "fullscreen"]);

export function isPermissionAllowed(permission: string): boolean {
  return ALLOWED.has(permission);
}
