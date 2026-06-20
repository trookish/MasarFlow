import {
  providerFormat,
  providerBaseUrl,
  type AiProvider,
} from "./catalog";

export interface StreamChatOptions {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  onDelta: (chunk: string) => void;
  signal?: AbortSignal;
}

/**
 * Stream a chat completion through the app's /api/chat proxy. Calls `onDelta`
 * with each text chunk as it arrives; resolves when the stream ends; throws
 * with the provider's error message on failure.
 */
export async function streamChat(opts: StreamChatOptions): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      format: providerFormat(opts.provider),
      baseUrl: opts.baseUrl?.trim() || providerBaseUrl(opts.provider),
      apiKey: opts.apiKey,
      model: opts.model,
      system: opts.system,
      messages: opts.messages,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      message = j.error ?? message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) opts.onDelta(chunk);
  }
}
