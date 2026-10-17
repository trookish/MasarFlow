import { describe, it, expect } from "vitest";
import { closeBehavior } from "@desktop-shared/window-behavior";

describe("closeBehavior", () => {
  it("quits by default (fresh installs must not hide into the tray — R6)", () => {
    expect(closeBehavior({ closeToTray: false, quitting: false })).toBe("quit");
  });
  it("hides only when the user asked for it", () => {
    expect(closeBehavior({ closeToTray: true, quitting: false })).toBe("hide");
  });
  it("always quits during shutdown, whatever the preference says", () => {
    expect(closeBehavior({ closeToTray: true, quitting: true })).toBe("quit");
  });
});
