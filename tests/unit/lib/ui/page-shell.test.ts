import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  DENSITIES,
  DENSITY_LABEL,
  normalizeDensity,
  rowHeight,
} from "@/lib/ui/density";
import {
  clampPaneWidth,
  paneStorageKey,
  parsePaneWidth,
} from "@/lib/ui/pane-width";
import { relativeTime } from "@/lib/ui/relative-time";

describe("density", () => {
  it("has a label for every option", () => {
    for (const d of DENSITIES)
      expect(DENSITY_LABEL[d].length).toBeGreaterThan(3);
  });

  it("falls back to comfortable for anything unknown", () => {
    expect(normalizeDensity(undefined)).toBe("comfortable");
    expect(normalizeDensity("tight")).toBe("comfortable");
    expect(normalizeDensity("compact")).toBe("compact");
  });

  it("compacts rows by exactly one step", () => {
    expect(rowHeight("comfortable") - rowHeight("compact")).toBe(8);
  });
});

describe("pane width", () => {
  it("clamps to the usable range and rounds", () => {
    expect(clampPaneWidth(10)).toBe(180);
    expect(clampPaneWidth(9999)).toBe(560);
    expect(clampPaneWidth(280.6)).toBe(281);
    expect(clampPaneWidth(Number.NaN)).toBe(180);
  });

  it("namespaces storage per page and pane", () => {
    expect(paneStorageKey("brain", "list")).toBe("masarflow-pane:brain:list");
    expect(paneStorageKey("brain", "list")).not.toBe(
      paneStorageKey("board", "list"),
    );
  });

  it("ignores a corrupt stored value", () => {
    expect(parsePaneWidth(null, 240)).toBe(240);
    expect(parsePaneWidth("nope", 240)).toBe(240);
    expect(parsePaneWidth("9999", 240)).toBe(560);
  });
});

describe("relative time", () => {
  const now = 1_700_000_000_000;
  it("rounds to the largest unit that reads naturally", () => {
    expect(relativeTime(now - 5_000, now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5m ago");
    expect(relativeTime(now - 5 * 3_600_000, now)).toBe("5h ago");
    expect(relativeTime(now - 26 * 3_600_000, now)).toBe("yesterday");
    expect(relativeTime(now - 5 * 86_400_000, now)).toBe("5d ago");
  });

  it("never reads as the future", () => {
    expect(relativeTime(now + 60_000, now)).toBe("just now");
  });
});

describe("type scale", () => {
  it("never sets text below the 12 px floor", () => {
    const roots = ["src/components", "src/app"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx|ts)$/.test(entry.name)) {
          const text = readFileSync(full, "utf8");
          for (const m of text.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
            if (Number(m[1]) < 12) offenders.push(`${full}: ${m[0]}`);
          }
        }
      }
    };
    for (const r of roots) walk(join(process.cwd(), r));
    expect(offenders).toEqual([]);
  });
});

describe("page shell barrel", () => {
  const dir = join(process.cwd(), "src/components/page");

  it("exports a component for every file in the folder", async () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThanOrEqual(7);
    const barrel = await import("@/components/page");
    const exported = Object.keys(barrel);
    const pascal = (base: string) =>
      base
        .split("-")
        .map((p) => p[0].toUpperCase() + p.slice(1))
        .join("");
    const missing = files
      .map((f) => pascal(f.replace(/\.tsx$/, "")))
      .filter(
        (name) => !exported.some((e) => e === name || e.startsWith(name)),
      );
    expect(missing).toEqual([]);
  });
});
