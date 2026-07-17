import type { ChatAttachment } from "@/lib/db/schema";

/**
 * Attachment handling for the chat composer. Images are downscaled client-side
 * to keep prompts and IndexedDB small; text-like files have their content
 * extracted and inlined into the prompt as fenced blocks. Pure helpers are
 * exported separately for unit testing.
 */

/** Longest edge for images sent to models (matches common provider limits). */
const MAX_IMAGE_EDGE = 1568;
/** JPEG quality for downscaled images. */
const JPEG_QUALITY = 0.85;
/** Cap for inlined text-file content (chars). */
const MAX_TEXT_CHARS = 24_000;
/** Cap on raw file size we will even try to read (bytes). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "mdx", "markdown", "rst", "csv", "tsv", "log",
  "json", "jsonc", "yaml", "yml", "toml", "ini", "env", "xml",
  "html", "htm", "css", "scss", "less",
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "py", "rb", "go", "rs", "java", "kt", "swift", "c", "h", "cpp", "hpp",
  "cs", "php", "sql", "sh", "ps1", "bat", "lua", "r", "pl",
  "svg", "graphql", "prisma", "vue", "svelte",
]);

/** File extension (lowercase, no dot). Pure. */
export function fileExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Whether a file should be treated as inline-able text. Pure. */
export function isTextLikeFile(name: string, mimeType: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  if (["application/json", "application/xml", "application/x-yaml"].includes(mimeType)) {
    return true;
  }
  return TEXT_EXTENSIONS.has(fileExt(name));
}

/** Whether a file is an image we can send to multimodal models. Pure. */
export function isImageFile(mimeType: string): boolean {
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mimeType);
}

/**
 * Build the prompt block for an inlined text file. Pure.
 * Fenced with the extension for syntax-aware models; clipped to a sane size.
 */
export function formatFileBlock(name: string, content: string): string {
  const clipped =
    content.length > MAX_TEXT_CHARS
      ? `${content.slice(0, MAX_TEXT_CHARS)}\n… (truncated, ${content.length} chars total)`
      : content;
  const lang = fileExt(name);
  return `Attached file: ${name}\n\`\`\`${lang}\n${clipped}\n\`\`\``;
}

/** Split a data URL into its mime type and raw base64 payload. Pure. */
export function splitDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

/* ── Browser-side readers ─────────────────────────────────────────────── */

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale an image file to a JPEG/PNG data URL bounded by MAX_IMAGE_EDGE.
 * GIFs lose animation (first frame) — acceptable for model input.
 */
async function downscaleImage(file: File): Promise<string> {
  const sourceUrl = await readAsDataUrl(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Could not decode image ${file.name}`));
    img.src = sourceUrl;
  });
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) return sourceUrl;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return sourceUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // PNG keeps transparency; everything else compresses better as JPEG.
  return file.type === "image/png"
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export interface PreparedAttachment {
  attachment: ChatAttachment;
  /** Set for images: what gets sent to the model. */
  image?: { mimeType: string; data: string };
  /** Set for text files: the prompt block appended to the message. */
  promptBlock?: string;
}

/**
 * Read one dropped/picked file into a ready-to-send attachment. Throws with a
 * user-readable message for unsupported/oversized files.
 */
export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is too large (max 20 MB).`);
  }
  if (isImageFile(file.type)) {
    const dataUrl = await downscaleImage(file);
    const parts = splitDataUrl(dataUrl);
    if (!parts) throw new Error(`Could not read image ${file.name}.`);
    return {
      attachment: {
        name: file.name,
        mimeType: parts.mimeType,
        kind: "image",
        dataUrl,
        textContent: "",
      },
      image: parts,
    };
  }
  if (isTextLikeFile(file.name, file.type)) {
    const text = await file.text();
    return {
      attachment: {
        name: file.name,
        mimeType: file.type || "text/plain",
        kind: "file",
        dataUrl: "",
        textContent: text.slice(0, MAX_TEXT_CHARS),
      },
      promptBlock: formatFileBlock(file.name, text),
    };
  }
  throw new Error(
    `${file.name}: unsupported type. Attach images (PNG/JPEG/WebP/GIF) or text/code files.`,
  );
}
