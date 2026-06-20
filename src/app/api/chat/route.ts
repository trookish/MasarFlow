// Server-side proxy that forwards a chat request to the selected provider and
// streams the assistant's text back. Running this on the server (rather than
// the browser) dodges provider CORS restrictions and keeps the key off the
// client→provider wire. Keys are supplied per-request from the user's locally
// stored connection — nothing is persisted or logged here.

export const dynamic = "force-dynamic";

interface ChatRequest {
  format: "openai" | "anthropic";
  baseUrl: string;
  apiKey: string;
  model: string;
  system?: string;
  messages: { role: "user" | "assistant" | "system"; content: string }[];
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function POST(req: Request): Promise<Response> {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { format, baseUrl, apiKey, model, system, messages } = body;
  if (!apiKey) return Response.json({ error: "Missing API key" }, { status: 400 });
  if (!model) return Response.json({ error: "Missing model" }, { status: 400 });
  if (!baseUrl) return Response.json({ error: "Missing base URL" }, { status: 400 });

  let upstream: Response;
  try {
    if (format === "anthropic") {
      upstream = await fetch(`${trimSlash(baseUrl)}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: system || undefined,
          messages: messages
            .filter((m) => m.role !== "system")
            .map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });
    } else {
      upstream = await fetch(`${trimSlash(baseUrl)}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            ...messages,
          ],
          stream: true,
        }),
      });
    }
  } catch (e) {
    return Response.json(
      { error: `Could not reach provider: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    let message = text;
    try {
      const j = JSON.parse(text);
      message = j.error?.message ?? j.error ?? j.message ?? text;
    } catch {
      /* not JSON — use raw text */
    }
    return Response.json(
      { error: message || `Provider error ${upstream.status}` },
      { status: upstream.status || 502 },
    );
  }

  return new Response(transformSSE(upstream.body, format), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Turn a provider's SSE stream into a plain-text stream of content deltas. */
function transformSSE(
  body: ReadableStream<Uint8Array>,
  format: "openai" | "anthropic",
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = body.getReader();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          let text = "";
          if (format === "anthropic") {
            if (
              json.type === "content_block_delta" &&
              json.delta?.type === "text_delta"
            ) {
              text = json.delta.text ?? "";
            }
          } else {
            text = json.choices?.[0]?.delta?.content ?? "";
          }
          if (text) controller.enqueue(encoder.encode(text));
        } catch {
          /* partial or non-JSON keepalive — ignore */
        }
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}
