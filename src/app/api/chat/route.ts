// Server-side proxy that forwards a chat request to the selected provider and
// streams structured events back as NDJSON. Running this on the server (rather
// than the browser) dodges provider CORS restrictions and keeps the key off
// the client→provider wire. Keys are supplied per-request from the user's
// locally stored connection — nothing is persisted or logged here.
//
// Supports real function-calling on both wire formats:
//   OpenAI-compatible  → tools: [{ type: "function", function: {...} }]
//   Anthropic          → tools: [{ name, description, input_schema }]
// Streamed response events (one JSON object per line):
//   { type: "text", text }                            — assistant text delta
//   { type: "tool_call", id, name, arguments }        — a complete tool call
//   { type: "done", stopReason: "end" | "tool_calls" }

export const dynamic = "force-dynamic";

interface WireToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface WireToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

type WireMessage =
  | { role: "system" | "user" | "assistant"; content: string; toolCalls?: WireToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

interface ChatRequest {
  format: "openai" | "anthropic";
  baseUrl: string;
  apiKey: string;
  model: string;
  system?: string;
  messages: WireMessage[];
  tools?: WireToolDef[];
  maxTokens?: number;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/* ── Message conversion ─────────────────────────────────────────────── */

type Json = Record<string, unknown>;

function toAnthropicMessages(messages: WireMessage[]): Json[] {
  const out: Json[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      const block = {
        type: "tool_result",
        tool_use_id: m.toolCallId,
        content: m.content,
      };
      // Consecutive tool results must merge into one user turn.
      const last = out[out.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) {
        (last.content as Json[]).push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      const content: Json[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const c of m.toolCalls) {
        content.push({ type: "tool_use", id: c.id, name: c.name, input: c.arguments });
      }
      out.push({ role: "assistant", content });
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

function toOpenAiMessages(system: string | undefined, messages: WireMessage[]): Json[] {
  const out: Json[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (m.role === "tool") {
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      out.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.arguments) },
        })),
      });
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

/* ── Route ──────────────────────────────────────────────────────────── */

export async function POST(req: Request): Promise<Response> {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { format, baseUrl, apiKey, model, system, messages, tools } = body;
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
          max_tokens: body.maxTokens ?? 8192,
          system: system || undefined,
          messages: toAnthropicMessages(messages),
          tools: tools?.length
            ? tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters,
              }))
            : undefined,
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
          messages: toOpenAiMessages(system, messages),
          tools: tools?.length
            ? tools.map((t) => ({
                type: "function",
                function: {
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters,
                },
              }))
            : undefined,
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
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/* ── SSE → NDJSON event transform ───────────────────────────────────── */

interface PendingToolCall {
  id: string;
  name: string;
  argsJson: string;
}

/**
 * Turn a provider's SSE stream into NDJSON events. Text deltas stream through
 * immediately; tool-call arguments are accumulated until complete, then
 * emitted as a single `tool_call` event.
 */
function transformSSE(
  body: ReadableStream<Uint8Array>,
  format: "openai" | "anthropic",
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = body.getReader();
  let buffer = "";
  let sawToolCalls = false;

  // Anthropic: tool_use blocks keyed by content-block index.
  const anthropicBlocks = new Map<number, PendingToolCall>();
  // OpenAI: tool calls keyed by delta index.
  const openaiCalls = new Map<number, PendingToolCall>();

  const emit = (controller: ReadableStreamDefaultController<Uint8Array>, event: Json) => {
    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
  };

  const parseArgs = (raw: string): Record<string, unknown> => {
    if (!raw.trim()) return {};
    try {
      const v = JSON.parse(raw);
      return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };

  const flushOpenAiCalls = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    for (const call of openaiCalls.values()) {
      if (!call.name) continue;
      sawToolCalls = true;
      emit(controller, {
        type: "tool_call",
        id: call.id,
        name: call.name,
        arguments: parseArgs(call.argsJson),
      });
    }
    openaiCalls.clear();
  };

  const handleLine = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    data: string,
  ) => {
    const json = JSON.parse(data) as Json;
    if (format === "anthropic") {
      const type = json.type as string;
      if (type === "content_block_start") {
        const index = json.index as number;
        const block = json.content_block as Json | undefined;
        if (block?.type === "tool_use") {
          anthropicBlocks.set(index, {
            id: String(block.id ?? `tool_${index}`),
            name: String(block.name ?? ""),
            argsJson: "",
          });
        }
      } else if (type === "content_block_delta") {
        const delta = json.delta as Json | undefined;
        if (delta?.type === "text_delta" && delta.text) {
          emit(controller, { type: "text", text: String(delta.text) });
        } else if (delta?.type === "input_json_delta") {
          const pending = anthropicBlocks.get(json.index as number);
          if (pending) pending.argsJson += String(delta.partial_json ?? "");
        }
      } else if (type === "content_block_stop") {
        const pending = anthropicBlocks.get(json.index as number);
        if (pending) {
          anthropicBlocks.delete(json.index as number);
          sawToolCalls = true;
          emit(controller, {
            type: "tool_call",
            id: pending.id,
            name: pending.name,
            arguments: parseArgs(pending.argsJson),
          });
        }
      }
      return;
    }

    // OpenAI-compatible
    const choice = (json.choices as Json[] | undefined)?.[0] as Json | undefined;
    if (!choice) return;
    const delta = choice.delta as Json | undefined;
    const text = delta?.content;
    if (typeof text === "string" && text) {
      emit(controller, { type: "text", text });
    }
    const toolDeltas = delta?.tool_calls as Json[] | undefined;
    if (Array.isArray(toolDeltas)) {
      for (const td of toolDeltas) {
        const index = (td.index as number) ?? 0;
        let call = openaiCalls.get(index);
        if (!call) {
          call = { id: "", name: "", argsJson: "" };
          openaiCalls.set(index, call);
        }
        if (td.id) call.id = String(td.id);
        const fn = td.function as Json | undefined;
        if (fn?.name) call.name += String(fn.name);
        if (fn?.arguments) call.argsJson += String(fn.arguments);
      }
    }
    if (choice.finish_reason) flushOpenAiCalls(controller);
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        flushOpenAiCalls(controller);
        emit(controller, {
          type: "done",
          stopReason: sawToolCalls ? "tool_calls" : "end",
        });
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
          handleLine(controller, data);
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
