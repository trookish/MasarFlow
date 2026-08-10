import { Check, FolderOpen, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { EnvField } from "@shared/types";
import { ACCENTS, applyAppearance, THEME_MODES } from "@/lib/theme";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

function EnvInput({
  field,
  onChange,
}: {
  field: EnvField;
  onChange: (value: string) => void;
}) {
  if (field.kind === "boolean") {
    return (
      <Switch
        checked={field.value === "true"}
        onCheckedChange={(c) => onChange(String(c))}
      />
    );
  }
  return (
    <Input
      value={field.value}
      onChange={(e) => onChange(e.target.value)}
      type={field.kind === "secret" ? "password" : field.kind === "port" || field.kind === "ms" ? "text" : "text"}
      spellCheck={false}
      className="h-8 font-mono text-xs"
      disabled={!field.active}
    />
  );
}

function EnvFormCard() {
  const env = useApp((s) => s.env);
  const setEnv = useApp((s) => s.setEnv);
  const [fields, setFields] = useState<EnvField[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (env) setFields(env);
  }, [env]);

  const dirtyCount = useMemo(
    () => fields.filter((f) => !f.active).length,
    [fields],
  );

  const update = (key: string, patch: Partial<EnvField>): void => {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
    setDirty(true);
    setSaved(false);
  };

  const save = async (): Promise<void> => {
    const res = await window.masarFlow.env.save(fields);
    if (res.ok) {
      const fresh = await window.masarFlow.env.read();
      setEnv(fresh.fields);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Environment variables</CardTitle>
          <div className="flex items-center gap-2">
            {dirtyCount > 0 && (
              <Badge variant="default">{dirtyCount} disabled</Badge>
            )}
            <Button size="sm" onClick={save} disabled={!dirty}>
              {saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {saved ? "Saved" : "Save .env.local"}
            </Button>
          </div>
        </div>
        <CardDescription>
          Edited in <span className="font-mono text-[11px]">.env.local</span> — restart the run session
          for changes to take effect. A backup is kept at .env.local.bak.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {fields.map((f) => (
            <label key={f.key} className="block rounded-md border border-border/60 bg-muted/30 p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <button
                    onClick={() => update(f.key, { active: !f.active })}
                    title="Toggle (enable/disable)"
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded border border-border text-[10px] transition-colors",
                      f.active ? "bg-primary text-primary-foreground" : "bg-input text-muted-foreground",
                    )}
                  >
                    {f.active && <Check className="h-3 w-3" />}
                  </button>
                  <span className="font-mono text-xs font-medium">{f.key}</span>
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{f.kind}</span>
              </div>
              <EnvInput field={f} onChange={(v) => update(f.key, { value: v })} />
              {f.description && (
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{f.description}</p>
              )}
            </label>
          ))}
        </div>
        {fields.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No .env.local yet — run Setup first, or save a value below in Advanced.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AdvancedCard() {
  const setEnv = useApp((s) => s.setEnv);
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;
    void window.masarFlow.env.read().then((env) => {
      setContent(env.content);
      setLoaded(true);
    });
  }, [loaded]);

  const save = async (): Promise<void> => {
    const res = await window.masarFlow.env.saveRaw(content);
    if (res.ok) {
      const fresh = await window.masarFlow.env.read();
      setEnv(fresh.fields);
      setContent(fresh.content);
      setSaved(true);
      setError("");
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError(res.error ?? "Failed to save");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Advanced — raw .env.local</CardTitle>
          <Button size="sm" onClick={save} disabled={!loaded}>
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
        </div>
        <CardDescription>
          Full control over the file contents. Comments are preserved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          rows={12}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setSaved(false);
          }}
          spellCheck={false}
          placeholder="# KEY=VALUE"
        />
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        {saved && (
          <p className="mt-2 flex items-center gap-1 text-xs text-node-lore">
            <Check className="h-3 w-3" /> Saved
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AppSettingsCard() {
  const settings = useApp((s) => s.settings);
  const patch = useApp((s) => s.patchSettings);
  const setSetup = useApp((s) => s.setSetup);
  const setEnv = useApp((s) => s.setEnv);

  if (!settings) return null;

  const browse = async (): Promise<void> => {
    const res = await window.masarFlow.shell.chooseDirectory();
    if (res?.ok) {
      await patch({ targetDir: res.path });
      const state = await window.masarFlow.setup.check();
      setSetup(state);
      const envData = await window.masarFlow.env.read();
      setEnv(envData.fields);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>App settings</CardTitle>
        <CardDescription>Where MasarFlow lives and how the launcher behaves.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">MasarFlow directory</p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={settings.targetDir}
              className="h-8 flex-1 font-mono text-xs"
            />
            <Button variant="outline" size="sm" onClick={browse}>
              <FolderOpen className="h-3.5 w-3.5" />
              Browse…
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Theme</p>
          <div className="flex w-fit items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
            {THEME_MODES.map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => void patch({ theme: mode })}
                className={cn(
                  "rounded-md px-3 py-1 text-xs transition-colors",
                  settings.theme === mode
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Accent color</p>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                title={a.name}
                onClick={() => void patch({ accent: a.value })}
                className={cn(
                  "h-6 w-6 rounded-full transition-transform hover:scale-110",
                  settings.accent.toLowerCase() === a.value && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                )}
                style={{ backgroundColor: a.value }}
              />
            ))}
            <Input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(settings.accent) ? settings.accent : "#7c5cfc"}
              onChange={(e) => void patch({ accent: e.target.value })}
              className="h-6 w-10 cursor-pointer rounded-md border border-input p-0"
              title="Custom accent"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium">Open in browser when ready</p>
            <p className="text-[11px] text-muted-foreground">Automatically open http://localhost:3000 once the app responds.</p>
          </div>
          <Switch
            checked={settings.autoOpenBrowser}
            onCheckedChange={(c) => void patch({ autoOpenBrowser: c })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium">Terminal font size</p>
            <p className="text-[11px] text-muted-foreground">{settings.fontSize}px</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={10}
              max={20}
              value={settings.fontSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 10 && v <= 20) void patch({ fontSize: v });
              }}
              className="h-8 w-16 text-center font-mono text-xs"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ConfigPage() {
  const settings = useApp((s) => s.settings);
  useEffect(() => {
    if (settings) applyAppearance(settings);
  }, [settings]);

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 px-6 py-6">
        <div>
          <h1 className="text-xl font-semibold">Configuration</h1>
          <p className="text-sm text-muted-foreground">
            Environment variables for the MasarFlow services, plus launcher preferences.
          </p>
        </div>
        <EnvFormCard />
        <AppSettingsCard />
        <AdvancedCard />
      </div>
    </div>
  );
}
