"use client";

import { useState } from "react";
import { useThemeStore } from "@/lib/stores/theme";
import { cn } from "@/lib/utils/cn";

const LOGO_SRC = "/logo.png";

/**
 * MasarFlow brand mark. Loads the real asset from /public/logo.png. The logo is
 * a transparent PNG, so a tint (accent or custom hex) is applied by using the
 * image as a CSS mask and filling its shape with the chosen color; "original"
 * shows the source PNG untouched. The mark sits on a configurable background
 * (none / white / accent / custom). Falls back to a hand-built SVG if the file
 * is missing so the brand spot never renders broken.
 */
export function MasarFlowLogo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  const {
    logoColorMode,
    logoColor,
    logoBgMode,
    logoBgColor,
    accentColor,
  } = useThemeStore();

  const background =
    logoBgMode === "none"
      ? "transparent"
      : logoBgMode === "white"
        ? "#ffffff"
        : logoBgMode === "accent"
          ? accentColor
          : logoBgColor;

  const mark = failed ? (
    <FallbackMark />
  ) : logoColorMode !== "original" ? (
    // Tinted: paint the PNG's shape (its alpha mask) with the chosen color.
    <span
      aria-hidden
      className="block h-full w-full"
      style={{
        backgroundColor: logoColorMode === "accent" ? accentColor : logoColor,
        WebkitMaskImage: `url(${LOGO_SRC})`,
        maskImage: `url(${LOGO_SRC})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  ) : (
    // Original: the source PNG, untouched.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt="MasarFlow"
      className="h-full w-full object-contain"
      onError={() => setFailed(true)}
    />
  );

  return (
    <span
      role="img"
      aria-label="MasarFlow"
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-md",
        logoBgMode === "none" ? "p-0" : "p-[4%]",
        className,
      )}
      style={{ backgroundColor: background }}
    >
      {mark}
    </span>
  );
}

/** Self-contained interpretation used only when /logo.png is absent. */
function FallbackMark() {
  return (
    <svg
      viewBox="0 0 512 512"
      className="h-full w-full"
      role="img"
      aria-label="MasarFlow"
    >
      <mask id="masar-road-fallback">
        <rect width="512" height="512" fill="white" />
        <path
          d="M256 250 C 232 300 296 320 262 366 C 240 398 300 396 304 432"
          stroke="black"
          strokeWidth="30"
          strokeLinecap="round"
          fill="none"
        />
      </mask>
      <path
        mask="url(#masar-road-fallback)"
        d="M122 412 L122 182 L256 306 L390 182 L390 412"
        stroke="currentColor"
        strokeWidth="74"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
