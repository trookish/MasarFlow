import { Compass } from "lucide-react";
import { cn } from "@/lib/utils";

interface MasarFlowLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "h-10 w-10",
  md: "h-14 w-14",
  lg: "h-16 w-16",
};

const iconSizes = {
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-8 w-8",
};

export function MasarFlowLogo({ className, size = "md" }: MasarFlowLogoProps) {
  return (
    <div
      className={cn(
        "bg-foreground text-background grid place-items-center rounded-xl",
        sizes[size],
        className,
      )}
    >
      <Compass className={iconSizes[size]} />
    </div>
  );
}
