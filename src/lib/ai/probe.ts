import { streamTurn } from "./chat-client";
import type { AiProvider } from "./catalog";

/**
 * Connection probe: definitively answers "what does this provider + model +
 * gateway actually support?" by firing two tiny requests through /api/chat:
 *   1. ping      — connectivity + whether text streams incrementally
 *   2. tool test — a forced tool call (tool_choice: required); if the model
 *                  emits the call, function calling really works end-to-end
 * Used by the connections dialog's "Test connection" button so capability
 * failures are visible up front instead of silent mid-chat degradation.
 */

export interface ProbeResult {
  /** Basic connectivity + auth succeeded. */
  ok: boolean;
  latencyMs: number;
  /** Text arrived in more than one chunk (real streaming, not one-shot). */
  streaming: boolean;
  /** The model emitted the forced tool call. null = not tested (ping failed). */
  tools: boolean | null;
  /** Human-readable failure reason when ok === false. */
  error?: string;
}

const ECHO_TOOL = {
  name: "probe_echo",
  description:
    "Echo a short value back to the caller. Used to test function calling.",
  parameters: {
    type: "object",
    properties: {
      value: { type: "string", description: "The value to echo." },
    },
    required: ["value"],
  },
};

export async function probeConnection(opts: {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  signal?: AbortSignal;
}): Promise<ProbeResult> {
  const started = Date.now();

  // 1. Ping — plain completion.
  let chunks = 0;
  try {
    await streamTurn({
      provider: opts.provider,
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      model: opts.model,
      messages: [{ role: "user", content: "Reply with exactly: ok" }],
      signal: opts.signal,
      onEvent: (e) => {
        if (e.type === "text") chunks++;
      },
    });
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      streaming: false,
      tools: null,
      error: (e as Error).message,
    };
  }
  const latencyMs = Date.now() - started;

  // 2. Forced tool call — the definitive function-calling test.
  let tools = false;
  try {
    await streamTurn({
      provider: opts.provider,
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      model: opts.model,
      messages: [
        {
          role: "user",
          content:
            'Call the probe_echo tool with value "pong". Do not write any text answer.',
        },
      ],
      tools: [ECHO_TOOL],
      toolChoice: "required",
      signal: opts.signal,
      onEvent: (e) => {
        if (e.type === "tool_call" && e.name === "probe_echo") tools = true;
      },
    });
  } catch {
    // A hard failure on the tool request means tools are not usable.
    tools = false;
  }

  return { ok: true, latencyMs, streaming: chunks > 1, tools };
}
