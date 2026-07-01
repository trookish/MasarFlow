"use client";

import { Moon, Sun, Monitor, Contrast, Check } from "lucide-react";
import {
  ACCENT_PRESETS,
  useThemeStore,
  type ThemeMode,
} from "@/lib/stores/theme";
import { useMounted } from "@/lib/hooks/use-mounted";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const MODES: { value: ThemeMode; label: string; icon: typeof Moon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "amoled", label: "AMOLED", icon: Contrast },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle() {
  const mounted = useMounted();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const accentColor = useThemeStore((s) => s.accentColor);
  const setAccentColor = useThemeStore((s) => s.setAccentColor);
  const setAccentMode = useThemeStore((s) => s.setAccentMode);

  const TriggerIcon = MODES.find((m) => m.value === mode)?.icon ?? Moon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost" size="icon" aria-label="Appearance">
          {mounted ? <TriggerIcon className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Color scheme</DropdownMenuLabel>
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mounted && mode === m.value;
          return (
            <DropdownMenuItem
              key={m.value}
              onSelect={() => setMode(m.value)}
              active={active}
            >
              <Icon className="h-4 w-4" /> {m.label}
              {active ? <Check className="ml-auto h-3.5 w-3.5" /> : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Accent</DropdownMenuLabel>
        <div className="flex flex-wrap gap-1.5 p-2">
          {ACCENT_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                setAccentMode("solid");
                setAccentColor(p.color);
              }}
              aria-label={`${p.name} accent`}
              title={p.name}
              style={{ backgroundColor: p.color }}
              className={cn(
                "h-6 w-6 rounded-full transition-transform hover:scale-110",
                accentColor.toLowerCase() === p.color.toLowerCase() &&
                  "ring-2 ring-ring ring-offset-2 ring-offset-popover",
              )}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
