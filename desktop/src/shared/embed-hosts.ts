/**
 * Third-party hosts the renderer may frame or call directly. One list feeds both the canvas embed
 * code and the Content-Security-Policy, so the two cannot drift apart.
 */

/** Video players a canvas web node may embed (frame-src). */
export const FRAME_HOSTS = [
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://www.dailymotion.com",
  "https://www.loom.com",
] as const;

/**
 * Hosts the renderer fetches directly (connect-src). Everything else — AI providers, GitHub,
 * Obsidian, Ollama — goes through same-origin `/api/*` routes.
 * - models.dev: public model catalogue (`src/lib/ai/catalog.ts`).
 * - api.github.com: release check (`src/lib/updates.ts`).
 */
export const RENDERER_CONNECT_HOSTS = ["https://models.dev", "https://api.github.com"] as const;
