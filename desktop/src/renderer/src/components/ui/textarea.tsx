import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-input bg-background p-3 text-sm text-foreground outline-none transition-colors",
        "placeholder:text-muted-foreground",
        "focus:border-ring focus:ring-2 focus:ring-ring/40",
        "font-mono text-xs leading-relaxed",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
