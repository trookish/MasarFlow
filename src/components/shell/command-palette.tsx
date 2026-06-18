"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  FilePlus2,
  LayoutTemplate,
  FileText,
  KanbanSquare,
  SunMoon,
  Database,
  Trash2,
} from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Dialog } from "@/components/ui/dialog";
import { useUIStore } from "@/lib/stores/ui";
import { useProjectStore } from "@/lib/stores/project";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { ALL_NAV_ITEMS } from "@/lib/nav";
import { notesRepo, canvasRepo, specsRepo, tasksRepo } from "@/lib/db/repos";
import { loadDemoData, resetData } from "@/lib/db/seed";

export function CommandPalette() {
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  const router = useRouter();
  const projectId = useActiveProjectId();
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);
  const { theme, setTheme } = useTheme();

  const run = (fn: () => void | Promise<void>) => () => {
    setOpen(false);
    void fn();
  };

  async function newNote() {
    if (!projectId) return;
    const note = await notesRepo.create({
      projectId,
      title: "Untitled note",
    });
    router.push(`/brain?note=${note.id}`);
  }

  async function newCanvas() {
    if (!projectId) return;
    const canvas = await canvasRepo.create({
      projectId,
      name: "Untitled canvas",
    });
    router.push(`/brain/canvas?canvas=${canvas.id}`);
  }

  async function newSpec() {
    if (!projectId) return;
    const count = (await specsRepo.listByProject(projectId)).length;
    const number = `RFC-${String(count + 1).padStart(3, "0")}`;
    await specsRepo.create({ projectId, number, title: "Untitled spec" });
    router.push("/specs");
  }

  async function newTask() {
    if (!projectId) return;
    await tasksRepo.create({ projectId, title: "Untitled task" });
    router.push("/tasks");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      position="top"
      showClose={false}
      className="overflow-hidden p-0"
      ariaLabel="Command palette"
    >
      <Command loop>
        <CommandInput placeholder="Type a command or search…" autoFocus />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Create">
            <CommandItem value="new note create" onSelect={run(newNote)}>
              <FilePlus2 className="h-4 w-4 text-muted-foreground" />
              New note
            </CommandItem>
            <CommandItem value="new canvas create" onSelect={run(newCanvas)}>
              <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
              New canvas
            </CommandItem>
            <CommandItem value="new spec rfc create" onSelect={run(newSpec)}>
              <FileText className="h-4 w-4 text-muted-foreground" />
              New specification
            </CommandItem>
            <CommandItem value="new task create" onSelect={run(newTask)}>
              <KanbanSquare className="h-4 w-4 text-muted-foreground" />
              New task
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Go to">
            {ALL_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={`${item.label} ${item.keywords?.join(" ") ?? ""}`}
                  onSelect={run(() => router.push(item.href))}
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandGroup heading="Appearance">
            <CommandItem
              value="toggle theme dark light"
              onSelect={run(() =>
                setTheme(theme === "light" ? "dark" : "light"),
              )}
            >
              <SunMoon className="h-4 w-4 text-muted-foreground" />
              Toggle light / dark
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Data">
            <CommandItem
              value="load demo data seed"
              onSelect={run(async () => {
                const id = await loadDemoData();
                setActiveProjectId(id);
                router.push("/brain");
              })}
            >
              <Database className="h-4 w-4 text-muted-foreground" />
              Load demo data
            </CommandItem>
            <CommandItem
              value="reset wipe clear all data"
              onSelect={run(async () => {
                await resetData();
                setActiveProjectId(null);
                router.push("/dashboard");
              })}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
              Reset all data
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </Dialog>
  );
}
