import {
  Check,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AccentMode,
  AppSettings,
  BannerGlowMode,
  EnvField,
  GradientStop,
  LogoBgMode,
  LogoColorMode,
} from "@shared/types";
import {
  ACCENTS,
  ACCENT_MODE_OPTIONS,
  APPEARANCE_DEFAULTS,
  BANNER_GLOW_OPTIONS,
  GRADIENT_PRESETS,
  LOGO_BG_OPTIONS,
  LOGO_COLOR_OPTIONS,
  THEME_MODES,
  applyAppearance,
  clampPosition,
  gradientCss,
  normalizeStops,
} from "@/lib/theme";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Logo } from "@/components/shell/logo";
import { Banner } from "@/components/shell/banner";

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex w-fit items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs transition-colors",
            value === o.value
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [text, setText] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setText(value);
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#dedede"}
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

/** Unity-style stop bar: click to add a stop, drag markers to move them. */
function GradientStopBar({
  stops,
  onStops,
}: {
  stops: GradientStop[];
  onStops: (stops: GradientStop[]) => void;
}) {
  const [selected, setSelected] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  function positionFromClientX(clientX: number): number {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return clampPosition(((clientX - rect.left) / rect.width) * 100);
  }

  function updateStop(index: number, patch: Partial<GradientStop>) {
    onStops(stops.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStop(position: number) {
    onStops(normalizeStops([...stops, { color: "#ffffff", position }]));
  }

  function removeStop(index: number) {
    if (stops.length <= 2) return;
    const next = stops.filter((_, i) => i !== index);
    setSelected((sel) => Math.min(sel, next.length - 1));
    onStops(next);
  }

  const preview = gradientCss(stops, 90);

  return (
    <div className="space-y-1.5">
      <div
        ref={barRef}
        onPointerDown={(e) => {
          const pos = positionFromClientX(e.clientX);
          const hit = stops.findIndex((s) => Math.abs(s.position - pos) <= 2.5);
          if (hit === -1) addStop(pos);
          else setSelected(hit);
        }}
        className="relative h-9 cursor-copy touch-none rounded-md border border-border bg-muted/40"
      >
        <div
          className="absolute inset-0 rounded-md"
          style={{ backgroundImage: preview }}
        />
        {stops.map((s, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Stop ${i + 1} at ${s.position}%`}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSelected(i);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (e.buttons & 1) updateStop(i, { position: positionFromClientX(e.clientX) });
            }}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 1;
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                updateStop(i, { position: clampPosition(s.position - step) });
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                updateStop(i, { position: clampPosition(s.position + step) });
              }
            }}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-sm outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
            style={{ left: `${s.position}%` }}
            title={`${Math.round(s.position)}%`}
          >
            <span
              className={cn(
                "block h-6 w-4 rounded-sm border-2 shadow-md transition-transform",
                i === selected ? "scale-125 border-white" : "border-black/50 hover:scale-110",
              )}
              style={{ backgroundColor: s.color }}
            />
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {stops.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSelected(i)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
              i === selected
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
            title={`Stop at ${Math.round(s.position)}%`}
          >
            <span
              className="h-3 w-3 rounded-full border border-border"
              style={{ backgroundColor: s.color }}
            />
            {Math.round(s.position)}%
          </button>
        ))}
        <button
          type="button"
          onClick={() => addStop(50)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Add stop
        </button>
      </div>

      {stops[selected] && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">Stop</span>
          <ColorField
            value={stops[selected].color}
            onChange={(hex) => updateStop(selected, { color: hex })}
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Position
            <Input
              type="number"
              min={0}
              max={100}
              value={Math.round(stops[selected].position)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) updateStop(selected, { position: clampPosition(v) });
              }}
              aria-label="Stop position percent"
              className="h-7 w-16 text-right text-xs"
            />
            %
          </label>
          <button
            type="button"
            onClick={() => removeStop(selected)}
            disabled={stops.length <= 2}
            aria-label="Remove stop"
            title="Remove stop"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function AppearanceCard() {
  const settings = useApp((s) => s.settings);
  const patch = useApp((s) => s.patchSettings);

  const apply = useCallback(
    (p: Partial<AppSettings>) => {
      void patch(p);
    },
    [patch],
  );

  if (!settings) return null;

  const setAccentColor = (hex: string): void => {
    apply({
      accent: hex,
      gradientStops:
        settings.accentMode === "gradient"
          ? settings.gradientStops.map((s, i) => (i === 0 ? { ...s, color: hex } : s))
          : settings.gradientStops,
    });
  };

  const setGradientStops = (stops: GradientStop[]): void => {
    const norm = normalizeStops(stops);
    apply({
      gradientStops: norm,
      accent: norm[0].color,
      accent2: norm[norm.length - 1].color,
      accentMode: "gradient",
    });
  };

  const resetAppearance = (): void => {
    const { theme, accentMode, accent, accent2, gradientStops, gradientAngle, radius, fontScale, logoColorMode, logoColor, logoBgMode, logoBgColor, bannerColorMode, bannerColor, bannerGlowMode, bannerGlowColor } = APPEARANCE_DEFAULTS;
    apply({ theme, accentMode, accent, accent2, gradientStops, gradientAngle, radius, fontScale, logoColorMode, logoColor, logoBgMode, logoBgColor, bannerColorMode, bannerColor, bannerGlowMode, bannerGlowColor });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Appearance</CardTitle>
          <Button variant="ghost" size="sm" onClick={resetAppearance}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        </div>
        <CardDescription>
          Theme, accent, and layout — applied across the whole launcher.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SettingRow
          label="Color scheme"
          description="Light, dark, pure-black AMOLED, or follow the OS."
        >
          <Segmented<AppSettings["theme"]>
            value={settings.theme}
            options={THEME_MODES.map((m) => ({ value: m.mode, label: m.label }))}
            onChange={(theme) => apply({ theme })}
          />
        </SettingRow>

        <SettingRow
          label="Accent style"
          description="A single solid color or a multi-stop gradient."
        >
          <Segmented<AccentMode>
            value={settings.accentMode}
            options={ACCENT_MODE_OPTIONS.map((o) => ({ value: o.mode, label: o.label }))}
            onChange={(accentMode) => apply({ accentMode })}
          />
        </SettingRow>

        {settings.accentMode === "solid" && (
          <>
            <SettingRow
              label="Accent color"
              description="Pick a preset or enter any custom color."
            >
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => setAccentColor(a.value)}
                    aria-label={a.name}
                    title={a.name}
                    style={{ backgroundColor: a.value }}
                    className={cn(
                      "h-6 w-6 rounded-full transition-transform hover:scale-110",
                      settings.accent.toLowerCase() === a.value &&
                        "ring-2 ring-ring ring-offset-2 ring-offset-background",
                    )}
                  >
                    {settings.accent.toLowerCase() === a.value && (
                      <Check className="h-3.5 w-3.5 text-white mix-blend-difference" />
                    )}
                  </button>
                ))}
              </div>
            </SettingRow>
            <SettingRow label="Custom color" description="Exact hex value for the accent.">
              <ColorField value={settings.accent} onChange={setAccentColor} />
            </SettingRow>
          </>
        )}

        {settings.accentMode === "gradient" && (
          <>
            <SettingRow
              label="Gradient presets"
              description="Quick-start gradients; use the editor below for a custom one."
            >
              <div className="flex flex-wrap items-center gap-2">
                {GRADIENT_PRESETS.map((g) => {
                  const active =
                    settings.gradientStops.length === 2 &&
                    settings.gradientStops[0].color.toLowerCase() === g.from.toLowerCase() &&
                    settings.gradientStops[1].color.toLowerCase() === g.to.toLowerCase();
                  return (
                    <button
                      key={g.name}
                      type="button"
                      onClick={() =>
                        apply({
                          accentMode: "gradient",
                          accent: g.from,
                          accent2: g.to,
                          gradientStops: [
                            { color: g.from, position: 0 },
                            { color: g.to, position: 100 },
                          ],
                          gradientAngle: g.angle,
                        })
                      }
                      aria-label={g.name}
                      title={g.name}
                      style={{ backgroundImage: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }}
                      className={cn(
                        "h-6 w-10 rounded-md transition-transform hover:scale-110",
                        active && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                      )}
                    />
                  );
                })}
              </div>
            </SettingRow>
            <SettingRow
              label="Custom gradient"
              description="Add as many color stops as you like and drag them on the bar."
            >
              <GradientStopBar stops={settings.gradientStops} onStops={setGradientStops} />
            </SettingRow>
            <SettingRow
              label="Angle"
              description={`Direction of the gradient (${settings.gradientAngle}°).`}
            >
              <RangeField
                min={0}
                max={360}
                step={5}
                value={settings.gradientAngle}
                onChange={(gradientAngle) => apply({ gradientAngle })}
              />
            </SettingRow>
          </>
        )}

        <SettingRow
          label="Corner radius"
          description={`Roundness of cards, buttons, and inputs (${settings.radius.toFixed(2)} rem).`}
        >
          <RangeField
            min={0}
            max={1.5}
            step={0.0625}
            value={settings.radius}
            onChange={(radius) => apply({ radius })}
          />
        </SettingRow>

        <SettingRow
          label="UI scale"
          description={`Overall interface size (${Math.round(settings.fontScale * 100)}%).`}
        >
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label="Decrease UI scale"
              onClick={() => apply({ fontScale: Math.max(0.85, settings.fontScale - 0.05) })}
              disabled={settings.fontScale <= 0.85}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="w-14 text-center text-sm font-medium tabular-nums">
              {Math.round(settings.fontScale * 100)}%
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-label="Increase UI scale"
              onClick={() => apply({ fontScale: Math.min(1.25, settings.fontScale + 0.05) })}
              disabled={settings.fontScale >= 1.25}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </SettingRow>

        <SettingRow
          label="Logo color"
          description="Keep the original artwork, follow the accent, or pick a custom color."
        >
          <div className="flex items-center gap-3">
            <Logo size={28} />
            <Segmented<LogoColorMode>
              value={settings.logoColorMode}
              options={LOGO_COLOR_OPTIONS.map((o) => ({ value: o.mode, label: o.label }))}
              onChange={(logoColorMode) => apply({ logoColorMode })}
            />
          </div>
        </SettingRow>
        {settings.logoColorMode === "custom" && (
          <SettingRow label="Logo custom color" description="Exact color for the logo mark.">
            <ColorField value={settings.logoColor} onChange={(logoColor) => apply({ logoColor })} />
          </SettingRow>
        )}

        <SettingRow
          label="Logo background"
          description="Fill behind the logo: transparent, white, the accent, or custom."
        >
          <Segmented<LogoBgMode>
            value={settings.logoBgMode}
            options={LOGO_BG_OPTIONS.map((o) => ({ value: o.mode, label: o.label }))}
            onChange={(logoBgMode) => apply({ logoBgMode })}
          />
        </SettingRow>
        {settings.logoBgMode === "custom" && (
          <SettingRow label="Logo background color" description="Exact fill behind the logo.">
            <ColorField value={settings.logoBgColor} onChange={(logoBgColor) => apply({ logoBgColor })} />
          </SettingRow>
        )}

        <SettingRow
          label="Banner color"
          description="Keep the original artwork, tint it with the accent, or pick a custom color."
        >
          <div className="flex items-center gap-3">
            <Banner imgClassName="h-8" />
            <Segmented<LogoColorMode>
              value={settings.bannerColorMode}
              options={LOGO_COLOR_OPTIONS.map((o) => ({ value: o.mode, label: o.label }))}
              onChange={(bannerColorMode) => apply({ bannerColorMode })}
            />
          </div>
        </SettingRow>
        {settings.bannerColorMode === "custom" && (
          <SettingRow label="Banner custom color" description="Exact tint for the banner artwork.">
            <ColorField value={settings.bannerColor} onChange={(bannerColor) => apply({ bannerColor })} />
          </SettingRow>
        )}

        <SettingRow
          label="Banner glow color"
          description="Keep the banner halo on the accent (solid or gradient), or pick a custom color."
        >
          <div className="flex items-center gap-3">
            <Banner imgClassName="h-8" />
            <Segmented<BannerGlowMode>
              value={settings.bannerGlowMode}
              options={BANNER_GLOW_OPTIONS.map((o) => ({ value: o.mode, label: o.label }))}
              onChange={(bannerGlowMode) => apply({ bannerGlowMode })}
            />
          </div>
        </SettingRow>
        {settings.bannerGlowMode === "custom" && (
          <SettingRow label="Banner glow custom color" description="Exact color for the banner halo.">
            <ColorField value={settings.bannerGlowColor} onChange={(bannerGlowColor) => apply({ bannerGlowColor })} />
          </SettingRow>
        )}

        <SettingRow label="Preview" description="A live sample of the current accent.">
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-primary text-primary-foreground">
              Primary
            </Button>
            <span
              className={cn(
                "rounded-md border border-border px-2 py-1 text-xs font-medium",
                settings.accentMode === "gradient" ? "accent-gradient-text" : "text-primary",
              )}
            >
              Accent text
            </span>
            <span className="accent-gradient-bg h-7 w-7 rounded-full" />
          </div>
        </SettingRow>
      </CardContent>
    </Card>
  );
}

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
  const [browseError, setBrowseError] = useState<string | null>(null);

  if (!settings) return null;

  const browse = async (): Promise<void> => {
    setBrowseError(null);
    const res = await window.masarFlow.shell.chooseDirectory();
    if (!res) return;
    if (res.ok) {
      await patch({ targetDir: res.path });
      const state = await window.masarFlow.setup.check();
      setSetup(state);
      const envData = await window.masarFlow.env.read();
      setEnv(envData.fields);
    } else {
      setBrowseError(res.reason ?? "That folder isn't the MasarFlow project.");
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
          {browseError && (
            <p className="mt-1.5 text-xs text-destructive">{browseError}</p>
          )}
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

function UpdatesCard() {
  const updateInfo = useApp((s) => s.updateInfo);
  const setUpdateInfo = useApp((s) => s.setUpdateInfo);
  const settings = useApp((s) => s.settings);
  const patch = useApp((s) => s.patchSettings);
  const [checking, setChecking] = useState(false);

  const check = async (): Promise<void> => {
    setChecking(true);
    try {
      setUpdateInfo(await window.masarFlow.updates.check());
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Updates</CardTitle>
          <Button size="sm" onClick={check} disabled={checking}>
            <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
            {checking ? "Checking…" : "Check for updates"}
          </Button>
        </div>
        <CardDescription>
          Compares this launcher against MasarFlow releases and commits on GitHub.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium">Check for updates on startup</p>
            <p className="text-[11px] text-muted-foreground">
              Run an update check automatically when the launcher opens.
            </p>
          </div>
          <Switch
            checked={settings?.autoCheckUpdates ?? true}
            onCheckedChange={(c) => void patch({ autoCheckUpdates: c })}
          />
        </div>
        {updateInfo ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Installed</span>
              <span className="font-mono font-semibold">{updateInfo.currentVersion}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-muted-foreground">Latest</span>
              <span className="font-mono font-semibold">
                {updateInfo.latestVersion || "unknown"}
              </span>
              {updateInfo.updateAvailable ? (
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                  Update available
                </span>
              ) : updateInfo.error ? (
                <span className="ml-auto rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                  Check failed
                </span>
              ) : (
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-node-lore/15 px-2 py-0.5 text-xs font-medium text-node-lore">
                  <CheckCircle2 className="h-3 w-3" /> Up to date
                </span>
              )}
            </div>
            {updateInfo.error ? (
              <p className="text-xs text-warning">{updateInfo.error}</p>
            ) : null}
            {updateInfo.latestCommit ? (
              <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Latest commit on main
                </p>
                <p className="mt-1 truncate font-mono text-xs">
                  <span className="text-primary">{updateInfo.latestCommit.sha}</span>{" "}
                  {updateInfo.latestCommit.message}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(updateInfo.latestCommit.date).toLocaleString()}
                </p>
              </div>
            ) : null}
            {updateInfo.releaseNotes ? (
              <div className="scrollbar-thin max-h-44 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-2.5">
                <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                  {updateInfo.releaseName}
                  {updateInfo.publishedAt
                    ? ` · ${new Date(updateInfo.publishedAt).toLocaleDateString()}`
                    : ""}
                </p>
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">
                  {updateInfo.releaseNotes}
                </pre>
              </div>
            ) : null}
            {updateInfo.releaseUrl ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void window.masarFlow.updates.openRelease(updateInfo.releaseUrl)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open release page
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No update check run yet — click “Check for updates”.
          </p>
        )}
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
            Appearance, environment variables for the MasarFlow services, plus launcher preferences.
          </p>
        </div>
        <AppearanceCard />
        <EnvFormCard />
        <AppSettingsCard />
        <UpdatesCard />
        <AdvancedCard />
      </div>
    </div>
  );
}
