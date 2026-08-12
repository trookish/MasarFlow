"use client";

import { useRef, useState } from "react";
import { Upload, ImagePlus, Trash2 } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { cn } from "@/lib/utils/cn";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/brain/tag-input";
import { IconPicker } from "./icon-picker";
import { CategoryPicker } from "./category-picker";

/**
 * Legacy curated icon names → Lucide kebab-case names. Stored icons from
 * before the full-library picker are mapped so existing projects keep theirs.
 */
export const LEGACY_ICON_MAP: Record<string, string> = {
  box: "box",
  rocket: "rocket",
  layers: "layers",
  globe: "globe",
  code: "code-xml",
  zap: "zap",
  palette: "palette",
  gamepad: "gamepad-2",
  database: "database",
  bot: "bot",
  cloud: "cloud",
  smartphone: "smartphone",
  flask: "flask-conical",
  book: "book-open",
  shield: "shield",
  wrench: "wrench",
};

/** Resolve any stored icon value to a valid Lucide icon name. */
export function projectIconName(icon?: string): string {
  if (!icon) return "box";
  return LEGACY_ICON_MAP[icon] ?? icon;
}

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

/** Resolve a project accent to a hex color. Raw hex passes through untouched. */
export function projectAccentColor(accent?: string): string {
  if (!accent) return PROJECT_ACCENT_MAP.violet;
  const trimmed = accent.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
  return PROJECT_ACCENT_MAP[accent] ?? PROJECT_ACCENT_MAP.violet;
}

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
      <DynamicIcon
        name={projectIconName(icon) as IconName}
        className={size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5"}
      />
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
  /** Category names already saved on this project ("" = none yet). */
  categories?: string[];
  /** Persist a brand-new category for this project. */
  onAddCategory?: (name: string) => void | Promise<void>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium text-muted-foreground">
      {children}
    </span>
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
        placeholder="#7c5cfc"
        className="h-7 w-24 font-mono text-xs"
      />
    </div>
  );
}

/** Shared creation/editing fields for a project. */
export function ProjectFields({
  value,
  onChange,
  categories = [],
  onAddCategory,
}: ProjectFieldsProps) {
  const usingCustomIcon = Boolean(value.iconImage);

  async function handleAddCategory(name: string) {
    if (onAddCategory) await onAddCategory(name);
    onChange({ category: name });
  }

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
          <div className="flex items-center gap-2">
            <IconPicker
              value={projectIconName(value.icon)}
              onSelect={(icon) => onChange({ icon, iconImage: "" })}
            />
            {usingCustomIcon ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                Custom image
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Search the full Lucide library or upload a custom image below.
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
            Pick a preset or enter any custom color.
          </p>
          <ColorField
            value={projectAccentColor(value.accent)}
            onChange={(hex) => onChange({ accent: hex })}
          />
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
          <CategoryPicker
            options={categories}
            value={value.category}
            onChange={(category) => onChange({ category })}
            onCreate={(name) => handleAddCategory(name)}
          />
          <p className="text-[11px] text-muted-foreground">
            {categories.length === 0
              ? "No categories yet — add the project's first one."
              : "Pick a saved category or add a new one."}
          </p>
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
          {value.category}
        </span>
      ) : null}
    </div>
  );
}
