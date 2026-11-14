import { gradientCss, type GradientStop } from "./theme";

type LogoMode = "original" | "accent" | "custom" | string;

export interface LogoPaintInput {
  accentMode: "solid" | "gradient";
  accentColor: string;
  gradientStops: GradientStop[];
  gradientAngle: number;
  logoColorMode: LogoMode;
  logoColor: string;
  logoBgMode: "none" | "white" | "accent" | "custom" | string;
  logoBgColor: string;
}

export interface LogoPaint {
  /** Style for the plate behind the mark. */
  plate: { backgroundColor?: string; backgroundImage?: string };
  /** Style for the tinted mark (unused when the colour mode is "original"). */
  mark: { backgroundColor?: string; backgroundImage?: string; filter?: string };
}

/**
 * What the brand mark and its plate are painted with. In gradient accent mode both layers follow
 * the gradient. When the mark and the plate both use the accent, the mark runs the gradient the
 * other way round and gets a hairline shadow, otherwise the mark would vanish into the plate.
 */
export function logoPaint(i: LogoPaintInput): LogoPaint {
  const gradient = i.accentMode === "gradient";
  const plateAccent = i.logoBgMode === "accent";
  const markAccent = i.logoColorMode === "accent";

  const plate: LogoPaint["plate"] =
    i.logoBgMode === "none"
      ? { backgroundColor: "transparent" }
      : i.logoBgMode === "white"
        ? { backgroundColor: "#ffffff" }
        : plateAccent
          ? gradient
            ? { backgroundImage: gradientCss(i.gradientStops, i.gradientAngle) }
            : { backgroundColor: i.accentColor }
          : { backgroundColor: i.logoBgColor };

  if (!markAccent) return { plate, mark: { backgroundColor: i.logoColor } };
  if (!gradient) return { plate, mark: { backgroundColor: i.accentColor } };
  const overGradient = plateAccent;
  return {
    plate,
    mark: {
      backgroundImage: gradientCss(i.gradientStops, overGradient ? (i.gradientAngle + 180) % 360 : i.gradientAngle),
      ...(overGradient ? { filter: "drop-shadow(0 0 0.75px rgba(0, 0, 0, 0.55))" } : {}),
    },
  };
}
