"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Timer, Pause, Play, RotateCcw, CalendarDays } from "lucide-react";
import { notesRepo, noteTemplatesRepo } from "@/lib/db/repos";
import { usePlugin, settingStr, settingInt } from "@/lib/plugins-runtime";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * Topbar widgets contributed by plugins. Each renders nothing unless its
 * plugin is installed and enabled for the active project.
 */

const BREAK_MINUTES = 5;

interface TimerState {
  phase: "focus" | "break";
  remaining: number;
}

/** Pomodoro Timer plugin: a real work/break focus timer in the top bar. */
export function PomodoroWidget() {
  const plugin = usePlugin("pomodoro");
  const focusMinutes = settingInt(plugin.settings, "minutes", 25);
  const [timer, setTimer] = useState<TimerState>({
    phase: "focus",
    remaining: focusMinutes * 60,
  });
  const [running, setRunning] = useState(false);

  // Adjust the idle timer when the configured length changes (render-phase
  // state adjustment, per the React "derived state" pattern).
  const [prevMinutes, setPrevMinutes] = useState(focusMinutes);
  if (prevMinutes !== focusMinutes) {
    setPrevMinutes(focusMinutes);
    if (!running && timer.phase === "focus") {
      setTimer({ phase: "focus", remaining: focusMinutes * 60 });
    }
  }

  useEffect(() => {
    if (!running) return;
    const handle = setInterval(() => {
      setTimer((t) => {
        if (t.remaining > 1) return { ...t, remaining: t.remaining - 1 };
        // Phase flip: focus → break → focus.
        return t.phase === "focus"
          ? { phase: "break", remaining: BREAK_MINUTES * 60 }
          : { phase: "focus", remaining: focusMinutes * 60 };
      });
    }, 1000);
    return () => clearInterval(handle);
  }, [running, focusMinutes]);

  if (!plugin.active) return null;

  const { phase, remaining } = timer;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  function reset() {
    setRunning(false);
    setTimer({ phase: "focus", remaining: focusMinutes * 60 });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5",
        phase === "break" && "border-node-lore/50 bg-node-lore/10",
      )}
    >
      <Timer
        className={cn(
          "h-3.5 w-3.5",
          phase === "break" ? "text-node-lore" : "text-muted-foreground",
        )}
      />
      <span className="font-mono text-xs tabular-nums" title={`Pomodoro — ${phase}`}>
        {mm}:{ss}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={running ? "Pause timer" : "Start timer"}
        onClick={() => setRunning((r) => !r)}
        className="h-6 w-6"
      >
        {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Reset timer"
        onClick={reset}
        className="h-6 w-6"
      >
        <RotateCcw className="h-3 w-3" />
      </Button>
    </div>
  );
}

/** Daily Notes plugin: create/open today's dated note with one click. */
export function DailyNoteButton() {
  const plugin = usePlugin("daily-notes");
  const projectId = useActiveProjectId();
  const router = useRouter();

  if (!plugin.active) return null;

  async function openToday() {
    if (!projectId) return;
    const title = new Date().toISOString().slice(0, 10);
    let note = await notesRepo.getByTitle(projectId, title);
    if (!note) {
      // Seed from the configured template note when one exists.
      const templateName = settingStr(plugin.settings, "template", "Daily");
      const templates = await noteTemplatesRepo.listByProject(projectId);
      const template = templates.find(
        (t) => t.name.toLowerCase() === templateName.toLowerCase(),
      );
      note = await notesRepo.create({
        projectId,
        title,
        body: template?.body ?? `# ${title}\n\n`,
        type: template?.type ?? "note",
        tags: template?.tags ?? ["daily"],
      });
    }
    router.push(`/brain?note=${note.id}`);
  }

  return (
    <Tooltip label="Open today's daily note" side="bottom">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Daily note"
        onClick={() => void openToday()}
      >
        <CalendarDays className="h-4 w-4" />
      </Button>
    </Tooltip>
  );
}
