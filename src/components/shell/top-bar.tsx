"use client";
import * as React from "react";
import { motion } from "motion/react";
import { Search, GitBranch, Bell, Sparkles, User, ChevronDown } from "lucide-react";
import { useUi } from "@/lib/stores/ui";
import { useActiveProject } from "@/lib/db/repos/projects";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function isMac() {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

export function TopBar() {
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const setProjectSwitcherOpen = useUi((s) => s.setProjectSwitcherOpen);
  const project = useActiveProject();
  const mod = isMac() ? "⌘" : "Ctrl";

  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-3 backdrop-blur-md">
      <button
        onClick={() => setProjectSwitcherOpen(true)}
        className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50"
      >
        <span className="grid h-5 w-5 place-items-center rounded bg-gradient-to-br from-primary to-info text-[10px] font-bold text-primary-foreground">
          {project?.name?.[0] ?? "M"}
        </span>
        <span className="font-medium">{project?.name ?? "MasarFlow"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-y-0.5" />
      </button>

      <div className="mx-2 h-5 w-px bg-border" />

      <button
        onClick={() => setPaletteOpen(true)}
        className="group flex h-7 flex-1 max-w-md items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-xs text-muted-foreground transition-colors hover:border-border/80 hover:bg-surface-3"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="hidden font-mono text-[10px] sm:inline">
          {mod}K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <Badge variant="ghost" className="hidden gap-1.5 font-mono text-[10px] md:inline-flex">
          <GitBranch className="h-3 w-3" />
          main
        </Badge>

        <Button variant="ghost" size="icon-sm" aria-label="Notifications" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[color:var(--danger)]" />
        </Button>

        <Button
          variant="soft"
          size="sm"
          className="hidden gap-1.5 sm:inline-flex"
          onClick={() => setSearchOpen(true)}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ml-1 flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-accent/50"
              aria-label="User menu"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback>TR</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">Tariq R.</span>
                <span className="text-xs text-muted-foreground">tariq@masarflow.dev</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Preferences</DropdownMenuItem>
            <DropdownMenuItem>Keyboard shortcuts</DropdownMenuItem>
            <DropdownMenuItem>Plugins</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Export data…</DropdownMenuItem>
            <DropdownMenuItem>Reset seed data</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
