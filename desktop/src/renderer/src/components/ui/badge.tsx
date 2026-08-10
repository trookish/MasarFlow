import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "default" | "secondary" | "outline" | "primary" | "success" | "warning" | "destructive";

const variants: Record<Variant, string> = {
  default: "bg-muted text-muted-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border border-border text-muted-foreground",
  primary: "bg-primary/15 text-primary",
  success: "bg-node-lore/15 text-node-lore",
  warning: "bg-node-idea/15 text-node-idea",
  destructive: "bg-destructive/15 text-destructive",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <span
      ref={ref}
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", variants[variant], className)}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";
