"use client";

import { normalizeStops, useThemeStore } from "@/lib/stores/theme";

/** Id of the stroke paint that `.accent-icon` uses in gradient accent mode. */
export const ACCENT_ICON_GRADIENT_ID = "mf-accent-icon-gradient";

/**
 * The accent gradient as an SVG paint server, so stroked icons can follow a
 * gradient accent (CSS gradients only paint backgrounds). Coordinates are in
 * the 24-unit icon viewBox and follow the CSS angle convention: 0deg points
 * up, 90deg points right, and the line spans the box's projected length.
 */
export function AccentIconGradient() {
  const stops = useThemeStore((s) => s.gradientStops);
  const angle = useThemeStore((s) => s.gradientAngle);
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const half = (Math.abs(24 * dx) + Math.abs(24 * dy)) / 2;
  return (
    <svg
      aria-hidden
      width="0"
      height="0"
      className="pointer-events-none absolute"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={ACCENT_ICON_GRADIENT_ID}
          gradientUnits="userSpaceOnUse"
          x1={12 - dx * half}
          y1={12 - dy * half}
          x2={12 + dx * half}
          y2={12 + dy * half}
        >
          {normalizeStops(stops).map((s, i) => (
            <stop key={i} offset={`${s.position}%`} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
    </svg>
  );
}
