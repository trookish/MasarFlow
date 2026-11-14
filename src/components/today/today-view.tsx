"use client";

/**
 * Today: the answer to "what do I do now". Four task buckets from the local
 * database, the repository card, the recent activity feed and today's note.
 * Everything here is a link into a project tab — this page never edits a task in
 * place beyond its deadline.
 */

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, ListChecks, RefreshCw } from "lucide-react";
import { tasksRepo } from "@/lib/db/repos";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { groupTasks, type TodayGroups } from "@/lib/today/model";
import { openDailyNote } from "@/lib/vault/daily";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TodayTaskList } from "./today-task-list";
import { TodayActivity } from "./today-activity";
import { TodayInbox } from "./today-inbox";
import { TodayGit } from "./today-git";
import type { Task } from "@/lib/db/schema";

/** groupTasks against the real clock. Module-level so the component body calls
 * no impure function during render (repo convention, see note-list.tsx). */
function groupNow(tasks: Task[]): TodayGroups {
  return groupTasks(tasks, Date.now());
}

export function TodayView() {
  const projectId = useActiveProjectId();
  /* refreshKey lets the Refresh button re-run the live query on demand; the
     live query also refreshes on its own when the tasks table changes. */
  const [refreshKey, setRefreshKey] = useState(0);
  const tasks = useLiveQuery(
    () => (projectId ? tasksRepo.listByProject(projectId) : Promise.resolve([])),
    [projectId, refreshKey],
    undefined,
  );

  const grouped = useMemo(() => groupNow(tasks ?? []), [tasks]);
  const now = new Date();

  if (!projectId) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No project yet"
        description="Create or open a project to see today's work."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-medium">
            Today — {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </h2>
          <p className="text-xs text-muted-foreground">
            {grouped.counts.overdue + grouped.counts.dueToday === 0
              ? "Nothing is due today. The lists below are what moved most recently."
              : `${grouped.counts.overdue} overdue, ${grouped.counts.dueToday} due today.`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void openDailyNote(projectId)}>
            <CalendarDays className="h-3.5 w-3.5" /> Open today&apos;s note
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Re-read the task list"
            title="Refresh"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
        <TodayTaskList
          bucket="overdue"
          title="Overdue"
          description="Deadline passed"
          tasks={grouped.overdue}
          emptyText="Nothing is late."
        />
        <TodayTaskList
          bucket="dueToday"
          title="Due today"
          description="Finish before the day ends"
          tasks={grouped.dueToday}
          emptyText="Nothing is due today."
        />
        <TodayTaskList
          bucket="inProgress"
          title="In progress"
          description="Already started — most recent first"
          tasks={grouped.inProgress}
          emptyText="Nothing is in progress."
        />
        <TodayTaskList
          bucket="upNext"
          title="Up next"
          description="High and urgent work not started"
          tasks={grouped.upNext}
          emptyText="No high-priority work waiting."
        />

        <TodayInbox projectId={projectId} />
        <TodayActivity projectId={projectId} />
        <TodayGit />
      </div>

      <footer className="mt-auto border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <ListChecks className="mr-1.5 inline h-3.5 w-3.5" />
        Everything here opens in its own tab: a task opens in Work, a change opens in its page. Use
        ⌘/Ctrl+K to find anything else.
      </footer>
    </div>
  );
}
