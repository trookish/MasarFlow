"use client";

import { useRef, useState } from "react";
import {
  Box,
  Rocket,
  Layers,
  Globe,
  CodeXml,
  Zap,
  Palette,
  Gamepad2,
  Database,
  Bot,
  Cloud,
  Smartphone,
  FlaskConical,
  BookOpen,
  Shield,
  Wrench,
  Upload,
  ImagePlus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/brain/tag-input";

/** Curated lucide icons offered in the project icon picker. */
export const PROJECT_ICONS: {
  name: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { name: "box", label: "Box", icon: Box },
  { name: "rocket", label: "Rocket", icon: Rocket },
  { name: "layers", label: "Layers", icon: Layers },
  { name: "globe", label: "Globe", icon: Globe },
  { name: "code", label: "Code", icon: CodeXml },
  { name: "zap", label: "Zap", icon: Zap },
  { name: "palette", label: "Palette", icon: Palette },
  { name: "gamepad", label: "Gamepad", icon: Gamepad2 },
  { name: "database", label: "Database", icon: Database },
  { name: "bot", label: "Bot", icon: Bot },
  { name: "cloud", label: "Cloud", icon: Cloud },
  { name: "smartphone", label: "Smartphone", icon: Smartphone },
  { name: "flask", label: "Flask", icon: FlaskConical },
  { name: "book", label: "Book", icon: BookOpen },
  { name: "shield", label: "Shield", icon: Shield },
  { name: "wrench", label: "Wrench", icon: Wrench },
];

const PROJECT_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  PROJECT_ICONS.map((p) => [p.name, p.icon]),
);

/** Accent swatches for projects (name → hex). "violet" matches the schema default. */
export const PROJECT_ACCENTS: { name: string; color: string }[] = [
  { name: "violet", color: "#7c5cfc" },
  { name: "indigo", color: "#6366f1" },
  { name: "blue", color: "#3b82f6" },
  { name: "sky", color: "#0ea5e9" },
  { name: "teal", color: "#14b8a6" },
  { name: "emerald", color: "#10b981" },
  { name: "lime", color: "#84cc16" },
  { name: "amber", color: "#f59e0b" },
  { name: "orange", color: "#f97316" },
  { name: "rose", color: "#f43f5e" },
  { name: "red", color: "#ef4444" },
  { name: "fuchsia", color: "#d946ef" },
];

const PROJECT_ACCENT_MAP: Record<string, string> = Object.fromEntries(
  PROJECT_ACCENTS.map((p) => [p.name, p.color]),
);

export function projectAccentColor(accent?: string): string {
  return (accent && PROJECT_ACCENT_MAP[accent]) || PROJECT_ACCENT_MAP.violet;
}

export const PROJECT_CATEGORIES: { value: string; label: string }[] = [
  { value: "web-app", label: "Web app" },
  { value: "mobile", label: "Mobile app" },
  { value: "game", label: "Game" },
  { value: "cli-tool", label: "CLI / tool" },
  { value: "library", label: "Library / package" },
  { value: "data", label: "Data / research" },
  { value: "other", label: "Other" },
];

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Upload / paste-URL / clear for a single image (icon or banner). */
export function ImagePicker({
  value,
  onChange,
  clearLabel,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  clearLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [error, setError] = useState("");

  async function onFile(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files are supported.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image is larger than 4 MB.");
      return;
    }
    onChange(await readImageFile(file));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {value ? (
          <span className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
            <img
              src={value}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          </span>
        ) : (
          <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
            <ImagePlus className="h-5 w-5" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <Upload className="h-3.5 w-3.5" /> Upload image
            </button>
            {value ? (
              <button
                type="button"
                onClick={() => onChange("")}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Trash2 className="h-3.5 w-3.5" /> {clearLabel}
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">or</span>
            <Input
              value={urlDraft}
              onChange={(e) => {
                setUrlDraft(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const url = urlDraft.trim();
                  if (url) onChange(url);
                  setUrlDraft("");
                }
              }}
              onBlur={() => {
                const url = urlDraft.trim();
                if (url) onChange(url);
                setUrlDraft("");
              }}
              placeholder="Paste image URL"
              className="h-7 text-xs"
            />
          </div>
        </div>
      </div>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

interface ProjectIconProps {
  icon?: string;
  iconImage?: string;
  accent?: string;
  size?: "sm" | "lg";
  className?: string;
}

/** Small tinted chip rendering a project's icon (or uploaded image) in its accent color. */
export function ProjectIcon({
  icon,
  iconImage,
  accent,
  size = "sm",
  className,
}: ProjectIconProps) {
  const Icon = (icon && PROJECT_ICON_MAP[icon]) || Box;
  const color = projectAccentColor(accent);
  if (iconImage) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded",
          size === "sm" ? "h-5 w-5" : "h-9 w-9 rounded-lg",
          className,
        )}
        style={{ backgroundColor: `${color}1f` }}
      >
        <img
          src={iconImage}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded",
        size === "sm" ? "h-5 w-5" : "h-9 w-9 rounded-lg",
        className,
      )}
      style={{ backgroundColor: `${color}1f`, color }}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5"} />
    </span>
  );
}

export interface ProjectFieldValues {
  name: string;
  icon: string;
  iconImage: string;
  accent: string;
  description: string;
  tags: string[];
  category: string;
  banner: string;
  bannerMode: "none" | "banner" | "background";
  bannerBlur: number;
  bannerBrightness: number;
}

export const BANNER_MODES: {
  value: ProjectFieldValues["bannerMode"];
  label: string;
}[] = [
  { value: "none", label: "Hidden" },
  { value: "banner", label: "Header banner" },
  { value: "background", label: "Project background" },
];

interface ProjectFieldsProps {
  value: ProjectFieldValues;
  onChange: (patch: Partial<ProjectFieldValues>) => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

/** Shared creation/editing fields for a project. */
export function ProjectFields({ value, onChange }: ProjectFieldsProps) {
  const usingCustomIcon = Boolean(value.iconImage);
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel>Name</FieldLabel>
        <Input
          autoFocus
          placeholder="Project name"
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel>Icon</FieldLabel>
          <div className="grid grid-cols-8 gap-1">
            {PROJECT_ICONS.map((p) => {
              const active = !usingCustomIcon && value.icon === p.name;
              return (
                <button
                  key={p.name}
                  type="button"
                  title={p.label}
                  aria-label={`${p.label} icon`}
                  onClick={() => onChange({ icon: p.name, iconImage: "" })}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
                    active && "border-primary bg-primary/15 text-primary",
                  )}
                >
                  <p.icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Pick an icon or upload a custom image below.
          </p>
          <ImagePicker
            value={value.iconImage}
            onChange={(iconImage) => onChange({ iconImage })}
            clearLabel="Remove image"
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Accent color</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {PROJECT_ACCENTS.map((p) => (
              <button
                key={p.name}
                type="button"
                aria-label={`${p.name} accent`}
                title={p.name}
                onClick={() => onChange({ accent: p.name })}
                style={{ backgroundColor: p.color }}
                className={cn(
                  "h-6 w-6 rounded-full transition-transform hover:scale-110",
                  value.accent === p.name &&
                    "ring-2 ring-ring ring-offset-2 ring-offset-popover",
                )}
              />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Used across the app to tint this project&apos;s identity.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <FieldLabel>Description</FieldLabel>
        <Textarea
          placeholder="What is this project about?"
          rows={3}
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel>Category</FieldLabel>
          <select
            value={value.category}
            onChange={(e) => onChange({ category: e.target.value })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            <option value="">No category</option>
            {PROJECT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Tags</FieldLabel>
          <TagInput
            value={value.tags}
            onChange={(tags) => onChange({ tags })}
            placeholder="Add tag…"
          />
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="space-y-1.5">
          <FieldLabel>Banner</FieldLabel>
          <ImagePicker
            value={value.banner}
            onChange={(banner) => onChange({ banner })}
            clearLabel="Remove banner"
          />
        </div>

        {value.banner ? (
          <>
            <div className="space-y-1.5">
              <FieldLabel>Display as</FieldLabel>
              <div className="flex gap-1 rounded-md border border-border bg-background p-1">
                {BANNER_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => onChange({ bannerMode: m.value })}
                    className={cn(
                      "flex-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
                      value.bannerMode === m.value &&
                        "bg-accent font-semibold text-foreground",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {value.bannerMode === "background" ? (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <FieldLabel>Blur: {value.bannerBlur}px</FieldLabel>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    step={1}
                    value={value.bannerBlur}
                    onChange={(e) =>
                      onChange({ bannerBlur: Number(e.target.value) })
                    }
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Brightness: {value.bannerBrightness}%</FieldLabel>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={value.bannerBrightness}
                    onChange={(e) =>
                      onChange({ bannerBrightness: Number(e.target.value) })
                    }
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                  />
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Live preview of the icon + accent + name, used next to the form. */
export function ProjectPreview({ value }: { value: ProjectFieldValues }) {
  const color = projectAccentColor(value.accent);
  return (
    <div className="flex items-center gap-3">
      <span
        className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg"
        style={{ backgroundColor: `${color}1f`, color }}
      >
        {value.iconImage ? (
          <img
            src={value.iconImage}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <ProjectIcon icon={value.icon} size="lg" accent={value.accent} />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {value.name.trim() || "Untitled project"}
        </p>
        {value.tags.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">
            {value.tags.map((t) => `#${t}`).join(" ")}
          </p>
        )}
      </div>
      {value.category ? (
        <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
          {PROJECT_CATEGORIES.find((c) => c.value === value.category)?.label ??
            value.category}
        </span>
      ) : null}
    </div>
  );
}
