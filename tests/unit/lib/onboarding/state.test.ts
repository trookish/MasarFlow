import { describe, it, expect } from "vitest";
import {
  WIZARD_STEPS,
  shouldShowWizard,
  canAdvance,
  canSkip,
  nextStep,
  previousStep,
  emptyProgress,
  type WizardContext,
} from "@/lib/onboarding/state";
import { basenameOf } from "@/lib/onboarding/actions";

const ctx = (over: Partial<WizardContext> = {}): WizardContext => ({
  desktop: true,
  completedAt: null,
  projectCount: 0,
  forced: false,
  ...over,
});

describe("shouldShowWizard", () => {
  it("shows once on a fresh desktop install", () => {
    expect(shouldShowWizard(ctx())).toBe(true);
  });
  it("never shows again after it was finished", () => {
    expect(shouldShowWizard(ctx({ completedAt: "2026-10-20T00:00:00.000Z" }))).toBe(false);
    expect(shouldShowWizard(ctx({ completedAt: "2026-10-20T00:00:00.000Z", forced: true }))).toBe(true);
  });
  it("does not nag a user who already has projects (imported data, demo seed)", () => {
    expect(shouldShowWizard(ctx({ projectCount: 3 }))).toBe(false);
  });
  it("stays out of the browser build unless explicitly forced", () => {
    expect(shouldShowWizard(ctx({ desktop: false }))).toBe(false);
    expect(shouldShowWizard(ctx({ desktop: false, forced: true }))).toBe(true);
  });
});

describe("steps", () => {
  it("walks welcome -> finish and back", () => {
    expect(WIZARD_STEPS[0]).toBe("welcome");
    expect(WIZARD_STEPS[WIZARD_STEPS.length - 1]).toBe("finish");
    expect(nextStep("welcome")).toBe("project");
    expect(previousStep("project")).toBe("welcome");
    expect(nextStep("finish")).toBeNull();
    expect(previousStep("welcome")).toBeNull();
  });
  it("blocks only the steps that need an action", () => {
    const p = emptyProgress();
    expect(canAdvance("welcome", p)).toBe(true);
    expect(canAdvance("project", p)).toBe(false);
    expect(canAdvance("project", { ...p, projectReady: true })).toBe(true);
    expect(canAdvance("folder", p)).toBe(true); // skippable: a project can be linked later
    expect(canAdvance("provider", p)).toBe(true); // "add a key later" is a first-class path
    expect(canAdvance("migrate", p)).toBe(true);
    expect(canSkip("welcome")).toBe(false);
    expect(canSkip("folder")).toBe(true);
    expect(canSkip("migrate")).toBe(true);
  });
});

describe("basenameOf", () => {
  it("handles trailing slashes, drives and POSIX roots", () => {
    expect(basenameOf("C:\\Users\\trookish\\Dev\\MyGame\\")).toBe("MyGame");
    expect(basenameOf("/home/trookish/projects/app")).toBe("app");
    expect(basenameOf("C:\\")).toBe("");
    expect(basenameOf("")).toBe("");
  });
});
