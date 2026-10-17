"use client";

import { useCallback, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { getDesktop } from "@/lib/desktop/bridge";
import { projectsRepo } from "@/lib/db/repos";
import { useProjectStore } from "@/lib/stores/project";
import {
  WIZARD_STEPS,
  canAdvance,
  canSkip,
  emptyProgress,
  nextStep,
  previousStep,
  stepIndex,
  type WizardProgress,
  type WizardStep,
} from "@/lib/onboarding/state";
import { Button } from "@/components/ui/button";
import { WelcomeStep, ProjectStep, FolderStep, ProviderStep, MigrateStep, FinishStep } from "./steps";

/** Set from main-process settings on finish/skip; null re-arms the wizard. */
async function finish(onDone: () => void): Promise<void> {
  const d = getDesktop();
  if (d) await d.settings.set({ onboardingCompletedAt: new Date().toISOString() });
  onDone();
}

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const desktop = getDesktop();
  const [step, setStep] = useState<WizardStep>("welcome");
  const [progress, setProgress] = useState<WizardProgress>(emptyProgress);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);
  const projectCount = useLiveQuery(() => projectsRepo.count(), []) ?? 0;

  const update = useCallback((patch: Partial<WizardProgress>) => setProgress((p) => ({ ...p, ...patch })), []);

  // An existing project (imported data, demo seed) satisfies the project step.
  // Derived during render, not in an effect: the repo lints set-state-in-effect
  // as an error and this is plain derived state.
  const projectReady = progress.projectReady || (Boolean(activeProjectId) && projectCount > 0);
  const effective: WizardProgress = projectReady === progress.projectReady ? progress : { ...progress, projectReady };

  const body = {
    welcome: <WelcomeStep />,
    project: <ProjectStep progress={effective} update={update} setActiveProjectId={setActiveProjectId} />,
    folder: <FolderStep projectId={activeProjectId} progress={effective} update={update} />,
    provider: <ProviderStep progress={effective} update={update} />,
    migrate: <MigrateStep progress={effective} update={update} />,
    finish: <FinishStep />,
  }[step];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-6 backdrop-blur" role="dialog" aria-label="Set up MasarFlow">
      <div className="flex w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
        <ol className="flex items-center gap-2 border-b border-border px-6 py-4 text-xs text-muted-foreground">
          {WIZARD_STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-1 ${i === stepIndex(step) ? "text-foreground" : ""}`}>
              {i < stepIndex(step) ? <Check className="size-3" /> : null}
              <span className="capitalize">{s}</span>
              {i < WIZARD_STEPS.length - 1 ? <span aria-hidden>›</span> : null}
            </li>
          ))}
        </ol>
        <div className="min-h-[260px] px-6 py-5">{body}</div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
          <Button
            variant="ghost"
            disabled={previousStep(step) === null}
            onClick={() => setStep((s) => previousStep(s) ?? s)}
          >
            <ChevronLeft className="mr-1 size-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            {canSkip(step) ? (
              <Button variant="ghost" onClick={() => setStep((s) => nextStep(s) ?? s)}>
                Skip
              </Button>
            ) : null}
            {step === "finish" ? (
              <Button onClick={() => void finish(onDone)}>
                {desktop ? "Start using MasarFlow" : "Close"}
              </Button>
            ) : (
              <Button disabled={!canAdvance(step, effective)} onClick={() => setStep((s) => nextStep(s) ?? s)}>
                Continue <ChevronRight className="ml-1 size-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="px-6 pb-3 text-[11px] text-muted-foreground">
          Everything stays on this computer. MasarFlow never uploads your workspace; only the AI provider
          you choose sends the text you send it. {desktop ? "" : "(Browser preview: folder linking needs the desktop app.)"}
        </p>
      </div>
    </div>
  );
}
