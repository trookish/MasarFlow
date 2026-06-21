"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Moon,
  Sun,
  Database,
  Trash2,
  Check,
  LayoutDashboard,
  BrainCircuit,
  FileText,
  ShieldCheck,
  Boxes,
  Share2,
  KanbanSquare,
  Flag,
  MessageSquare,
  Bot,
  Workflow,
  BookOpen,
  ScrollText,
  RefreshCw,
  Eye,
  Search,
  Plug,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { ACCENTS, useThemeStore } from "@/lib/stores/theme";
import { useProjectStore } from "@/lib/stores/project";
import { useActiveProject } from "@/lib/hooks/use-project";
import { useMounted } from "@/lib/hooks/use-mounted";
import {
  usePageSettings,
  PAGE_SETTINGS_DEFAULTS,
  type PageKey,
  type AllPageSettings,
} from "@/lib/stores/page-settings";
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

// ─── Types ────────────────────────────────────────────────────────────────────

type GlobalSection = "appearance" | "project" | "data";
type Section = GlobalSection | PageKey;

interface NavEntry {
  id: Section;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavEntry[];
}

// ─── Navigation config ────────────────────────────────────────────────────────

const NAV: NavGroup[] = [
  {
    label: "Global",
    items: [
      { id: "appearance", label: "Appearance", icon: Sun },
      { id: "project", label: "Active Project", icon: Database },
      { id: "data", label: "Data", icon: Database },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "brain", label: "Brain", icon: BrainCircuit },
      { id: "specs", label: "Specifications", icon: FileText },
      { id: "standards", label: "Standards", icon: ShieldCheck },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { id: "architecture", label: "Architecture", icon: Boxes },
      { id: "knowledge", label: "Knowledge Graph", icon: Share2 },
      { id: "tasks", label: "Task Boards", icon: KanbanSquare },
      { id: "sprints", label: "Sprints", icon: Flag },
      { id: "chat", label: "Chat", icon: MessageSquare },
      { id: "agents", label: "AI Agents", icon: Bot },
      { id: "workflow", label: "AI Workflow", icon: Workflow },
    ],
  },
  {
    label: "System",
    items: [
      { id: "docs", label: "Documentation", icon: BookOpen },
      { id: "devlogs", label: "Dev Logs", icon: ScrollText },
      { id: "sync", label: "Sync Panel", icon: RefreshCw },
      { id: "watcher", label: "Project Watcher", icon: Eye },
      { id: "search", label: "Semantic Search", icon: Search },
      { id: "plugins", label: "Plugins", icon: Plug },
    ],
  },
];

// ─── Helper components ────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-3.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant={value ? "default" : "outline"}
        onClick={() => onChange(true)}
      >
        On
      </Button>
      <Button
        size="sm"
        variant={!value ? "default" : "outline"}
        onClick={() => onChange(false)}
      >
        Off
      </Button>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <Button
          key={opt.value}
          size="sm"
          variant={value === opt.value ? "default" : "outline"}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

function SectionPanel({
  title,
  description,
  onReset,
  children,
}: {
  title: string;
  description?: string;
  onReset?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {onReset && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="shrink-0 text-xs text-muted-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Reset defaults
          </Button>
        )}
      </div>
      <Card>
        <CardContent className="divide-y-0 p-4">{children}</CardContent>
      </Card>
    </div>
  );
}

// ─── Global sections ──────────────────────────────────────────────────────────

function AppearanceSection() {
  const mounted = useMounted();
  const { theme, setTheme } = useTheme();
  const accent = useThemeStore((s) => s.accent);
  const setAccent = useThemeStore((s) => s.setAccent);
  const isDark = mounted ? theme !== "light" : true;

  return (
    <SectionPanel
      title="Appearance"
      description="Theme and accent color applied globally."
    >
      <SettingRow label="Color scheme" description="Light or dark mode for the interface.">
        <div className="flex gap-1">
          <Button
            variant={isDark ? "default" : "outline"}
            size="sm"
            onClick={() => setTheme("dark")}
          >
            <Moon className="h-3.5 w-3.5" /> Dark
          </Button>
          <Button
            variant={!isDark ? "default" : "outline"}
            size="sm"
            onClick={() => setTheme("light")}
          >
            <Sun className="h-3.5 w-3.5" /> Light
          </Button>
        </div>
      </SettingRow>
      <SettingRow label="Accent color" description="Primary accent color across all pages.">
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              data-accent={a}
              onClick={() => setAccent(a)}
              aria-label={`${a} accent`}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full bg-primary transition-transform hover:scale-110",
                accent === a &&
                  "ring-2 ring-ring ring-offset-2 ring-offset-card",
              )}
            >
              {accent === a ? (
                <Check className="h-3.5 w-3.5 text-primary-foreground" />
              ) : null}
            </button>
          ))}
        </div>
      </SettingRow>
    </SectionPanel>
  );
}

function ProjectSection() {
  const project = useActiveProject();
  return (
    <SectionPanel
      title="Active Project"
      description="Rename or add a description to the current project."
    >
      {project ? (
        <ProjectForm key={project.id} project={project} />
      ) : (
        <p className="py-4 text-center text-xs text-muted-foreground">
          No active project selected.
        </p>
      )}
    </SectionPanel>
  );
}

function DataSection() {
  const router = useRouter();
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);
  const demoLoaded = useLiveQuery(() => isDemoLoaded(), []);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <SectionPanel
        title="Data Management"
        description="Load demo content or wipe all local data. Everything lives in your browser (IndexedDB)."
      >
        <SettingRow label="Demo data" description="Populate the app with example projects, notes, and tasks.">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const id = await loadDemoData();
              setActiveProjectId(id);
              router.push("/brain");
            }}
            disabled={Boolean(demoLoaded)}
          >
            <Database className="h-3.5 w-3.5" />
            {demoLoaded ? "Demo loaded" : "Load demo"}
          </Button>
        </SettingRow>
        <SettingRow label="Reset" description="Permanently delete every project, note, spec, and task in this browser.">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmReset(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Reset all data
          </Button>
        </SettingRow>
      </SectionPanel>

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
    </>
  );
}

// ─── Per-page sections ────────────────────────────────────────────────────────

function DashboardSection() {
  const { dashboard, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["dashboard"]>(
    k: K,
    v: AllPageSettings["dashboard"][K],
  ) => update("dashboard", { [k]: v } as Partial<AllPageSettings["dashboard"]>);

  return (
    <SectionPanel
      title="Dashboard"
      description="What to display on the main dashboard."
      onReset={() => reset("dashboard")}
    >
      <SettingRow label="Metrics cards" description="Show health score, arch score, and tech-debt cards.">
        <Toggle value={dashboard.showMetrics} onChange={(v) => set("showMetrics", v)} />
      </SettingRow>
      <SettingRow label="Recent activity" description="Show the recent-activity feed.">
        <Toggle value={dashboard.showActivity} onChange={(v) => set("showActivity", v)} />
      </SettingRow>
    </SectionPanel>
  );
}

function BrainSection() {
  const { brain, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["brain"]>(
    k: K,
    v: AllPageSettings["brain"][K],
  ) => update("brain", { [k]: v } as Partial<AllPageSettings["brain"]>);

  return (
    <SectionPanel
      title="Brain"
      description="Defaults for the notes editor and sub-views."
      onReset={() => reset("brain")}
    >
      <SettingRow label="Default view" description="Which sub-view opens when you navigate to Brain.">
        <SegmentedControl
          value={brain.defaultView}
          options={[
            { value: "notes", label: "Notes" },
            { value: "canvas", label: "Canvas" },
            { value: "templates", label: "Templates" },
          ]}
          onChange={(v) => set("defaultView", v)}
        />
      </SettingRow>
      <SettingRow label="Word count" description="Show word count in the note editor toolbar.">
        <Toggle value={brain.showWordCount} onChange={(v) => set("showWordCount", v)} />
      </SettingRow>
      <SettingRow label="Line wrap" description="Wrap long lines in the editor instead of scrolling.">
        <Toggle value={brain.lineWrap} onChange={(v) => set("lineWrap", v)} />
      </SettingRow>
    </SectionPanel>
  );
}

function SpecsSection() {
  const { specs, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["specs"]>(
    k: K,
    v: AllPageSettings["specs"][K],
  ) => update("specs", { [k]: v } as Partial<AllPageSettings["specs"]>);

  return (
    <SectionPanel
      title="Specifications"
      description="List view defaults for the specs page."
      onReset={() => reset("specs")}
    >
      <SettingRow label="Default sort" description="How specs are ordered when you open the page.">
        <SegmentedControl
          value={specs.defaultSort}
          options={[
            { value: "updatedAt", label: "Updated" },
            { value: "title", label: "Title" },
            { value: "status", label: "Status" },
            { value: "progress", label: "Progress" },
          ]}
          onChange={(v) => set("defaultSort", v)}
        />
      </SettingRow>
      <SettingRow label="Show completed" description="Include specs with status 'done' in the list.">
        <Toggle value={specs.showCompleted} onChange={(v) => set("showCompleted", v)} />
      </SettingRow>
    </SectionPanel>
  );
}

function StandardsSection() {
  const { standards, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["standards"]>(
    k: K,
    v: AllPageSettings["standards"][K],
  ) => update("standards", { [k]: v } as Partial<AllPageSettings["standards"]>);

  return (
    <SectionPanel
      title="Standards"
      description="Code and design standards editor settings."
      onReset={() => reset("standards")}
    >
      <SettingRow label="Auto-validate" description="Run the deterministic enforcer automatically on save.">
        <Toggle value={standards.autoValidate} onChange={(v) => set("autoValidate", v)} />
      </SettingRow>
      <SettingRow label="Line numbers" description="Show line numbers in the standards editor.">
        <Toggle value={standards.showLineNumbers} onChange={(v) => set("showLineNumbers", v)} />
      </SettingRow>
    </SectionPanel>
  );
}

function ArchitectureSection() {
  const { architecture, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["architecture"]>(
    k: K,
    v: AllPageSettings["architecture"][K],
  ) => update("architecture", { [k]: v } as Partial<AllPageSettings["architecture"]>);

  return (
    <SectionPanel
      title="Architecture"
      description="Diagram visualization defaults."
      onReset={() => reset("architecture")}
    >
      <SettingRow label="Layout algorithm" description="How nodes are arranged on the diagram.">
        <SegmentedControl
          value={architecture.layout}
          options={[
            { value: "force", label: "Force" },
            { value: "dagre", label: "Dagre" },
          ]}
          onChange={(v) => set("layout", v)}
        />
      </SettingRow>
      <SettingRow label="Node labels" description="Show label text inside each node.">
        <Toggle value={architecture.showNodeLabels} onChange={(v) => set("showNodeLabels", v)} />
      </SettingRow>
      <SettingRow label="Edge labels" description="Show label text on diagram edges.">
        <Toggle value={architecture.showEdgeLabels} onChange={(v) => set("showEdgeLabels", v)} />
      </SettingRow>
    </SectionPanel>
  );
}

function KnowledgeSection() {
  const { knowledge, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["knowledge"]>(
    k: K,
    v: AllPageSettings["knowledge"][K],
  ) => update("knowledge", { [k]: v } as Partial<AllPageSettings["knowledge"]>);

  return (
    <SectionPanel
      title="Knowledge Graph"
      description="Graph visualization defaults."
      onReset={() => reset("knowledge")}
    >
      <SettingRow label="Layout algorithm" description="How nodes are positioned in the graph.">
        <SegmentedControl
          value={knowledge.layout}
          options={[
            { value: "force", label: "Force" },
            { value: "radial", label: "Radial" },
          ]}
          onChange={(v) => set("layout", v)}
        />
      </SettingRow>
      <SettingRow label="Orphan nodes" description="Show nodes with no connections.">
        <Toggle value={knowledge.showOrphans} onChange={(v) => set("showOrphans", v)} />
      </SettingRow>
      <SettingRow label="Edge labels" description="Show relation type labels on edges.">
        <Toggle value={knowledge.showEdgeLabels} onChange={(v) => set("showEdgeLabels", v)} />
      </SettingRow>
    </SectionPanel>
  );
}

function TasksSection() {
  const { tasks, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["tasks"]>(
    k: K,
    v: AllPageSettings["tasks"][K],
  ) => update("tasks", { [k]: v } as Partial<AllPageSettings["tasks"]>);

  return (
    <SectionPanel
      title="Task Boards"
      description="Kanban board defaults."
      onReset={() => reset("tasks")}
    >
      <SettingRow label="Show completed" description="Keep 'Done' tasks visible on the board.">
        <Toggle value={tasks.showCompleted} onChange={(v) => set("showCompleted", v)} />
      </SettingRow>
      <SettingRow label="Default grouping" description="How tasks are grouped when the board first loads.">
        <SegmentedControl
          value={tasks.defaultGroup}
          options={[
            { value: "status", label: "Status" },
            { value: "priority", label: "Priority" },
            { value: "assignee", label: "Assignee" },
          ]}
          onChange={(v) => set("defaultGroup", v)}
        />
      </SettingRow>
    </SectionPanel>
  );
}

function SprintsSection() {
  const { sprints, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["sprints"]>(
    k: K,
    v: AllPageSettings["sprints"][K],
  ) => update("sprints", { [k]: v } as Partial<AllPageSettings["sprints"]>);

  return (
    <SectionPanel
      title="Sprints"
      description="Sprint view and velocity defaults."
      onReset={() => reset("sprints")}
    >
      <SettingRow label="Show completed" description="Include finished sprints in the list.">
        <Toggle value={sprints.showCompleted} onChange={(v) => set("showCompleted", v)} />
      </SettingRow>
      <SettingRow label="Velocity display" description="Unit used when showing sprint velocity.">
        <SegmentedControl
          value={sprints.velocityDisplay}
          options={[
            { value: "tasks", label: "Tasks" },
            { value: "points", label: "Points" },
            { value: "both", label: "Both" },
          ]}
          onChange={(v) => set("velocityDisplay", v)}
        />
      </SettingRow>
    </SectionPanel>
  );
}

function ChatSection() {
  const { chat, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["chat"]>(
    k: K,
    v: AllPageSettings["chat"][K],
  ) => update("chat", { [k]: v } as Partial<AllPageSettings["chat"]>);

  return (
    <SectionPanel
      title="Chat"
      description="AI chat interface preferences."
      onReset={() => reset("chat")}
    >
      <SettingRow label="Timestamps" description="Show the time each message was sent.">
        <Toggle value={chat.showTimestamps} onChange={(v) => set("showTimestamps", v)} />
      </SettingRow>
      <SettingRow label="Code highlighting" description="Syntax-highlight code blocks in responses.">
        <Toggle value={chat.codeHighlighting} onChange={(v) => set("codeHighlighting", v)} />
      </SettingRow>
      <SettingRow label="Message density" description="Spacing between messages in the conversation.">
        <SegmentedControl
          value={chat.density}
          options={[
            { value: "compact", label: "Compact" },
            { value: "comfortable", label: "Comfortable" },
          ]}
          onChange={(v) => set("density", v)}
        />
      </SettingRow>
    </SectionPanel>
  );
}

function AgentsSection() {
  const { agents, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["agents"]>(
    k: K,
    v: AllPageSettings["agents"][K],
  ) => update("agents", { [k]: v } as Partial<AllPageSettings["agents"]>);

  return (
    <SectionPanel
      title="AI Agents"
      description="Agents list and management preferences."
      onReset={() => reset("agents")}
    >
      <SettingRow label="Show disabled agents" description="Include disabled agents in the agents list.">
        <Toggle value={agents.showDisabled} onChange={(v) => set("showDisabled", v)} />
      </SettingRow>
    </SectionPanel>
  );
}

function WorkflowSection() {
  const { workflow, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["workflow"]>(
    k: K,
    v: AllPageSettings["workflow"][K],
  ) => update("workflow", { [k]: v } as Partial<AllPageSettings["workflow"]>);

  return (
    <SectionPanel
      title="AI Workflow"
      description="16-step idea-to-implementation pipeline settings."
      onReset={() => reset("workflow")}
    >
      <SettingRow
        label="Auto-advance"
        description="Automatically proceed to the next step when the current one completes."
      >
        <Toggle value={workflow.autoAdvance} onChange={(v) => set("autoAdvance", v)} />
      </SettingRow>
    </SectionPanel>
  );
}

function DocsSection() {
  const { docs, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["docs"]>(
    k: K,
    v: AllPageSettings["docs"][K],
  ) => update("docs", { [k]: v } as Partial<AllPageSettings["docs"]>);

  return (
    <SectionPanel
      title="Documentation"
      description="Documentation hub editor and viewer defaults."
      onReset={() => reset("docs")}
    >
      <SettingRow label="Default mode" description="Whether docs open in preview or edit mode.">
        <SegmentedControl
          value={docs.defaultMode}
          options={[
            { value: "preview", label: "Preview" },
            { value: "edit", label: "Edit" },
          ]}
          onChange={(v) => set("defaultMode", v)}
        />
      </SettingRow>
      <SettingRow label="Line numbers" description="Show line numbers in the documentation editor.">
        <Toggle value={docs.showLineNumbers} onChange={(v) => set("showLineNumbers", v)} />
      </SettingRow>
    </SectionPanel>
  );
}

function DevlogsSection() {
  const { devlogs, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["devlogs"]>(
    k: K,
    v: AllPageSettings["devlogs"][K],
  ) => update("devlogs", { [k]: v } as Partial<AllPageSettings["devlogs"]>);

  return (
    <SectionPanel
      title="Dev Logs"
      description="Development timeline display preferences."
      onReset={() => reset("devlogs")}
    >
      <SettingRow label="Show time" description="Display the time alongside each log entry's date.">
        <Toggle value={devlogs.showTime} onChange={(v) => set("showTime", v)} />
      </SettingRow>
      <SettingRow label="Group by" description="Bucket log entries into time groups.">
        <SegmentedControl
          value={devlogs.groupBy}
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
          ]}
          onChange={(v) => set("groupBy", v)}
        />
      </SettingRow>
    </SectionPanel>
  );
}

function SyncSection() {
  const { sync, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["sync"]>(
    k: K,
    v: AllPageSettings["sync"][K],
  ) => update("sync", { [k]: v } as Partial<AllPageSettings["sync"]>);

  return (
    <SectionPanel
      title="Sync Panel"
      description="Obsidian and GitHub sync behavior."
      onReset={() => reset("sync")}
    >
      <SettingRow label="Auto-sync interval" description="How often to sync automatically in the background.">
        <SegmentedControl
          value={sync.autoSyncInterval}
          options={[
            { value: "off", label: "Off" },
            { value: "15m", label: "15 m" },
            { value: "1h", label: "1 h" },
            { value: "6h", label: "6 h" },
          ]}
          onChange={(v) => set("autoSyncInterval", v)}
        />
      </SettingRow>
      <SettingRow label="Conflict resolution" description="What to do when local and remote versions differ.">
        <SegmentedControl
          value={sync.conflictResolution}
          options={[
            { value: "ask", label: "Ask" },
            { value: "prefer-local", label: "Local" },
            { value: "prefer-remote", label: "Remote" },
          ]}
          onChange={(v) => set("conflictResolution", v)}
        />
      </SettingRow>
    </SectionPanel>
  );
}

function WatcherSection() {
  const { watcher, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["watcher"]>(
    k: K,
    v: AllPageSettings["watcher"][K],
  ) => update("watcher", { [k]: v } as Partial<AllPageSettings["watcher"]>);

  return (
    <SectionPanel
      title="Project Watcher"
      description="File system watcher defaults."
      onReset={() => reset("watcher")}
    >
      <SettingRow label="Hidden files" description="Include dot-files and hidden directories in the watch tree.">
        <Toggle value={watcher.showHiddenFiles} onChange={(v) => set("showHiddenFiles", v)} />
      </SettingRow>
      <SettingRow label="Watch depth" description="How many directory levels deep to recurse.">
        <SegmentedControl
          value={watcher.watchDepth}
          options={[
            { value: "1", label: "1" },
            { value: "3", label: "3" },
            { value: "unlimited", label: "∞" },
          ]}
          onChange={(v) => set("watchDepth", v)}
        />
      </SettingRow>
    </SectionPanel>
  );
}

function SearchSection() {
  const { search, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["search"]>(
    k: K,
    v: AllPageSettings["search"][K],
  ) => update("search", { [k]: v } as Partial<AllPageSettings["search"]>);

  return (
    <SectionPanel
      title="Semantic Search"
      description="Search mode and results defaults."
      onReset={() => reset("search")}
    >
      <SettingRow label="Default mode" description="How queries are matched against your content.">
        <SegmentedControl
          value={search.defaultMode}
          options={[
            { value: "semantic", label: "Semantic" },
            { value: "keyword", label: "Keyword" },
            { value: "hybrid", label: "Hybrid" },
          ]}
          onChange={(v) => set("defaultMode", v)}
        />
      </SettingRow>
      <SettingRow label="Results per page" description="How many results to show per page.">
        <SegmentedControl
          value={search.resultsPerPage}
          options={[
            { value: "10", label: "10" },
            { value: "20", label: "20" },
            { value: "50", label: "50" },
          ]}
          onChange={(v) => set("resultsPerPage", v)}
        />
      </SettingRow>
    </SectionPanel>
  );
}

function PluginsSection() {
  const { plugins, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["plugins"]>(
    k: K,
    v: AllPageSettings["plugins"][K],
  ) => update("plugins", { [k]: v } as Partial<AllPageSettings["plugins"]>);

  return (
    <SectionPanel
      title="Plugins"
      description="Plugin marketplace display preferences."
      onReset={() => reset("plugins")}
    >
      <SettingRow label="Show disabled plugins" description="Include disabled plugins in the marketplace list.">
        <Toggle value={plugins.showDisabled} onChange={(v) => set("showDisabled", v)} />
      </SettingRow>
    </SectionPanel>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

const SECTION_COMPONENTS: Record<Section, () => React.ReactElement> = {
  appearance: AppearanceSection,
  project: ProjectSection,
  data: DataSection,
  dashboard: DashboardSection,
  brain: BrainSection,
  specs: SpecsSection,
  standards: StandardsSection,
  architecture: ArchitectureSection,
  knowledge: KnowledgeSection,
  tasks: TasksSection,
  sprints: SprintsSection,
  chat: ChatSection,
  agents: AgentsSection,
  workflow: WorkflowSection,
  docs: DocsSection,
  devlogs: DevlogsSection,
  sync: SyncSection,
  watcher: WatcherSection,
  search: SearchSection,
  plugins: PluginsSection,
};

export function SettingsView() {
  const [active, setActive] = useState<Section>("appearance");
  const ActiveSection = SECTION_COMPONENTS[active];

  return (
    <div className="flex h-full">
      {/* Left sidebar nav */}
      <nav className="scrollbar-thin w-52 shrink-0 overflow-y-auto border-r border-border py-4">
        <div className="px-3 pb-2">
          <h1 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Settings
          </h1>
        </div>
        {NAV.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Right content panel */}
      <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
        <ActiveSection />
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ProjectForm({ project }: { project: Project }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);

  function save() {
    void projectsRepo.update(project.id, { name, description });
  }

  return (
    <div className="space-y-3">
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
    </div>
  );
}
