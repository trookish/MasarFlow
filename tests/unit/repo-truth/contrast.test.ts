import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * P7 T1: colour and type tokens meet WCAG AA with no allow-list. Ratios are computed from the real
 * values in globals.css, for both themes, over the surfaces the tokens are drawn on.
 */
const ROOT = join(__dirname, "../../..");
const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf("\n}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}

const light = block(":root");
const dark = { ...light, ...block(".dark") };

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const mix = (fg: Rgb, bg: Rgb, alpha: number): Rgb => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as Rgb;
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const NODES = Object.keys(light)
  .filter((k) => /^node-[\w-]+-fg$/.test(k))
  .map((k) => k.slice(5, -3));

describe("colour contrast (AA, both themes)", () => {
  it("every entity colour has a foreground token in both themes", () => {
    const bases = Object.keys(light).filter((k) => /^node-[\w-]+$/.test(k) && !k.endsWith("-fg"));
    expect(NODES.sort()).toEqual(bases.map((k) => k.slice(5)).sort());
    for (const n of NODES) expect(block(".dark")[`node-${n}-fg`], n).toBeTruthy();
  });

  for (const [theme, t] of [["light", light], ["dark", dark]] as const) {
    it.each(NODES)(`${theme}: %s badge text over its 15% tint on card and background`, (n) => {
      const fg = rgb(t[`node-${n}-fg`]);
      for (const surface of ["card", "background"]) {
        const bg = mix(rgb(t[`node-${n}`]), rgb(t[surface]), 0.15);
        expect(ratio(fg, bg), `${theme} ${n} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${theme}: muted text on background, card and muted`, () => {
      for (const surface of ["background", "card", "muted"]) {
        expect(ratio(rgb(t["muted-foreground"]), rgb(t[surface])), surface).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("type scale", () => {
  // Class strings also live in lib maps (badge colours per status), so scan all of src.
  const sources = files(join(ROOT, "src"))
    .filter((p) => !p.endsWith(".css"))
    .map((p) => [p, readFileSync(p, "utf8")] as const);

  it("no text below 12 px", () => {
    const hits = sources.filter(([, s]) => /text-\[(9|10|11)px\]/.test(s)).map(([p]) => p);
    expect(hits).toEqual([]);
  });

  it("entity colours are used as text only through their -fg tokens", () => {
    const hits = sources
      .flatMap(([p, s]) => [...s.matchAll(/\btext-node-([a-z-]+)/g)].map((m) => [p, m[1]] as const))
      .filter(([, n]) => !n.endsWith("-fg"));
    expect(hits).toEqual([]);
  });

  it("muted text is never faded below its token", () => {
    const hits = sources.filter(([, s]) => /text-muted-foreground\/\d+/.test(s)).map(([p]) => p);
    expect(hits).toEqual([]);
  });
});
