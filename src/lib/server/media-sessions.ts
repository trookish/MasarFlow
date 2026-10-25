import { randomBytes } from "node:crypto";

/**
 * Short-lived handles for streaming Obsidian attachments. `<img>`/`<video>` elements can only send a
 * URL, so the renderer exchanges the Obsidian API key for an opaque session id once (POST body) and
 * media URLs carry only that id. The key never appears in a URL, the history or a server log.
 */
export interface MediaSession {
  baseUrl: string;
  apiKey: string;
  expiresAt: number;
}

export const MEDIA_SESSION_TTL_MS = 30 * 60_000;
const MAX_SESSIONS = 32;
const sessions = new Map<string, MediaSession>();

function sweep(now: number) {
  for (const [id, s] of sessions) if (s.expiresAt <= now) sessions.delete(id);
  while (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value as string);
}

export function createMediaSession(baseUrl: string, apiKey: string, now = Date.now()): string {
  sweep(now);
  const id = randomBytes(32).toString("base64url");
  sessions.set(id, { baseUrl, apiKey, expiresAt: now + MEDIA_SESSION_TTL_MS });
  return id;
}

export function getMediaSession(id: string | null, now = Date.now()): MediaSession | null {
  if (!id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  if (s.expiresAt <= now) {
    sessions.delete(id);
    return null;
  }
  return s;
}
