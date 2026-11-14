"use client";
import * as React from "react";
import {
  Puzzle,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  FileJson,
  Sparkles,
  AlertTriangle,
  Download,
  ShieldCheck,
  Box,
  Bot,
  ScrollText,
  Terminal,
  BookOpen,
  Globe,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listPlugins,
  installFromJson,
  uninstallPlugin,
  setEnabled,
  buildSamplePluginJson,
  getSamplePluginIds,
  onPluginsChanged,
  type LoadedPlugin,
} from "@/lib/plugins";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/utils";

export default function PluginsPage() {
  const [plugins, setPlugins] = React.useState<LoadedPlugin[]>(() => listPlugins());
  const [importJson, setImportJson] = React.useState("");
  const [showImport, setShowImport] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    return onPluginsChanged(() => setPlugins(listPlugins()));
  }, []);

  const onInstallSample = (id: string) => {
    const json = buildSamplePluginJson(id);
    const r = installFromJson(json);
    if (r.ok) {
      toast.success("Plugin installed: " + r.plugin?.manifest.name);
      setError(null);
    } else {
      setError(r.error ?? "Install failed");
    }
  };

  const onInstall = () => {
    if (!importJson.trim()) {
      setError("Paste a plugin manifest JSON first.");
      return;
    }
    const r = installFromJson(importJson);
    if (r.ok) {
      toast.success("Plugin installed: " + r.plugin?.manifest.name);
      setImportJson("");
      setShowImport(false);
      setError(null);
    } else {
      setError(r.error ?? "Install failed");
    }
  };

  const onUninstall = (p: LoadedPlugin) => {
    if (!window.confirm("Uninstall " + p.manifest.name + "?")) return;
    uninstallPlugin(p.manifest.id);
    toast.success("Plugin uninstalled");
  };

  const onToggle = (p: LoadedPlugin) => {
    setEnabled(p.manifest.id, !p.enabled);
    toast(p.enabled ? "Plugin disabled" : "Plugin enabled", { description: p.manifest.name });
  };

  return (
    <div className="pb-10">
      <PageHeader
        icon={Puzzle}
        eyebrow="Plugins"
        title="Extend MasarFlow"
        description="Install, configure, and ship community plugins. Each plugin contributes agents, commands, panels, graph node kinds, and themes. Plugins are sandboxed to the data layer and run locally."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="soft"
              size="sm"
              onClick={() => setShowImport(!showImport)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Install from JSON
            </Button>
          </div>
        }
      />

      <div className="space-y-5 px-6 py-5">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="bg-accent grid h-8 w-8 place-items-center rounded-md">
              <ShieldCheck className="h-4 w-4 text-[color:var(--success)]" />
            </span>
            <div className="flex-1 text-sm">
              <div className="font-medium">Sandboxed plugins</div>
              <p className="text-muted-foreground text-pretty">
                All plugins run locally. Each declares the permissions it needs (read-data,
                write-data, execute-ai, register-ui). MasarFlow rejects undeclared access.
              </p>
            </div>
            <Badge variant="success">local-first</Badge>
          </CardContent>
        </Card>

        {showImport && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileJson className="h-3.5 w-3.5" />
                Install from JSON
              </CardTitle>
              <CardDescription>Paste a plugin manifest. Or pick a sample below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {getSamplePluginIds().map((id) => (
                  <Button
                    key={id}
                    variant="soft"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => onInstallSample(id)}
                  >
                    <Sparkles className="h-3 w-3" />
                    Install sample: {id}
                  </Button>
                ))}
              </div>
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                rows={6}
                placeholder="Paste manifest JSON here..."
                className="border-border bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed outline-none focus-visible:ring-2"
              />
              {error && (
                <div className="flex items-center gap-2 rounded-md border border-[color:var(--danger)]/30 bg-[color:var(--danger)]/10 p-2.5 text-[11px] text-[color:var(--danger)]">
                  <AlertTriangle className="h-3.5 w-3.5" /> {error}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button onClick={onInstall} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Install
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowImport(false);
                    setError(null);
                    setImportJson("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {plugins.length === 0 && (
            <div className="border-border text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
              No plugins installed. Click &quot;Install from JSON&quot; to add one.
            </div>
          )}
          {plugins.map((p) => (
            <PluginRow
              key={p.manifest.id}
              plugin={p}
              onToggle={() => onToggle(p)}
              onUninstall={() => onUninstall(p)}
            />
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="h-3.5 w-3.5" />
              Writing a plugin
            </CardTitle>
            <CardDescription>A plugin is a JSON manifest with these fields.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="border-border bg-surface-2 overflow-x-auto rounded-md border p-3 font-mono text-[10px] leading-relaxed">
              {JSON.stringify(
                {
                  id: "my-plugin",
                  name: "My Plugin",
                  version: "0.1.0",
                  description: "...",
                  author: "You",
                  contributes: {
                    agents: [
                      {
                        id: "ag_custom",
                        name: "Custom",
                        role: "custom",
                        persona: "...",
                        description: "...",
                        capabilities: ["custom"],
                      },
                    ],
                    commands: [{ id: "do", label: "Do", description: "..." }],
                    graphNodeKinds: [{ id: "custom", label: "Custom", color: "var(--primary)" }],
                  },
                  permissions: ["read-data", "register-ui"],
                },
                null,
                2,
              )}
            </pre>
            <div className="text-muted-foreground mt-3 text-[11px]">
              <p>
                Plugins live in your browser localStorage under the key{" "}
                <code className="bg-muted rounded px-1 font-mono">masarflow.plugins.v1</code>. In a
                future release, plugins can be loaded from a user-chosen directory.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PluginRow({
  plugin,
  onToggle,
  onUninstall,
}: {
  plugin: LoadedPlugin;
  onToggle: () => void;
  onUninstall: () => void;
}) {
  const m = plugin.manifest;
  const counts = {
    agents: m.contributes.agents?.length ?? 0,
    commands: m.contributes.commands?.length ?? 0,
    panels: m.contributes.panels?.length ?? 0,
    graphNodeKinds: m.contributes.graphNodeKinds?.length ?? 0,
    themes: m.contributes.themes?.length ?? 0,
  };
  return (
    <div className="group border-border bg-card hover:border-border/80 rounded-lg border p-4 transition-colors">
      <div className="flex items-start gap-3">
        <span className="bg-accent grid h-10 w-10 place-items-center rounded-md text-[color:var(--primary)]">
          <Puzzle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{m.name}</h3>
            <Badge variant="outline" className="font-mono text-[10px]">
              v{m.version}
            </Badge>
            {plugin.source === "builtin" ? (
              <Badge variant="secondary" className="text-[10px]">
                built-in
              </Badge>
            ) : (
              <Badge variant="ghost" className="text-[10px]">
                {plugin.source}
              </Badge>
            )}
            {!plugin.enabled && (
              <Badge variant="warning" className="text-[10px]">
                disabled
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={onToggle}
                className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1.5"
                aria-label={plugin.enabled ? "Disable plugin" : "Enable plugin"}
              >
                {plugin.enabled ? (
                  <ToggleRight className="h-4 w-4 text-[color:var(--success)]" />
                ) : (
                  <ToggleLeft className="h-4 w-4" />
                )}
              </button>
              {plugin.source !== "builtin" && (
                <button
                  onClick={onUninstall}
                  className="text-muted-foreground hover:bg-accent rounded-md p-1.5 hover:text-[color:var(--danger)]"
                  aria-label="Uninstall plugin"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-muted-foreground mt-1 line-clamp-2 text-xs text-pretty">
            {m.description}
          </p>
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="font-mono">{m.id}</span>
            <span className="opacity-40">-</span>
            <span>{m.author}</span>
            {plugin.installedAt > 0 && (
              <>
                <span className="opacity-40">-</span>
                <span>installed {formatRelativeTime(plugin.installedAt)}</span>
              </>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {counts.agents > 0 && (
              <ContributionChip
                icon={Bot}
                label="agents"
                count={counts.agents}
                color="var(--graph-memory)"
              />
            )}
            ,
            {counts.commands > 0 && (
              <ContributionChip
                icon={Terminal}
                label="commands"
                count={counts.commands}
                color="var(--info)"
              />
            )}
            ,
            {counts.panels > 0 && (
              <ContributionChip
                icon={Box}
                label="panels"
                count={counts.panels}
                color="var(--graph-doc)"
              />
            )}
            ,
            {counts.graphNodeKinds > 0 && (
              <ContributionChip
                icon={ScrollText}
                label="node kinds"
                count={counts.graphNodeKinds}
                color="var(--graph-spec)"
              />
            )}
            ,
            {counts.themes > 0 && (
              <ContributionChip
                icon={Globe}
                label="themes"
                count={counts.themes}
                color="var(--graph-standard)"
              />
            )}
            ,
          </div>
          {m.permissions.length > 0 && (
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-1 text-[10px]">
              <ShieldCheck className="h-3 w-3" />
              <span>Permissions:</span>
              {m.permissions.map((p) => (
                <Badge key={p} variant="outline" className="text-[9px]">
                  {p}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ContributionChip({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <span className="border-border bg-surface-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]">
      <Icon className="h-3 w-3" style={{ color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{count}</span>
    </span>
  );
}
