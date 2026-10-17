/**
 * Safe main → renderer messaging.
 *
 * Background producers (a shell that keeps printing, the updater) outlive the
 * window: it can be closed, reloaded or torn down while the app quits. Calling
 * `webContents.send` on a destroyed window throws "Object has been destroyed"
 * from an event listener, which Electron shows as an uncaught main-process
 * exception (a modal error dialog). Every push to the renderer goes through here.
 */

/** The slice of BrowserWindow this needs (kept structural so it is unit-testable). */
export interface SendTarget {
  isDestroyed(): boolean;
  webContents: { isDestroyed(): boolean; send(channel: string, ...args: unknown[]): void };
}

/** Sends if the window is alive; returns whether the message was delivered. Never throws. */
export function sendToWindow(win: SendTarget | null | undefined, channel: string, payload: unknown): boolean {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return false;
  try {
    win.webContents.send(channel, payload);
    return true;
  } catch {
    return false; // destroyed between the check and the call
  }
}
