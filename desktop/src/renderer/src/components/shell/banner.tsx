import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { bannerGlowCss, gradientCss } from "@/lib/theme";
import { cn } from "@/lib/cn";

const BANNER_ASPECT_FALLBACK = "790 / 316";

/**
 * The MasarFlow banner with an ambient accent-colored glow behind it.
 * The artwork itself can be tinted (accent or custom hex) by using the image
 * as a CSS mask and filling its shape with the chosen color — the same
 * technique as the launcher logo; "original" shows the PNG untouched.
 * The glow follows the accent (solid or gradient) or a custom color, and
 * both adapt their intensity to the current theme (dark/light).
 */
export function Banner({
  imgClassName,
  wrapperClassName,
  glowClassName,
}: {
  imgClassName?: string;
  wrapperClassName?: string;
  glowClassName?: string;
}) {
  const banner = useApp((s) => s.banner);
  const settings = useApp((s) => s.settings);
  const [aspect, setAspect] = useState<string | null>(null);

  useEffect(() => {
    if (!banner) return;
    const img = new Image();
    img.onload = () => setAspect(`${img.naturalWidth} / ${img.naturalHeight}`);
    img.src = banner;
  }, [banner]);

  if (!banner) return null;

  const accent = settings?.accent ?? "#dedede";
  const accentFill =
    settings?.accentMode === "gradient"
      ? gradientCss(settings.gradientStops, settings.gradientAngle)
      : accent;
  const accentIsGradient = settings?.accentMode === "gradient";
  const colorMode = settings?.bannerColorMode ?? "original";
  const tinted = colorMode !== "original";

  return (
    <div role="img" aria-label="MasarFlow" className={cn("relative w-fit", wrapperClassName)}>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 scale-150 blur-2xl",
          glowClassName,
        )}
        style={{ backgroundImage: settings ? bannerGlowCss(settings) : undefined }}
      />
      {tinted ? (
        <span
          aria-hidden
          style={{
            aspectRatio: aspect ?? BANNER_ASPECT_FALLBACK,
            backgroundColor:
              colorMode === "accent" && !accentIsGradient
                ? accent
                : colorMode === "custom"
                  ? settings?.bannerColor
                  : undefined,
            backgroundImage:
              colorMode === "accent" && accentIsGradient ? accentFill : undefined,
            maskImage: `url("${banner}")`,
            WebkitMaskImage: `url("${banner}")`,
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center",
            maskSize: "contain",
            WebkitMaskSize: "contain",
          }}
          className={cn("relative block", imgClassName)}
        />
      ) : (
        <img
          src={banner}
          alt="MasarFlow"
          draggable={false}
          className={cn("relative block select-none object-contain", imgClassName)}
        />
      )}
    </div>
  );
}
