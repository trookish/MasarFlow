"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Check } from "lucide-react";
import { ACCENTS, useThemeStore } from "@/lib/stores/theme";
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

export function ThemeToggle() {
  const mounted = useMounted();
  const { theme, setTheme } = useTheme();
  const accent = useThemeStore((s) => s.accent);
  const setAccent = useThemeStore((s) => s.setAccent);
  const isDark = mounted ? theme !== "light" : true;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost" size="icon" aria-label="Appearance">
          {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setTheme("dark")} active={isDark}>
          <Moon className="h-4 w-4" /> Dark
          {isDark ? <Check className="ml-auto h-3.5 w-3.5" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("light")} active={!isDark}>
          <Sun className="h-4 w-4" /> Light
          {!isDark ? <Check className="ml-auto h-3.5 w-3.5" /> : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Accent</DropdownMenuLabel>
        <div className="flex flex-wrap gap-1.5 p-2">
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              data-accent={a}
              onClick={() => setAccent(a)}
              aria-label={`${a} accent`}
              className={cn(
                "h-6 w-6 rounded-full bg-primary transition-transform hover:scale-110",
                accent === a &&
                  "ring-2 ring-ring ring-offset-2 ring-offset-popover",
              )}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
