/** URLs the main window may stay on. Everything else is blocked or sent to the OS browser. */
export function isInternalUrl(raw: string, devOrigin?: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol === "masarflow:" && u.host === "app") return true;
    if (devOrigin) return u.origin === new URL(devOrigin).origin;
    return false;
  } catch {
    return false;
  }
}

/** Only http(s) and mailto may be handed to the OS. */
export function isSafeExternalUrl(raw: string): boolean {
  try {
    const p = new URL(raw).protocol;
    return p === "https:" || p === "http:" || p === "mailto:";
  } catch {
    return false;
  }
}
