"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Moon, Sun, Database, Trash2, Check } from "lucide-react";
import { ACCENTS, useThemeStore } from "@/lib/stores/theme";
import { useProjectStore } from "@/lib/stores/project";
import { useActiveProject } from "@/lib/hooks/use-project";
import { useMounted } from "@/lib/hooks/use-mounted";
import { projectsRepo } from "@/lib/db/repos";
import type { Project } from "@/lib/db/schema";
import { loadDemoData, resetData, isDemoLoaded } from "@/lib/db/seed";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";

export function SettingsView() {
  const mounted = useMounted();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const accent = useThemeStore((s) => s.accent);
  const setAccent = useThemeStore((s) => s.setAccent);
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);
  const project = useActiveProject();
  const demoLoaded = useLiveQuery(() => isDemoLoaded(), []);

  const [confirmReset, setConfirmReset] = useState(false);

  const isDark = mounted ? theme !== "light" : true;

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Appearance, data, and project configuration.
          </p>
        </div>

        {/* Appearance */}
        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Theme and accent color.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={isDark ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
              >
                <Moon className="h-4 w-4" /> Dark
              </Button>
              <Button
                variant={!isDark ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
              >
                <Sun className="h-4 w-4" /> Light
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  data-accent={a}
                  onClick={() => setAccent(a)}
                  aria-label={`${a} accent`}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full bg-primary transition-transform hover:scale-110",
                    accent === a &&
                      "ring-2 ring-ring ring-offset-2 ring-offset-card",
                  )}
                >
                  {accent === a ? (
                    <Check className="h-4 w-4 text-primary-foreground" />
                  ) : null}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Active project */}
        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <CardTitle>Active project</CardTitle>
              <CardDescription>
                Rename or describe this project.
              </CardDescription>
            </div>
            {project ? (
              <ProjectForm key={project.id} project={project} />
            ) : null}
          </CardContent>
        </Card>

        {/* Data */}
        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <CardTitle>Data management</CardTitle>
              <CardDescription>
                Load a demo project or wipe all local data. Everything lives in
                your browser (IndexedDB).
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const id = await loadDemoData();
                  setActiveProjectId(id);
                  router.push("/brain");
                }}
                disabled={Boolean(demoLoaded)}
              >
                <Database className="h-4 w-4" />
                {demoLoaded ? "Demo data loaded" : "Load demo data"}
              </Button>
              <Button
                variant="destructive"
                onClick={() => setConfirmReset(true)}
              >
                <Trash2 className="h-4 w-4" /> Reset all data
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        className="max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Reset all data?</DialogTitle>
          <DialogDescription>
            This permanently deletes every project, note, spec, task, and canvas
            in this browser. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await resetData();
              setActiveProjectId(null);
              setConfirmReset(false);
              router.push("/dashboard");
            }}
          >
            Reset everything
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

/** Keyed by project id so state re-initializes on project switch (no effect). */
function ProjectForm({ project }: { project: Project }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);

  function save() {
    void projectsRepo.update(project.id, { name, description });
  }

  return (
    <>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        placeholder="Project name"
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={save}
        placeholder="Description"
        rows={3}
      />
    </>
  );
}
