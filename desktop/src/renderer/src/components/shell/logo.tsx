import { useApp } from "@/lib/store";
import { cn } from "@/lib/cn";
import { gradientCss } from "@/lib/theme";

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * MasarFlow brand mark. The logo is a transparent PNG; a tint (accent or
 * custom hex) is applied by using the image as a CSS mask and filling its
 * shape with the chosen color. "original" shows the source PNG untouched.
 * The mark sits on a configurable background (none / white / accent / custom),
 * all driven by the launcher appearance settings. In gradient accent mode,
 * "accent" backgrounds and tints use the same gradient as every other
 * accent-colored element.
 */
export function Logo({ size = 44, className }: LogoProps) {
  const settings = useApp((s) => s.settings);
  const accent = settings?.accent ?? "#7c5cfc";
  const logoColorMode = settings?.logoColorMode ?? "original";
  const logoColor = settings?.logoColor ?? accent;
  const logoBgMode = settings?.logoBgMode ?? "none";
  const logoBgColor = settings?.logoBgColor ?? "#ffffff";

  const accentFill =
    settings?.accentMode === "gradient"
      ? gradientCss(settings.gradientStops, settings.gradientAngle)
      : accent;
  const accentIsGradient = settings?.accentMode === "gradient";

  const background =
    logoBgMode === "none"
      ? "transparent"
      : logoBgMode === "white"
        ? "#ffffff"
        : logoBgMode === "accent"
          ? accentFill
          : logoBgColor;

  return (
    <span
      role="img"
      aria-label="MasarFlow"
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md",
        logoBgMode === "none" ? "p-0" : "p-[4%]",
        className,
      )}
      style={{
        backgroundColor: accentIsGradient && logoBgMode === "accent" ? "transparent" : background,
        backgroundImage: accentIsGradient && logoBgMode === "accent" ? background : undefined,
        width: size,
        height: size,
      }}
    >
      {logoColorMode !== "original" ? (
        <span
          aria-hidden
          className="block h-full w-full"
          style={{
            backgroundColor:
              logoColorMode === "accent" && !accentIsGradient
                ? accent
                : logoColorMode === "custom"
                  ? logoColor
                  : "transparent",
            backgroundImage:
              logoColorMode === "accent" && accentIsGradient ? accentFill : undefined,
            maskImage: "url(logo.png)",
            WebkitMaskImage: "url(logo.png)",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center",
            maskSize: "contain",
            WebkitMaskSize: "contain",
          }}
        />
      ) : (
        <img
          src="logo.png"
          alt="MasarFlow"
          width={size}
          height={size}
          draggable={false}
          className="h-full w-full object-contain"
        />
      )}
    </span>
  );
}
