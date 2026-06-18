import * as React from "react";
import { cn } from "@/lib/utils/cn";

/** A simple overflow container with the theme-aware thin scrollbar. */
export function ScrollArea({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("scrollbar-thin overflow-y-auto", className)}
      {...props}
    />
  );
}
