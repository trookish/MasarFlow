"use client";
import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { CircleDot, Bot, GitBranch, Cpu, Activity } from "lucide-react";
import { useUi } from "@/lib/stores/ui";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useAgents, useTasks } from "@/lib/db/repos/misc";
import { cn, pluralize } from "@/lib/utils";

export function StatusBar() {
  const visible = useUi((s) => s.statusBarVisible);
  const project = useActiveProject();
  const agents = useAgents();
  const tasks = useTasks(project?.id);

  const activeAgents = agents?.filter((a) => a.status !== "idle").length ?? 0;
  const pendingTasks = tasks?.filter((t) => t.status !== "done").length ?? 0;

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.footer
          key="statusbar"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 28, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="relative z-10 flex h-7 shrink-0 items-center gap-3 overflow-hidden border-t border-border bg-surface px-3 text-[11px] text-muted-foreground"
        >
          <div className="flex items-center gap-1.5">
            <CircleDot className="h-3 w-3 text-[color:var(--success)]" />
            <span>connected</span>
          </div>
          <Sep />
          <div className="flex items-center gap-1.5">
            <Bot className="h-3 w-3" />
            <span>{pluralize(activeAgents, "agent")} active</span>
          </div>
          <Sep />
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3 w-3" />
            <span>{pluralize(pendingTasks, "task")} pending</span>
          </div>
          <Sep />
          <div className="flex items-center gap-1.5">
            <GitBranch className="h-3 w-3" />
            <span className="font-mono">main</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Activity className="h-3 w-3 animate-pulse-soft text-[color:var(--info)]" />
            <span>memory index fresh</span>
          </div>
        </motion.footer>
      )}
    </AnimatePresence>
  );
}

function Sep() {
  return <span className={cn("h-3 w-px bg-border")} />;
}
