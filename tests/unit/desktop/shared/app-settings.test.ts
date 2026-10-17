import { describe, it, expect } from "vitest";
import { applySettingsPatch, type P10Settings } from "@desktop-shared/app-settings";

const base = (): P10Settings => ({
  closeToTray: false,
  onboardingCompletedAt: null,
  updateChannel: "stable",
});

describe("applySettingsPatch", () => {
  it("applies known keys with the right types", () => {
    expect(applySettingsPatch(base(), { closeToTray: true })).toEqual({ ...base(), closeToTray: true });
    expect(applySettingsPatch(base(), { onboardingCompletedAt: "2026-10-20T08:00:00.000Z" }).onboardingCompletedAt).toBe(
      "2026-10-20T08:00:00.000Z",
    );
    expect(applySettingsPatch(base(), { updateChannel: "test" }).updateChannel).toBe("test");
  });
  it("ignores unknown keys and wrong types instead of throwing", () => {
    const next = applySettingsPatch(base(), { closeToTray: "yes", nope: 1, updateChannel: "beta" });
    expect(next).toEqual(base());
  });
  it("accepts an explicit null to re-arm the wizard", () => {
    const done = applySettingsPatch(base(), { onboardingCompletedAt: "x" });
    expect(applySettingsPatch(done, { onboardingCompletedAt: null }).onboardingCompletedAt).toBeNull();
  });
  it("never mutates the input and tolerates a non-object patch", () => {
    const before = base();
    expect(applySettingsPatch(before, null)).toEqual(before);
    expect(applySettingsPatch(before, "nope")).toEqual(before);
    expect(before).toEqual(base());
  });
});
