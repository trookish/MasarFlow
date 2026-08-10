import {
  DEFAULT_AGENT_CONFIG,
  type AgentConfig,
  type AgentExecuteTool,
  type AgentPhase,
  type AgentResult,
  type AgentRunOptions,
  type AgentToolKind,
  type ProviderTurnOptions,
} from "./types";
import { ToolRegistry } from "./registry";
import { createAgentLogger } from "./logger";
import { trimHistoryForContext } from "./history";

/**
 * The Agent Loop — MasarFlow's central controller.
 *
 *   User message → context → LLM → (tool call → execute → result → LLM)⁺ → text
 *
 * The model decides what to do at every step: the loop only executes what the
 * LLM requests through registered tools, feeds the results back, and keeps
 * streaming until the model answers — bounded by configurable safety limits.
 *
 * Everything the UI needs arrives through the `onEvent` lifecycle stream:
 * agent_started → thinking/tool_call/tool_result → message deltas →
 * message_complete → agent_completed | agent_error | agent_cancelled.
 */

/** Tools whose names indicate machine-touching behavior (used when the host
 *  doesn't supply explicit classifications). */
const KNOWN_TOOL_KINDS: Record<string, AgentToolKind> = {
  shell_run: { shell: true },
  fs_write: { modifiesFiles: true },
};

/** How many extra chances a silent round gets after tools have run. */
const MAX_EMPTY_NUDGES = 2;

export class AgentController {
  /** Current phase of the run (for UI/logging inspection). */
  private _phase: AgentPhase = "idle";

  get phase(): AgentPhase {
    return this._phase;
  }

  private setPhase(phase: AgentPhase): void {
    if (phase !== this._phase) {
      this._phase = phase;
    }
  }

  /**
   * Run one agent turn. Resolves with a terminal result — the loop NEVER
   * resolves empty: limit violations and provider failures return an explicit
   * error status with a user-facing message.
   */
  async run(opts: AgentRunOptions): Promise<AgentResult> {
    const log = createAgentLogger(opts.requestId, { threadId: opts.threadId });
    const startedAt = Date.now();
    const config: AgentConfig = { ...DEFAULT_AGENT_CONFIG, ...opts.config };
    const emit = opts.onEvent;
    const registry = new ToolRegistry(log);
    for (const def of opts.tools) {
      registry.register(
        def,
        opts.toolKinds?.[def.name] ?? KNOWN_TOOL_KINDS[def.name] ?? {},
      );
    }

    const messages: AgentResult["messages"] = [...opts.messages];
    const executed: AgentResult["executed"] = [];
    let fullText = "";
    let fullReasoning = "";
    let retriedEmpty = false;
    let strippedTools = false;
    let emptyNudges = 0;
    let iterations = 0;

    // Context-window guard: drop the oldest turns that don't fit the model's
    // window (system prompt + briefing + answer headroom). A thread that
    // grows past the window would otherwise 400 on every request — "works
    // fine until some chatting, then stops responding".
    const trimHistory = (): boolean => {
      const before = messages.length;
      const trimmed = trimHistoryForContext(messages, {
        contextLimit: opts.contextLimit,
        system: opts.system,
      });
      if (trimmed.dropped > 0) {
        messages.length = 0;
        messages.push(...trimmed.messages);
        log.agent("History trimmed for context window", {
          dropped: trimmed.dropped,
          kept: trimmed.messages.length,
        });
      }
      return before !== messages.length;
    };

    /** Normalized provider turn options (metadata for the payload). */
    const turnOpts = (
      iteration: number,
      tools: AgentRunOptions["tools"] | undefined,
    ): ProviderTurnOptions => ({
      provider: opts.providerMeta,
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      model: opts.model,
      system: opts.system,
      messages,
      tools,
      reasoning: iteration === 0 ? opts.reasoning : undefined,
      requestId: opts.requestId,
      signal: opts.signal,
    });

    const cancelled = (): AgentResult => {
      this.setPhase("cancelled");
      log.agent("Cancelled", { iterations, textLength: fullText.length });
      emit({ type: "agent_cancelled" });
      return {
        status: "cancelled",
        text: fullText,
        reasoning: fullReasoning,
        executed,
        messages,
        iterations,
      };
    };

    const fail = (message: string, recoverable = true): AgentResult => {
      this.setPhase("error");
      log.agent("Error", { error: message, iterations, recoverable });
      emit({ type: "agent_error", message, recoverable });
      return {
        status: "error",
        text: fullText,
        reasoning: fullReasoning,
        executed,
        messages,
        iterations,
        error: message,
      };
    };

    log.agent("Started", { provider: opts.providerMeta.id, model: opts.model });
    emit({ type: "agent_started", requestId: opts.requestId });

    try {
      if (trimHistory()) {
        emit({
          type: "notice",
          message:
            "Older messages were trimmed to fit this model's context window.",
        });
      }

      for (let iteration = 0; iteration < config.maxIterations; iteration++) {
        iterations = iteration + 1;
        if (opts.signal.aborted) return cancelled();
        if (Date.now() - startedAt > config.maxRunMs) {
          return fail(
            `The agent ran for over ${Math.round(config.maxRunMs / 60000)} minutes and was stopped at its time limit — Retry, or try a smaller task.`,
            false,
          );
        }

        this.setPhase("thinking");
        emit({ type: "round", round: iteration });
        log.agent("Iteration", {
          iteration: iteration + 1,
          tools:
            !strippedTools && Boolean(opts.executeTool)
              ? registry.definitions().length
              : 0,
        });

        // Only round 0 gets extended thinking: Anthropic requires thinking
        // blocks replayed verbatim and the wire history doesn't carry them,
        // so continuation rounds run without it. Tools stay available in
        // EVERY round — before, during, or after thinking/text.
        const useTools = !strippedTools && Boolean(opts.executeTool);
        trimHistory();
        let roundStarted = false;
        let reasoningStarted = false;
        const turn = await opts.provider.generate(
          turnOpts(iteration, useTools ? registry.definitions() : undefined),
          (e) => {
            if (opts.signal.aborted) return;
            if (e.type === "message_delta") {
              this.setPhase(
                iteration > 0 && fullText ? "streaming" : "thinking",
              );
              if (!roundStarted) {
                roundStarted = true;
                emit({ type: "message_started" });
                if (iteration > 0 && fullText) fullText += "\n\n";
              }
              fullText += e.delta;
              emit(e);
            } else if (e.type === "thinking") {
              if (!reasoningStarted) {
                reasoningStarted = true;
                if (iteration > 0 && fullReasoning) fullReasoning += "\n\n";
              }
              fullReasoning += e.text;
              emit(e);
            } else {
              emit(e);
            }
          },
        );
        log.agent("Turn completed", {
          iteration: iteration + 1,
          textLength: turn.text.length,
          toolCalls: turn.toolCalls.length,
          stopReason: turn.stopReason,
        });

        // A round that produced neither text nor tool calls. The model gets
        // bounded second chances in escalating nudges so a turn NEVER just
        // stops mid-work:
        //   stage A — first round spent entirely on thinking: retry without
        //             extended thinking, tools still available (tools come
        //             after thinking);
        //   stage B — no tools used yet: strip tools and coax a plain answer;
        //   stage C — tools WERE used but the model went silent: nudge it to
        //             answer — once with tools (it may want one more call),
        //             then without (the results are already in context, so a
        //             tool-less retry yields the final response).
        const producedNothing =
          !turn.text.trim() && turn.toolCalls.length === 0;
        if (producedNothing) {
          if (opts.reasoning?.enabled && iteration === 0 && !retriedEmpty) {
            retriedEmpty = true;
            log.agent("Empty turn — retrying without thinking");
            continue;
          }
          if (executed.length === 0 && !strippedTools) {
            retriedEmpty = true;
            strippedTools = true;
            log.agent("Empty turn — retrying without tools");
            continue;
          }
          if (emptyNudges < MAX_EMPTY_NUDGES) {
            emptyNudges += 1;
            if (emptyNudges > 1) strippedTools = true;
            log.agent("Silent round — nudging for an answer", {
              nudge: emptyNudges,
              tools: strippedTools ? "off" : "on",
            });
            continue;
          }
          log.agent("Silent round — nudges exhausted");
        }

        if (!turn.toolCalls.length || !useTools) {
          // Final answer: the model produced text (or ran out of moves).
          if (fullText) {
            this.setPhase("streaming");
            emit({ type: "message_complete" });
          }
          this.setPhase("completed");
          log.agent("Completed", { iterations, textLength: fullText.length });
          emit({ type: "agent_completed", iterations });
          return {
            status: "completed",
            text: fullText,
            reasoning: fullReasoning,
            executed,
            messages,
            iterations,
          };
        }

        // Tool calls: record the assistant turn, then execute each call.
        messages.push({
          role: "assistant",
          content: turn.text,
          toolCalls: turn.toolCalls,
        });

        const executeTool: AgentExecuteTool = opts.executeTool!;
        for (const call of turn.toolCalls) {
          if (opts.signal.aborted) return cancelled();

          const limit = registry.checkLimit(
            call.name,
            config.maxShellCommands,
            config.maxFileModifications,
          );
          if (limit) {
            // Safety limit hit: stop the agent cleanly and explain — the LLM
            // does not get to argue its way past a hard limit.
            log.agent("Safety limit reached", { tool: call.name, limit });
            return fail(limit, false);
          }

          this.setPhase("waiting_for_tool");
          const outcome = await registry.execute(call, {
            signal: opts.signal,
            run: (c, signal) => executeTool(c, signal),
            maxToolMs: config.maxToolMs,
          });
          if (opts.signal.aborted) return cancelled();
          this.setPhase("thinking");

          executed.push({ call, result: outcome.content });
          emit({
            type: "tool_result",
            id: call.id,
            name: call.name,
            ok: outcome.ok,
            content: outcome.content,
          });
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: outcome.content,
          });
        }
      }

      // The loop ran to its iteration cap without a final answer.
      return fail(
        `The agent stopped after ${config.maxIterations} rounds without reaching an answer — Retry, or break the task into smaller steps.`,
        false,
      );
    } catch (e) {
      if (opts.signal.aborted) return cancelled();
      return fail((e as Error).message);
    }
  }
}

/** Convenience: run a controller with a fresh instance. */
export async function runAgent(opts: AgentRunOptions): Promise<AgentResult> {
  return new AgentController().run(opts);
}
