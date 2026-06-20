"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { PluginState } from "@/lib/db/schema";
import type { PluginDef, PluginSettings } from "@/lib/plugins";
import { cn } from "@/lib/utils/cn";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function PluginSettingsDialog({
  plugin,
  state,
  onSave,
  onClose,
}: {
  plugin: PluginDef;
  state: PluginState;
  onSave: (settings: PluginSettings) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<PluginSettings>(() => {
    // Start from persisted settings, backfilling any new fields with defaults.
    const v: PluginSettings = {};
    for (const f of plugin.settings) {
      v[f.key] = state.settings[f.key] ?? f.default;
    }
    return v;
  });

  const set = (key: string, value: string | boolean) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      ariaLabel={`${plugin.name} settings`}
      className="w-[420px] p-0"
    >
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">{plugin.name} settings</h2>
        <p className="text-xs text-muted-foreground">
          v{plugin.version} · {plugin.author}
        </p>
      </div>

      <div className="space-y-4 px-5 py-4">
        {plugin.settings.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {field.label}
            </label>
            {field.type === "text" && (
              <Input
                value={String(values[field.key] ?? "")}
                onChange={(e) => set(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="h-9 text-sm"
              />
            )}
            {field.type === "boolean" && (
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(values[field.key])}
                onClick={() => set(field.key, !values[field.key])}
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  values[field.key] ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                    values[field.key] && "translate-x-4",
                  )}
                />
              </button>
            )}
            {field.type === "select" && (
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="outline" size="sm" className="w-full justify-between">
                    <span className="capitalize">
                      {String(values[field.key])}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {(field.options ?? []).map((opt) => (
                    <DropdownMenuItem
                      key={opt}
                      active={values[field.key] === opt}
                      onSelect={() => set(field.key, opt)}
                    >
                      <span className="capitalize">{opt}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(values)}>
          Save settings
        </Button>
      </div>
    </Dialog>
  );
}
