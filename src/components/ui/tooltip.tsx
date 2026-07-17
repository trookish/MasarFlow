"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

const PLACEMENT: Record<
  string,
  Record<string, string>
> = {
  top: {
    start: "bottom-full left-0 mb-1.5",
    center: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    end: "bottom-full right-0 mb-1.5",
  },
  bottom: {
    start: "top-full left-0 mt-1.5",
    center: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    end: "top-full right-0 mt-1.5",
  },
  left: {
    start: "right-full top-0 mr-1.5",
    center: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    end: "right-full bottom-0 mr-1.5",
  },
  right: {
    start: "left-full top-0 ml-1.5",
    center: "left-full top-1/2 -translate-y-1/2 ml-1.5",
    end: "left-full bottom-0 ml-1.5",
  },
};

export function Tooltip({
  label,
  side = "right",
  align = "center",
  children,
}: {
  label: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  children: React.ReactNode;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocusCapture={() => setShow(true)}
      onBlurCapture={() => setShow(false)}
    >
      {children}
      {show ? (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-50 whitespace-nowrap rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md",
            PLACEMENT[side][align],
          )}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
