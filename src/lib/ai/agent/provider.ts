import { streamTurn } from "@/lib/ai/chat-client";
import type {
  LLMProvider,
  ProviderStreamEvent,
  ProviderTurnOptions,
  ProviderTurnResult,
} from "./types";
import type { AgentLogger } from "./logger";

/**
 * The default LLMProvider: talks to MasarFlow's own /api/chat proxy, which
 * already normalizes OpenAI/Anthropic wire formats (and every
 * OpenAI-compatible gateway) into one NDJSON event stream with retries,
 * degradation, and watchdogs. This adapter maps that raw stream into the
 * provider-agnostic lifecycle events.
 *
 * The AgentController knows nothing about wire formats, tools payloads, or
 * provider quirks — it only ever sees LLMProvider.
 */

export class ProxyProvider implements LLMProvider {
  private readonly log: AgentLogger;

  constructor(log: AgentLogger) {
    this.log = log;
  }

  async generate(
    opts: ProviderTurnOptions,
    onEvent: (event: ProviderStreamEvent) => void,
  ): Promise<ProviderTurnResult> {
    const { provider, apiKey, baseUrl, model } = opts;
    this.log.llm("Request started", {
      provider: provider.id,
      model,
      messages: opts.messages.length,
      tools: opts.tools?.length ?? 0,
    });

    let sentFirstChunk = false;
    let sentFirstDelta = false;
    try {
      const result = await streamTurn({
        provider,
        apiKey,
        baseUrl: baseUrl?.trim() || undefined,
        model,
        system: opts.system,
        messages: opts.messages,
        tools: opts.tools,
        toolChoice: opts.toolChoice,
        reasoning: opts.reasoning,
        requestId: opts.requestId,
        signal: opts.signal,
        onEvent: (e) => {
          if (!sentFirstChunk) {
            sentFirstChunk = true;
            this.log.llm("Streaming started", { provider: provider.id, model });
          }
          switch (e.type) {
            case "text":
              if (!sentFirstDelta) {
                sentFirstDelta = true;
                this.log.llm("First text delta", {
                  provider: provider.id,
                  model,
                });
              }
              onEvent({ type: "message_delta", delta: e.text });
              break;
            case "reasoning":
              onEvent({ type: "thinking", text: e.text });
              break;
            case "tool_call":
              onEvent({
                type: "tool_call",
                id: e.id,
                name: e.name,
                arguments: e.arguments,
              });
              break;
            case "notice":
              onEvent({ type: "notice", message: e.message });
              break;
            case "round":
              onEvent({ type: "round", round: e.round });
              break;
            default:
              break;
          }
        },
      });

      this.log.llm("Response received", {
        provider: provider.id,
        model,
        textLength: result.text.length,
        toolCalls: result.toolCalls.length,
        stopReason: result.stopReason,
      });
      return result;
    } catch (e) {
      this.log.llm("Request failed", {
        provider: provider.id,
        model,
        error: (e as Error).message,
      });
      throw e;
    }
  }
}
