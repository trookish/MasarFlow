const ALWAYS_IGNORE_DIRS = new Set([
  ".obsidian",
  ".makemd",
  ".qodo",
  ".space",
  ".git",
  ".trash",
  "node_modules",
]);
const ALWAYS_IGNORE_FILES = new Set([".DS_Store", "Thumbs.db"]);

export function isIgnoredName(name: string): boolean {
  if (name.startsWith(".")) return true;
  if (ALWAYS_IGNORE_DIRS.has(name)) return true;
  if (ALWAYS_IGNORE_FILES.has(name)) return true;
  return false;
}

export function shouldSkipByExtension(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".canvas")) return true;
  if (lower.endsWith(".excalidraw")) return true;
  if (lower.endsWith(".base")) return true;
  return false;
}

export function detectFileKind(name: string): "markdown" | "canvas" | "attachment" | "other" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".canvas") || lower.endsWith(".excalidraw")) return "canvas";
  if (
    IMAGE_EXT.test(lower) ||
    VIDEO_EXT.test(lower) ||
    AUDIO_EXT.test(lower) ||
    lower.endsWith(".pdf")
  )
    return "attachment";
  return "other";
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/;
const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv)$/;
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|flac)$/;
const DOC_EXT = /\.(pdf|txt|docx?|xlsx?|pptx?|json|csv|zip|rar|7z)$/;

export function detectMimeType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".flac")) return "audio/flac";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
  return "application/octet-stream";
}

export function isImage(name: string): boolean {
  return IMAGE_EXT.test(name.toLowerCase());
}
export function isVideo(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}
export function isAudio(name: string): boolean {
  return AUDIO_EXT.test(name.toLowerCase());
}
export function isPdf(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}
export function isTextish(name: string): boolean {
  return /\.(txt|md|markdown|json|csv)$/i.test(name);
}
export function isDownloadable(name: string): boolean {
  return DOC_EXT.test(name.toLowerCase());
}

export function isNumberedFolder(name: string): boolean {
  return /^\d{2}\.\s+/.test(name);
}
export function isInTrash(relativePath: string): boolean {
  return relativePath.replace(/\\/g, "/").split("/").includes(".trash");
}
export function isTemplate(relativePath: string): boolean {
  return /^06\.\s*Templates(\b|\/)/i.test(relativePath.replace(/\\/g, "/"));
}
