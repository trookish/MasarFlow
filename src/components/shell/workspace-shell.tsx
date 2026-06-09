"use client";
import * as React from "react";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { LeftNav } from "./left-nav";
import { TopBar } from "./top-bar";
import { RightRail } from "./right-rail";
import { StatusBar } from "./status-bar";
import { CommandPalette } from "./command-palette";
import { GlobalSearch } from "./global-search";
import { ProjectSwitcher } from "./project-switcher";
import { ShortcutsCheatsheet } from "./shortcuts-cheatsheet";
import { useSeedReady } from "@/components/providers/seed-provider";
import { cn } from "@/lib/utils";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const seed = useSeedReady();

  if (!seed.ready && !seed.error) {
    return (
      <div className="grid h-screen place-items-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 animate-pulse-soft rounded-full bg-primary/40 blur-xl" />
            <div className="absolute inset-1.5 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
          </div>
          <p className="text-xs text-muted-foreground">Initializing project memory…</p>
        </div>
      </div>
    );
  }

  if (seed.error) {
    return (
      <div className="grid h-screen place-items-center bg-background p-6 text-center">
        <div>
          <p className="text-sm font-medium text-foreground">Failed to initialize</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{seed.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1">
        <LeftNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="relative min-h-0 flex-1 overflow-y-auto">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
              className={cn("min-h-full")}
            >
              {children}
            </motion.div>
          </main>
        </div>
        <RightRail />
      </div>
      <StatusBar />
      <CommandPalette />
      <GlobalSearch />
      <ProjectSwitcher />
      <ShortcutsCheatsheet />
    </div>
  );
}
