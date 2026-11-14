/* eslint-disable react-hooks/purity */
"use client";
import * as React from "react";
import { useSprints, createSprint, updateSprint } from "@/lib/db/repos/sprints";
import { useTasks } from "@/lib/db/repos/misc";
import { getDb, type Sprint, type Task } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { TaskPriorityBadge, TaskStatusBadge } from "@/components/common/badges";
import { Play, Check, Plus } from "lucide-react";
import Link from "next/link";

export function SprintsView({ projectId }: { projectId: string }) {
  const sprints = useSprints(projectId);
  const tasks = useTasks(projectId);
  const [newSprintName, setNewSprintName] = React.useState("");

  const backlogTasks = tasks?.filter((t) => !t.sprintId && t.status !== "done") ?? [];

  const handleCreateSprint = async () => {
    if (!newSprintName.trim()) return;
    await createSprint(projectId, newSprintName.trim());
    setNewSprintName("");
    toast.success("Sprint created");
  };

  const handleStartSprint = async (sprint: Sprint) => {
    await updateSprint(sprint.id, { status: "active", startDate: Date.now() });
    toast.success("Sprint started");
  };

  const handleCompleteSprint = async (sprint: Sprint) => {
    await updateSprint(sprint.id, { status: "completed", endDate: Date.now() });
    toast.success("Sprint completed");
  };

  const dropToSprint = async (e: React.DragEvent, sprintId: string | null) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("application/masarflow-task-id");
    if (!taskId) return;
    await getDb().tasks.update(taskId, { sprintId, updatedAt: Date.now() });
  };

  const renderTask = (t: Task) => (
    <div
      key={t.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/masarflow-task-id", t.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="border-border bg-surface hover:border-border/80 flex cursor-grab items-center gap-3 rounded-md border p-2 text-sm transition-colors active:cursor-grabbing"
    >
      <TaskStatusBadge status={t.status} />
      <span className="flex-1 truncate">{t.title}</span>
      <TaskPriorityBadge priority={t.priority} />
      <Link href={`/tasks/${t.id}`} className="text-muted-foreground hover:text-foreground text-[10px] underline">
        View
      </Link>
    </div>
  );

  return (
    <div className="grid gap-6 px-6 py-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Sprints</h2>
        </div>
        
        <div className="flex gap-2">
          <Input 
            placeholder="New sprint name..." 
            value={newSprintName}
            onChange={(e) => setNewSprintName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateSprint()}
          />
          <Button onClick={handleCreateSprint}><Plus className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-6">
          {sprints?.map((sprint) => {
            const sprintTasks = tasks?.filter((t) => t.sprintId === sprint.id) ?? [];
            return (
              <Card 
                key={sprint.id}
                className={sprint.status === "active" ? "border-primary" : ""}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={(e) => dropToSprint(e, sprint.id)}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    {sprint.name} 
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {sprint.status}
                    </span>
                  </CardTitle>
                  <div>
                    {sprint.status === "planning" && (
                      <Button variant="outline" size="sm" onClick={() => handleStartSprint(sprint)}>
                        <Play className="h-3 w-3 mr-1" /> Start
                      </Button>
                    )}
                    {sprint.status === "active" && (
                      <Button variant="default" size="sm" onClick={() => handleCompleteSprint(sprint)}>
                        <Check className="h-3 w-3 mr-1" /> Complete
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {sprintTasks.map(renderTask)}
                  {sprintTasks.length === 0 && (
                    <div className="border-border text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">
                      Drop tasks here to assign to sprint.
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Backlog</h2>
        </div>
        <Card 
          className="bg-card min-h-[400px]"
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          onDrop={(e) => dropToSprint(e, null)}
        >
          <CardContent className="space-y-2 p-4">
            {backlogTasks.map(renderTask)}
            {backlogTasks.length === 0 && (
              <div className="text-muted-foreground text-center text-xs p-4">
                No active backlog tasks.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
