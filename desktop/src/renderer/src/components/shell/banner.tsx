import { useApp } from "@/lib/store";
import { bannerGlowCss } from "@/lib/theme";
import { cn } from "@/lib/cn";

/**
 * The MasarFlow banner with an ambient accent-colored glow behind it.
 * The glow follows the configured accent — solid or gradient — and adapts
 * its intensity to the current theme (dark/light).
 */
export function Banner({ imgClassName }: { imgClassName?: string }) {
  const banner = useApp((s) => s.banner);
  const settings = useApp((s) => s.settings);
  if (!banner) return null;

  return (
    <div className="relative w-fit">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 scale-150 blur-2xl"
        style={{ backgroundImage: settings ? bannerGlowCss(settings) : undefined }}
      />
      <img
        src={banner}
        alt="MasarFlow"
        draggable={false}
        className={cn("relative block select-none object-contain", imgClassName)}
      />
    </div>
  );
}
