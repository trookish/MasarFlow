import { boundsOfRects, inflateRect, type Rect } from "./viewport-math";

/**
 * A serialisable scene: the neutral description every canvas page exports from. Colours are
 * concrete CSS colours (resolve theme variables with `resolveCssColor` first), because an exported
 * file has no stylesheet to resolve them against.
 */
export type SceneItem =
  | {
      type: "circle";
      id?: string;
      x: number;
      y: number;
      r: number;
      fill: string;
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
    }
  | {
      type: "rect";
      id?: string;
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
      fill: string;
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
    }
  | {
      type: "line";
      id?: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
      strokeWidth?: number;
      opacity?: number;
    }
  | {
      type: "text";
      id?: string;
      x: number;
      y: number;
      text: string;
      fill: string;
      /** Font size in scene units. */
      size?: number;
      anchor?: "start" | "middle" | "end";
      opacity?: number;
    };

export interface Scene {
  /** Free-form description of what the scene is, written into the JSON export. */
  title?: string;
  /** Page background; omitted means transparent. */
  background?: string;
  items: SceneItem[];
}

export interface SceneJson {
  format: "masarflow-scene";
  version: 1;
  title: string;
  background: string | null;
  bounds: Rect | null;
  items: SceneItem[];
}

const FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Approximate text width; exact metrics need a DOM, and exports must also run in node. */
function textWidth(text: string, size: number): number {
  return text.length * size * 0.56;
}

export function itemBounds(item: SceneItem): Rect {
  switch (item.type) {
    case "circle":
      return { x: item.x - item.r, y: item.y - item.r, width: item.r * 2, height: item.r * 2 };
    case "rect":
      return { x: item.x, y: item.y, width: item.width, height: item.height };
    case "line":
      return {
        x: Math.min(item.x1, item.x2),
        y: Math.min(item.y1, item.y2),
        width: Math.abs(item.x1 - item.x2),
        height: Math.abs(item.y1 - item.y2),
      };
    case "text": {
      const size = item.size ?? 12;
      const w = textWidth(item.text, size);
      const x = item.anchor === "middle" ? item.x - w / 2 : item.anchor === "end" ? item.x - w : item.x;
      return { x, y: item.y - size, width: w, height: size * 1.3 };
    }
  }
}

/** Smallest rectangle containing every item, or null for an empty scene. */
export function sceneBounds(scene: Scene): Rect | null {
  return boundsOfRects(scene.items.map(itemBounds));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sceneToJSON(scene: Scene): string {
  const doc: SceneJson = {
    format: "masarflow-scene",
    version: 1,
    title: scene.title ?? "",
    background: scene.background ?? null,
    bounds: sceneBounds(scene),
    items: scene.items,
  };
  return JSON.stringify(doc, null, 2);
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function opacityAttr(o: number | undefined): string {
  return o === undefined || o === 1 ? "" : ` opacity="${round(o)}"`;
}

function strokeAttrs(stroke: string | undefined, width: number | undefined): string {
  return stroke ? ` stroke="${escapeXml(stroke)}" stroke-width="${round(width ?? 1)}"` : "";
}

function itemToSvg(item: SceneItem): string {
  const id = item.id ? ` data-id="${escapeXml(item.id)}"` : "";
  switch (item.type) {
    case "circle":
      return `<circle${id} cx="${round(item.x)}" cy="${round(item.y)}" r="${round(item.r)}" fill="${escapeXml(item.fill)}"${strokeAttrs(item.stroke, item.strokeWidth)}${opacityAttr(item.opacity)}/>`;
    case "rect":
      return `<rect${id} x="${round(item.x)}" y="${round(item.y)}" width="${round(item.width)}" height="${round(item.height)}"${item.rx ? ` rx="${round(item.rx)}"` : ""} fill="${escapeXml(item.fill)}"${strokeAttrs(item.stroke, item.strokeWidth)}${opacityAttr(item.opacity)}/>`;
    case "line":
      return `<line${id} x1="${round(item.x1)}" y1="${round(item.y1)}" x2="${round(item.x2)}" y2="${round(item.y2)}" stroke="${escapeXml(item.stroke)}" stroke-width="${round(item.strokeWidth ?? 1)}"${opacityAttr(item.opacity)}/>`;
    case "text":
      return `<text${id} x="${round(item.x)}" y="${round(item.y)}" fill="${escapeXml(item.fill)}" font-size="${round(item.size ?? 12)}" text-anchor="${item.anchor ?? "start"}"${opacityAttr(item.opacity)}>${escapeXml(item.text)}</text>`;
  }
}

export interface SvgOptions {
  /** Margin around the content, in scene units. Default 24. */
  padding?: number;
}

export interface SvgResult {
  svg: string;
  width: number;
  height: number;
}

/** Render a scene to a standalone SVG document. An empty scene yields a 1x1 transparent SVG. */
export function sceneToSVG(scene: Scene, opts: SvgOptions = {}): SvgResult {
  const bounds = sceneBounds(scene);
  const padded = bounds ? inflateRect(bounds, opts.padding ?? 24) : { x: 0, y: 0, width: 1, height: 1 };
  const width = Math.max(1, Math.ceil(padded.width));
  const height = Math.max(1, Math.ceil(padded.height));
  const body = scene.items.map(itemToSvg).join("\n  ");
  const bg = scene.background
    ? `\n  <rect x="${round(padded.x)}" y="${round(padded.y)}" width="${width}" height="${height}" fill="${escapeXml(scene.background)}"/>`
    : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${round(padded.x)} ${round(padded.y)} ${width} ${height}" font-family="${FONT_FAMILY}">` +
    (scene.title ? `\n  <title>${escapeXml(scene.title)}</title>` : "") +
    bg +
    `\n  ${body}\n</svg>\n`;
  return { svg, width, height };
}

/** Largest canvas edge we will allocate; bigger exports are scaled down to fit. */
const MAX_PNG_EDGE = 8192;

/** Rasterise a scene to a PNG blob. Browser only (needs Image and canvas). */
export async function sceneToPNG(scene: Scene, opts: SvgOptions & { scale?: number } = {}): Promise<Blob> {
  const { svg, width, height } = sceneToSVG(scene, opts);
  const wanted = opts.scale ?? 2;
  const scale = Math.min(wanted, MAX_PNG_EDGE / Math.max(width, height));
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("The graph could not be rendered to an image."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("A 2D canvas is not available.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The image could not be encoded."))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Save a blob through a transient anchor (the same path the backup export uses). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking on the next task lets the download start first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

/** `<base>-YYYY-MM-DD.<ext>` for the current day. */
export function exportFilename(base: string, ext: string, date: Date = new Date()): string {
  return `${base}-${date.toISOString().slice(0, 10)}.${ext}`;
}

/**
 * Resolve a CSS colour that may reference theme variables (`var(--node-note)`) to the concrete
 * colour the browser computes for `el`. Browser only.
 */
export function resolveCssColor(el: Element, value: string): string {
  if (!value.includes("var(")) return value;
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.display = "none";
  el.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || value;
}
