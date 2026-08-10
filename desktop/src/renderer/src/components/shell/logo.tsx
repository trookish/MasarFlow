import { cn } from "@/lib/cn";

interface LogoProps {
  size?: number;
  className?: string;
}

/** MasarFlow's "M" mark, tinted with the accent color via CSS mask. */
export function Logo({ size = 44, className }: LogoProps) {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#7c5cfc";
  return (
    <img
      src="logo.png"
      alt="MasarFlow"
      width={size}
      height={size}
      draggable={false}
      className={cn("shrink-0", className)}
      style={{
        maskImage: "url(logo.png)",
        WebkitMaskImage: "url(logo.png)",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        backgroundColor: accent,
      }}
    />
  );
}
