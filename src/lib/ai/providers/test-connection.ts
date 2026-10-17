import { streamChat } from "@/lib/ai/chat-client";
import type { AiProvider } from "@/lib/ai/catalog";
import { friendlyChatError } from "@/lib/ai/errors";

/**
 * One tiny round trip ("Reply with the single word: ok") through /api/chat.
 * Resolves `{ ok: true }` or `{ ok: false, error }` (already user-friendly).
 * Used by the connections dialog to prove a saved (or in-progress) connection
 * actually answers before the user relies on it.
 */
export async function testConnection(args: {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    let got = false;
    await streamChat({
      ...args,
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      onDelta: () => {
        got = true;
      },
      signal: ac.signal,
    });
    return got
      ? { ok: true }
      : { ok: false, error: "The provider answered but returned no text." };
  } catch (e) {
    return {
      ok: false,
      error: friendlyChatError(e instanceof Error ? e.message : String(e)),
    };
  } finally {
    clearTimeout(timer);
  }
}
