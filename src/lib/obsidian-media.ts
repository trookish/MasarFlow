"use client";

import { useEffect, useState } from "react";

/** Media sessions are cached per connection so every image on a page shares one exchange. */
const cache = new Map<string, Promise<string | null>>();

function requestSession(baseUrl: string, apiKey: string): Promise<string | null> {
  const key = `${baseUrl}\u0000${apiKey}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch("/api/obsidian/media", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseUrl, apiKey }),
    })
      .then(async (r) => (r.ok ? ((await r.json()) as { session: string }).session : null))
      .catch(() => null);
    cache.set(key, p);
    // Renew before the server-side session expires (30 minutes).
    setTimeout(() => cache.delete(key), 25 * 60_000);
  }
  return p;
}

/**
 * Returns a function that maps a vault path to a streamable URL, or null while the media session is
 * being established or when Obsidian is not configured. The API key never enters the URL.
 */
export function useObsidianMediaUrl(baseUrl: string | undefined, apiKey: string | undefined) {
  const [session, setSession] = useState<{ key: string; id: string | null } | null>(null);
  const key = baseUrl && apiKey ? `${baseUrl}\u0000${apiKey}` : "";
  useEffect(() => {
    if (!baseUrl || !apiKey) return;
    let live = true;
    void requestSession(baseUrl, apiKey).then((id) => {
      if (live) setSession({ key: `${baseUrl}\u0000${apiKey}`, id });
    });
    return () => {
      live = false;
    };
  }, [baseUrl, apiKey]);
  const id = session && session.key === key ? session.id : null;
  return (path: string): string | null => {
    if (!id) return null;
    const url = new URL("/api/obsidian/media", window.location.origin);
    url.searchParams.set("session", id);
    url.searchParams.set("path", path);
    return url.toString();
  };
}
