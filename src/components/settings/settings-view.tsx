"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Moon,
  Sun,
  Monitor,
  Contrast,
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
  Sparkles,
  LayoutTemplate,
  Cpu,
  Gauge,
  Minus,
  Plus,
  Pencil,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import {
  ACCENT_PRESETS,
  GRADIENT_PRESETS,
  useThemeStore,
  gradientCss,
  type ThemeMode,
  type AccentMode,
  type LogoColorMode,
  type LogoBgMode,
} from "@/lib/stores/theme";
import { MasarFlowLogo } from "@/components/shell/logo";
import { useProjectStore } from "@/lib/stores/project";
import { useActiveProject, useActiveProjectId } from "@/lib/hooks/use-project";
import { reindexProject } from "@/lib/ai/embedding-sync";
import { useMounted } from "@/lib/hooks/use-mounted";
import {
  usePageSettings,
  type PageKey,
  type AllPageSettings,
} from "@/lib/stores/page-settings";
import {
  useAgentSettings,
  type AgentSettingsState,
} from "@/lib/stores/agent-settings";
import { DEFAULT_AGENT_CONFIG } from "@/lib/ai/agent";
import { projectsRepo, categoriesRepo } from "@/lib/db/repos";
import type { Project } from "@/lib/db/schema";
import { resetData } from "@/lib/db/data";
import { seedDemoProject } from "@/lib/db/demo-seed";
import { useProjectConfirmStore } from "@/lib/stores/project-confirm";
import { useUpdatesStore } from "@/lib/stores/updates";
import { UpdateDialog } from "@/components/shell/update-dialog";
import {
  ProjectFields,
  type ProjectFieldValues,
} from "@/components/shell/project-fields";
import { NewProjectDialog } from "@/components/shell/new-project-dialog";
import {
  RemoveProjectDialog,
  removeProjectQuietly,
} from "@/components/shell/remove-project-dialog";
import { GradientEditorDialog } from "@/components/settings/gradient-editor-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

type GlobalSection = "appearance" | "project" | "data" | "ai-service" | "agent";
type Section = GlobalSection | PageKey | "updates";

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
  // ── Capture: where information is recorded and stored ────────────────────
  {
    label: "Capture",
    items: [
      { id: "brain", label: "Brain", icon: BrainCircuit },
      { id: "docs", label: "Documentation", icon: BookOpen },
      { id: "canvas", label: "Canvas", icon: LayoutTemplate },
    ],
  },
  // ── Planning: what to build and the rules it must follow ──────────────────
  {
    label: "Planning",
    items: [
      { id: "specs", label: "Specifications", icon: FileText },
      { id: "standards", label: "Standards", icon: ShieldCheck },
    ],
  },
  // ── Work: tracking execution and its history ─────────────────────────────
  {
    label: "Work",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "tasks", label: "Task Boards", icon: KanbanSquare },
      { id: "sprints", label: "Sprints", icon: Flag },
      { id: "devlogs", label: "Dev Logs", icon: ScrollText },
    ],
  },
  // ── Structure: structural and relational maps of the project ─────────────
  {
    label: "Structure",
    items: [
      { id: "architecture", label: "Architecture", icon: Boxes },
      { id: "knowledge", label: "Knowledge Graph", icon: Share2 },
    ],
  },
  // ── AI: assisted thinking — conversation, agents, pipeline ───────────────
  {
    label: "AI",
    items: [
      { id: "chat", label: "Chat", icon: MessageSquare },
      { id: "agent", label: "Agent Loop", icon: Gauge },
      { id: "agents", label: "AI Agents", icon: Bot },
      { id: "workflow", label: "AI Workflow", icon: Workflow },
      { id: "ai-service", label: "Local AI Service", icon: Cpu },
    ],
  },
  // ── System: integrations, tools, and configuration ───────────────────────
  {
    label: "System",
    items: [
      { id: "updates", label: "Updates", icon: RefreshCw },
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
  actions,
  children,
}: {
  title: string;
  description?: string;
  onReset?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
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
      </div>
      <Card>
        <CardContent className="divide-y-0 p-4">{children}</CardContent>
      </Card>
    </div>
  );
}

// ─── Global sections ──────────────────────────────────────────────────────────

const MODE_OPTIONS: { value: ThemeMode; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "amoled", label: "AMOLED", icon: Contrast },
  { value: "system", label: "System", icon: Monitor },
];

function AppearanceSection() {
  const mounted = useMounted();
  const s = useThemeStore();
  const [gradientDialog, setGradientDialog] = useState(false);

  if (!mounted) {
    return (
      <SectionPanel title="Appearance" description="Theme, accent, and layout.">
        {null}
      </SectionPanel>
    );
  }

  return (
    <SectionPanel
      title="Appearance"
      description="Theme, accent, and layout — applied across the whole app."
      onReset={s.reset}
    >
      {/* Color scheme */}
      <SettingRow
        label="Color scheme"
        description="Light, dark, pure-black AMOLED, or follow the OS."
      >
        <div className="flex flex-wrap gap-1">
          {MODE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <Button
                key={opt.value}
                size="sm"
                variant={s.mode === opt.value ? "default" : "outline"}
                onClick={() => s.setMode(opt.value)}
              >
                <Icon className="h-3.5 w-3.5" /> {opt.label}
              </Button>
            );
          })}
        </div>
      </SettingRow>

      {/* Accent style */}
      <SettingRow
        label="Accent style"
        description="A single solid color or a multi-stop gradient."
      >
        <SegmentedControl<AccentMode>
          value={s.accentMode}
          options={[
            { value: "solid", label: "Solid" },
            { value: "gradient", label: "Gradient" },
          ]}
          onChange={s.setAccentMode}
        />
      </SettingRow>

      {/* Solid controls */}
      {s.accentMode === "solid" && (
        <>
          <SettingRow
            label="Accent color"
            description="Pick a preset or enter any custom color."
          >
            <div className="flex max-w-[15rem] flex-wrap justify-end gap-2">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => s.setAccentColor(p.color)}
                  aria-label={p.name}
                  title={p.name}
                  style={{ backgroundColor: p.color }}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110",
                    s.accentColor.toLowerCase() === p.color.toLowerCase() &&
                      "ring-2 ring-ring ring-offset-2 ring-offset-card",
                  )}
                >
                  {s.accentColor.toLowerCase() === p.color.toLowerCase() && (
                    <Check className="h-3.5 w-3.5 text-white mix-blend-difference" />
                  )}
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingRow
            label="Custom color"
            description="Exact hex value for the accent."
          >
            <ColorField value={s.accentColor} onChange={s.setAccentColor} />
          </SettingRow>
        </>
      )}

      {/* Gradient controls */}
      {s.accentMode === "gradient" && (
        <>
          <SettingRow
            label="Gradient presets"
            description="Quick-start gradients; open the editor for a custom one."
          >
            <div className="flex max-w-[15rem] flex-wrap justify-end gap-2">
              {GRADIENT_PRESETS.map((g) => {
                const active =
                  s.gradientStops.length === 2 &&
                  s.gradientStops[0].color.toLowerCase() ===
                    g.from.toLowerCase() &&
                  s.gradientStops[1].color.toLowerCase() === g.to.toLowerCase();
                return (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => s.applyGradientPreset(g)}
                    aria-label={g.name}
                    title={g.name}
                    style={{
                      backgroundImage: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`,
                    }}
                    className={cn(
                      "h-7 w-10 rounded-md transition-transform hover:scale-110",
                      active &&
                        "ring-2 ring-ring ring-offset-2 ring-offset-card",
                    )}
                  />
                );
              })}
            </div>
          </SettingRow>
          <SettingRow
            label="Custom gradient"
            description={
              s.gradientStops.length > 2 ||
              s.gradientStops[0]?.position !== 0 ||
              s.gradientStops[s.gradientStops.length - 1]?.position !== 100
                ? `${s.gradientStops.length} stops — edit or reset from a preset.`
                : "Add as many color stops as you like, drag them, and remove them — just like a game-engine gradient editor."
            }
          >
            <div className="flex items-center gap-2">
              <span
                className="h-7 w-16 rounded-md border border-border shadow-inner"
                style={{
                  backgroundImage: gradientCss(
                    s.gradientStops,
                    s.gradientAngle,
                  ),
                }}
                aria-hidden
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGradientDialog(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Custom…
              </Button>
            </div>
          </SettingRow>
          <SettingRow
            label="Angle"
            description={`Direction of the gradient (${s.gradientAngle}°).`}
          >
            <RangeField
              min={0}
              max={360}
              step={5}
              value={s.gradientAngle}
              onChange={s.setGradientAngle}
            />
          </SettingRow>
        </>
      )}

      {/* Corner radius */}
      <SettingRow
        label="Corner radius"
        description={`Roundness of cards, buttons, and inputs (${s.radius.toFixed(2)} rem).`}
      >
        <RangeField
          min={0}
          max={1.5}
          step={0.0625}
          value={s.radius}
          onChange={s.setRadius}
        />
      </SettingRow>

      {/* UI scale */}
      <SettingRow
        label="UI scale"
        description={`Overall interface size (${Math.round(s.fontScale * 100)}%).`}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Decrease UI scale"
            onClick={() => s.setFontScale(Math.max(0.85, s.fontScale - 0.05))}
            disabled={s.fontScale <= 0.85}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-14 text-center text-sm font-medium tabular-nums">
            {Math.round(s.fontScale * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Increase UI scale"
            onClick={() => s.setFontScale(Math.min(1.25, s.fontScale + 0.05))}
            disabled={s.fontScale >= 1.25}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SettingRow>

      {/* Logo color */}
      <SettingRow
        label="Logo color"
        description="Keep the original artwork, follow the accent, or pick a custom color."
      >
        <div className="flex items-center gap-3">
          <MasarFlowLogo className="h-8 w-8 border border-border" />
          <SegmentedControl<LogoColorMode>
            value={s.logoColorMode}
            options={[
              { value: "original", label: "Original" },
              { value: "accent", label: "Accent" },
              { value: "custom", label: "Custom" },
            ]}
            onChange={s.setLogoColorMode}
          />
        </div>
      </SettingRow>
      {s.logoColorMode === "custom" && (
        <SettingRow
          label="Logo custom color"
          description="Exact color for the logo mark."
        >
          <ColorField value={s.logoColor} onChange={s.setLogoColor} />
        </SettingRow>
      )}

      {/* Logo background */}
      <SettingRow
        label="Logo background"
        description="Fill behind the logo: transparent, white, the accent, or custom."
      >
        <SegmentedControl<LogoBgMode>
          value={s.logoBgMode}
          options={[
            { value: "none", label: "None" },
            { value: "white", label: "White" },
            { value: "accent", label: "Accent" },
            { value: "custom", label: "Custom" },
          ]}
          onChange={s.setLogoBgMode}
        />
      </SettingRow>
      {s.logoBgMode === "custom" && (
        <SettingRow
          label="Logo background color"
          description="Exact fill behind the logo."
        >
          <ColorField value={s.logoBgColor} onChange={s.setLogoBgColor} />
        </SettingRow>
      )}

      {/* Live preview */}
      <SettingRow
        label="Preview"
        description="A live sample of the current accent."
      >
        <div className="flex items-center gap-2">
          <Button size="sm" className="bg-primary text-primary-foreground">
            Primary
          </Button>
          <span
            className={cn(
              "rounded-md border border-border px-2 py-1 text-xs font-medium",
              s.accentMode === "gradient"
                ? "accent-gradient-text"
                : "text-primary",
            )}
          >
            Accent text
          </span>
          <span className="accent-gradient-bg h-7 w-7 rounded-full" />
        </div>
      </SettingRow>
      {gradientDialog && (
        <GradientEditorDialog open onClose={() => setGradientDialog(false)} />
      )}
    </SectionPanel>
  );
}

// Native color picker + hex text input, kept in sync.
function ColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [text, setText] = useState(value);
  // Reflect external changes (preset/swatch clicks) into the text field —
  // render-phase state adjustment per the React "derived state" pattern.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setText(value);
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setText(e.target.value);
        }}
        aria-label="Color picker"
        className="h-7 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
      />
      <Input
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
        }}
        onBlur={() => setText(value)}
        placeholder="#dedede"
        className="h-7 w-24 font-mono text-xs"
      />
    </div>
  );
}

function RangeField({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
    />
  );
}

function ProjectSection() {
  const project = useActiveProject();
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  return (
    <>
      <SectionPanel
        title="Active Project"
        description="Edit the active project's identity, description, and tags."
        actions={
          project ? (
            <>
              <Button
                variant="outline"
                size="sm"
                aria-label="Edit project in dialog"
                title="Edit project"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label="Delete project"
                title="Delete project"
                onClick={() => void handleRemove(project)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : undefined
        }
      >
        {project ? (
          <ProjectForm key={project.id} project={project} />
        ) : (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No active project selected.
          </p>
        )}
      </SectionPanel>

      <NewProjectDialog
        key={project?.id ?? "create"}
        open={editing && Boolean(project)}
        project={project ?? null}
        onOpenChange={(open) => {
          if (!open) setEditing(false);
        }}
        onCreated={() => setEditing(false)}
      />

      <RemoveProjectDialog
        open={removing && Boolean(project)}
        project={project ?? null}
        onOpenChange={(open) => {
          if (!open) setRemoving(false);
        }}
        onRemoved={() => {
          setActiveProjectId(null);
          setRemoving(false);
        }}
      />
    </>
  );

  async function handleRemove(p: Project) {
    const removed = await removeProjectQuietly(p);
    if (!removed) setRemoving(true);
  }
}

function DataSection() {
  const router = useRouter();
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);
  const [confirmReset, setConfirmReset] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const skipDeleteConfirm = useProjectConfirmStore(
    (s) => s.skipProjectDeleteConfirm,
  );
  const setSkipDeleteConfirm = useProjectConfirmStore(
    (s) => s.setSkipProjectDeleteConfirm,
  );

  async function loadDemo() {
    setSeeding(true);
    try {
      const id = await seedDemoProject();
      setActiveProjectId(id);
      router.push("/dashboard");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <>
      <SectionPanel
        title="Data Management"
        description="Everything lives in your browser (IndexedDB). Load a demo project to see every feature in action, or reset to start clean."
      >
        <SettingRow
          label="Load demo projects"
          description="Seeds three sample projects — Pulse (a web app), Lumen (a Unity game), and DraftDeck (a desktop app) — each with notes, specs, tasks, sprints, systems, docs, commits, a canvas, and an AI chat, all interlinked. Safe to run; never duplicates."
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadDemo()}
            disabled={seeding}
          >
            <Sparkles className="h-3.5 w-3.5" />{" "}
            {seeding ? "Loading…" : "Load demo projects"}
          </Button>
        </SettingRow>
        <SettingRow
          label="Confirm before deleting projects"
          description="Show a confirmation dialog when removing a project from the switcher or settings. Off = projects delete immediately."
        >
          <Toggle
            value={!skipDeleteConfirm}
            onChange={(v) => setSkipDeleteConfirm(!v)}
          />
        </SettingRow>
        <SettingRow
          label="Reset"
          description="Permanently delete every project, note, spec, and task in this browser."
        >
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
      <SettingRow
        label="Metrics cards"
        description="Show health score, arch score, and tech-debt cards."
      >
        <Toggle
          value={dashboard.showMetrics}
          onChange={(v) => set("showMetrics", v)}
        />
      </SettingRow>
      <SettingRow
        label="Recent activity"
        description="Show the recent-activity feed."
      >
        <Toggle
          value={dashboard.showActivity}
          onChange={(v) => set("showActivity", v)}
        />
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
      <SettingRow
        label="Default view"
        description="Which sub-view opens when you navigate to Brain."
      >
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
      <SettingRow
        label="Word count"
        description="Show word count in the note editor toolbar."
      >
        <Toggle
          value={brain.showWordCount}
          onChange={(v) => set("showWordCount", v)}
        />
      </SettingRow>
      <SettingRow
        label="Line wrap"
        description="Wrap long lines in the editor instead of scrolling."
      >
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
      <SettingRow
        label="Default sort"
        description="How specs are ordered when you open the page."
      >
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
      <SettingRow
        label="Show completed"
        description="Include specs with status 'done' in the list."
      >
        <Toggle
          value={specs.showCompleted}
          onChange={(v) => set("showCompleted", v)}
        />
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
      <SettingRow
        label="Auto-validate"
        description="Run the deterministic enforcer automatically on save."
      >
        <Toggle
          value={standards.autoValidate}
          onChange={(v) => set("autoValidate", v)}
        />
      </SettingRow>
      <SettingRow
        label="Line numbers"
        description="Show line numbers in the standards editor."
      >
        <Toggle
          value={standards.showLineNumbers}
          onChange={(v) => set("showLineNumbers", v)}
        />
      </SettingRow>
    </SectionPanel>
  );
}

function ArchitectureSection() {
  const { architecture, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["architecture"]>(
    k: K,
    v: AllPageSettings["architecture"][K],
  ) =>
    update("architecture", { [k]: v } as Partial<
      AllPageSettings["architecture"]
    >);

  return (
    <SectionPanel
      title="Architecture"
      description="Diagram visualization defaults."
      onReset={() => reset("architecture")}
    >
      <SettingRow
        label="Layout algorithm"
        description="How nodes are arranged on the diagram."
      >
        <SegmentedControl
          value={architecture.layout}
          options={[
            { value: "force", label: "Force" },
            { value: "dagre", label: "Dagre" },
          ]}
          onChange={(v) => set("layout", v)}
        />
      </SettingRow>
      <SettingRow
        label="Node labels"
        description="Show label text inside each node."
      >
        <Toggle
          value={architecture.showNodeLabels}
          onChange={(v) => set("showNodeLabels", v)}
        />
      </SettingRow>
      <SettingRow
        label="Edge labels"
        description="Show label text on diagram edges."
      >
        <Toggle
          value={architecture.showEdgeLabels}
          onChange={(v) => set("showEdgeLabels", v)}
        />
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
      <SettingRow
        label="Layout algorithm"
        description="How nodes are positioned in the graph."
      >
        <SegmentedControl
          value={knowledge.layout}
          options={[
            { value: "force", label: "Force" },
            { value: "radial", label: "Radial" },
          ]}
          onChange={(v) => set("layout", v)}
        />
      </SettingRow>
      <SettingRow
        label="Orphan nodes"
        description="Show nodes with no connections."
      >
        <Toggle
          value={knowledge.showOrphans}
          onChange={(v) => set("showOrphans", v)}
        />
      </SettingRow>
      <SettingRow
        label="Edge labels"
        description="Show relation type labels on edges."
      >
        <Toggle
          value={knowledge.showEdgeLabels}
          onChange={(v) => set("showEdgeLabels", v)}
        />
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
      <SettingRow
        label="Show completed"
        description="Keep 'Done' tasks visible on the board."
      >
        <Toggle
          value={tasks.showCompleted}
          onChange={(v) => set("showCompleted", v)}
        />
      </SettingRow>
      <SettingRow
        label="Default grouping"
        description="How tasks are grouped when the board first loads."
      >
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
      <SettingRow
        label="Show completed"
        description="Include finished sprints in the list."
      >
        <Toggle
          value={sprints.showCompleted}
          onChange={(v) => set("showCompleted", v)}
        />
      </SettingRow>
      <SettingRow
        label="Velocity display"
        description="Unit used when showing sprint velocity."
      >
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
      <SettingRow
        label="Timestamps"
        description="Show the time each message was sent."
      >
        <Toggle
          value={chat.showTimestamps}
          onChange={(v) => set("showTimestamps", v)}
        />
      </SettingRow>
      <SettingRow
        label="Code highlighting"
        description="Syntax-highlight code blocks in responses."
      >
        <Toggle
          value={chat.codeHighlighting}
          onChange={(v) => set("codeHighlighting", v)}
        />
      </SettingRow>
      <SettingRow
        label="Default AI backend"
        description="Which backend new chats start on: the OpenCode server, a saved API connection, or local Ollama. Switchable per-chat from the chat header."
      >
        <SegmentedControl
          value={chat.defaultBackend}
          options={[
            { value: "opencode", label: "OpenCode" },
            { value: "api", label: "API" },
            { value: "ollama", label: "Ollama" },
          ]}
          onChange={(v) => set("defaultBackend", v)}
        />
      </SettingRow>
      <SettingRow
        label="Message density"
        description="Spacing between messages in the conversation."
      >
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

/** Number field bound to one agent-settings value (display units in/out). */
function NumberSetting({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      value={Number.isFinite(value) ? value : min}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
      }}
      className="h-8 w-24 text-right text-sm"
    />
  );
}

function AgentSection() {
  const s = useAgentSettings();
  const set = (patch: Partial<Omit<AgentSettingsState, "set">>) => s.set(patch);

  return (
    <SectionPanel
      title="Agent Loop"
      description="Safety limits for every AI agent run (chat, agents, workflow). The model decides what to do; these bounds decide when it must stop — the agent stops cleanly and explains when one trips."
      onReset={() => s.set(DEFAULT_AGENT_CONFIG)}
    >
      <SettingRow
        label="Max iterations"
        description={`Model ↔ tool round-trips per turn (${s.maxIterations}). Prevents a tool-looping model from running forever.`}
      >
        <NumberSetting
          value={s.maxIterations}
          min={1}
          max={100}
          onChange={(v) => set({ maxIterations: v })}
        />
      </SettingRow>
      <SettingRow
        label="Max runtime"
        description={`Overall wall-clock budget per run, in minutes (${Math.round(s.maxRunMs / 60000)}m).`}
      >
        <NumberSetting
          value={Math.round(s.maxRunMs / 60000)}
          min={1}
          max={60}
          onChange={(v) => set({ maxRunMs: v * 60000 })}
        />
      </SettingRow>
      <SettingRow
        label="Max tool time"
        description={`Per-tool execution budget, in seconds (${Math.round(s.maxToolMs / 1000)}s). Slower tools fail back to the model with a timeout error.`}
      >
        <NumberSetting
          value={Math.round(s.maxToolMs / 1000)}
          min={1}
          max={300}
          onChange={(v) => set({ maxToolMs: v * 1000 })}
        />
      </SettingRow>
      <SettingRow
        label="Max shell commands"
        description={`Shell command executions per run (${s.maxShellCommands}). Stops the agent at the limit so a command-happy model can't bury the machine.`}
      >
        <NumberSetting
          value={s.maxShellCommands}
          min={0}
          max={200}
          onChange={(v) => set({ maxShellCommands: v })}
        />
      </SettingRow>
      <SettingRow
        label="Max file modifications"
        description={`File writes per run (${s.maxFileModifications}). Stops the agent at the limit before it rewrites half the project.`}
      >
        <NumberSetting
          value={s.maxFileModifications}
          min={0}
          max={200}
          onChange={(v) => set({ maxFileModifications: v })}
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
      <SettingRow
        label="Show disabled agents"
        description="Include disabled agents in the agents list."
      >
        <Toggle
          value={agents.showDisabled}
          onChange={(v) => set("showDisabled", v)}
        />
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
        <Toggle
          value={workflow.autoAdvance}
          onChange={(v) => set("autoAdvance", v)}
        />
      </SettingRow>
    </SectionPanel>
  );
}

function AiServiceSection() {
  const projectId = useActiveProjectId();
  const [health, setHealth] = useState<
    | { checked: false }
    | { checked: true; ok: boolean; ollamaAvailable: boolean }
  >({ checked: false });
  const [reindexing, setReindexing] = useState(false);
  const [lastReindexed, setLastReindexed] = useState<number | null>(null);

  async function checkHealth() {
    try {
      const res = await fetch("/api/python/health");
      const data = (await res.json()) as {
        ok?: boolean;
        ollama?: { available?: boolean };
      };
      setHealth({
        checked: true,
        ok: data.ok === true,
        ollamaAvailable: data.ollama?.available === true,
      });
    } catch {
      setHealth({ checked: true, ok: false, ollamaAvailable: false });
    }
  }

  useEffect(() => {
    // Deferred via a microtask (rather than an immediate `void checkHealth()`)
    // so this effect never synchronously triggers a setState call.
    void Promise.resolve().then(() => checkHealth());
  }, []);

  async function runReindex() {
    if (!projectId) return;
    setReindexing(true);
    try {
      await reindexProject(projectId);
      setLastReindexed(Date.now());
      await checkHealth();
    } finally {
      setReindexing(false);
    }
  }

  return (
    <SectionPanel
      title="Local AI Service"
      description="The local Python service (python-service/) powers semantic search, RAG-grounded chat, code analysis, and graph intelligence. It's a required runtime — the workspace won't open without it."
    >
      <SettingRow
        label="Status"
        description="Whether the local service — and Ollama, for local model chat — are reachable."
      >
        <div className="flex items-center gap-2 text-xs">
          {!health.checked ? (
            <span className="text-muted-foreground">Checking…</span>
          ) : health.ok ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{" "}
              Connected
              {health.ollamaAvailable ? " · Ollama detected" : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />{" "}
              Not running
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => void checkHealth()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SettingRow>
      <SettingRow
        label="Reindex workspace"
        description={
          lastReindexed
            ? `Last reindexed ${new Date(lastReindexed).toLocaleTimeString()}. Notes, specs, tasks, docs, and more are also reindexed automatically every ~10 minutes.`
            : "Sends the current workspace to the local service for embedding. Also runs automatically every ~10 minutes."
        }
      >
        <Button
          variant="outline"
          size="sm"
          disabled={!projectId || !health.checked || !health.ok || reindexing}
          onClick={() => void runReindex()}
        >
          <Cpu className="h-3.5 w-3.5" />{" "}
          {reindexing ? "Reindexing…" : "Reindex now"}
        </Button>
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
      <SettingRow
        label="Default mode"
        description="Whether docs open in preview or edit mode."
      >
        <SegmentedControl
          value={docs.defaultMode}
          options={[
            { value: "preview", label: "Preview" },
            { value: "edit", label: "Edit" },
          ]}
          onChange={(v) => set("defaultMode", v)}
        />
      </SettingRow>
      <SettingRow
        label="Line numbers"
        description="Show line numbers in the documentation editor."
      >
        <Toggle
          value={docs.showLineNumbers}
          onChange={(v) => set("showLineNumbers", v)}
        />
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
      <SettingRow
        label="Show time"
        description="Display the time alongside each log entry's date."
      >
        <Toggle value={devlogs.showTime} onChange={(v) => set("showTime", v)} />
      </SettingRow>
      <SettingRow
        label="Group by"
        description="Bucket log entries into time groups."
      >
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
      description="Local (in-browser) or Obsidian vault sync behavior."
      onReset={() => reset("sync")}
    >
      <SettingRow
        label="Sync target"
        description="Keep the vault index in the browser, or push to a real Obsidian vault."
      >
        <SegmentedControl
          value={sync.mode}
          options={[
            { value: "local", label: "Local" },
            { value: "obsidian", label: "Obsidian" },
          ]}
          onChange={(v) => set("mode", v)}
        />
      </SettingRow>
      <SettingRow
        label="Auto-sync interval"
        description="How often to sync automatically in the background."
      >
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
      <SettingRow
        label="Conflict resolution"
        description="What to do when local and remote versions differ."
      >
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
      <SettingRow
        label="Hidden files"
        description="Include dot-files and hidden directories in the watch tree."
      >
        <Toggle
          value={watcher.showHiddenFiles}
          onChange={(v) => set("showHiddenFiles", v)}
        />
      </SettingRow>
      <SettingRow
        label="Watch depth"
        description="How many directory levels deep to recurse."
      >
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
      <SettingRow
        label="Default mode"
        description="How queries are matched against your content."
      >
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
      <SettingRow
        label="Results per page"
        description="How many results to show per page."
      >
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

function UpdatesSection() {
  const info = useUpdatesStore((s) => s.info);
  const state = useUpdatesStore((s) => s.state);
  const lastCheckedAt = useUpdatesStore((s) => s.lastCheckedAt);
  const autoCheck = useUpdatesStore((s) => s.autoCheck);
  const setAutoCheck = useUpdatesStore((s) => s.setAutoCheck);
  const check = useUpdatesStore((s) => s.check);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <SectionPanel
        title="Updates"
        description="Compare this app against MasarFlow releases and commits on GitHub."
      >
        <SettingRow
          label="Check for updates on startup"
          description="Automatically run an update check when the app opens; the topbar shows a dot when a newer release exists."
        >
          <Toggle value={autoCheck} onChange={setAutoCheck} />
        </SettingRow>
        <SettingRow
          label="Check for updates"
          description={
            lastCheckedAt
              ? `Last checked ${new Date(lastCheckedAt).toLocaleString()}.`
              : "Fetches the latest release and commit from the MasarFlow GitHub repository."
          }
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => void check()}
            disabled={state === "checking"}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                state === "checking" && "animate-spin",
              )}
            />
            {state === "checking" ? "Checking…" : "Check now"}
          </Button>
        </SettingRow>
        {info ? (
          <SettingRow
            label="Latest release"
            description={
              info.error
                ? `Check failed — ${info.error}`
                : info.updateAvailable
                  ? `v${info.latestVersion} is available — you're on v${info.currentVersion}.`
                  : `You're on the latest release (v${info.currentVersion}).`
            }
          >
            {info.releaseUrl ? (
              <a href={info.releaseUrl} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3.5 w-3.5" /> View on GitHub
                </Button>
              </a>
            ) : (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  info.updateAvailable
                    ? "bg-primary/15 text-primary"
                    : "bg-success/15 text-success",
                )}
              >
                {info.updateAvailable ? "Update available" : "Up to date"}
              </span>
            )}
          </SettingRow>
        ) : null}
        <SettingRow
          label="Release notes"
          description="Read the latest release's changes and downloads."
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            <ScrollText className="h-3.5 w-3.5" /> Details
          </Button>
        </SettingRow>
      </SectionPanel>

      <UpdateDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
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
      <SettingRow
        label="Show disabled plugins"
        description="Include disabled plugins in the marketplace list."
      >
        <Toggle
          value={plugins.showDisabled}
          onChange={(v) => set("showDisabled", v)}
        />
      </SettingRow>
    </SectionPanel>
  );
}

function CanvasSection() {
  const { canvas, update, reset } = usePageSettings();
  const set = <K extends keyof AllPageSettings["canvas"]>(
    k: K,
    v: AllPageSettings["canvas"][K],
  ) => update("canvas", { [k]: v } as Partial<AllPageSettings["canvas"]>);

  return (
    <SectionPanel
      title="Canvas"
      description="Visual canvas display, snapping, and performance defaults."
      onReset={() => reset("canvas")}
    >
      <SettingRow
        label="Background grid"
        description="Show a dot grid on the canvas background."
      >
        <Toggle value={canvas.showGrid} onChange={(v) => set("showGrid", v)} />
      </SettingRow>
      <SettingRow
        label="Grid size"
        description="Spacing between grid dots, in pixels."
      >
        <SegmentedControl
          value={String(canvas.gridSize) as "16" | "20" | "24" | "32"}
          options={[
            { value: "16", label: "16" },
            { value: "20", label: "20" },
            { value: "24", label: "24" },
            { value: "32", label: "32" },
          ]}
          onChange={(v) => set("gridSize", Number(v))}
        />
      </SettingRow>
      <SettingRow
        label="Snap to grid"
        description="Align nodes to the grid when dragging."
      >
        <Toggle
          value={canvas.snapToGrid}
          onChange={(v) => set("snapToGrid", v)}
        />
      </SettingRow>
      <SettingRow
        label="Snap to objects"
        description="Show alignment guides near other nodes."
      >
        <Toggle
          value={canvas.snapToObjects}
          onChange={(v) => set("snapToObjects", v)}
        />
      </SettingRow>
      <SettingRow
        label="Card shadows"
        description="Render subtle shadows under canvas cards."
      >
        <Toggle
          value={canvas.cardShadows}
          onChange={(v) => set("cardShadows", v)}
        />
      </SettingRow>
      <SettingRow
        label="LOD threshold"
        description={`Below this zoom level, cards render simplified previews (${Math.round(canvas.lodThreshold * 100)}%).`}
      >
        <RangeField
          min={0.1}
          max={1}
          step={0.1}
          value={canvas.lodThreshold}
          onChange={(v) => set("lodThreshold", v)}
        />
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
  agent: AgentSection,
  agents: AgentsSection,
  workflow: WorkflowSection,
  "ai-service": AiServiceSection,
  docs: DocsSection,
  devlogs: DevlogsSection,
  sync: SyncSection,
  watcher: WatcherSection,
  search: SearchSection,
  updates: UpdatesSection,
  canvas: CanvasSection,
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
  const [fields, setFields] = useState<ProjectFieldValues>({
    name: project.name,
    icon: project.icon,
    iconImage: project.iconImage,
    accent: project.accent,
    description: project.description,
    tags: project.tags,
    category: project.category,
    banner: project.banner,
    bannerMode: project.bannerMode,
    bannerBlur: project.bannerBlur,
    bannerBrightness: project.bannerBrightness,
  });
  const [saved, setSaved] = useState(false);
  const projectCategories = useLiveQuery(
    () => categoriesRepo.listByProject(project.id),
    [project.id],
  );

  async function addCategory(name: string) {
    await categoriesRepo.ensure(project.id, name);
  }

  function save() {
    const trimmed = fields.name.trim();
    void projectsRepo.update(project.id, {
      name: trimmed || project.name,
      icon: fields.icon,
      iconImage: fields.iconImage,
      accent: fields.accent,
      description: fields.description,
      tags: fields.tags,
      category: fields.category,
      banner: fields.banner,
      bannerMode: fields.bannerMode,
      bannerBlur: fields.bannerBlur,
      bannerBrightness: fields.bannerBrightness,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-3">
      <ProjectFields
        value={fields}
        onChange={(patch) => setFields((f) => ({ ...f, ...patch }))}
        categories={(projectCategories ?? []).map((c) => c.name)}
        onAddCategory={addCategory}
      />
      <div className="flex items-center justify-end gap-3">
        {saved ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        ) : null}
        <Button size="sm" onClick={save}>
          Save project
        </Button>
      </div>
    </div>
  );
}
