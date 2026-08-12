"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface DropdownContext {
  open: boolean;
  setOpen: (value: boolean) => void;
}
const Ctx = React.createContext<DropdownContext | null>(null);

function useDropdown(): DropdownContext {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("DropdownMenu components must be used together");
  return ctx;
}
export { useDropdown };

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <Ctx.Provider value={{ open, setOpen }}>
      <div ref={ref} className="relative">
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function DropdownMenuTrigger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { open, setOpen } = useDropdown();
  return (
    <div
      className={cn("inline-flex", className)}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      {children}
    </div>
  );
}

export function DropdownMenuContent({
  children,
  align = "start",
  className,
}: {
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const { open } = useDropdown();
  if (!open) return null;
  return (
    <div
      role="menu"
      className={cn(
        "absolute z-50 mt-1 min-w-[12rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl",
        align === "end" ? "right-0" : "left-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({
  children,
  onSelect,
  className,
  active,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  className?: string;
  active?: boolean;
}) {
  const { setOpen } = useDropdown();
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onSelect?.();
        setOpen(false);
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
        active && "text-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DropdownMenuLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-2 py-1.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}
