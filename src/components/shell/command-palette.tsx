"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useUi } from "@/lib/stores/ui";
import { NAV_ITEMS } from "@/lib/nav";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useSpecs, useAllPlans } from "@/lib/db/repos/specs";
import { useNotes } from "@/lib/db/repos/notes";
import { useTasks } from "@/lib/db/repos/misc";
import {
  Compass,
  LayoutDashboard,
  FileText,
  ListTodo,
  Brain,
  Sparkles,
  Plus,
  Network,
  GitBranch,
  Search,
  Bot,
  Keyboard,
} from "lucide-react";

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const setProjectSwitcherOpen = useUi((s) => s.setProjectSwitcherOpen);
  const setShortcutsOpen = useUi((s) => s.setShortcutsOpen);
  const router = useRouter();
  const project = useActiveProject();
  const specs = useSpecs(project?.id);
  const notes = useNotes(project?.id);
  const tasks = useTasks(project?.id);
  const plans = useAllPlans();

  const go = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router, setOpen],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command, search, or jump…" autoFocus />
      <CommandList>
        <CommandEmpty>No results. Try a different query.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((i) => {
            const Icon = i.icon;
            return (
              <CommandItem key={i.id} onSelect={() => go(i.href)} value={`nav ${i.label}`}>
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span>{i.label}</span>
                {i.shortcut && (
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {i.shortcut}
                  </span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Jump to">
          {project && (
            <>
              <CommandItem onSelect={() => go("/")} value="jump dashboard">
                <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                <span>Dashboard</span>
              </CommandItem>
              <CommandItem onSelect={() => go("/knowledge-graph")} value="jump graph">
                <Network className="h-4 w-4 text-muted-foreground" />
                <span>Knowledge Graph</span>
              </CommandItem>
            </>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              setOpen(false);
              setProjectSwitcherOpen(true);
            }}
            value="action project"
          >
            <Compass className="h-4 w-4 text-muted-foreground" />
            <span>Switch project…</span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">⌘P</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              setSearchOpen(true);
            }}
            value="action search"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
            <span>Global search…</span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">⌘/</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              setShortcutsOpen(true);
            }}
            value="action shortcuts"
          >
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            <span>Keyboard shortcuts</span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">?</span>
          </CommandItem>
        </CommandGroup>

        {(specs?.length ?? 0) > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Specifications (${specs?.length})`}>
              {specs?.slice(0, 5).map((s) => (
                <CommandItem
                  key={s.id}
                  onSelect={() => go(`/specs/${s.id}`)}
                  value={`spec ${s.number} ${s.title}`}
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-[10px] text-muted-foreground">{s.number}</span>
                  <span className="truncate">{s.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {(notes?.length ?? 0) > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Brain (${notes?.length})`}>
              {notes?.slice(0, 5).map((n) => (
                <CommandItem
                  key={n.id}
                  onSelect={() => go(`/brain/${n.id}`)}
                  value={`note ${n.title} ${n.tags.join(" ")}`}
                >
                  <Brain className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{n.title}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{n.type}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {(tasks?.length ?? 0) > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Tasks (${tasks?.length})`}>
              {tasks?.slice(0, 5).map((t) => (
                <CommandItem
                  key={t.id}
                  onSelect={() => go("/tasks")}
                  value={`task ${t.title} ${t.tags.join(" ")}`}
                >
                  <ListTodo className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{t.title}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {t.status} · {t.priority}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {(plans?.filter((p) => p.status === "awaiting_approval").length ?? 0) > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="AI">
              <CommandItem onSelect={() => go("/specs")} value="ai plans">
                <Sparkles className="h-4 w-4 text-[color:var(--primary)]" />
                <span>
                  {plans?.filter((p) => p.status === "awaiting_approval").length} plan
                  {(plans?.filter((p) => p.status === "awaiting_approval").length ?? 0) === 1
                    ? ""
                    : "s"}{" "}
                  awaiting approval
                </span>
              </CommandItem>
              <CommandItem onSelect={() => go("/agents")} value="ai agents">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <span>Review AI agent activity</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}

        <CommandSeparator />

        <CommandGroup heading="Create">
          <CommandItem
            onSelect={() => {
              setOpen(false);
              go("/brain");
            }}
            value="create note"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span>New note in Brain</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              go("/specs");
            }}
            value="create spec"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span>New specification</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              go("/tasks");
            }}
            value="create task"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span>New task</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
