/** The six first-run steps, in order (P10.T4 renders one component per id). */
export const WIZARD_STEPS = ["welcome", "project", "folder", "provider", "migrate", "finish"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface WizardProgress {
  /** A project exists (created here or already on disk in IndexedDB) and is active. */
  projectReady: boolean;
  /** A folder was linked through the native picker (or an existing link was accepted). */
  folderLinked: boolean;
  /** A provider was chosen (a connection row exists) — a key is NOT required. */
  providerChosen: boolean;
  /** The user visited the migrate step (imported or explicitly skipped). */
  migrationSeen: boolean;
}

export interface WizardContext {
  /** False in a plain browser (pnpm dev) and during SSR. */
  desktop: boolean;
  /** From main-process settings; null = never completed. */
  completedAt: string | null;
  projectCount: number;
  /** `?setup=1` — used by the Control Center button and by e2e. */
  forced: boolean;
}

export function emptyProgress(): WizardProgress {
  return { projectReady: false, folderLinked: false, providerChosen: false, migrationSeen: false };
}

/** Show the wizard exactly once per install, and only where it can act. */
export function shouldShowWizard(ctx: WizardContext): boolean {
  if (ctx.forced) return true;
  if (!ctx.desktop) return false;
  if (ctx.completedAt !== null) return false;
  return ctx.projectCount === 0;
}

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}

export function nextStep(step: WizardStep): WizardStep | null {
  return WIZARD_STEPS[stepIndex(step) + 1] ?? null;
}

export function previousStep(step: WizardStep): WizardStep | null {
  return stepIndex(step) > 0 ? WIZARD_STEPS[stepIndex(step) - 1] : null;
}

export function canAdvance(step: WizardStep, progress: WizardProgress): boolean {
  switch (step) {
    case "project":
      return progress.projectReady;
    default:
      return true; // every other step is either informational or skippable
  }
}

export function canSkip(step: WizardStep): boolean {
  return step === "folder" || step === "provider" || step === "migrate";
}
