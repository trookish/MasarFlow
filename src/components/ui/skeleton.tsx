import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shimmer rounded-md bg-muted/60 [background-size:200%_100%]", className)}
      {...props}
    />
  );
}

export { Skeleton };
