import {
  FlaskConical,
  Play,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useApp, type Page } from "@/lib/store";
import { Logo } from "./logo";

const NAV: Array<{ page: Page; label: string; icon: LucideIcon }> = [
  { page: "run", label: "Run", icon: Play },
  { page: "setup", label: "Setup", icon: Wrench },
  { page: "config", label: "Configuration", icon: Settings },
  { page: "testing", label: "Testing", icon: FlaskConical },
];

export function Sidebar() {
  const page = useApp((s) => s.page);
  const setPage = useApp((s) => s.setPage);
  const setupInitialized = useApp((s) => s.setup?.initialized ?? false);

  return (
    <div className="flex w-[60px] shrink-0 flex-col items-center border-r border-sidebar-border/60 py-3">
      <button
        onClick={() => setPage("run")}
        title="MasarFlow Launcher"
        className="app-no-drag group relative mb-2 flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-accent/60"
      >
        <Logo size={32} />
      </button>
      {NAV.map(({ page: p, label, icon: Icon }) => (
        <button
          key={p}
          onClick={() => setPage(p)}
          className={cn(
            "group relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors duration-150",
            page === p
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
          {p === "setup" && !setupInitialized && page !== "setup" && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-warning" />
          )}
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}
