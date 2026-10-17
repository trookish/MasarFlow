import { describe, it, expect, vi } from "vitest";
import { sendToWindow, type SendTarget } from "@desktop/window-send";

function fakeWindow(opts: { destroyed?: boolean; contentsDestroyed?: boolean; throws?: boolean } = {}) {
  const send = vi.fn(() => {
    // Electron throws this when the webContents is gone between the check and the call.
    if (opts.throws) throw new TypeError("Object has been destroyed");
  });
  const win: SendTarget = {
    isDestroyed: () => Boolean(opts.destroyed),
    webContents: { isDestroyed: () => Boolean(opts.contentsDestroyed), send },
  };
  return { win, send };
}

describe("sendToWindow", () => {
  it("delivers to a live window", () => {
    const { win, send } = fakeWindow();
    expect(sendToWindow(win, "terminal:output", { id: "a" })).toBe(true);
    expect(send).toHaveBeenCalledWith("terminal:output", { id: "a" });
  });

  // The main-process crash: a shell kept printing after the window closed, and
  // `win.webContents.send` threw "Object has been destroyed" as an uncaught exception.
  it("drops the message when the window or its contents are destroyed", () => {
    for (const opts of [{ destroyed: true }, { contentsDestroyed: true }]) {
      const { win, send } = fakeWindow(opts);
      expect(sendToWindow(win, "terminal:output", "x")).toBe(false);
      expect(send).not.toHaveBeenCalled();
    }
    expect(sendToWindow(null, "terminal:output", "x")).toBe(false);
  });

  it("never throws, even if the window dies between the check and the send", () => {
    const { win } = fakeWindow({ throws: true });
    expect(() => sendToWindow(win, "terminal:exit", {})).not.toThrow();
    expect(sendToWindow(win, "terminal:exit", {})).toBe(false);
  });
});
