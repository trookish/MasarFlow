// Server-side proxy that forwards a chat request to the selected provider and
// streams structured events back as NDJSON. Running this on the server (rather
// than the browser) dodges provider CORS restrictions and keeps the key off
// the client→provider wire. Keys are supplied per-request from the user's
// locally stored connection — nothing is persisted or logged here.
//
// Reliability: transient upstream failures (429/5xx/network) are retried with
// backoff, and hard 400s degrade gracefully — if a provider rejects tools,
// the system role, or thinking, the request is retried without that feature
// and a `notice` event tells the client what was dropped. The goal is that
// any provider/model combination produces a usable answer, never a dead end.
//
// Supports real function-calling on both wire formats:
//   OpenAI-compatible  → tools: [{ type: "function", function: {...} }]
//   Anthropic          → tools: [{ name, description, input_schema }]
// Multimodal user messages carry images as base64 blocks on both formats.
//
// Streamed response events (one JSON object per line):
//   { type: "text", text }                            — assistant text delta
//   { type: "reasoning", text }                       — reasoning/thinking delta
//   { type: "tool_call", id, name, arguments }        — a complete tool call
//   { type: "notice", message }                       — degradation notice
//   { type: "error", message }                        — mid-stream failure (retryable)
//   { type: "done", stopReason: "end" | "tool_calls" }
//
// Liveness: flaky gateways sometimes accept a request and then go silent —
// before the first byte, or worse, mid-stream after some thinking deltas
// (the UI showed a frozen "thinking…" forever). Two watchdogs keep a dead
// upstream from hanging a turn forever: a first-byte timeout on the upstream
// fetch (retried like other transient failures) and an idle timeout between
// stream chunks, which ends the turn with an `error` event so the client can
// surface a retryable failure instead of an eternal spinner. A total
// wall-clock budget caps the whole retry/degradation ladder so a sick
// provider can never hold the client's request open for minutes. All are
// env-overridable (mostly for tests):
//   MASARFLOW_CHAT_FIRST_BYTE_TIMEOUT_MS (default 30s)
//   MASARFLOW_CHAT_IDLE_TIMEOUT_MS       (default 60s)
//   MASARFLOW_CHAT_TOTAL_TIMEOUT_MS      (default 120s)

export const dynamic = "force-dynamic";

const FIRST_BYTE_TIMEOUT_MS = 30_000;
const IDLE_TIMEOUT_MS = 60_000;
const TOTAL_BUDGET_MS = 120_000;
/** Transient retries (network failure / 429 / 5xx) per whole request. */
const MAX_TRANSIENT_RETRIES = 1;
/** Hard cap on attempts (initial + retries + degradation steps). */
const MAX_ATTEMPTS = 6;

/** Env-overridable timeout (read at call time so tests can shrink it). */
function timeoutMs(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

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

interface WireImage {
  mimeType: string;
  /** Raw base64 payload (no data: prefix). */
  data: string;
}

type WireMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string;
      toolCalls?: WireToolCall[];
      images?: WireImage[];
    }
  | { role: "tool"; toolCallId: string; name: string; content: string };

interface ChatRequest {
  format: "openai" | "anthropic";
  baseUrl: string;
  apiKey: string;
  /** Provider doesn't require an API key (e.g. a local server like Ollama). */
  noAuth?: boolean;
  model: string;
  system?: string;
  messages: WireMessage[];
  tools?: WireToolDef[];
  /** Tool-calling mode when tools are present. Default: "auto". */
  toolChoice?: "auto" | "required" | "none";
  maxTokens?: number;
  /**
   * Client-generated id correlating this proxy request with its agent run
   * (echoed in every server log line). Absent → generated server-side.
   */
  requestId?: string;
  /**
   * Reasoning/thinking controls. When `enabled`, Anthropic requests get a
   * `thinking` block with a token budget (extended thinking); OpenAI-compatible
   * reasoning models stream `delta.reasoning_content` automatically.
   */
  reasoning?: { enabled: boolean; budget?: number };
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
        content.push({
          type: "tool_use",
          id: c.id,
          name: c.name,
          input: c.arguments,
        });
      }
      out.push({ role: "assistant", content });
      continue;
    }
    if (m.role === "user" && m.images?.length) {
      const content: Json[] = m.images.map((img) => ({
        type: "image",
        source: { type: "base64", media_type: img.mimeType, data: img.data },
      }));
      content.push({ type: "text", text: m.content || "(see attached image)" });
      out.push({ role: "user", content });
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

function toOpenAiMessages(
  system: string | undefined,
  messages: WireMessage[],
  opts: { foldSystem: boolean },
): Json[] {
  const out: Json[] = [];
  let pendingSystem = system?.trim() ? system : undefined;
  if (pendingSystem && !opts.foldSystem) {
    out.push({ role: "system", content: pendingSystem });
    pendingSystem = undefined;
  }
  for (const m of messages) {
    if (m.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content,
      });
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
    // Models that reject the system role get it folded into the first user turn.
    let text = m.content;
    if (pendingSystem && m.role === "user") {
      text = `${pendingSystem}\n\n---\n\n${m.content}`;
      pendingSystem = undefined;
    }
    if (m.role === "user" && m.images?.length) {
      const content: Json[] = [
        { type: "text", text: text || "(see attached image)" },
      ];
      for (const img of m.images) {
        content.push({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        });
      }
      out.push({ role: "user", content });
      continue;
    }
    out.push({ role: m.role, content: text });
  }
  return out;
}

/* ── Provider call with degradation ladder ──────────────────────────── */

interface CallFlags {
  withTools: boolean;
  withThinking: boolean;
  foldSystem: boolean;
  /** stream: false → single JSON response, parsed into the same events. */
  stream: boolean;
}

function buildPayload(
  body: ChatRequest,
  flags: CallFlags,
): {
  url: string;
  headers: Record<string, string>;
  payload: Json;
} {
  const { format, baseUrl, apiKey, model, system, messages, tools, reasoning } =
    body;
  const choice = body.toolChoice ?? "auto";
  const thinkBudget =
    reasoning?.enabled &&
    typeof reasoning.budget === "number" &&
    reasoning.budget > 0
      ? Math.min(Math.floor(reasoning.budget), 28000)
      : 4096;

  if (format === "anthropic") {
    // Anthropic requires max_tokens to exceed the thinking budget — and leave
    // generous room on top so the visible answer never gets starved by a big
    // thinking budget (the "thinking but no reply" failure).
    const baseMax = body.maxTokens ?? 8192;
    const maxTokens =
      flags.withThinking && reasoning?.enabled
        ? Math.max(baseMax, thinkBudget + 8192)
        : baseMax;
    return {
      url: `${trimSlash(baseUrl)}/v1/messages`,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      payload: {
        model,
        max_tokens: maxTokens,
        system: system || undefined,
        messages: toAnthropicMessages(messages),
        tools:
          flags.withTools && tools?.length
            ? tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters,
              }))
            : undefined,
        // Explicit choice: some gateways default to "none" when tools are
        // present without one, silently disabling tool use.
        tool_choice:
          flags.withTools && tools?.length
            ? { type: choice === "required" ? "any" : choice }
            : undefined,
        thinking:
          flags.withThinking && reasoning?.enabled
            ? { type: "enabled", budget_tokens: thinkBudget }
            : undefined,
        stream: flags.stream,
      },
    };
  }

  return {
    url: `${trimSlash(baseUrl)}/chat/completions`,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    payload: {
      model,
      messages: toOpenAiMessages(system, messages, {
        foldSystem: flags.foldSystem,
      }),
      tools:
        flags.withTools && tools?.length
          ? tools.map((t) => ({
              type: "function",
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              },
            }))
          : undefined,
      // Explicit choice: some OpenAI-compatible gateways (aggregators like
      // OpenCode Go / OpenRouter) silently ignore tools unless tool_choice
      // is set — without it the model answers but never calls functions.
      tool_choice: flags.withTools && tools?.length ? choice : undefined,
      // Ask OpenAI-compatible reasoning models (o-series, Gemini 2.5, R1
      // aggregators) to surface their thinking when the user enabled it.
      reasoning_effort:
        flags.withThinking && reasoning?.enabled ? "medium" : undefined,
      stream: flags.stream,
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function extractError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text);
    return String(j.error?.message ?? j.error ?? j.message ?? text);
  } catch {
    return text;
  }
}

/**
 * Decide which feature to drop after a hard 4xx, based on the provider's
 * error text. Returns the adjusted flags, or null when nothing else can help.
 */
function degrade(
  flags: CallFlags,
  body: ChatRequest,
  errorText: string,
): { flags: CallFlags; notice: string } | null {
  const err = errorText.toLowerCase();
  if (flags.withTools && body.tools?.length && /tool|function/.test(err)) {
    return {
      flags: { ...flags, withTools: false },
      notice:
        "This model rejected function calling — continuing without workspace tools (answers stay advisory).",
    };
  }
  if (
    flags.withThinking &&
    body.reasoning?.enabled &&
    /think|reasoning|budget/.test(err)
  ) {
    return {
      flags: { ...flags, withThinking: false },
      notice: "This model rejected extended thinking — continuing without it.",
    };
  }
  if (
    !flags.foldSystem &&
    body.format === "openai" &&
    body.system &&
    /system|developer|role|instruction/.test(err)
  ) {
    return {
      flags: { ...flags, foldSystem: true },
      notice:
        "This model rejected the system role — instructions were folded into the message.",
    };
  }
  if (flags.stream && /stream/.test(err)) {
    return {
      flags: { ...flags, stream: false },
      notice:
        "This model doesn't support streaming — the reply arrives all at once.",
    };
  }
  // Nuclear fallback: any other 4xx we couldn't classify (an unusual schema
  // rejection, an unsupported parameter, a picky OpenAI-compatible gateway).
  // Strip every optional feature and try once more with a bare-minimum
  // request so the user still gets an answer rather than a dead end.
  if (flags.withTools || flags.withThinking || !flags.foldSystem) {
    return {
      flags: {
        withTools: false,
        withThinking: false,
        foldSystem: body.format === "openai",
        stream: flags.stream,
      },
      notice:
        "This model rejected some request options — retrying with a simplified request.",
    };
  }
  return null;
}

/* ── Route ──────────────────────────────────────────────────────────── */

export async function POST(req: Request): Promise<Response> {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.apiKey && !body.noAuth)
    return Response.json({ error: "Missing API key" }, { status: 400 });
  if (!body.model)
    return Response.json({ error: "Missing model" }, { status: 400 });
  if (!body.baseUrl)
    return Response.json({ error: "Missing base URL" }, { status: 400 });

  const requestId =
    body.requestId && /^[A-Za-z0-9_-]{1,64}$/.test(body.requestId)
      ? body.requestId
      : `chat_${crypto.randomUUID().slice(0, 8)}`;

  const log = (msg: string, extra: Record<string, unknown> = {}) =>
    console.log(
      `[chat:${requestId}] ${msg}`,
      JSON.stringify({ format: body.format, model: body.model, ...extra }),
    );

  log("request received");

  let flags: CallFlags = {
    withTools: true,
    withThinking: true,
    foldSystem: false,
    stream: true,
  };
  const notices: string[] = [];
  let upstream: Response | null = null;
  let lastError = "";
  let lastStatus = 502;

  // The whole retry/degradation ladder shares one wall-clock budget so a sick
  // provider converges on a definitive answer (or a definitive failure)
  // quickly instead of holding the request open for minutes.
  const firstByteMs = timeoutMs(
    "MASARFLOW_CHAT_FIRST_BYTE_TIMEOUT_MS",
    FIRST_BYTE_TIMEOUT_MS,
  );
  const totalMs = timeoutMs("MASARFLOW_CHAT_TOTAL_TIMEOUT_MS", TOTAL_BUDGET_MS);
  const startedAt = Date.now();
  let transientRetries = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (Date.now() - startedAt > totalMs) {
      lastError = `The provider didn't respond within ${Math.round(totalMs / 1000)}s — it may be overloaded.`;
      lastStatus = 504;
      log("giving up", { reason: "total budget exceeded" });
      break;
    }
    const { url, headers, payload } = buildPayload(body, flags);
    log("upstream attempt", {
      attempt: attempt + 1,
      url,
      stream: flags.stream,
      tools: flags.withTools,
      thinking: flags.withThinking,
      foldSystem: flags.foldSystem,
    });
    let res: Response;
    // First-byte watchdog: some gateways accept the request and then hold it
    // open without ever answering (overload queues, dead upstreams). Abort
    // and treat it as transient so the retry budget applies; the timer is
    // cleared once headers arrive so the body can stream unbounded (the
    // stream's own idle watchdog takes over from there).
    const abort = new AbortController();
    const firstByteTimer = setTimeout(() => abort.abort(), firstByteMs);
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: abort.signal,
      });
    } catch (e) {
      if (abort.signal.aborted) {
        lastError = `The provider didn't respond within ${Math.round(firstByteMs / 1000)}s — it may be overloaded.`;
        lastStatus = 504;
      } else {
        lastError = `Could not reach provider: ${(e as Error).message}`;
        lastStatus = 502;
      }
      log("upstream failed", { status: lastStatus, error: lastError });
      if (transientRetries++ < MAX_TRANSIENT_RETRIES) {
        await sleep(400 * transientRetries);
        continue;
      }
      break;
    } finally {
      clearTimeout(firstByteTimer);
    }

    if (res.ok && res.body) {
      upstream = res;
      log("upstream ready", { status: res.status });
      break;
    }

    lastStatus = res.status || 502;
    lastError = (await extractError(res)) || `Provider error ${res.status}`;
    log("upstream rejected", { status: lastStatus, error: lastError });

    // Transient: rate limit / overload / server error → backoff and retry.
    if (res.status === 429 || res.status >= 500) {
      if (transientRetries++ < MAX_TRANSIENT_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 5000)
            : 600 * transientRetries,
        );
        continue;
      }
      break;
    }

    // Hard 4xx: drop the feature the provider objected to and retry.
    if (res.status >= 400 && res.status < 500) {
      const next = degrade(flags, body, lastError);
      if (next) {
        flags = next.flags;
        notices.push(next.notice);
        log("degraded", { notice: next.notice });
        continue;
      }
    }
    break;
  }

  if (!upstream?.body) {
    log("request failed", { status: lastStatus, error: lastError });
    return Response.json(
      { error: lastError || "Provider request failed" },
      { status: lastStatus },
    );
  }

  const ndjsonHeaders = {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
  };

  // Some models/providers ignore `stream: true` and answer with one JSON
  // document — detect that (or an explicit stream:false retry) and convert
  // the complete response into the same event protocol.
  const upstreamType = upstream.headers.get("content-type") ?? "";
  if (!flags.stream || upstreamType.includes("application/json")) {
    const raw = await upstream.text();
    const events = nonStreamToEvents(raw, body.format);
    if (events !== null) {
      const lines = [
        ...notices.map((message) => ({ type: "notice", message })),
        ...events,
      ]
        .map((e) => JSON.stringify(e))
        .join("\n");
      log("response completed", { stopReason: "end", nonStream: true });
      return new Response(`${lines}\n`, { headers: ndjsonHeaders });
    }
    // Not a JSON document after all (SSE with an odd content-type) — feed the
    // buffered text through the normal SSE transform.
    const encoder = new TextEncoder();
    const replay = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(raw));
        controller.close();
      },
    });
    return new Response(transformSSE(replay, body.format, notices, log), {
      headers: ndjsonHeaders,
    });
  }

  return new Response(transformSSE(upstream.body, body.format, notices, log), {
    headers: ndjsonHeaders,
  });
}

/* ── Complete (non-streaming) response → events ─────────────────────── */

/**
 * Convert a complete JSON response (OpenAI `choices[0].message` or Anthropic
 * `type:"message"`) into the NDJSON event list. Returns null when the body
 * isn't a JSON document.
 */
function nonStreamToEvents(
  raw: string,
  format: "openai" | "anthropic",
): Json[] | null {
  let json: Json;
  try {
    json = JSON.parse(raw) as Json;
  } catch {
    return null;
  }
  const events: Json[] = [];
  let sawToolCalls = false;

  if (format === "anthropic" || json.type === "message") {
    const content = (json.content as Json[] | undefined) ?? [];
    for (const block of content) {
      if (block.type === "text" && block.text) {
        events.push({ type: "text", text: String(block.text) });
      } else if (block.type === "thinking" && block.thinking) {
        events.push({ type: "reasoning", text: String(block.thinking) });
      } else if (block.type === "tool_use") {
        sawToolCalls = true;
        events.push({
          type: "tool_call",
          id: String(block.id ?? "tool_0"),
          name: String(block.name ?? ""),
          arguments:
            typeof block.input === "object" && block.input !== null
              ? block.input
              : {},
        });
      }
    }
  } else {
    const choice = (json.choices as Json[] | undefined)?.[0];
    const message = choice?.message as Json | undefined;
    if (message) {
      const content = message.content;
      if (typeof content === "string" && content) {
        events.push({ type: "text", text: content });
      } else if (Array.isArray(content)) {
        for (const part of content as Json[]) {
          if (typeof part === "string")
            events.push({ type: "text", text: part });
          else if (part.type === "text" && part.text) {
            events.push({ type: "text", text: String(part.text) });
          }
        }
      }
      const reasoning = message.reasoning_content || message.reasoning;
      if (typeof reasoning === "string" && reasoning) {
        events.push({ type: "reasoning", text: reasoning });
      }
      const toolCalls = message.tool_calls as Json[] | undefined;
      if (Array.isArray(toolCalls)) {
        for (const tc of toolCalls) {
          const fn = tc.function as Json | undefined;
          let args: Record<string, unknown> = {};
          try {
            const parsed = JSON.parse(String(fn?.arguments ?? "{}"));
            if (typeof parsed === "object" && parsed !== null) args = parsed;
          } catch {
            /* leave empty */
          }
          sawToolCalls = true;
          events.push({
            type: "tool_call",
            id: String(tc.id ?? "tool_0"),
            name: String(fn?.name ?? ""),
            arguments: args,
          });
        }
      }
      const finish = String(choice?.finish_reason ?? "");
      if (finish === "length") {
        events.push({
          type: "notice",
          message: "The reply hit the model's output limit and was cut off.",
        });
      } else if (finish === "content_filter") {
        events.push({
          type: "notice",
          message: "The provider's content filter stopped this reply.",
        });
      }
    }
  }

  events.push({
    type: "done",
    stopReason: sawToolCalls ? "tool_calls" : "end",
  });
  return events;
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
  notices: string[] = [],
  log?: (msg: string, extra?: Record<string, unknown>) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = body.getReader();
  let buffer = "";
  let sawToolCalls = false;
  /** Set to true when we detect the stream is logically complete. */
  let streamDone = false;
  let sentNotices = false;
  let sentFirstChunk = false;
  /**
   * Incomplete JSON payload from a split SSE event (see the data: handling
   * below). Empty when no fragment is being held.
   */
  let fragment = "";

  // Anthropic: tool_use blocks keyed by content-block index.
  const anthropicBlocks = new Map<number, PendingToolCall>();
  // OpenAI: tool calls keyed by delta index (or a synthetic slot when the
  // gateway omits `index` — see openaiKeyFor below).
  const openaiCalls = new Map<number, PendingToolCall>();

  /**
   * Map a tool-call delta chunk to its accumulating call. The reliable key is
   * the per-call `index`; some gateways omit it and send the call id on the
   * first chunk only. Fall back to matching by id, then to appending onto the
   * most recent call — so parallel calls never corrupt each other's arguments.
   */
  const openaiKeyFor = (td: Json): number => {
    if (typeof td.index === "number") return td.index;
    const id = td.id ? String(td.id) : "";
    if (id) {
      for (const [k, call] of openaiCalls) if (call.id === id) return k;
      // A new call identified by id: open a fresh slot (the id may only
      // appear on this first chunk, so the slot must be findable later).
      return openaiCalls.size;
    }
    // No index and no id: continuation of the most recent call.
    return openaiCalls.size > 0 ? openaiCalls.size - 1 : 0;
  };

  const emit = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    event: Json,
  ) => {
    if (
      !sentFirstChunk &&
      (event.type === "text" || event.type === "reasoning") &&
      String(event.text ?? "").length > 0
    ) {
      sentFirstChunk = true;
      log?.("first response chunk");
    }
    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
  };

  const parseArgs = (raw: string): Record<string, unknown> => {
    if (!raw.trim()) return {};
    try {
      const v = JSON.parse(raw);
      return typeof v === "object" && v !== null
        ? (v as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  };

  const flushOpenAiCalls = (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
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

  /** Emit the final "done" event and close the output stream. */
  const finishStream = (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    flushOpenAiCalls(controller);
    emit(controller, {
      type: "done",
      stopReason: sawToolCalls ? "tool_calls" : "end",
    });
    controller.close();
    // Cancel the upstream reader so the fetch doesn't linger.
    void reader.cancel();
    log?.("response completed", {
      stopReason: sawToolCalls ? "tool_calls" : "end",
    });
  };

  const handleLine = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    data: string,
  ) => {
    const json = JSON.parse(data) as Json;

    // Auto-detect Anthropic format even on OpenAI endpoints (some providers
    // like OpenCode Zen pass through Claude formats raw).
    const isAnthropic =
      format === "anthropic" ||
      json.type === "message_start" ||
      json.type === "content_block_start" ||
      json.type === "content_block_delta" ||
      json.type === "content_block_stop" ||
      json.type === "message_delta" ||
      json.type === "message_stop";

    if (isAnthropic) {
      const type = json.type as string;
      if (type === "message_stop") {
        streamDone = true;
        return;
      }
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
        } else if (delta?.type === "thinking_delta" && delta.thinking) {
          emit(controller, { type: "reasoning", text: String(delta.thinking) });
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
      } else if (type === "message_delta") {
        // Anthropic reports truncation here (message_stop follows) — mirror
        // the OpenAI "length" notice so a cut-off answer is visible.
        const delta = json.delta as Json | undefined;
        if (delta?.stop_reason === "max_tokens") {
          emit(controller, {
            type: "notice",
            message: "The reply hit the model's output limit and was cut off.",
          });
        }
      }
      return;
    }

    // OpenAI-compatible
    const choices = json.choices as Json[] | undefined;
    if (!choices || choices.length === 0) {
      // Some providers send a final usage chunk with empty choices.
      return;
    }
    const choice = choices[0];
    const delta = choice.delta as Json | undefined;
    const text = delta?.content;
    if (typeof text === "string" && text) {
      emit(controller, { type: "text", text });
    } else if (Array.isArray(text)) {
      // Some providers stream content as an array of typed parts.
      for (const part of text as Json[]) {
        if (typeof part === "string" && part) {
          emit(controller, { type: "text", text: part });
        } else if (part && part.type === "text" && part.text) {
          emit(controller, { type: "text", text: String(part.text) });
        }
      }
    }
    // Some providers put a complete message (not a delta) in an SSE chunk.
    const whole = choice.message as Json | undefined;
    if (whole && typeof whole.content === "string" && whole.content) {
      emit(controller, { type: "text", text: whole.content });
    }
    // Reasoning/thinking deltas.
    const reasoning = delta?.reasoning_content || delta?.reasoning;
    if (typeof reasoning === "string" && reasoning) {
      emit(controller, { type: "reasoning", text: reasoning });
    }
    const toolDeltas = delta?.tool_calls as Json[] | undefined;
    if (Array.isArray(toolDeltas)) {
      for (const td of toolDeltas) {
        const key = openaiKeyFor(td);
        let call = openaiCalls.get(key);
        if (!call) {
          call = { id: "", name: "", argsJson: "" };
          openaiCalls.set(key, call);
        }
        if (td.id) call.id = String(td.id);
        const fn = td.function as Json | undefined;
        if (fn?.name) call.name += String(fn.name);
        if (fn?.arguments) call.argsJson += String(fn.arguments);
      }
    }
    if (choice.finish_reason) {
      const finish = String(choice.finish_reason);
      if (finish === "length") {
        emit(controller, {
          type: "notice",
          message: "The reply hit the model's output limit and was cut off.",
        });
      } else if (finish === "content_filter") {
        emit(controller, {
          type: "notice",
          message: "The provider's content filter stopped this reply.",
        });
      }
      flushOpenAiCalls(controller);
      streamDone = true;
    }
  };

  const idleMs = timeoutMs("MASARFLOW_CHAT_IDLE_TIMEOUT_MS", IDLE_TIMEOUT_MS);

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sentNotices) {
        sentNotices = true;
        for (const message of notices)
          emit(controller, { type: "notice", message });
      }
      if (streamDone) {
        finishStream(controller);
        return;
      }

      // Idle watchdog: a provider that goes silent mid-stream (or never
      // starts) must not hang the turn forever. Any received bytes — even
      // keepalive comments — reset the timer, so only true silence trips it.
      let readResult: ReadableStreamReadResult<Uint8Array>;
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        readResult = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            idleTimer = setTimeout(
              () => reject(new Error("stream-idle-timeout")),
              idleMs,
            );
          }),
        ]);
      } catch (e) {
        // Idle timeout or upstream socket failure mid-stream. Do NOT flush
        // pending tool calls (their arguments are incomplete — executing
        // them would corrupt the workspace); end the turn with a retryable
        // error instead of an eternal spinner.
        void reader.cancel().catch(() => {});
        const stalled = (e as Error).message === "stream-idle-timeout";
        const message = stalled
          ? `The provider stopped responding mid-stream (${Math.round(idleMs / 1000)}s of silence) — Retry to continue.`
          : `The provider connection failed mid-stream: ${(e as Error).message}`;
        log?.("response failed", {
          reason: stalled ? "idle-timeout" : "mid-stream-error",
          message,
        });
        emit(controller, { type: "error", message });
        emit(controller, { type: "done", stopReason: "end" });
        controller.close();
        return;
      } finally {
        if (idleTimer) clearTimeout(idleTimer);
      }

      const { done, value } = readResult;
      if (done) {
        finishStream(controller);
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        // Blank line = SSE event boundary. Any held fragment that still
        // doesn't parse was a keepalive/garbage — drop it.
        if (!trimmed) {
          fragment = "";
          continue;
        }

        let data: string | null = null;

        if (trimmed.startsWith("data:")) {
          data = trimmed.slice(5).trim();
        } else if (trimmed.startsWith("{")) {
          data = trimmed;
        } else if (trimmed === "[DONE]") {
          data = trimmed;
        }

        if (!data) continue;
        if (data === "[DONE]") {
          streamDone = true;
          break;
        }
        // Some gateways split one event's JSON payload across several data:
        // lines (spec-conformant producers mean "\n"-joined data, but JSON
        // only survives byte-joining). Try each line immediately (common
        // case: one complete JSON per line, no added latency); on parse
        // failure hold it as a fragment and retry as more lines arrive.
        if (fragment) {
          const joined = fragment + data;
          try {
            handleLine(controller, joined);
            fragment = "";
          } catch {
            // Maybe the new line is a fresh event and the held fragment was
            // junk — parse it alone before accumulating further.
            try {
              handleLine(controller, data);
              fragment = "";
            } catch {
              fragment = joined;
            }
          }
        } else {
          try {
            handleLine(controller, data);
          } catch {
            fragment = data;
          }
        }
        if (streamDone) break;
      }

      if (streamDone) {
        finishStream(controller);
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}
