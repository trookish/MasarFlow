import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_MOUNTED_PANELS,
  mountedSet,
  resetMountCap,
  showPanel,
  touch,
} from "@/lib/dock/mount-cap";

describe("studio mount cap", () => {
  beforeEach(() => resetMountCap());

  it("keeps the four most recently shown panels and drops the least recent", () => {
    let lru: string[] = [];
    for (const p of ["/a", "/b", "/c", "/d", "/e"]) lru = touch(lru, p);
    const kept = mountedSet(lru, ["/e"]);
    expect(kept.size).toBe(MAX_MOUNTED_PANELS);
    expect(kept.has("/a")).toBe(false);
    expect([...kept]).toEqual(["/e", "/d", "/c", "/b"]);
  });

  it("re-showing a panel makes it most recent again", () => {
    let lru: string[] = [];
    for (const p of ["/a", "/b", "/c", "/d", "/a", "/e"]) lru = touch(lru, p);
    expect(mountedSet(lru, []).has("/a")).toBe(true);
    expect(mountedSet(lru, []).has("/b")).toBe(false);
  });

  it("never unmounts a visible panel, even past the cap", () => {
    const visible = ["/a", "/b", "/c", "/d", "/e"];
    expect(mountedSet(["/z", ...visible], visible).size).toBe(5);
  });

  it("the live store releases a panel when its group stops showing it", () => {
    const stops = ["/a", "/b", "/c", "/d", "/e"].map((p) => showPanel(p));
    stops.forEach((stop) => stop());
    // all hidden now: only the four most recent stay
    expect(mountedSet(["/e", "/d", "/c", "/b", "/a"], []).has("/a")).toBe(
      false,
    );
  });
});
