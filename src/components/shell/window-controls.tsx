"use client";

import { useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import { getDesktop } from "@/lib/desktop/bridge";
import { useMounted } from "@/lib/hooks/use-mounted";

/** Min / max / close for the frameless desktop window. Renders nothing in a browser. */
export function WindowControls() {
  const mounted = useMounted();
  const desktop = mounted ? getDesktop() : null;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    void desktop.window.isMaximized().then(setMaximized);
    return desktop.window.onMaximized(setMaximized);
  }, [desktop]);

  if (!desktop) return null;
  const btn =
    "grid h-8 w-11 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  return (
    <div className="app-no-drag -mr-2 ml-2 flex items-stretch">
      <button
        type="button"
        className={btn}
        aria-label="Minimize window"
        onClick={() => desktop.window.minimize()}
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        className={btn}
        aria-label={maximized ? "Restore window" : "Maximize window"}
        onClick={() => desktop.window.toggleMaximize()}
      >
        <Square className="size-3.5" />
      </button>
      <button
        type="button"
        className={`${btn} hover:bg-red-600 hover:text-white`}
        aria-label="Close window"
        onClick={() => desktop.window.close()}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
