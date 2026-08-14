import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  FlaskConical,
  Play,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useApp, type Page } from "@/lib/store";
import type { TaskbarDirection } from "@shared/types";
import { Logo } from "./logo";

const NAV: Array<{ page: Page; label: string; icon: LucideIcon }> = [
  { page: "run", label: "Run", icon: Play },
  { page: "setup", label: "Setup", icon: Wrench },
  { page: "config", label: "Configuration", icon: Settings },
  { page: "testing", label: "Testing", icon: FlaskConical },
];

/** One nav button (rail or dock) with a hover tooltip. */
function NavButton({
  page,
  label,
  icon: Icon,
  round = false,
  tooltipPlacement,
}: {
  page: Page;
  label: string;
  icon: LucideIcon;
  round?: boolean;
  tooltipPlacement: "right" | "left" | "top";
}) {
  const active = useApp((s) => s.page === page);
  const setPage = useApp((s) => s.setPage);
  const setupInitialized = useApp((s) => s.setup?.initialized ?? false);

  return (
    <button
      onClick={() => setPage(page)}
      className={cn(
        "group relative flex items-center justify-center transition-colors duration-150",
        round ? "h-10 w-10 rounded-full" : "h-11 w-11 rounded-lg",
        active
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      {page === "setup" && !setupInitialized && !active && (
        <span
          className={cn(
            "absolute h-1.5 w-1.5 rounded-full bg-warning",
            round ? "right-1 top-1" : "right-1.5 top-1.5",
          )}
        />
      )}
      <span
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100",
          tooltipPlacement === "right" &&
            "left-full top-1/2 ml-2 -translate-y-1/2",
          tooltipPlacement === "left" &&
            "right-full top-1/2 mr-2 -translate-y-1/2",
          tooltipPlacement === "top" &&
            "bottom-full left-1/2 mb-2 -translate-x-1/2",
        )}
      >
        {label}
      </span>
    </button>
  );
}

export function Sidebar() {
  const settings = useApp((s) => s.settings);
  const setPage = useApp((s) => s.setPage);
  const patchSettings = useApp((s) => s.patchSettings);
  const direction: TaskbarDirection = settings?.taskbarDirection ?? "bottom";
  const collapsed = settings?.taskbarCollapsed ?? false;

  // Floating dock at the bottom center of the window.
  if (direction === "bottom") {
    if (collapsed) {
      return (
        <button
          onClick={() => void patchSettings({ taskbarCollapsed: false })}
          title="Expand taskbar (Ctrl+B)"
          className="app-no-drag fixed bottom-4 left-1/2 z-40 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar/85 text-muted-foreground shadow-lg shadow-black/25 backdrop-blur-md transition-all duration-200 hover:bg-accent/60 hover:text-foreground"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      );
    }
    return (
      <nav
        aria-label="Navigation dock"
        className="app-no-drag fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-sidebar-border bg-sidebar/85 p-1.5 shadow-lg shadow-black/25 backdrop-blur-md"
      >
        <button
          onClick={() => setPage("run")}
          title="MasarFlow Launcher"
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-accent/60"
        >
          <Logo size={28} />
        </button>
        <div className="mx-0.5 h-6 w-px bg-sidebar-border" aria-hidden />
        {NAV.map(({ page, label, icon }) => (
          <NavButton
            key={page}
            page={page}
            label={label}
            icon={icon}
            round
            tooltipPlacement="top"
          />
        ))}
        <div className="mx-0.5 h-6 w-px bg-sidebar-border" aria-hidden />
        <button
          onClick={() => void patchSettings({ taskbarCollapsed: true })}
          title="Hide taskbar (Ctrl+B)"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </nav>
    );
  }

  const isRight = direction === "right";

  // Collapsed right rail: floating expand handle on the right edge.
  if (isRight && collapsed) {
    return (
      <button
        onClick={() => void patchSettings({ taskbarCollapsed: false })}
        title="Expand taskbar (Ctrl+B)"
        className="app-no-drag fixed right-0 top-1/2 z-40 flex h-20 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-sidebar-border bg-sidebar/85 text-muted-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-accent/60 hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    );
  }

  // Collapsed left rail: fully hidden — the topbar toggle (Ctrl+B) brings it back.
  if (collapsed) return null;

  return (
    <div
      className={cn(
        "flex w-[60px] shrink-0 flex-col items-center py-3",
        isRight
          ? "border-l border-sidebar-border/60"
          : "border-r border-sidebar-border/60",
      )}
    >
      <button
        onClick={() => setPage("run")}
        title="MasarFlow Launcher"
        className="app-no-drag group relative mb-2 flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-accent/60"
      >
        <Logo size={32} />
      </button>
      {NAV.map(({ page, label, icon }) => (
        <NavButton
          key={page}
          page={page}
          label={label}
          icon={icon}
          tooltipPlacement={isRight ? "left" : "right"}
        />
      ))}
    </div>
  );
}
