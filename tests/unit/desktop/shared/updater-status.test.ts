import { describe, it, expect } from "vitest";
import {
  isUpdatableBuild,
  allowedPrerelease,
  initialUpdaterStatus,
  reduceUpdaterEvent,
  describeUpdaterStatus,
} from "@desktop-shared/updater-status";

describe("isUpdatableBuild", () => {
  it("refuses dev builds and the portable exe", () => {
    expect(isUpdatableBuild({ packaged: false, portable: false })).toBe(false);
    expect(isUpdatableBuild({ packaged: true, portable: true })).toBe(false);
    expect(isUpdatableBuild({ packaged: true, portable: false })).toBe(true);
  });
});

describe("allowedPrerelease", () => {
  it("maps the update channel to electron-updater's allowPrerelease", () => {
    expect(allowedPrerelease("stable")).toBe(false);
    expect(allowedPrerelease("test")).toBe(true);
  });
});

describe("event reduction", () => {
  it("walks checking -> available -> downloading -> ready, with percent", () => {
    let s = initialUpdaterStatus("0.2.0");
    s = reduceUpdaterEvent(s, { type: "checking" });
    expect(s.phase).toBe("checking");
    s = reduceUpdaterEvent(s, { type: "available", version: "0.2.1" });
    expect(s).toMatchObject({ phase: "available", availableVersion: "0.2.1" });
    s = reduceUpdaterEvent(s, { type: "progress", percent: 42 });
    expect(s).toMatchObject({ phase: "downloading", percent: 42 });
    s = reduceUpdaterEvent(s, { type: "downloaded", version: "0.2.1" });
    expect(s.phase).toBe("ready");
  });
  it("records errors without losing the current version, and is idle-safe", () => {
    const s = reduceUpdaterEvent(initialUpdaterStatus("0.2.0"), { type: "error", message: "getaddrinfo ENOTFOUND" });
    expect(s.phase).toBe("error");
    expect(s.currentVersion).toBe("0.2.0");
    expect(describeUpdaterStatus(s)).toMatch(/try again/i);
  });
  it("says so when there is nothing newer", () => {
    const s = reduceUpdaterEvent(initialUpdaterStatus("0.2.0"), { type: "not-available" });
    expect(s.phase).toBe("current");
    expect(describeUpdaterStatus(s)).toMatch(/up to date/i);
  });
});
