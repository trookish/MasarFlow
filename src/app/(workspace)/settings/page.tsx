"use client";
import * as React from "react";
import { Settings as SettingsIcon, Palette, Type, Bot, Keyboard, Database, Download, Upload, FileJson } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useUi, ACCENTS, type AccentColor, type Density, type FontChoice } from "@/lib/stores/ui";
import { useAi, type AgentProvider } from "@/lib/stores/ai";
import { ACCENT_OPTIONS } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";
import { resetSeed } from "@/lib/db/seed";
import { DataTransferDialog } from "@/components/common/data-transfer-dialog";
import { toast } from "sonner";

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const ui = useUi();
  const ai = useAi();
  const [transferOpen, setTransferOpen] = React.useState<"export" | "import" | "both" | null>(null);

  return (
    <div className="pb-10">
      <PageHeader
        icon={SettingsIcon}
        eyebrow="Settings"
        title="Preferences"
        description="Theme, typography, AI provider, keybindings, and data — all local to your machine."
      />

      <div className="grid gap-4 px-6 py-5 lg:grid-cols-2">
        <Section title="Theme" description="Dark first. Choose an accent to taste.">
          <div className="grid grid-cols-2 gap-2">
            {(["dark", "light", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => ui.setTheme(t)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                  ui.theme === t
                    ? "border-foreground/30 bg-accent"
                    : "border-border hover:border-foreground/20",
                )}
              >
                <div className="font-medium capitalize">{t}</div>
                <div className="text-[10px] text-muted-foreground">
                  {t === "dark" && "Default for MasarFlow"}
                  {t === "light" && "Bright, high contrast"}
                  {t === "system" && "Follow OS preference"}
                </div>
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ACCENT_OPTIONS.map((a) => (
              <button
                key={a}
                onClick={() => ui.setAccent(a as AccentColor)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors",
                  ui.accent === a
                    ? "border-foreground/40 bg-accent"
                    : "border-border text-muted-foreground hover:border-foreground/20",
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: `oklch(0.6 0.2 ${ACCENTS[a].hue})` }}
                />
                {ACCENTS[a].name}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Typography & density" description="Pick the font family and UI density.">
          <div className="grid grid-cols-3 gap-2">
            {(["inter", "geist", "system"] as const).map((f) => (
              <button
                key={f}
                onClick={() => ui.setFont(f as FontChoice)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                  ui.font === f
                    ? "border-foreground/30 bg-accent"
                    : "border-border hover:border-foreground/20",
                )}
              >
                <div className="font-medium capitalize">{f}</div>
                <div className="text-[10px] text-muted-foreground">
                  {f === "inter" && "Default"}
                  {f === "geist" && "Modern sans"}
                  {f === "system" && "OS native"}
                </div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["comfortable", "compact"] as const).map((d) => (
              <button
                key={d}
                onClick={() => ui.setDensity(d as Density)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                  ui.density === d
                    ? "border-foreground/30 bg-accent"
                    : "border-border hover:border-foreground/20",
                )}
              >
                <div className="font-medium capitalize">{d}</div>
                <div className="text-[10px] text-muted-foreground">
                  {d === "comfortable" && "Spacious"}
                  {d === "compact" && "Dense"}
                </div>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Shell" description="Toggle parts of the workspace shell.">
          <Row
            label="Left navigation"
            description="Sidebar with module list"
            checked={!ui.leftNavCollapsed}
            onChange={() => ui.toggleLeftNav()}
          />
          <Row
            label="Right rail"
            description="Context, AI suggestions, memory"
            checked={!ui.rightRailCollapsed}
            onChange={() => ui.toggleRightRail()}
          />
          <Row
            label="Status bar"
            description="System vitals at the bottom"
            checked={ui.statusBarVisible}
            onChange={() => ui.toggleStatusBar()}
          />
        </Section>

        <Section title="AI provider" description="Simulated by default. Plug in a real LLM with your own key (stored locally).">
          <div className="grid grid-cols-2 gap-2">
            {(["simulated", "openai", "anthropic", "google", "openrouter"] as const).map((p) => (
              <button
                key={p}
                onClick={() => ai.setProvider(p as AgentProvider)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                  ai.provider === p
                    ? "border-foreground/30 bg-accent"
                    : "border-border hover:border-foreground/20",
                )}
              >
                <div className="font-medium capitalize">{p}</div>
                <div className="text-[10px] text-muted-foreground">
                  {p === "simulated" && "Default — no key needed"}
                  {p !== "simulated" && "Bring your own key"}
                </div>
              </button>
            ))}
          </div>
          <Row
            label="Show reasoning"
            description="Display agent thought process"
            checked={ai.showReasoning}
            onChange={() => ai.setShowReasoning(!ai.showReasoning)}
          />
          <div className="grid grid-cols-3 gap-2">
            {(["fast", "normal", "slow"] as const).map((s) => (
              <button
                key={s}
                onClick={() => ai.setStreamingSpeed(s)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                  ai.streamingSpeed === s
                    ? "border-foreground/30 bg-accent"
                    : "border-border hover:border-foreground/20",
                )}
              >
                <div className="font-medium capitalize">{s}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Data" description="Your data lives in this browser. Export anytime.">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="soft" size="sm">
              Export JSON
            </Button>
            <Button variant="soft" size="sm">
              Import JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await resetSeed();
                toast.success("Seed data reset", { description: "The project will reload." });
                setTimeout(() => location.reload(), 600);
              }}
            >
              Reset seed
            </Button>
            <Badge variant="ghost" className="ml-auto">
              <Database className="h-3 w-3" /> IndexedDB · masarflow
            </Badge>
          </div>
        </Section>

        <Section title="Keyboard shortcuts" description="The full set, always one keypress away.">
          <Button variant="soft" size="sm" onClick={() => ui.setShortcutsOpen(true)}>
            <Keyboard className="h-3.5 w-3.5" /> Open cheatsheet
          </Button>
        </Section>
      </div>
      <DataTransferDialog open={transferOpen !== null} onOpenChange={(o) => { if (!o) setTransferOpen(null); }} mode={transferOpen ?? "both"} />
    </div>
  );
}

function Row({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5">
      <div>
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
