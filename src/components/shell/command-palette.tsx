"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { useUi } from "@/lib/stores/ui";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useNotes } from "@/lib/db/repos/notes";
import { useSpecs, useAllPlans } from "@/lib/db/repos/specs";
import { useTasks } from "@/lib/db/repos/misc";
import { Compass, LayoutDashboard, FileText, ListTodo, Brain, Sparkles, Plus, Network, GitBranch, BookOpen, ScrollText, Search, Bot, Keyboard, ShieldCheck, Wand2, Trash2, Settings } from "lucide-react";
import { toast } from "sonner";
import { useAi } from "@/lib/stores/ai";
import { resetSeed } from "@/lib/db/seed";

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const setProjectSwitcherOpen = useUi((s) => s.setProjectSwitcherOpen);
  const setShortcutsOpen = useUi((s) => s.setShortcutsOpen);
  const router = useRouter();
  const project = useActiveProject();
  const notes = useNotes(project?.id);
  const specs = useSpecs(project?.id);
  const tasks = useTasks(project?.id);
  const plans = useAllPlans();
  const aiProvider = useAi((s) => s.provider);
  const setAiProvider = useAi((s) => s.setProvider);

  const go = React.useCallback((href: string) => { setOpen(false); router.push(href); }, [router, setOpen]);

  const run = React.useCallback((fn: () => void) => { setOpen(false); fn(); }, [setOpen]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command, search, or jump..." autoFocus />
      <CommandList>
        <CommandEmpty>No results. Try a different query.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {([
            { id: "dashboard", label: "Dashboard", href: "/", icon: LayoutDashboard, shortcut: "G D" },
            { id: "brain", label: "Brain", href: "/brain", icon: Brain, shortcut: "G B" },
            { id: "specs", label: "Specifications", href: "/specs", icon: FileText, shortcut: "G S" },
            { id: "standards", label: "Standards", href: "/standards", icon: ShieldCheck },
            { id: "architecture", label: "Architecture", href: "/architecture", icon: Network, shortcut: "G A" },
            { id: "graph", label: "Knowledge Graph", href: "/knowledge-graph", icon: GitBranch, shortcut: "G K" },
            { id: "tasks", label: "Tasks", href: "/tasks", icon: ListTodo, shortcut: "G T" },
            { id: "agents", label: "AI Agents", href: "/agents", icon: Bot },
            { id: "workflow", label: "AI Workflow", href: "/workflow", icon: Wand2 },
            { id: "docs", label: "Documentation", href: "/docs", icon: BookOpen },
            { id: "logs", label: "Dev Logs", href: "/dev-logs", icon: ScrollText, shortcut: "G L" },
            { id: "search", label: "Search", href: "/search", icon: Search },
            { id: "settings", label: "Settings", href: "/settings", icon: Settings },
          ] as const).map((i) => {
            const Icon = i.icon;
            return (
              <CommandItem key={i.id} onSelect={() => go(i.href)} value={`nav ${i.label}`}>
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span>{i.label}</span>
                {("shortcut" in i && i.shortcut) ? <span className="ml-auto font-mono text-[10px] text-muted-foreground">{i.shortcut}</span> : null}
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(() => setProjectSwitcherOpen(true))} value="action project">
            <Compass className="h-4 w-4 text-muted-foreground" /><span>Switch project</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">Ctrl P</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => setSearchOpen(true))} value="action search">
            <Search className="h-4 w-4 text-muted-foreground" /><span>Global search</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">Ctrl /</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => setShortcutsOpen(true))} value="action shortcuts">
            <Keyboard className="h-4 w-4 text-muted-foreground" /><span>Keyboard shortcuts</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">?</span>
          </CommandItem>
          <CommandSeparator />
          <CommandItem onSelect={() => run(() => { go("/brain/new"); })} value="action new note">
            <Plus className="h-4 w-4 text-muted-foreground" /><span>New note in Brain</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">N N</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => { go("/specs"); })} value="action new spec">
            <Plus className="h-4 w-4 text-muted-foreground" /><span>New specification</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">N S</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => { go("/tasks"); })} value="action new task">
            <Plus className="h-4 w-4 text-muted-foreground" /><span>New task</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">N T</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => { go("/dev-logs"); })} value="action new log">
            <Plus className="h-4 w-4 text-muted-foreground" /><span>New dev log</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">N L</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => { go("/docs"); })} value="action new doc">
            <Plus className="h-4 w-4 text-muted-foreground" /><span>New doc</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">N D</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => { go("/standards"); })} value="action new standard">
            <Plus className="h-4 w-4 text-muted-foreground" /><span>New standard</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">N X</span>
          </CommandItem>
          <CommandSeparator />
          <CommandItem onSelect={() => run(() => {
            const next = plans?.find((p) => p.status === "awaiting_approval");
            if (next) { go(`/specs/${next.specId}`); } else { toast.info("No plans awaiting approval."); }
          })} value="action review plans">
            <Wand2 className="h-4 w-4 text-[color:var(--primary)]" /><span>Review plans awaiting approval</span>
            {plans?.filter((p) => p.status === "awaiting_approval").length ? (<Badge className="ml-auto">{plans.filter((p) => p.status === "awaiting_approval").length}</Badge>) : null}
          </CommandItem>
          <CommandItem onSelect={() => run(() => { go("/workflow"); })} value="action run workflow">
            <Sparkles className="h-4 w-4 text-[color:var(--primary)]" /><span>Run AI workflow simulation</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => {
            const a = aiProvider === "simulated" ? "openai" : aiProvider === "openai" ? "anthropic" : aiProvider === "anthropic" ? "google" : aiProvider === "google" ? "openrouter" : "simulated";
            setAiProvider(a);
            toast.success(`AI provider set to ${a}`);
          })} value="action cycle ai">
            <Bot className="h-4 w-4 text-muted-foreground" /><span>Cycle AI provider</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">{aiProvider}</span>
          </CommandItem>
          <CommandItem onSelect={() => run(async () => {
            await resetSeed();
            toast.success('Seed data reset', { description: 'Reloading...' });
            setTimeout(() => location.reload(), 600);
          })} value="action reset seed">
            <Trash2 className="h-4 w-4 text-[color:var(--danger)]" /><span>Reset seed data</span>
          </CommandItem>
        </CommandGroup>

        {(notes?.length ?? 0) > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Notes (${notes?.length})`}>
              {notes?.slice(0, 5).map((n) => (
                <CommandItem key={n.id} onSelect={() => go(`/brain/${n.id}`)} value={`note ${n.title} ${n.tags.join(" ")}`}>
                  <Brain className="h-4 w-4 text-muted-foreground" /><span className="truncate">{n.title}</span><span className="ml-auto text-[10px] text-muted-foreground">{n.type}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {(specs?.length ?? 0) > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Specifications (${specs?.length})`}>
              {specs?.slice(0, 5).map((s) => (
                <CommandItem key={s.id} onSelect={() => go(`/specs/${s.id}`)} value={`spec ${s.number} ${s.title}`}>
                  <FileText className="h-4 w-4 text-muted-foreground" /><span className="font-mono text-[10px] text-muted-foreground">{s.number}</span><span className="truncate">{s.title}</span><span className="ml-auto text-[10px] text-muted-foreground">{s.status}</span>
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
                <CommandItem key={t.id} onSelect={() => go("/tasks")} value={`task ${t.title} ${t.tags.join(" ")}`}>
                  <ListTodo className="h-4 w-4 text-muted-foreground" /><span className="truncate">{t.title}</span><span className="ml-auto text-[10px] text-muted-foreground">{t.status} - {t.priority}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={"rounded-full bg-[color:var(--primary)]/20 px-2 py-0.5 font-mono text-[10px] text-[color:var(--primary)] " + (className ?? "")}>{children}</span>;
}
