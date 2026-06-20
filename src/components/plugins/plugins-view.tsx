"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plug,
  Search,
  Settings2,
  Trash2,
  Check,
  RefreshCw,
  GitBranch,
  Network,
  SpellCheck,
  Hash,
  KanbanSquare,
  CalendarDays,
  Timer,
  FileDown,
  type LucideIcon,
} from "lucide-react";
import { pluginsRepo } from "@/lib/db/repos";
import type { PluginState } from "@/lib/db/schema";
import {
  PLUGIN_CATALOG,
  PLUGIN_CATEGORIES,
  filterPlugins,
  defaultSettings,
  type PluginDef,
  type PluginSettings,
} from "@/lib/plugins";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { PluginSettingsDialog } from "./plugin-settings-dialog";

const ICONS: Record<string, LucideIcon> = {
  refresh: RefreshCw,
  github: GitBranch,
  network: Network,
  spellcheck: SpellCheck,
  hash: Hash,
  kanban: KanbanSquare,
  calendar: CalendarDays,
  timer: Timer,
  filedown: FileDown,
};

export function PluginsView() {
  const projectId = useActiveProjectId();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [installedOnly, setInstalledOnly] = useState(false);
  const [configuring, setConfiguring] = useState<{
    plugin: PluginDef;
    state: PluginState;
  } | null>(null);

  const states = useLiveQuery(
    () => pluginsRepo.listByProject(projectId),
    [projectId],
  );
  const stateByPlugin = useMemo(
    () => new Map((states ?? []).map((s) => [s.pluginId, s])),
    [states],
  );
  const installedIds = useMemo(
    () => new Set(stateByPlugin.keys()),
    [stateByPlugin],
  );

  const visible = useMemo(
    () =>
      filterPlugins(PLUGIN_CATALOG, {
        query,
        category,
        installedIds,
        installedOnly,
      }),
    [query, category, installedIds, installedOnly],
  );

  async function install(plugin: PluginDef) {
    if (!projectId) return;
    await pluginsRepo.install(projectId, plugin.id, defaultSettings(plugin));
  }
  async function uninstall(state: PluginState) {
    await pluginsRepo.uninstall(state.id);
  }
  async function toggleEnabled(state: PluginState) {
    await pluginsRepo.setEnabled(state.id, !state.enabled);
  }
  async function saveSettings(state: PluginState, settings: PluginSettings) {
    await pluginsRepo.updateSettings(state.id, settings);
    setConfiguring(null);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <Plug className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Plugins</span>
        <span className="text-xs text-muted-foreground">
          {installedIds.size} installed
        </span>
        <div className="relative ml-auto w-56">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plugins…"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-4 py-2">
        <FilterChip
          label="All"
          active={category === null && !installedOnly}
          onClick={() => {
            setCategory(null);
            setInstalledOnly(false);
          }}
        />
        {PLUGIN_CATEGORIES.map((c) => (
          <FilterChip
            key={c}
            label={c}
            active={category === c}
            onClick={() => setCategory(category === c ? null : c)}
          />
        ))}
        <span className="mx-1 text-muted-foreground">·</span>
        <FilterChip
          label="Installed"
          active={installedOnly}
          onClick={() => setInstalledOnly((v) => !v)}
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((plugin) => {
            const state = stateByPlugin.get(plugin.id);
            const Icon = ICONS[plugin.icon] ?? Plug;
            return (
              <Card
                key={plugin.id}
                className={cn(
                  "transition-colors",
                  state && !state.enabled && "opacity-70",
                )}
              >
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                          {plugin.name}
                        </span>
                        {state && (
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              state.enabled
                                ? "bg-node-lore/15 text-node-lore"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {state.enabled ? "Enabled" : "Disabled"}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {plugin.author} · v{plugin.version}
                      </p>
                    </div>
                  </div>

                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {plugin.description}
                  </p>

                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{plugin.category}</Badge>
                    {plugin.capabilities.map((c) => (
                      <Badge key={c} variant="outline">
                        {c}
                      </Badge>
                    ))}
                  </div>

                  <div className="mt-auto flex items-center gap-2 pt-1">
                    {state ? (
                      <>
                        <Switch
                          checked={state.enabled}
                          onChange={() => toggleEnabled(state)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {state.enabled ? "On" : "Off"}
                        </span>
                        <div className="ml-auto flex items-center gap-1">
                          {plugin.settings.length > 0 && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Plugin settings"
                              onClick={() => setConfiguring({ plugin, state })}
                            >
                              <Settings2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Uninstall plugin"
                            onClick={() => uninstall(state)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => install(plugin)}
                        disabled={!projectId}
                      >
                        <Check className="h-3.5 w-3.5" /> Install
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {visible.length === 0 && (
            <p className="col-span-full py-16 text-center text-sm text-muted-foreground">
              No plugins match your filters.
            </p>
          )}
        </div>
      </ScrollArea>

      {configuring && (
        <PluginSettingsDialog
          plugin={configuring.plugin}
          state={configuring.state}
          onSave={(settings) => saveSettings(configuring.state, settings)}
          onClose={() => setConfiguring(null)}
        />
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-border bg-accent text-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent/50",
      )}
    >
      {label}
    </button>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}
