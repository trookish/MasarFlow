import { describe, expect, it } from "vitest";
import { dockActionFor, type KeyLike } from "@/lib/dock/keymap";

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe("dockActionFor", () => {
  it("Alt+Left/Right cycle tabs, Alt+Shift+arrows move focus", () => {
    expect(dockActionFor(key("ArrowLeft"))).toEqual({ kind: "cycle-tab", dir: -1 });
    expect(dockActionFor(key("ArrowRight"))).toEqual({ kind: "cycle-tab", dir: 1 });
    expect(dockActionFor(key("ArrowLeft", { shiftKey: true }))).toEqual({
      kind: "move-focus",
      dir: "left",
    });
    expect(dockActionFor(key("ArrowUp", { shiftKey: true }))).toEqual({
      kind: "move-focus",
      dir: "up",
    });
    expect(dockActionFor(key("ArrowDown", { shiftKey: true }))).toEqual({
      kind: "move-focus",
      dir: "down",
    });
  });

  it("Alt+F/M/C/W are float / maximize / collapse / close", () => {
    expect(dockActionFor(key("f"))).toEqual({ kind: "float-focused" });
    expect(dockActionFor(key("m"))).toEqual({ kind: "toggle-maximize" });
    expect(dockActionFor(key("c"))).toEqual({ kind: "toggle-collapse" });
    expect(dockActionFor(key("w"))).toEqual({ kind: "close-focused" });
  });

  it("ignores chords that belong to the OS or to the app", () => {
    expect(dockActionFor(key("f", { altKey: false }))).toBeNull();
    expect(dockActionFor(key("f", { ctrlKey: true }))).toBeNull();
    expect(dockActionFor(key("f", { metaKey: true }))).toBeNull();
    expect(dockActionFor(key("ArrowUp"))).toBeNull();
    expect(dockActionFor(key("1"))).toBeNull();
  });
});
