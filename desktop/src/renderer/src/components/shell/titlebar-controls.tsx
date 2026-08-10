import { Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/cn";

function WindowButton({
  onClick,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "app-no-drag flex h-9 w-11 items-center justify-center text-muted-foreground transition-colors duration-150",
        danger
          ? "hover:bg-destructive hover:text-destructive-foreground"
          : "hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function TitlebarControls() {
  const maximized = useApp((s) => s.maximized);
  const setMaximized = useApp((s) => s.setMaximized);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    void window.masarFlow.window.isMaximized().then(setMaximized);
    const off = window.masarFlow.window.onMaximized(setMaximized);
    setMounted(true);
    return off;
  }, [setMaximized]);

  if (!mounted) return null;
  return (
    <div className="app-no-drag flex items-center self-stretch">
      <WindowButton onClick={() => window.masarFlow.window.minimize()} title="Minimize">
        <Minus className="h-4 w-4" />
      </WindowButton>
      <WindowButton onClick={() => window.masarFlow.window.toggleMaximize()} title="Maximize">
        <Square className={cn("h-3.5 w-3.5", maximized && "translate-y-0.5")} />
      </WindowButton>
      <WindowButton danger onClick={() => window.masarFlow.window.close()} title="Close">
        <X className="h-4 w-4" />
      </WindowButton>
    </div>
  );
}
